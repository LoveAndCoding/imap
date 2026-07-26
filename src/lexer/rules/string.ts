import { TokenizationError } from "../../errors";
import { LiteralStringToken, QuotedStringToken } from "../tokens/string";
import { ILexerRule, ILexerToken, LexerTokenList, TokenTypes } from "../types";

/**
 * Thrown when a quoted string's opening `"` has no matching closing `"`
 * anywhere in `content`. Per RFC3501/RFC9051 §4.3, a quoted string can
 * never contain CR or LF, so if this is thrown against a buffer that
 * already ends in a complete CRLF-terminated line, no amount of further
 * buffering will EVER close it -- it's a syntactically TERMINAL failure,
 * not "wait for more data". Distinguished from the base `TokenizationError`
 * (still used for the genuinely recoverable "not enough bytes yet for the
 * declared literal length" case) so `Lexer._transform` can tell the two
 * apart and propagate this one as an error instead of buffering forever
 * (H12) -- see `src/lexer/lexer.ts`.
 */
export class UnterminatedStringError extends TokenizationError {}

export class StringRule implements ILexerRule<string> {
	public match(
		content: string,
	): null | LiteralStringToken | QuotedStringToken {
		if (content.startsWith('"')) {
			// We have a quoted string, grab and return it
			let index = 0;
			while (++index < content.length) {
				if (content.charAt(index) === '"') {
					break;
				} else if (content.charAt(index) === "\\") {
					// If we escaping a character, skip ahead
					++index;
				}
			}
			if (index === 0 || content.charAt(index) !== '"') {
				throw new UnterminatedStringError(
					"Unable to find end of string",
					content,
				);
			}
			// We need to add two because the search actually
			// finds the character before the end quote.
			const string = content.substr(0, index + 1);
			return new QuotedStringToken(string);
		}

		// A literal8 (RFC 3516, e.g. used by URLFETCH/APPEND BINARY) is a
		// literal that may contain NUL octets, framed as "~{n}\r\n" instead
		// of plain "{n}\r\n". Aside from the leading "~" the framing and
		// octet-count semantics are identical, so both share this branch.
		//
		// M23: the trailing `\+?` tolerates the non-standard `{n+}`
		// "non-sync" marker the same way `NewlineTranform`'s `ANNOUNCE_TAIL`
		// and `Lexer`'s `LITERAL_ANNOUNCEMENT_TAIL` already do. Those two
		// framing layers decide -- BEFORE this rule ever sees the literal's
		// bytes -- whether a below-threshold `{n+}` announces an
		// opaque/guarded literal body; if this rule didn't also tolerate
		// `{n+}`, that below-threshold case would desync the two layers:
		// `NewlineTranform` would guard `n` opaque (non-CRLF-scanned) bytes
		// after the announcement, but this rule would fail to recognize the
		// announcement as a single literal token at all, instead falling
		// apart into loose `{` / number / `+` / `}` tokens that don't
		// satisfy `matchIncludingEOL` either -- silently misparsing the
		// literal body as ordinary protocol tokens.
		const literalMatch = content.match(/^(~)?\{(\d+)\+?\}\r\n/);
		if (literalMatch) {
			const [prefix, , lengthStr] = literalMatch;
			const lengthOfLiteral = parseInt(lengthStr);
			if (
				Number.isNaN(lengthOfLiteral) ||
				!Number.isFinite(lengthOfLiteral) ||
				!Number.isSafeInteger(lengthOfLiteral)
			) {
				throw new TokenizationError(
					"Invalid literal length provided",
					content,
				);
			}

			const fullString = content.substr(
				0,
				prefix.length + lengthOfLiteral,
			);

			if (fullString.length !== prefix.length + lengthOfLiteral) {
				throw new TokenizationError(
					"Unable to get literal string of specified length",
					content,
				);
			}

			return new LiteralStringToken(fullString);
		}

		// Else we found nothing, return null
		return null;
	}

	public matchIncludingEOL(tokens: LexerTokenList): number {
		const [
			expectOpenBrack,
			expectNumber,
			expectCloseBrack,
			expectCRLF,
		] = tokens.slice(-4);
		if (
			expectOpenBrack.isType(TokenTypes.operator) &&
			expectOpenBrack.value === "{" &&
			expectCloseBrack.isType(TokenTypes.operator) &&
			// BUG FIX (M3.2, spec §11.4 proof addendum): this was `=== "{"`,
			// which can never be true for a token immediately preceded by an
			// open brace -- it plainly meant the CLOSE brace "}". As found,
			// this branch (detecting a literal announcement that tokenized
			// as 4 separate raw tokens, rather than being consumed whole by
			// `StringRule.match()`) was unreachable under the pre-M3.2
			// architecture anyway, since `NewlineTranform` always delivers
			// complete CRLF-terminated lines and `StringRule.match()` always
			// either fully matches a complete `{n}\r\n` announcement or
			// throws (never leaves it as loose tokens) -- see
			// `test/unit/lexer/rules/string.test.ts` for the reachability
			// note. Fixed regardless, on defense-in-depth grounds.
			expectCloseBrack.value === "}" &&
			expectCRLF.isType(TokenTypes.eol) &&
			expectNumber.isType(TokenTypes.number)
		) {
			return expectNumber.getTrueValue();
		}

		return 0;
	}
}
