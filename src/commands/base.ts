import type { ClientState } from "../client/state";
import { ImapError, ServerBadError, ServerNoError } from "../errors";
import { ContinueResponse, TaggedResponse, UntaggedResponse } from "../parser";
import { ResponseCollector, toTypedResponseCode } from "./collector";
import { CommandWriter } from "./writer";

/**
 * Command base (spec §7.1). Replaces the old EventEmitter-based `Command`
 * (parseResponse/getFullAnnotatedCommand/tag-in-constructor machinery is
 * gone entirely). A command instance is now a plain, reusable VALUE until
 * it is actually submitted to a queue: the queue assigns the tag at write
 * time (see `assignTag` below), builds the wire bytes by calling `write()`
 * with a fresh `CommandWriter`, attributes responses to the command via
 * `claims()`, and builds the final result via `accept()` once the tagged
 * response arrives.
 *
 * Re-submission semantics (deliberately simple, per the task brief): a
 * command instance may be submitted (i.e. handed to a queue and written)
 * at most once. `assignTag` throws if called a second time. Callers that
 * want to send the "same" command twice (e.g. two NOOPs) must construct
 * two instances — command classes are cheap, stateless-until-submitted
 * values, so this is never a hardship in practice.
 */

/** Context passed to `claims()` alongside the candidate response. Currently
 *  just the command's own assigned tag (useful for TAG-correlated claim
 *  rules, e.g. ESEARCH by tag per RFC 4731 §3.1 — a later milestone); kept
 *  as an object (rather than a bare string parameter) so additional
 *  correlation data can be added without breaking `claims()` overrides. */
export interface ClaimContext {
	/** The tag assigned to the command being claimed against (see
	 *  `Command.tag`), passed through so `claims()` overrides can implement
	 *  TAG-correlated claim rules. */
	readonly tag: string;
}

/** A command's pipelining class (spec §6.1) — see `Command.queueMode` for
 *  the meaning of each value. */
export type QueueMode = "pipeline" | "serial" | "isolated";

const ALL_STATES: readonly ClientState[] = [
	"disconnected",
	"connecting",
	"not-authenticated",
	"authenticated",
	"selected",
	"logout",
];

/**
 * Base class for every IMAP command (spec §7.1). A command instance is a
 * plain, reusable VALUE until it is actually submitted to a queue: the
 * queue assigns the tag at write time (see `assignTag`), builds the wire
 * bytes by calling `write()` with a fresh `CommandWriter`, attributes
 * untagged responses to the command via `claims()`, and builds the final
 * result via `accept()` once the tagged response arrives.
 *
 * Re-submission semantics are deliberately simple: a command instance may
 * be submitted (i.e. handed to a queue and written) at most once —
 * `assignTag` throws if called a second time. Callers that want to send
 * the "same" command twice (e.g. two NOOPs) must construct two instances —
 * command classes are cheap, stateless-until-submitted values, so this is
 * never a hardship in practice.
 */
export abstract class Command<TResult> {
	/** Wire verb, e.g. "CAPABILITY", "UID FETCH". */
	abstract readonly verb: string;

	/** Legal submission states (spec §7.1). Enforcement (rejecting a command
	 *  submitted in an illegal state, I-11) lands with `ImapClient` — this
	 *  milestone only stores the declaration so that later wiring is
	 *  mechanical. Defaults to every state (no restriction). */
	readonly states: readonly ClientState[] = ALL_STATES;

	/** Required capability/capabilities (OR-semantics between array entries).
	 *  Enforcement (§3.6/I-9: reject with zero bytes written when absent)
	 *  also lands with `ImapClient`; stored here for that later wiring. */
	readonly capability?: string | string[];

	/** Pipelining class (spec §6.1): "pipeline" may share a queue context and
	 *  be concurrently in flight with other pipeline commands; "serial" must
	 *  be alone in flight; "isolated" additionally drains every prior
	 *  context and owns the connection (including continuations)
	 *  exclusively. */
	abstract readonly queueMode: QueueMode;

	/** Declares that SUBMITTING this command sends credentials over the wire
	 *  as part of its exchange — `LoginCommand`'s password argument, or the
	 *  entire SASL exchange `AuthenticateCommand` drives (spec §10.3, RFC
	 *  8314 §5: credentials must never be sent over cleartext unless the
	 *  caller opted into `allowInsecureAuth`). `ImapClient.run()` is the
	 *  chokepoint EVERY submission passes through (the public escape hatch
	 *  included), so it enforces this flag BEFORE the command ever reaches
	 *  the queue — a caller that bypasses `performAuthSelection()`'s own
	 *  mechanism-level gate (e.g. `client.run(new LoginCommand(...))`
	 *  directly) is still caught there. `performAuthSelection`'s gate stays
	 *  in place too (defense in depth, mechanism-level filtering) — this
	 *  flag does not replace it. Defaults to `false`; only credential-
	 *  bearing commands override it to `true`. */
	readonly sendsCredentials: boolean = false;

	private _tag: string | undefined;
	private _submitted = false;

