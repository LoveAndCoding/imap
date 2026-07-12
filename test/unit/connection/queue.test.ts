import CommandQueue, { AsyncQueueContext } from "../../../src/connection/queue";
import { vi } from "vitest";

describe("AsyncQueueContext", () => {
	describe(".constructor", () => {
		test("Sets initial state", () => {
			// Arrange
			const connMock: any = vi.fn();

			// Act
			const ctx = new AsyncQueueContext(connMock, true, true);

			// Assert
			expect(ctx.connection).toEqual(connMock);
			expect(ctx.isIsolated).toEqual(true);
			expect(ctx.running).toEqual(true);
			expect(ctx.commands).toBeInstanceOf(Set);
			expect(ctx.commands.size).toBe(0);
		});
	});

	describe(".add", () => {
		test("Adds a new command to the queue", () => {
			// Arrange
			const connMock: any = vi.fn();
			const ctx = new AsyncQueueContext(connMock);
			const cmdMock: any = vi.fn();

			// Act
			ctx.add(cmdMock);

			// Assert
			expect(ctx.commands).toBeInstanceOf(Set);
			expect(ctx.commands.size).toBe(1);
			expect(ctx.commands.values().next().value).toBe(cmdMock);
		});

		test("Adds a new command to the queue and starts it if running", () => {
			// Arrange
			const connMock: any = vi.fn();
			const ctx = new AsyncQueueContext(connMock, true);
			const cmdMock: any = { run: vi.fn() };
			cmdMock.run.mockImplementation(() => Promise.resolve());

			// Act
			ctx.add(cmdMock);

			// Assert
			expect(cmdMock.run).toBeCalled();
		});
	});

	describe(".run", () => {
		test("Triggers idle event if no commands to run", () => {
			// Arrange
			const connMock: any = vi.fn();
			const ctx = new AsyncQueueContext(connMock);
			let startTriggered = false;
			let idleTriggered = false;
			ctx.once("start", () => (startTriggered = true));
			ctx.once("idle", () => (idleTriggered = true));

			// Act
			ctx.run();

			// Assert
			expect(startTriggered).toBe(true);
			expect(idleTriggered).toBe(true);
		});

		test("Starts commands if there are commands to run", () => {
			// Arrange
			const connMock: any = vi.fn();
			const ctx = new AsyncQueueContext(connMock);
			const cmdMock: any = { run: vi.fn() };
			cmdMock.run.mockImplementation(() => Promise.resolve());
			ctx.commands.add(cmdMock);

			// Act
			ctx.run();

			// Assert
			expect(cmdMock.run).toBeCalled();
		});
	});
});

