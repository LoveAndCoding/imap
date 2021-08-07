import { imap } from "utf7";

import { ILexerToken, TokenTypes } from "../types";
import { BaseToken } from "./base";

/**
 * Quoted String Token
 *
 * From the spec:
 * > A quoted string is a sequence of zero or more 7-bit characters,
 * > excluding CR and LF, with double quote (<">) characters at each
 * > end.
 */
export class QuotedStringToken
	extends BaseToken<string>
	implements ILexerToken<string> {
	public readonly type: TokenTypes;

	constructor(public readonly value: string) {
		super(TokenTypes.string);
	}

	getTrueValue(): string {
		// Token value is "STRING" so we want to strip those out. But
		// IMAP also uses UTF-7 for encoding, so we need to decode
		// that using the utf7 library.
		return imap.decode(this.value.substring(1, this.value.length - 1));
	}
}

/**
 * Literal String Token
 *
 * From the spec:
 * > A literal is a sequence of zero or more octets (including CR and
 * > LF), prefix-quoted with an octet count in the form of an open
 * > brace ("{"), the number of octets, close brace ("}"), and CRLF.
 * > In the case of literals transmitted from server to client, the
 * > CRLF is immediately followed by the octet data.
 */
export class LiteralStringToken
	extends BaseToken<string>
	implements ILexerToken<string> {
	public readonly type: TokenTypes;

	constructor(public readonly value: string) {
		super(TokenTypes.string);
	}

	getTrueValue(): string {
		// A literal value is of the form `{NUMBER}\r\nSTRING` where `NUMBER`
		// is the number of octets. By this point, we already have the right
		// length string, so we just need to strip out the first part
		return this.value.replace(/^\{\d+\}\r\n/, "");
	}
}
