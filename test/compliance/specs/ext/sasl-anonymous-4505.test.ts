/**
 * RFC 4505 — "Anonymous Simple Authentication and Security Layer (SASL)
 * Mechanism" (obsoletes RFC 2245). Client-binding single-message trace-
 * information encoding duties for AUTHENTICATE ANONYMOUS.
 *
 * Testable catalog ids covered here (see test/compliance/catalog/ext/rfc4505.ts):
 *
 *   RFC4505-2-1  ANONYMOUS exchange is a single client-to-server message.
 *   RFC4505-2-2  Trace information, if included, is UTF-8-encoded Unicode text.
 *   RFC4505-2-3  Trace information should be an email address or an opaque non-'@' token.
 *   RFC4505-2-5  Token trace information is capped at 255 UTF-8 characters.
 *   RFC4505-2-6  Token trace information may be as long as 1020 octets when encoded.
 *   RFC4505-3-1  Client prepares the <message> production per the trace stringprep profile.
 *   RFC4505-3-4  Trace-profile message excludes prohibited StringPrep character tables.
 *
 * Untestable ids NOT cited (see catalog module for rationales): RFC4505-2-4 /
 * RFC4505-5-1 (permission-before-sending-identifying-info — out-of-band user
 * consent), RFC4505-3-2 / RFC4505-3-3 (no-mapping / no-normalization —
 * internal-decision, absence-of-a-step unobservable black-box), RFC4505-3-5
 * (bidirectional character checking — internal-decision).
 *
 * BASE64 DERIVATION (Node: Buffer.from(str,'utf8').toString('base64')):
 *   email trace info    "fred@example.com"  =>  ZnJlZEBleGFtcGxlLmNvbQ==
 *   opaque-token form    "tim"               =>  dGlt
 *   no trace information (empty message)     =>  ""   (zero-length; AUTHENTICATE
 *     ANONYMOUS's initial-response argument is the RFC 9051 §6.2.2 "=" empty-
 *     literal convention, distinct from an absent argument)
 *
 * SELF-ACTUALIZATION: no AUTHENTICATE surface — driver.authenticate() throws
 * NotImplementedError, so every duty below fails 'unimplemented'. The scripted
 * server accepts the single ANONYMOUS message and the matcher decodes/
 * validates the trace-information bytes, so once an AUTHENTICATE surface
 * exists the same assertion becomes the genuine, non-vacuous check.
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { expectLine, reply, send } from "../../harness/script";
import { loadCertFixture } from "../../harness/tls";
import { NotImplementedError } from "../../driver/errors";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";
import { sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

const localhost = loadCertFixture("localhost");

// StringPrep-prohibited character-table samples (RFC4505-3-4): a C.2.1 ASCII
// control character (U+0001) and an unpaired surrogate (C.5, U+D800) — either
// must never appear verbatim in a client-emitted trace string.
const PROHIBITED_CONTROL_CHAR = "";

/**
 * Matcher validating an ANONYMOUS trace-information message: the whole
 * AUTHENTICATE exchange carries exactly one client-to-server payload
 * (RFC4505-2-1, enforced by the caller only sending one continuation), the
 * bytes decode as UTF-8 (RFC4505-2-2), the decoded string is either RFC 2822
 * addr-spec-shaped (contains '@') or an opaque non-'@' token (RFC4505-2-3),
 * the token form is <= 255 Unicode characters / <= 1020 octets (RFC4505-2-5/
 * -2-6), and it excludes StringPrep-prohibited characters (RFC4505-3-4/-3-1).
 */