	/** The tag assigned by the queue at write time, or `undefined` before
	 *  submission. */
	get tag(): string | undefined {
		return this._tag;
	}

	/** Serialize this command's ARGUMENTS onto `w`. MUST NOT write raw bytes
	 *  anywhere else — the queue prefixes `"<tag> <verb> "` and appends the
	 *  trailing CRLF once this command is actually dispatched (spec §7.2). */
	protected abstract write(w: CommandWriter): void;

	/**
	 * Claims an untagged response routed while this command is in flight
	 * (spec §7.1/§8 step 3a). Default implementation: claims every untagged
	 * response whose `.type` is the last space-separated token of `verb`,
	 * uppercased — e.g. `CapabilityCommand` ("CAPABILITY") claims type
	 * "CAPABILITY", `IdCommand` ("ID") claims type "ID", a hypothetical
	 * `UidFetchCommand` ("UID FETCH") would claim type "FETCH". Commands
	 * whose untagged-response vocabulary doesn't reduce to their own verb's
	 * last token (the common case for FETCH-family/SEARCH-family commands
	 * with richer attribution rules) override this method directly.
	 */
	protected claims(resp: UntaggedResponse, _ctx: ClaimContext): boolean {
		return this.defaultClaimedTypes().includes(resp.type);
	}

	private defaultClaimedTypes(): readonly string[] {
		const words = this.verb.trim().split(/\s+/);
		return [words[words.length - 1].toUpperCase()];
	}

	/** Builds the result once the tagged OK response arrives, from whatever
	 *  `claims()` attributed to this command plus the tagged response
	 *  itself (spec §7.3's `ResponseCollector`).
	 *
	 *  M3.4 note: `execute-command.ts` now builds the `ResponseCollector`
	 *  LIVE — it exists (empty) before this command's first claim and is
	 *  fed via `push()` in arrival order as the router attributes responses
	 *  to it, well before `accept()` is ever invoked. The collector's
	 *  `live()` async generator (see `commands/collector.ts`) is the FETCH
	 *  streaming bridge itself: a consumer holding a reference to the SAME
	 *  live collector (which a future streaming command's own machinery can
	 *  obtain, e.g. by capturing it out of an overridden `claims()`
	 *  invocation context, or via whatever hook M3.5 adds for this purpose)
	 *  can observe a claimed FETCH response — including one carrying a
	 *  still-arriving literal stream (M3.2) — the instant it is pushed,
	 *  rather than waiting for `accept()`'s single post-tagged invocation.
	 *  `accept()` itself is unchanged: still invoked exactly once, after the
	 *  tagged response settles the collector, seeing the complete
	 *  arrival-ordered snapshot every existing command already relies on.
	 *
	 *  May return `TResult` directly OR a `Promise<TResult>` (widened by
	 *  M1.7b for `AuthenticateCommand`): a SASL mechanism's `finish()` step
	 *  (spec §9.1) MUST run — and be able to reject — even after a tagged OK
	 *  has already arrived (the SCRAM server-signature case: the server says
	 *  OK, but the client's own verification of the server's final data can
	 *  still fail, and that MUST surface as the command's rejection, not be
	 *  silently ignored). `executeCommand` (connection/execute-command.ts)
	 *  awaits whatever this returns before settling the command's promise, so
	 *  a synchronous `TResult` return (every command before AUTHENTICATE) is
	 *  unaffected — awaiting a non-thenable value is a same-microtask no-op. */
	protected abstract accept(c: ResponseCollector): TResult | Promise<TResult>;

	/**
	 * M3.5 streaming hook (spec §7.3/§5.4): called ONCE by `executeCommand`,
	 * synchronously, the instant this command's own LIVE `ResponseCollector`
	 * is constructed — BEFORE this command's bytes are even written and
	 * before any response could possibly be claimed. This is deliberately a
	 * SEPARATE seam from `accept()` (still only ever invoked once, after
	 * `settle()`, unchanged): `accept()`'s post-tagged timing is exactly
	 * right for every command through M3.4, but a genuinely STREAMING
	 * command (FETCH) needs to hand its caller something that starts
	 * consuming `collector.live()` while the command is still in flight —
	 * `MailboxSession.fetch()` must return an `AsyncIterable` that yields
	 * messages as their FETCH responses complete, not only once the whole
	 * multi-message command (and its tagged OK) has already finished
	 * arriving. `FetchCommand` (M3.5) captures the collector reference here
	 * and drives its own internal consumption of `live()` from it; every
	 * other command leaves this hook undefined and is completely
	 * unaffected — `executeCommand`'s own promise-resolution timing (and
	 * therefore the queue's `commandDone`/idle bookkeeping) is UNCHANGED by
	 * this hook's existence: it fires as a side effect alongside collector
	 * construction, not in place of the normal write/await-tagged/settle/
	 * accept flow that still runs to completion exactly as before.
	 */
	protected onCollectorReady?(c: ResponseCollector): void;

