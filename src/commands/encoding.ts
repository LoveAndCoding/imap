import { IMAPError } from "../errors";
import { utf7 } from "../parser/encoding";

export function createIMAPSafeString(value: string | null, allowNull = false) {
	if (value === null) {
		if (!allowNull) {
			throw new IMAPError(
				"Cannot create IMAP safe string from null value",
			);
		}
		return "NIL";
	}

	if (value.match(/\r|\n|[^\\]\\|"/)) {
		// We have potentially unsafe characters, use a literal
		return `${value.length}\r\n${value}`;
	}
	// Else just use DQUOTE
	return `"${value}"`;
}

/**
 * Encode a mailbox name for sending to the server. Mailbox names are
 * transmitted using modified UTF-7 (RFC 3501 §5.1.3), so we encode the
 * name and then wrap it as an IMAP safe string.
 */
export function encodeMailboxName(name: string): string {
	return createIMAPSafeString(utf7.encode(name));
}

export type SequenceSetInput = string | number | (string | number)[];

/**
 * Normalize a sequence set (or UID set) into the wire format the server
 * expects, e.g. `1`, `1,2,5`, `1:*`, or `2:4,7`. Accepts a single value,
 * an array of values/ranges, or a pre-formatted string.
 */
export function createSequenceSet(set: SequenceSetInput): string {
	const value = Array.isArray(set) ? set.join(",") : `${set}`;
	if (!value.length) {
		throw new IMAPError("Cannot create a sequence set from an empty value");
	}
	if (!/^[0-9*,:]+$/.test(value)) {
		throw new IMAPError(`Invalid sequence set value: ${value}`);
	}
	return value;
}

/**
 * Format a list of flags into a parenthesized list as expected by the
 * server, e.g. `(\Seen \Flagged)`. Empty lists produce `()`.
 */
export function createFlagList(flags: string[]): string {
	return `(${(flags || []).join(" ")})`;
}
