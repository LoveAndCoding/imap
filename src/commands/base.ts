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
	readonly tag: string;
}

export type QueueMode = "pipeline" | "serial" | "isolated";

const ALL_STATES: readonly ClientState[] = [
	"disconnected",
	"connecting",
	"not-authenticated",
	"authenticated",
	"selected",
	"logout",
];

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
	 *  SEAM (documented, not implemented here): the spec's FETCH streaming
	 *  bridge — exposing a claimed FETCH response's pending literal as a
	 *  stream *during* collection, before the tagged OK — lands with the
	 *  FETCH command in M3. Nothing in this milestone's collector/queue
	 *  prevents that: `accept()` already runs against the SAME
	 *  `ResponseCollector` instance that received every claimed response in
	 *  arrival order, so a future FETCH command can start consuming/
	 *  streaming literal data out of claimed responses before its own
	 *  `accept()` is ever called. */
	protected abstract accept(c: ResponseCollector): TResult;

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

	static writeArgs(cmd: Command<unknown>, w: CommandWriter): void {
		cmd.write(w);
	}

	static claimsResponse(
		cmd: Command<unknown>,
		resp: UntaggedResponse,
		ctx: ClaimContext,
	): boolean {
		return cmd.claims(resp, ctx);
	}

	static acceptResult<T>(cmd: Command<T>, c: ResponseCollector): T {
		return cmd.accept(c);
	}

	static hasContinuationHook(cmd: Command<unknown>): boolean {
		return typeof cmd.onContinuation === "function";
	}

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

	static mapError(cmd: Command<unknown>, resp: TaggedResponse): ImapError {
		return cmd.onError ? cmd.onError(resp) : cmd.defaultOnError(resp);
	}
}
