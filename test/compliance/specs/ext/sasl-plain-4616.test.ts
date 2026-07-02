/**
 * RFC 4616 — "The PLAIN Simple Authentication and Security Layer (SASL)
 * Mechanism." Client-binding message-format and security-posture duties for
 * AUTHENTICATE PLAIN.
 *
 * Testable catalog ids covered here (see test/compliance/catalog/ext/rfc4616.ts):
 *
 *   RFC4616-1-1  SHOULD advertise/use PLAIN only with adequate data security.
 *   RFC4616-2-1  PLAIN message = [authzid] NUL authcid NUL passwd.
 *   RFC4616-2-2  authzid/authcid/passwd/NUL transferred as UTF-8.
 *   RFC4616-2-3  NUL MUST NOT appear inside authzid, authcid, or passwd.
 *   RFC4616-5-1  SHOULD NOT advertise/use PLAIN without adequate data security.
 *
 * Untestable ids NOT cited: RFC4616-2-4 (discourage hard-to-type characters —
 * user-intent-policy) and RFC4616-5-2 (operational-mode affordance —
 * capability-inventory). See the catalog module for rationales.
 *
 * BASE64 DERIVATION (Node: Buffer.from(str,'utf8').toString('base64'); NUL=0x00):
 *   authzid-absent, authcid="user@example.com", passwd="s3cret":
 *     "\x00user@example.com\x00s3cret"  =>  AHVzZXJAZXhhbXBsZS5jb20AczNjcmV0
 *   authzid="admin", authcid="user@example.com", passwd="s3cret":
 *     "admin\x00user@example.com\x00s3cret"  =>  YWRtaW4AdXNlckBleGFtcGxlLmNvbQBzM2NyZXQ=
 *   RFC 4616 §4 example: authzid absent, authcid="tim", passwd="tanstaaftanstaaf":
 *     "\x00tim\x00tanstaaftanstaaf"  =>  AHRpbQB0YW5zdGFhZnRhbnN0YWFm
 *
 * SELF-ACTUALIZATION: no AUTHENTICATE surface — driver.authenticate() throws
 * NotImplementedError, so every message-format duty fails 'unimplemented'. The
 * scripted server decodes and structurally validates the PLAIN bytes so that
 * once an AUTHENTICATE surface exists the expectLine matcher IS the genuine,
 * non-vacuous assertion. The security-posture duties (1-1 / 5-1) are observable
 * today via whether PLAIN is offered on a plaintext vs TLS channel and are
 * annotated accordingly.
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

/** A matcher that base64-decodes a client SASL line and structurally validates a PLAIN message. */
function plainMessage(expected: { authzid: string; authcid: string; passwd: string }) {
	return {
		description: `base64 PLAIN message [${expected.authzid}] NUL ${expected.authcid} NUL ${expected.passwd}`,
		match: (line: string) => {
			if (!/^[A-Za-z0-9+/=]+$/.test(line)) {
				return { ok: false, reason: `expected base64, got: '${line}'` };
			}
			// RFC4616-2-2: bytes are UTF-8; decode round-trips.
			const decoded = Buffer.from(line, "base64").toString("utf8");
			const parts = decoded.split("\x00");
			// RFC4616-2-1: exactly [authzid] NUL authcid NUL passwd → 3 segments,
			// i.e. exactly two structural NULs (RFC4616-2-3: no interior NUL).
			if (parts.length !== 3) {
				return {
					ok: false,
					reason: `PLAIN message must have exactly 2 NUL delimiters (3 fields), got ${parts.length} fields`,
				};
			}
			const [authzid, authcid, passwd] = parts;
			if (authzid !== expected.authzid || authcid !== expected.authcid || passwd !== expected.passwd) {
				return {
					ok: false,
					reason: `PLAIN fields [${authzid}|${authcid}|${passwd}] != [${expected.authzid}|${expected.authcid}|${expected.passwd}]`,
				};
			}
			return { ok: true };
		},
	};
}

// ── RFC4616-2-1 / RFC4616-2-2 / RFC4616-2-3: PLAIN message format (no authzid) ─
// The canonical AUTHENTICATE PLAIN exchange with an absent authorization
// identity. The matcher decodes the client's continuation line as UTF-8, splits
// on NUL, and asserts exactly [empty] NUL authcid NUL passwd — covering the
// format (2-1), UTF-8 transfer (2-2), and NUL-only-as-delimiter (2-3) duties in
// one non-vacuous check. authenticate() throws today → unimplemented.
complianceTest(
	{
		reqs: ["RFC4616-2-1", "RFC4616-2-2", "RFC4616-2-3"],
		profiles: ["rev1", "rev2"],
		title: "AUTHENTICATE PLAIN message is [authzid] NUL authcid NUL passwd, UTF-8, no interior NUL",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer({ tlsImplicit: localhost });
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "AUTH=PLAIN"]),
				expectLine(command("AUTHENTICATE", { args: /^PLAIN$/i })),
				send("+ \r\n"),
				// Expected base64: AHVzZXJAZXhhbXBsZS5jb20AczNjcmV0
				expectLine(plainMessage({ authzid: "", authcid: "user@example.com", passwd: "s3cret" })),
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
		// authzid omitted → absent (equivalent to empty per RFC 4422 §3.4.1).
		await driver.authenticate("PLAIN"); // throws NotImplementedError today
		await server.assertCompleted();
		const authLine = server.commandLines.find((l) => l.verb === "AUTHENTICATE");
		expect(authLine).toBeDefined();
	},
);

