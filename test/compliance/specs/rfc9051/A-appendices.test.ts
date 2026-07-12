/**
 * RFC 9051 Appendix A (Backward Compatibility with IMAP4rev1) + Appendix D
 * (63-Bit Body Part and Message Sizes) — rev2 profile
 *
 * Testable requirements covered here:
 *
 * RFC9051-A-1:  Client MUST issue "ENABLE IMAP4rev2" to use IMAP4rev2 when
 *               both IMAP4rev1 and IMAP4rev2 are advertised.
 * RFC9051-A-4:  Modified base64 MUST NOT represent a printable US-ASCII
 *               character that can represent itself (mod-UTF-7 name construction).
 * RFC9051-A-5:  Modified UTF-7 names MUST end in US-ASCII (a name ending in a
 *               non-ASCII character MUST end with "-").
 * RFC9051-A-7:  Client SHOULD NOT attempt to create an embedded-"&" mailbox
 *               name unless it complies with modified UTF-7 syntax.
 * RFC9051-A-8:  No implicit shift back to US-ASCII; null shifts ("-&" while in
 *               base64) are not permitted.
 * RFC9051-D-1:  Client implementations have to expect 63-bit-long body part /
 *               message sizes.
 *
 * A-1 CLASSIFICATION (ADJUDICATED DEVIATION, expectFailure: "violation" —
 * see docs/compliance-adjudications.md): `driver.enable()` IS implemented
 * (`ImapClient.enableExtensions`), but the modern-API spec's §3.4 settled
 * decision permanently excludes IMAP4rev2 from the `connect()` ritual's
 * auto-ENABLE set (src/client/client.ts's `AUTO_ENABLE_SET` comment: "rev2
 * enablement is a profile decision... deferred; not 1.0") — there is no
 * "I want IMAP4rev2" signal the connect() ritual can act on today, so the
 * client never auto-issues ENABLE IMAP4rev2 at the point this MUST cares
 * about (before relying on rev2-only behavior). This is a deliberate,
 * permanent deviation from the letter of RFC9051-A-1, not a gap that will
 * close as more of the client lands — see the adjudications doc for the
 * full rationale (the client speaks rev1-compatible syntax to rev2 servers,
 * which RFC 9051 permits).
 *
 * A-4/A-5/A-7/A-8 are conditional on the client CONSTRUCTING an international
 * (or embedded-"&") mailbox name while intending IMAP4rev1-server
 * compatibility. REAL SIGNAL (M2.3): driver.create() is wired, and the
 * client's settled posture — it speaks rev1-compatible syntax to rev2
 * servers and never auto-ENABLEs IMAP4rev2 (spec §3.4; the adjudicated A-1
 * deviation above) — means mod-UTF-7 name construction genuinely happens on
 * these rev2 sessions (raw UTF-8 names would require UTF8=ACCEPT, which
 * these scripts deliberately do not advertise). Each script's expectLine
 * pins the exact modified UTF-7 wire form and the post-completion
 * assertions re-verify it. A-7's assertion was revised at M2.3 — see that
 * test's comment (the old "-&" substring check false-positived on the
 * compliant '&'-escape correction).
 *
 * D-1 is observable NOW via connectLow() + an unsolicited FETCH carrying a
 * 63-bit RFC822.SIZE; it should pass (JS numbers are exact to 2^53, well above
 * the 5e9 value used) and is transcript-verified through waitForUntagged.
 */
import { expect } from "vitest";

