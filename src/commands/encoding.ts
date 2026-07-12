import { IMAPError } from "../errors";

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
