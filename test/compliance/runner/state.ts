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
 *
 * `opts.capsAfter`: RFC3501/9051-6.2.2-4 obliges the client to re-issue
 * CAPABILITY after a successful security-layer AUTHENTICATE UNLESS the
 * tagged OK itself already carries a `[CAPABILITY ...]` code (spec §3.3
 * step 5: "Refresh capabilities from tagged-OK [CAPABILITY] else round
 * trip"). Passing the capability list here folds it into the SAME tagged
 * OK (exactly as a real, capability-conscious server would) so a script
 * that doesn't care about the re-issue duty itself doesn't need a second,
 * separate CAPABILITY round trip just to avoid stalling the client's own
 * mandatory refresh. Tests that DO exercise the re-issue duty itself
 * (RFC3501-6.2.2-4/RFC9051 equivalent) omit this and script the follow-up
 * CAPABILITY exchange explicitly instead — passing both would mean the
 * client never needs the round trip, so the explicitly-scripted one would
 * never be consumed.
 *
 * A "NO" result carries `[AUTHENTICATIONFAILED]` (RFC 5530): spec §9.3 step
 * 3 only treats a NO as "credentials wrong, do not fall through to another
 * mechanism/LOGIN" when it carries that specific code — a bare "NO" without
 * it reads as a mechanism-negotiation failure instead, so `authenticate()`
 * would silently fall through to a LOGIN attempt the script never expects.
 */
export function authPlainExchange(
	opts: { result?: "OK" | "NO"; capsAfter?: string[] } = {},
): ScriptStep[] {
	const result = opts.result ?? "OK";
	const suffix =
		result === "OK"
			? opts.capsAfter
				? `OK [CAPABILITY ${opts.capsAfter.join(" ")}] AUTHENTICATE completed`
				: "OK AUTHENTICATE completed"
			: "NO [AUTHENTICATIONFAILED] AUTHENTICATE failed";
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

/**
 * Expect a LOGIN command (any credentials); reply OK.
 *
 * `capsAfter`, when given, folds a `[CAPABILITY ...]` code into the SAME
 * tagged OK (see `authPlainExchange`'s doc comment for the full rationale):
 * `ImapClient.authenticate()` (spec §3.3 step 5) re-issues CAPABILITY after
 * ANY successful LOGIN/AUTHENTICATE whose tagged OK didn't already carry
 * one, so a script that doesn't itself care about that duty needs this to
 * avoid stalling on an unscripted round trip. `sessionPrelude` always
 * supplies its own resolved capability list here so every one of its many
 * callers gets this for free.
 */
export function loginExchange(capsAfter?: string[]): ScriptStep[] {
	const suffix = capsAfter
		? `OK [CAPABILITY ${capsAfter.join(" ")}] LOGIN completed`
		: "OK LOGIN completed";
	return [expectLine(command("LOGIN")), reply(suffix)];
}

/**
 * greet + capabilityExchange (+ optional loginExchange) — the standard
 * session-establishment prelude.
 *
 * Deliberately sends a BARE greeting (no inline `[CAPABILITY ...]` code),
 * even for `profile: "rev2"` — unlike `greet({ profile: "rev2" })` used
 * standalone, which DOES attach one (RFC 9051 §6.3.2's documented server
 * norm; exercised by tests that specifically want that scenario, e.g. the
 * capability-round-trip-skip behavior). This helper's very next step is
 * ALWAYS `capabilityExchange(resolvedCaps)` — an unconditional round trip —
 * so an inline-capability greeting here would satisfy `ensureCapabilities()`
 * (spec §3.3 step 4: registry already valid+non-empty) before the client
 * ever reaches that step, leaving it permanently unconsumed and the
 * harness blocked on it (or worse, mismatched against whatever the client
 * sends next) for EVERY subsequent scripted exchange. A bare greeting
 * guarantees the round trip this helper always scripts is the one that
 * actually happens, so the registry ends up with exactly `resolvedCaps` —
 * matching every caller's intent (e.g. AUTH=/LOGINDISABLED/ENABLE probes
 * that a hardcoded rev2 greeting could never carry anyway).
 */
export function sessionPrelude(
	caps?: string[],
	opts: { login?: boolean; profile?: Profile } = {},
): ScriptStep[] {
	// rev2 default caps: IMAP4rev2 + LITERAL- (RFC 9051 §6.1.1); rev1 default: IMAP4rev1
	const defaultCaps = opts.profile === "rev2" ? ["IMAP4rev2", "LITERAL-"] : ["IMAP4rev1"];
	const resolvedCaps = caps ?? defaultCaps;
	return [
		send("* OK ready\r\n"),
		...capabilityExchange(resolvedCaps),
		...(opts.login ? loginExchange(resolvedCaps) : []),
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
	// UNSEEN names the first unseen message's sequence number, so it cannot
	// apply to an empty mailbox — defaulting it alongside exists=0 would
	// script a jointly-invalid state no real server sends. Omit it unless
	// the mailbox has messages (or the caller explicitly asked for it).
	const unseen = opts.unseen ?? (exists > 0 ? 1 : undefined);
	return [
		expectLine(command(verb, { args: new RegExp(`^(?:${name}|"${name}")$`, flags) })),
		reply(`OK [${code}] ${verb} completed`, [
			`* ${exists} EXISTS`,
			`* ${recent} RECENT`,
			...(unseen === undefined
				? []
				: [`* OK [UNSEEN ${unseen}] Message ${unseen} is first unseen`]),
			`* OK [UIDVALIDITY ${uidValidity}] UIDs valid`,
			`* OK [UIDNEXT ${uidNext}] Predicted next UID`,
			"* FLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft)",
			"* OK [PERMANENTFLAGS (\\Deleted \\Seen \\*)] Limited",
		]),
	];
}
