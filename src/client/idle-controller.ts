import { IdleCommand } from "../commands/idle";

/**
 * `MailboxSession.idle()`'s return value (spec §5b/§3.7): the only thing an
 * explicit-mode caller gets back besides the fact that idling has started.
 */
export interface IdleHandle {
	/**
	 * Ends this idle session: signals the controller to stop (sending
	 * `DONE` once RFC 2177's `+ idling` continuation has actually arrived —
	 * `IdleCommand.onContinuation` itself enforces that wait; this call only
	 * supplies the SIGNAL that it's time) and resolves once the tagged OK
	 * that actually ends the session has settled. Idempotent: safe to call
	 * more than once (including after the session already ended for some
	 * other reason, e.g. another command queuing up behind it, spec §3.7) —
	 * every call resolves (or rejects) with the SAME outcome.
	 */
	done(): Promise<void>;
}

/**
 * The narrow seam `IdleController` needs from its owner (constructed by
 * `MailboxSession.idle()` today; M4.3's managed `updates({idle:true})` loop
 * is expected to reuse this same controller/driver pair — see this class's
 * own doc comment for what carries over). Kept structural (not importing
 * `Connection`/`ImapClient` directly) for the same reason
 * `MailboxSessionDriver` (`src/client/mailbox.ts`) is structural: the
 * minimal capability set this class needs, nothing more.
 */
export interface IdleControllerDriver {
	/**
	 * Submits ONE round's `IdleCommand` through the connection's queue
	 * (spec §6.1's isolated context) — the same `run()` chokepoint every
	 * other verb goes through (state/capability gating already happened in
	 * the caller, e.g. `MailboxSession.idle()`, before this controller is
	 * ever constructed). Resolves once that round's tagged OK settles the
	 * command (or rejects on a tagged NO/BAD or connection teardown).
	 */
	run(command: IdleCommand): Promise<void>;
	/**
	 * Subscribes to the queue's "another context was just queued behind the
	 * currently-active isolated context" signal (Shared design note 4's
	 * queue-level hook — `CommandQueue`'s `contextQueuedBehindIsolated`
	 * event, `src/connection/queue.ts`, surfaced via
	 * `Connection.onQueueContextQueuedBehindIsolated()`) — fired the instant
	 * ANY command is submitted while this controller's own IDLE round is the
	 * active isolated context. Returns an unsubscribe function.
	 */
	onQueuedBehindIsolated(cb: () => void): () => void;
	/**
	 * `timeouts.idleRenew` (already validated/defaulted to `28 * 60_000`,
	 * `client/config.ts`) — how long one round is allowed to run before this
	 * controller proactively sends `DONE` and (invisibly to the handle)
	 * re-enters IDLE (spec §3.7, RFC 2177's 29-minute guidance).
	 */
	idleRenewMs(): number;
}

/** Discriminated settle-outcome of one round's `driver.run()` promise —
 *  `unknown` alone can't distinguish "settled with no error" from "settled
 *  with an `undefined` error value", so a plain tri-state boolean flag isn't
 *  enough; this small wrapper is the local fix. */
type RoundOutcome = { ok: true } | { ok: false; err: unknown };

/**
 * `IdleController` (spec §3.7) — owns one IDLE session's round(s) over the
 * connection's isolated queue context: opens IDLE, tracks idling state,
 * renews every `timeouts.idleRenew` (DONE + immediate re-IDLE, invisible to
 * the handle), and ends the session for good the first time something OTHER
 * than the renewal timer asks it to stop (an explicit `done()` call, or
 * another command queuing up behind the isolated context — spec §3.7's
 * "any command submission" trigger). That "does the explicit surface
 * auto-DONE or make the caller wait?" question (Shared design note 4) is
 * answered here: it auto-DONEs — spec §3.7 says "any command submission
 * while idling causes: write DONE, await tagged completion, run the
 * command, re-enter IDLE (managed mode only)" verbatim, with no carve-out
 * for the explicit surface on the DONE-and-run half; only the RE-ENTRY half
 * is managed-mode-only. Making an unrelated caller's command wait
 * indefinitely for THIS caller to remember to call `done()` would be a
 * deadlock hazard this class exists specifically to avoid (M4.2's ordering
 * races are the proof this actually works, not just a unit-test claim).
 *
 * M4.3 (managed `updates({idle:true})`, NOT this milestone) is expected to
 * reuse this exact class: its own loop only needs to feed a `continueIdling`-
 * style decision back in on `onQueuedBehindIsolated` firing (re-enter after
 * running the queued command, rather than stopping for good) — see this
 * class's `requestStop()`/`continueIdling` for the seam that decision would
 * hook into.
 */
export class IdleController {
	/** Resolves the CURRENT round's `IdleCommand`'s `done` promise —
	 *  reassigned every round (including renewal re-entries), so a
	 *  `requestStop()` call always acts on whichever round is actually live
	 *  right now, never a stale one from an earlier round. */
	private resolveRoundDone: (() => void) | undefined;
	/** `true` until something asks this controller to stop for good (an
	 *  explicit `done()` call, or a command queuing up behind the isolated
	 *  IDLE context, spec §3.7's "any command submission" trigger) — the
	 *  renewal timer alone never flips this. This is what makes renewal
	 *  "invisible" to the handle: an unattended idle session just keeps
	 *  DONE-ing and re-IDLE-ing on its own, forever, until something else
	 *  says stop. */
	private continueIdling = true;
	private renewalTimer: ReturnType<typeof setTimeout> | undefined;
	private unsubscribeHook: (() => void) | undefined;

