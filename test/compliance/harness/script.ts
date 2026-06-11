import type { LineMatcher } from "./matchers";

export type ScriptStep =
	| { kind: "send"; data: string | Buffer; chunks?: number[]; delayMs?: number }
	| { kind: "expect"; matcher: LineMatcher }
	| { kind: "startTls" }
	| { kind: "close" };

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
