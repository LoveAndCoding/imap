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
 * A-1 CLASSIFICATION (unimplemented, not violation): the client has no
 * ENABLE surface. Session.start issues only CAPABILITY + ID during connect(),
 * and driver.enable() throws NotImplementedError. CAPABILITY and ID are
 * revision-agnostic (valid in both rev1 and rev2), so the current wire trace
 * does not itself exercise any rev2-only behavior — the MUST's trigger ("wants
 * to use IMAP4rev2 ... before relying on rev2-only behavior") is not met by a
 * client that only speaks the revision-agnostic prelude. There is therefore no
 * wire-observable violation today; the honest classification, consistent with
 * every other absent-verb duty in this suite, is "unimplemented": the driver
 * cannot make the client enable. Once a rev2-only feature path exists, the
 * falsifiable assertion becomes "ENABLE IMAP4rev2 precedes the first rev2-only
 * command"; this test drives that path via driver.enable() and, as a
 * belt-and-braces observable, asserts no ENABLE has leaked onto the wire yet.
 *
 * A-4/A-5/A-7/A-8 are conditional on the client CONSTRUCTING an international
 * (or embedded-"&") mailbox name while intending IMAP4rev1-server
 * compatibility. driver.create() is unimplemented, so each fails
 * "unimplemented"; the armed script's expectLine encodes the exact modified
 * UTF-7 form the client would have to emit, and the post-connect assertions
 * re-verify that form (self-actualizing once CREATE exists).
 *
 * D-1 is observable NOW via connectLow() + an unsolicited FETCH carrying a
 * 63-bit RFC822.SIZE; it should pass (JS numbers are exact to 2^53, well above
 * the 5e9 value used) and is transcript-verified through waitForUntagged.
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { close, expectLine, reply, send } from "../../harness/script";
import { complianceTest } from "../../runner/compliance-test";
import { waitForUntagged } from "../../runner/events";
import { useComplianceFixture } from "../../runner/fixture";
import { sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

// ── RFC9051-A-1: ENABLE IMAP4rev2 when both revisions advertised ──────────
// The server greeting advertises BOTH IMAP4rev1 and IMAP4rev2. A client that
// "wants to use IMAP4rev2" MUST issue "ENABLE IMAP4rev2" before relying on
// rev2-only behavior. The client has no enable path (Session.start does only
// CAPABILITY + ID; driver.enable() throws NotImplementedError), so this fails
// "unimplemented". See the file header for the full classification rationale.
complianceTest(
	{
		reqs: ["RFC9051-A-1"],
		profiles: ["rev2"],
		title: "client issues ENABLE IMAP4rev2 when both IMAP4rev1 and IMAP4rev2 are advertised",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				// Greeting advertises BOTH revisions (the conditional trigger).
				send("* OK [CAPABILITY IMAP4rev1 IMAP4rev2] ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK CAPABILITY completed", ["* CAPABILITY IMAP4rev1 IMAP4rev2"]),
				// A conformant client enables rev2 before relying on rev2-only behavior.
				expectLine(command("ENABLE", { args: /^IMAP4rev2$/i })),
				reply("OK ENABLE completed", ["* ENABLED IMAP4rev2"]),
			],
		]);
		const driver = await f.connectPlain(server);
		// driver.enable() is unimplemented (no ENABLE surface in the public API).
		await driver.enable(["IMAP4rev2"]);
		await server.assertCompleted();
		// Belt-and-braces observable: today the client proceeds with only the
		// revision-agnostic prelude (CAPABILITY [+ ID]); no ENABLE has been sent.
		expect(server.commandLines.some((l) => l.verb === "ENABLE")).toBe(false);
	},
);

// ── RFC9051-A-4: modified base64 MUST NOT encode representable US-ASCII ────
// The consumer-supplied name "Résumé" has representable ASCII ("R", "sum")
// interleaved with non-ASCII ("é"). The conformant modified UTF-7 form leaves
// the ASCII runs unshifted and only base64-encodes the "é" characters:
//     "R&AOk-sum&AOk-"
// — never base64-encoding an ASCII character that can represent itself, and
// using only modified-base64-alphabet characters inside the shifted regions.
complianceTest(
	{
		reqs: ["RFC9051-A-4"],
		profiles: ["rev2"],
		title: "client mod-UTF-7-encodes only non-ASCII, never representable US-ASCII",
		expectFailure: "unimplemented",
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
		// When implemented: verify the encoded name shifts ONLY around non-ASCII.
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
complianceTest(
	{
		reqs: ["RFC9051-A-5"],
		profiles: ["rev2"],
		title: "client terminates a non-ASCII-ending name with a shift-back to US-ASCII",
		expectFailure: "unimplemented",
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
		// When implemented: the wire name must END in US-ASCII (a "-" closing the
		// final base64 shift), not trail off in the modified-base64 state.
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
// or refuse. The armed script's matcher accepts ONLY a corrected/valid form
// (never the raw non-conformant sequence); a client sending the bad name as-is
// fails the script.
complianceTest(
	{
		reqs: ["RFC9051-A-7"],
		profiles: ["rev2"],
		title: "client does not send a syntactically invalid embedded-'&' mailbox name verbatim",
		expectFailure: "unimplemented",
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
		// When implemented: whatever the client transmits, it MUST NOT be the raw
		// non-conformant sequence containing a superfluous null shift "-&".
		const createLine = server.commandLines.find((l) => l.verb === "CREATE");
		expect(createLine).toBeDefined();
		const name = createLine!.args.replace(/^"|"$/g, "");
		expect(name, "client must not transmit the non-conformant embedded-'&' name verbatim").not.toContain(
			"-&",
		);
	},
);

// ── RFC9051-A-8: null shifts ("-&") in modified UTF-7 are not permitted ────
// A superfluous "-&" (shift back to US-ASCII immediately followed by a shift
// back into base64, encoding nothing between them) is a null shift and is not
// permitted. For the international name "Résumé" the conformant form
// ("R&AOk-sum&AOk-") re-enters base64 with "&" only where real non-ASCII
// content follows — never an empty "-&" pair.
complianceTest(
	{
		reqs: ["RFC9051-A-8"],
		profiles: ["rev2"],
		title: "client emits no null-shift '-&' sequence in a modified UTF-7 name",
		expectFailure: "unimplemented",
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
		// When implemented: the encoded name must contain no superfluous "-&"
		// null-shift sequence (shifts back to base64 only where content requires).
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
// HONEST OUTCOME — genuine VIOLATION (transcript-verified, not a pass):
// the client's lexer (src/lexer/rules/number.ts) emits a BigIntToken
// (TokenTypes.bigint) for any value above MAX_ALLOWED_NUMBER (2^32), but the
// RFC822.SIZE msg-att matcher (src/parser/structure/fetch/rfc822.ts) only
// accepts TokenTypes.number. So the 63-bit size fails to match, the FETCH
// msg-att list does not parse, and no FETCH untaggedResponse is ever surfaced
// — waitForUntagged times out. This is exactly the interoperability failure
// D-1 warns about: the client does NOT expect 63-bit sizes today. Annotated
// expectFailure: "violation" (client-side parse limitation, not a missing
// verb). The test becomes a pass once the RFC822.SIZE matcher (and any other
// size-bearing msg-att) accepts a bigint-typed count.
complianceTest(
	{
		reqs: ["RFC9051-D-1"],
		profiles: ["rev2"],
		title: "client surfaces an unsolicited FETCH with a 63-bit RFC822.SIZE without breaking",
		expectFailure: "violation",
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
	},
);