	/** Resolves (or rejects) once this controller has stopped for good —
	 *  what the public `done()` ultimately awaits, so a caller that calls
	 *  `done()` mid-renewal still waits for the round that ACTUALLY ends the
	 *  session, not the one that happened to be renewing at the moment of
	 *  the call. A single promise for this controller's entire lifetime
	 *  (however many rounds it takes) — `done()` is idempotent because of
	 *  it, not because of any special-casing in `done()` itself. */
	private readonly stopped: Promise<void>;
	private resolveStopped!: () => void;
	private rejectStopped!: (err: unknown) => void;
	private stoppedSettled = false;

	constructor(private readonly driver: IdleControllerDriver) {
		this.stopped = new Promise<void>((resolve, reject) => {
			this.resolveStopped = resolve;
			this.rejectStopped = reject;
		});
		// A caller that never calls `done()` at all (e.g. the session ends
		// itself via the queued-behind-isolated hook, or the connection
		// tears down) must not turn a rejection here into an unhandled
		// promise rejection just because nobody was listening — `done()`
		// itself still returns/awaits the SAME `this.stopped` for any caller
		// that DOES want the outcome; this extra handler only prevents the
		// process-level warning/crash for the common case where nobody asks.
		this.stopped.catch(() => undefined);
	}

	/**
	 * Starts idling: submits the first round's `IdleCommand` and arms the
	 * renewal timer. Resolves once submission has actually been kicked off
	 * (the underlying queue write happens synchronously inside this call,
	 * unless withheld by a hold or a prior isolated context) — NOT once the
	 * round completes. `MailboxSession.idle()` awaits this once, then hands
	 * the caller an `IdleHandle` while the round keeps running in the
	 * background.
	 */
	public async start(): Promise<void> {
		this.beginRound();
	}

	/** The public `IdleHandle.done()` implementation — see that interface's
	 *  own doc comment for the exact contract. */
	public done(): Promise<void> {
		this.requestStop();
		return this.stopped;
	}

	/**
	 * Signals "stop after the current round" — called by the public
	 * `done()` above AND by the queued-behind-isolated hook (spec §3.7: a
	 * command submission ends the explicit session, no re-entry; only the
	 * renewal timer re-enters). Resolving the current round's `done`
	 * promise only unblocks `IdleCommand.onContinuation`'s `await` WHENEVER
	 * the server's own `+ idling` continuation actually arrives — this call
	 * never writes anything itself.
	 */
	private requestStop(): void {
		this.continueIdling = false;
		this.resolveRoundDone?.();
	}

	private beginRound(): void {
		let resolveRoundDone!: () => void;
		const donePromise = new Promise<void>((resolve) => {
			resolveRoundDone = resolve;
		});
		this.resolveRoundDone = resolveRoundDone;
		this.continueIdling = true;

		const cmd = new IdleCommand(donePromise);
		const completion = this.driver.run(cmd);

		this.unsubscribeHook = this.driver.onQueuedBehindIsolated(() => {
			this.requestStop();
		});

		this.armRenewalTimer();

		completion.then(
			(): RoundOutcome => ({ ok: true }),
			(err: unknown): RoundOutcome => ({ ok: false, err }),
		).then((outcome) => this.onRoundSettled(outcome));
	}

	private onRoundSettled(outcome: RoundOutcome): void {
		this.clearRenewalTimer();
		this.unsubscribeHook?.();
		this.unsubscribeHook = undefined;

		if (!outcome.ok) {
			this.settleStopped(outcome.err);
			return;
		}

		if (this.continueIdling) {
			// Renewal boundary (or a round that simply hasn't been asked to
			// stop yet): invisible to the handle — silently re-enter.
			this.beginRound();
			return;
		}

		this.settleStopped(undefined);
	}

	private settleStopped(err: unknown): void {
		if (this.stoppedSettled) {
			return;
		}
		this.stoppedSettled = true;
		if (err !== undefined) {
			this.rejectStopped(err);
		} else {
			this.resolveStopped();
		}
	}

	private armRenewalTimer(): void {
		const ms = this.driver.idleRenewMs();
		const timer = setTimeout(() => {
			// Renewal never itself sets `continueIdling = false` — see that
			// field's own doc comment; resolving the round's `done` promise
			// alone ends THIS round, `onRoundSettled` decides afterward
			// (still `true`, unless something else asked to stop in the
			// meantime) to re-enter.
			this.resolveRoundDone?.();
		}, ms);
		// Never keeps the process alive on its own — an idling client
		// shouldn't block a script/CLI from exiting once everything else is
		// done. `unref` is a no-op (and absent) outside Node's `Timeout`
		// class, guarded defensively for any non-Node timer shim.
		(timer as unknown as { unref?: () => void }).unref?.();
		this.renewalTimer = timer;
	}

	private clearRenewalTimer(): void {
		if (this.renewalTimer) {
			clearTimeout(this.renewalTimer);
			this.renewalTimer = undefined;
		}
	}
}
