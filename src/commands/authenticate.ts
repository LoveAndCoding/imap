import { AuthError, ImapError } from "../errors";
import type { ContinueResponse, TaggedResponse } from "../parser";
import type { SaslContext, SaslMechanism } from "../sasl/mechanism";
import { mechanismAuthError } from "../sasl/mechanism";
import { Command } from "./base";
import { ResponseCollector, toTypedResponseCode } from "./collector";
import type { CommandWriter } from "./writer";

/**
 * Constructor input for `AuthenticateCommand` (shape is this module's own —
 * spec §9 leaves it to the implementer). `initialResponse` is precomputed by
 * the CALLER (the selection algorithm, spec §9.3/`client/auth.ts`) via
 * `await mechanism.start(ctx)` — `write()` is synchronous (spec §7.1), so a
 * mechanism's (necessarily async) initial-response computation cannot happen
 * inside this command at all; it must already be in hand before the command
 * is ever submitted to a queue. `null` means "this mechanism sends nothing
 * until the server's first real challenge" (distinct from an explicitly
 * empty `Buffer.alloc(0)` initial response, e.g. a mechanism that legitimately
 * wants to send zero bytes as its opening move).
 */
export interface AuthenticateCommandOptions {
	mechanism: SaslMechanism;
	ctx: SaslContext;
	initialResponse: Buffer | null;
	/** Whether the server advertised SASL-IR (RFC 4959) — gates whether a
	 *  non-null `initialResponse` is sent inline on the `AUTHENTICATE` line
	 *  itself, vs. deferred to the first server continuation. */
	saslIrAllowed: boolean;
}

/**
 * Encodes one SASL response payload for the wire (spec §9.1's framing
 * division of labor: "the AUTHENTICATE command owns ALL base64 framing in
 * both directions"): an empty buffer becomes a bare empty line (just the
 * CRLF `executeCommand`'s continuation handler already appends — see
 * `XOAuth2Mechanism`'s doc comment for why this is the correct empty-
 * response wire form for a CONTINUATION reply, as opposed to the "="
 * shorthand, which is specific to the initial-response *argument position*
 * on the `AUTHENTICATE` command line itself, RFC 4959 §3); anything else is
 * base64-encoded.
 */
function encodeContinuationReply(data: Buffer): Buffer {
	if (data.length === 0) {
		return Buffer.alloc(0);
	}
	return Buffer.from(data.toString("base64"), "ascii");
}

/**
 * AUTHENTICATE (RFC 3501/9051 §6.2.2, RFC 4422, RFC 4959). `isolated`:
 * AUTHENTICATE owns the connection exclusively for its whole (potentially
 * multi-round-trip) SASL exchange, including every continuation (spec
 * §6.1) — no other command may be interleaved. Only legal in
 * "not-authenticated" (PREAUTH already skips this entirely, spec §10.5).
 *
 * This command owns ALL base64/wire framing for the SASL exchange; the
 * `SaslMechanism` it drives never sees base64 text or CRLFs (spec §9.1) —
 * every `Buffer` crossing the `SaslMechanism` interface is raw, already-
 * decoded protocol payload.
 */
export class AuthenticateCommand extends Command<void> {
	readonly verb = "AUTHENTICATE";
	readonly queueMode = "isolated" as const;
	readonly states = ["not-authenticated"] as const;
	/** The whole SASL exchange this command drives is credential-bearing
	 *  (spec §10.3's gate treats an authentication ATTEMPT as a whole, not a
	 *  per-mechanism filter — see `Command.sendsCredentials` and
	 *  `performAuthSelection`'s matching top-of-function gate). */
	readonly sendsCredentials = true;

	private readonly mechanism: SaslMechanism;
	private readonly ctx: SaslContext;
	private readonly initialResponse: Buffer | null;
	private readonly saslIrAllowed: boolean;

	/** `true` once the initial response has actually been placed on the wire
	 *  — either inline in `write()` (SASL-IR) or as the reply to the first
	 *  continuation (deferred). Guards against ever sending it twice. */
	private initialResponseSent = false;

	constructor(opts: AuthenticateCommandOptions) {
		super();
		this.mechanism = opts.mechanism;
		this.ctx = opts.ctx;
		this.initialResponse = opts.initialResponse;
		this.saslIrAllowed = opts.saslIrAllowed;
	}

