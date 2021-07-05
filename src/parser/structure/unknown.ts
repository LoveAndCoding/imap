import { LexerTokenList } from "../../lexer/types";
import { getOriginalInput } from "../utility";

export default class UnknownResponse {
	public readonly text: string;

	constructor(contents: LexerTokenList) {
		this.text = getOriginalInput(contents);
	}
}