	/** Continuation hook for INTERACTIVE commands only (AUTHENTICATE, IDLE —
	 *  neither lands in this milestone). The queue-automatic literal gate
	 *  (spec §6.2) is NOT this: a plain multi-segment `write()` output is
	 *  handled entirely by the queue without ever calling this hook. Return
	 *  the bytes to send in response to a continuation, or `"abort"` to send
	 *  the SASL cancel line (`*`). */
	protected onContinuation?(resp: ContinueResponse): Promise<Buffer | "abort">;

	/** Maps a tagged NO/BAD response to the error this command's promise
	 *  rejects with. Default: `ServerNoError`/`ServerBadError` carrying the
	 *  verb, tag, status, typed code (best-effort, spec §5.5 placeholder),
	 *  and text — override to map a specific code (e.g. TRYCREATE) to a more
	 *  specific error; auto-create/retry behavior itself is always the
	 *  CALLER's job, never automatic here (spec §7.1). */
	protected onError?(resp: TaggedResponse): ImapError;

	private defaultOnError(resp: TaggedResponse): ImapError {
		const status = resp.status.status as "NO" | "BAD";
		const text = resp.status.text?.content ?? "";
		const code = toTypedResponseCode(resp.status.text?.code);
		const message = `${this.verb} failed with ${status}${text ? `: ${text}` : ""}`;
		const init = { command: this.verb, tag: resp.tag.id, code, text };
		return status === "BAD"
			? new ServerBadError(message, init)
			: new ServerNoError(message, init);
	}

	// -- internal driver surface --------------------------------------------
	// `write`/`claims`/`accept`/`onContinuation`/`onError` stay `protected`:
	// that's the correct signal for subclass authors (they're overridable
	// hooks, not part of the calling surface) and gives them the right
	// autocomplete/encapsulation story. The queue/router still need to
	// invoke them, though — the standard way to do that without loosening
	// the access modifier is to expose STATIC methods here: per TypeScript's
	// access rules, a class's own static methods may reach the protected/
	// private members of ANY instance of that class (including subclass
	// instances), exactly as an instance method could. These statics are
	// this module's only sanctioned way to drive a `Command`; nothing
	// outside `commands/` or `connection/queue.ts`/`connection/router.ts`
	// should need them.

	/** Assigns the tag at write time (spec §7.1). Throws if this command
	 *  instance has already been submitted once. */
	static assignTag(cmd: Command<unknown>, tag: string): void {
		if (cmd._submitted) {
			throw new Error(
				`Command "${cmd.verb}" has already been submitted (tag ${cmd._tag}); ` +
					"a command instance may be submitted at most once — construct a new instance to resend it",
			);
		}
		cmd._submitted = true;
		cmd._tag = tag;
	}

	/** Invokes `cmd`'s protected `write()` hook so the queue can serialize its
	 *  arguments onto `w` without widening `write()`'s own access modifier. */
	static writeArgs(cmd: Command<unknown>, w: CommandWriter): void {
		cmd.write(w);
	}

	/** Invokes `cmd`'s protected `claims()` hook so the router can test
	 *  whether an untagged response `resp` should be attributed to `cmd`. */
	static claimsResponse(
		cmd: Command<unknown>,
		resp: UntaggedResponse,
		ctx: ClaimContext,
	): boolean {
		return cmd.claims(resp, ctx);
	}

	/** Invokes `cmd`'s protected `accept()` hook to build its result from the
	 *  responses collected in `c` once the tagged response has arrived. */
	static acceptResult<T>(cmd: Command<T>, c: ResponseCollector): T | Promise<T> {
		return cmd.accept(c);
	}

	/** Fires the M3.5 streaming hook (`onCollectorReady`, see its own doc
	 *  comment above) — a no-op for every command that doesn't define it. */
	static notifyCollectorReady(cmd: Command<unknown>, c: ResponseCollector): void {
		cmd.onCollectorReady?.(c);
	}

	/** Reports whether `cmd` defines an `onContinuation` handler, i.e.
	 *  whether it is prepared to respond to a server continuation request
	 *  (spec §7) while in flight. */
	static hasContinuationHook(cmd: Command<unknown>): boolean {
		return typeof cmd.onContinuation === "function";
	}

	/** Invokes `cmd`'s `onContinuation` handler with a continuation response
	 *  `resp`, returning the bytes (or `"abort"`) it produces. Throws if
	 *  `cmd` defines no such handler — callers should check
	 *  `hasContinuationHook` first. */
	static handleContinuation(
		cmd: Command<unknown>,
		resp: ContinueResponse,
	): Promise<Buffer | "abort"> {
		if (!cmd.onContinuation) {
			throw new Error(
				`Command "${cmd.verb}" received a continuation but defines no onContinuation handler`,
			);
		}
		return cmd.onContinuation(resp);
	}

	/** Maps a tagged NO/BAD response to the `ImapError` `cmd`'s promise
	 *  should reject with — `cmd`'s own `onError` override if it has one,
	 *  otherwise the default `ServerNoError`/`ServerBadError` mapping. */
	static mapError(cmd: Command<unknown>, resp: TaggedResponse): ImapError {
		return cmd.onError ? cmd.onError(resp) : cmd.defaultOnError(resp);
	}
}
