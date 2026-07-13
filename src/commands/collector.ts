import {
	AppendUIDTextCode,
	AtomTextCode,
	CapabilityTextCode,
	CopyUIDTextCode,
	NumberTextCode,
	PermanentFlagsTextCode,
	TaggedResponse,
	UntaggedResponse,
} from "../parser";
import { UID, UIDRange } from "../parser/structure/uid";
import type { UIDSet } from "../parser/structure/uid";
import type { TextCode } from "../parser/structure/text.code";
import type { TypedResponseCode } from "../protocol/response-codes";

/** Expands a parsed `UIDSet` (individual UIDs and `a:b` ranges, per RFC
 *  3501/9051 §9 `uid-set`) into an ascending flat list of concrete numbers,
 *  used by the `COPYUID` handling below. RFC 4315's `resp-code-copy` grammar
 *  never legitimately puts `"*"` in either uid-set here (that placeholder is
 *  a `sequence-set`-only wildcard, meaningless once the server has assigned
 *  real destination UIDs) -- a `"*"`-bearing element is skipped rather than
 *  guessed at, tolerating a non-conformant server without inventing a number
 *  (I-6). */
function expandUidSet(set: UIDSet): number[] {
	const out: number[] = [];
	for (const el of set.set) {
		if (el instanceof UIDRange) {
			if (typeof el.startId === "number" && typeof el.endId === "number") {
				for (let n = el.startId; n <= el.endId; n++) {
					out.push(n);
				}
			}
		} else if (typeof el.id === "number") {
			out.push(el.id);
		}
	}
	return out;
}

/** Strips one layer of surrounding DQUOTEs, mirroring `commands/status.ts`'s
 *  private helper of the same shape (BADURL's `url-resp-text` argument is a
 *  quoted `astring`, e.g. `"/Sent;UIDVALIDITY=.../;UID=20"`). */
function stripQuotes(s: string): string {
	if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
		return s.slice(1, -1);
	}
	return s;
}

/**
 * Converts one of the parser's internal `TextCode` variants into the public
 * `TypedResponseCode` shape (spec §5.5). The full discriminated union (one
 * variant per known code, with typed argument shapes) accretes as each
 * command needs its own codes -- M2.2 (SELECT/EXAMINE) is the first
 * consumer, adding CLOSED/PERMANENTFLAGS/UIDVALIDITY/UIDNEXT/HIGHESTMODSEQ/
 * NOMODSEQ/UIDNOTSTICKY/MAILBOXID. Everything else still surfaces through
 * the open `{ name, args }` fallback shape, rendered from whatever
 * structured data each `TextCode` class happens to carry. This is
 * intentionally conservative: codes this function doesn't know how to
 * render args for still surface (by name), they just carry `args: null`
 * rather than a guessed-at string — never an error, per the tolerance
 * invariant (I-6).
 */
