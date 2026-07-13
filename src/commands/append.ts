import type { Flag } from "../protocol/vocabularies";
import { Command } from "./base";
import { toTypedResponseCode } from "./collector";
import type { ResponseCollector } from "./collector";
import type { CommandWriter } from "./writer";

/**
 * APPEND message-source argument (spec §3.2/§5.2, M2.11). Two shapes, two
 * distinct byte-production rules -- there is no third "already encoded"
 * option because a `Buffer` already covers that case:
 *
 *  - `Buffer`: sent **verbatim**, byte-for-byte, through the literal. This
 *    library never MIME-transforms a caller-supplied `Buffer` -- RFC
 *    3501/9051 §4.3.1's "encode binary data before sending" duty is a
 *    MESSAGE-AUTHORING concern the caller's own MIME layer owns, not
 *    something this IMAP client silently does to bytes it was handed. What
 *    this constructor DOES do is refuse (not transform) an unencoded-binary
 *    payload: a NUL byte (0x00) anywhere in the message with `opts.binary`
 *    not set throws a `RangeError` at construction, per §4.3.1's "a
 *    conformant client never sends a string containing NUL bytes" reading
 *    (spec §13 lists content encoding as the caller's job, not something
 *    this library does FOR the caller -- but never transmitting an
 *    unencoded NUL is a promise this library can keep without doing any
 *    encoding itself, by simply refusing to send it). A caller with
 *    NUL-bearing content has two conformant options: pre-encode it (e.g.
 *    base64) into a plain `Buffer`/`string`, or pass `{ binary: true }` to
 *    send it verbatim as an RFC 3516 `literal8` (`~{n}`), which a
 *    BINARY-capable server is expected to accept unencoded.
 *  - `string`: encoded as **UTF-8** (`Buffer.from(message, "utf8")`) before
 *    being sent exactly like the `Buffer` case above (same NUL-refusal
 *    rule applies to the resulting bytes). A caller building a message
 *    from string headers/body gets the natural encoding without having to
 *    wrap every call in `Buffer.from(...)` themselves; a caller that needs
 *    a different transfer encoding (base64, quoted-printable,
 *    Windows-1252, ...) still has the `Buffer` form to hand-produce exactly
 *    the bytes they want.
 *
 * Mailbox-NAME arguments (the separate `mailbox` parameter) go through the
 * M2.1 mUTF-7/UTF-8 codec (`CommandWriter.mailbox()`); this type is the
 * MESSAGE CONTENT argument and never touches that codec -- message bytes
 * pass straight through the literal unchanged, whichever shape was given.
 */
export type AppendSource = Buffer | string;

/**
 * Options for APPEND (spec §3.2, M2.11). `flags`/`internalDate` are the
 * optional `(flags) date-time` prefix RFC 3501/9051 §6.3.11/§6.3.12 the
 * command may carry before the message literal; `binary` requests the RFC
 * 3516 `literal8` (`~{n}`) wire form (needed for a message containing NUL
 * octets a server has BINARY-declared support for decoding -- see
 * `AppendSource`'s doc comment for why this library never does that
 * encoding decision FOR the caller).
 */
export interface AppendOptions {
	/** `(flags)` parameter (RFC 3501/9051 §9 `flag-list`). Never include
	 *  `\Recent` -- it cannot be set by the client (RFC3501-2.3.2-2); this
	 *  module does not pre-filter a caller-supplied `\Recent`, it is passed
	 *  through `CommandWriter.flagList()`'s ordinary flag-syntax validation
	 *  like any other flag (rejecting it outright would be inventing a
	 *  restriction distinct from "the server may reject" -- a judgment call
	 *  consistent with this module's usual server-enforces posture). */
	flags?: Flag[];
	/** `date-time` parameter (RFC 3501/9051 §9 `date-time`), the message's
	 *  INTERNALDATE. Omitted entirely when absent (the server assigns the
	 *  current date/time). */
	internalDate?: Date;
	/** RFC 3516 `literal8` (`~{n}`) framing for the message literal, for
	 *  NUL-containing/binary payloads a BINARY-capable server can decode.
	 *  Independent of the RFC 6855 UTF8 data-extension framing below --
	 *  both are literal8 under the hood, but UTF8(...) wrapping is a
	 *  capability-and-content-driven decision this command makes for the
	 *  caller (see `write()`), while `binary` is the caller's own explicit
	 *  ask. */
	binary?: boolean;
}

