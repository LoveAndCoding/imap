import { LexerTokenList, TokenTypes } from "../../../lexer";
import { getNStringValue, splitSpaceSeparatedList } from "../../utility";

export class Address {
	public readonly name: null | string;
	public readonly route: null | string;
	public readonly mailbox: null | string;
	public readonly host: null | string;

	constructor(tokens: LexerTokenList) {
		const [name, route, mailbox, host] = splitSpaceSeparatedList(tokens);

		this.name = getNStringValue(name);
		this.route = getNStringValue(route);
		this.mailbox = getNStringValue(mailbox);
		this.host = getNStringValue(host);
	}
}

export class AddressList {
	protected list: Address[];

	constructor(tokens: LexerTokenList) {
		if (tokens.length === 1 && tokens[0].type === TokenTypes.nil) {
			// For NIL lists, just be empty
			this.list = [];
			return;
		}

		const addrs = splitSpaceSeparatedList(tokens);
		this.list = addrs.map((addr) => new Address(addr));
	}
}
