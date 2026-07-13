import type { BodyPartRequest, FetchedMessage, FetchItems, FetchRequest } from "../client/fetch";
import { buildFetchedMessage, normalizeSectionSpec } from "../client/fetch";
import { CapabilityError } from "../errors";
import { Fetch } from "../parser";
import type { UntaggedResponse } from "../parser";
import { Command } from "./base";
import type { ResponseCollector } from "./collector";
import { CommandWriter } from "./writer";

/** Minimal structural shape `FetchCommand` needs from its sequence-set
 *  argument -- mirrors `CopyCommand`'s own `SequenceSetLike` (spec §5.1's
 *  `SequenceSet` is the real producer; kept structural for the same reason
 *  `CommandWriter.sequenceSet()` itself stays structural). */
export interface SequenceSetLike {
	toString(): string;
}

/** The minimal capability read surface FETCH's per-item gates need --
 *  structurally satisfied by `CapabilityView`/`MailboxSessionDriver.
 *  hasCapability` alike (same shape as `SearchCapabilityProbe`). */
export interface FetchCapabilityProbe {
	has(cap: string): boolean;
}

export const NO_FETCH_CAPS: FetchCapabilityProbe = { has: () => false };

const MACROS = new Set(["FAST", "ALL", "FULL"]);

function assertCap(caps: FetchCapabilityProbe, cap: string, field: string, rfc: string): void {
	if (!caps.has(cap)) {
		throw new CapabilityError(
			`FetchItems.${field} requires the ${cap} capability (${rfc}), which the ` +
				"server hasn't advertised",
			{ capability: cap, rfc },
		);
	}
}

/** RFC 9051 §6.4.5 folds BINARY/BINARY.SIZE into rev2's base command set (no
 *  separate capability token needed, RFC9051-6.4.5-2) -- same OR-capability
 *  fold-in pattern `MailboxSession.move()`'s MOVE-or-IMAP4rev2 gate uses
 *  (RFC 9051 §6.4.8). RFC 3501/rev1 servers still need the real BINARY
 *  capability (RFC 3516). */
function assertBinaryCap(caps: FetchCapabilityProbe, field: string): void {
	if (!caps.has("BINARY") && !caps.has("IMAP4rev2")) {
		throw new CapabilityError(
			`FetchItems.${field} requires the BINARY capability (RFC 3516) or an ` +
				"IMAP4rev2 server (RFC 9051 §6.4.5, which folds BINARY/BINARY.SIZE into " +
				"the base command set with no separate capability token), neither of " +
				"which the server has advertised",
			{ capability: "BINARY", rfc: "RFC3516" },
		);
	}
}

/** ATOM-CHAR-safe subset good enough for the overwhelming majority of real
 *  RFC 2822 header field names (letters/digits/hyphen and a handful of other
 *  punctuation) -- anything outside it falls back to a quoted string (same
 *  quoting `CommandWriter.astring()` would apply); a field name that would
 *  need CR/LF or 8-bit octets (never a realistic header name) is refused
 *  rather than silently mis-encoded, since embedding a literal inside this
 *  compound bracketed token would need multi-segment writer support this
 *  command doesn't implement (a deliberate, documented scope limit -- no
 *  real header field name needs it). */
const ATOM_SAFE_FIELD = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

