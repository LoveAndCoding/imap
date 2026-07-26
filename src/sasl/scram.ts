import {
	createHash,
	createHmac,
	pbkdf2Sync,
	randomBytes,
	timingSafeEqual,
} from "node:crypto";

import { mechanismAuthError, SaslContext, SaslMechanism } from "./mechanism";

/**
 * SCRAM-SHA-1 (RFC 5802) / SCRAM-SHA-256 (RFC 7677). A shared base
 * parameterized by hash algorithm — both mechanisms are byte-for-byte the
 * same protocol with HMAC/H() instantiated on a different digest
 * (RFC7677-3-1) — producing the client-first-message, consuming the
 * server-first-message to derive the salted password and client-final-
 * message, and consuming the server-final-message to verify the
 * ServerSignature (RFC5802-5-3): the one security-critical duty of this
 * whole mechanism family.
 *
 * NO CHANNEL BINDING, EVER (spec §13 non-goal / §9.2: "no channel binding =
 * `-PLUS` variants out of scope"). This class only ever emits the bare
 * gs2-cbind-flag "n" (RFC5802-6-3: "if the client does not support channel
 * binding, then it MUST use an 'n' gs2-cbind-flag") — never "y" or "p".
 * `SCRAM-SHA-1-PLUS`/`SCRAM-SHA-256-PLUS` are simply never registered under
 * those names (see sasl/index.ts): there is no "downgrade" path here that
 * negotiates -PLUS and then skips the binding data, because this mechanism
 * never advertises or answers to a -PLUS name at all.
 *
 * SERVER-SIGNATURE VERIFICATION TIMING: per spec §9.1/the M5.1 task brief,
 * the actual accept-or-reject decision is deferred to `finish()` (which runs
 * on the after-tagged-OK async-rejection path `AuthenticateCommand.accept()`
 * already provides, built in M1.7 specifically for this) rather than thrown
 * synchronously out of `step()` when the server-final-message arrives. This
 * matters because a server conventionally sends its server-final-message
 * (carrying "v=<ServerSignature>" or "e=<error>") as an ordinary "+"
 * continuation *before* the tagged OK/NO that concludes AUTHENTICATE — the
 * wire protocol still expects an (empty) reply to that continuation so the
 * exchange can conclude normally; the client's own verdict on whether the
 * signature actually matches is a decision `finish()` renders once the
 * whole exchange (including the tagged status) has played out. `step()`'s
 * *first*-message handling (nonce-prefix mismatch, an unsupported mandatory
 * "m=" extension) still aborts synchronously via a thrown error, since those
 * failures are detected before any client-final-message would even be safe
 * to send (RFC5802-5.1-8/-5.1-5/-5.1-15).
 *
 * `handleServerFinal()`'s THREE possible shapes (M5.16, Finding 4 fixed the
 * third of these to fail closed instead of silently tolerating it):
 *   1. Genuinely ABSENT (`step()` never called again for this phase at all —
 *      `phase` stays "awaiting-server-final" forever): this is the shape a
 *      server that only signals success via the tagged OK, without ever
 *      sending "v=", produces.
 *   2. EMPTY continuation (`step()` called with a zero-length challenge,
 *      `text === ""`): some servers signal everything through the tagged OK
 *      and send only a bare "+" here.
 *   3. NON-EMPTY but unparseable (some bytes arrived, but none of
 *      "e="/"v="/"m=" could be found): something was sent and it wasn't a
 *      verifiable ServerSignature.
 *
 * PR #18 REVIEW FIX (Critical #1, MITM fail-open): cases 1 and 2 used to
 * make `finish()` resolve normally, on the theory that RFC5802-5.1-14
 * ("the entire server-final-message is OPTIONAL") legitimizes a tagged-OK
 * success with no "v=" ever presented. That citation was wrong: RFC5802-
 * 5.1-14 is explicit that the omission it permits is "on failed
 * authentication" (a tagged NO/BAD) — a path that never even reaches this
 * class's `finish()` at all, since `AuthenticateCommand.accept()` (and thus
 * `finish()`) only runs after a tagged **OK** (`connection/execute-
 * command.ts` routes NO/BAD to `onError()` instead, never to `accept()`).
 * There is no RFC5802 sanction for a tagged OK with no verified
 * ServerSignature — that shape is either a non-conformant server or an
 * active MITM that could not forge the real proof, and silently accepting
 * it defeats the entire point of SCRAM's mutual-authentication duty
 * (RFC5802-5-3/-5.1-13). Cases 1 and 2 now leave `verified` `false`, and
 * `finish()` fails closed whenever `verified` is `false` (see `finish()`'s
 * own doc comment) — the ONLY way `finish()` resolves is a genuine,
 * matching "v=" actually observed (by `step()`, or — belt-and-suspenders —
 * by `finish()` itself parsing `data`, see below), which is the sole branch
 * that sets `verified = true`.
 */

