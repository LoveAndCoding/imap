import { CapabilityError } from "../errors";
import { assertNoRecentFlag } from "../protocol/vocabularies";
import type { Flag } from "../protocol/vocabularies";
import { Command } from "./base";
import { expandUidSet, toTypedResponseCode } from "./collector";
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
 * One CATENATE cat-part (RFC 4469 §3/§5, M3.10): an extended APPEND assembles
 * its message from a parenthesized, non-empty list of these instead of a
 * single literal --
 *  - `{ type: "TEXT"; message }`: `"TEXT" SP literal` -- a literal chunk of
 *    message content, contributed byte-for-byte (same `AppendSource`
 *    Buffer-verbatim/string-UTF-8 rule as the base APPEND message, same
 *    NUL-byte refusal -- see `AppendCommand`'s constructor).
 *  - `{ type: "URL"; url }`: `"URL" SP astring` -- an IMAP URL (RFC 5092)
 *    referencing an existing message or body part to splice in verbatim,
 *    server-side. This library never fetches/validates the URL itself --
 *    that is the server's job (and the source of the `BADURL` resp-code on
 *    failure, see `AppendResult`'s sibling error handling in
 *    `commands/collector.ts`).
 * At least one part is required (RFC4469-3-4, "min-one"); an empty array
 * throws `RangeError` at construction, zero bytes written, before the
 * `CATENATE` capability is even probed.
 */
export type CatenatePart =
	| { type: "TEXT"; message: AppendSource }
	| { type: "URL"; url: string };

/**
 * One message entry in a MULTIAPPEND batch (RFC 3502 §6.3.11 `append-message
 * = [SP flag-list] [SP date-time] SP literal`, M3.10). Each message carries
 * its OWN optional `flags`/`internalDate`/`binary` -- distinct from
 * `AppendOptions`'s single shared set for the whole (single-message)
 * command -- exactly mirroring `AppendOptions`'s own fields one level down,
 * per message. `catenate` is deliberately NOT offered here: RFC 4469 defines
 * CATENATE as a modification to the single `append-data` production (RFC
 * 4469 §5 amends `append-data` itself, not `append-message`'s repetition),
 * and neither RFC formalizes a MULTIAPPEND batch whose individual messages
 * are themselves CATENATE-assembled -- combine the two only via
 * `ImapClient.append()`'s own `catenate` option (a single message), not
 * through `appendMany()`.
 */
export interface AppendMessageEntry {
	message: AppendSource;
	flags?: Flag[];
	internalDate?: Date;
	binary?: boolean;
}

/**
 * Options for APPEND (spec §3.2, M2.11/M3.10). `flags`/`internalDate` are the
 * optional `(flags) date-time` prefix RFC 3501/9051 §6.3.11/§6.3.12 the
 * command may carry before the message literal; `binary` requests the RFC
 * 3516 `literal8` (`~{n}`) wire form (needed for a message containing NUL
 * octets a server has BINARY-declared support for decoding -- see
 * `AppendSource`'s doc comment for why this library never does that
 * encoding decision FOR the caller). `catenate` (RFC 4469, M3.10) replaces
 * the plain message literal with an assembled TEXT/URL part list -- see
 * `CatenatePart`'s doc comment; when present, the top-level `message`
 * argument to `ImapClient.append()`/`AppendCommand`'s constructor is not put
 * on the wire (a caller passing `catenate` conventionally passes
 * `Buffer.alloc(0)` as the now-unused `message` argument).
 */
export interface AppendOptions {
	/** `(flags)` parameter (RFC 3501/9051 §9 `flag-list`). Never include
	 *  `\Recent` -- it cannot be set by the client, and RFC 3501 §2.3.2
	 *  explicitly names APPEND: "can not be used as an argument in a STORE
	 *  or APPEND command" (RFC3501-2.3.2-2). A flag list containing
	 *  `\Recent` (case-insensitive) throws `RangeError` at construction,
	 *  zero bytes written, same refuse-don't-transform posture as this
	 *  command's own NUL-byte refusal above. HISTORY: M2.11 originally
	 *  documented the opposite (pass-through, "the server may reject") --
	 *  that posture was SUPERSEDED at the M3.6 adjudication (see
	 *  docs/compliance-adjudications.md): the catalog rows are client-side
	 *  MUST NOTs operationalized as "no such attempt appears in the
	 *  client's command stream", and the earlier pass-through reading was
	 *  never actually exercised against a `\Recent` flag (the passing
	 *  APPEND compliance test drives no flags at all). */
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
	 *  ask. Ignored (never consulted) when `catenate` is present -- RFC 4469
	 *  CATENATE's TEXT cat-parts are plain literals, never literal8. */
	binary?: boolean;
	/** RFC 4469 CATENATE (M3.10): assemble the message from TEXT/URL parts
	 *  instead of a single literal -- see `CatenatePart`. Gated on the
	 *  `CATENATE` capability: `CapabilityError`, zero bytes written, when
	 *  absent (I-9). */
	catenate?: CatenatePart[];
}

