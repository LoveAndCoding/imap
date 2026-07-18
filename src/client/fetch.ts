import { Readable } from "stream";

import { ImapError } from "../errors";
import type { LiteralBodyStream } from "../literal-body-stream";
import {
	Address as ParserAddress,
	AddressGroup as ParserAddressGroup,
	AddressList as ParserAddressList,
	EmailId,
	Envelope as ParserEnvelope,
	Fetch,
	GmailLabels,
	GmailMessageId,
	GmailThreadId,
	MessageBodyMultipartStructure,
	MessageBodyStructure,
	Preview,
	SaveDate,
	ThreadId,
	UidFetch,
} from "../parser";

/**
 * Drains a `LiteralBodyStream` (or any Node `Readable`) into a `Buffer` via
 * plain `'readable'`/`'end'`/`'error'` event listeners -- deliberately NOT
 * `for await...of` (a Readable's `Symbol.asyncIterator` implementation
 * calls `stream.destroy()` once iteration concludes, including on normal
 * completion; for a stream that finished (`push(null)`) WITHOUT ever having
 * a consumer attached -- exactly this module's own eager-buffering path,
 * and any `buffer()` call reached after the fact -- that produces a bogus
 * `ERR_STREAM_PREMATURE_CLOSE` from Node's internal `finished()` bookkeeping
 * despite every declared byte having genuinely arrived; found empirically
 * while writing this task's own compliance/regression tests). Draining via
 * ordinary events sidesteps that Node behavior entirely.
 *
 * H10 fix (second-review): also listens for `'close'` -- `destroy()` (e.g.
 * `FetchedPartImpl.destroy()`, reached via the abandoned-iterator drain path,
 * `MailboxSession.fetch()`'s `driveFetch()`) emits ONLY `'close'`, never
 * `'end'`/`'error'`, for a stream destroyed without an explicit error before
 * it finished. Pre-fix, a `buffer()` call already in flight (its
 * `drainReadableAsync()` promise awaiting one of the other three events) when
 * the underlying stream was destroyed out from under it -- e.g. a `break` out
 * of a `for await` loop over `fetch()` right after calling `buffer()` but
 * before awaiting it, which the iterator reads as "abandoned" and destroys
 * every live part unconditionally, `buffer()`-in-flight or not -- left that
 * promise permanently unsettled (an eternal hang, not just a stalled
 * iterator). `'close'` rejects with a `ProtocolError`-adjacent, but public-
 * surface-appropriate, `ImapError`: the stream is KNOWN incomplete at that
 * point (every normal completion path settles via `'end'` first and detaches
 * this listener -- see `cleanup()` -- before Node ever gets around to
 * scheduling `'close'`), so there is no ambiguity to preserve by resolving
 * with a partial buffer instead.
 */
function drainReadableAsync(stream: Readable): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		const onReadable = () => {
			let chunk: Buffer | null;
			while ((chunk = stream.read() as Buffer | null) !== null) {
				chunks.push(chunk);
			}
		};
		const cleanup = () => {
			stream.removeListener("readable", onReadable);
			stream.removeListener("end", onEnd);
			stream.removeListener("error", onError);
			stream.removeListener("close", onClose);
		};
		const onEnd = () => {
			cleanup();
			resolve(Buffer.concat(chunks));
		};
		const onError = (err: Error) => {
			cleanup();
			reject(err);
		};
		const onClose = () => {
			cleanup();
			reject(
				new ImapError(
					"FetchedPart.buffer(): the underlying stream was destroyed before " +
						"it finished draining (the abandoned-iterator drain path, or a " +
						"caller-initiated destroy(), reached this part while a buffer() " +
						"call was still in flight) -- the data is known-incomplete",
				),
			);
		};
		stream.on("readable", onReadable);
		stream.on("end", onEnd);
		stream.on("error", onError);
		stream.on("close", onClose);
		// The stream may have already fully arrived (and even ended, if
		// something else already consumed it) before these listeners attached
		// -- drain/settle synchronously in that case rather than waiting for
		// events that already fired.
		onReadable();
		if (stream.readableEnded) {
			onEnd();
		} else if (stream.destroyed) {
			// Already destroyed (synchronously, e.g. by a `destroy()` call
			// that ran before this promise's listeners were attached) --
			// don't wait for the (possibly already-missed) async 'close'
			// event; settle immediately with the same known-incomplete
			// rejection `onClose()` would produce.
			onClose();
		}
	});
}

/**
 * `FetchItems`/`BodyPartRequest`/`FetchRequest` (spec §5.4) — the typed
 * request shape `MailboxSession.fetch()`/`.fetchOne()` (and their `.seq`
 * mirrors) accept. `FetchCommand` (`src/commands/fetch.ts`) is the sole
 * consumer that turns this into wire bytes.
 */
export interface FetchItems {
	/** Implicit `true` on the UID-grain facet regardless of this field's
	 *  value (RFC9051-6.4.9-3) -- only meaningful on the `seq` facet, where an
	 *  explicit ask is required to see `UID` in the response at all. */
	uid?: boolean;
	/** FLAGS -> `FetchedMessage.flags`. */
	flags?: boolean;
	/** ENVELOPE -> `FetchedMessage.envelope`. */
	envelope?: boolean;
	/** INTERNALDATE -> `FetchedMessage.internalDate`. */
	internalDate?: boolean;
	/** RFC822.SIZE -> `FetchedMessage.size: bigint`. */
	size?: boolean;
	/** BODYSTRUCTURE -> `FetchedMessage.bodyStructure`. */
	bodyStructure?: boolean;
	/** Non-extensible `BODY` (legacy synonym for `BODYSTRUCTURE` sans
	 *  extension data, RFC 3501/9051 §9). */
	body?: boolean;
	/** CONDSTORE, gated -- throws `CapabilityError` pre-write (I-9), CONDSTORE
	 *  is inert this milestone (shared M3 design note). */
	modSeq?: boolean;
	/** RFC 8474 OBJECTID, gated. */
	emailId?: boolean;
	/** RFC 8474 OBJECTID THREADID -> `FetchedMessage.threadId`, gated. */
	threadId?: boolean;
	/** RFC 8514, gated. */
	saveDate?: boolean;
	/** RFC 8970, gated. `{lazy:true}` appends the `(LAZY)` modifier. */
	preview?:
		| boolean
		| {
				/** Appends the `(LAZY)` modifier (RFC 8970 §3.2) -- requests the
				 *  preview only if the server can produce it without an expensive
				 *  synchronous computation, omitting it otherwise rather than
				 *  blocking the response. */
				lazy?: boolean;
		  };
	/** RFC 3516 BINARY.SIZE[section], gated, leaf parts only -- one entry per
	 *  section requested. */
	binarySize?: string[];
	/** Gmail extension (X-GM-EXT-1), gated. */
	gmail?: {
		/** X-GM-MSGID -> `FetchedMessage.gmail.msgId`. */
		msgId?: boolean;
		/** X-GM-THRID -> `FetchedMessage.gmail.threadId`. */
		threadId?: boolean;
		/** X-GM-LABELS -> `FetchedMessage.gmail.labels`. */
		labels?: boolean;
	};
	/** Individual `BODY[section]`/`BINARY[section]` requests -- see
	 *  `BodyPartRequest`; results are delivered as `FetchedPart`s, looked up
	 *  via `FetchedMessage.part(section)`/`.parts()`. */
	bodyParts?: BodyPartRequest[];
}

