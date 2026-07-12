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
});