export type ScramHashAlgo = "sha1" | "sha256";

/** PBKDF2/HMAC/H() output length in bytes for each supported digest. */
const HASH_LEN: Record<ScramHashAlgo, number> = { sha1: 20, sha256: 32 };

/**
 * PR #18 REVIEW FIX (Medium, unbounded PBKDF2 iteration count): the
 * server-supplied `i=` (RFC5802-5.1-9) drives a synchronous `pbkdf2Sync`
 * call directly (`handleServerFirst` below) — with no upper bound, a
 * malicious or compromised server could send an absurd `i=` (e.g.
 * `99999999`) and block the event loop for as long as it takes this one
 * synchronous call to grind through that many HMAC iterations, a
 * client-side denial-of-service triggered entirely by server-controlled
 * input. RFC 7677 §3 (RFC7677-3-1's own SHOULD) recommends a MINIMUM of
 * 4096; real-world deployments span roughly 4096-600,000 (RFC7677-3-2's
 * cited range). One million is chosen as the ceiling here: comfortably
 * above every known real deployment (leaving headroom for a server that
 * legitimately wants a stronger-than-typical setting) while still bounding
 * a single PBKDF2 call to, at worst, a few hundred milliseconds on
 * commodity hardware — nowhere near enough to constitute a meaningful
 * denial-of-service. An `i=` above this is rejected as a typed
 * `AuthError` (`mechanismAuthError`) BEFORE `pbkdf2Sync` ever runs, the
 * same "abort before the expensive/unsafe operation" posture as every
 * other `handleServerFirst` validation.
 */
const MAX_SCRAM_ITERATIONS = 1_000_000;

/** Construction options for {@link createScramSha1Mechanism}/
 *  {@link createScramSha256Mechanism}. */
export interface ScramMechanismOptions {
	/** Test-only nonce override. Production code omits this and gets a
	 *  fresh, cryptographically random nonce per attempt (RFC5802-5.1-7:
	 *  "It is important that this value be different for each
	 *  authentication").
	 *
	 *  M5.16 (Finding 6) CORRECTED CONTRACT CLAIM: this comment previously
	 *  said "a mechanism instance is already fresh-per-attempt
	 *  (`createMechanism()`'s documented contract)" as if that were a
	 *  universal guarantee -- it is NOT. `createMechanism()` (registry-name
	 *  path, `sasl/index.ts`) does construct a brand-new instance per
	 *  attempt, but `ImapAuthConfig.mechanisms` also accepts a literal
	 *  `SaslMechanism` OBJECT supplied directly by the caller, and
	 *  `resolveMechanism()` (`src/client/auth.ts`) returns THAT instance
	 *  unchanged -- reused verbatim across every attempt and reconnect on a
	 *  caller-supplied instance, never reconstructed. `ScramMechanism` is
	 *  safe under reuse (`start()` reinitializes every piece of per-attempt
	 *  state: `gs2Header`, `clientNonce`, `clientFirstMessageBare`, `phase`,
	 *  `authMessage`, `expectedServerSignature`, `verificationFailure`,
	 *  `verified`) -- PR #18 REVIEW FIX (High #8): this claim was FALSE as
	 *  originally written. `start()` reset the first four fields but never
	 *  `verificationFailure` (`authMessage`/`expectedServerSignature` were
	 *  harmless to leave stale since `handleServerFirst` unconditionally
	 *  overwrites both on its very next call) -- a caller-supplied instance
	 *  reused after ONE failed attempt (e.g. a forged/mismatched
	 *  ServerSignature) stayed permanently poisoned: every SUBSEQUENT
	 *  attempt's `finish()` would keep throwing the FIRST attempt's stale
	 *  `verificationFailure`, even after a genuinely successful second
	 *  exchange. `start()` now clears `verificationFailure`/`verified`
	 *  itself, so the claim is accurate again -- but any FUTURE
	 *  `SaslMechanism`
	 *  implementation that assumes fresh-per-attempt construction (e.g.
	 *  memoizing something in its constructor instead of `start()`) would be
	 *  reused across attempts exactly like this one is. This seam
	 *  (`ScramMechanismOptions.nonce`) exists purely to pin a KNOWN nonce for
	 *  reproducing an RFC worked example in a unit test. */
	nonce?: () => string;
}

