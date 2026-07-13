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

/** spec §5b: type-complete, CONDSTORE/QRESYNC-inert this milestone -- both
 *  fields throw `CapabilityError` before any bytes are written (I-9),
 *  mirroring the `SelectOptions.condstore`/`.qresync` precedent (M2.2). */
export interface FetchModifiers {
	changedSince?: bigint;
	vanished?: boolean;
}

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

export interface FetchedPart {
	section: string;
	/** Literal size as sent (bigint, spec §11.3 number64 class). */
	size: bigint;
	/** Rejects if this part was already handed out via `stream()` (see this
	 *  interface's own class doc comment on `FetchedPartImpl` for the exact
	 *  rule). Resolves immediately for an already-buffered part. */
	buffer(): Promise<Buffer>;
	/** Node `Readable` (spec's `ReadableStream<Uint8Array> | Readable` widened
	 *  form -- this implementation always hands back a Node `Readable`, the
	 *  native type every literal in this codebase is already represented
	 *  as). Replays from the cached buffer for an already-buffered part. */
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
		return this.partsMap.get(section);
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
}