/**
 * Result of a successful APPEND (spec §5.4): `APPENDUID` (RFC 4315 UIDPLUS)
 * surfaces the new message's `uidValidity`/`uid`. Both stay `undefined` --
 * never a thrown error -- when the server lacks UIDPLUS (a missing OPTIONAL
 * capability's absence is not a failure, I-6/I-9's shared spirit).
 *
 * MULTIAPPEND (M3.10): `ImapClient.appendMany()` returns `AppendResult[]`,
 * one entry per appended message, in append order -- RFC 4315 §3's
 * `resp-code-apnd = "APPENDUID" SP nz-number SP uid-set` widens for a
 * MULTIAPPEND batch to a set covering every appended message
 * (`MultiAppendCommand.accept()` expands that set positionally onto the
 * batch, ascending, per the widened `TypedResponseCode` APPENDUID variant's
 * `uids` field -- see `commands/collector.ts`), rather than adding a
 * separate multi-uid shape to this interface.
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
 * Shared `AppendSource` -> `Buffer` conversion (see that type's doc comment
 * for the Buffer-verbatim/string-UTF-8 rule) -- factored out so
 * `AppendCommand` (the single message, and each CATENATE TEXT part) and
 * `MultiAppendCommand` (each MULTIAPPEND batch entry) apply IDENTICAL
 * validation rather than three copies of the same two `typeof`/`isBuffer`
 * checks. `context` is a short label prefixed to the thrown `RangeError`'s
 * message (e.g. `"APPEND"`, `"APPEND (message 2)"`, `"APPEND (CATENATE TEXT
 * part 1)"`) so a caller can tell which part of a multi-part/multi-message
 * command failed validation.
 */
function toMessageBuffer(message: AppendSource, context: string): Buffer {
	if (Buffer.isBuffer(message)) {
		return message;
	}
	if (typeof message === "string") {
		return Buffer.from(message, "utf8");
	}
	throw new RangeError(`${context}: message must be a Buffer or a string`);
}

/**
 * Shared NUL-byte refusal (RFC 3501/9051 §4.3.1, see `AppendSource`'s doc
 * comment for the full rationale) -- `binary` is the caller's `{ binary:
 * true }` opt-out (RFC 3516 literal8), skipping the check entirely.
 */
function assertNoUnencodedNul(data: Buffer, binary: boolean, context: string): void {
	if (!binary && data.includes(0x00)) {
		throw new RangeError(
			`${context}: message contains a NUL byte (0x00) -- binary content must be ` +
				"caller-encoded (e.g. base64) or sent as a literal8 via { binary: true } " +
				"(RFC 3516), never transmitted unencoded (RFC 3501/9051 §4.3.1)",
		);
	}
}

/** One validated CATENATE cat-part, post-construction (see `CatenatePart`
 *  above for the pre-validation caller-facing shape). TEXT parts have already
 *  been through `toMessageBuffer()`/`assertNoUnencodedNul()`; URL parts are
 *  carried verbatim (this library never validates/resolves the URL itself --
 *  the server does, surfacing `BADURL` on failure). */
type ValidatedCatenatePart = { type: "TEXT"; data: Buffer } | { type: "URL"; url: string };