/** One requested `BODY[section]`/`BINARY[section]` FETCH data item (spec
 *  §5.4) — an element of `FetchItems.bodyParts`. Delivered back as a
 *  `FetchedPart`, looked up via `FetchedMessage.part(section)`. */
export interface BodyPartRequest {
	/** `"", "1.2", "HEADER", "1.MIME", "HEADER.FIELDS", "TEXT"`, etc. -- the
	 *  section-spec content between `BODY[` / `BINARY[` and `]`, WITHOUT the
	 *  surrounding brackets. */
	section: string;
	/** Required iff `section` is `"HEADER.FIELDS"`/`"HEADER.FIELDS.NOT"`. */
	fields?: string[];
	/** `HEADER.FIELDS.NOT` instead of `HEADER.FIELDS` when `fields` is set. */
	not?: boolean;
	/** Default `true` (deliberate: no accidental `\Seen` -- pass `peek:false`
	 *  to mirror plain `BODY[...]`'s implicit-seen behavior). */
	peek?: boolean;
	/** `BINARY[...]`/`BINARY.PEEK[...]` (RFC 3516), leaf-only, gated. */
	binary?: boolean;
	/** `<start.length>` octet window. */
	partial?: {
		/** Zero-based octet offset into the section content to start from. */
		start: number;
		/** Number of octets to return, starting at `start`. */
		length: number;
	};
	/** Force a live stream regardless of `maxInlineSize` (spec §5.4). */
	stream?: boolean;
}

/** `"fast" | "all" | "full"` macro (bare wire form, never parenthesized) or
 *  a typed `FetchItems` att-list. */
export type FetchRequest = string | FetchItems;

/**
 * spec §5b/§5.4. `changedSince` (RFC 7162 CONDSTORE `CHANGEDSINCE`) is real
 * as of M4.5: gated on the CONDSTORE capability being ADVERTISED (not
 * `ENABLE`d -- see `src/commands/select.ts`'s `SelectOrExamineCommand` doc
 * comment for the RFC 7162 §3.1.1 rationale this shares) and on the selected
 * mailbox not having reported NOMODSEQ (`MailboxSession.highestModSeq !==
 * null`, RFC7162-3.1.2.2-1 -- see `MailboxSession.runFetch()`'s own doc
 * comment).
 *
 * `vanished` is real as of M4.6 (RFC 7162 §3.2.6, QRESYNC). Spec §5.4's own
 * text calls for a "compile-time overload" alongside the runtime gate --
 * this discriminated union is that overload: `vanished: true` is only
 * constructible together with a REQUIRED (not optional) `changedSince`,
 * making `{ vanished: true }` alone (with no `changedSince`) a TYPE ERROR,
 * not just a runtime one. The runtime backstop for a caller that reaches
 * this shape without going through the compiler (e.g. a driver adapting a
 * looser wire-shaped input) lives in `MailboxSession.runFetch()` (the
 * changedSince-required and UID-grain-only checks, both `RangeError`) and
 * `FetchCommand`'s own constructor (the QRESYNC-ENABLEd capability check,
 * `CapabilityError`) -- see both of those doc comments.
 *
 * `partial` is real as of the M5 CONTEXT-machinery carry-forward (RFC 9394
 * §3.3, resolving the RFC9394-3.3-1 adjudicated deferral -- see
 * `docs/compliance-adjudications.md`): the `(PARTIAL m:n)` FETCH modifier,
 * paging the RESULT SET of the FETCH itself (which messages are reported) --
 * distinct from `BodyPartRequest.partial`'s `<start.length>` octet window
 * (which bytes of one message's part are returned). The `{ from, to }` shape
 * deliberately mirrors `SearchOptions.partial` because §3.3 defines the
 * modifier as having "the same syntax as the PARTIAL SEARCH result option":
 * both endpoints non-zero integers of the same sign, minus-prefixed for RFC
 * 9394's newest-first ("from the end") addressing (e.g. `{ from: -1, to: -3
 * }` = the three highest-UID messages of the set). Gated on the `PARTIAL`
 * capability alone (§3.3's own gate) and legal ONLY on UID FETCH -- §3.3
 * extends "the UID FETCH command", never bare FETCH, so `seq.fetch()`
 * refuses it with `RangeError` exactly like `vanished`.
 */
