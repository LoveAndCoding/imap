import { command } from "../harness/matchers";
import { expectLine, reply, send, type ScriptStep } from "../harness/script";
import type { Profile } from "../catalog/types";

/**
 * Script a complete SASL PLAIN AUTHENTICATE exchange:
 *   C: <tag> AUTHENTICATE PLAIN
 *   S: + \r\n  (empty challenge)
 *   C: <base64 SASL response>
 *   S: <tag> OK/NO AUTHENTICATE completed/failed
 *
 * opts.result defaults to "OK".
 */
export function authPlainExchange(opts: { result?: "OK" | "NO" } = {}): ScriptStep[] {
	const result = opts.result ?? "OK";
	const suffix = result === "OK" ? "OK AUTHENTICATE completed" : "NO AUTHENTICATE failed";
	return [
		expectLine(command("AUTHENTICATE", { args: /^PLAIN$/i })),
		send("+ \r\n"),
		expectLine({
			match: (line) => ({
				ok: /^[A-Za-z0-9+/=]+$/.test(line),
				reason: `expected base64 SASL response, got: '${line}'`,
			}),
			description: "base64 SASL response",
		}),
		reply(suffix),
	];
}

/** Untagged greeting. */
export function greet(opts: { kind?: "ok" | "preauth"; text?: string; profile?: Profile } = {}): ScriptStep[] {
	const kind = opts.kind === "preauth" ? "PREAUTH" : "OK";
	// RFC 9051 §6.3.2: rev2 greeting includes inline CAPABILITY with IMAP4rev2 and LITERAL-
	if (kind === "OK" && opts.profile === "rev2") {
		return [send(`* OK [CAPABILITY IMAP4rev2 LITERAL-] ${opts.text ?? "ready"}\r\n`)];
	}
	return [send(`* ${kind} ${opts.text ?? "ready"}\r\n`)];
}

/** Expect a CAPABILITY command; reply with the given capability list. */
export function capabilityExchange(caps: string[]): ScriptStep[] {
	return [
		expectLine(command("CAPABILITY", { args: null })),
		reply("OK CAPABILITY completed", [`* CAPABILITY ${caps.join(" ")}`]),
	];
}

/** Expect a LOGIN command (any credentials); reply OK. */
export function loginExchange(): ScriptStep[] {
	return [expectLine(command("LOGIN")), reply("OK LOGIN completed")];
}

/** greet + capabilityExchange (+ optional loginExchange) — the standard session-establishment prelude. */
export function sessionPrelude(
	caps?: string[],
	opts: { login?: boolean; profile?: Profile } = {},
): ScriptStep[] {
	// rev2 default caps: IMAP4rev2 + LITERAL- (RFC 9051 §6.1.1); rev1 default: IMAP4rev1
	const defaultCaps = opts.profile === "rev2" ? ["IMAP4rev2", "LITERAL-"] : ["IMAP4rev1"];
	const resolvedCaps = caps ?? defaultCaps;
	return [
		...greet({ profile: opts.profile }),
		...capabilityExchange(resolvedCaps),
		...(opts.login ? loginExchange() : []),
	];
}

export interface SelectOptions {
	exists?: number;
	recent?: number;
	unseen?: number;
	uidValidity?: number;
	uidNext?: number;
	readOnly?: boolean;
	/** EXAMINE uses the identical §6.3.1 data set (§6.3.2). */
	verb?: "SELECT" | "EXAMINE";
	/**
	 * Profile determines which response data set is used.
	 * - rev1 (default): RFC 3501 §6.3.1 — includes RECENT and UNSEEN.
	 * - rev2: RFC 9051 §6.3.2 — omits RECENT/UNSEEN; adds LIST response.
	 */
	profile?: Profile;
}

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Expect SELECT (or EXAMINE) <mailbox>; reply with the canonical response
 * data set for the given profile.
 *
 * - rev1 (default): RFC 3501 §6.3.1 response set — includes RECENT and UNSEEN.
 * - rev2: RFC 9051 §6.3.2 response set — omits RECENT/UNSEEN; adds LIST.
 *   The rev2 example from §6.3.2 (verbatim order):
 *     * n EXISTS                                    (RFC 9051 §6.3.2)
 *     * OK [UIDVALIDITY n] UIDs valid               (RFC 9051 §6.3.2)
 *     * OK [UIDNEXT n] Predicted next UID           (RFC 9051 §6.3.2)
 *     * FLAGS (...)                                 (RFC 9051 §6.3.2)
 *     * OK [PERMANENTFLAGS (...)] Limited           (RFC 9051 §6.3.2)
 *     * LIST () "/" <mailbox>                       (RFC 9051 §6.3.2)
 *
 * Mailbox matching is case-sensitive per RFC 3501 §5.1 — except INBOX,
 * which is case-insensitive. The helper deliberately does NOT absorb client
 * syntax sloppiness (quoting must be balanced or absent).
 */
export function selectExchange(mailbox: string, opts: SelectOptions = {}): ScriptStep[] {
	const exists = opts.exists ?? 0;
	const uidValidity = opts.uidValidity ?? 1;
	const uidNext = opts.uidNext ?? exists + 1;
	const code = opts.readOnly ? "READ-ONLY" : "READ-WRITE";
	const verb = opts.verb ?? "SELECT";
	const name = escapeRegExp(mailbox);
	const flags = mailbox.toUpperCase() === "INBOX" ? "i" : "";

	if (opts.profile === "rev2") {
		// RFC 9051 §6.3.2: rev2 response set — no RECENT, no UNSEEN; includes LIST.
		return [
			expectLine(command(verb, { args: new RegExp(`^(?:${name}|"${name}")$`, flags) })),
			reply(`OK [${code}] ${verb} completed`, [
				`* ${exists} EXISTS`,
				`* OK [UIDVALIDITY ${uidValidity}] UIDs valid`,
				`* OK [UIDNEXT ${uidNext}] Predicted next UID`,
				"* FLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft)",
				"* OK [PERMANENTFLAGS (\\Deleted \\Seen \\*)] Limited",
				`* LIST () "/" ${mailbox}`,
			]),
		];
	}

	// rev1 (default): RFC 3501 §6.3.1 response set.
	const recent = opts.recent ?? 0;
	const unseen = opts.unseen ?? 1;
	return [
		expectLine(command(verb, { args: new RegExp(`^(?:${name}|"${name}")$`, flags) })),
		reply(`OK [${code}] ${verb} completed`, [
			`* ${exists} EXISTS`,
			`* ${recent} RECENT`,
			`* OK [UNSEEN ${unseen}] Message ${unseen} is first unseen`,
			`* OK [UIDVALIDITY ${uidValidity}] UIDs valid`,
			`* OK [UIDNEXT ${uidNext}] Predicted next UID`,
			"* FLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft)",
			"* OK [PERMANENTFLAGS (\\Deleted \\Seen \\*)] Limited",
		]),
	];
}