describe("CommandQueue", () => {
	describe(".constructor", () => {
		test("Sets initial state", () => {
			// Arrange
			const connMock: any = vi.fn();

			// Act
			const q = new CommandQueue(connMock);

			// Assert
			expect(q.connection).toEqual(connMock);
			expect(q.queueContexts).toHaveLength(0);
		});
	});

	describe(".add", () => {
		test("Creates new queue context when queue is empty", () => {
			// Arrange
			const connMock: any = vi.fn();
			const q = new CommandQueue(connMock);
			const cmdMock: any = { run: vi.fn() };

			// Act
			q.add(cmdMock);

			// Assert
			expect(q.connection).toEqual(connMock);
			expect(q.queueContexts).toHaveLength(1);
			expect(q.queueContexts[0].commands.size).toBe(1);
			expect(q.queueContexts[0].commands.values().next().value).toEqual(
				cmdMock,
			);
		});

		test("Creates new queue context when existing context requires isolation", () => {
			// Arrange
			const connMock: any = vi.fn();
			const q = new CommandQueue(connMock);
			const ctxMock: any = { isIsolated: true };
			q.queueContexts.push(ctxMock);
			const cmdMock: any = { run: vi.fn() };

			// Act
			q.add(cmdMock);

			// Assert
			expect(q.connection).toEqual(connMock);
			expect(q.queueContexts).toHaveLength(2);
			expect(q.queueContexts[1].isIsolated).toBe(false);
			expect(q.queueContexts[1].commands.size).toBe(1);
			expect(q.queueContexts[1].commands.values().next().value).toEqual(
				cmdMock,
			);
		});

		test("Creates new queue context when command requires isolation", () => {
			// Arrange
			const connMock: any = vi.fn();
			const q = new CommandQueue(connMock);
			const ctxMock: any = { isIsolated: false, size: 1 };
			q.queueContexts.push(ctxMock);
			const cmdMock: any = { run: vi.fn(), requiresOwnContext: true };

			// Act
			q.add(cmdMock);

			// Assert
			expect(q.connection).toEqual(connMock);
			expect(q.queueContexts).toHaveLength(2);
			expect(q.queueContexts[1].isIsolated).toBe(true);
			expect(q.queueContexts[1].commands.size).toBe(1);
			expect(q.queueContexts[1].commands.values().next().value).toEqual(
				cmdMock,
			);
		});
	});

	describe("context lifecycle", () => {
		const flushMicrotasks = () =>
			new Promise((resolve) => setImmediate(resolve));

		test("Runs a command queued after an isolated command once the isolated context completes", async () => {
			// Arrange
			const connMock: any = vi.fn();
			const q = new CommandQueue(connMock);
			const isolatedCmd: any = {
				run: vi.fn(() => Promise.resolve()),
				requiresOwnContext: true,
				emit: vi.fn(),
			};
			const followupCmd: any = {
				run: vi.fn(() => Promise.resolve()),
				emit: vi.fn(),
			};

			// Act
			q.start();
			q.add(isolatedCmd);
			q.add(followupCmd);
			await flushMicrotasks();

			// Assert: the isolated context completed, was removed, and the
			// next context became active and ran its command. Before the
			// removeQueueContext fix the completed isolated context pinned
			// the queue and followupCmd.run was never called.
			expect(isolatedCmd.run).toBeCalled();
			expect(followupCmd.run).toBeCalled();
		});

		test("Emits idle and empties contexts once all commands complete", async () => {
			// Arrange
			const connMock: any = vi.fn();
			const q = new CommandQueue(connMock);
			const cmdMock: any = {
				run: vi.fn(() => Promise.resolve()),
				emit: vi.fn(),
			};
			let idleTriggered = false;
			q.once("idle", () => (idleTriggered = true));

			// Act
			q.start();
			q.add(cmdMock);
			await flushMicrotasks();

			// Assert
			expect(cmdMock.run).toBeCalled();
			expect(idleTriggered).toBe(true);
			expect(q.queueContexts).toHaveLength(0);
		});
	});

	// §6.1 drain guarantee / I-1: the STARTTLS upgrade holds the queue right
	// after sending its own command so that nothing else can write bytes
	// between the tagged OK and the completion of the TLS handshake.
	describe("hold/release (I-1: no bytes between STARTTLS OK and handshake completion)", () => {
		const flushMicrotasks = () =>
			new Promise((resolve) => setImmediate(resolve));

		test("a command added while held is not dispatched until release()", () => {
			// Arrange
			const connMock: any = vi.fn();
			const q = new CommandQueue(connMock);
			q.start();
			const cmdMock: any = { run: vi.fn(() => Promise.resolve()), emit: vi.fn() };

			// Act: simulate the window between the STARTTLS tagged OK and the
			// handshake completing — nothing may be written while held.
			q.hold();
			q.add(cmdMock);

			// Assert: held, so no bytes for this command have been written yet.
			expect(cmdMock.run).not.toBeCalled();

			// Act: handshake completes, the hold is lifted.
			q.release();

			// Assert: only now does the withheld command actually write.
			expect(cmdMock.run).toBeCalled();
		});

		test("a command already dispatched before hold() keeps running (only later writes are blocked)", () => {
			// Arrange — mirrors the real STARTTLS sequence: `runCommand(tlsCmd)`
			// synchronously writes the STARTTLS bytes, THEN the queue is held.
			const connMock: any = vi.fn();
			const q = new CommandQueue(connMock);
			q.start();
			const startTlsCmd: any = {
				run: vi.fn(() => Promise.resolve()),
				emit: vi.fn(),
				requiresOwnContext: true,
			};

			// Act
			q.add(startTlsCmd); // dispatched immediately — not held yet
			q.hold();

			// Assert: STARTTLS's own bytes were written before the hold began.
			expect(startTlsCmd.run).toBeCalledTimes(1);
		});

		test("release() is a no-op when not currently held", () => {
			// Arrange
			const connMock: any = vi.fn();
			const q = new CommandQueue(connMock);
			q.start();
			const cmdMock: any = { run: vi.fn(() => Promise.resolve()), emit: vi.fn() };

			// Act
			q.release(); // never held — must not throw or misbehave
			q.add(cmdMock);

			// Assert: ordinary (unheld) dispatch still happens immediately.
			expect(cmdMock.run).toBeCalled();
		});

		test("a context promoted to active while still held withholds its writes too", async () => {
			// Arrange: an isolated (STARTTLS-shaped) command occupies the active
			// context; a second command is queued behind it in its own context.
			// While the first command is in flight, hold() is engaged (as the
			// real upgrade does) and the first command then resolves — promoting
			// the second context to active. Its command must NOT be dispatched
			// while still held, even though context promotion happens mid-hold.
			const connMock: any = vi.fn();
			const q = new CommandQueue(connMock);
			q.start();

			let resolveFirst: () => void = () => undefined;
			const firstCmd: any = {
				run: vi.fn(
					() => new Promise<void>((resolve) => (resolveFirst = resolve)),
				),
				emit: vi.fn(),
				requiresOwnContext: true,
			};
			const secondCmd: any = {
				run: vi.fn(() => Promise.resolve()),
				emit: vi.fn(),
				requiresOwnContext: true,
			};

			q.add(firstCmd);
			q.add(secondCmd);
			q.hold();

			// Act: the first (isolated) command completes while still held,
			// which promotes the second context to active.
			resolveFirst();
			await flushMicrotasks();

			// Assert: the second command must still be withheld.
			expect(secondCmd.run).not.toBeCalled();

			// Act
			q.release();
			await flushMicrotasks();

			// Assert
			expect(secondCmd.run).toBeCalled();
		});
	});
});