export function toTypedResponseCode(
	code: TextCode | undefined | null,
): TypedResponseCode | null {
	if (!code) {
		return null;
	}
	const name = String((code as { kind: unknown }).kind).toUpperCase();
	if (code instanceof AppendUIDTextCode) {
		// RFC 4315 (UIDPLUS): single-message APPEND always carries exactly one
		// `uniqueid` here (never a range/set -- that's MULTIAPPEND's grammar,
		// RFC 3502, M3). `first` is defensively checked rather than assumed:
		// an `UID` instance with a numeric `.id` is the only grammar-legal
		// shape; `0` is never a real IMAP UID (nz-number) and documents "the
		// server sent something this parse can't have produced" without
		// inventing an error for tolerated-but-odd data (I-6).
		const first = code.uids.set[0];
		const uid = first instanceof UID && typeof first.id === "number" ? first.id : 0;
		return { name: "APPENDUID", uidValidity: code.uidvalidity, uid };
	}
	if (code instanceof CopyUIDTextCode) {
		return {
			name: "COPYUID",
			uidValidity: code.uidvalidity,
			sourceUids: expandUidSet(code.fromUIDs),
			destUids: expandUidSet(code.toUIDs),
		};
	}
	if (code instanceof PermanentFlagsTextCode) {
		return { name: "PERMANENTFLAGS", flags: code.flags.flags.map((f) => f.name) };
	}
	if (code instanceof NumberTextCode) {
		switch (name) {
			case "UIDVALIDITY":
				return { name: "UIDVALIDITY", value: code.value as number };
			case "UIDNEXT":
				return { name: "UIDNEXT", value: code.value as number };
			case "HIGHESTMODSEQ":
				return {
					name: "HIGHESTMODSEQ",
					value: typeof code.value === "bigint" ? code.value : BigInt(code.value),
				};
			default:
				// UNSEEN and any future NumberTextCode kind: no dedicated
				// variant yet -- open fallback, rendered as a plain string.
				return { name, args: String(code.value) };
		}
	}
	if (code instanceof AtomTextCode) {
		switch (name) {
			case "CLOSED":
				return { name: "CLOSED" };
			case "NOMODSEQ":
				return { name: "NOMODSEQ" };
			case "UIDNOTSTICKY":
				return { name: "UIDNOTSTICKY" };
			case "USEATTR":
				// RFC 6154 §3 (M2.3/CREATE): argument-less refusal code on a
				// tagged NO to a special-use CREATE.
				return { name: "USEATTR" };
			case "MAILBOXID":
				return { name: "MAILBOXID", value: code.contents?.[0] ?? null };
			case "TOOBIG":
				// RFC 4469/RFC 7889: argument-less tagged-NO code (over-size
				// APPEND, either the CATENATE 4-GB ceiling or an APPENDLIMIT
				// rejection).
				return { name: "TOOBIG" };
			case "BADURL": {
				// RFC 4469 §5: `badurl-response-code = "BADURL" SP url-resp-text`
				// -- a single quoted-astring argument (the offending IMAP URL).
				const raw = code.contents?.[0];
				return { name: "BADURL", url: raw ? stripQuotes(raw) : "" };
			}
			case "APPENDLIMIT": {
				// RFC 7889 (M2.9): the same atom that serves as a STATUS item
				// also appears as a resp-code carrying the advertised limit.
				// A missing or non-numeric argument surfaces as `null` rather
				// than an error (I-6).
				const raw = code.contents?.[0];
				return {
					name: "APPENDLIMIT",
					value: raw !== undefined && /^\d+$/.test(raw) ? BigInt(raw) : null,
				};
			}
			default:
				return {
					name,
					args: code.contents && code.contents.length ? code.contents.join(" ") : null,
				};
		}
	}
	if (code instanceof CapabilityTextCode) {
		return {
			name,
			args: code.capabilities.capabilities.map((cap) => cap.fullValue).join(" "),
		};
	}
	// Every other known TextCode variant with a structured (non-flat-string)
	// payload -- MODIFIED -- gets its own typed variant (spec §5.5) as
	// future work, landing with the command that first needs it (APPENDUID's
	// own variant landed with M2.11's APPEND above; COPYUID's landed with
	// M3.8's COPY/MOVE above). Surface the code's name with no rendered args
	// rather than guessing at a string representation.
	return { name, args: null };
}

/**
 * Accumulates the responses the router attributed to one in-flight command
 * (spec §7.3): every untagged response `claims()` returned `true` for (in
 * arrival order), plus the tagged response that completed the command.
 *
 * SEAM (documented, not implemented here): the FETCH streaming bridge — a
 * claimed FETCH response with a pending literal exposed as a stream
 * *during* collection, before the tagged OK — lands with the FETCH command
 * in M3. This class already hands `accept()` the exact list of claimed
 * responses in arrival order, so nothing here needs to change shape for
 * that later addition; a future `FetchCommand.accept()` can inspect/consume
 * live data out of the same `claimed` array this constructor is given.
 */
export class ResponseCollector {
	private readonly claimed: readonly UntaggedResponse[];
	private readonly taggedResp: TaggedResponse;

	constructor(claimed: readonly UntaggedResponse[], tagged: TaggedResponse) {
		this.claimed = claimed;
		this.taggedResp = tagged;
	}

	/** Every claimed untagged response, optionally filtered to one `.type`
	 *  (case-insensitive), in arrival order. */
	untagged(type?: string): UntaggedResponse[] {
		if (type === undefined) {
			return [...this.claimed];
		}
		const wanted = type.toUpperCase();
		return this.claimed.filter((resp) => resp.type === wanted);
	}

	/** The first claimed untagged response of `.type` (case-insensitive), or
	 *  `undefined` if none was claimed. */
	first(type: string): UntaggedResponse | undefined {
		const wanted = type.toUpperCase();
		return this.claimed.find((resp) => resp.type === wanted);
	}

	/** The tagged response that completed this command. */
	tagged(): TaggedResponse {
		return this.taggedResp;
	}

	/** Typed response codes carried by every claimed status response, plus
	 *  the tagged line's own code if present, in arrival order (spec §7.3). */
	codes(): TypedResponseCode[] {
		const out: TypedResponseCode[] = [];
		for (const resp of this.claimed) {
			const content = resp.content as { text?: { code?: TextCode } } | undefined;
			const code = toTypedResponseCode(content?.text?.code);
			if (code) {
				out.push(code);
			}
		}
		const taggedCode = toTypedResponseCode(this.taggedResp.status.text?.code);
		if (taggedCode) {
			out.push(taggedCode);
		}
		return out;
	}
}