export type FetchModifiers =
	| {
			/** RFC 7162 CONDSTORE `CHANGEDSINCE modseq` -- only messages whose
			 *  MODSEQ has changed since `changedSince` are returned. */
			changedSince?: bigint;
			/** Must be omitted or `false` in this branch -- `true` requires a
			 *  REQUIRED (not optional) `changedSince`; see the sibling union
			 *  branch below and this type's own class doc comment. */
			vanished?: false;
			/** RFC 9394 `(PARTIAL m:n)` FETCH modifier -- pages the RESULT SET of
			 *  the FETCH itself (which messages are reported), distinct from
			 *  `BodyPartRequest.partial`'s per-message octet window. */
			partial?: {
				/** Non-zero integer start of the result-set window (RFC 9394 §3.3;
				 *  negative addresses from the end, newest-first). */
				from: number;
				/** Non-zero integer end of the result-set window, same sign
				 *  convention as `from`. */
				to: number;
			};
	  }
	| {
			/** REQUIRED alongside `vanished: true` -- RFC 7162 §3.2.6 mandates
			 *  QRESYNC VANISHED reporting always be paired with CHANGEDSINCE. */
			changedSince: bigint;
			/** RFC 7162 §3.2.6 QRESYNC VANISHED modifier -- removed messages are
			 *  reported via the `vanished` event/`MailboxSessionEvents.vanished`
			 *  instead of classic EXPUNGE. Requires `changedSince` (this branch)
			 *  and the QRESYNC capability to have been ENABLEd. */
			vanished: true;
			/** Same RFC 9394 `(PARTIAL m:n)` result-set-paging modifier as the
			 *  sibling union branch above. */
			partial?: {
				/** Non-zero integer start of the result-set window (RFC 9394 §3.3;
				 *  negative addresses from the end, newest-first). */
				from: number;
				/** Non-zero integer end of the result-set window, same sign
				 *  convention as `from`. */
				to: number;
			};
	  };

/** One address (spec §5.4, RFC 9051 §7.5.2). Group markers (`AddressGroup`
 *  boundaries in the underlying parser, e.g. "undisclosed-recipients") are
 *  flattened away -- their member addresses are included directly in the
 *  containing array, in order, without a separate group wrapper; this is a
 *  deliberate simplification (documented, not a spec requirement) since no
 *  compliance coverage exercises RFC 2822 group-syntax round-tripping. */
export interface FetchEnvelopeAddress {
	/** Display/personal name (RFC 5322 phrase), or `null` when absent. */
	name: string | null;
	/** Source-route (RFC 822 obsolete "at-domain-list"), or `null` -- almost
	 *  never populated by a modern message; kept for RFC 3501/9051 §7.5.2
	 *  fidelity. */
	route: string | null;
	/** Local-part of the address (left of the `@`), or `null` for a group
	 *  start/end marker in the underlying wire form (already flattened away
	 *  by `toEnvelopeAddresses()` before reaching this type -- see
	 *  `FetchEnvelopeAddress`'s own class doc comment). */
	mailbox: string | null;
	/** Domain part of the address (right of the `@`), or `null`. */
	host: string | null;
}

/** Parsed FETCH ENVELOPE (spec §5.4, RFC 3501/9051 §7.5.2) -- one field per
 *  envelope structure member, in the RFC's own order. Every address field is
 *  flattened via `FetchEnvelopeAddress` (see that interface's doc comment). */
export interface FetchEnvelope {
	/** Raw wire date-text, exactly as sent -- never re-parsed into a `Date`
	 *  (RFC 9051 §7.5.2 does not require it to be a valid/parseable date). */
	date: string | null;
	/** Raw wire subject text, unparsed/undecoded. */
	subject: string | null;
	/** The message's `From:` address(es). */
	from: FetchEnvelopeAddress[];
	/** The message's `Sender:` address(es) -- per RFC 9051 §7.5.2, defaults
	 *  to the same value as `from` when the message itself has no `Sender:`
	 *  header. */
	sender: FetchEnvelopeAddress[];
	/** The message's `Reply-To:` address(es) -- defaults to `from` when
	 *  absent, same rule as `sender`. */
	replyTo: FetchEnvelopeAddress[];
	/** The message's `To:` address(es). */
	to: FetchEnvelopeAddress[];
	/** The message's `Cc:` address(es). */
	cc: FetchEnvelopeAddress[];
	/** The message's `Bcc:` address(es). */
	bcc: FetchEnvelopeAddress[];
	/** Raw `In-Reply-To:` header text, verbatim. */
	inReplyTo: string | null;
	/** Raw `Message-ID:` header text, verbatim. */
	messageId: string | null;
}

/** BODYSTRUCTURE tree (spec §5.4: "tree; unknown extension data preserved
 *  raw"). Reuses the parser's own structure classes directly rather than a
 *  parallel type -- they already satisfy that contract (`additionalExtensionData`
 *  on both variants). */
export type BodyStructure = MessageBodyMultipartStructure | MessageBodyStructure;

/**
 * One FETCH body/BINARY part (spec §5.4). BACKPRESSURE CONTRACT for a LIVE
 * (not-yet-buffered) part reached through `fetch()`'s async iterator
 * (`MailboxSession.fetch()`/`.seq.fetch()`): the iterator does not advance
 * past the message this part belongs to until this part has been "consumed
 * or destroyed" -- concretely, one of:
 *
 *  1. NEVER ENGAGED at all (neither `stream()` nor `buffer()` ever called):
 *     the instant the caller asks the iterator for the NEXT message
 *     (`iter.next()`), this part is destroyed automatically (S2 fix,
 *     M3-phase-boundary review) -- advancing without touching a part is
 *     read as relinquishing it, not as a request to keep it alive
 *     unobserved. An abandoned iterator (`break`/`return`) destroys it too,
 *     via the same mechanism, slightly earlier in that path.
 *  2. ENGAGED (`stream()` or `buffer()` was called) but not yet finished:
 *     this part keeps gating the iterator exactly as always -- requesting
 *     the next message before finishing a part you started reading is a
 *     documented CALLER ERROR (the iterator will not advance until you
 *     either finish draining it or destroy the underlying stream
 *     yourself), not a case this contract papers over.
 *  3. Finished (drained to `end`, or destroyed) the ordinary way.
 */