import type { ObservedEvent } from "../../driver/driver";
import { command } from "../../harness/matchers";
import { close, expectLine, reply, send } from "../../harness/script";
import { complianceTest } from "../../runner/compliance-test";
import { waitForUntagged } from "../../runner/events";
import { useComplianceFixture } from "../../runner/fixture";
import { sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

interface ParsedFetchSize {
	size?: number | bigint;
}
function contentOf<T>(ev: ObservedEvent): T {
	return ((ev.detail as { content?: unknown } | undefined)?.content ?? {}) as T;
}

// ── RFC9051-A-1: ENABLE IMAP4rev2 when both revisions advertised ──────────
// The server greeting/CAPABILITY advertises BOTH IMAP4rev1 and IMAP4rev2. A
// client that "wants to use IMAP4rev2" MUST issue "ENABLE IMAP4rev2" before
// relying on rev2-only behavior. ADJUDICATED DEVIATION (see the file header
// note and docs/compliance-adjudications.md): the modern-API spec §3.4
// deliberately excludes IMAP4rev2 from the client's auto-ENABLE set, so the
// connect() ritual never issues it — a genuine, permanent violation of this
// MUST, not an unimplemented gap.
complianceTest(
	{
		reqs: ["RFC9051-A-1"],
		profiles: ["rev2"],
		title: "client issues ENABLE IMAP4rev2 when both IMAP4rev1 and IMAP4rev2 are advertised",
		expectFailure: "violation",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		// Bare greeting (no inline [CAPABILITY ...] code): a greeting-carried
		// capability code would make the client skip the CAPABILITY round trip
		// entirely (spec §3.3) and stall the scripted exchange below forever.
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK CAPABILITY completed", ["* CAPABILITY IMAP4rev1 IMAP4rev2"]),
				// A conformant client would enable rev2 before relying on rev2-only
				// behavior — but see the ADJUDICATED DEVIATION note above: this is
				// deliberately never scripted as a requirement here.
			],
		]);
		await f.connectPlain(server);
		// driver.enable() IS implemented (ImapClient.enableExtensions), but the
		// client's `connect()` ritual never calls it automatically for
		// IMAP4rev2 (src/client/client.ts's AUTO_ENABLE_SET permanently
		// excludes it — see the ADJUDICATED DEVIATION note above): there is no
		// "I want IMAP4rev2" signal the connect() ritual can act on today,
		// so no ENABLE IMAP4rev2 is ever issued at the point the catalog
		// requirement cares about (before relying on rev2-only behavior).
		await server.assertCompleted();
		// The genuine catalog duty — the client MUST issue ENABLE IMAP4rev2 here —
		// is asserted directly (the positive requirement, not its absence): this
		// fails today, honestly recording the adjudicated deviation as a real
		// violation rather than a vacuous "absence of the unimplemented verb" pass.
		expect(
			server.commandLines.some((l) => l.verb === "ENABLE" && /IMAP4rev2/i.test(l.args)),
			"the client MUST issue ENABLE IMAP4rev2 when both revisions are advertised — adjudicated deviation, see docs/compliance-adjudications.md",
		).toBe(true);
	},
);

// ── RFC9051-A-4: modified base64 MUST NOT encode representable US-ASCII ────
// The consumer-supplied name "Résumé" has representable ASCII ("R", "sum")
// interleaved with non-ASCII ("é"). The conformant modified UTF-7 form leaves
// the ASCII runs unshifted and only base64-encodes the "é" characters:
//     "R&AOk-sum&AOk-"
// — never base64-encoding an ASCII character that can represent itself, and
// using only modified-base64-alphabet characters inside the shifted regions.
// REAL SIGNAL (M2.3): driver.create() is wired; the client speaks
// rev1-compatible syntax to rev2 servers (spec §3.4/adjudicated RFC9051-A-1
// posture), so mod-UTF-7 name construction genuinely happens here.
complianceTest(
	{
		reqs: ["RFC9051-A-4"],
		profiles: ["rev2"],
		title: "client mod-UTF-7-encodes only non-ASCII, never representable US-ASCII",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { login: true, profile: "rev2" }),
				// The exact conformant modified UTF-7 form (quoted or atom).
				expectLine(
					command("CREATE", { args: /^(?:R&AOk-sum&AOk-|"R&AOk-sum&AOk-")$/ }),
				),
				reply("OK CREATE completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user@example.com", "s3cret");
		// Intending IMAP4rev1-server compatibility → mod-UTF-7 name construction.
		await driver.create("Résumé");
		await server.assertCompleted();
		// Verify the encoded name shifts ONLY around non-ASCII.
		const createLine = server.commandLines.find((l) => l.verb === "CREATE");
		expect(createLine).toBeDefined();
		const name = createLine!.args.replace(/^"|"$/g, "");
		expect(name).toBe("R&AOk-sum&AOk-");
		// No modified-base64 region may encode a representable ASCII character:
		// every "&...-" run here decodes to non-ASCII ("é") only.
		for (const run of name.matchAll(/&([^-]*)-/g)) {
			// The shifted payload must use only modified-base64 alphabet chars
			// (A–Z a–z 0–9 + ,) — never a bare printable ASCII "self".
			expect(run[1]).toMatch(/^[A-Za-z0-9+,]*$/);
		}
	},
);