/**
 * Result of a successful APPEND (spec §5.4): `APPENDUID` (RFC 4315 UIDPLUS)
 * surfaces the new message's `uidValidity`/`uid`. Both stay `undefined` --
 * never a thrown error -- when the server lacks UIDPLUS (a missing OPTIONAL
 * capability's absence is not a failure, I-6/I-9's shared spirit).
 */
export interface AppendResult {
	uidValidity?: number;
	uid?: number;
}

/**
 * The minimal capability read surface `AppendCommand` needs -- NOT
 * structurally satisfied by bare `CapabilityView` (src/client/capabilities.ts)
 * alone (see `knownAppendLimit()` below); `ImapClient` wires a small adapter
 * over its own registry rather than passing `capabilityRegistry.view`
 * directly. Mirrors `ListCapabilityProbe`/`StatusCapabilityProbe`'s own
 * pattern so this module has no dependency on the client layer. Used for two
 * wire-form decisions (see `write()`):
 *  - whether the message literal must be wrapped in the RFC 6855
 *    `"UTF8 (" literal8 ")"` data extension (`has("UTF8=ACCEPT")`);
 *  - whether a non-synchronizing LITERAL+/LITERAL- literal is avoided
 *    per RFC7889-4-2 (`knownAppendLimit()`).
 */
export interface AppendCapabilityProbe {
	has(cap: string): boolean;
	/**
	 * RFC 7889 §4 (RFC7889-4-2): "A client SHOULD avoid use of
	 * non-synchronizing literals [RFC7888] when the maximum upload size
	 * supported by the IMAP server is unknown." `true` once the server's
	 * upload ceiling is actually known to the caller -- concretely, the
	 * catalog reads this as EITHER the global valued `APPENDLIMIT=<number>`
	 * capability form, OR a mailbox-specific limit the caller has separately
	 * discovered via STATUS/LIST (this class has no visibility into the
	 * latter -- it only ever sees the capability-level signal). `false` (the
	 * conservative default -- see `NO_CAPS`) covers both "no APPENDLIMIT
	 * capability at all" and "bare APPENDLIMIT" (per-mailbox, requires a
	 * STATUS/LIST round trip this class doesn't perform): in both cases the
	 * ceiling is unknown from where this class sits, so `write()` avoids the
	 * non-synchronizing form regardless of what LITERAL+/LITERAL- would
	 * otherwise permit -- this SHOULD outranks the ordinary capability-driven
	 * literal-form eagerness (spec §7.2) precisely when the limit is unknown.
	 */
	knownAppendLimit(): boolean;
}

const NO_CAPS: AppendCapabilityProbe = { has: () => false, knownAppendLimit: () => false };

/** `true` when `data` contains at least one octet outside 7-bit US-ASCII. */
function hasNonAsciiOctet(data: Buffer): boolean {
	for (let i = 0; i < data.length; i++) {
		if (data[i] > 0x7f) {
			return true;
		}
	}
	return false;
}

/**
 * APPEND (RFC 3501 §6.3.11 / RFC 9051 §6.3.12) -- M2.11, single-message form
 * only. MULTIAPPEND (RFC 3502, `appendMany`) and CATENATE (RFC 4469,
 * TEXT/URL cat-parts) are explicitly out of scope for this milestone (M3) --
 * this class has no `catenate` option and never emits the extended
 * `CATENATE (...)` append-data form.
 *
 * `queueMode: "pipeline"` -- spec §6.1's serial list is SELECT/EXAMINE/
 * CLOSE/UNSELECT (mailbox-context switches), EXPUNGE, COPY/MOVE, and LOGIN;
 * APPEND changes no client-visible context and references no message
 * sequence numbers, so (same reasoning as `CreateCommand`/`RenameCommand`)
 * it may share a pipeline context with other in-flight pipeline commands.
 *
 * `states: ["authenticated", "selected"]`: RFC 3501/9051 list APPEND among
 * the authenticated-state commands, legal while a mailbox is selected too
 * (selected is authenticated-plus) -- confirmed by the compliance suite's
 * RFC3501-6.3.11-2/RFC9051-6.3.12-2 rows, which APPEND to the currently
 * selected mailbox.
 *
 * Wire form: `mailbox [(flags)] [date-time] <message>`, where `<message>`
 * is either a plain/literal8 literal (`CommandWriter.literal(data,
 * {binary})`) or, when the message contains 8-bit header/body octets AND
 * the server has UTF8=ACCEPT enabled, the RFC 6855 §4 `"UTF8 (" literal8
 * ")"` data extension (RFC6855-4-1) -- see `write()`.
 */