/**
 * RFC 5802 §5.1: "The characters ',' or '=' in usernames are sent as '=2C'
 * and '=3D' respectively." Order matters: '=' MUST be escaped before ','
 * — escaping ',' first would re-trigger the '=' replacement on the literal
 * '=' characters the ',' -> '=2C' substitution just introduced, double-
 * escaping it. Shared by the 'n=' username attribute and the gs2-header's
 * 'a=' authzid (RFC5802-5.1-1: "The syntax of this field is the same as
 * that of the 'n' field with respect to quoting of '=' and ','").
 */
function escapeSaslname(value: string): string {
	return value.replace(/=/g, "=3D").replace(/,/g, "=2C");
}

/** Fresh client nonce: base64 of 24 random bytes. Every character of the
 *  standard base64 alphabet (A-Za-z0-9+/=) is printable ASCII excluding ','
 *  (RFC5802-5.1-6), so no additional filtering is needed. */
function defaultNonce(): string {
	return randomBytes(24).toString("base64");
}

/**
 * Splits a SCRAM message into its comma-separated attr-val pairs, keyed by
 * attribute name. Values are NOT re-escaped/decoded here (salt/proof/
 * signature values are consumed as base64 text by their own callers; the
 * nonce is consumed as raw printable-ASCII text) — this is purely the ","/
 * "=" structural split the "extensions" ABNF production and RFC5802-5.1-16
 * ("unknown optional extensions MUST be ignored upon receipt") both assume.
 * A segment with no '=' at all is dropped rather than throwing: malformed
 * junk in an unrecognized position is exactly the kind of thing the
 * "ignore unknown attributes" duty already commits this parser to
 * tolerating, not a new leniency invented here.
 */
function parseAttrs(msg: string): Map<string, string> {
	const attrs = new Map<string, string>();
	if (msg.length === 0) {
		return attrs;
	}
	for (const part of msg.split(",")) {
		const eq = part.indexOf("=");
		if (eq < 0) {
			continue;
		}
		attrs.set(part.slice(0, eq), part.slice(eq + 1));
	}
	return attrs;
}

type Phase =
	"start" | "awaiting-server-first" | "awaiting-server-final" | "done";

/**
 * ScramMechanism implements the SCRAM-SHA-1 and SCRAM-SHA-256 SASL mechanisms
 */
export class ScramMechanism implements SaslMechanism {
	readonly name: string;
	/** Never sends the password itself over the wire (a zero-knowledge-style
	 *  proof, same class of reasoning as `CramMd5Mechanism` — see that
	 *  file's doc comment for the full rationale distinguishing this flag
	 *  from cryptographic strength). */
	readonly requiresSecureTransport = false;

	private readonly algo: ScramHashAlgo;
	private readonly nonceFactory: () => string;

	private phase: Phase = "start";
	private clientNonce = "";
	private gs2Header = "";
	private clientFirstMessageBare = "";
	private authMessage = "";
	private expectedServerSignature: Buffer | null = null;
	/** Set by `step()` when the server-final-message either fails to verify
	 *  or reports an error; consumed (and thrown) by `finish()` — see this
	 *  module's doc comment for why the verdict is rendered there. */
	private verificationFailure: string | null = null;
	/** PR #18 review fix (Critical #1): `true` ONLY once a genuine, matching
	 *  "v=" ServerSignature has actually been observed (by `step()`'s
	 *  `handleServerFinal`, or by `finish()` itself parsing its `data`
	 *  parameter as a last resort) — the sole condition under which
	 *  `finish()` is allowed to resolve. Reset per-attempt in `start()`
	 *  exactly like `verificationFailure` (see this class's own
	 *  `ScramMechanismOptions` doc comment on reuse safety). */
	private verified = false;