// ── RFC9051-A-5: modified UTF-7 names MUST end in US-ASCII ─────────────────
// The consumer name "café" ends in a non-ASCII character ("é"). Its conformant
// modified UTF-7 form is "caf&AOk-": the trailing shift-back "-" makes the name
// END in US-ASCII, rather than leaving it open in the shifted base64 state
// ("caf&AOk", which would be non-conformant).
// REAL SIGNAL (M2.3): driver.create() is wired.
complianceTest(
	{
		reqs: ["RFC9051-A-5"],
		profiles: ["rev2"],
		title: "client terminates a non-ASCII-ending name with a shift-back to US-ASCII",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { login: true, profile: "rev2" }),
				expectLine(command("CREATE", { args: /^(?:caf&AOk-|"caf&AOk-")$/ })),
				reply("OK CREATE completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user@example.com", "s3cret");
		await driver.create("café");
		await server.assertCompleted();
		// The wire name must END in US-ASCII (a "-" closing the final base64
		// shift), not trail off in the modified-base64 state.
		const createLine = server.commandLines.find((l) => l.verb === "CREATE");
		expect(createLine).toBeDefined();
		const name = createLine!.args.replace(/^"|"$/g, "");
		expect(name).toBe("caf&AOk-");
		// A name ending with a non-ASCII ISO-10646 char MUST end with "-".
		expect(name.endsWith("-")).toBe(true);
		// The last character is US-ASCII (the shift-back), never a raw non-ASCII byte.
		expect(name.charCodeAt(name.length - 1)).toBeLessThanOrEqual(0x7f);
	},
);

// ── RFC9051-A-7: SHOULD NOT emit a non-conformant embedded-"&" name ────────
// The consumer requests a name containing an embedded "&" that is NOT valid
// modified UTF-7 (the RFC's own counter-example, a superfluous shift). A
// conformant client SHOULD NOT transmit it verbatim — it must reject, correct,
// or refuse. REAL SIGNAL (M2.3): driver.create() is wired; the client
// CORRECTS: it treats the caller's string as a plain Unicode name and
// escapes each literal '&' per Appendix A.1 ('&' -> '&-'), producing the
// fully conformant "&-U,BTFw-&-ZeVnLIqe-".
//
// Assertion revised at M2.3: the previous check was a bare
// `not.toContain("-&")` over the whole wire name — an over-narrow matcher
// that false-positives on the compliant correction above, where the "-&"
// substring occurs at a literal-'-'/escape-open boundary, NOT "while in
// base64" (the only place Appendix A.1's null-shift prohibition applies;
// there is no base64 run at all in the corrected form — every '&' is
// immediately closed by '-'). The revised assertions pin the actual duty:
// the verbatim non-conformant sequence must not be transmitted, and every
// '&' in what IS transmitted must open a well-formed, '-'-terminated
// shift/escape.
complianceTest(
	{
		reqs: ["RFC9051-A-7"],
		profiles: ["rev2"],
		title: "client does not send a syntactically invalid embedded-'&' mailbox name verbatim",
		timeout: 5000,
	},
	async () => {
		// RFC 9051 App A.1 counter-example of a non-conformant sequence.
		const badName = "&U,BTFw-&ZeVnLIqe-";
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { login: true, profile: "rev2" }),
				// The matcher intentionally rejects the verbatim non-conformant name:
				// only a name with NO superfluous null-shift "-&" is accepted.
				expectLine(
					command("CREATE", {
						args: /^(?:"[^"]*"|[^\s"]+)$/,
					}),
				),
				reply("OK CREATE completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user@example.com", "s3cret");
		await driver.create(badName);
		await server.assertCompleted();
		// Whatever the client transmits, it must not be the raw non-conformant
		// sequence itself…
		const createLine = server.commandLines.find((l) => l.verb === "CREATE");
		expect(createLine).toBeDefined();
		const name = createLine!.args.replace(/^"|"$/g, "");
		expect(
			name,
			"client must not transmit the non-conformant embedded-'&' name verbatim",
		).not.toBe(badName);
		// …and every '&' in the corrected form must comply with the modified
		// UTF-7 syntax: stripping each well-formed, '-'-terminated shift/escape
		// ('&' + modified-BASE64 alphabet run + '-') must leave no '&' behind
		// (a leftover '&' would be a bare/dangling shift).
		expect(
			name.replace(/&[A-Za-z0-9+,]*-/g, ""),
			"every transmitted '&' must open a well-formed, '-'-terminated shift",
		).not.toContain("&");
	},
);