export interface FetchedPart {
	/** The section-spec string this part answers, normalized to canonical
	 *  uppercase (`normalizeSectionSpec()`) -- the same key
	 *  `FetchedMessage.part()` looks entries up by. */
	section: string;
	/** `true` iff this part answers a `BINARY[section]`/`BINARY.PEEK[section]`
	 *  (RFC 3516) request rather than a plain `BODY[section]`/`BODY.PEEK
	 *  [section]` one -- H9 fix (second-review): a single FETCH can request
	 *  BOTH for the same section number (they're different data items), so
	 *  this facet is needed to tell the two apart, both when disambiguating
	 *  via `FetchedMessage.part(section, { binary })` and when iterating
	 *  `FetchedMessage.parts()` (where two entries can legitimately share the
	 *  same `section` string). */
	readonly binary: boolean;
	/** Literal size as sent (bigint, spec §11.3 number64 class). */
	size: bigint;
	/** Rejects if this part was already handed out via `stream()` (see this
	 *  interface's own class doc comment on `FetchedPartImpl` for the exact
	 *  rule). Resolves immediately for an already-buffered part. Counts as
	 *  "engaging" this part for the backpressure contract above. */
	buffer(): Promise<Buffer>;
	/** Node `Readable` (spec's `ReadableStream<Uint8Array> | Readable` widened
	 *  form -- this implementation always hands back a Node `Readable`, the
	 *  native type every literal in this codebase is already represented
	 *  as). Replays from the cached buffer for an already-buffered part.
	 *  Counts as "engaging" this part for the backpressure contract above. */
	stream(): Readable;
	/** `true` once this part's content is fully available as an in-memory
	 *  `Buffer` -- either because it was eagerly drained at construction
	 *  time (size within `maxInlineSize`), or because a live `stream()` was
	 *  fully consumed via a prior `buffer()` call. `false` for a live,
	 *  not-yet-drained part. */
	readonly buffered: boolean;
}

/** One message's FETCH response, decoded from the wire into typed fields
 *  (spec §5.4) — every field here is populated iff the corresponding
 *  `FetchItems` request flag was set (and, for extension fields, the
 *  server actually returned data for it). Produced by `buildFetchedMessage()`,
 *  yielded by `MailboxSession.fetch()`/`.seq.fetch()`'s async iterator or
 *  returned singly by `fetchOne()`/`.seq.fetchOne()`. */
export interface FetchedMessage {
	/** Message sequence number -- with one documented exception: a message
	 *  delivered via an RFC 9586 `UIDFETCH` response (a UIDONLY-enabled
	 *  session, M5.15) has NO message sequence number at all (the extension's
	 *  whole point is that MSNs cease to exist on the connection), and `seq`
	 *  is `0` -- never a valid MSN, which are 1-based (nz-number) -- with
	 *  `uid` always populated in that case. Chosen over widening this field
	 *  to `number | undefined`, which would break every existing consumer's
	 *  arithmetic for a case only UIDONLY sessions ever see. */
	seq: number;
	/** The message's UID, present whenever the server included one (always,
	 *  on a UID FETCH; only if requested via `FetchItems.uid` on a bare
	 *  FETCH). */
	uid?: number;
	/** The message's current flag set, from FLAGS. */
	flags?: ReadonlySet<string>;
	/** Parsed ENVELOPE structure -- see `FetchEnvelope`. */
	envelope?: FetchEnvelope;
	/** INTERNALDATE, as reported by the server. */
	internalDate?: Date;
	/** RFC822.SIZE, in octets. */
	size?: bigint;
	/** Parsed BODYSTRUCTURE (or non-extensible BODY) tree -- see
	 *  `BodyStructure`. */
	bodyStructure?: BodyStructure;
	/** RFC 7162 CONDSTORE MODSEQ, present only when requested/reported. */
	modSeq?: bigint;
	/** RFC 8474 OBJECTID EMAILID, present only when requested/reported. */
	emailId?: string;
	/** RFC 8474 OBJECTID THREADID, present only when requested/reported. */
	threadId?: string;
	/** RFC 8514 SAVEDATE -- `null` if the server explicitly reported no
	 *  save date for this message, `undefined` if it wasn't requested/
	 *  returned at all. */
	saveDate?: Date | null;
	/** RFC 8970 PREVIEW text, present only when requested/reported. */
	preview?: string;
	/** Gmail extension (X-GM-EXT-1) fields, present only for whichever of
	 *  `msgId`/`threadId`/`labels` were both requested and returned. */
	gmail?: {
		/** X-GM-MSGID, Gmail's own per-message identifier. */
		msgId?: string;
		/** X-GM-THRID, Gmail's own thread identifier. */
		threadId?: string;
		/** X-GM-LABELS, the message's current Gmail label set. */
		labels?: string[];
	};
	/** RFC 3516 BINARY.SIZE[section] results, keyed by the same section
	 *  string `part()` would use for that leaf's `BINARY[section]` content.
	 *  Not in the spec's own §5.4 sketch of `FetchedMessage` (which lists no
	 *  dedicated BINARY.SIZE field at all) -- added because `FetchItems.
	 *  binarySize` is otherwise a request-only field with nowhere for its
	 *  answer to surface; additive, doesn't change any listed field's shape. */
	binarySizes?: ReadonlyMap<string, bigint>;
	/** Looks up one requested body/BINARY part by its section-spec string
	 *  (the same string passed as `BodyPartRequest.section`, or the implicit
	 *  "HEADER.FIELDS"/"HEADER.FIELDS.NOT" key for a `.fields` request -- spec
	 *  §5.4). CASE-INSENSITIVE (C3 fix, M3-phase-boundary review): both this
	 *  lookup argument and every part's own stored key are normalized to the
	 *  same canonical uppercase form (`normalizeSectionSpec()`), so
	 *  `part("text")` and `part("TEXT")` always resolve the same entry --
	 *  matching the parser's own case-insensitive section-atom handling.
	 *
	 *  H9 fix (second-review): `BODY[section]` and `BINARY[section]` (RFC
	 *  3516) are different data items that can both be requested for the SAME
	 *  section number in one FETCH -- `opts.binary` disambiguates which one to
	 *  return. Omitted (the common case, exactly one of the two ever
	 *  requested for a given section): resolves the `BODY`/plain entry first,
	 *  falling back to the `BINARY` one only if that's the only one present --
	 *  preserving pre-fix lookup behavior for every existing binary-only or
	 *  body-only caller. When BOTH were requested for the same section, an
	 *  unqualified call deterministically returns the `BODY` part; pass
	 *  `{ binary: true }` to reach the `BINARY` one instead. */
	part(section: string, opts?: { binary?: boolean }): FetchedPart | undefined;
	/** Every requested body/BINARY part actually returned for this message,
	 *  in no particular guaranteed order -- use `part(section)` instead when
	 *  looking for one specific section. */
	parts(): FetchedPart[];
}

