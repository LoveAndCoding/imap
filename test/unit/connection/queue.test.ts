import { vi } from "vitest";

import { ConnectionError } from "../../../src/errors";

// `AsyncQueueContext`/`CommandQueue` now do real wire I/O (tag assignment,
// `CommandWriter` serialization, router attribution) via
// `connection/execute-command.ts`'s `executeCommand()` for every dispatched
// command. That module is exercised end-to-end elsewhere (the command
// lifecycle / literal-gate tests); here we mock it so these tests can stay
// focused on what they always tested — SCHEDULING (context grouping,
// pipeline/serial/isolated grouping, hold/release, cancellation) — without
// needing a real socket/router/parser underneath every fake command.
vi.mock("../../../src/connection/execute-command", () => ({
	executeCommand: vi.fn(),
}));

import { executeCommand } from "../../../src/connection/execute-command";
import CommandQueue, { AsyncQueueContext } from "../../../src/connection/queue";

const mockExecuteCommand = executeCommand as unknown as ReturnType<typeof vi.fn>;

/** A fake `Command<any>` — the queue only ever reads `.queueMode` off it
 *  directly; everything else is handled by the (mocked) `executeCommand`. */
function fakeCommand(queueMode: "pipeline" | "serial" | "isolated" = "pipeline"): any {
	return { queueMode, verb: "FAKE" };
}

const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve));

describe("AsyncQueueContext", () => {
	beforeEach(() => {
		mockExecuteCommand.mockReset();
		mockExecuteCommand.mockImplementation(() => new Promise(() => undefined));
	});

	describe(".constructor", () => {
		test("Sets initial state", () => {
			const connMock: any = vi.fn();
			const ctx = new AsyncQueueContext(connMock, true, true);

			expect(ctx.connection).toEqual(connMock);
			expect(ctx.isIsolated).toEqual(true);
			expect(ctx.running).toEqual(true);
			expect(ctx.commands).toBeInstanceOf(Set);
			expect(ctx.commands.size).toBe(0);
		});
	});

	describe(".add", () => {
		test("Adds a new command to the queue", () => {
			const connMock: any = vi.fn();
			const ctx = new AsyncQueueContext(connMock);

			ctx.add(fakeCommand());

			expect(ctx.commands).toBeInstanceOf(Set);
			expect(ctx.commands.size).toBe(1);
		});

		test("Adds a new command to the queue and starts it (executeCommand called) if running", () => {
			const connMock: any = vi.fn();
			const ctx = new AsyncQueueContext(connMock, true);
			mockExecuteCommand.mockResolvedValue(null);

			ctx.add(fakeCommand());

			expect(mockExecuteCommand).toBeCalled();
		});
	});

	describe(".run", () => {
		test("Triggers idle event if no commands to run", () => {
			const connMock: any = vi.fn();
			const ctx = new AsyncQueueContext(connMock);
			let startTriggered = false;
			let idleTriggered = false;
			ctx.once("start", () => (startTriggered = true));
			ctx.once("idle", () => (idleTriggered = true));

			ctx.run();

			expect(startTriggered).toBe(true);
			expect(idleTriggered).toBe(true);
		});

		test("Starts commands (calls executeCommand) if there are commands to run", () => {
			const connMock: any = vi.fn();
			const ctx = new AsyncQueueContext(connMock);
			mockExecuteCommand.mockResolvedValue(null);
			ctx.add(fakeCommand());

			ctx.run();

			expect(mockExecuteCommand).toBeCalled();
		});
	});
});

