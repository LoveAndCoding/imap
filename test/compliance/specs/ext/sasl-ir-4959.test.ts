/**
 * RFC 4959 — "IMAP Extension for Simple Authentication and Security Layer (SASL)
 * Initial Client Response" (SASL-IR). Client-binding duties for the optional
 * initial-response second argument on the AUTHENTICATE command.
 *
 * Testable catalog ids covered here (see test/compliance/catalog/ext/rfc4959.ts):
 *
 *   RFC4959-3-1  AUTHENTICATE accepts an optional initial-response second argument.
 *   RFC4959-3-2  Initial response MUST be base64 outside a quoted-string/literal;
 *                zero-length initial response is a single pad character "=".
 *   RFC4959-3-3  MUST NOT send an initial response unless the server advertised
 *                SASL-IR, and MUST fall back to the standard exchange otherwise.
 *
 * PROFILE: rev1 ONLY. In rev2 (RFC 9051 §6.2.2) the optional-second-argument
 * grammar and the base64/'=' encoding rule are folded into CORE AUTHENTICATE and
 * scored via RFC9051-6.2.2-3; scoring them under rev2 here too would double-count
 * that rev2-core obligation. The MUST-NOT-unless-advertised gate (RFC4959-3-3)
 * genuinely has NO rev2-core counterpart (rev2 core accepts the IR argument
 * unconditionally), so it is a rev1/SASL-IR-only duty. All three entries are
 * therefore profiles: ["rev1"] — matching their catalog `profiles`.
 *
 * ZERO-LENGTH INITIAL RESPONSE encoding: a present-but-empty initial response is
 * the single pad character "=" on the AUTHENTICATE line (RFC 4959 §3, §4's
 * EXTERNAL example: "A01 AUTHENTICATE EXTERNAL ="). base64("") is the empty
 * string, so "=" — not "" — signals "present, zero length".
 *
 * SELF-ACTUALIZATION: driver.authenticate("PLAIN") is implemented, so the
 * PLAIN-driven duties below (RFC4959-3-1/3-2's IR argument, RFC4959-3-3's
 * fall-back) drive the real AUTHENTICATE exchange; the scripted server
 * validates the AUTHENTICATE line's IR argument (present/absent, base64, "=")
 * against the advertised-capability gate, making the matchers genuine
 * assertions. The zero-length-IR duty below is scripted against EXTERNAL,
 * now implemented (src/sasl/external.ts), so it drives a genuine exchange too.
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { expectLine, reply, send } from "../../harness/script";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";
import { sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

// ── RFC4959-3-1 / RFC4959-3-2: IR second argument, base64-encoded ──────────
// With SASL-IR advertised, the client MAY append an initial response as a
// second argument to AUTHENTICATE (3-1); when it does, that argument MUST be
// base64 transmitted outside a quoted-string/literal (3-2). The matcher accepts
// the AUTHENTICATE line ONLY when the IR argument (if present) is bare base64 —
// never quoted or a literal announcement.
complianceTest(
	{
		reqs: ["RFC4959-3-1", "RFC4959-3-2"],
		profiles: ["rev1"],
		title: "SASL-IR: initial response is appended as a bare base64 second argument to AUTHENTICATE",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "AUTH=PLAIN", "SASL-IR"]),
				// IR argument, if present, is a bare base64 token: not quoted, not a
				// literal ({n}). "AUTHENTICATE PLAIN <base64>" is the SASL-IR form.
				expectLine(
					command("AUTHENTICATE", {
						args: /^PLAIN [A-Za-z0-9+/]+={0,2}$/,
					}),
				),
				reply("OK [CAPABILITY IMAP4rev1 AUTH=PLAIN SASL-IR] AUTHENTICATE completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		// Supplying an initial response drives the SASL-IR inline form.
		await driver.authenticate("PLAIN", "\x00user@example.com\x00s3cret");
		await server.assertCompleted();
		const authLine = server.commandLines.find((l) => l.verb === "AUTHENTICATE");
		expect(authLine).toBeDefined();
		// IR argument is bare base64, outside quotes/literal.
		expect(authLine!.args, "IR argument must not be a quoted string").not.toMatch(/"/);
		expect(authLine!.literals.length, "IR argument must not be a literal").toBe(0);
	},
);

// ── RFC4959-3-2: zero-length initial response encoded as a single "=" ──────
// To send a present-but-zero-length initial response, the client MUST send a
// single pad character "=" (base64("") is "", so the RFC uses "=" to signal
// "present but empty"). The matcher accepts ONLY "AUTHENTICATE <mech> =".
complianceTest(
	{
		reqs: ["RFC4959-3-2"],
		profiles: ["rev1"],
		title: "SASL-IR: a zero-length initial response is the single pad character '='",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "AUTH=EXTERNAL", "SASL-IR"]),
				// RFC 4959 §4: "A01 AUTHENTICATE EXTERNAL =" — the '=' zero-length form.
				expectLine(command("AUTHENTICATE", { args: /^EXTERNAL =$/i })),
				reply("OK [CAPABILITY IMAP4rev1 AUTH=EXTERNAL SASL-IR] AUTHENTICATE completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		// An empty-string initial response must be encoded as "=", not omitted and
		// not sent as an empty base64 token.
		await driver.authenticate("EXTERNAL", "");
		await server.assertCompleted();
		const authLine = server.commandLines.find((l) => l.verb === "AUTHENTICATE");
		expect(authLine).toBeDefined();
		expect(
			authLine!.args,
			"zero-length IR is the single pad character '=' after the mechanism name",
		).toBe("EXTERNAL =");
	},
);

// ── RFC4959-3-3: MUST NOT send an IR unless SASL-IR is advertised ──────────
// A client implementing SASL-IR MUST NOT send an initial response to a server
// that does NOT advertise SASL-IR; it MUST fall back to the standard
// challenge/response exchange. The CAPABILITY response here OMITS SASL-IR, so
// the AUTHENTICATE line MUST carry the mechanism name only (no IR argument),
// with the response arriving on a continuation line.
complianceTest(
	{
		reqs: ["RFC4959-3-3"],
		profiles: ["rev1"],
		title: "SASL-IR: no initial response when the server does not advertise SASL-IR (fall back)",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				// SASL-IR deliberately OMITTED from CAPABILITY.
				...sessionPrelude(["IMAP4rev1", "AUTH=PLAIN"]),
				// The AUTHENTICATE line MUST be the bare mechanism name — NO IR arg.
				expectLine(command("AUTHENTICATE", { args: /^PLAIN$/i })),
				// Standard-exchange fallback: server issues the empty challenge.
				send("+ \r\n"),
				expectLine({
					match: (line) => ({
						ok: /^[A-Za-z0-9+/=]+$/.test(line),
						reason: `expected base64 continuation response, got: '${line}'`,
					}),
					description: "base64 continuation response (fallback path)",
				}),
				reply("OK [CAPABILITY IMAP4rev1 AUTH=PLAIN] AUTHENTICATE completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		// Even though an IR is supplied, the client MUST withhold it (no SASL-IR
		// advertised) and fall back to the continuation exchange.
		await driver.authenticate("PLAIN", "\x00user@example.com\x00s3cret");
		await server.assertCompleted();
		const authLine = server.commandLines.find((l) => l.verb === "AUTHENTICATE");
		expect(authLine).toBeDefined();
		// No IR argument may appear when SASL-IR is unadvertised.
		expect(authLine!.args, "no initial response when SASL-IR is unadvertised").toMatch(/^PLAIN$/i);
	},
);