/**
 * `FetchedPart` implementation (spec §5.4's buffering rule). Two
 * constructions:
 *  - `fromBuffer`: content already fully in hand (either the parser handed
 *    back a plain string/short value, or the caller's `maxInlineSize` policy
 *    says to eagerly drain a streamed literal at construction time) --
 *    `buffered` is `true` from the start, `buffer()` resolves immediately,
 *    `stream()` replays a fresh `Readable` from the cached buffer every call.
 *  - `fromLiveStream`: a `LiteralBodyStream` handed out lazily. `buffered`
 *    starts `false`. `stream()` returns the underlying stream directly (and
 *    marks this part "streamed" -- see below); `buffer()` drains it into a
 *    `Buffer`, caches the result, and flips `buffered` to `true`.
 *
 * "Rejects if streamed-and-consumed" (spec §5.4): once `stream()` has been
 * called, a later `buffer()` call rejects -- handing out the live
 * `Readable` is treated as an irrevocable choice, regardless of whether the
 * caller actually read anything from it yet, since this implementation has
 * no way to know whether bytes have already been pulled out from under it
 * (a partially-consumed `Readable` can't be safely re-drained into a
 * complete `Buffer`). Calling `stream()` a second time is allowed (returns
 * the SAME underlying stream) -- only `buffer()` after `stream()` rejects.
 *
 * M9 fix (second-review): the SAME single-consumer discipline now applies in
 * the OTHER order too -- `stream()` called while a `buffer()` drain is
 * already in flight (started, not yet resolved) also rejects, rather than
 * handing out the live `liveStream` a second time. Pre-fix, `stream()` only
 * checked `cached !== undefined` (true once the drain FINISHES) to decide
 * whether to replay from the buffer -- so a `stream()` call landing DURING
 * the drain (after `buffer()` started, before its promise settles) fell
 * through to the "hand out the live stream" branch even though
 * `drainReadableAsync()` was already attached to and reading from that exact
 * `Readable`. Two independent readers pulling from the same stream's
 * internal buffer silently split the bytes between them (each `.read()`
 * consumes what the other would otherwise have seen) -- neither consumer
 * ever sees the complete content, and neither errors, making this a silent
 * data-corruption hazard rather than a loud one. `drainPromise` (set the
 * instant `buffer()` starts draining, well before it resolves) is the signal
 * `stream()` now checks for this.
 */
class FetchedPartImpl implements FetchedPart {
	private cached: Buffer | undefined;
	private wasStreamed = false;
	private liveStream: LiteralBodyStream | undefined;
	private drainPromise: Promise<Buffer> | undefined;
	/** S2 fix: `true` once the caller has actually engaged this part (called
	 *  either `stream()` or `buffer()`) -- distinct from `wasStreamed`, which
	 *  ONLY tracks the narrower "handed out a live `Readable`" fact `buffer()`
	 *  itself checks. `MailboxSession`'s `driveFetch()` reads this (via
	 *  `destroyIfUnengaged()` below) to tell an ignored live part (the
	 *  consumer never touched it at all) apart from one the consumer started
	 *  consuming and is still gating on -- see this class's own doc comment. */
	private engaged = false;

	/** Resolves once this part's content is fully accounted for -- either
	 *  buffered up front, drained via `buffer()`, or handed out (and,
	 *  separately, actually ended/destroyed) via `stream()`. This is the
	 *  backpressure gate `MailboxSession.fetch()`'s async iterator awaits
	 *  before advancing past a message (spec §5.4) -- NOT part of the public
	 *  `FetchedPart` surface. */
	public readonly settled: Promise<void>;
	private resolveSettled!: () => void;

	private constructor(
		public readonly section: string,
		public readonly binary: boolean,
		public readonly size: bigint,
		initialBuffer: Buffer | undefined,
		liveStream: LiteralBodyStream | undefined,
	) {
		this.cached = initialBuffer;
		this.liveStream = liveStream;
		this.settled = new Promise((resolve) => {
			this.resolveSettled = resolve;
		});
		if (initialBuffer !== undefined || !liveStream) {
			this.resolveSettled();
		} else {
			const finish = () => this.resolveSettled();
			liveStream.once("end", finish);
			liveStream.once("close", finish);
			liveStream.once("error", finish);
		}
	}

	static fromBuffer(section: string, binary: boolean, data: Buffer): FetchedPartImpl {
		return new FetchedPartImpl(section, binary, BigInt(data.length), data, undefined);
	}

	static fromLiveStream(
		section: string,
		binary: boolean,
		size: bigint,
		stream: LiteralBodyStream,
	): FetchedPartImpl {
		return new FetchedPartImpl(section, binary, size, undefined, stream);
	}

	get buffered(): boolean {
		return this.cached !== undefined;
	}

	async buffer(): Promise<Buffer> {
		this.engaged = true;
		if (this.cached !== undefined) {
			return this.cached;
		}
		if (this.wasStreamed) {
			throw new Error(
				`FetchedPart(${JSON.stringify(this.section)}).buffer(): this part was ` +
					"already handed out via stream() -- a live stream can't be safely " +
					"re-drained into a buffer once a consumer may have already read from it",
			);
		}
		if (!this.drainPromise) {
			this.drainPromise = this.drainLiveStream();
		}
		return this.drainPromise;
	}

	private async drainLiveStream(): Promise<Buffer> {
		const buf = await drainReadableAsync(this.liveStream!);
		this.cached = buf;
		return buf;
	}

	stream(): Readable {
		this.engaged = true;
		if (this.cached !== undefined) {
			// `Readable.from(buffer)` would iterate the Buffer BYTE BY BYTE (a
			// Buffer is itself iterable over its octets) -- wrapping it in a
			// one-element array makes the iterable yield the whole Buffer as a
			// single chunk instead, which is what a non-object-mode consumer
			// expects.
			return Readable.from([this.cached], { objectMode: false });
		}
		// M9 fix (second-review): a buffer() call already claimed this live
		// stream and is still draining it (drainPromise exists, but hasn't
		// resolved yet -- `cached` is still undefined) -- see this class's own
		// doc comment for the dual-reader corruption this prevents. Mirrors
		// `buffer()`'s own `wasStreamed` check for the reverse call order.
		if (this.drainPromise) {
			throw new Error(
				`FetchedPart(${JSON.stringify(this.section)}).stream(): this part was ` +
					"already handed out via buffer() -- a live stream can't be safely " +
					"exposed a second time while a buffer() drain may still be reading from it",
			);
		}
		this.wasStreamed = true;
		return this.liveStream!;
	}