/**
 * APPEND (RFC 3501 §6.3.11 / RFC 9051 §6.3.12), extended by RFC 4469
 * CATENATE (M3.10, `opts.catenate`) -- single MESSAGE form (one
 * `append-message`/`append-data` group); MULTIAPPEND's repetition of this
 * group (RFC 3502, `appendMany`) is `MultiAppendCommand` below, a SIBLING
 * class rather than a variant of this one (mirrors `ImapClient.appendMany()`
 * being a sibling method of `ImapClient.append()`, not a parameter variant --
 * see that method's doc comment for the shared rationale: MULTIAPPEND's
 * multi-message result shape, `AppendResult[]`, is different enough from
 * this class's single `AppendResult` that folding both into one class would
 * need a runtime-shape-dependent return type). CATENATE, by contrast, stays
 * on THIS class: RFC 4469 §5 amends the single-message `append-data`
 * production itself (replacing one literal with a TEXT/URL part list), so a
 * CATENATE-assembled message is still exactly one `append-message` group --
 * the same shape MULTIAPPEND repeats, not a variant of the repetition.
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
 * Wire form: `mailbox [(flags)] [date-time] <message>`, where `<message>` is
 * either a plain/literal8 literal (`CommandWriter.literal(data, {binary})`),
 * the RFC 6855 §4 `"UTF8 (" literal8 ")"` data extension when the message
 * contains 8-bit header/body octets AND the server has UTF8=ACCEPT enabled
 * (RFC6855-4-1), OR -- when `opts.catenate` is given -- the RFC 4469 §5
 * `"CATENATE (" cat-part *(SP cat-part) ")"` extended form (mutually
 * exclusive with the first two; see `write()`).
 */
export class AppendCommand extends Command<AppendResult> {
	readonly verb = "APPEND";
	readonly queueMode = "pipeline" as const;
	readonly states = ["authenticated", "selected"] as const;

	private readonly data: Buffer;
	private readonly catenateParts: readonly ValidatedCatenatePart[] | null;

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
		// The top-level `message` argument is still type-validated even when
		// `opts.catenate` is present (a caller must still pass a well-formed
		// `AppendSource`, conventionally `Buffer.alloc(0)`) but its BYTES are
		// never put on the wire in that case -- `write()` emits the CATENATE
		// part list instead, and the NUL-byte refusal below is skipped for
		// this now-unused buffer (each CATENATE TEXT part gets its OWN NUL
		// check below instead).
		this.data = toMessageBuffer(message, "APPEND");

