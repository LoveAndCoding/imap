/**
 * RFC 7888 — "IMAP4 Non-synchronizing Literals" (LITERAL+ / LITERAL-).
 * Client-binding duties for the non-synchronizing literal wire form: when it
 * may be used, that it need not wait for a continuation, and (under LITERAL-)
 * the 4096-octet cap and the unchanged "+"-marked syntax.
 *
 * Testable catalog ids covered here (see test/compliance/catalog/ext/rfc7888.ts):
 *
 *   RFC7888-3-1  Non-synchronizing '{n+}' literals usable only when LITERAL+ or
 *                LITERAL- is advertised; otherwise the client uses '{n}' only.
 *   RFC7888-3-2  Client is not required to wait for a continuation request
 *                before sending the octets of a non-synchronizing literal.
 *   RFC7888-5-1  Under LITERAL-, non-synchronizing literals MUST NOT exceed 4096
 *                bytes.
 *   RFC7888-5-2  Under LITERAL-, a literal larger than 4096 bytes MUST be sent
 *                as a synchronizing literal.
 *   RFC7888-5-3  The non-synchronizing literal syntax is unchanged under
 *                LITERAL- — it still uses '{n+}', never a different sigil.
 *
 * PROFILE: all five entries are catalog-tagged profiles: ["rev1","rev2"]. RFC
 * 7888 is a freestanding extension a rev1 server may advertise and a rev1 client
 * may use exactly as written; for rev2 these remain the byte-for-byte source
 * text cross-referenced (not superseded) against their RFC9051-4.3-2/-3
 * counterparts, which are scored separately under the rev2 core catalog
 * (test/compliance/specs/rfc9051/4-data-formats.test.ts). This file scores the
 * RFC 7888 source ids specifically; no double-scoring of the rev2-core ids.
 *
 * OBSERVATION SURFACE: LITERAL+/- has no dedicated driver verb — the client
 * emits literals through commands whose arguments require literal syntax. The
 * driver's only literal-bearing verb is append(), which throws
 * NotImplementedError('APPEND') today, so every duty here self-actualizes to
 * 'unimplemented'. The scripted server records each emitted literal's octet
 * count, payload, and whether it carried the '+' non-synchronizing marker
 * (commandLines[].literals / .nonSync), so once APPEND (and non-sync literal
 * support) exists the marker/size assertions ARE the genuine checks. The
 * matchers are deliberately tight enough to reject a plausible wrong impl: a
 * '{n+}' emitted with neither capability advertised (3-1), a '{n+}' over 4096
 * on a LITERAL- connection (5-1/5-2), or a non-canonical literal sigil (5-3).
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { expectLine, reply } from "../../harness/script";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";
import { sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

/**
 * Extract every literal announcement marker from a command line's args as
 * `{ size, nonSync }`. The literal-marker regex accepts ONLY the two RFC-legal
 * wire forms — '{n}' (synchronizing) and '{n+}' (non-synchronizing) — so a
 * hypothetical third sigil never parses as a valid marker (RFC7888-5-3).
 */
function literalMarkers(args: string): Array<{ size: number; nonSync: boolean }> {
	return [...args.matchAll(/\{(\d+)(\+)?\}/g)].map((m) => ({
		size: Number(m[1]),
		nonSync: m[2] === "+",
	}));
}

// ── RFC7888-3-1: non-sync '{n+}' only when LITERAL+/LITERAL- is advertised ──
// The server here does NOT advertise LITERAL+ or LITERAL-, so the client is
// restricted to synchronizing '{n}' literals. Any literal the client emits for
// an APPEND payload MUST carry no '+' marker (nonSync === false) and the marker
// regex must show a bare '{n}'. append() throws today → unimplemented.
complianceTest(
	{
		reqs: ["RFC7888-3-1"],
		profiles: ["rev1", "rev2"],
		title: "client uses only synchronizing '{n}' literals when neither LITERAL+ nor LITERAL- is advertised",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				// Neither LITERAL+ nor LITERAL- advertised → non-sync form forbidden.
				...sessionPrelude(["IMAP4rev1"], { login: true }),
				expectLine(command("APPEND")),
				reply("OK APPEND completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user@example.com", "s3cret");
		await driver.append("INBOX", Buffer.from("Subject: t\r\n\r\n")); // throws today
		await server.assertCompleted();
		// When implemented: no '{n+}' non-synchronizing marker may appear on a
		// connection where neither LITERAL+ nor LITERAL- was advertised.
		const appendLine = server.commandLines.find((l) => l.verb === "APPEND");
		expect(appendLine).toBeDefined();
		expect(appendLine!.literals.length).toBeGreaterThanOrEqual(1);
		for (let i = 0; i < appendLine!.nonSync.length; i++) {
			expect(
				appendLine!.nonSync[i],
				`literal #${i} must be synchronizing (no LITERAL+/LITERAL- advertised)`,
			).toBe(false);
		}
		for (const { nonSync } of literalMarkers(appendLine!.args)) {
			expect(nonSync, "no '+' marker may appear without LITERAL+/LITERAL-").toBe(false);
		}
	},
);

