import { ParsingError } from "../../errors";
import { LexerTokenList, TokenTypes } from "../../lexer/types";
import { utf7 } from "../encoding";
import {
	getAStringValue,
	getNStringValue,
	getOriginalInput,
	matchesFormat,
	pairedArrayLoopGenerator,
	splitSpaceSeparatedList,
} from "../utility";

/** One entry/value pair (or bare entry name) inside a `* METADATA` response
 *  (RFC 5464 §4.4/§5.4). `value` is `null` for the value-less unsolicited
 *  form (`entry-list`, §4.4.2 — no value was ever on the wire), NEVER
 *  fabricated for a value that simply wasn't sent (I-6). A server that
 *  legitimately echoes an actual NIL value inside the with-values form
 *  (`entry-values`) is indistinguishable from this at the client boundary —
 *  RFC 5464 draws no distinction either, since `value = nstring / literal8`
 *  already treats NIL as "no value" wherever it appears. */
export interface MetadataEntry {
	/** The annotation entry name (e.g. `/private/comment`). */
	entry: string;
	/** The entry's value, or `null` when this entry came from the
	 *  value-less unsolicited form (no value was ever on the wire) or an
	 *  explicit wire `NIL` in the with-values form. */
	value: string | null;
}

/**
 * `* METADATA mailbox (entry value ...)` / `* METADATA mailbox entry entry
 * ...` (RFC 5464 §4.4 "METADATA Response" / §5 `metadata-resp` ABNF) — M5.4.
 * Two distinct wire shapes share one class:
 *
 *  - WITH-VALUES (`entry-values = "(" entry-value *(SP entry-value) ")"`,
 *    `entry-value = entry SP value`): the GETMETADATA result shape, always
 *    parenthesized.
 *  - VALUE-LESS (`entry-list = entry *(SP entry)`): the shape §4.4.2 MANDATES
 *    for an UNSOLICITED change notification ("Unsolicited METADATA responses
 *    MUST only contain entry names, not the values") — a bare,
 *    unparenthesized list of entry names with no values at all
 *    (RFC5464-4.4-2). A parser that only understood the with-values form
 *    would choke on this one.
 *
 * `hasValues` records which shape THIS INSTANCE actually parsed from (never
 * which shape a caller expected), so a consumer can tell "no values were on
 * the wire at all" apart from "every value happened to be NIL".
 *
 * The mailbox name goes through the same astring-extraction +
 * `utf7.decode()` treatment `MailboxStatus` (`structure/mailbox/status.ts`)
 * already applies to STATUS's own mailbox-name field — same rationale
 * (a quoted name's VALUE, not its surrounding quote characters; mUTF-7
 * decoded eagerly at the raw-parse layer, independent of whatever the live
 * UTF8=ACCEPT state happens to be at the time this line arrives). The
 * empty-string mailbox name (`""`) — RFC 5464's SERVER annotation
 * indicator, not a "no mailbox" placeholder — decodes to `""` unchanged.
 */
export class MetadataResponse {
	/** The mailbox this METADATA response is for (mUTF-7 decoded; the empty
	 *  string is RFC 5464's SERVER annotation indicator, not "no mailbox"). */
	public readonly mailbox: string;
	/** The entry/value pairs (or bare entry names) carried by this response. */
	public readonly entries: MetadataEntry[];
	/** Whether this instance was parsed from the with-values wire shape
	 *  (`true`) or the value-less unsolicited-notification shape (`false`). */
	public readonly hasValues: boolean;

	/**
	 * Tests whether `tokens` is an untagged METADATA response and, if so,
	 * parses it.
	 *
	 * @param tokens - The content tokens following the untagged `"* "` prefix.
	 * @returns A new {@link MetadataResponse}, or `null` if `tokens` is not
	 * a METADATA response.
	 */
	public static match(tokens: LexerTokenList): MetadataResponse | null {
		const isMatch = matchesFormat(tokens, [
			{ type: TokenTypes.atom, value: "METADATA" },
			{ sp: true },
		]);
		if (isMatch) {
			return new MetadataResponse(tokens.slice(2));
		}
		return null;
	}

	constructor(tokens: LexerTokenList) {
		const nextSpIndex = tokens.findIndex((token) => token.isType(TokenTypes.space));
		if (nextSpIndex <= 0) {
			throw new ParsingError("No mailbox name provided to METADATA response", tokens);
		}
		const nameTokens = tokens.slice(0, nextSpIndex);
		const restTokens = tokens.slice(nextSpIndex + 1);

		let nameValue: string;
		try {
			nameValue = getAStringValue(nameTokens);
		} catch {
			// Tolerance backstop (I-6), same posture as `MailboxStatus`'s
			// identical fallback: never choke the whole response over a name
			// shape this extraction can't model.
			nameValue = getOriginalInput(nameTokens);
		}
		this.mailbox = utf7.decode(nameValue);

		const firstMeaningful = restTokens.find((tkn) => !tkn.isType(TokenTypes.space));
		const isParenthesized =
			!!firstMeaningful &&
			firstMeaningful.isType(TokenTypes.operator) &&
			firstMeaningful.getTrueValue() === "(";

		this.entries = [];
		if (isParenthesized) {
			this.hasValues = true;
			const pairs = splitSpaceSeparatedList(restTokens);
			for (const [entryTokens, valueTokens] of pairedArrayLoopGenerator(pairs)) {
				if (!entryTokens || !entryTokens.length) {
					continue;
				}
				let entryName: string;
				try {
					entryName = getAStringValue(entryTokens);
				} catch {
					entryName = getOriginalInput(entryTokens);
				}
				let value: string | null = null;
				if (valueTokens && valueTokens.length) {
					try {
						value = getNStringValue(valueTokens);
					} catch {
						// Tolerance backstop (I-6): an odd value shape (e.g. a
						// non-conformant server's bare atom) still surfaces as its
						// raw wire text rather than dropping the entry entirely.
						value = getOriginalInput(valueTokens);
					}
				}
				this.entries.push({ entry: entryName, value });
			}
		} else {
			this.hasValues = false;
			const blocks = splitSpaceSeparatedList(restTokens, null, null);
			for (const entryTokens of blocks) {
				if (!entryTokens.length) {
					continue;
				}
				let entryName: string;
				try {
					entryName = getAStringValue(entryTokens);
				} catch {
					entryName = getOriginalInput(entryTokens);
				}
				this.entries.push({ entry: entryName, value: null });
			}
		}
	}
}
