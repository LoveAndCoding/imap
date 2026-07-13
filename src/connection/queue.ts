import { TypedEmitter } from "tiny-typed-emitter";

import { Command } from "../commands/base";
import { ConnectionError } from "../errors";

import type Connection from "../connection";
import { executeCommand } from "./execute-command";

type AsyncQueueEvents = {
	commandStart: (command: Command<unknown>) => void;
	commandDone: (command: Command<unknown>) => void;
	commandCanceled: (command: Command<unknown>) => void;

	start: () => void;
	idle: () => void;
};

type CommandQueueEvents = {
	idle: () => void;
	/**
	 * M4.1 (spec §3.7, Shared design note 4): fired synchronously from
	 * `add()` whenever a newly submitted command is forced into a BRAND NEW
	 * context because the current WAITING context is already isolated —
	 * i.e. something wants to run but is structurally blocked behind an
	 * isolated command (STARTTLS/AUTHENTICATE/IDLE/COMPRESS/LOGOUT) that has
	 * no protocol-driven end of its own until something tells it to finish.
	 * This is the ONLY generic queue-level signal for "a caller is waiting
	 * behind you" — chosen (over routing every command submission through
	 * `IdleController` itself, Shared design note 4's other option) because
	 * the queue already has the structural knowledge this needs (which
	 * context is active, exactly when something new lands behind it);
	 * duplicating that inside `IdleController` would mean either wrapping
	 * every call site capable of submitting a command (invasive, easy to
	 * miss one) or polling. `IdleController` (`src/client/idle-controller.ts`)
	 * is this event's sole consumer today: on this signal it resolves the
	 * in-flight IDLE round's `onContinuation` promise, sending `DONE` (once
	 * the server's own `+ idling` continuation has actually arrived) so the
	 * newly queued context is freed to run once IDLE's tagged OK completes
	 * and the isolated context drains — the queue's own structural ordering
	 * (a context queued behind an isolated one never dispatches early)
	 * already guarantees no bytes leak out of order; this event only
	 * supplies the LIVENESS half (something must still decide to end the
	 * isolated command) that guarantee doesn't provide by itself.
	 */
	contextQueuedBehindIsolated: () => void;
};

// Tag generator (moved from the old commands/base.ts — spec §7.1: the tag is
// now assigned by the QUEUE at write time, not by the Command constructor,
// so command instances are reusable/testable values until submitted). One
// generator instance is owned per `CommandQueue` (i.e. per connection).
const MAX_TAG_ALPHA_LENGTH = 400;

export function* commandIdGenerator(): Generator<string, never> {
	const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
	let alphaCount = 0;
	do {
		let lead = "";
		let toAddCount = alphaCount;
		while (toAddCount >= 0) {
			lead += alpha[toAddCount % alpha.length];
			toAddCount -= alpha.length;
		}

		for (let num = 1; num < Number.MAX_SAFE_INTEGER; num++) {
			yield `${lead}${num.toString().padStart(5, "0")}`;
		}

		if (alphaCount >= MAX_TAG_ALPHA_LENGTH * 26) {
			// We've sent more commands than is reasonable already, but start
			// over just in case. Are we approaching heat-death of the
			// universe yet?
			alphaCount = 0;
		}
	} while (++alphaCount < Number.MAX_SAFE_INTEGER);
	throw new Error("How did you even get here?!?!");
}

/** One command handed to `.add()`, paired with the promise executor
 *  functions the original caller (`Connection.runCommand`) is awaiting. */
interface QueuedCommand {
	readonly command: Command<unknown>;
	readonly resolve: (value: unknown) => void;
	readonly reject: (reason: unknown) => void;
}

export class AsyncQueueContext extends TypedEmitter<AsyncQueueEvents> {
	public commands: Set<QueuedCommand>;
	public running: boolean;