// ── RFC7888-3-2 / RFC7888-5-3: non-sync literal needs no continuation wait ──
// With LITERAL+ advertised, the client MAY send a small non-synchronizing
// literal without waiting for a '+ ' continuation. The scripted server NEVER
// emits a '+ ' continuation for a '{n+}' announcement (the harness only
// auto-continues plain '{n}' synchronizing literals), so a completed APPEND
// whose literal carried the '+' marker proves the client did not block waiting
// for a continuation it was never sent (3-2). The marker is the canonical
// '{n+}' sigil, unchanged (5-3). append() throws today → unimplemented.
complianceTest(
	{
		reqs: ["RFC7888-3-2", "RFC7888-5-3"],
		profiles: ["rev1", "rev2"],
		title: "LITERAL+: a '{n+}' literal completes without any continuation round trip and keeps the '+' sigil",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "LITERAL+"], { login: true }),
				// The server offers NO '+ ' continuation for a non-sync literal; if
				// the client wrongly blocked waiting for one, the step would time out.
				expectLine(command("APPEND")),
				reply("OK APPEND completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user@example.com", "s3cret");
		await driver.append("INBOX", Buffer.from("Subject: small\r\n\r\nbody\r\n")); // throws today
		await server.assertCompleted();
		const appendLine = server.commandLines.find((l) => l.verb === "APPEND");
		expect(appendLine).toBeDefined();
		expect(appendLine!.literals.length).toBeGreaterThanOrEqual(1);
		// When implemented: under LITERAL+ the client used the non-synchronizing
		// form for at least one literal, and it carried the canonical '{n+}' sigil.
		const markers = literalMarkers(appendLine!.args);
		expect(markers.length).toBeGreaterThanOrEqual(1);
		expect(
			appendLine!.nonSync.some((ns) => ns),
			"at least one literal used the non-synchronizing '{n+}' form",
		).toBe(true);
		// 5-3: every emitted marker parses as bare '{n}' or '{n+}' — no third form.
		const rawMarkerCount = (appendLine!.args.match(/\{[^}]*\}/g) ?? []).length;
		expect(
			markers.length,
			"every literal marker must be a canonical '{n}' or '{n+}' form",
		).toBe(rawMarkerCount);
	},
);

// ── RFC7888-5-1 / RFC7888-5-2: LITERAL- 4096-octet cap ─────────────────────
// Under LITERAL- (advertised alone, without LITERAL+), a non-synchronizing
// literal MUST NOT exceed 4096 octets (5-1); any literal larger than 4096 bytes
// MUST be sent as a synchronizing literal (5-2). Observable via the markers: no
// '{n+}' with n > 4096, and any n > 4096 announcement uses the bare '{n}'
// synchronizing form. Driven with a >4096-octet payload to make the cap
// non-vacuous. append() throws today → unimplemented.
complianceTest(
	{
		reqs: ["RFC7888-5-1", "RFC7888-5-2"],
		profiles: ["rev1", "rev2"],
		title: "LITERAL-: a literal larger than 4096 octets is sent synchronizing, never as '{n+}'",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				// LITERAL- advertised (NOT LITERAL+): the 4096 cap applies.
				...sessionPrelude(["IMAP4rev1", "LITERAL-"], { login: true }),
				expectLine(command("APPEND")),
				reply("OK APPEND completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user@example.com", "s3cret");
		const bigBody = Buffer.from(`Subject: big\r\n\r\n${"z".repeat(6000)}\r\n`);
		await driver.append("INBOX", bigBody); // throws today
		await server.assertCompleted();
		const appendLine = server.commandLines.find((l) => l.verb === "APPEND");
		expect(appendLine).toBeDefined();
		const markers = literalMarkers(appendLine!.args);
		expect(markers.length).toBeGreaterThanOrEqual(1);
		for (const { size, nonSync } of markers) {
			if (nonSync) {
				// 5-1: a '{n+}' non-synchronizing literal is capped at 4096 octets.
				expect(size, `non-synchronizing literal {${size}+} exceeds the LITERAL- 4096 cap`).toBeLessThanOrEqual(
					4096,
				);
			}
			if (size > 4096) {
				// 5-2: any literal over 4096 octets MUST be synchronizing ('{n}').
				expect(nonSync, `literal {${size}} over 4096 must be sent synchronizing`).toBe(false);
			}
		}
		// Corroborate against the harness's per-literal nonSync capture: no
		// recorded literal larger than 4096 octets may have used the non-sync form.
		for (let i = 0; i < appendLine!.literals.length; i++) {
			if (appendLine!.literals[i].length > 4096) {
				expect(
					appendLine!.nonSync[i],
					`literal #${i} (${appendLine!.literals[i].length} octets) must be synchronizing under LITERAL-`,
				).toBe(false);
			}
		}
	},
);