	/** @internal destroys any not-yet-consumed live stream -- used by the
	 *  abandoned-iterator drain path (`MailboxSession.fetch()`). A no-op for
	 *  an already-buffered/already-ended part. */
	destroy(): void {
		if (this.cached === undefined && this.liveStream && !this.liveStream.destroyed) {
			this.liveStream.destroy();
		}
	}

	/** @internal S2 fix (M3-phase-boundary review): destroys this part's live
	 *  stream ONLY IF the caller never engaged it (neither `stream()` nor
	 *  `buffer()` was ever called) -- a no-op for an engaged-but-still-
	 *  draining part, which keeps gating `driveFetch()`'s backpressure await
	 *  exactly as before (finishing a part you started reading, after
	 *  requesting the next message, is a documented caller error, not
	 *  something this method papers over). Called by `driveFetch()` the
	 *  instant the consumer asks for the NEXT message (`iter.next()`) --
	 *  advancing past a message the caller never touched a given part of is
	 *  "relinquishing" it, per spec §5.4's "consumed or destroyed" contract,
	 *  the same way an abandoned iterator's `destroyLiveParts()` relinquishes
	 *  every part unconditionally. */
	destroyIfUnengaged(): void {
		if (!this.engaged) {
			this.destroy();
		}
	}

	/** @internal marks this part "engaged" WITHOUT touching `stream()`/
	 *  `buffer()` -- used by `fetchOneOf()` (mailbox.ts) to exempt a
	 *  `fetchOne()`/`seq.fetchOne()` result from `destroyIfUnengaged()` above.
	 *  See `FetchedMessageImpl.protectLiveParts()`'s own doc comment for why
	 *  that call is needed at all. */
	markEngaged(): void {
		this.engaged = true;
	}
}

/** Flattens the parser's `AddressList` (which nests `AddressGroup`
 *  boundaries) into a flat `FetchEnvelopeAddress[]` -- see `FetchEnvelopeAddress`'s own
 *  doc comment for why groups aren't preserved as a separate shape. */
function toEnvelopeAddresses(list: ParserAddressList): FetchEnvelopeAddress[] {
	const out: FetchEnvelopeAddress[] = [];
	for (const entry of list.list) {
		if (entry instanceof ParserAddressGroup) {
			for (const addr of entry.list) {
				out.push(toEnvelopeAddress(addr));
			}
		} else {
			out.push(toEnvelopeAddress(entry as ParserAddress));
		}
	}
	return out;
}

function toEnvelopeAddress(addr: ParserAddress): FetchEnvelopeAddress {
	return { name: addr.name, route: addr.route, mailbox: addr.mailbox, host: addr.host };
}

function toEnvelope(env: ParserEnvelope): FetchEnvelope {
	return {
		date: env.date,
		subject: env.subject,
		from: toEnvelopeAddresses(env.from),
		sender: toEnvelopeAddresses(env.sender),
		replyTo: toEnvelopeAddresses(env.replyTo),
		to: toEnvelopeAddresses(env.to),
		cc: toEnvelopeAddresses(env.cc),
		bcc: toEnvelopeAddresses(env.bcc),
		inReplyTo: env.inReplyTo,
		messageId: env.messageId,
	};
}

function toBigInt(n: number | bigint): bigint {
	return typeof n === "bigint" ? n : BigInt(n);
}

/**
 * C3 fix (M3-phase-boundary review): canonicalizes a section-spec string to
 * the SAME form the parser already uses as `MessageBodySection.kind`
 * (`src/parser/structure/fetch/body.section.ts`'s own `getBodySectionInfo`
 * calls the identical `.toUpperCase()` on the server's echoed section atom)
 * -- a plain `.toUpperCase()` is exactly "uppercase the alpha components,
 * leave numeric components intact" (spec §5.4's compose-side requirement),
 * since `.toUpperCase()` is already a no-op on digits and `.`/`,` separators;
 * `"4.2.text"` -> `"4.2.TEXT"` needs no special per-segment splitting.
 *
 * Used on BOTH sides of the section-key contract so they can never drift
 * apart again: `commands/fetch.ts`'s `composeSectionSpec()`/
 * `composeSectionSpecKey()` apply it when building the wire token and the
 * `forcedStreamSections`/`buildFetchedMessage()` map key respectively, and
 * `FetchedMessageImpl.part()` below applies it to the CALLER's lookup
 * argument -- so `part("text")` and `part("TEXT")` are guaranteed to resolve
 * the same entry regardless of which case either side used. Exported (not
 * module-private) so `commands/fetch.ts` -- which already imports types
 * from this module -- can reuse the identical implementation rather than a
 * second, driftable copy (this module intentionally never imports FROM
 * `commands/fetch.ts`, so this is the one direction that avoids a cycle).
 */
export function normalizeSectionSpec(section: string): string {
	return section.toUpperCase();
}

/**
 * H9 fix (second-review): the internal key `buildFetchedMessage()`'s `parts`
 * Map (and `commands/fetch.ts`'s `forcedStreamSections` set) use -- a plain
 * section-spec string is NOT a unique key on its own, because `BODY[1]` and
 * `BINARY[1]` (RFC 3516) are two DIFFERENT FETCH data items that can both be
 * requested (and both answered) for the exact same section number in one
 * FETCH; nothing in the wire grammar forbids `(BODY[1] BINARY[1])`, and
 * `writeBodyPartItem`/`writeFetchItems` (`commands/fetch.ts`) happily compile
 * both into the same command. Keying the results map by `section` alone let
 * whichever of the two was iterated second silently clobber the other's
 * `FetchedPartImpl` entry (H9). Composing the `binary` facet into the key
 * (this function) keeps both entries addressable -- `FetchedMessage.part()`'s
 * new optional second argument disambiguates on lookup (see that method's own
 * doc comment for the no-collision default).
 *
 * NOT part of the public surface (unlike `normalizeSectionSpec`) -- exported
 * only so `commands/fetch.ts`'s `composeSectionSpecKey()` (the
 * `forcedStreamSections` producer) can share the identical scheme rather than
 * a second, driftable copy; both modules already share `normalizeSectionSpec()`
 * the same way, for the same reason (this module never imports FROM
 * `commands/fetch.ts`, so this is the one direction that avoids a cycle). The
 * space separator is safe: `normalizeSectionSpec()`'s output is always a bare
 * section-spec atom/HEADER.FIELDS keyword (`[0-9A-Z.,]+` or `HEADER.FIELDS(.NOT)?`),
 * which never itself contains a space.
 */
