import { ParsingError } from "../../errors";
import { ILexerToken, LexerTokenList, TokenTypes } from "../../lexer/types";
import { getOriginalInput, splitSpaceSeparatedList } from "../utility";
import { CapabilityList } from "./capability";
import { FlagList } from "./flag";
import { UIDSet } from "./uid";

export class AppendUIDTextCode {
	public readonly kind = "APPENDUID";
	public readonly uids: UIDSet;
	public readonly uidvalidity: number;

	constructor(tokens: LexerTokenList) {
		const [uidvalidity, uidset] = splitSpaceSeparatedList(
			tokens,
			null,
			null,
		);

		if (
			!uidvalidity ||
			uidvalidity.length !== 1 ||
			!uidvalidity[0].isType(TokenTypes.number) ||
			!uidset ||
			!uidset.length
		) {
			throw new ParsingError("Invalid format for APPENDUID", tokens);
		}

		this.uidvalidity = uidvalidity[0].getTrueValue();
		this.uids = new UIDSet(uidset);
	}
}

export class BadCharsetTextCode {
	public readonly kind = "BADCHARSET";
	public readonly contents: string[];

	constructor(tokens: LexerTokenList) {
		this.contents = splitSpaceSeparatedList(tokens).map((tkn): string =>
			getOriginalInput(tkn),
		);
	}
}

export class CapabilityTextCode {
	public readonly kind = "CAPABILITIES";
	public readonly capabilities: CapabilityList;

	constructor(tokens: LexerTokenList) {
		this.capabilities = new CapabilityList(tokens);
	}
}

export class CopyUIDTextCode {
	public readonly kind = "COPYUID";
	public readonly fromUIDs: UIDSet;
	public readonly toUIDs: UIDSet;
	public readonly uidvalidity: number;

	constructor(tokens: LexerTokenList) {
		const [uidvalidity, fromSet, toSet] = splitSpaceSeparatedList(
			tokens,
			null,
			null,
		);

		if (
			!uidvalidity ||
			uidvalidity.length !== 1 ||
			!uidvalidity[0].isType(TokenTypes.number) ||
			!fromSet ||
			!fromSet.length ||
			!toSet ||
			!toSet.length
		) {
			throw new ParsingError("Invalid format for COPYUID", tokens);
		}

		this.uidvalidity = uidvalidity[0].getTrueValue();
		this.fromUIDs = new UIDSet(fromSet);
		this.toUIDs = new UIDSet(toSet);
	}
}

export class ModifiedTextCode {
	public readonly kind = "MODIFIED";
	public readonly uids: UIDSet;

	constructor(tokens: LexerTokenList) {
		this.uids = new UIDSet(tokens);
	}
}

export class PermentantFlagsTextCode {
	public readonly kind = "PERMANENTFLAGS";
	public readonly flags: FlagList;

	constructor(tokens: LexerTokenList) {
		this.flags = new FlagList(tokens);
	}
}

export class AtomTextCode {
	public readonly contents?: string[];

	constructor(public readonly kind: string, tokens: LexerTokenList) {
		if (tokens && tokens.length) {
			this.contents = splitSpaceSeparatedList(tokens).map((tkn): string =>
				getOriginalInput(tkn),
			);
		}
	}
}

export class NumberTextCode {
	public readonly value: number | bigint;

	constructor(
		public readonly kind:
			| "HIGHESTMODSEQ"
			| "UIDNEXT"
			| "UIDVALIDITY"
			| "UNSEEN",
		tokens: LexerTokenList,
		allow64BitNumber = false,
	) {
		// spec: "UIDNEXT" SP nz-number
		const numToken = tokens[0];
		if (
			!numToken ||
			!(
				numToken.isType(TokenTypes.number) ||
				(allow64BitNumber && numToken.isType(TokenTypes.bigint))
			)
		) {
			throw new ParsingError(
				`Recieved invalid format for ${kind}`,
				tokens,
			);
		}

		const num = numToken.getTrueValue();
		if (num === 0) {
			throw new ParsingError(
				`Recieved invalid number for ${kind}`,
				numToken.value,
			);
		}
		this.value = num;
	}
}

export type TextCode =
	| AppendUIDTextCode
	| AtomTextCode
	| BadCharsetTextCode
	| CapabilityTextCode
	| CopyUIDTextCode
	| ModifiedTextCode
	| PermentantFlagsTextCode
	| NumberTextCode;

function isOpenToken(token: ILexerToken<unknown>) {
	return (
		token &&
		token.isType(TokenTypes.operator) &&
		token.getTrueValue() === "["
	);
}

function isCloseToken(token: ILexerToken<unknown>) {
	return (
		token &&
		token.isType(TokenTypes.operator) &&
		token.getTrueValue() === "]"
	);
}

export function match(
	tokens: LexerTokenList,
): null | { code: TextCode; endingIndex: number } {
	const matchedTokens: LexerTokenList = [];
	let endingIndex = 0;
	if (isOpenToken(tokens[0])) {
		for (; endingIndex < tokens.length; endingIndex++) {
			const token = tokens[endingIndex];
			matchedTokens.push(token);
			if (isCloseToken(token)) {
				break;
			}
		}
	}

	if (isCloseToken(matchedTokens[matchedTokens.length - 1])) {
		// We found a full text code so get the right class and return
		const kind = matchedTokens[1]?.value;
		const contents = matchedTokens.slice(2, -1);
		if (contents[0] && contents[0].isType(TokenTypes.space)) {
			contents.shift();
		}
		let code: TextCode = null;
		switch (kind) {
			case "APPENDUID":
				code = new AppendUIDTextCode(contents);
				break;
			case "BADCHARSET":
				code = new BadCharsetTextCode(contents);
				break;
			case "CAPABILITIES":
				code = new CapabilityTextCode(contents);
				break;
			case "COPYUID":
				code = new CopyUIDTextCode(contents);
				break;
			case "MODIFIED":
				code = new ModifiedTextCode(contents);
				break;
			case "PERMENANTFLAGS":
				code = new PermentantFlagsTextCode(contents);
				break;
			case "HIGHESTMODSEQ":
			case "UIDNEXT":
			case "UIDVALIDITY":
			case "UNSEEN":
				code = new NumberTextCode(
					kind,
					contents,
					kind === "HIGHESTMODSEQ", // MODSEQ allows 64-bit numbers
				);
				break;
			default:
				code = new AtomTextCode(kind, contents);
		}

		return {
			code,
			endingIndex,
		};
	}

	// TODO: Should we throw if we find an opening "[" value, but
	//       not a close one? Technically speaking the spec allows
	//       `text` to include an "[" (and even a "]") so, while it
	//       would be extremely confusing for the parser, a valid
	//       response can look like a text code without being one.
	//       So maybe a throw here isn't correct?

	// If we didn't find a code, return null indicating as much
	return null;
}
