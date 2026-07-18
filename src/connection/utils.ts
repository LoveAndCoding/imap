import { IMAPError } from "../errors";
import {
	MONTHS,
	RE_BACKSLASH,
	RE_DBLQUOTE,
	RE_INTEGER,
	RE_NUM_RANGE,
} from "./constants";

// utilities -------------------------------------------------------------------

export function escape(str: string) {
	return str.replace(RE_BACKSLASH, "\\\\").replace(RE_DBLQUOTE, '\\"');
}

/**
 * M14 (log-injection defense): escapes CR/LF/TAB to their visible
 * two-character forms and every other C0/DEL byte to a `\xHH` escape before
 * embedding untrusted server free-text (e.g. a status response's human-
 * readable explanation) into a thrown `Error`'s `message` or a log line --
 * without this, a malicious/misbehaving server (including a pre-auth,
 * unauthenticated peer) could inject CR/LF to forge fake log lines once a
 * caller's logger prints `err.message`/the log entry verbatim, or smuggle
 * other C0/DEL control bytes. Purely cosmetic for the overwhelming majority
 * of server text (plain ASCII with no control bytes), so no legitimate
 * message changes shape. Shared by every call site that embeds raw server
 * text this way (`connection.ts`'s BYE-greeting rejection,
 * `commands/authenticate.ts`'s AUTHENTICATE failure text,
 * `commands/starttls.ts`'s STARTTLS failure text) -- `commands/login.ts`
 * keeps its own historical, byte-identical inline copy (out of this
 * milestone's file territory) rather than being migrated to import this.
 */
export function sanitizeForErrorMessage(text: string): string {
	// eslint-disable-next-line no-control-regex -- \x00-\x1f/\x7f control range is intentional (sanitizing server text before embedding in an error message)
	return text.replace(/[\x00-\x1f\x7f]/g, (ch) => {
		if (ch === "\r") return "\\r";
		if (ch === "\n") return "\\n";
		if (ch === "\t") return "\\t";
		return `\\x${ch.charCodeAt(0).toString(16).padStart(2, "0")}`;
	});
}

export function validateUIDList(
	uids: Array<string | number>,
	noThrow: boolean = false,
) {
	for (let i = 0, len = uids.length, intval; i < len; ++i) {
		const uid = uids[i];
		if (typeof uid === "string") {
			if (uid === "*" || uid === "*:*") {
				break;
			} else if (RE_NUM_RANGE.test(uid)) {
				continue;
			}
		}
		intval = parseInt("" + uid, 10);
		if (isNaN(intval)) {
			const err = new IMAPError(
				'UID/seqno must be an integer, "*", or a range: ' + uid,
			);
			if (noThrow) {
				return err;
			} else {
				throw err;
			}
		} else if (intval <= 0) {
			const err = new IMAPError("UID/seqno must be greater than zero");
			if (noThrow) {
				return err;
			} else {
				throw err;
			}
		} else if (typeof uid !== "number") {
			uids[i] = intval;
		}
	}
}