function anonymousMessage(expected: { trace: string; kind: "email" | "token" | "empty" }) {
	return {
		description: `base64 ANONYMOUS trace message (${expected.kind}: '${expected.trace}')`,
		match: (line: string) => {
			// AUTHENTICATE ANONYMOUS with an empty initial response is conventionally
			// carried as "=" (RFC 9051 §6.2.2 zero-length-literal convention) on the
			// wire, or as a genuinely empty base64 continuation line; accept both.
			if (expected.kind === "empty") {
				if (line === "=" || line === "") return { ok: true };
				// A non-empty line for an intentionally-empty trace is a violation.
				if (!/^[A-Za-z0-9+/=]+$/.test(line)) {
					return { ok: false, reason: `expected base64 (or empty/'='), got: '${line}'` };
				}
				const decoded = Buffer.from(line, "base64").toString("utf8");
				return {
					ok: decoded.length === 0,
					reason: `expected empty trace information, decoded to: '${decoded}'`,
				};
			}
			if (!/^[A-Za-z0-9+/=]+$/.test(line)) {
				return { ok: false, reason: `expected base64, got: '${line}'` };
			}
			// RFC4505-2-2: bytes are UTF-8; decode round-trips without replacement.
			const raw = Buffer.from(line, "base64");
			const decoded = raw.toString("utf8");
			if (Buffer.from(decoded, "utf8").compare(raw) !== 0) {
				return { ok: false, reason: `trace information is not valid UTF-8: ${raw.toString("hex")}` };
			}
			if (decoded !== expected.trace) {
				return { ok: false, reason: `decoded trace '${decoded}' != expected '${expected.trace}'` };
			}
			// RFC4505-2-3: exactly one of email-shaped (contains '@') or opaque
			// non-'@' token.
			const hasAt = decoded.includes("@");
			if (expected.kind === "email" && !hasAt) {
				return { ok: false, reason: `expected email-shaped trace (contains '@'), got: '${decoded}'` };
			}
			if (expected.kind === "token" && hasAt) {
				return { ok: false, reason: `opaque token form MUST NOT contain '@', got: '${decoded}'` };
			}
			if (expected.kind === "token") {
				// RFC4505-2-5: token capped at 255 UTF-8-encoded Unicode characters.
				const charCount = Array.from(decoded).length;
				if (charCount > 255) {
					return { ok: false, reason: `token trace exceeds 255 Unicode characters: ${charCount}` };
				}
				// RFC4505-2-6: as an octet-length corollary, at most 1020 octets.
				if (raw.length > 1020) {
					return { ok: false, reason: `token trace exceeds 1020 octets: ${raw.length}` };
				}
			}
			// RFC4505-3-4 / RFC4505-3-1: no StringPrep-prohibited characters (ASCII
			// control chars C.2.1, unpaired surrogates C.5, etc.) in the prepared
			// message.
			// eslint-disable-next-line no-control-regex
			if (/[\x00-\x1f\x7f]/.test(decoded)) {
				return { ok: false, reason: `trace information contains a prohibited ASCII control character` };
			}
			if (/[\ud800-\udfff]/.test(decoded.replace(/[\ud800-\udbff][\udc00-\udfff]/g, ""))) {
				return { ok: false, reason: `trace information contains an unpaired surrogate` };
			}
			return { ok: true };
		},
	};
}

// ── RFC4505-2-1/-2-2/-2-3: single-message exchange, email-shaped trace ────
// The canonical ANONYMOUS exchange with an Internet-email-address-shaped
// trace value: exactly one client-to-server message (2-1), UTF-8 (2-2),
// containing '@' (2-3, email form). authenticate() throws today.
complianceTest(
	{
		reqs: ["RFC4505-2-1", "RFC4505-2-2", "RFC4505-2-3"],
		profiles: ["rev1", "rev2"],
		title: "AUTHENTICATE ANONYMOUS sends a single UTF-8 email-shaped trace-information message",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const trace = "fred@example.com";
		const server = await f.startServer({ tlsImplicit: localhost });
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "AUTH=ANONYMOUS"]),
				expectLine(command("AUTHENTICATE", { args: /^ANONYMOUS$/i })),
				send("+ \r\n"),
				// Expected base64: ZnJlZEBleGFtcGxlLmNvbQ==
				expectLine(anonymousMessage({ trace, kind: "email" })),
				reply("OK AUTHENTICATE completed"),
			],
		]);
		const driver = f.newDriver();
		await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "implicit",
			ca: localhost.cert,
			timeoutMs: 3000,
		});
		await driver.authenticate("ANONYMOUS"); // throws NotImplementedError today
		await server.assertCompleted();
		// When implemented: exactly one AUTHENTICATE ANONYMOUS continuation line
		// carries the trace payload — no second data message follows it.
		const authLine = server.commandLines.find((l) => l.verb === "AUTHENTICATE");
		expect(authLine).toBeDefined();
	},
);

