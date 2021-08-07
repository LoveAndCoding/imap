import { ILexerToken, TokenTypes } from "../types";
import { BaseToken } from "./base";

/**
 * NIL Token
 *
 * From the spec:
 * > The special form "NIL" represents the non-existence of a particular
 * > data item that is represented as a string or parenthesized list, as
 * > distinct from the empty string "" or the empty parenthesized list ().
 * >
 * > > Note: NIL is never used for any data item which takes the
 * > > form of an atom.  For example, a mailbox name of "NIL" is a
 * > > mailbox named NIL as opposed to a non-existent mailbox
 * > > name.  This is because mailbox uses "astring" syntax which
 * > > is an atom or a string.  Conversely, an addr-name of NIL is
 * > > a non-existent personal name, because addr-name uses
 * > > "nstring" syntax which is NIL or a string, but never an
 * > > atom.
 *
 * This second special case about an atom
 */
export class NilToken extends BaseToken<null> implements ILexerToken<null> {
	public readonly type: TokenTypes;

	constructor(public readonly value: "NIL") {
		super(TokenTypes.nil);
	}

	getTrueValue(): null {
		return null;
	}
}