describe("CommandQueue", () => {
	beforeEach(() => {
		mockExecuteCommand.mockReset();
		mockExecuteCommand.mockImplementation(() => new Promise(() => undefined));
	});

	describe(".constructor", () => {
		test("Sets initial state", () => {
			const connMock: any = vi.fn();
			const q = new CommandQueue(connMock);

			expect(q.connection).toEqual(connMock);
			expect(q.queueContexts).toHaveLength(0);
		});
	});

	describe(".add", () => {
		test("Creates new queue context when queue is empty", () => {
			const connMock: any = vi.fn();
			const q = new CommandQueue(connMock);
			const cmd = fakeCommand();

			q.add(cmd);

			expect(q.connection).toEqual(connMock);
			expect(q.queueContexts).toHaveLength(1);
			expect(q.queueContexts[0].commands.size).toBe(1);
		});

		test("Creates new queue context when existing context is isolated", () => {
			const connMock: any = vi.fn();
			const q = new CommandQueue(connMock);
			const ctxMock: any = { isIsolated: true };
			q.queueContexts.push(ctxMock);

			q.add(fakeCommand());

			expect(q.connection).toEqual(connMock);
			expect(q.queueContexts).toHaveLength(2);
			expect(q.queueContexts[1].isIsolated).toBe(false);
			expect(q.queueContexts[1].commands.size).toBe(1);
		});

		test("Creates a new (own) queue context for a serial command when the current context already has commands", () => {
			const connMock: any = vi.fn();
			const q = new CommandQueue(connMock);
			const ctxMock: any = { isIsolated: false, size: 1 };
			q.queueContexts.push(ctxMock);

			q.add(fakeCommand("serial"));

			expect(q.queueContexts).toHaveLength(2);
			expect(q.queueContexts[1].isIsolated).toBe(true);
			expect(q.queueContexts[1].commands.size).toBe(1);
		});

		test("Creates a new (own) queue context for an isolated command when the current context already has commands", () => {
			const connMock: any = vi.fn();
			const q = new CommandQueue(connMock);
			const ctxMock: any = { isIsolated: false, size: 1 };
			q.queueContexts.push(ctxMock);

			q.add(fakeCommand("isolated"));

			expect(q.queueContexts).toHaveLength(2);
			expect(q.queueContexts[1].isIsolated).toBe(true);
		});

		test("pipeline commands share the current (non-isolated, non-empty) context", () => {
			const connMock: any = vi.fn();
			const q = new CommandQueue(connMock);
			const ctxMock: any = { isIsolated: false, size: 1, add: vi.fn() };
			q.queueContexts.push(ctxMock);

			q.add(fakeCommand("pipeline"));

			// No new context — the pipeline command was added to the existing one.
			expect(q.queueContexts).toHaveLength(1);
			expect(ctxMock.add).toHaveBeenCalledTimes(1);
		});
	});

	describe("context lifecycle", () => {
		test("Runs a command queued after an isolated command once the isolated context completes", async () => {
			const connMock: any = vi.fn();
			const q = new CommandQueue(connMock);
			let resolveIsolated!: () => void;
			mockExecuteCommand
				.mockImplementationOnce(() => new Promise<void>((resolve) => (resolveIsolated = resolve)))
				.mockImplementationOnce(() => Promise.resolve());

			q.start();
			q.add(fakeCommand("isolated"));
			q.add(fakeCommand("pipeline"));
			await flushMicrotasks();

			// The follow-up pipeline command's own context hasn't started yet —
			// only one call to executeCommand so far (the isolated one).
			expect(mockExecuteCommand).toHaveBeenCalledTimes(1);

			resolveIsolated();
			await flushMicrotasks();

			// The isolated context completed, was removed, and the next context
			// became active and ran its command.
			expect(mockExecuteCommand).toHaveBeenCalledTimes(2);
		});

		test("Emits idle and empties contexts once all commands complete", async () => {
			const connMock: any = vi.fn();
			const q = new CommandQueue(connMock);
			mockExecuteCommand.mockResolvedValue(null);
			let idleTriggered = false;
			q.once("idle", () => (idleTriggered = true));

			q.start();
			q.add(fakeCommand());
			await flushMicrotasks();

			expect(mockExecuteCommand).toBeCalled();
			expect(idleTriggered).toBe(true);
			expect(q.queueContexts).toHaveLength(0);
		});

		test("pipeline commands sharing a context are concurrently in flight", async () => {
			const connMock: any = vi.fn();
			const q = new CommandQueue(connMock);
			mockExecuteCommand.mockImplementation(() => new Promise(() => undefined));

			q.start();
			q.add(fakeCommand("pipeline"));
			q.add(fakeCommand("pipeline"));

			// Both were dispatched immediately — pipeline mode allows concurrent
			// in-flight commands sharing one context, no waiting for the first.
			expect(mockExecuteCommand).toHaveBeenCalledTimes(2);
			expect(q.queueContexts).toHaveLength(1);
		});

		test("serial exclusivity: a serial command doesn't run concurrently with a pipeline command ahead of it, and a follow-up pipeline command waits for the serial one to drain", async () => {
			const connMock: any = vi.fn();
			const q = new CommandQueue(connMock);
			let resolveA!: () => void;
			let resolveB!: () => void;
			mockExecuteCommand
				.mockImplementationOnce(() => new Promise<void>((resolve) => (resolveA = resolve))) // A (pipeline)
				.mockImplementationOnce(() => new Promise<void>((resolve) => (resolveB = resolve))) // B (serial)
				.mockImplementationOnce(() => Promise.resolve()); // C (pipeline)

			q.start();
			q.add(fakeCommand("pipeline")); // A — context #1
			q.add(fakeCommand("serial")); // B — forced into its own context (#1 is non-empty)
			q.add(fakeCommand("pipeline")); // C — the context ahead of it (B's) is isolated, so C also gets its own
			await flushMicrotasks();

			// Only A has actually been dispatched — B/C's contexts haven't been
			// promoted to active yet (context #1 hasn't drained).
			expect(mockExecuteCommand).toHaveBeenCalledTimes(1);

			resolveA();
			await flushMicrotasks();

			// B now runs alone; C still waits.
			expect(mockExecuteCommand).toHaveBeenCalledTimes(2);

			resolveB();
			await flushMicrotasks();

			// C finally runs, only once B has fully drained.
			expect(mockExecuteCommand).toHaveBeenCalledTimes(3);
		});
	});

	// §6.1 drain guarantee / I-1: the STARTTLS upgrade holds the queue right
	// after sending its own command so that nothing else can write bytes
	// between the tagged OK and the completion of the TLS handshake.
	describe("hold/release (I-1: no bytes between STARTTLS OK and handshake completion)", () => {
		test("a command added while held is not dispatched until release()", () => {
			const connMock: any = vi.fn();
			const q = new CommandQueue(connMock);
			q.start();
			mockExecuteCommand.mockResolvedValue(null);

			q.hold();
			q.add(fakeCommand());

			expect(mockExecuteCommand).not.toBeCalled();

			q.release();

			expect(mockExecuteCommand).toBeCalled();
		});

		test("a command already dispatched before hold() keeps running (only later writes are blocked)", () => {
			const connMock: any = vi.fn();
			const q = new CommandQueue(connMock);
			q.start();
			mockExecuteCommand.mockImplementation(() => new Promise(() => undefined));

			q.add(fakeCommand("isolated")); // dispatched immediately — not held yet
			q.hold();

			expect(mockExecuteCommand).toHaveBeenCalledTimes(1);
		});

		test("release() is a no-op when not currently held", () => {
			const connMock: any = vi.fn();
			const q = new CommandQueue(connMock);
			q.start();
			mockExecuteCommand.mockResolvedValue(null);

			q.release(); // never held — must not throw or misbehave
			q.add(fakeCommand());

			expect(mockExecuteCommand).toBeCalled();
		});

		test("a context promoted to active while still held withholds its writes too", async () => {
			const connMock: any = vi.fn();
			const q = new CommandQueue(connMock);
			q.start();

			let resolveFirst: () => void = () => undefined;
			mockExecuteCommand
				.mockImplementationOnce(() => new Promise<void>((resolve) => (resolveFirst = resolve)))
				.mockImplementationOnce(() => Promise.resolve());

			q.add(fakeCommand("isolated"));
			q.add(fakeCommand("isolated"));
			q.hold();

			resolveFirst();
			await flushMicrotasks();

			// The second command must still be withheld — only one call so far.
			expect(mockExecuteCommand).toHaveBeenCalledTimes(1);

			q.release();
			await flushMicrotasks();

			expect(mockExecuteCommand).toHaveBeenCalledTimes(2);
		});

		test("stop() resets held even when release() was never called", () => {
			const connMock: any = vi.fn();
			const q = new CommandQueue(connMock);
			q.start();

			q.hold();
			expect(q.isHeld).toBe(true);
			q.stop();

			expect(q.isHeld).toBe(false);

			q.start();
			mockExecuteCommand.mockResolvedValue(null);
			q.hold();
			q.add(fakeCommand());
			expect(mockExecuteCommand).not.toBeCalled();
			q.release();
			expect(mockExecuteCommand).toBeCalled();
		});
	});

	describe("cancellation (spec §6.3: typed ConnectionError, never a bare string)", () => {
		test("stop() rejects a pending (held, not-yet-dispatched) command with ConnectionError(phase: 'steady')", async () => {
			const connMock: any = vi.fn();
			const q = new CommandQueue(connMock);
			q.start();
			q.hold(); // e.g. mid-STARTTLS hold window
			const promise = q.add(fakeCommand());

			q.stop("simulated close");

			await expect(promise).rejects.toBeInstanceOf(ConnectionError);
			await expect(promise).rejects.toMatchObject({ phase: "steady" });
			expect(mockExecuteCommand).not.toBeCalled();
		});

		test("stop() rejects an in-flight (already-dispatched) command the same way", async () => {
			const connMock: any = vi.fn();
			const q = new CommandQueue(connMock);
			q.start();
			mockExecuteCommand.mockImplementation(() => new Promise(() => undefined));

			const promise = q.add(fakeCommand());
			expect(mockExecuteCommand).toBeCalled();

			q.stop();

			await expect(promise).rejects.toBeInstanceOf(ConnectionError);
			await expect(promise).rejects.toMatchObject({ phase: "steady" });
		});
	});
});
