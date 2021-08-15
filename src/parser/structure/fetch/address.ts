import { decodeWords } from "../../encoding";
import { LexerTokenList, TokenTypes } from "../../../lexer";
import {
	getNStringValue,
	splitUnseparatedListofLists,
	splitSpaceSeparatedList,
} from "../../utility";

export class Address {
	public readonly name: null | string;
	public readonly route: null | string;
	public readonly mailbox: null | string;
	public readonly host: null | string;

	constructor(tokens: LexerTokenList) {
		const [name, route, mailbox, host] = splitSpaceSeparatedList(tokens);

		this.name = getNStringValue(name);
		if (this.name) {
			this.name = decodeWords(this.name);
		}
		this.route = getNStringValue(route);
		this.mailbox = getNStringValue(mailbox);
		this.host = getNStringValue(host);
	}
}

export class AddressGroup {
	public list: Address[];

	constructor(public readonly name: string) {
		this.list = [];
	}

	addAddress(addr: Address) {
		this.list.push(addr);
	}
}

export class AddressList {
	public list: (Address | AddressGroup)[];

	constructor(tokens: LexerTokenList) {
		this.list = [];
		if (tokens.length === 1 && tokens[0].isType(TokenTypes.nil)) {
			// For NIL lists, just be empty
			return;
		}

		// Remove the surrounding () tokens
		const addrs = splitUnseparatedListofLists(tokens.slice(1, -1));
		let currGroup: AddressGroup;
		for (const addr of addrs) {
			const parsed = new Address(addr);

			if (parsed.host === null && typeof parsed.mailbox === "string") {
				currGroup = new AddressGroup(parsed.mailbox);
				this.list.push(currGroup);
			} else if (parsed.host === null && parsed.mailbox === null) {
				if (currGroup) {
					currGroup = undefined;
				}
			} else if (currGroup) {
				currGroup.addAddress(parsed);
			} else {
				this.list.push(parsed);
			}
		}
	}
}
