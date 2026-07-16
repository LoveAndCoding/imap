import { createHash, createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

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
 *      `phase` stays "awaiting-server-final" forever): legal on failure
 *      (RFC5802-5.1-14) and also what a server that only signals success via
 *      the tagged OK, without ever sending "v=", produces. Nothing was ever
 *      received to verify — `finish()` has no verdict to render and resolves
 *      normally.
 *   2. EMPTY continuation (`step()` called with a zero-length challenge,
 *      `text === ""`): the same tolerance as case 1 — some servers signal
 *      everything through the tagged OK and send only a bare "+" here.
 *   3. NON-EMPTY but unparseable (some bytes arrived, but none of
 *      "e="/"v="/"m=" could be found): this must NOT collapse into cases 1/2
 *      — something was sent and it wasn't a verifiable ServerSignature, so
 *      `finish()` must reject (fail closed), the same posture as an explicit
 *      "e=" or a mismatched "v=". Before this fix, a garbled non-empty
 *      server-final-message left `verificationFailure` unset and `finish()`
 *      resolved as if case 1/2 applied — silently accepting an exchange with
 *      no verified mutual authentication at all.
 */

export type ScramHashAlgo = "sha1" | "sha256";

/** PBKDF2/HMAC/H() output length in bytes for each supported digest. */
const HASH_LEN: Record<ScramHashAlgo, number> = { sha1: 20, sha256: 32 };

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
	 *  safe under reuse regardless (`start()` reinitializes every piece of
	 *  per-attempt state: `gs2Header`, `clientNonce`,
	 *  `clientFirstMessageBare`, `phase`, `authMessage`,
	 *  `expectedServerSignature`, `verificationFailure`), so this specific
	 *  class has no bug here -- but the CONTRACT as stated was wrong for the
	 *  caller-supplied-instance path, and any FUTURE `SaslMechanism`
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

type Phase = "start" | "awaiting-server-first" | "awaiting-server-final" | "done";

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

	constructor(algo: ScramHashAlgo, opts: ScramMechanismOptions = {}) {
		this.algo = algo;
		this.name = algo === "sha1" ? "SCRAM-SHA-1" : "SCRAM-SHA-256";
		this.nonceFactory = opts.nonce ?? defaultNonce;
	}

	async start(ctx: SaslContext): Promise<Buffer> {
		if (!ctx.pass) {
			throw mechanismAuthError(this.name, `${this.name} requires pass (missing from SaslContext)`);
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
		const authzid = ctx.authzid ? `a=${escapeSaslname(ctx.authzid)}` : "";
		this.gs2Header = `n,${authzid},`;
		this.clientNonce = this.nonceFactory();
		this.clientFirstMessageBare = `n=${escapeSaslname(preparedUser)},r=${this.clientNonce}`;
		this.phase = "awaiting-server-first";
		return Buffer.from(this.gs2Header + this.clientFirstMessageBare, "utf8");
	}

	async step(challenge: Buffer, ctx: SaslContext): Promise<Buffer> {
		if (!ctx.pass) {
			throw mechanismAuthError(this.name, `${this.name} requires pass (missing from SaslContext)`);
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
		if (combinedNonce === undefined || saltB64 === undefined || iterText === undefined) {
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
		if (!Number.isInteger(iterations) || iterations <= 0 || String(iterations) !== iterText) {
			throw mechanismAuthError(
				this.name,
				`${this.name} server-first-message carries an invalid iteration count '${iterText}'`,
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
		const saltedPassword = pbkdf2Sync(preparedPass, salt, iterations, HASH_LEN[this.algo], this.algo);

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

		const clientKey = createHmac(this.algo, saltedPassword).update("Client Key").digest();
		const storedKey = createHash(this.algo).update(clientKey).digest();
		const clientSignature = createHmac(this.algo, storedKey).update(this.authMessage).digest();
		const clientProof = Buffer.alloc(clientKey.length);
		for (let i = 0; i < clientKey.length; i++) {
			clientProof[i] = clientKey[i] ^ clientSignature[i];
		}

		const serverKey = createHmac(this.algo, saltedPassword).update("Server Key").digest();
		this.expectedServerSignature = createHmac(this.algo, serverKey).update(this.authMessage).digest();

		this.phase = "awaiting-server-final";
		return Buffer.from(`${clientFinalWithoutProof},p=${clientProof.toString("base64")}`, "utf8");
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
				expected !== null && serverSig.length === expected.length && timingSafeEqual(serverSig, expected);
			if (!matches) {
				this.verificationFailure = `${this.name} server signature does not match the client-computed ServerSignature`;
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
			this.verificationFailure = `${this.name} server-final-message could not be parsed (no ` +
				"recognized 'e='/'v='/'m=' attribute) -- treated as a failed exchange, not tolerated " +
				"as if no server-final-message had been sent at all";
		}
		// A genuinely EMPTY server-final-message (`text === ""`) falls through
		// every branch above with `verificationFailure` left as-is (`null` on
		// first arrival here) -- this is the one case that keeps the
		// documented tolerance: some servers send an empty "+" continuation
		// here and signal everything through the tagged OK alone, which
		// `finish()` treats identically to the message never having arrived.
		//
		// The wire reply to this continuation is always empty, concluding
		// the exchange normally regardless of what was found above — see
		// this module's doc comment for why the actual accept/reject
		// verdict is deferred to `finish()`.
		this.phase = "done";
		return Buffer.alloc(0);
	}

	async finish(): Promise<void> {
		if (this.verificationFailure) {
			throw mechanismAuthError(this.name, this.verificationFailure);
		}
		// No server-final-message was ever presented — legal on failure
		// (RFC5802-5.1-14) and also the shape a server that signals success
		// via the tagged OK alone (never sending "v=") produces. Nothing was
		// received to verify, so this is not itself a rejection: `finish()`
		// only ever rejects a verdict it actually computed.
	}
}

/** Factory for a fresh {@link ScramMechanism} instance keyed to SHA-1 (RFC
 *  5802 SCRAM-SHA-1). Registered under the "SCRAM-SHA-1" name by the
 *  mechanism registry (`registerMechanism()`, `sasl/mechanism.ts`). */
export function createScramSha1Mechanism(opts?: ScramMechanismOptions): SaslMechanism {
	return new ScramMechanism("sha1", opts);
}

/** Factory for a fresh {@link ScramMechanism} instance keyed to SHA-256
 *  (RFC 7677 SCRAM-SHA-256). Registered under the "SCRAM-SHA-256" name by
 *  the mechanism registry (`registerMechanism()`, `sasl/mechanism.ts`). */
export function createScramSha256Mechanism(opts?: ScramMechanismOptions): SaslMechanism {
	return new ScramMechanism("sha256", opts);
}
