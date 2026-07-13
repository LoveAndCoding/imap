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
	constructor(public readonly value: string) {
		super(TokenTypes.string);
	}

	getTrueValue(): string {
		// Token value is "STRING" so we want to strip those out. But
		// IMAP also uses UTF-7 for encoding, so we need to decode
		// that using the utf7 library.
		//
		// §11.4 encoding note (M3.2): the lexer buffer is accumulated as
		// `latin1` (1 code unit per octet, byte-accurate -- see
		// `Lexer._transform`), so a server-sent quoted string carrying raw
		// UTF-8 (legal in IMAP4rev2, RFC9051-4.3.1-2) reaches this token as
		// one code unit per UTF-8 octet. Re-derive the UTF-8 text here, at
		// the point of materialization (the same recipe
		// `LiteralStringToken.getTrueValue` uses), BEFORE the modified-UTF-7
		// decode -- mUTF-7 escape sequences are pure ASCII, so the re-decode
		// never disturbs them.
		const inner = Buffer.from(
			this.value.substring(1, this.value.length - 1),
			"latin1",
		).toString("utf8");
		return imap.decode(inner);
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
 *
 * Also covers literal8 (RFC 3516: "~{NUMBER}\r\nSTRING"), a literal that
 * may contain NUL octets (e.g. URLFETCH/APPEND BINARY payloads) -- framing
 * and semantics are otherwise identical, so both share this token class.
 */
export class LiteralStringToken
	extends BaseToken<string>
	implements ILexerToken<string> {
	constructor(public readonly value: string) {
		super(TokenTypes.string);
	}

	/**
	 * §11.4 encoding fix: `value` is the lexer's internal buffer content,
	 * which (as of M3.2) is accumulated via a `latin1` decode -- i.e. one
	 * JS code unit per octet, always reversible via `getRawBytes()` below
	 * regardless of whether the bytes are valid UTF-8. That byte-accuracy
	 * is what fixes the two proven corruption modes of the old
	 * whole-buffer-decoded-as-UTF-8 design: (1) invalid UTF-8 no longer
	 * collapses to U+FFFD before this token even exists (it only would if
	 * decoded as UTF-8 -- see below -- but the raw bytes are always
	 * recoverable via `getRawBytes()`), and (2) a multi-byte character
	 * sitting at the literal's octet boundary is no longer mis-sliced,
	 * because the octet count and the code-unit count are now the same
	 * number for this portion of the buffer.
	 *
	 * `getTrueValue()` keeps its historical contract (small text literals
	 * decode as a UTF-8 string, zero small-consumer changes) by re-decoding
	 * the byte-accurate raw content as UTF-8 here, once, at the point of
	 * materialization -- rather than the old design's per-`_transform`-call
	 * UTF-8 decode of a (possibly split-mid-character) chunk.
	 */
	getTrueValue(): string {
		return Buffer.from(this.stripPrefix(), "latin1").toString("utf8");
	}

	/**
	 * Byte-accurate access to the literal body, independent of whether it
	 * happens to be valid UTF-8 text. Used by binary-safe consumers (FETCH
	 * body content, §5.4) and by regression tests proving the invalid-UTF-8
	 * round-trip and multi-byte-boundary failure modes are fixed.
	 */
	getRawBytes(): Buffer {
		return Buffer.from(this.stripPrefix(), "latin1");
	}

	private stripPrefix(): string {
		// A literal value is of the form `{NUMBER}\r\nSTRING` (or
		// `~{NUMBER}\r\nSTRING` for literal8) where `NUMBER` is the number
		// of octets. By this point, we already have the right length
		// string, so we just need to strip out the prefix.
		return this.value.replace(/^~?\{\d+\}\r\n/, "");
	}
}
