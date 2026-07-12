import { IDResponse } from "../parser";
import { Command } from "./base";
import type { ResponseCollector } from "./collector";
import type { CommandWriter } from "./writer";

// eslint-disable-next-line @typescript-eslint/no-require-imports -- package.json lives outside rootDir, so ESM import isn't available under the current tsconfig
const pkg = require("../../package.json");

enum IdCommandKeys {
	"address" = "address",
	"arguments" = "arguments",
	"command" = "command",
	"environment" = "environment",
	"date" = "date",
	"name" = "name",
	"os" = "os",
	"os-version" = "os-version",
	"support-url" = "support-url",
	"vendor" = "vendor",
	"version" = "version",
}
export type IdCommandValues = Partial<
	{
		[key in IdCommandKeys]: string | null;
	}
>;

export type IdResponseMap = null | ReadonlyMap<string, null | string>;

const DEFAULT_ID_OPTS: IdCommandValues = {
	name: "node-imap",
	"support-url": `${pkg.bugs ? pkg.bugs.url || pkg.bugs : pkg.homepage}`,
	vendor: "lovely-inbox",
	version: pkg.version,
};

// RFC 2971 §3.3 syntax limits (spec invariant I-12): a client MUST NOT send
// more than 30 field/value pairs, field strings MUST NOT be longer than 30
// octets, and value strings MUST NOT be longer than 1024 octets.
const MAX_ID_PAIRS = 30;
const MAX_ID_FIELD_OCTETS = 30;
const MAX_ID_VALUE_OCTETS = 1024;

/** Truncates a string to at most `max` octets without splitting a UTF-8
 *  code point (drops a trailing partial sequence rather than emitting it). */
function truncateToOctets(value: string, max: number): string {
	const buf = Buffer.from(value, "utf8");
	if (buf.byteLength <= max) {
		return value;
	}
	const slice = buf.subarray(0, max);
	const sliced = slice.toString("utf8");
	// A cut mid-code-point decodes with a trailing U+FFFD. Distinguish that
	// corruption from a value that legitimately ends in U+FFFD by
	// re-encoding: an uncorrupted decode round-trips to the same bytes.
	if (sliced.endsWith("�") && !Buffer.from(sliced, "utf8").equals(slice)) {
		return sliced.slice(0, -1);
	}
	return sliced;
}

/**
 * Returns a copy of `values` that satisfies RFC 2971 §3.3's syntax limits
 * (I-12) so an ID command built from consumer-supplied configuration can
 * always be sent: over-long field names are dropped (a truncated field name
 * would be a different, meaningless field), over-long values are truncated
 * to 1024 octets (values are advisory display strings), and at most 30
 * pairs are kept. Constructing `IdCommand` with unsanitized oversized input
 * instead throws `RangeError`.
 */
export function sanitizeIdValues(values: IdCommandValues): IdCommandValues {
	const result: IdCommandValues = {};
	let pairs = 0;
	for (const [key, val] of Object.entries(values)) {
		if (pairs >= MAX_ID_PAIRS) {
			break;
		}
		if (Buffer.byteLength(key, "utf8") > MAX_ID_FIELD_OCTETS) {
			continue;
		}
		result[key] =
			typeof val === "string"
				? truncateToOctets(val, MAX_ID_VALUE_OCTETS)
				: val;
		pairs++;
	}
	return result;
}

/** ID (RFC 2971). Claims the untagged ID response (default `claims()` —
 *  verb "ID" claims type "ID"). */
export class IdCommand extends Command<IdResponseMap> {
	readonly verb = "ID";
	readonly queueMode = "pipeline" as const;

	/**
	 * NOTE: unlike other Command subclasses (which surface failures only via
	 * the queue's execution promise), this constructor throws `RangeError`
	 * SYNCHRONOUSLY when the supplied values violate RFC 2971 §3.3's wire
	 * limits — the command must never be constructible in a state that
	 * cannot legally be sent. Pass config through `sanitizeIdValues()`
	 * first if you want oversized input coerced instead of rejected.
	 */
	constructor(
		protected readonly valuesToSend: IdCommandValues = DEFAULT_ID_OPTS,
	) {
		super();

		// Enforce RFC 2971 §3.3 limits (I-12) at the command boundary: these
		// are MUST NOT rules on what the client may put on the wire, so
		// violating input from a direct Layer-2 caller is a caller error.
		// Session-level configuration goes through sanitizeIdValues() first.
		if (valuesToSend) {
			const entries = Object.entries(valuesToSend);
			if (entries.length > MAX_ID_PAIRS) {
				throw new RangeError(
					`ID accepts at most ${MAX_ID_PAIRS} field/value pairs (RFC 2971 §3.3); got ${entries.length}`,
				);
			}
			for (const [key, val] of entries) {
				if (Buffer.byteLength(key, "utf8") > MAX_ID_FIELD_OCTETS) {
					throw new RangeError(
						`ID field names are limited to ${MAX_ID_FIELD_OCTETS} octets (RFC 2971 §3.3): "${key.slice(0, 40)}…"`,
					);
				}
				if (
					typeof val === "string" &&
					Buffer.byteLength(val, "utf8") > MAX_ID_VALUE_OCTETS
				) {
					throw new RangeError(
						`ID values are limited to ${MAX_ID_VALUE_OCTETS} octets (RFC 2971 §3.3): field "${key}"`,
					);
				}
			}
		}
	}

	protected write(w: CommandWriter): void {
		const entries = this.valuesToSend
			? Object.entries(this.valuesToSend).filter(([key]) => key in IdCommandKeys)
			: [];

		if (!entries.length) {
			// id_params_list ::= "(" #(string SPACE nstring) ")" / nil
			w.nstring(null);
			return;
		}

		w.list((list) => {
			for (const [key, val] of entries) {
				list.quotedOrLiteral(key);
				list.nstring(val ?? null);
			}
		});
	}

	protected accept(c: ResponseCollector): IdResponseMap {
		const resp = c.first("ID");
		if (resp && resp.content instanceof IDResponse) {
			return resp.content.details;
		}
		return new Map();
	}
}
