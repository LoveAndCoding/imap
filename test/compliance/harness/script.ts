import type { LineMatcher } from "./matchers";

export type ScriptStep =
	| { kind: "send"; data: string | Buffer; chunks?: number[]; delayMs?: number }
	| { kind: "expect"; matcher: LineMatcher }
	| { kind: "reply"; suffix: string; untagged?: string[] }
	| { kind: "startTls" }
	| { kind: "close" }
	| { kind: "destroy" };

export function send(
	data: string | Buffer,
	opts: { chunks?: number[]; delayMs?: number } = {},
): ScriptStep {
	return { kind: "send", data, ...opts };
}

export function expectLine(matcher: LineMatcher): ScriptStep {
	return { kind: "expect", matcher };
}

export function startTls(): ScriptStep {
	return { kind: "startTls" };
}

export function close(): ScriptStep {
	return { kind: "close" };
}

export function destroy(): ScriptStep {
	return { kind: "destroy" };
}

/**
 * Sends optional untagged lines then `<tag-of-last-matched-command> SP suffix CRLF`.
 * e.g. reply("OK CAPABILITY completed", ["* CAPABILITY IMAP4rev1"])
 */
export function reply(suffix: string, untagged: string[] = []): ScriptStep {
	return { kind: "reply", suffix, untagged };
}
