import { decodeWords } from "../../encoding";
import { LexerTokenList, TokenTypes } from "../../../lexer";
import {
	getNStringValue,
	splitUnseparatedListofLists,
	splitSpaceSeparatedList,
} from "../../utility";

/** RFC 3501 §7.5 `address`: an `(addr-name SP addr-adl SP addr-mailbox SP
 *  addr-host)` 4-tuple parsed out of an ENVELOPE address list. */
export class Address {
	/** `addr-name` -- the display name (RFC 2822 phrase), MIME-word decoded. */
	public readonly name: null | string;
	/** `addr-adl` -- the source route/at-domain-list, rarely used. */
	public readonly route: null | string;
	/** `addr-mailbox` -- the mailbox local-part, or the group display-name
	 *  when this address is a group start/end marker. */
	public readonly mailbox: null | string;
	/** `addr-host` -- the domain part, or `null` for a group start/end
	 *  marker (RFC 2822 group syntax). */
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

/** An RFC 2822 group of addresses, denoted in the ENVELOPE address list by a
 *  start marker address (`nil` host, mailbox = group name) and terminated by
 *  an end marker address (`nil` host and `nil` mailbox). */
export class AddressGroup {
	/** The addresses collected inside this group. */
	public list: Address[];

	constructor(
		/** The group's display name (from the start marker's mailbox field). */
		public readonly name: string,
	) {
		this.list = [];
	}

	/** Appends an address to this group. */
	addAddress(addr: Address) {
		this.list.push(addr);
	}
}

/** A parsed ENVELOPE address-list field (e.g. `from`, `to`, `cc`), expanding
 *  RFC 2822 group syntax into {@link AddressGroup} entries alongside plain
 *  {@link Address} entries. */
export class AddressList {
	/** The addresses and groups in this list, in wire order. */
	public list: (Address | AddressGroup)[];

	constructor(tokens: LexerTokenList) {
		this.list = [];
		if (tokens.length === 1 && tokens[0].isType(TokenTypes.nil)) {
			// For NIL lists, just be empty
			return;
		}

		// Remove the surrounding () tokens
		const addrs = splitUnseparatedListofLists(tokens.slice(1, -1));
		let currGroup: AddressGroup | undefined;
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
