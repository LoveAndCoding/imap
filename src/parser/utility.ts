import { ParsingError } from "../errors";
import { LiteralBodyStream } from "../literal-body-stream";
import {
	ILexerToken,
	LexerTokenList,
	LiteralStreamPayload,
	TokenTypes,
} from "../lexer/types";
import { ciEquals } from "../lexer/case-insensitive";

export function* pairedArrayLoopGenerator<T>(arr: T[]): Generator<[T, T]> {
	for (let i = 0; i < arr.length; i += 2) {
		yield [arr[i], arr[i + 1]];
	}
}

export function splitSpaceSeparatedList(
	listTokens: LexerTokenList | null | undefined,
	startTokenValue: string | null = "(",
	endTokenValue: string | null = ")",
): LexerTokenList[] {
	// Safety check to skip a null value here
	if (!listTokens) {
		return [];
	}

	const blocks: LexerTokenList[] = [];
	let currBlock: LexerTokenList | undefined;

	// Mark the list as started if we don't have a token marking the
	// starting point (i.e. consider us in the list already)
	let startedList = !startTokenValue;
	let nestedListDepth = 0;
	for (const token of listTokens) {
		// If we're at the start of the list, mark it and proceed
		if (
			!startedList &&
			token.isType(TokenTypes.operator) &&
			token.getTrueValue() === startTokenValue
		) {
			startedList = true;
			continue;
		} else if (
			token.isType(TokenTypes.operator) &&
			token.getTrueValue() === startTokenValue
		) {
			nestedListDepth++;
		}

		if (!startedList) {
			// If we're not in the list yet, move on
			continue;
		}

		// If we're at a space and not nested, split
		if (token.isType(TokenTypes.space) && !nestedListDepth) {
			currBlock = [];
			blocks.push(currBlock);
		} else if (
			!nestedListDepth &&
			endTokenValue &&
			token.isType(TokenTypes.operator) &&
			token.getTrueValue() === endTokenValue
		) {
			break;
		} else {
			// Otherwise if we haven't started a block, start one
			if (!currBlock) {
				currBlock = [];
				blocks.push(currBlock);
			}

			// ... and push our token onto the current block
			currBlock.push(token);

			// Also, if we're at the end of a nested list, mark it
			if (
				endTokenValue &&
				token.isType(TokenTypes.operator) &&
				token.getTrueValue() === endTokenValue
			) {
				nestedListDepth--;
			}
		}
	}

	return blocks;
}

export function splitUnseparatedListofLists(tokens: LexerTokenList) {
	const lists: LexerTokenList[] = [];
	let currList: LexerTokenList | null = null;
	let openParenCount = 0;

	for (const tkn of tokens) {
		if (tkn.isType(TokenTypes.operator) && tkn.getTrueValue() === "(") {
			if (!openParenCount) {
				// Starting a new block
				currList = [];
				lists.push(currList);
			}
			openParenCount++;
		}

		if (currList) {
			currList.push(tkn);
		}

		if (tkn.isType(TokenTypes.operator) && tkn.getTrueValue() === ")") {
			openParenCount--;
			if (!openParenCount) {
				currList = null;
			}
		}
	}

	return lists;
}

export function getOriginalInput(tokens: LexerTokenList) {
	return tokens.reduce((input, token) => input + token.value, "");
}

export function getAStringValue(tokens: LexerTokenList): string {
	if (tokens.length < 1) {
		throw new ParsingError(
			"Must have at least one token for an astring value",
			tokens,
		);
	} else if (tokens.length > 1 && tokens[0].isType(TokenTypes.string)) {
		throw new ParsingError(
			"Cannot have multiple strings in an astring value",
			tokens,
		);
	} else if (
		tokens.some(
			(t) => t.isType(TokenTypes.space) || t.isType(TokenTypes.eol),
		)
	) {
		throw new ParsingError(
			"Cannot have whitespace in an astring value",
			tokens,
		);
	}

	// If we have only a single token, just return that value
	if (tokens.length === 1) {
		const tkn = tokens[0];
		// Technically speaking NIL is an atom, it's just sometimes
		// a special atom. But astring's don't support NIL values so
		// we're gonna treat NIL here as a regular atom
		return tkn.isType(TokenTypes.nil) ? tkn.value : `${tkn.getTrueValue()}`;
	}

	// Otherwise, we have an atom, likely with some special
	// characters. Just concat the raw values
	return getOriginalInput(tokens);
}

/**
 * §11.4 defensive helper: synchronously drains a streamed literal's
 * `Readable` into a `Buffer`. This is the "one shared helper" every
 * NON-FETCH structure parser routes through (via `getNStringValue` below,
 * or directly for a caller that needs raw bytes rather than an nstring) when
 * it meets a `TokenTypes.literalStream` token -- correctness is preserved
 * even if a server sends an absurd literal where a small value is expected
 * (ENVELOPE/ADDRESS/BODYSTRUCTURE metadata/ID pairs/HEADER, etc.): the
 * value still gets fully buffered, just via a live stream's bytes instead
 * of the lexer's ordinary string accumulation. Memory profile is no worse
 * than the old always-buffer-everything design.
 *
 * I-6 (tolerance): if the stream's declared bytes haven't ALL arrived yet
 * at the moment this runs (only possible if a genuinely oversized literal
 * was ALSO fragmented across multiple TCP segments in an unexpected
 * position -- true FETCH body/RFC822/HEADER consumption never reaches this
 * function, since it stays lazy instead, see `body.section.ts`), this
 * throws a `ParsingError` rather than silently returning a truncated value
 * or hanging: a malformed/oversized literal framing claim becomes a normal
 * parse error.
 */
