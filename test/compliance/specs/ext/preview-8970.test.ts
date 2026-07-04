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
 *
 * Untestable/lower-priority, NOT cited here: RFC8970-3.3-1 (client MUST
 * treat PREVIEW text as unencoded UTF-8 text/plain — a rendering-layer
 * duty with no distinct wire-parse assertion beyond receiving the string
 * FETCH already exercises) and RFC8970-4.2-1 (SHOULD NOT continually
 * re-issue FETCH PREVIEW (LAZY) — a request-cadence duty requiring a
 * multi-request timing probe out of this file's scope).
 *
 * REAL-SIGNAL ASSESSMENT (per the catalog's own note): no REAL parse
 * surface is reachable for ANY PREVIEW duty — driver.fetch()/uidFetch()
 * throw NotImplementedError('FETCH')/('UID FETCH') unconditionally before
 * any command reaches the wire, and there is no FetchOptions surface for a
 * LAZY-style modifier either. All entries below are therefore honest
 * self-actualizing fails; the scripted server pins the exact wire forms
 * and response shapes from RFC 8970's own §5 worked examples.
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { expectLine, reply } from "../../harness/script";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";
import { sessionPrelude } from "../../runner/state";

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
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(previewCaps(ctx.profile), { profile: ctx.profile }),
				expectLine(command("FETCH", { args: /^1 \(RFC822\.SIZE PREVIEW\)$/i })),
				reply("OK FETCH completed", [
					'* 1 FETCH (RFC822.SIZE 5647 PREVIEW "This is a short preview of the message.")',
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.fetch("1", ["RFC822.SIZE", "PREVIEW"]); // throws NotImplementedError today
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
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(previewCaps(ctx.profile), { profile: ctx.profile }),
				expectLine(command("FETCH", { args: /^1:4 \(ENVELOPE PREVIEW \(LAZY\)\)$/i })),
				reply("OK FETCH completed", [
					'* 3 FETCH (ENVELOPE ("date" NIL NIL NIL NIL NIL NIL NIL NIL NIL) PREVIEW NIL)',
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.fetch("1:4", ["ENVELOPE", "PREVIEW (LAZY)"]); // throws today
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
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(previewCaps(ctx.profile), { profile: ctx.profile }),
				expectLine(command("FETCH", { args: /^2 \(PREVIEW ENVELOPE\)$/i })),
				reply("OK FETCH completed", [
					'* 2 FETCH (PREVIEW "" ENVELOPE ("date" NIL NIL NIL NIL NIL NIL NIL NIL NIL))',
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.fetch("2", ["PREVIEW", "ENVELOPE"]); // throws NotImplementedError today
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
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(previewCaps(ctx.profile), { profile: ctx.profile }),
				expectLine(command("FETCH", { args: /^1 \(PREVIEW \(LAZY\)\)$/i })),
				reply("OK FETCH completed", ['* 1 FETCH (PREVIEW "Preview text.")']),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.fetch("1", ["PREVIEW (LAZY)"]); // throws NotImplementedError today
		await server.assertCompleted();
		const fetch = server.commandLines.find((l) => l.verb === "FETCH");
		expect(fetch, "FETCH must have been emitted").toBeDefined();
		expect(
			fetch!.args,
			"the LAZY modifier must be spelled exactly '(LAZY)' immediately following PREVIEW",
		).toMatch(/^1 \(PREVIEW \(LAZY\)\)$/i);
	},
);
