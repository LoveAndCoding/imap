import { ciEquals } from "../case-insensitive";
import { NilToken } from "../tokens/nil";
import { ILexerRule } from "../types";

export class NilRule implements ILexerRule<null> {
	public match(content: string): null | NilToken {
		const maybeNilString = content.substr(0, 3);
		// RFC3501-9-2/RFC9051-9-2: alphabetic tokens (including the special
		// "NIL" atom) are case-insensitive; a server sending "nil"/"Nil" is
		// just as valid as "NIL". We keep the original casing in the token
		// (it's only ever surfaced again for the "NIL used where an atom is
		// expected" edge case -- see getAStringValue), just the *match* is
		// case-insensitive.
		if (ciEquals(maybeNilString, "NIL")) {
			return new NilToken(maybeNilString as "NIL");
		}
		return null;
	}
}