export function drainReadableSync(stream: LiteralBodyStream): Buffer {
	const chunks: Buffer[] = [];
	let chunk: Buffer | null;
	while ((chunk = stream.read() as Buffer | null) !== null) {
		chunks.push(chunk);
	}
	if (!stream.complete) {
		throw new ParsingError(
			`Streamed literal (${stream.byteLength} octet(s)) encountered where a fully-buffered value was structurally required, and its bytes have not all arrived yet. This can happen when a server sends an oversized/fragmented literal in a position (e.g. an ENVELOPE/ADDRESS/BODYSTRUCTURE/ID field) where only a small value is expected.`,
		);
	}
	return Buffer.concat(chunks);
}

export function isLiteralStreamToken(
	token: ILexerToken<unknown>,
): token is ILexerToken<LiteralStreamPayload> {
	return token.isType(TokenTypes.literalStream);
}

export function drainLiteralStreamToken(token: ILexerToken<unknown>): Buffer {
	if (!isLiteralStreamToken(token)) {
		throw new ParsingError("Expected a streamed literal token", [token]);
	}
	return drainReadableSync(token.getTrueValue().stream);
}

export function getNStringValue(
	token: ILexerToken<unknown> | LexerTokenList,
): null | string {
	if (Array.isArray(token) && token.length !== 1) {
		throw new ParsingError(
			"One and only one token can be parsed into nstring value.",
			token,
		);
	} else if (Array.isArray(token)) {
		[token] = token;
	}

	if (token.isType(TokenTypes.nil)) {
		return null;
	}
	if (token.isType(TokenTypes.string)) {
		return token.getTrueValue();
	}
	if (isLiteralStreamToken(token)) {
		// Defensive drain (see `drainReadableSync` above) -- every
		// getNStringValue() caller besides `body.section.ts`'s own
		// FETCH-body-section lazy path routes through here.
		return drainLiteralStreamToken(token).toString("utf8");
	}

	throw new ParsingError(
		`Cannot convert token type ${token.type} to nstring value`,
		[token],
	);
}

export function getSpaceSeparatedStringList(
	tokens: LexerTokenList,
	allowEmpty = false,
): string[] {
	const list: string[] = [];
	const splitTokens = splitSpaceSeparatedList(tokens);
	for (const [shouldBeString, ...shouldBeEmpty] of splitTokens) {
		if (!shouldBeString.isType(TokenTypes.string) || shouldBeEmpty.length) {
			throw new ParsingError(
				"Invalid format for space separated string list",
				tokens,
			);
		}
		list.push(shouldBeString.getTrueValue());
	}

	if (!allowEmpty && !list.length) {
		throw new ParsingError(
			"No string tokens found in space separated string list. Expected at least one",
			tokens,
		);
	}

	return list;
}

type IFormat = {
	instance?: any;
	sp?: boolean;
	trueValue?: unknown;
	type?: TokenTypes;
	value?: string;
};

export function matchesFormat(
	tokens: LexerTokenList,
	formats: (IFormat | IFormat[])[],
): boolean {
	for (let i = 0; i < formats.length; i++) {
		const token = tokens[i];
		if (!token) {
			// If we don't have a token to match against, we
			// can't possibly match any of the formatting
			return false;
		}

		const format = formats[i];
		if (Array.isArray(format)) {
			// We are OR-ing formats in our array
			const anyMatch = format.some((format) =>
				matchesFormat([token], [format]),
			);
			if (!anyMatch) {
				return false;
			}
			// The rest is for a single entry, skip
			continue;
		}

		if (format.instance && !(token instanceof format.instance)) {
			return false;
		}
		if (format.sp && !token.isType(TokenTypes.space)) {
			return false;
		}
		if (
			"trueValue" in format &&
			token.getTrueValue() !== format.trueValue
		) {
			return false;
		}
		if (format.type !== undefined && !token.isType(format.type)) {
			return false;
		}
		if ("value" in format) {
			// Atom-typed values are protocol keywords (e.g. "FETCH", "FLAGS",
			// "QUOTA") which RFC3501-9-2/RFC9051-9-2/RFC9208-7-1 require us to
			// accept case-insensitively. Non-atom values here are operator
			// punctuation ("(", "[", ...) where case doesn't apply.
			const matches =
				format.type === TokenTypes.atom
					? ciEquals(token.value, format.value)
					: token.value === format.value;
			if (!matches) {
				return false;
			}
		}
	}

	// If we made it to the end, we match
	return true;
}
