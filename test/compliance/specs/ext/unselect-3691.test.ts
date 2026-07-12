/**
 * RFC 3691 — "Internet Message Access Protocol (IMAP) UNSELECT command."
 * Client-binding duties for the UNSELECT command that closes the selected
 * mailbox WITHOUT expunging it (the deselect-without-expunge alternative to
 * CLOSE). Catalog: test/compliance/catalog/ext/rfc3691.ts (added by M2.12).
 *
 * Testable catalog ids covered here (all four entries — none is untestable):
 *
 *   RFC3691-1-1  Issue UNSELECT only when the server advertised the UNSELECT
 *                capability. profiles ["rev1"] (under rev2 UNSELECT is a BASE
 *                command with no capability gate — the RFC4959-3-3 pattern of
 *                an extension-gating duty that does not exist under rev2).
 *                *** REAL SIGNAL *** for the prohibition half: the transcript
 *                guard observes today that no UNSELECT reaches the wire when
 *                unadvertised.
 *   RFC3691-2-1  UNSELECT takes no arguments and is issued only while a
 *                mailbox is selected. profiles ["rev1","rev2"] (the rfc9051
 *                catalog's §6.4.2 entry carries only the semantics, not this
 *                arguments/valid-state duty — no rev2 entry to double-score
 *                against). SELF-ACTUALIZING: driver.select()/driver.unselect()
 *                throw NotImplementedError.
 *   RFC3691-2-2  UNSELECT deselects like CLOSE but no messages are permanently
 *                removed. profiles ["rev1"] (rev2 scores the identical duty via
 *                RFC9051-6.4.2-1 — the ENABLE/RFC 5161 absorbed-into-rev2-core
 *                precedent). SELF-ACTUALIZING: no UNSELECT surface.
 *   RFC3691-4-1  Case-insensitive acceptance of the UNSELECT strings. profiles
 *                ["rev1","rev2"]. *** REAL SIGNAL *** — a lowercase 'unselect'
 *                capability atom must be recognized as the UNSELECT capability
 *                (Session capability set is queried case-insensitively).
 *
 * SELF-ACTUALIZATION: the client has no UNSELECT (or SELECT) surface —
 * driver.unselect() and driver.select() both throw NotImplementedError. The
 * command-driving tests are annotated expectFailure: "unimplemented"; M2.13
 * lands the verbs and deletes the annotations, at which point the scripted
 * exchanges and post-throw assertions become the genuine wire checks. The
 * matchers reject a plausible wrong impl (UNSELECT with an argument, UNSELECT
 * without the capability advertised, CLOSE emitted where UNSELECT was asked
 * for, or an EXPUNGE fabricated on deselection) — never a vacuous pass.
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { capabilityExchange, selectExchange, sessionPrelude } from "../../runner/state";
import { close, expectLine, reply, send } from "../../harness/script";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";

const f = useComplianceFixture();

// The UNSELECT command carries NO arguments (RFC 3691 §2 "Arguments: none";
// §4 ABNF: `command-select /= "UNSELECT"`).
const unselectLine = command("UNSELECT", { args: null });

// ═════════════════════════════════════════════════════════════════════════════
// RFC3691-2-1 — bare UNSELECT, only from selected state (SELF-ACTUALIZING)
// ═════════════════════════════════════════════════════════════════════════════
// §2 Result: "BAD - no mailbox selected, or argument supplied but none
// permitted" — by elimination the client issues UNSELECT (a) as the bare atom
// with no argument and (b) only while a mailbox is selected. Here the
// capability IS advertised and a mailbox IS selected; the matcher accepts ONLY
// a bare UNSELECT line (the §2 example form: 'C: A341 UNSELECT'). The rev2 arm
// also advertises the UNSELECT token (rev2 base absorbs the command, and rev2
// servers commonly still advertise the token for rev1 compatibility) so the
// exchange is valid under either availability model. select()/unselect() throw
// today → unimplemented.
complianceTest(
	{
		reqs: ["RFC3691-2-1"],
		profiles: ["rev1", "rev2"],
		title: "client issues a bare argument-less UNSELECT only from selected state",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const caps =
			ctx.profile === "rev2"
				? ["IMAP4rev2", "LITERAL-", "UNSELECT"]
				: ["IMAP4rev1", "UNSELECT"];
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(caps, { profile: ctx.profile, login: true }),
				...selectExchange("INBOX", { profile: ctx.profile, exists: 5 }),
				expectLine(unselectLine),
				reply("OK Unselect completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX"); // throws NotImplementedError today
		await driver.unselect(); // throws NotImplementedError today
		await server.assertCompleted();
		// When implemented: the command is the bare atom UNSELECT with no args,
		// emitted only after SELECT completed (the script's ordering enforces the
		// selected-state half — an UNSELECT before the SELECT exchange would be an
		// unscripted-command failure).
		const line = server.commandLines.find((l) => l.verb === "UNSELECT");
		expect(line).toBeDefined();
		expect(line!.args, "UNSELECT takes no arguments (RFC 3691 §2)").toBe("");
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC3691-1-1 (negative gate) — no UNSELECT when unadvertised (rev1-only)
// ═════════════════════════════════════════════════════════════════════════════
// §1: "A server which supports this extension indicates this with a capability
// name of 'UNSELECT'." — derived gate: a rev1 client must not issue UNSELECT
// to a server whose CAPABILITY omitted it. PROHIBITION test — no UNSELECT
// expectation is scripted; any UNSELECT on the wire is an unscripted-command
// failure, and a transcript guard catches it independently. The unselect()
// call must reject with zero bytes written: today NotImplementedError (no
// surface at all); after M2.13 a CapabilityError (the I-9 zero-bytes gate) —
// the error class is deliberately not pinned so this prohibition keeps
// measuring the same duty across that transition.
complianceTest(
	{
		reqs: ["RFC3691-1-1"],
		profiles: ["rev1"],
		title: "client does not issue UNSELECT when the server has not advertised it",
		timeout: 5000,
	},
	async () => {
		// CAPABILITY deliberately OMITS UNSELECT.
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1"], { login: true }),
				// No UNSELECT expectation — issuing it here is a violation.
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		let err: unknown;
		try {
			await driver.unselect();
		} catch (e) {
			err = e;
		}
		expect(
			err,
			"unselect() must reject with zero bytes written when UNSELECT is unadvertised",
		).toBeDefined();
		await server.assertCompleted();
		// Transcript guard: UNSELECT never appears when unadvertised.
		expect(
			server.transcript.clientLines(),
			"no UNSELECT when the capability is unadvertised (RFC 3691 §1)",
		).not.toMatch(/\bUNSELECT\b/);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC3691-2-2 — deselect without expunge, via UNSELECT not CLOSE (rev1-only)
// ═════════════════════════════════════════════════════════════════════════════
// §2: UNSELECT "performs the same actions as CLOSE, except that no messages
// are permanently removed from the currently selected mailbox", and the tagged
// OK returns the session to authenticated state. Client-facing halves: the
// deselect-while-preserving-\Deleted path emits UNSELECT (not CLOSE — a CLOSE
// here would silently expunge and is rejected as an unscripted command), and
// the tagged OK alone — with NO untagged EXPUNGE ("Responses: no specific
// responses for this command") — is the only deselection signal the client may
// expect. rev2 scores this duty via RFC9051-6.4.2-1. select()/unselect() throw
// today → unimplemented.
complianceTest(
	{
		reqs: ["RFC3691-2-2"],
		profiles: ["rev1"],
		title: "UNSELECT deselects with no expunge: tagged OK only, CLOSE never emitted",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "UNSELECT"], { login: true }),
				// A mailbox with messages (some plausibly \Deleted) is selected.
				...selectExchange("INBOX", { exists: 3 }),
				expectLine(unselectLine),
				// Tagged OK ONLY — no untagged EXPUNGE accompanies deselection.
				reply("OK Unselect completed, now in authenticated state"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX"); // throws NotImplementedError today
		await driver.unselect(); // throws NotImplementedError today
		await server.assertCompleted();
		// When implemented: the deselect path used UNSELECT (never CLOSE, which
		// would permanently remove \Deleted messages), and no EXPUNGE appeared
		// anywhere in the exchange — the tagged OK was the only signal.
		expect(
			server.transcript.clientLines(),
			"the preserve-\\Deleted deselect path must use UNSELECT, never CLOSE",
		).not.toMatch(/\bCLOSE\b/);
		expect(
			server.transcript.format(),
			"no EXPUNGE accompanies an UNSELECT deselection (RFC 3691 §2)",
		).not.toMatch(/\bEXPUNGE\b/);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC3691-4-1 — case-insensitive acceptance of the UNSELECT strings (REAL SIGNAL)
// ═════════════════════════════════════════════════════════════════════════════
// §4: "Implementations MUST accept these strings in a case-insensitive
// fashion." On the client side this binds acceptance of a server-advertised
// UNSELECT capability atom in any case. The Session capability set is
// populated from the CAPABILITY response and queried case-insensitively;
// advertising 'unselect' (lowercase) must still be recognized as the UNSELECT
// capability. REAL pass/violation via the session-path hasCapability() surface
// — a case-sensitive capability match would fail to recognize the token.
complianceTest(
	{
		reqs: ["RFC3691-4-1"],
		profiles: ["rev1", "rev2"],
		title: "client recognizes an UNSELECT capability advertised in non-canonical (lowercase) case",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		const baseCap = ctx.profile === "rev2" ? "IMAP4rev2" : "IMAP4rev1";
		server.arm([
			[
				// Bare greeting (no inline CAPABILITY code): for rev2 in particular,
				// an inline greeting capability would let `connect()` skip the round
				// trip below, so the client would never learn the lowercase
				// 'unselect' atom this test exists to check.
				send("* OK ready\r\n"),
				// Advertise the UNSELECT capability atom in lowercase.
				...capabilityExchange([baseCap, "unselect"]),
				close(),
			],
		]);
		const driver = f.newDriver();
		await driver.connect({ host: "127.0.0.1", port: server.port, security: "none" });
		await server.assertCompleted();
		// Case-insensitive acceptance: the lowercase 'unselect' atom must be
		// recognized as the UNSELECT capability. A case-sensitive match would
		// report false here.
		expect(
			driver.hasCapability("UNSELECT"),
			"a lowercase 'unselect' capability atom must be accepted case-insensitively (RFC 3691 §4)",
		).toBe(true);
	},
);
