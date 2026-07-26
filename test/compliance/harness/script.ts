import type { LineMatcher } from "./matchers";

export type ScriptStep =
	| { kind: "send"; data: string | Buffer; chunks?: number[]; delayMs?: number }
	| { kind: "expect"; matcher: LineMatcher }
	| { kind: "reply"; suffix: string; untagged?: string[] }
	| { kind: "startTls"; expectAbort?: boolean }
	| { kind: "startCompression" }
	| { kind: "endCompression"; direction: "inbound" | "outbound" }
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

/**
 * Server-side activation of RFC 4978 COMPRESS=DEFLATE, mid-script. Place it
 * immediately after the `reply("OK ...")` that accepts the client's
 * COMPRESS DEFLATE command (RFC 4978 §3: both sides start compressing
 * directly after that tagged OK's CRLF). From this step on, every incoming
 * client byte is run through a raw-DEFLATE (RFC 1951) inflater before line
 * matching, and every outgoing `send`/`reply` is deflated before hitting
 * the socket — the transcript keeps recording the PLAINTEXT forms on both
 * sides (that is what assertions grep), with `!` markers bracketing the
 * compressed span.
 */
export function startCompression(): ScriptStep {
	return { kind: "startCompression" };
}

/**
 * Server-side termination of ONE direction of an active COMPRESS=DEFLATE
 * layer, mid-script — the RFC 8437 UNAUTHENTICATE boundary is per-direction
 * (RFC8437-4.1-1), so the two teardowns are separate steps at their exact
 * wire positions:
 *
 *   - `endCompression("inbound")` goes immediately AFTER the
 *     `expectLine(<UNAUTHENTICATE>)` and BEFORE the reply: the CLIENT's
 *     outgoing layer terminates at the CRLF following the UNAUTHENTICATE
 *     command itself, so every client byte after that line — starting with
 *     whatever arrives while the server is still composing its reply — is
 *     plaintext and must stop routing through the harness inflater. A
 *     client that wrongly keeps compressing produces opaque bytes that
 *     fail the next line match (and error the inflater in the
 *     already-torn-down case).
 *   - `endCompression("outbound")` goes immediately AFTER the
 *     `reply("OK ...")`: the SERVER's outgoing layer terminates after the
 *     CRLF following that OK, so the reply itself is still compressed and
 *     every later send is plaintext.
 */
export function endCompression(direction: "inbound" | "outbound"): ScriptStep {
	return { kind: "endCompression", direction };
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