	constructor(algo: ScramHashAlgo, opts: ScramMechanismOptions = {}) {
		this.algo = algo;
		this.name = algo === "sha1" ? "SCRAM-SHA-1" : "SCRAM-SHA-256";
		this.nonceFactory = opts.nonce ?? defaultNonce;
	}

	async start(ctx: SaslContext): Promise<Buffer> {
		if (!ctx.pass) {
			throw mechanismAuthError(
				this.name,
				`${this.name} requires pass (missing from SaslContext)`,
			);
		}
		// RFC5802-3-2/-5.1-3: this library does not implement full RFC 3454
		// stringprep/SASLprep (RFC 4013) — a genuine prohibited-character/
		// bidi-checking implementation is out of scope for this milestone.
		// Per §2.2's own disjunctive MUST ("implementations MUST either
		// implement SASLprep or disallow use of non US-ASCII Unicode
		// codepoints in 'str'"), Unicode NFKC normalization (the
		// normalization form SASLprep's mapping step is itself built on) is
		// applied as a practical, honest partial measure: a caller-supplied
		// username that merely differs by Unicode compatibility-equivalence
		// (e.g. "½" vs "1⁄2") is never forwarded to the wire raw/unprepared.
		const preparedUser = ctx.user.normalize("NFKC");

		// No channel-binding support, ever (see this module's doc comment) —
		// gs2-cbind-flag is always "n" (RFC5802-6-3), never "y"/"p".
		//
		// LOW fix (second-review round): the SAME §2.2 disjunctive-MUST/NFKC
		// reasoning just above applies equally to the gs2-header's `a=`
		// authzid (RFC5802-5.1-1: "the same as that of the 'n' field") — it
		// is, per RFC 4422 §2, an "authzid" string subject to the identical
		// SASLprep profile as the authentication identity. Previously only
		// `ctx.user` was NFKC-normalized before escaping; `ctx.authzid` was
		// forwarded raw, an inconsistency with no principled reason (both
		// fields share one prepare-then-escape step here).
		const authzid = ctx.authzid
			? `a=${escapeSaslname(ctx.authzid.normalize("NFKC"))}`
			: "";
		this.gs2Header = `n,${authzid},`;
		this.clientNonce = this.nonceFactory();
		this.clientFirstMessageBare = `n=${escapeSaslname(preparedUser)},r=${this.clientNonce}`;
		this.phase = "awaiting-server-first";
		// PR #18 review fix (High #8): per-attempt verification state MUST be
		// reset here too, not just the client-first-message fields above — a
		// caller-supplied `SaslMechanism` instance (`ImapAuthConfig.mechanisms`
		// as a literal object, see this file's own `ScramMechanismOptions` doc
		// comment) is reused verbatim across every attempt/reconnect, and a
		// stale `verificationFailure`/`verified` from a PRIOR attempt must
		// never leak into this one.
		this.verificationFailure = null;
		this.verified = false;
		return Buffer.from(
			this.gs2Header + this.clientFirstMessageBare,
			"utf8",
		);
	}

	async step(challenge: Buffer, ctx: SaslContext): Promise<Buffer> {
		if (!ctx.pass) {
			throw mechanismAuthError(
				this.name,
				`${this.name} requires pass (missing from SaslContext)`,
			);
		}
		const text = challenge.toString("utf8");
		if (this.phase === "awaiting-server-first") {
			return this.handleServerFirst(text, ctx.pass);
		}
		if (this.phase === "awaiting-server-final") {
			return this.handleServerFinal(text);
		}
		throw mechanismAuthError(
			this.name,
			`${this.name} received an unexpected server challenge in phase '${this.phase}'`,
		);
	}

