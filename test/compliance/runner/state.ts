import { command } from "../harness/matchers";
import { expectLine, reply, send, type ScriptStep } from "../harness/script";

/** Untagged greeting. */
export function greet(opts: { kind?: "ok" | "preauth"; text?: string } = {}): ScriptStep[] {
	const kind = opts.kind === "preauth" ? "PREAUTH" : "OK";
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

export interface SelectOptions {
	exists?: number;
	recent?: number;
	unseen?: number;
	uidValidity?: number;
	uidNext?: number;
	readOnly?: boolean;
}

/** Expect SELECT <mailbox>; reply with the canonical §6.3.1 data set. */
export function selectExchange(mailbox: string, opts: SelectOptions = {}): ScriptStep[] {
	const exists = opts.exists ?? 0;
	const recent = opts.recent ?? 0;
	const unseen = opts.unseen ?? 1;
	const uidValidity = opts.uidValidity ?? 1;
	const uidNext = opts.uidNext ?? exists + 1;
	const code = opts.readOnly ? "READ-ONLY" : "READ-WRITE";
	return [
		expectLine(command("SELECT", { args: new RegExp(`^"?${mailbox}"?$`, "i") })),
		reply(`OK [${code}] SELECT completed`, [
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
