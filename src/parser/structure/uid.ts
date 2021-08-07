import { ParsingError } from "../../errors";
import { LexerTokenList, TokenTypes } from "../../lexer/types";

// From spec: "UID" SP uniqueid
export class UID {
	constructor(public readonly id: number) {}
}

// From spec: uid-range       = (uniqueid ":" uniqueid)
export class UIDRange {
	constructor(
		public readonly startId: number,
		public readonly endId: number,
	) {
		// Make sure we have the UIDs in order
		//
		// From spec:
		//   two uniqueid values and all values
		//   between these two regards of order.
		//   Example: 2:4 and 4:2 are equivalent
		if (this.endId < this.startId) {
			[this.startId, this.endId] = [this.endId, this.startId];
		}
	}
}

export class UIDSet {
	public readonly set: (UID | UIDRange)[];

	constructor(tokens: LexerTokenList) {
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
				!uid ||
				!uid.isType(TokenTypes.number) ||
				(maybeColon &&
					!(
						maybeColon.isType(TokenTypes.operator) &&
						maybeColon.value === ":"
					)) ||
				(maybeUID && !maybeUID.isType(TokenTypes.number))
			) {
				throw new ParsingError(
					"Invalid format for UID set value",
					block,
				);
			}

			if (maybeUID) {
				this.set.push(
					new UIDRange(
						uid.getTrueValue(),
						maybeUID.getTrueValue() as number,
					),
				);
			} else {
				this.set.push(new UID(uid.getTrueValue()));
			}
		}
	}
}
