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

	constructor(
		public readonly connection: Connection,
		immediatelyStart = false,
	) {
		super();
		this.commands = new Set();
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
			this.startCommand(command);
		}
	}

	protected remove(command: Command<any>) {
		this.commands.delete(command);
		command.emit("cancel");
		this.emit("commandCanceled", command);
	}

	public run() {
		if (this.running) {
			return;
		}

		this.running = true;
		this.emit("start");
		for (const cmd of this.commands) {
			this.startCommand(cmd);
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

	private startCommand(command: Command<any>) {
		if (!this.running) {
			return;
		}

		this.emit("commandStart", command);
		const cmdRun = command.run(this.connection);
		cmdRun.finally(() => {
			this.emit("commandDone", command);
			this.commands.delete(command);
			if (this.commands.size === 0) {
				this.emit("idle");
			}
		});
	}
}

export default class CommandQueue extends TypedEmitter<CommandQueueEvents> {
	public queueContexts: AsyncQueueContext[];

	constructor(
		public readonly connection: Connection,
		private running: boolean = false,
	) {
		super();
		this.queueContexts = [];
	}

	protected get activeContext(): AsyncQueueContext | void {
		return this.queueContexts[0];
	}

	protected get waitingContext(): AsyncQueueContext | void {
		return this.queueContexts[this.queueContexts.length - 1];
	}

	add<T>(command: Command<T>) {
		if (
			!this.waitingContext ||
			(command.requiresOwnContext && this.waitingContext.size > 0)
		) {
			const q = this.addQueueContext();
		}

		// We just created it if it doesn't exist, so this is a safe add
		(this.waitingContext as AsyncQueueContext).add(command);

		if (command.requiresOwnContext) {
			// This command needs to be isolated
			this.addQueueContext();
		}
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

	private addQueueContext() {
		const q = new AsyncQueueContext(
			this.connection,
			// Auto-start if we're the first in the queue and
			// have an active connection
			this.running && this.queueContexts.length === 0,
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
		if (i > 0) {
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