function composeAstringToken(s: string): string {
	if (typeof s !== "string" || s.length === 0) {
		throw new RangeError("BodyPartRequest.fields: each field name must be a non-empty string");
	}
	if (ATOM_SAFE_FIELD.test(s)) {
		return s;
	}
	if (/[\r\n]/.test(s) || /[^\x20-\x7e]/.test(s)) {
		throw new RangeError(
			`BodyPartRequest.fields: ${JSON.stringify(s)} needs a literal to send safely, ` +
				"which this command doesn't support inside a HEADER.FIELDS list " +
				"(no real header field name needs 8-bit/control characters)",
		);
	}
	return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

const HEADER_FIELDS_RE = /^HEADER\.FIELDS(\.NOT)?$/i;

/**
 * Resolves whether a `BodyPartRequest` with `.fields` set is the
 * HEADER.FIELDS or HEADER.FIELDS.NOT form -- shared by `composeSectionSpec`
 * (the wire token) and `composeSectionSpecKey` (the `part()` lookup key) so
 * both apply the identical C4 fix (M3-phase-boundary review): when the
 * caller ALSO set `.section` alongside `.fields`, it must agree with the
 * HEADER.FIELDS family (case-insensitive) -- silently preferring `.fields`
 * and ignoring an inconsistent `.section` (e.g. `{section:"TEXT",
 * fields:[...]}`) would hide a caller bug that looks like it requested one
 * section but wire-compiled to a completely different one. An explicit
 * `.section: "HEADER.FIELDS.NOT"` is authoritative for the NOT-ness even
 * without `.not: true` -- `.section`, when given at all alongside `.fields`,
 * is treated as the caller's canonical intent for which of the two forms
 * this is.
 */
function resolveHeaderFieldsNot(part: BodyPartRequest): boolean {
	let isNot = part.not === true;
	if (part.section !== undefined) {
		const normalized = normalizeSectionSpec(part.section);
		if (normalized !== "HEADER.FIELDS" && normalized !== "HEADER.FIELDS.NOT") {
			throw new RangeError(
				`BodyPartRequest: 'section' (${JSON.stringify(part.section)}) conflicts with ` +
					"'fields' -- when 'fields' is set, 'section' (if also given) must be " +
					"HEADER.FIELDS or HEADER.FIELDS.NOT (case-insensitive, spec §5.4)",
			);
		}
		if (normalized === "HEADER.FIELDS.NOT") {
			isNot = true;
		}
	}
	return isNot;
}

/** Builds the bracket CONTENT (everything between `[` and `]`, exclusive)
 *  for one `BodyPartRequest` -- spec §5.4's `section` examples (`""`,
 *  `"1.2"`, `"HEADER"`, `"1.MIME"`, `"HEADER.FIELDS"`, `"TEXT"`) are
 *  normalized to their canonical uppercase form (C3 fix -- see
 *  `normalizeSectionSpec`'s own doc comment in `client/fetch.ts`);
 *  `HEADER.FIELDS`/`HEADER.FIELDS.NOT` additionally require `fields` and
 *  append the parenthesized header-name list. */
function composeSectionSpec(part: BodyPartRequest): string {
	if (part.fields !== undefined) {
		if (!Array.isArray(part.fields) || part.fields.length === 0) {
			throw new RangeError(
				"BodyPartRequest.fields must be a non-empty array when section is " +
					"HEADER.FIELDS/HEADER.FIELDS.NOT",
			);
		}
		const keyword = resolveHeaderFieldsNot(part) ? "HEADER.FIELDS.NOT" : "HEADER.FIELDS";
		const list = part.fields.map(composeAstringToken).join(" ");
		return `${keyword} (${list})`;
	}
	if (typeof part.section !== "string") {
		throw new RangeError("BodyPartRequest.section must be a string");
	}
	if (HEADER_FIELDS_RE.test(part.section)) {
		throw new RangeError(
			`BodyPartRequest.section ${JSON.stringify(part.section)} requires 'fields' ` +
				"(spec §5.4: HEADER.FIELDS/HEADER.FIELDS.NOT need the header-name list)",
		);
	}
	return normalizeSectionSpec(part.section);
}

function writeBodyPartItem(
	w: CommandWriter,
	part: BodyPartRequest,
	caps: FetchCapabilityProbe,
): void {
	if (part.binary) {
		assertBinaryCap(caps, "bodyParts[].binary");
		if (part.fields !== undefined) {
			throw new RangeError(
				"BodyPartRequest: 'binary' and 'fields' (HEADER.FIELDS) cannot be combined " +
					"-- RFC 3516 BINARY addresses leaf parts only, never a header field list",
			);
		}
	}
	const peek = part.peek === undefined ? true : part.peek;
	const spec = composeSectionSpec(part);
	const keyword = part.binary ? (peek ? "BINARY.PEEK" : "BINARY") : peek ? "BODY.PEEK" : "BODY";
	let token = `${keyword}[${spec}]`;
	if (part.partial) {
		const { start, length } = part.partial;
		if (!Number.isInteger(start) || start < 0) {
			throw new RangeError("BodyPartRequest.partial.start must be a non-negative integer");
		}
		if (!Number.isInteger(length) || length <= 0) {
			throw new RangeError("BodyPartRequest.partial.length must be a positive integer");
		}
		token += `<${start}.${length}>`;
	}
	w.raw(token);
}

/**
 * Writes every requested item in EXACTLY the order the caller's own
 * `FetchItems` object enumerates its keys (`Object.keys()`, insertion
 * order for string keys per the JS spec) -- deliberately NOT a fixed
 * canonical field order. Several compliance fixtures pin an exact
 * caller-chosen item order on the wire (e.g. `(PREVIEW ENVELOPE)` vs.
 * `(ENVELOPE PREVIEW (LAZY))` -- the same two items, opposite order,
 * both scripted verbatim), so the only order that satisfies both is
 * "whatever order the request itself was built in".
 */
function writeFetchItems(w: CommandWriter, items: FetchItems, uidGrain: boolean, caps: FetchCapabilityProbe): void {
	for (const key of Object.keys(items) as Array<keyof FetchItems>) {
		const value = items[key];
		if (value === undefined || value === false) {
			continue;
		}
		switch (key) {
			case "uid":
				if (!uidGrain) {
					w.atom("UID");
				}
				break;
			case "flags":
				w.atom("FLAGS");
				break;
			case "envelope":
				w.atom("ENVELOPE");
				break;
			case "internalDate":
				w.atom("INTERNALDATE");
				break;
			case "size":
				w.atom("RFC822.SIZE");
				break;
			case "bodyStructure":
				w.atom("BODYSTRUCTURE");
				break;
			case "body":
				w.atom("BODY");
				break;
			case "modSeq":
				assertCap(caps, "CONDSTORE", "modSeq", "RFC7162");
				w.atom("MODSEQ");
				break;
			case "emailId":
				assertCap(caps, "OBJECTID", "emailId", "RFC8474");
				w.atom("EMAILID");
				break;
			case "threadId":
				assertCap(caps, "OBJECTID", "threadId", "RFC8474");
				w.atom("THREADID");
				break;
			case "saveDate":
				assertCap(caps, "SAVEDATE", "saveDate", "RFC8514");
				w.atom("SAVEDATE");
				break;
			case "preview": {
				assertCap(caps, "PREVIEW", "preview", "RFC8970");
				w.atom("PREVIEW");
				const previewValue = value as boolean | { lazy?: boolean };
				const lazy = typeof previewValue === "object" && previewValue !== null && previewValue.lazy;
				if (lazy) {
					w.list((inner) => inner.atom("LAZY"));
				}
				break;
			}
			case "binarySize": {
				assertBinaryCap(caps, "binarySize");
				const sections = value as string[];
				if (!Array.isArray(sections) || sections.length === 0) {
					throw new RangeError("FetchItems.binarySize must be a non-empty string[]");
				}
				for (const section of sections) {
					if (typeof section !== "string") {
						throw new RangeError("FetchItems.binarySize: each entry must be a string");
					}
					w.raw(`BINARY.SIZE[${section}]`);
				}
				break;
			}
			case "gmail": {
				assertCap(caps, "X-GM-EXT-1", "gmail", "X-GM-EXT-1");
				const g = value as { msgId?: boolean; threadId?: boolean; labels?: boolean };
				if (g.msgId) w.atom("X-GM-MSGID");
				if (g.threadId) w.atom("X-GM-THRID");
				if (g.labels) w.atom("X-GM-LABELS");
				break;
			}
			case "bodyParts": {
				const parts = value as BodyPartRequest[];
				if (!Array.isArray(parts) || parts.length === 0) {
					throw new RangeError("FetchItems.bodyParts must be a non-empty array");
				}
				for (const part of parts) {
					writeBodyPartItem(w, part, caps);
				}
				break;
			}
			default:
				// Exhaustive per FetchItems' own keys; an unrecognized key on a
				// loosely-typed caller (non-TS) is tolerated as a no-op rather than
				// thrown -- same open posture the rest of this module's request-side
				// validation takes for genuinely-unknown extra fields.
				break;
		}
	}
}

/** Collects every `BodyPartRequest.section` string marked `stream: true` --
 *  used by `buildFetchedMessage()` (spec §5.4) to force a live stream for
 *  that section regardless of its declared size vs. `maxInlineSize`. */
function collectForcedStreamSections(request: FetchRequest): ReadonlySet<string> {
	const out = new Set<string>();
	if (typeof request === "object" && request.bodyParts) {
		for (const part of request.bodyParts) {
			if (part.stream) {
				out.add(composeSectionSpecKey(part));
			}
		}
	}
	return out;
}

/** The section-string KEY `buildFetchedMessage()` will use for this part's
 *  response (the server's echo, sans `HEADER.FIELDS`'s own field list --
 *  see `src/client/fetch.ts`'s `FetchedMessage.part()` doc comment for the
 *  parser-level limitation this works around). C3 fix: normalized to the
 *  same canonical uppercase form `composeSectionSpec()`/the parser's own
 *  `MessageBodySection.kind` use, via the shared `normalizeSectionSpec()`.
 *  C4 fix: shares `resolveHeaderFieldsNot()`'s conflict detection with
 *  `composeSectionSpec()` so an inconsistent `.section` alongside `.fields`
 *  is caught here too (this function runs during `FetchCommand`'s
 *  constructor, via `collectForcedStreamSections()`, ahead of
 *  `composeSectionSpec()`'s own call in the same constructor -- either one
 *  throwing satisfies "zero bytes written on refusal", I-9). */
function composeSectionSpecKey(part: BodyPartRequest): string {
	if (part.fields !== undefined) {
		return resolveHeaderFieldsNot(part) ? "HEADER.FIELDS.NOT" : "HEADER.FIELDS";
	}
	return normalizeSectionSpec(part.section);
}

function compileFetchWire(
	w: CommandWriter,
	set: SequenceSetLike,
	request: FetchRequest,
	uidGrain: boolean,
	caps: FetchCapabilityProbe,
): void {
	w.sequenceSet(set);
	if (typeof request === "string") {
		const macro = request.toUpperCase();
		if (!MACROS.has(macro)) {
			throw new RangeError(
				`FETCH macro must be one of "fast"|"all"|"full" (case-insensitive); got ${JSON.stringify(request)}`,
			);
		}
		w.atom(macro);
		return;
	}
	if (typeof request !== "object" || request === null || Array.isArray(request)) {
		throw new RangeError("FETCH request must be a macro string or a FetchItems object");
	}
	if (Object.keys(request).length === 0) {
		throw new RangeError("FETCH requires at least one data item (empty FetchItems object)");
	}
	w.list((inner) => writeFetchItems(inner, request, uidGrain, caps));
}

/**
 * FETCH / UID FETCH (RFC 3501/9051 §6.4.5/§6.4.9; RFC 3516 BINARY; RFC 7162
 * MODSEQ; RFC 8474 OBJECTID; RFC 8514 SAVEDATE; RFC 8970 PREVIEW; Gmail
 * X-GM-EXT-1) -- M3.5, spec §5.4/§5b, the FETCH engine.
 *
 * `queueMode: "pipeline"` (spec §6.1: FETCH is explicitly listed as ordinary
 * data flow with no state change; multiple FETCH/UID FETCH commands may be
 * concurrently in flight). All capability gates (per-item, see
 * `writeFetchItems`/`writeBodyPartItem` above) happen inside `write()`,
 * which the constructor also runs ONCE against a throwaway `CommandWriter`
 * purely to surface any `CapabilityError`/`RangeError` synchronously at
 * construction time (I-9) -- mirroring `SearchCommand`'s established
 * precompile-for-validation convention exactly.
 *
 * STREAMING (spec §7.3/§5.4, the M3.4 collector bridge's first consumer):
 * `onCollectorReady()` captures a reference to this command's own LIVE
 * `ResponseCollector` the instant it exists (before a single byte is
 * written) -- `messages()` is a lazy async generator that walks
 * `collector.live("FETCH")`, converting each claimed untagged FETCH
 * response into a `FetchedMessage` (via `buildFetchedMessage`,
 * `src/client/fetch.ts`) as it arrives, WITHOUT waiting for this command's
 * tagged response. `MailboxSession.fetch()` calls `messages()` directly
 * (not through `accept()`/the command's own resolved promise, which still
 * only resolves after the full round trip, unchanged from every earlier
 * command) so a multi-message FETCH yields message 1 to its caller while
 * message 2/3/tagged-OK are still in flight on the wire. `accept()` itself
 * (still invoked exactly once, after `settle()`, same as always) returns an
 * equivalent (but independent-cursor, see `ResponseCollector.live()`'s own
 * fan-out doc comment) async iterable, for API completeness / any caller
 * that reaches this command through the generic `client.run()` escape
 * hatch instead of `MailboxSession.fetch()`.
 *
 * Default claiming (`Command`'s own default `claims()`, unoverridden here):
 * matches every untagged response of type "FETCH" while this command is in
 * flight -- taken alone, that's the same "first in-flight claimant wins, in
 * write order" limitation every other message-op command documents (e.g.
 * `SearchCommand`'s own doc comment). S3 fix (M3-phase-boundary review,
 * RFC3501-5.5): `MailboxSession`/`.seq` never actually let two of ITS OWN
 * fetch()/seq.fetch()/fetchOne() calls overlap on the wire in the first
 * place -- `MailboxSession.runFetch()`'s `chainFamily()` call defers a
 * second same-session fetch's dispatch until the first's tagged response has
 * already arrived (see that method's own doc comment), so THIS class's
 * `claims()` is never actually asked to disambiguate two of the session's
 * own concurrent FETCHes. The residual ambiguity this comment used to warn
 * about in full is now narrowed to exactly one case: a genuinely unrelated
 * FETCH FLAGS update the SERVER pushes unsolicited (RFC 3501/9051 §7.4.2)
 * while this command is in flight, which lands here rather than the
 * state-tracker lane -- a standing, accepted protocol-level ambiguity no
 * client-side bookkeeping can perfectly disambiguate, since that push
 * carries no correlator of its own either. A caller reaching `FetchCommand`
 * directly via the `client.run()` escape hatch (bypassing `MailboxSession`
 * entirely) is on its own for the same reason `SearchCommand`'s escape-hatch
 * callers are: nothing outside `MailboxSession` enforces the family-level
 * serialization above.
 */
export class FetchCommand extends Command<AsyncIterable<FetchedMessage>> {
	readonly verb: string;
	readonly queueMode = "pipeline" as const;
	readonly states = ["selected"] as const;

	private readonly set: SequenceSetLike;
	private readonly request: FetchRequest;
	private readonly uidGrain: boolean;
	private readonly caps: FetchCapabilityProbe;
	private readonly maxInlineSizeValue: number;
	private readonly forcedStreamSections: ReadonlySet<string>;

	private collector: ResponseCollector | undefined;
	private resolveCollectorReady!: () => void;
	private readonly collectorReady: Promise<void>;

	constructor(
		set: SequenceSetLike,
		request: FetchRequest,
		uidGrain: boolean,
		maxInlineSize: number,
		caps: FetchCapabilityProbe = NO_FETCH_CAPS,
	) {
		super();
		this.verb = uidGrain ? "UID FETCH" : "FETCH";
		this.set = set;
		this.request = request;
		this.uidGrain = uidGrain;
		this.caps = caps;
		this.maxInlineSizeValue = maxInlineSize;
		this.forcedStreamSections =
			typeof request === "object" ? collectForcedStreamSections(request) : new Set();
		// Pre-compile once against a throwaway writer purely to surface any
		// CapabilityError/RangeError synchronously, before this command is ever
		// submitted (I-9) -- SearchCommand's own established precedent.
		compileFetchWire(new CommandWriter({ has: (cap) => caps.has(cap) }), set, request, uidGrain, caps);
		this.collectorReady = new Promise((resolve) => {
			this.resolveCollectorReady = resolve;
		});
	}

	protected write(w: CommandWriter): void {
		compileFetchWire(w, this.set, this.request, this.uidGrain, this.caps);
	}

	protected onCollectorReady(c: ResponseCollector): void {
		this.collector = c;
		this.resolveCollectorReady();
	}

	/**
	 * Lazily consumes this command's own live collector (see this class's
	 * doc comment) -- awaits `onCollectorReady()` first so it's safe to call
	 * before this command has even been submitted to a queue (the M3.5
	 * design: `MailboxSession.fetch()` calls this the instant the command is
	 * constructed, racing it against the actual dispatch).
	 */
	async *messages(): AsyncGenerator<FetchedMessage, void, void> {
		await this.collectorReady;
		for await (const resp of this.collector!.live("FETCH")) {
			const content = (resp as UntaggedResponse).content;
			if (!(content instanceof Fetch)) {
				continue;
			}
			yield await buildFetchedMessage(content, {
				maxInlineSize: this.maxInlineSizeValue,
				forcedStreamSections: this.forcedStreamSections,
			});
		}
	}

	protected accept(_c: ResponseCollector): AsyncIterable<FetchedMessage> {
		return { [Symbol.asyncIterator]: () => this.messages() };
	}
}
