import { ciEquals } from "../case-insensitive";
import { NilToken } from "../tokens/nil";
import { ILexerRule } from "../types";
import { RE_ATOM_CHAR } from "./atom";

export class NilRule implements ILexerRule<null> {
	public match(content: string): null | NilToken {
		const maybeNilString = content.substr(0, 3);
		// RFC3501-9-2/RFC9051-9-2: alphabetic tokens (including the special
		// "NIL" atom) are case-insensitive; a server sending "nil"/"Nil" is
		// just as valid as "NIL". We keep the original casing in the token
		// (it's only ever surfaced again for the "NIL used where an atom is
		// expected" edge case -- see getAStringValue), just the *match* is
		// case-insensitive.
		if (!ciEquals(maybeNilString, "NIL")) {
			return null;
		}

		// Word-boundary check: NilRule runs before AtomRule (order 40 vs
		// 60), so without this an atom that merely *starts* with "nil"
		// (e.g. "NILVANA", "Nilsson") would be wrongly split into a NIL
		// token followed by a fragment atom. Only accept the match if the
		// character right after it is absent or isn't itself a valid atom
		// character (e.g. SP, "(", end of input all count as boundaries).
		const nextChar = content.charAt(3);
		if (nextChar !== "" && RE_ATOM_CHAR.test(nextChar)) {
			return null;
		}

		return new NilToken(maybeNilString as "NIL");
	}
}
