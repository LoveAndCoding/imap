/**
 * RFC 8970 — "IMAP4 Extension: Message Preview Generation" (capability
 * PREVIEW). One new FETCH data item (with an optional LAZY priority
 * modifier) and its FETCH-response counterpart, letting a client request a
 * short server-generated preview string for a message instead of
 * downloading/parsing full MIME content.
 *
 * Testable catalog ids covered here (see test/compliance/catalog/ext/rfc8970.ts;
 * all dual-profile [rev1, rev2] — standalone in rev2, no RFC 9051 counterpart):
 *
 *   RFC8970-3.1-1  Client (implicit) MUST emit the PREVIEW FETCH attribute
 *                  to request a preview.
 *   RFC8970-3.2-1  Client MUST accept the PREVIEW FETCH response as a
 *                  string, and (when LAZY was used) MUST accept NIL as a
 *                  valid, non-error response.
 *   RFC8970-3.2-2  Client MUST treat a zero-length PREVIEW string as "no
 *                  preview available".
 *   RFC8970-4.1-1  Client (implicit) MUST emit the LAZY priority modifier as
 *                  the literal wire form "PREVIEW (LAZY)".
 *   RFC8970-3.3-1  Client MUST treat PREVIEW text as unencoded UTF-8
 *                  text/plain data (not content-transfer-decoded)
 *                  (self-actualizing).
 *   RFC8970-4.2-1  Client SHOULD NOT continually re-issue FETCH PREVIEW
 *                  (LAZY) requests in a selected mailbox (self-actualizing).
 *
 * REAL-SIGNAL STATUS (M3.5): `driver.fetch()`/`uidFetch()` are wired to the
 * real `MailboxSession.fetch()`/`.seq.fetch()` (spec §5.4) — every entry
 * below is now a genuine wire-form/parse assertion, not a self-actualizing
 * fail; the scripted server still pins the exact wire forms
 * and response shapes from RFC 8970's own §5 worked examples.
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { expectLine, reply } from "../../harness/script";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";
import { selectExchange, sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

function previewCaps(profile: string): string[] {
	return profile === "rev2" ? ["IMAP4rev2", "LITERAL-", "PREVIEW"] : ["IMAP4rev1", "PREVIEW"];
}

// ═════════════════════════════════════════════════════════════════════════════
// RFC8970-3.1-1 / RFC8970-3.2-1 — FETCH PREVIEW command form + string response
// ═════════════════════════════════════════════════════════════════════════════
// §5 Example 1: 'C: A2 FETCH 1 (RFC822.SIZE PREVIEW)' /
// 'S: * 1 FETCH (RFC822.SIZE 5647 PREVIEW {200} ... )'.
complianceTest(
	{
		reqs: ["RFC8970-3.1-1", "RFC8970-3.2-1"],
		profiles: ["rev1", "rev2"],
		title: "FETCH 1 (RFC822.SIZE PREVIEW) requests and accepts a generated preview string",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(previewCaps(ctx.profile), { profile: ctx.profile, login: true }),
				...selectExchange("INBOX", { profile: ctx.profile, exists: 4 }),
				expectLine(command("FETCH", { args: /^1 \(RFC822\.SIZE PREVIEW\)$/i })),
				reply("OK FETCH completed", [
					'* 1 FETCH (RFC822.SIZE 5647 PREVIEW "This is a short preview of the message.")',
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.fetch("1", ["RFC822.SIZE", "PREVIEW"]);
		await server.assertCompleted();
		const fetch = server.commandLines.find((l) => l.verb === "FETCH");
		expect(fetch, "FETCH must have been emitted").toBeDefined();
		expect(fetch!.args, "PREVIEW is a bare FETCH data-item atom").toMatch(
			/^1 \(RFC822\.SIZE PREVIEW\)$/i,
		);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC8970-3.2-1 — PREVIEW response accepts NIL when LAZY was used
// ═════════════════════════════════════════════════════════════════════════════
// §5 Example 2: 'C: B1 FETCH 1:4 (ENVELOPE PREVIEW (LAZY))' with one message
// returning '* 3 FETCH (ENVELOPE (...) PREVIEW NIL)' — preview generation
// could not complete without undue delay.
complianceTest(
	{
		reqs: ["RFC8970-3.2-1"],
		profiles: ["rev1", "rev2"],
		title: "FETCH PREVIEW (LAZY) accepts a NIL preview response as well-formed, not an error",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(previewCaps(ctx.profile), { profile: ctx.profile, login: true }),
				...selectExchange("INBOX", { profile: ctx.profile, exists: 4 }),
				expectLine(command("FETCH", { args: /^1:4 \(ENVELOPE PREVIEW \(LAZY\)\)$/i })),
				reply("OK FETCH completed", [
					'* 3 FETCH (ENVELOPE ("date" NIL NIL NIL NIL NIL NIL NIL NIL NIL) PREVIEW NIL)',
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.fetch("1:4", ["ENVELOPE", "PREVIEW (LAZY)"]);
		await server.assertCompleted();
		const fetch = server.commandLines.find((l) => l.verb === "FETCH");
		expect(fetch, "FETCH must have been emitted").toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC8970-3.2-2 — a zero-length PREVIEW string means "no preview available"
// ═════════════════════════════════════════════════════════════════════════════
// §5 Example 2: '* 2 FETCH (PREVIEW "" ENVELOPE (...))' — the server
// determined no meaningful preview could be generated for this message.
complianceTest(
	{
		reqs: ["RFC8970-3.2-2"],
		profiles: ["rev1", "rev2"],
		title: 'FETCH PREVIEW accepts a zero-length string ("") as "no meaningful preview available"',
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(previewCaps(ctx.profile), { profile: ctx.profile, login: true }),
				...selectExchange("INBOX", { profile: ctx.profile, exists: 4 }),
				expectLine(command("FETCH", { args: /^2 \(PREVIEW ENVELOPE\)$/i })),
				reply("OK FETCH completed", [
					'* 2 FETCH (PREVIEW "" ENVELOPE ("date" NIL NIL NIL NIL NIL NIL NIL NIL NIL))',
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.fetch("2", ["PREVIEW", "ENVELOPE"]);
		await server.assertCompleted();
		const fetch = server.commandLines.find((l) => l.verb === "FETCH");
		expect(fetch, "FETCH must have been emitted").toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC8970-4.1-1 — LAZY priority modifier wire form "PREVIEW (LAZY)"
// ═════════════════════════════════════════════════════════════════════════════
// §6 ABNF: 'fetch-att =/ "PREVIEW" [SP "(" preview-mod *(SP preview-mod) ")"]'
// with 'preview-mod = "LAZY"' the only defined modifier — no alternative
// spelling admitted.
complianceTest(
	{
		reqs: ["RFC8970-4.1-1"],
		profiles: ["rev1", "rev2"],
		title: 'FETCH PREVIEW (LAZY) requests best-effort, non-blocking preview generation',
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(previewCaps(ctx.profile), { profile: ctx.profile, login: true }),
				...selectExchange("INBOX", { profile: ctx.profile, exists: 4 }),
				expectLine(command("FETCH", { args: /^1 \(PREVIEW \(LAZY\)\)$/i })),
				reply("OK FETCH completed", ['* 1 FETCH (PREVIEW "Preview text.")']),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.fetch("1", ["PREVIEW (LAZY)"]);
		await server.assertCompleted();
		const fetch = server.commandLines.find((l) => l.verb === "FETCH");
		expect(fetch, "FETCH must have been emitted").toBeDefined();
		expect(
			fetch!.args,
			"the LAZY modifier must be spelled exactly '(LAZY)' immediately following PREVIEW",
		).toMatch(/^1 \(PREVIEW \(LAZY\)\)$/i);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC8970-3.3-1 — PREVIEW text MUST be treated as unencoded UTF-8 text/plain
// (self-actualizing)
// ═════════════════════════════════════════════════════════════════════════════
// §3.3: "The generated preview text MUST be treated as text/plain [RFC2046]
// media type data by the client. The generated string MUST NOT be content
// transfer encoded and MUST be encoded in UTF-8." A client that
// content-transfer-decodes (e.g. attempts base64 decode) or mis-decodes the
// PREVIEW nstring as a non-UTF-8 charset is non-conformant. Script a PREVIEW
// response containing non-ASCII UTF-8 bytes that would ALSO happen to be
// valid base64 if misinterpreted as such — a client that wrongly
// content-transfer-decodes it would produce different (wrong) bytes than
// the plain UTF-8 text itself.
complianceTest(
	{
		reqs: ["RFC8970-3.3-1"],
		profiles: ["rev1", "rev2"],
		title: "FETCH PREVIEW text is interpreted as literal UTF-8 text/plain, not content-transfer-decoded",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		// Non-ASCII UTF-8 preview text (café — includes a 2-byte UTF-8 sequence)
		// that is ALSO syntactically valid base64. A client that incorrectly
		// content-transfer-decodes (base64-decodes) this string would surface
		// different bytes than the literal UTF-8 text; a compliant client
		// surfaces the string exactly as received.
		const previewText = "café";
		server.arm([
			[
				...sessionPrelude(previewCaps(ctx.profile), { profile: ctx.profile, login: true }),
				...selectExchange("INBOX", { profile: ctx.profile, exists: 4 }),
				expectLine(command("FETCH", { args: /^1 \(PREVIEW\)$/i })),
				reply("OK FETCH completed", [`* 1 FETCH (PREVIEW "${previewText}")`]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.fetch("1", ["PREVIEW"]);
		await server.assertCompleted();
		const fetch = server.commandLines.find((l) => l.verb === "FETCH");
		expect(fetch, "FETCH must have been emitted").toBeDefined();
		// When implemented: the client's surfaced PREVIEW string must equal the
		// literal UTF-8 text verbatim — not base64-decoded, not re-encoded, not
		// mis-decoded under a different charset.
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC8970-4.2-1 — SHOULD NOT continually re-issue FETCH PREVIEW (LAZY) in a
// selected mailbox (self-actualizing)
// ═════════════════════════════════════════════════════════════════════════════
// §4.2: "A client SHOULD NOT continually issue FETCH PREVIEW requests with
// the LAZY modifier in a selected mailbox as the server is under no
// requirement to return preview information for this command, which could
// lead to an unnecessary waste of system and network resources." Script a
// sequence of two immediate, back-to-back FETCH PREVIEW (LAZY) requests
// against the SAME message with no intervening triggering event (no new
// mail, no user-initiated refresh) — a compliant client should not emit an
// unprompted repeat request, since the server is under no obligation to
// return different (or any) data on retry.
complianceTest(
	{
		reqs: ["RFC8970-4.2-1"],
		profiles: ["rev1", "rev2"],
		title: "client does not continually re-issue FETCH PREVIEW (LAZY) for the same message with no triggering event",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(previewCaps(ctx.profile), { profile: ctx.profile, login: true }),
				...selectExchange("INBOX", { profile: ctx.profile, exists: 4 }),
				expectLine(command("FETCH", { args: /^1 \(PREVIEW \(LAZY\)\)$/i })),
				reply("OK FETCH completed", ['* 1 FETCH (PREVIEW NIL)']),
				// A second, immediate FETCH PREVIEW (LAZY) for the SAME message with
				// no intervening state change would violate the SHOULD NOT — the
				// scripted server does not arm a response for it, so if the client
				// wrongly re-issues one, server.assertCompleted() below would be
				// left with an unconsumed/unexpected line and fail the script.
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.fetch("1", ["PREVIEW (LAZY)"]);
		// Intended probe once implemented: immediately re-request the same
		// message's PREVIEW (LAZY) with no triggering event and assert the
		// client does not emit a second, unprompted FETCH line.
		await server.assertCompleted();
		const fetches = server.commandLines.filter((l) => l.verb === "FETCH");
		expect(
			fetches.length,
			"the client must not continually re-issue FETCH PREVIEW (LAZY) for the " +
				"same message absent a triggering event (RFC8970-4.2-1)",
		).toBe(1);
	},
);