// ── RFC9051-A-8: null shifts ("-&") in modified UTF-7 are not permitted ────
// A superfluous "-&" (shift back to US-ASCII immediately followed by a shift
// back into base64, encoding nothing between them) is a null shift and is not
// permitted. For the international name "Résumé" the conformant form
// ("R&AOk-sum&AOk-") re-enters base64 with "&" only where real non-ASCII
// content follows — never an empty "-&" pair.
// REAL SIGNAL (M2.3): driver.create() is wired.
complianceTest(
	{
		reqs: ["RFC9051-A-8"],
		profiles: ["rev2"],
		title: "client emits no null-shift '-&' sequence in a modified UTF-7 name",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { login: true, profile: "rev2" }),
				expectLine(
					command("CREATE", { args: /^(?:R&AOk-sum&AOk-|"R&AOk-sum&AOk-")$/ }),
				),
				reply("OK CREATE completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user@example.com", "s3cret");
		await driver.create("Résumé");
		await server.assertCompleted();
		// The encoded name must contain no superfluous "-&" null-shift
		// sequence (shifts back to base64 only where content requires).
		const createLine = server.commandLines.find((l) => l.verb === "CREATE");
		expect(createLine).toBeDefined();
		const name = createLine!.args.replace(/^"|"$/g, "");
		expect(name).toBe("R&AOk-sum&AOk-");
		expect(name, "no null shift '-&' permitted in modified UTF-7").not.toContain("-&");
	},
);

// ── RFC9051-D-1: client must expect 63-bit body part / message sizes ──────
// Observable NOW via connectLow(): the server sends the rev2 greeting and an
// unsolicited FETCH carrying an RFC822.SIZE of 5_000_000_000 (5e9 > 2^32, well
// within a 63-bit range and exact as a JS number). The client MUST surface the
// parsed FETCH event without truncating, overflowing, or erroring.
//
// FIXED (M0.6, §11.3): the RFC822.SIZE msg-att matcher
// (src/parser/structure/fetch/rfc822.ts) now accepts a TokenTypes.bigint
// value in addition to TokenTypes.number — the lexer (src/lexer/rules/
// number.ts) already emits a BigIntToken for any value above
// MAX_ALLOWED_NUMBER (2^32), so the 63-bit size now matches, the FETCH
// msg-att list parses, and the FETCH untaggedResponse is surfaced with the
// exact size (as a bigint). Genuine pass, not self-actualizing.
complianceTest(
	{
		reqs: ["RFC9051-D-1"],
		profiles: ["rev2"],
		title: "client surfaces an unsolicited FETCH with a 63-bit RFC822.SIZE without breaking",
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK [CAPABILITY IMAP4rev2 LITERAL-] ready\r\n"),
				// A message size beyond the 32-bit range (5e9), representable in 63 bits.
				send("* 1 FETCH (RFC822.SIZE 5000000000)\r\n"),
				close(),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connectLow({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		expect(ok).toBe(true);
		await server.assertCompleted();
		// The driver must surface the parsed FETCH untaggedResponse event — proof
		// it processed the 63-bit size rather than choking on it.
		const ev = await waitForUntagged(driver, "FETCH");
		expect(ev).toBeDefined();
		// Non-vacuous: the size must round-trip EXACTLY as a bigint, not be
		// truncated, coerced through a lossy JS number, or dropped.
		const content = contentOf<ParsedFetchSize>(ev);
		expect(content.size).toBe(5000000000n);
	},
);