	/**
	 * Commands that have been handed to `add()` while the owning
	 * `CommandQueue` is held (§6.1 drain guarantee, I-1) sit here instead of
	 * being dispatched — so no bytes reach the socket — until
	 * `flushPending()` runs them on release.
	 */
	private pending: Set<QueuedCommand>;

	constructor(
		public readonly connection: Connection,
		immediatelyStart = false,
		public readonly isIsolated: boolean = false,
		private readonly isHeld: () => boolean = () => false,
		private readonly nextTag: () => string = (() => {
			const gen = commandIdGenerator();
			return () => gen.next().value;
		})(),
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

	/** Submits `command`, returning the promise its execution will settle. */
	public add<T>(command: Command<T>): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			const qc: QueuedCommand = {
				command,
				resolve: resolve as (value: unknown) => void,
				reject,
			};
			this.commands.add(qc);
			if (this.running) {
				this.dispatch(qc);
			}
		});
	}

	protected remove(qc: QueuedCommand, cause?: unknown) {
		this.commands.delete(qc);
		this.pending.delete(qc);
		// spec §6.3: typed rejection, never the old bare string. Commands
		// already written cannot be un-sent (protocol fact) — in practice
		// `stop()` is only ever called from connection teardown, at which
		// point there is no live socket left for an already-dispatched
		// command's tagged response to arrive on anyway, so rejecting it
		// here is the only way its promise ever settles.
		qc.reject(
			new ConnectionError("Connection closed while a command was pending", {
				phase: "steady",
				cause,
			}),
		);
		this.emit("commandCanceled", qc.command);
	}

	public run() {
		if (this.running) {
			return;
		}

		this.running = true;
		this.emit("start");
		if (this.commands.size) {
			for (const qc of this.commands) {
				this.dispatch(qc);
			}
		} else {
			this.emit("idle");
		}
	}

	public stop(cause?: unknown) {
		// ST4 fix (M4-phase-boundary review): no early `!this.running` return
		// -- a queue context queued behind an isolated one (see `CommandQueue.
		// add()`'s own doc comment) is constructed with `immediatelyStart:
		// false` and never promoted, so `running` stays `false` on it for its
		// entire life until `CommandQueue`'s own removeQueueContext() promotes
		// it. `CommandQueue.stop()` below now calls THIS method on every one
		// of its contexts, including ones exactly in that state -- the guard
		// would otherwise silently skip rejecting their queued commands.
		this.running = false;
		for (const qc of this.commands) {
			this.remove(qc, cause);
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
		for (const qc of toStart) {
			this.startCommand(qc);
		}
	}

	private dispatch(qc: QueuedCommand) {
		if (this.isHeld()) {
			this.pending.add(qc);
			return;
		}

		this.startCommand(qc);
	}

	private startCommand(qc: QueuedCommand) {
		if (!this.running) {
			return;
		}

		this.emit("commandStart", qc.command);
		const tag = this.nextTag();
		const run = executeCommand(this.connection, qc.command, tag);
		run.then(qc.resolve, qc.reject);
		run.catch(() => undefined).finally(() => {
			this.emit("commandDone", qc.command);
			this.commands.delete(qc);
			this.pending.delete(qc);
			if (this.commands.size === 0) {
				this.emit("idle");
			}
		});
	}
}

export default class CommandQueue extends TypedEmitter<CommandQueueEvents> {
	public queueContexts: AsyncQueueContext[];
	private held: boolean;
	private readonly tagGenerator = commandIdGenerator();

	constructor(
		public readonly connection: Connection,
		private running: boolean = false,
	) {
		super();
		this.queueContexts = [];
		this.held = false;
	}

	private nextTag = (): string => this.tagGenerator.next().value;

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