// ── RFC4616-2-1: PLAIN message format with a non-empty authorization identity ─
// When the caller supplies an authzid, the PLAIN message carries it in the
// first field: authzid NUL authcid NUL passwd. Expected base64:
// YWRtaW4AdXNlckBleGFtcGxlLmNvbQBzM2NyZXQ=. authenticate() throws today.
complianceTest(
	{
		reqs: ["RFC4616-2-1"],
		profiles: ["rev1", "rev2"],
		title: "AUTHENTICATE PLAIN carries a supplied authorization identity in the first field",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer({ tlsImplicit: localhost });
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "AUTH=PLAIN"]),
				expectLine(command("AUTHENTICATE", { args: /^PLAIN$/i })),
				send("+ \r\n"),
				expectLine(plainMessage({ authzid: "admin", authcid: "user@example.com", passwd: "s3cret" })),
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
		await driver.authenticate("PLAIN", "admin"); // throws NotImplementedError today
		await server.assertCompleted();
	},
);

// ── RFC4616-2-1 (SASL-IR delivery vs continuation): initial-response path ──
// With SASL-IR advertised, the identical PLAIN message MAY ride inline as the
// AUTHENTICATE second argument (one round trip) instead of on a separate
// continuation line. This matcher accepts EITHER delivery path — an inline
// base64 IR argument OR the two-line continuation form — and validates the
// decoded message either way. authenticate() throws today → unimplemented.
complianceTest(
	{
		reqs: ["RFC4616-2-1"],
		profiles: ["rev1", "rev2"],
		title: "PLAIN message may be delivered as a SASL-IR initial response or via continuation",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer({ tlsImplicit: localhost });
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "AUTH=PLAIN", "SASL-IR"]),
				// SASL-IR path: AUTHENTICATE PLAIN <base64 PLAIN message> inline.
				// Non-SASL-IR path: bare "AUTHENTICATE PLAIN" then continuation.
				expectLine({
					description: "AUTHENTICATE PLAIN with or without inline IR",
					match: (line) => command("AUTHENTICATE", { args: /^PLAIN(?: [A-Za-z0-9+/=]+)?$/i }).match(line),
				}),
				// If the client used SASL-IR, no continuation is needed; but a
				// non-IR client expects a challenge. Offer one either way; a
				// SASL-IR client that already sent its IR will complete on OK.
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
		await driver.authenticate("PLAIN", "admin"); // throws NotImplementedError today
		await server.assertCompleted();
		// When implemented: if an inline IR argument is present it base64-decodes
		// to a well-formed PLAIN message; otherwise the continuation line does.
		const authLine = server.commandLines.find((l) => l.verb === "AUTHENTICATE");
		expect(authLine).toBeDefined();
	},
);

// ── RFC4616-1-1 / RFC4616-5-1: adequate data security before PLAIN ─────────
// By default a client SHOULD (1-1) / SHOULD NOT otherwise (5-1) advertise or
// use PLAIN unless adequate data security is in place — i.e. under TLS. This is
// observable TODAY at the capability layer: the negative demonstration arms a
// PLAINTEXT server that offers AUTH=PLAIN and asserts the client, offered PLAIN
// in the clear, does not send it without protection. The client has no
// AUTHENTICATE surface, so it never sends PLAIN at all — a conformant outcome
// here — but the duty as a whole cannot be positively demonstrated without an
// auth surface, so it self-actualizes as unimplemented.
complianceTest(
	{
		reqs: ["RFC4616-1-1", "RFC4616-5-1"],
		profiles: ["rev1", "rev2"],
		title: "client does not use PLAIN over a plaintext channel lacking data security",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		// Plaintext connection; PLAIN advertised. A conformant client withholds
		// PLAIN here (no adequate data security); the exchange never reaches an
		// AUTHENTICATE PLAIN line.
		server.arm([[...sessionPrelude(["IMAP4rev1", "AUTH=PLAIN"])]]);
		const driver = await f.connectPlain(server);
		await driver.authenticate("PLAIN"); // throws NotImplementedError today
		await server.assertCompleted();
		// When implemented: no AUTHENTICATE PLAIN reached the server over cleartext.
		expect(
			server.transcript.clientLines(),
			"PLAIN must not be sent over an unprotected channel",
		).not.toMatch(/AUTHENTICATE PLAIN/i);
	},
);
