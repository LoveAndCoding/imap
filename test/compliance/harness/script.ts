import type { LineMatcher } from "./matchers";

export type ScriptStep =
	| { kind: "send"; data: string | Buffer; chunks?: number[]; delayMs?: number }
	| { kind: "expect"; matcher: LineMatcher }
	| { kind: "reply"; suffix: string; untagged?: string[] }
	| { kind: "startTls"; expectAbort?: boolean }
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

/**
 * Server-side upgrade of the connection to TLS, mid-script.
 *
 * Default (`expectAbort` unset/false): expects the handshake to complete
 * normally. If the underlying transport instead closes/errors before the
 * server side ever observes `'secure'`, that is a script failure — this
 * preserves the pre-existing behaviour for every script that already calls
 * `startTls()` expecting a successful upgrade.
 *
 * `expectAbort: true`: expects the *client* to abort the handshake (e.g.
 * because it performed a post-STARTTLS identity check and rejected the
 * result) — a real handshake is still attempted server-side, but the server
 * expects it to end in the client tearing down the connection rather than
 * completing. If the handshake instead completes successfully, that is a
 * script failure (the client should have aborted but didn't).
 */
export function startTls(opts: { expectAbort?: boolean } = {}): ScriptStep {
	return { kind: "startTls", ...opts };
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
