import { Readable } from "stream";

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
		};
		const onEnd = () => {
			cleanup();
			resolve(Buffer.concat(chunks));
		};
		const onError = (err: Error) => {
			cleanup();
			reject(err);
		};
		stream.on("readable", onReadable);
		stream.on("end", onEnd);
		stream.on("error", onError);
		// The stream may have already fully arrived (and even ended, if
		// something else already consumed it) before these listeners attached
		// -- drain/settle synchronously in that case rather than waiting for
		// events that already fired.
		onReadable();
		if (stream.readableEnded) {
			onEnd();
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
	flags?: boolean;
	envelope?: boolean;
	internalDate?: boolean;
	/** RFC822.SIZE -> `FetchedMessage.size: bigint`. */
	size?: boolean;
	bodyStructure?: boolean;
	/** Non-extensible `BODY` (legacy synonym for `BODYSTRUCTURE` sans
	 *  extension data, RFC 3501/9051 §9). */
	body?: boolean;
	/** CONDSTORE, gated -- throws `CapabilityError` pre-write (I-9), CONDSTORE
	 *  is inert this milestone (shared M3 design note). */
	modSeq?: boolean;
	/** RFC 8474 OBJECTID, gated. */
	emailId?: boolean;
	threadId?: boolean;
	/** RFC 8514, gated. */
	saveDate?: boolean;
	/** RFC 8970, gated. `{lazy:true}` appends the `(LAZY)` modifier. */
	preview?: boolean | { lazy?: boolean };
	/** RFC 3516 BINARY.SIZE[section], gated, leaf parts only -- one entry per
	 *  section requested. */
	binarySize?: string[];
	/** Gmail extension (X-GM-EXT-1), gated. */
	gmail?: { msgId?: boolean; threadId?: boolean; labels?: boolean };
	bodyParts?: BodyPartRequest[];
}

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
	partial?: { start: number; length: number };
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
 */
export type FetchModifiers =
	| { changedSince?: bigint; vanished?: false }
	| { changedSince: bigint; vanished: true };

/** One address (spec §5.4, RFC 9051 §7.5.2). Group markers (`AddressGroup`
 *  boundaries in the underlying parser, e.g. "undisclosed-recipients") are
 *  flattened away -- their member addresses are included directly in the
 *  containing array, in order, without a separate group wrapper; this is a
 *  deliberate simplification (documented, not a spec requirement) since no
 *  compliance coverage exercises RFC 2822 group-syntax round-tripping. */
export interface FetchEnvelopeAddress {
	name: string | null;
	route: string | null;
	mailbox: string | null;
	host: string | null;
}

export interface FetchEnvelope {
	/** Raw wire date-text, exactly as sent -- never re-parsed into a `Date`
	 *  (RFC 9051 §7.5.2 does not require it to be a valid/parseable date). */
	date: string | null;
	subject: string | null;
	from: FetchEnvelopeAddress[];
	sender: FetchEnvelopeAddress[];
	replyTo: FetchEnvelopeAddress[];
	to: FetchEnvelopeAddress[];
	cc: FetchEnvelopeAddress[];
	bcc: FetchEnvelopeAddress[];
	inReplyTo: string | null;
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
	section: string;
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
	readonly buffered: boolean;
}

export interface FetchedMessage {
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
	 *  matching the parser's own case-insensitive section-atom handling. */
	part(section: string): FetchedPart | undefined;
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

	static fromBuffer(section: string, data: Buffer): FetchedPartImpl {
		return new FetchedPartImpl(section, BigInt(data.length), data, undefined);
	}

	static fromLiveStream(
		section: string,
		size: bigint,
		stream: LiteralBodyStream,
	): FetchedPartImpl {
		return new FetchedPartImpl(section, size, undefined, stream);
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
	fetch: Fetch,
	opts: { maxInlineSize: number; forcedStreamSections: ReadonlySet<string> },
): Promise<FetchedMessageImpl> {
	const parts = new Map<string, FetchedPartImpl>();

	const addStreamedOrBuffered = async (
		section: string,
		text: string | undefined,
		stream: { stream: LiteralBodyStream; length: number } | undefined,
	): Promise<void> => {
		if (stream) {
			const forceStream = opts.forcedStreamSections.has(section);
			if (!forceStream && stream.length <= opts.maxInlineSize) {
				const buf = await drainReadableAsync(stream.stream);
				parts.set(section, FetchedPartImpl.fromBuffer(section, buf));
			} else {
				parts.set(
					section,
					FetchedPartImpl.fromLiveStream(section, BigInt(stream.length), stream.stream),
				);
			}
		} else {
			const buf = Buffer.from(text ?? "", "utf8");
			parts.set(section, FetchedPartImpl.fromBuffer(section, buf));
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
				section.contents,
				section.stream ? { stream: section.stream.stream, length: section.stream.length } : undefined,
			);
		}
	}
	if (fetch.binarySections) {
		for (const bin of fetch.binarySections) {
			await addStreamedOrBuffered(
				bin.section,
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

	return new FetchedMessageImpl({
		seq: fetch.sequenceNumber,
		uid: fetch.uid?.id === "*" ? undefined : fetch.uid?.id,
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

	part(section: string): FetchedPart | undefined {
		// C3 fix: normalize the LOOKUP argument too, so `part("text")` and
		// `part("TEXT")` resolve the same entry regardless of which case the
		// caller used -- `partsMap`'s own keys are always the canonical
		// uppercase form already (`composeSectionSpecKey()`'s side of this
		// same fix, and the parser's own `MessageBodySection.kind`).
		return this.partsMap.get(normalizeSectionSpec(section));
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