	private handleServerFirst(text: string, pass: string): Buffer {
		const attrs = parseAttrs(text);
		// RFC5802-5.1-5/-5.1-15: this version of SCRAM defines no mandatory
		// extension — any "m=" the server sends is by definition unsupported
		// and MUST cause authentication failure. Detected before a client-
		// final-message would ever be computed/sent, so this aborts
		// synchronously (mapped to the "*" cancellation by the AUTHENTICATE
		// command, RFC5802-5.1-8's own cited precedent for this shape).
		if (attrs.has("m")) {
			throw mechanismAuthError(
				this.name,
				`${this.name} server-first-message carries an unsupported mandatory 'm=' extension`,
			);
		}
		const combinedNonce = attrs.get("r");
		const saltB64 = attrs.get("s");
		const iterText = attrs.get("i");
		if (
			combinedNonce === undefined ||
			saltB64 === undefined ||
			iterText === undefined
		) {
			throw mechanismAuthError(
				this.name,
				`${this.name} server-first-message is missing a required 'r='/'s='/'i=' attribute`,
			);
		}
		// RFC5802-5.1-8: "The client MUST verify that the initial part of the
		// nonce ... is the same as the nonce it initially specified" — a
		// mismatch (nonce-substitution/injection) MUST abort before a
		// client-final-message is ever computed against it.
		if (!combinedNonce.startsWith(this.clientNonce)) {
			throw mechanismAuthError(
				this.name,
				`${this.name} server-first-message nonce does not echo the client's own nonce as its prefix`,
			);
		}
		const iterations = Number.parseInt(iterText, 10);
		if (
			!Number.isInteger(iterations) ||
			iterations <= 0 ||
			String(iterations) !== iterText
		) {
			throw mechanismAuthError(
				this.name,
				`${this.name} server-first-message carries an invalid iteration count '${iterText}'`,
			);
		}
		// PR #18 review fix (Medium, unbounded PBKDF2 iteration count): reject
		// an oversized 'i=' BEFORE the expensive/blocking `pbkdf2Sync` call
		// below ever runs — see `MAX_SCRAM_ITERATIONS`'s own doc comment for
		// the bound's rationale. A malicious/compromised server supplying an
		// absurd iteration count (e.g. 99999999) would otherwise block the
		// event loop for however long that many HMAC iterations take.
		if (iterations > MAX_SCRAM_ITERATIONS) {
			throw mechanismAuthError(
				this.name,
				`${this.name} server-first-message carries an iteration count ` +
					`'${iterText}' exceeding this client's maximum of ${MAX_SCRAM_ITERATIONS} ` +
					"(refusing to run PBKDF2 with an unbounded, server-controlled cost)",
			);
		}
		// `Buffer.from(str, "base64")` never throws (Node decodes leniently) --
		// a malformed value simply produces a salt that won't reproduce the
		// server's expected SaltedPassword, which is a wire-level PBKDF2/HMAC
		// mismatch handled the same way any other authentication failure is.
		const salt = Buffer.from(saltB64, "base64");

		// RFC5802-3-1/-3-2: password MUST be UTF-8 (Node's crypto functions
		// treat a string argument as UTF-8 by default) — the same disjunctive-
		// MUST NFKC treatment `start()` applies to the username.
		const preparedPass = pass.normalize("NFKC");
		const saltedPassword = pbkdf2Sync(
			preparedPass,
			salt,
			iterations,
			HASH_LEN[this.algo],
			this.algo,
		);

		// RFC5802-5.1-9/-5.1-10: 'c=' is REQUIRED and is the base64 of the
		// client-first-message's own gs2-header (no channel-binding data
		// ever appended, since this client never uses channel binding).
		const clientFinalWithoutProof = `c=${Buffer.from(this.gs2Header, "utf8").toString("base64")},r=${combinedNonce}`;
		// §3: AuthMessage is the literal concatenation of the exact message
		// strings exchanged so far — `text` here is the server's message
		// VERBATIM (extensions and all), not a reconstructed/canonicalized
		// form, so an unrecognized "extensions" attribute (RFC5802-5.1-16:
		// ignored for parsing purposes) still participates in the MAC exactly
		// as transmitted.
		this.authMessage = `${this.clientFirstMessageBare},${text},${clientFinalWithoutProof}`;

		const clientKey = createHmac(this.algo, saltedPassword)
			.update("Client Key")
			.digest();
		const storedKey = createHash(this.algo).update(clientKey).digest();
		const clientSignature = createHmac(this.algo, storedKey)
			.update(this.authMessage)
			.digest();
		const clientProof = Buffer.alloc(clientKey.length);
		for (let i = 0; i < clientKey.length; i++) {
			clientProof[i] = clientKey[i] ^ clientSignature[i];
		}

		const serverKey = createHmac(this.algo, saltedPassword)
			.update("Server Key")
			.digest();
		this.expectedServerSignature = createHmac(this.algo, serverKey)
			.update(this.authMessage)
			.digest();

		this.phase = "awaiting-server-final";
		return Buffer.from(
			`${clientFinalWithoutProof},p=${clientProof.toString("base64")}`,
			"utf8",
		);
	}