export function sectionPartKey(section: string, binary: boolean): string {
	return `${binary ? "BINARY" : "BODY"} ${normalizeSectionSpec(section)}`;
}

/**
 * Builds one `FetchedMessage` from a claimed `Fetch` untagged response (spec
 * §5.4). The buffering rule: a part whose declared size is `<= maxInlineSize`
 * and whose request didn't force `stream: true` is drained into a `Buffer`
 * RIGHT HERE (synchronously kicked off, awaited by the caller) rather than
 * handed out live; anything larger, or explicitly `stream: true`, stays a
 * live `FetchedPartImpl` wrapping the parser's `LiteralBodyStream` directly.
 *
 * `requestedStreamSections` lets the caller (FetchCommand) mark which
 * section strings were requested with `stream: true` -- looked up by the
 * exact section string the request used, which (by construction) matches
 * what a conformant server echoes back for that same request.
 */
export async function buildFetchedMessage(
	fetch: Fetch | UidFetch,
	opts: { maxInlineSize: number; forcedStreamSections: ReadonlySet<string> },
): Promise<FetchedMessageImpl> {
	const parts = new Map<string, FetchedPartImpl>();

	// H9 fix (second-review): keyed by `sectionPartKey(section, binary)`, NOT
	// bare `section` -- see that function's own doc comment for why a plain
	// section string can't disambiguate a same-numbered BODY[n]/BINARY[n]
	// pair requested in the same FETCH.
	const addStreamedOrBuffered = async (
		section: string,
		binary: boolean,
		text: string | undefined,
		stream: { stream: LiteralBodyStream; length: number } | undefined,
	): Promise<void> => {
		const key = sectionPartKey(section, binary);
		if (stream) {
			const forceStream = opts.forcedStreamSections.has(key);
			if (!forceStream && stream.length <= opts.maxInlineSize) {
				const buf = await drainReadableAsync(stream.stream);
				parts.set(key, FetchedPartImpl.fromBuffer(section, binary, buf));
			} else {
				parts.set(
					key,
					FetchedPartImpl.fromLiveStream(section, binary, BigInt(stream.length), stream.stream),
				);
			}
		} else {
			const buf = Buffer.from(text ?? "", "utf8");
			parts.set(key, FetchedPartImpl.fromBuffer(section, binary, buf));
		}
	};

	if (fetch.body) {
		// KNOWN LIMITATION (documented, not fixed here -- see this module's own
		// header comment / the M3.5 report): a whole-message `BODY[]`/`RFC822`
		// response (empty section string) is parsed by `MessageBody.
		// createFromFullBody` into `header` (parsed field/value pairs -- the
		// ORIGINAL raw header bytes are discarded, not preserved anywhere) plus
		// a synthesized `MessageBodySection("TEXT", ...)`. There is therefore no
		// faithful way to reconstruct the exact bytes the server sent for
		// section `""` from the data this parser layer keeps -- rather than
		// synthesize an approximation that could silently diverge from the
		// server's real echo (this module's own section-key exactness
		// requirement), no `part("")` is created for a whole-message request;
		// `fetch.body.sections`/`.header` below still populate normally for any
		// OTHER section actually requested in the same command.
		for (const section of fetch.body.sections) {
			await addStreamedOrBuffered(
				section.kind,
				false,
				section.contents,
				section.stream ? { stream: section.stream.stream, length: section.stream.length } : undefined,
			);
		}
	}
	if (fetch.binarySections) {
		for (const bin of fetch.binarySections) {
			await addStreamedOrBuffered(
				bin.section,
				true,
				bin.contents,
				bin.stream ? { stream: bin.stream.stream, length: bin.stream.length } : undefined,
			);
		}
	}

	let binarySizes: Map<string, bigint> | undefined;
	if (fetch.binarySizes) {
		binarySizes = new Map();
		for (const bs of fetch.binarySizes) {
			binarySizes.set(bs.section, toBigInt(bs.size));
		}
	}

	const ext = fetch.extensions;
	const emailId = ext?.get("EMAILID") as EmailId | undefined;
	const threadId = ext?.get("THREADID") as ThreadId | undefined;
	const saveDate = ext?.get("SAVEDATE") as SaveDate | undefined;
	const preview = ext?.get("PREVIEW") as Preview | undefined;
	const gmMsgId = ext?.get("X-GM-MSGID") as GmailMessageId | undefined;
	const gmThrId = ext?.get("X-GM-THRID") as GmailThreadId | undefined;
	const gmLabels = ext?.get("X-GM-LABELS") as GmailLabels | undefined;
	let gmail: { msgId?: string; threadId?: string; labels?: string[] } | undefined;
	if (gmMsgId || gmThrId || gmLabels) {
		gmail = {};
		if (gmMsgId) gmail.msgId = String(gmMsgId.id);
		if (gmThrId) gmail.threadId = String(gmThrId.id);
		if (gmLabels) gmail.labels = gmLabels.labels.flags.map((f) => f.name);
	}

	// RFC 9586 (UIDONLY, M5.15): a UIDFETCH response's leading number IS the
	// UID; no message sequence number exists on a UIDONLY-enabled connection
	// at all, so `seq` carries the documented `0` sentinel (see
	// `FetchedMessage.seq`'s own doc comment) rather than a fabricated MSN.
	return new FetchedMessageImpl({
		seq: fetch instanceof UidFetch ? 0 : fetch.sequenceNumber,
		uid:
			fetch instanceof UidFetch
				? fetch.uid
				: fetch.uid?.id === "*"
					? undefined
					: fetch.uid?.id,
		flags: fetch.flags ? new Set(fetch.flags.flags.map((f) => f.name)) : undefined,
		envelope: fetch.envelope ? toEnvelope(fetch.envelope) : undefined,
		internalDate: fetch.date,
		size: fetch.size !== undefined ? toBigInt(fetch.size) : undefined,
		bodyStructure: fetch.body?.structure,
		modSeq: fetch.modseq !== undefined ? toBigInt(fetch.modseq) : undefined,
		emailId: emailId?.id,
		threadId: threadId?.id ?? undefined,
		saveDate: saveDate ? saveDate.datetime : undefined,
		preview: preview?.text ?? undefined,
		gmail,
		binarySizes,
		parts,
	});
}

