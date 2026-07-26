import { ParsingError } from "../../errors";
import { LexerTokenList, TokenTypes } from "../../lexer/types";

/**
 * A single parsed `uniqueid` token (`"UID" SP uniqueid`, RFC 3501/9051 §9
 * sequence-set-like grammar, applied to UIDs).
 */
export class UID {
	constructor(
		/** The UID value, or `"*"` for the largest UID in use (the wire
		 *  placeholder meaning "the last message in the mailbox"). */
		public readonly id: number | "*",
	) {}
}

// From spec: uid-range       = (uniqueid ":" uniqueid)
export class UIDRange {
	constructor(
		public readonly startId: number | "*",
		public readonly endId: number | "*",
	) {
		// Make sure we have the UIDs in order
		//
		// From spec:
		//   two uniqueid values and all values
		//   between these two regards of order.
		//   Example: 2:4 and 4:2 are equivalent
		if (
			this.endId < this.startId ||
			(this.startId === "*" && this.endId !== "*")
		) {
			[this.startId, this.endId] = [this.endId, this.startId];
		}
	}
}

/**
 * M27 review finding: {@link UIDSet} parses two grammar shapes that are
 * ALMOST but not quite the same. RFC3501/9051 §9's `uid-set` (used for
 * APPENDUID/COPYUID's uid-set, and VANISHED/ESEARCH's `known-uids`/`ALL`
 * results in practice) is built from `uniqueid = nz-number` -- a real UID can
 * never be `"*"`. But RFC 7162 §3.8's `MODIFIED` resp-text-code carries a
 * plain `sequence-set` (`seq-number = nz-number / "*"`), which explicitly
 * DOES allow the `"*"` wildcard (meaning "the largest sequence number/UID in
 * the mailbox") -- e.g. a conditional `STORE 2:* +FLAGS ...` that partially
 * fails can legally report back `[MODIFIED 2:*]`. Before this option
 * existed, `ModifiedTextCode` fed straight into the `uid-set`-only parsing
 * below, so a wire-legal `"*"` in a MODIFIED set threw `ParsingError`
 * instead of parsing.
 */
export interface UIDSetOptions {
	/** Whether a bare `"*"` operator token is accepted anywhere a UID/uid
	 *  endpoint is expected, in addition to a `TokenTypes.number` token
	 *  (default `false`, matching `uid-set`'s `uniqueid = nz-number` --
	 *  callers parsing a genuine `sequence-set`, e.g. `MODIFIED`, opt in). */
	allowWildcard?: boolean;
}

export class UIDSet {
	public readonly set: (UID | UIDRange)[];

	constructor(tokens: LexerTokenList, options: UIDSetOptions = {}) {
		const allowWildcard = options.allowWildcard ?? false;
		const isValidEndpoint = (token: LexerTokenList[number] | undefined) =>
			!!token &&
			(token.isType(TokenTypes.number) ||
				(allowWildcard &&
					token.isType(TokenTypes.operator) &&
					token.getTrueValue() === "*"));
		const endpointValue = (token: LexerTokenList[number]): number | "*" =>
			token.isType(TokenTypes.number) ? token.getTrueValue() : "*";

		// Split on ","
		const list: LexerTokenList[] = tokens.reduce((split, token) => {
			if (
				!split.length ||
				(token.isType(TokenTypes.operator) &&
					token.getTrueValue() === ",")
			) {
				split.push([]);

				// We have a "," so just return. We don't want to add it
				if (split.length > 1) {
					return split;
				}
			}
			split[split.length - 1].push(token);

			return split;
		}, [] as LexerTokenList[]);

		this.set = [];
		for (const block of list) {
			if (block.length !== 1 && block.length !== 3) {
				throw new ParsingError(
					"Unable to split UID set into UIDs and Ranges",
					tokens,
				);
			}
			const [uid, maybeColon, maybeUID] = block;

			if (
				!isValidEndpoint(uid) ||
				(maybeColon &&
					!(
						maybeColon.isType(TokenTypes.operator) &&
						maybeColon.value === ":"
					)) ||
				(maybeUID && !isValidEndpoint(maybeUID))
			) {
				throw new ParsingError(
					"Invalid format for UID set value",
					block,
				);
			}

			if (maybeUID) {
				this.set.push(
					new UIDRange(endpointValue(uid), endpointValue(maybeUID)),
				);
			} else {
				this.set.push(new UID(endpointValue(uid)));
			}
		}
	}
}