	protected write(w: CommandWriter): void {
		w.atom(this.mechanism.name.toUpperCase());
		if (this.saslIrAllowed && this.initialResponse !== null) {
			w.sp();
			if (this.initialResponse.length === 0) {
				// RFC 4959: an empty initial response, when sent inline as the
				// command's own argument, is represented by a bare "=" — NOT an
				// empty base64 atom (which would just be nothing at all, i.e.
				// indistinguishable from "no initial response"). This is the one
				// place "=" is legal; every other empty SASL response on this
				// exchange (a later continuation reply) is a bare empty line
				// instead (see `encodeContinuationReply`).
				w.atom("=");
			} else {
				w.atom(this.initialResponse.toString("base64"));
			}
			this.initialResponseSent = true;
		}
	}

	protected async onContinuation(resp: ContinueResponse): Promise<Buffer | "abort"> {
		try {
			if (!this.initialResponseSent && this.initialResponse !== null) {
				// SASL-IR wasn't used (either not advertised, or this mechanism's
				// initial response wasn't sent inline for some other reason): the
				// server's first continuation is just a "go ahead" prompt for the
				// initial response, not a real challenge — RFC 4959 §3. Deliver it
				// now; this continuation's own (usually empty) challenge text is
				// not fed into `step()`.
				this.initialResponseSent = true;
				return encodeContinuationReply(this.initialResponse);
			}
			// A real server challenge: base64-decode (this command owns ALL
			// base64 framing, spec §9.1 — `resp.text.content` is always the raw
			// wire text, empty string for a bare "+ " prompt) and hand the
			// mechanism raw bytes.
			const challenge = Buffer.from(resp.text.content, "base64");
			const reply = await this.mechanism.step(challenge, this.ctx);
			return encodeContinuationReply(reply);
		} catch {
			// spec §9.1: a mechanism's `step()` throw (or any failure preparing
			// a reply) maps to `*` cancellation — the execute layer (spec §6.2)
			// sends `*` CRLF for us; the eventual tagged NO/BAD is what actually
			// settles this command's promise (via `onError` below), carrying an
			// `AuthError`.
			return "abort";
		}
	}

	protected async accept(_c: ResponseCollector): Promise<void> {
		// Some servers place final SASL data (e.g. a SCRAM server-signature) on
		// the tagged OK itself instead of a last continuation — spec §9.1 asks
		// `finish()` to be given that data when present. This command does NOT
		// guess at it from the tagged OK's free TEXT, though: unlike a
		// continuation's response line (which is ALWAYS base64 SASL payload,
		// never human prose), a tagged OK's trailing text is ordinary
		// human-readable success text ("done", "authenticated") far more often
		// than it's smuggled SASL data, and the two are indistinguishable by
		// shape alone (both are just runs of letters/digits) — guessing wrong
		// would corrupt `finish()`'s input on the overwhelmingly common case to
		// support an uncommon one. What IS reliably a structured signal is a
		// resp-text-CODE (the bracketed `[...]` part) — but no code this
		// library currently parses represents SASL success data, so `extraData`
		// is always `null` today; a later milestone (SCRAM, once a concrete
		// server convention needs it) is the right place to add a typed code
		// for this rather than heuristically parsing free text now.
		const extraData: Buffer | null = null;
		try {
			await this.mechanism.finish(extraData, this.ctx);
		} catch (err) {
			// spec §9.1/task brief: `finish()` MUST be able to reject the
			// command's promise even though the server already said OK (the
			// SCRAM server-signature case: the client verifies, not just trusts,
			// server-claimed success). A mechanism is documented to throw
			// `AuthError` itself; pass that straight through, and wrap anything
			// else (a mechanism that didn't follow the contract) the same way
			// every other local mechanism failure in this codebase is wrapped.
			if (err instanceof ImapError) {
				throw err;
			}
			throw mechanismAuthError(
				this.mechanism.name,
				`AUTHENTICATE ${this.mechanism.name}: finish() rejected authentication ` +
					`despite a tagged OK (${err instanceof Error ? err.message : String(err)})`,
				err,
			);
		}
	}

	/** Tagged NO/BAD -> `AuthError` (spec §9.3's selection algorithm needs to
	 *  tell "credentials wrong" (AUTHENTICATIONFAILED) apart from "mechanism
	 *  rejected/misnegotiated" (anything else) purely from `.code`, since
	 *  `AuthError` doesn't carry the raw NO/BAD status — see `client/auth.ts`). */
	protected onError(resp: TaggedResponse): ImapError {
		const status = resp.status.status as "NO" | "BAD";
		const text = resp.status.text?.content ?? "";
		const code = toTypedResponseCode(resp.status.text?.code);
		const message =
			`AUTHENTICATE ${this.mechanism.name} failed with ${status}` +
			(text ? `: ${text}` : "");
		return new AuthError(message, { mechanismsTried: [this.mechanism.name], code });
	}
}