export class FetchedMessageImpl implements FetchedMessage {
	public readonly seq: number;
	public readonly uid?: number;
	public readonly flags?: ReadonlySet<string>;
	public readonly envelope?: FetchEnvelope;
	public readonly internalDate?: Date;
	public readonly size?: bigint;
	public readonly bodyStructure?: BodyStructure;
	public readonly modSeq?: bigint;
	public readonly emailId?: string;
	public readonly threadId?: string;
	public readonly saveDate?: Date | null;
	public readonly preview?: string;
	public readonly gmail?: { msgId?: string; threadId?: string; labels?: string[] };
	public readonly binarySizes?: ReadonlyMap<string, bigint>;
	private readonly partsMap: Map<string, FetchedPartImpl>;

	constructor(fields: {
		seq: number;
		uid?: number;
		flags?: ReadonlySet<string>;
		envelope?: FetchEnvelope;
		internalDate?: Date;
		size?: bigint;
		bodyStructure?: BodyStructure;
		modSeq?: bigint;
		emailId?: string;
		threadId?: string;
		saveDate?: Date | null;
		preview?: string;
		gmail?: { msgId?: string; threadId?: string; labels?: string[] };
		binarySizes?: Map<string, bigint>;
		parts: Map<string, FetchedPartImpl>;
	}) {
		this.seq = fields.seq;
		this.uid = fields.uid;
		this.flags = fields.flags;
		this.envelope = fields.envelope;
		this.internalDate = fields.internalDate;
		this.size = fields.size;
		this.bodyStructure = fields.bodyStructure;
		this.modSeq = fields.modSeq;
		this.emailId = fields.emailId;
		this.threadId = fields.threadId;
		this.saveDate = fields.saveDate;
		this.preview = fields.preview;
		this.gmail = fields.gmail;
		this.binarySizes = fields.binarySizes;
		this.partsMap = fields.parts;
	}

	part(section: string, opts?: { binary?: boolean }): FetchedPart | undefined {
		// C3 fix: normalize the LOOKUP argument too, so `part("text")` and
		// `part("TEXT")` resolve the same entry regardless of which case the
		// caller used -- `partsMap`'s own keys are always the canonical
		// uppercase form already (`composeSectionSpecKey()`'s side of this
		// same fix, and the parser's own `MessageBodySection.kind`).
		//
		// H9 fix (second-review): `partsMap` is now keyed by `sectionPartKey()`
		// (section + binary facet), not bare section, so an explicit
		// `opts.binary` looks up exactly that facet; omitted, this prefers the
		// non-binary (`BODY[...]`) entry and falls back to the binary
		// (`BINARY[...]`) one -- see this method's own interface doc comment.
		if (opts?.binary !== undefined) {
			return this.partsMap.get(sectionPartKey(section, opts.binary));
		}
		return (
			this.partsMap.get(sectionPartKey(section, false)) ??
			this.partsMap.get(sectionPartKey(section, true))
		);
	}

	parts(): FetchedPart[] {
		return [...this.partsMap.values()];
	}

	/** @internal every live (not-yet-settled) part's `settled` promise --
	 *  `MailboxSession.fetch()`'s advance gate awaits `Promise.all(...)` over
	 *  this before pulling the next message (spec §5.4's backpressure
	 *  contract). */
	livePartSettledPromises(): Promise<void>[] {
		return [...this.partsMap.values()].map((p) => p.settled);
	}

	/** @internal destroys every not-yet-consumed live part -- the abandoned-
	 *  iterator drain path. */
	destroyLiveParts(): void {
		for (const part of this.partsMap.values()) {
			part.destroy();
		}
	}

	/** @internal S2 fix (M3-phase-boundary review): destroys every live part
	 *  of THIS message the caller never engaged (neither `.stream()` nor
	 *  `.buffer()` called) -- `driveFetch()` calls this the instant the
	 *  consumer requests the next message, so a part nobody asked for can
	 *  never deadlock the backpressure gate (`livePartSettledPromises()`
	 *  below) waiting on a stream that will never be read or destroyed
	 *  otherwise. A part the consumer DID engage is left alone -- it keeps
	 *  gating exactly as before. */
	destroyUnengagedLiveParts(): void {
		for (const part of this.partsMap.values()) {
			part.destroyIfUnengaged();
		}
	}

	/** @internal S2 fix support (M3-phase-boundary review): marks EVERY live
	 *  part of this message "engaged" without actually reading from any of
	 *  them -- exempts this message from `destroyUnengagedLiveParts()` above.
	 *  `MailboxSession`'s `fetchOneOf()` calls this on the single message it
	 *  hands back the instant it's obtained, BEFORE starting its own
	 *  background drain of the rest of the (normally-exhausted) iterator --
	 *  that background drain calls `.next()` on the SAME underlying
	 *  `driveFetch()` generator fetchOneOf's real caller's message came from,
	 *  which would otherwise look exactly like "the consumer requested the
	 *  next message" and destroy this message's own not-yet-engaged parts
	 *  out from under fetchOneOf()'s actual (still-forthcoming) caller.
	 *  `fetchOne()`/`.seq.fetchOne()` hand a message back whole, live parts
	 *  intact, for their own caller to use exactly like any other
	 *  `FetchedMessage` (see `fetchOneOf()`'s own doc comment) -- there is no
	 *  "next message" of ITS OWN for this one to be relinquished in favor of,
	 *  so the auto-destroy contract doesn't apply to it at all. */
	protectLiveParts(): void {
		for (const part of this.partsMap.values()) {
			part.markEngaged();
		}
	}
}