	private handleServerFinal(text: string): Buffer {
		const attrs = parseAttrs(text);
		if (attrs.has("e")) {
			this.verificationFailure = `${this.name} server reported a SCRAM failure: e=${attrs.get("e")}`;
		} else if (attrs.has("v")) {
			// RFC5802-5-3/-5.1-13: compare the server's claimed ServerSignature
			// against the one this client independently computed from the
			// SAME shared secret/AuthMessage — a mismatch (forged/wrong
			// signature) MUST be treated as an unsuccessful exchange, even
			// though the server may go on to send a tagged OK regardless.
			const expected = this.expectedServerSignature;
			// `Buffer.from(str, "base64")` never throws (Node decodes leniently,
			// dropping characters outside the base64 alphabet) -- a malformed
			// value simply produces bytes that will not match `expected`.
			const serverSig = Buffer.from(attrs.get("v") as string, "base64");
			const matches =
				expected !== null &&
				serverSig.length === expected.length &&
				timingSafeEqual(serverSig, expected);
			if (!matches) {
				this.verificationFailure = `${this.name} server signature does not match the client-computed ServerSignature`;
			} else {
				// PR #18 review fix (Critical #1): the ONLY branch that marks a
				// genuine, verified mutual authentication — `finish()` fails
				// closed on every other shape (this file's doc comment, and
				// `finish()`'s own).
				this.verified = true;
			}
		} else if (attrs.has("m")) {
			this.verificationFailure = `${this.name} server-final-message carries an unsupported mandatory 'm=' extension`;
		} else if (text.length > 0) {
			// M5.16 (Finding 4, fail-closed): a NON-EMPTY server-final-message
			// that parses to none of 'e='/'v='/'m=' (garbled/unrecognized) used
			// to fall through here with `verificationFailure` left `null` --
			// indistinguishable from the genuinely-empty/absent case this
			// module's own doc comment documents as tolerated (RFC5802-5.1-14:
			// a server that signals success via the tagged OK alone, never
			// sending 'v='). That tolerance is for NOTHING having been sent, not
			// for something unparseable having been sent: an exchange with no
			// verifiable ServerSignature must never silently resolve as if
			// mutual authentication had actually happened. Fail closed, the
			// same posture as an explicit 'e='/mismatched 'v='.
			this.verificationFailure =
				`${this.name} server-final-message could not be parsed (no ` +
				"recognized 'e='/'v='/'m=' attribute) -- treated as a failed exchange, not tolerated " +
				"as if no server-final-message had been sent at all";
		}
		// A genuinely EMPTY server-final-message (`text === ""`) falls through
		// every branch above with `verificationFailure` left `null` and
		// `verified` left `false` -- PR #18 review fix (Critical #1): this is
		// NOT a tolerated-success shape (see this module's doc comment for why
		// the earlier RFC5802-5.1-14 citation for that was wrong); `finish()`
		// fails closed on it exactly like the "genuinely absent" case (`step()`
		// never called a third time at all).
		//
		// The wire reply to this continuation is always empty, concluding
		// the exchange normally regardless of what was found above — see
		// this module's doc comment for why the actual accept/reject
		// verdict is deferred to `finish()`.
		this.phase = "done";
		return Buffer.alloc(0);
	}