		if (this.opts.catenate) {
			// RFC4469-3-4 (min-one): at least one cat-part is required -- "CATENATE
			// ()" is not a legal wire form. Refuse (RangeError, zero bytes) before
			// the capability probe below, same "validate content before checking
			// the network" ordering `StoreCommand`'s UNCHANGEDSINCE gate uses.
			if (!Array.isArray(this.opts.catenate) || this.opts.catenate.length === 0) {
				throw new RangeError(
					"APPEND: catenate must be a non-empty array (RFC 4469 §3/§5 " +
						"requires at least one cat-part)",
				);
			}
			// RFC 4469 §2: CATENATE is its own capability, gating the extended
			// append-data form -- CapabilityError, zero bytes written (I-9),
			// before any TEXT/URL part is even validated.
			if (!this.caps.has("CATENATE")) {
				throw new CapabilityError(
					"APPEND: the catenate option requires the CATENATE capability " +
						"(RFC 4469 §2) -- construct without `catenate` (a plain message " +
						"literal) if the server hasn't advertised it",
					{ capability: "CATENATE", rfc: "RFC4469" },
				);
			}
			this.catenateParts = this.opts.catenate.map((part, i): ValidatedCatenatePart => {
				if (part.type === "URL") {
					if (typeof part.url !== "string") {
						throw new RangeError(
							`APPEND: catenate[${i}] (URL) must carry a string url`,
						);
					}
					return { type: "URL", url: part.url };
				}
				const data = toMessageBuffer(part.message, `APPEND (CATENATE TEXT part ${i + 1})`);
				// RFC 4469's `text-literal` is a plain literal, never literal8 --
				// this library has no `{ binary: true }` escape hatch for a
				// CATENATE TEXT part (unlike the single-message case below), so
				// the NUL refusal always applies here.
				assertNoUnencodedNul(data, false, `APPEND (CATENATE TEXT part ${i + 1})`);
				return { type: "TEXT", data };
			});
		} else {
			this.catenateParts = null;
			// RFC 3501/9051 §4.3.1: binary (NUL-bearing) data MUST be encoded into
			// a textual form before transmission; this client never transmits a
			// string/literal containing an unencoded NUL byte. Refuse (do not
			// silently transform) at construction -- `opts.binary` is the
			// caller's explicit opt-out, requesting the RFC 3516 literal8
			// (`~{n}`) wire form that legitimately carries NUL octets to a
			// BINARY-capable server.
			assertNoUnencodedNul(this.data, this.opts.binary === true, "APPEND");
		}
		// RFC 3501 §2.3.2 (RFC3501-2.3.2-1/-2): \Recent can never appear in a
		// client-sent flag list; §2.3.2 names APPEND explicitly. Refuse
		// (RangeError, zero bytes) at construction -- see AppendOptions.flags's
		// doc comment for the M3.6 adjudication that superseded M2.11's
		// original pass-through posture (docs/compliance-adjudications.md).
		if (this.opts.flags) {
			assertNoRecentFlag(this.opts.flags, this.verb);
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
		// motivating waste). Applies uniformly to every literal this command
		// may emit below (plain, UTF8(...)-wrapped, or CATENATE TEXT parts)
		// since all carry the same waste risk.
		const forceSync = !this.caps.knownAppendLimit();

		if (this.catenateParts) {
			// RFC 4469 §5: "CATENATE" SP "(" cat-part *(SP cat-part) ")". A URL
			// cat-part is technically an `astring` (bare atom is legal grammar),
			// but every RFC 4469 worked example quotes it (§4.1's own sample) --
			// `quotedOrLiteral()` matches that idiom by never emitting a bare
			// atom for a URL, unlike `astring()`/`mailbox()` elsewhere in this
			// writer, which prefer the bare form when legal.
			w.atom("CATENATE");
			w.list((inner) => {
				for (const part of this.catenateParts!) {
					if (part.type === "TEXT") {
						inner.atom("TEXT");
						inner.literal(part.data, { forceSync });
					} else {
						inner.atom("URL");
						inner.quotedOrLiteral(part.url);
					}
				}
			});
			return;
		}

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

/**
 * MULTIAPPEND (RFC 3502 §6.3.11, M3.10) -- a SIBLING of `AppendCommand`
 * (see that class's doc comment for why), covering the `1*append-message`
 * repetition: one `APPEND mailbox` command carrying two or more
 * `[flags] [date-time] literal` groups, each with its own independent
 * optional flags/date (`AppendMessageEntry`).
 *
 * **One-message degrade decision:** this class accepts a single-entry
 * `messages` array too (constructing it directly is legal and produces the
 * exact same wire form `AppendCommand` would for that one message), but
 * `ImapClient.appendMany()` never actually reaches this class for a
 * single-message call -- it degrades to `this.append(...)` (plain
 * `AppendCommand`) instead, wrapping that single `AppendResult` in a
 * one-element array. Rationale: RFC 3502's `1*append-message` grammar makes
 * a one-message "batch" indistinguishable on the wire from a base APPEND
 * (both are exactly one `append-message` group), so gating a single-message
 * `appendMany()` call on the MULTIAPPEND capability would incorrectly refuse
 * a call the server can satisfy with ZERO extension support -- `appendMany`
 * should only ever need MULTIAPPEND when it is actually exercising the
 * repetition (>= 2 messages). This class's OWN gate below (`messages.length
 * > 1`) is kept anyway as defense-in-depth for a caller reaching it directly
 * via the `client.run()` escape hatch with a single-entry array.
 *
 * `queueMode`/`states` mirror `AppendCommand` exactly (same verb, same
 * legal states -- MULTIAPPEND changes no client-visible context beyond what
 * a base APPEND already does).
 *
 * Wire form: `mailbox` followed by N `[(flags)] [date-time] literal` groups
 * back-to-back, one per `messages` entry, in order (RFC3502-6.3.11-1).
 *
 * Result: `AppendResult[]`, one entry per message in append order. RFC 4315
 * §3's `APPENDUID` resp-code widens, for a MULTIAPPEND batch, to a `uid-set`
 * covering every appended message (RFC3502-uidplus-1) -- `accept()` expands
 * that set (via `commands/collector.ts`'s widened `TypedResponseCode`
 * APPENDUID variant, `uids`) and pairs it positionally onto `messages`,
 * ascending (UIDs are always allocated in increasing order, so an ascending
 * expansion of the set is the correct append-order pairing). A batch the
 * server fails atomically (RFC3502-intro-1/-6.3.11-3, including an early
 * abort per RFC3502-6.3.11-4) surfaces as this command's promise rejecting
 * with the tagged NO's `ServerNoError` -- no partial `AppendResult[]` is
 * ever produced for a failed batch, consistent with MULTIAPPEND's
 * all-or-nothing semantics.
 */
export class MultiAppendCommand extends Command<AppendResult[]> {
	readonly verb = "APPEND";
	readonly queueMode = "pipeline" as const;
	readonly states = ["authenticated", "selected"] as const;

	private readonly entries: ReadonlyArray<{
		data: Buffer;
		flags?: readonly Flag[];
		internalDate?: Date;
		binary: boolean;
	}>;

	constructor(
		private readonly mailboxName: string,
		messages: readonly AppendMessageEntry[],
		private readonly caps: AppendCapabilityProbe = NO_CAPS,
	) {
		super();
		if (typeof mailboxName !== "string") {
			throw new RangeError("APPEND (MULTIAPPEND): mailbox must be a string");
		}
		if (!Array.isArray(messages) || messages.length === 0) {
			throw new RangeError(
				"APPEND (MULTIAPPEND): messages must be a non-empty array",
			);
		}
		// RFC 3502 §2: MULTIAPPEND is its own capability, gating the
		// `1*append-message` repetition beyond a single group -- CapabilityError,
		// zero bytes written (I-9), before any message is validated. A
		// single-entry array needs no MULTIAPPEND support at all (see this
		// class's doc comment's "one-message degrade decision") -- this defends
		// only a direct `client.run()` caller who skipped `ImapClient
		// .appendMany()`'s own degrade path.
		if (messages.length > 1 && !this.caps.has("MULTIAPPEND")) {
			throw new CapabilityError(
				"APPEND (MULTIAPPEND): more than one message requires the " +
					"MULTIAPPEND capability (RFC 3502 §2) -- construct with a single " +
					"message (plain APPEND) if the server hasn't advertised it",
				{ capability: "MULTIAPPEND", rfc: "RFC3502" },
			);
		}
		this.entries = messages.map((entry, i) => {
			const label = `APPEND (MULTIAPPEND message ${i + 1})`;
			const data = toMessageBuffer(entry.message, label);
			assertNoUnencodedNul(data, entry.binary === true, label);
			// RFC 3501 §2.3.2: \Recent refusal applies per-message, exactly like
			// the single-message `AppendCommand` (M3.6 adjudication) -- each
			// MULTIAPPEND message carries its own independent flag list.
			if (entry.flags) {
				assertNoRecentFlag(entry.flags, label);
			}
			return {
				data,
				flags: entry.flags,
				internalDate: entry.internalDate,
				binary: entry.binary === true,
			};
		});
	}

	protected write(w: CommandWriter): void {
		w.mailbox(this.mailboxName);
		// Same RFC7889-4-2 rationale as `AppendCommand.write()` -- applies
		// uniformly to every message literal in the batch.
		const forceSync = !this.caps.knownAppendLimit();
		for (const entry of this.entries) {
			if (entry.flags && entry.flags.length > 0) {
				w.flagList([...entry.flags]);
			}
			if (entry.internalDate) {
				w.dateTime(entry.internalDate);
			}
			// Same RFC6855-4-1 UTF8(...) wrapping decision as `AppendCommand`,
			// applied per-message (a batch may mix 7-bit-clean and 8-bit
			// messages; each is wrapped independently).
			if (this.caps.has("UTF8=ACCEPT") && hasNonAsciiOctet(entry.data)) {
				w.atom("UTF8");
				w.list((inner) => {
					inner.literal(entry.data, { binary: true, forceSync });
				});
			} else {
				w.literal(entry.data, { binary: entry.binary, forceSync });
			}
		}
	}

	protected accept(c: ResponseCollector): AppendResult[] {
		const code = toTypedResponseCode(c.tagged().status.text?.code);
		if (code && code.name === "APPENDUID" && "uidValidity" in code) {
			// `code.uids` is the widened APPENDUID variant's full, ascending
			// uid-set expansion (see `commands/collector.ts`) -- paired
			// positionally onto `this.entries` in append order. A server
			// returning fewer UIDs than messages (non-conformant) tolerates
			// silently (I-6): the trailing entries simply have no `uid`, same
			// as any other server that omits APPENDUID entirely.
			const uids = code.uids;
			return this.entries.map((_entry, i) => ({
				uidValidity: code.uidValidity,
				uid: uids[i],
			}));
		}
		return this.entries.map(() => ({}));
	}
}