	/**
	 * Submits `command` per its declared `queueMode` (spec §6.1):
	 * "pipeline" may share the current context (concurrent in flight with
	 * other pipeline commands); "serial"/"isolated" both require a context
	 * of their own. In this queue's architecture only ONE context is ever
	 * "active" (running) at a time — a later context never starts before
	 * the one ahead of it has fully drained (`removeQueueContext` only
	 * promotes the next context once the current one goes idle) — so
	 * "isolated"'s stronger §6.1 guarantee (drains ALL prior contexts,
	 * doesn't start until no tagged response is outstanding and the write
	 * buffer is flushed) already falls out of that structural invariant for
	 * both modes; "isolated" is additionally the mode STARTTLS/etc. combine
	 * with an explicit `hold()`/`release()` window for I-1's stronger
	 * continuation-exclusivity guarantee.
	 */
	add<T>(command: Command<T>): Promise<T> {
		const mode = command.queueMode;
		const waiting = this.waitingContext;
		const needsNewContext =
			!waiting || waiting.isIsolated || (mode !== "pipeline" && waiting.size > 0);
		if (needsNewContext) {
			if (waiting && waiting.isIsolated) {
				// M4.1: notify before creating the new (structurally-blocked)
				// context — see `contextQueuedBehindIsolated`'s own doc comment.
				this.emit("contextQueuedBehindIsolated");
			}
			this.addQueueContext(mode !== "pipeline");
		}

		// We just created it if it doesn't exist, so this is a safe add
		return (this.waitingContext as AsyncQueueContext).add(command);
	}

	/**
	 * ST4 fix (M4-phase-boundary review): stops EVERY context in
	 * `queueContexts`, not only `activeContext` -- mirroring `Router.reset()`'s
	 * own "clear every registry, not just the active slot" posture
	 * (`connection/router.ts`). Before this fix, a context queued BEHIND an
	 * isolated one (e.g. a command submitted while an isolated IDLE round is
	 * active, `CommandQueue.add()`'s own doc comment) was never stopped on
	 * teardown -- its queued command's promise (and, transitively, anything
	 * awaiting it, such as `IdleHandle.done()`) never settled, since nothing
	 * ever called `.stop()` on that later, not-yet-promoted context.
	 */
	/**
	 * ST4 fix (M4-phase-boundary review): stops EVERY context in
	 * `queueContexts`, not only `activeContext` -- mirroring `Router.reset()`'s
	 * own "clear every registry, not just the active slot" posture
	 * (`connection/router.ts`). Before this fix, a context queued BEHIND an
	 * isolated one (e.g. a command submitted while an isolated IDLE round is
	 * active, `CommandQueue.add()`'s own doc comment) was never stopped on
	 * teardown -- its queued command's promise (and, transitively, anything
	 * awaiting it, such as `IdleHandle.done()`) never settled, since nothing
	 * ever called `.stop()` on that later, not-yet-promoted context.
	 */
	cancelAllRunningCommands(cause?: unknown) {
		for (const ctx of this.queueContexts) {
			ctx.stop(cause);
		}
	}

	start() {
		this.running = true;
		if (this.activeContext) {
			this.activeContext.run();
		}
	}

	/** Stops the queue: every pending/in-flight command rejects with a
	 *  `ConnectionError(phase:"steady")` carrying `cause` (spec §6.3). */
	stop(cause?: unknown) {
		this.running = false;
		// Defensive hygiene (CRITICAL-2): a dead/erroring socket must never
		// leave the queue permanently held. `stop()` is the one operation every
		// teardown path (both the normal socket-close lifecycle and a
		// connect()-time failure) is guaranteed to call, so resetting `held`
		// here — in addition to `release()` doing so on its own paths —
		// guarantees a wedged hold can't survive past a torn-down connection.
		this.held = false;
		this.cancelAllRunningCommands(cause);
		// ST4 fix (M4-phase-boundary review): every context just had its
		// commands rejected above -- clear the list too (mirroring
		// `Router.reset()`'s posture), rather than leaving dead contexts
		// behind for a hypothetical `add()` call between this `stop()` and
		// the next `start()` to append after.
		this.queueContexts.length = 0;
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
			this.nextTag,
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