	async finish(data: Buffer | null): Promise<void> {
		if (this.verificationFailure) {
			throw mechanismAuthError(this.name, this.verificationFailure);
		}
		if (this.verified) {
			// A genuine, matching "v=" was already observed by `step()` — the
			// one shape RFC 5802 actually defines as a verified mutual
			// authentication.
			return;
		}
		// PR #18 review fix (Critical #1): nothing was verified via `step()`.
		// Belt-and-suspenders: if the caller (`AuthenticateCommand.accept()`)
		// ever has real tagged-OK extra data to hand over, parse/verify it
		// exactly like an ordinary server-final-message rather than assuming
		// its mere presence means success. Today `authenticate.ts` documents
		// that it has no structured way to distinguish SASL data from
		// ordinary human-readable tagged-OK text and so always passes `null`
		// here — this branch exists so that changes automatically the moment
		// a real source for it exists, without another security review of
		// this class.
		if (data && data.length > 0) {
			this.handleServerFinal(data.toString("utf8"));
			if (this.verificationFailure) {
				throw mechanismAuthError(this.name, this.verificationFailure);
			}
			if (this.verified) {
				return;
			}
		}
		// FAIL CLOSED: a tagged OK arrived (that's the only way `finish()` is
		// ever invoked at all, see this module's doc comment), but no
		// verifiable ServerSignature was EVER presented — neither consumed by
		// `step()` nor supplied here via `data`. RFC 5802 requires "v=" on a
		// genuine success; the server either violated that, or is an active
		// MITM that could not forge the real proof. Either way this MUST NOT
		// be treated as a successfully mutually-authenticated exchange.
		throw mechanismAuthError(
			this.name,
			`${this.name} claimed success (tagged OK) without ever presenting a ` +
				"verifiable server signature ('v='); refusing to treat this as mutual authentication",
		);
	}

	/**
	 * M13 fix (second-review round): mirrors `OAuthBearerMechanism.
	 * describeFailure()`/`XOAuth2Mechanism.describeFailure()` exactly (same
	 * hook, same rationale in `SaslMechanism.describeFailure()`'s own doc
	 * comment). This class's realistic RFC5802-conformant failure shape is a
	 * server-final-message carrying `e=<error>` (RFC5802-5.1-11: "the server
	 * MAY include ... an optional 'e=' ... value" on failure) — sent as an
	 * ordinary "+" continuation, which `step()`/`handleServerFinal()` already
	 * parse and record into `verificationFailure` (along with the mismatched-
	 * 'v='/unsupported-'m='/garbled/absent shapes this class also fails
	 * closed on). BUT that continuation conventionally precedes a tagged
	 * **NO**, not a tagged OK (the same "server-final-message often rides
	 * ahead of the tagged status" ordering this class's own top-of-file doc
	 * comment documents for the tagged-OK/'v=' case) — and `finish()` is only
	 * ever invoked after a tagged OK (`connection/execute-command.ts` routes
	 * NO/BAD to `AuthenticateCommand.onError()` instead, never to
	 * `accept()`/`finish()`). Without this hook, a caller on the realistic
	 * tagged-NO path saw only the server's own (often generic, e.g. "Invalid
	 * credentials") resp-text — the specific SCRAM `e=` diagnostic already
	 * sitting in `verificationFailure` was unreachable. This is diagnostic
	 * ONLY: it does not change the accept/reject decision, which is (and
	 * remains) `finish()`'s alone, and `onError()` folds a non-`undefined`
	 * result into the `AuthError` message rather than treating it as an
	 * independent verdict.
	 */
	describeFailure(): string | undefined {
		return this.verificationFailure ?? undefined;
	}
}

/** Factory for a fresh {@link ScramMechanism} instance keyed to SHA-1 (RFC
 *  5802 SCRAM-SHA-1). Registered under the "SCRAM-SHA-1" name by the
 *  mechanism registry (`registerMechanism()`, `sasl/mechanism.ts`). */
export function createScramSha1Mechanism(
	opts?: ScramMechanismOptions,
): SaslMechanism {
	return new ScramMechanism("sha1", opts);
}

/** Factory for a fresh {@link ScramMechanism} instance keyed to SHA-256
 *  (RFC 7677 SCRAM-SHA-256). Registered under the "SCRAM-SHA-256" name by
 *  the mechanism registry (`registerMechanism()`, `sasl/mechanism.ts`). */
export function createScramSha256Mechanism(
	opts?: ScramMechanismOptions,
): SaslMechanism {
	return new ScramMechanism("sha256", opts);
}