// ── RFC4505-2-3/-2-5/-2-6: opaque non-'@' token form, within length caps ───
// The alternative permitted trace form: an opaque string containing no '@',
// interpretable by the client domain's administrator, capped at 255 Unicode
// characters (2-5) / 1020 octets (2-6). Uses RFC 4505 §4's own example value
// "tim". A wrong impl that emits a token containing '@' (violating 2-3) or
// exceeding either cap is rejected by the matcher above.
complianceTest(
	{
		reqs: ["RFC4505-2-3", "RFC4505-2-5", "RFC4505-2-6"],
		profiles: ["rev1", "rev2"],
		title: "AUTHENTICATE ANONYMOUS accepts an opaque non-'@' token trace form within the length caps",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const trace = "tim"; // RFC 4505 §4's own worked example value.
		const server = await f.startServer({ tlsImplicit: localhost });
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "AUTH=ANONYMOUS"]),
				expectLine(command("AUTHENTICATE", { args: /^ANONYMOUS$/i })),
				send("+ \r\n"),
				// Expected base64: dGlt
				expectLine(anonymousMessage({ trace, kind: "token" })),
				reply("OK AUTHENTICATE completed"),
			],
		]);
		const driver = f.newDriver();
		await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "implicit",
			ca: localhost.cert,
			timeoutMs: 3000,
		});
		await driver.authenticate("ANONYMOUS"); // throws NotImplementedError today
		await server.assertCompleted();
	},
);

// ── RFC4505-2-1: ANONYMOUS with no trace information at all (empty message) ─
// The mechanism permits sending no trace information whatsoever — the single
// client-to-server message is then empty. Still exactly one message (2-1); a
// wrong impl that sent a follow-up second data line would violate the
// single-message shape, caught by asserting no further AUTHENTICATE
// continuation line follows.
complianceTest(
	{
		reqs: ["RFC4505-2-1"],
		profiles: ["rev1", "rev2"],
		title: "AUTHENTICATE ANONYMOUS with no trace information is still exactly one client message",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer({ tlsImplicit: localhost });
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "AUTH=ANONYMOUS"]),
				expectLine(command("AUTHENTICATE", { args: /^ANONYMOUS$/i })),
				send("+ \r\n"),
				expectLine(anonymousMessage({ trace: "", kind: "empty" })),
				reply("OK AUTHENTICATE completed"),
			],
		]);
		const driver = f.newDriver();
		await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "implicit",
			ca: localhost.cert,
			timeoutMs: 3000,
		});
		await driver.authenticate("ANONYMOUS"); // throws NotImplementedError today
		await server.assertCompleted();
		// When implemented: exactly one continuation-response line for the whole
		// exchange — never a second AUTHENTICATE data line after it.
		const authLines = server.commandLines.filter((l) => l.verb === "AUTHENTICATE");
		expect(authLines.length).toBe(1);
	},
);

// ── RFC4505-3-1/-3-4: trace-profile preparation excludes prohibited chars ──
// When the caller supplies a trace value containing a StringPrep-prohibited
// character (here, a C.2.1 ASCII control character), the CLIENT's trace-
// profile preparation step (3-1) MUST exclude it (3-4) from the wire bytes —
// a compliant client either strips/rejects the character or refuses to send
// the value verbatim. The matcher rejects any impl that transmits the
// prohibited byte unchanged.
complianceTest(
	{
		reqs: ["RFC4505-3-1", "RFC4505-3-4"],
		profiles: ["rev1", "rev2"],
		title: "ANONYMOUS trace-profile preparation excludes StringPrep-prohibited characters from the wire bytes",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const rawTrace = `admin${PROHIBITED_CONTROL_CHAR}token`;
		const server = await f.startServer({ tlsImplicit: localhost });
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "AUTH=ANONYMOUS"]),
				expectLine(command("AUTHENTICATE", { args: /^ANONYMOUS$/i })),
				send("+ \r\n"),
				expectLine({
					description: "prepared trace message excludes the prohibited control character",
					match: (line: string) => {
						if (!/^[A-Za-z0-9+/=]*$/.test(line)) {
							return { ok: false, reason: `expected base64 (or empty), got: '${line}'` };
						}
						const decoded = line.length ? Buffer.from(line, "base64").toString("utf8") : "";
						if (decoded.includes(PROHIBITED_CONTROL_CHAR)) {
							return {
								ok: false,
								reason: `prohibited control character U+0001 present verbatim in prepared trace: '${decoded}'`,
							};
						}
						return { ok: true };
					},
				}),
				reply("OK AUTHENTICATE completed"),
			],
		]);
		const driver = f.newDriver();
		await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "implicit",
			ca: localhost.cert,
			timeoutMs: 3000,
		});
		// Supply a trace value carrying a prohibited character; the client's own
		// preparation step is the duty under test (a future implementation
		// decides how to construct the trace argument from caller input).
		await driver.authenticate("ANONYMOUS", rawTrace); // throws NotImplementedError today
		await server.assertCompleted();
	},
);
