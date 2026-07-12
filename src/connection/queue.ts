import { TypedEmitter } from "tiny-typed-emitter";

import { Command } from "../commands";

import type Connection from "../connection";

type AsyncQueueEvents = {
	commandStart: (command: Command) => void;
	commandDone: (command: Command) => void;
	commandCanceled: (command: Command) => void;

	start: () => void;
	idle: () => void;
};

type CommandQueueEvents = {
	idle: () => void;
};

export class AsyncQueueContext extends TypedEmitter<AsyncQueueEvents> {
	public commands: Set<Command<any>>;
	public running: boolean;

	/**
	 * Commands that have been handed to `add()`/`run()` while the owning
	 * `CommandQueue` is held (§6.1 drain guarantee, I-1) sit here instead of
	 * being dispatched to `command.run()` — so no bytes reach the socket —
	 * until `flushPending()` runs them on release.
	 */
	private pending: Set<Command<any>>;

	constructor(
		public readonly connection: Connection,
		immediatelyStart = false,
		public readonly isIsolated: boolean = false,
		private readonly isHeld: () => boolean = () => false,
	) {
		super();
		this.commands = new Set();
		this.pending = new Set();
		this.running = immediatelyStart;
	}

	public get isComplete() {
		return this.commands.size === 0 && this.running === true;
	}

	public get size() {
		return this.commands.size;
	}

	public add(command: Command<any>) {
		this.commands.add(command);

		if (this.running) {
			this.dispatch(command);
		}
	}

	protected remove(command: Command<any>) {
		this.commands.delete(command);
		this.pending.delete(command);
		command.emit("cancel");
		this.emit("commandCanceled", command);
	}

	public run() {
		if (this.running) {
			return;
		}

		this.running = true;
		this.emit("start");
		if (this.commands.size) {
			for (const cmd of this.commands) {
				this.dispatch(cmd);
			}
		} else {
			this.emit("idle");
		}
	}

	public stop() {
		if (!this.running) {
			return;
		}

		this.running = false;
		for (const cmd of this.commands) {
			this.remove(cmd);
		}
	}

	/**
	 * Starts every command withheld while the queue was held. A no-op (left
	 * for the next release) if still held — nested hold()/release() pairs
	 * must not let an inner release flush an outer hold.
	 */
	public flushPending() {
		if (this.isHeld() || this.pending.size === 0) {
			return;
		}

		const toStart = [...this.pending];
		this.pending.clear();
		for (const cmd of toStart) {
			this.startCommand(cmd);
		}
	}

	private dispatch(command: Command<any>) {
		if (this.isHeld()) {
			this.pending.add(command);
			return;
		}

		this.startCommand(command);
	}

	private startCommand(command: Command<any>) {
		if (!this.running) {
			return;
		}

		this.emit("commandStart", command);
		const cmdRun = command.run(this.connection);
		cmdRun.finally(() => {
			this.emit("commandDone", command);
			this.commands.delete(command);
			this.pending.delete(command);
			if (this.commands.size === 0) {
				this.emit("idle");
			}
		});
	}
}

export default class CommandQueue extends TypedEmitter<CommandQueueEvents> {
	public queueContexts: AsyncQueueContext[];
	private held: boolean;

	constructor(
		public readonly connection: Connection,
		private running: boolean = false,
	) {
		super();
		this.queueContexts = [];
		this.held = false;
	}

	protected get activeContext(): AsyncQueueContext | void {
		return this.queueContexts[0];
	}

	protected get waitingContext(): AsyncQueueContext | void {
		return this.queueContexts[this.queueContexts.length - 1];
	}

	/** Whether the queue is currently held (see `hold()`). */
	public get isHeld(): boolean {
		return this.held;
	}

	add<T>(command: Command<T>) {
		if (
			!this.waitingContext ||
			this.waitingContext.isIsolated ||
			(command.requiresOwnContext && this.waitingContext.size > 0)
		) {
			this.addQueueContext(command.requiresOwnContext);
		}

		// We just created it if it doesn't exist, so this is a safe add
		(this.waitingContext as AsyncQueueContext).add(command);
	}

	cancelAllRunningCommands() {
		if (this.activeContext) {
			this.activeContext.stop();
		}
	}

	start() {
		this.running = true;
		if (this.activeContext) {
			this.activeContext.run();
		}
	}

	stop() {
		this.running = false;
		this.cancelAllRunningCommands();
	}

	/**
	 * §6.1 drain guarantee / I-1: while held, no command anywhere in the
	 * queue may write its bytes to the socket, no matter which context is
	 * active when the hold is lifted — contexts consult `isHeld()` at
	 * dispatch time, not just at creation time, so a context promoted to
	 * active *during* a hold still withholds its writes. Used by the
	 * STARTTLS upgrade to guarantee nothing is written between the STARTTLS
	 * tagged OK and TLS handshake completion.
	 */
	hold(): void {
		this.held = true;
	}

	/**
	 * Releases a prior `hold()` and immediately dispatches anything queued
	 * up in the meantime. A no-op if not currently held.
	 */
	release(): void {
		if (!this.held) {
			return;
		}

		this.held = false;
		this.activeContext?.flushPending();
	}

	private addQueueContext(isIsolated = false) {
		const q = new AsyncQueueContext(
			this.connection,
			// Auto-start if we're the first in the queue and
			// have an active connection
			this.running && this.queueContexts.length === 0,
			isIsolated,
			() => this.held,
		);
		// remove it once the queue is idle
		q.once("idle", () => this.removeQueueContext(q));
		this.queueContexts.push(q);
		return q;
	}

	private removeQueueContext(
		fromContext: AsyncQueueContext | void = undefined,
	) {
		const currActive = this.activeContext;
		fromContext = fromContext || currActive;

		if (!fromContext) {
			return;
		}

		const i = this.queueContexts.findIndex(
			(check) => check === fromContext,
		);
		// Remove the context wherever it sits — including index 0. Leaving a
		// completed active context in place would pin the queue: the next
		// context could never become active, so its commands would never run.
		if (i > -1) {
			this.queueContexts.splice(i, 1);
		}

		// We removed the previously running active context, start
		// the next one or mark ourselves as idle
		if (currActive === fromContext && this.running) {
			if (this.activeContext) {
				this.activeContext.run();
			} else {
				this.emit("idle");
			}
		}
	}
}