export class AppendCommand extends Command<AppendResult> {
	readonly verb = "APPEND";
	readonly queueMode = "pipeline" as const;
	readonly states = ["authenticated", "selected"] as const;

	private readonly data: Buffer;

	constructor(
		private readonly mailboxName: string,
		message: AppendSource,
		private readonly opts: AppendOptions = {},
		private readonly caps: AppendCapabilityProbe = NO_CAPS,
	) {
		super();
		if (typeof mailboxName !== "string") {
			throw new RangeError("APPEND: mailbox must be a string");
		}
		if (Buffer.isBuffer(message)) {
			this.data = message;
		} else if (typeof message === "string") {
			this.data = Buffer.from(message, "utf8");
		} else {
			throw new RangeError("APPEND: message must be a Buffer or a string");
		}
		// RFC 3501/9051 §4.3.1: binary (NUL-bearing) data MUST be encoded into a
		// textual form before transmission; this client never transmits a
		// string/literal containing an unencoded NUL byte. Refuse (do not
		// silently transform) at construction -- `opts.binary` is the caller's
		// explicit opt-out, requesting the RFC 3516 literal8 (`~{n}`) wire form
		// that legitimately carries NUL octets to a BINARY-capable server.
		if (this.opts.binary !== true && this.data.includes(0x00)) {
			throw new RangeError(
				"APPEND: message contains a NUL byte (0x00) -- binary content must be " +
					"caller-encoded (e.g. base64) or sent as a literal8 via { binary: true } " +
					"(RFC 3516), never transmitted unencoded (RFC 3501/9051 §4.3.1)",
			);
		}
	}

	protected write(w: CommandWriter): void {
		w.mailbox(this.mailboxName);
		if (this.opts.flags && this.opts.flags.length > 0) {
			w.flagList([...this.opts.flags]);
		}
		if (this.opts.internalDate) {
			w.dateTime(this.opts.internalDate);
		}

		// RFC7889-4-2: avoid the non-synchronizing LITERAL+/LITERAL- form for
		// the message literal when the server's upload-size ceiling is
		// unknown -- this SHOULD outranks `CommandWriter`'s ordinary
		// capability-driven eagerness (spec §7.2), which would otherwise use
		// a non-sync literal purely because LITERAL+/LITERAL- was advertised,
		// with no regard for whether an oversized message might get sent in
		// full before the server can reject it with TOOBIG (RFC 7889 §1's
		// motivating waste). Applies uniformly to both wire forms below (the
		// plain literal and the UTF8(...)-wrapped literal8) since both carry
		// the same message bytes and the same waste risk.
		const forceSync = !this.caps.knownAppendLimit();

		// RFC 6855 §4 (RFC6855-4-1): a message carrying UTF-8 header octets
		// MUST be sent through the "UTF8 (" literal8 ")" data extension once
		// UTF8=ACCEPT is enabled -- this is a distinct decision from the
		// caller's own `opts.binary` ask (both end up as a literal8 on the
		// wire, but this wrapping is automatic/content-driven, not
		// caller-requested). A 7-bit-clean message never needs the wrapper
		// even with UTF8=ACCEPT enabled -- the plain literal already carries
		// it faithfully.
		if (this.caps.has("UTF8=ACCEPT") && hasNonAsciiOctet(this.data)) {
			w.atom("UTF8");
			w.list((inner) => {
				inner.literal(this.data, { binary: true, forceSync });
			});
			return;
		}

		w.literal(this.data, { binary: this.opts.binary === true, forceSync });
	}

	protected accept(c: ResponseCollector): AppendResult {
		// APPEND defines no untagged response data of its own; the sole
		// result payload is the tagged OK's optional APPENDUID code (RFC
		// 4315 UIDPLUS). Absent entirely -> both fields stay `undefined`,
		// never a thrown error (a missing OPTIONAL capability's absence is
		// not a failure).
		const code = toTypedResponseCode(c.tagged().status.text?.code);
		// The open fallback member of `TypedResponseCode` types its `name` as
		// bare `string`, which overlaps the `"APPENDUID"` literal enough that
		// `===` alone doesn't narrow the union -- the `in` check below is
		// what actually discriminates (an `uidValidity` field only exists on
		// the APPENDUID variant), and doubles as the runtime-safe guard.
		if (code && code.name === "APPENDUID" && "uidValidity" in code) {
			return { uidValidity: code.uidValidity, uid: code.uid };
		}
		return {};
	}
}
