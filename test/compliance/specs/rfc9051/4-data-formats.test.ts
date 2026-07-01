/**
 * RFC 9051 §4 — Data Formats (rev2 profile)
 *
 * RFC9051-4.1-1:     Atom: ≥1 non-special character.
 * RFC9051-4.1.1-1:   Sequence set never contains UIDs; UID set never
 *                    contains the "*" wildcard (new subsection in rev2).
 * RFC9051-4.2-1:     Number: ≥1 digit character.
 * RFC9051-4.3-1:     Client waits for continuation before sending
 *                    synchronizing-literal octet data.
 * RFC9051-4.3-2:     Non-synchronizing literal MUST NOT exceed 4096 octets
 *                    (LITERAL- baseline, new in rev2).
 * RFC9051-4.3-3:     Literal >4096 bytes MUST be sent as synchronizing.
 * RFC9051-4.3-4:     Quoted string: UTF-8-encoded Unicode, no CR/LF
 *                    (materially changed from rev1's 7-bit rule).
 * RFC9051-4.3-5:     Zero-octet synchronizing literal still waits.
 * RFC9051-4.3.1-1:   MAY transmit 8-bit in literals, SHOULD only with
 *                    CHARSET identified.
 * RFC9051-4.3.1-2:   MUST accept (MAY transmit) UTF-8 text in
 *                    quoted-strings free of NUL/CR/LF (new in rev2).
 * RFC9051-4.3.1-3:   Binary data MUST be encoded before transmitting.
 * RFC9051-4.3.1-4:   Unencoded binary strings are not permitted (client
 *                    send side; the literal8 carve-out is a server-side
 *                    FETCH-response exception).
 * RFC9051-4.3.1-5:   Excessive-CTL strings MAY be treated as binary.
 *
 * No untestable entries in §4 (catalog: "Total entries: 13. Untestable: 0.").
 *
 * rev2 adaptations vs. the rev1 §4 exemplar:
 * - The rev2 baseline advertises LITERAL-, so a client may legally use the
 *   non-synchronizing {n+} form for literals ≤4096 octets. The synchronizing
 *   wait duties (4.3-1/4.3-5) therefore condition on the form actually used,
 *   and the send-wait obligation is made non-vacuous by driving an APPEND
 *   payload >4096 octets, where the synchronizing form is mandatory (4.3-3).
 * - Quoted-string assertions check UTF-8 validity, not 7-bit-ness.
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { expectLine, reply } from "../../harness/script";
import { defineAcceptanceTable } from "../../runner/acceptance-table";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";
import { greet, selectExchange, sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

/** Decode latin1-recorded wire text back to raw bytes. */
function wireBytes(recorded: string): Buffer {
	return Buffer.from(recorded, "latin1");
}

/** True when the raw bytes form valid UTF-8. */
function isValidUtf8(bytes: Buffer): boolean {
	try {
		new TextDecoder("utf-8", { fatal: true }).decode(bytes);
		return true;
	} catch {
		return false;
	}
}

// ── RFC9051-4.1-1: atom = ≥1 non-special characters ───────────────────────
// Command names and tags are atoms; a normal rev2 connect exercises them.
complianceTest(
	{
		reqs: ["RFC9051-4.1-1"],
		profiles: ["rev2"],
		title: "command names and tag are valid atoms (non-empty, non-special characters)",
	},
	async () => {
		const server = await f.startServer();
		server.arm([[...sessionPrelude(undefined, { profile: "rev2" })]]);
		const driver = f.newDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		expect(ok).toBe(true);
		await server.assertCompleted();
		expect(server.commandLines.length).toBeGreaterThanOrEqual(1);
		// Atom: ≥1 char, none of the special characters ( ) { SP CTL % * " \ ]
		// (']' is re-allowed for tags via resp-specials; the command() matcher
		// already validated the tag — we re-check tag and verb here explicitly).
		for (const { tag, verb } of server.commandLines) {
			expect(tag.length).toBeGreaterThan(0);
			expect(verb.length).toBeGreaterThan(0);
			// eslint-disable-next-line no-control-regex
			expect(verb).toMatch(/^[^(){ %*"\\\]\x00-\x1f\x7f]+$/);
		}
	},
);

// ── RFC9051-4.1.1-1: sequence-set formation ───────────────────────────────
// A client-composed sequence set may contain only nz-numbers, "*", ":" and
// "," (RFC 9051 §9 sequence-set ABNF) — never UID-set-only constructs. The
// FETCH sequence-set argument is the observable surface.
complianceTest(
	{
		reqs: ["RFC9051-4.1.1-1"],
		profiles: ["rev2"],
		title: "FETCH sequence-set argument is well-formed sequence-set syntax",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { login: true, profile: "rev2" }),
				...selectExchange("INBOX", { profile: "rev2", exists: 3 }),
				expectLine(command("FETCH")),
				reply("OK FETCH completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user@example.com", "s3cret");
		await driver.select("INBOX");
		await driver.fetch("1:3", ["FLAGS"]);
		await server.assertCompleted();
		// When implemented: the first FETCH argument token must be a valid
		// sequence set (digits, "*", ":" and "," only; non-empty).
		const fetchLine = server.commandLines.find((l) => l.verb === "FETCH");
		expect(fetchLine).toBeDefined();
		const seqSet = fetchLine!.args.split(" ")[0];
		expect(seqSet).toMatch(/^[0-9*:,]+$/);
	},
);

// ── RFC9051-4.1.1-1: UID-set formation (no "*" wildcard) ──────────────────
// "A 'UID set' ... is not permitted to contain the special symbol '*'."
// UID FETCH is the observable surface; the consumer supplies plain UIDs and
// the emitted UID set must never contain "*".
complianceTest(
	{
		reqs: ["RFC9051-4.1.1-1"],
		profiles: ["rev2"],
		title: "UID FETCH set argument never contains the '*' wildcard",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { login: true, profile: "rev2" }),
				...selectExchange("INBOX", { profile: "rev2", exists: 5 }),
				expectLine(command("UID FETCH")),
				reply("OK UID FETCH completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user@example.com", "s3cret");
		await driver.select("INBOX");
		await driver.uidFetch("1:5", ["FLAGS"]);
		await server.assertCompleted();
		// When implemented: the UID set must consist of digits/":"/"," only —
		// in particular it must never contain "*".
		const uidLine = server.commandLines.find((l) => l.verb === "UID FETCH");
		expect(uidLine).toBeDefined();
		const uidSet = uidLine!.args.split(" ")[0];
		expect(uidSet).not.toContain("*");
		expect(uidSet).toMatch(/^[0-9:,]+$/);
	},
);

// ── RFC9051-4.2-1: number = ≥1 digit characters ───────────────────────────
// The literal octet-count announcement {N} in APPEND is a number the client
// composes; it must be digits only.
complianceTest(
	{
		reqs: ["RFC9051-4.2-1"],
		profiles: ["rev2"],
		title: "numeric arguments in commands use digit-only tokens",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { login: true, profile: "rev2" }),
				// APPEND carries a literal size number {N} (or {N+})
				expectLine(command("APPEND")),
				reply("OK APPEND completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user@example.com", "s3cret");
		await driver.append("INBOX", Buffer.from("Subject: t\r\n\r\n"));
		await server.assertCompleted();
		// When implemented: every literal announcement's octet count is digits.
		const appendLine = server.commandLines.find((l) => l.verb === "APPEND");
		expect(appendLine).toBeDefined();
		const markers = [...appendLine!.args.matchAll(/\{([^}]*?)\+?\}/g)];
		expect(markers.length).toBeGreaterThanOrEqual(1);
		for (const m of markers) {
			expect(/^\d+$/.test(m[1]), `literal count '${m[1]}' must be digits only`).toBe(true);
		}
	},
);

// ── RFC9051-4.3-1: wait for continuation before sync-literal payload ──────
// With LITERAL- in the rev2 baseline, small literals may legally use the
// non-waiting {n+} form; a >4096-octet payload forces the synchronizing form
// (RFC9051-4.3-3), making the send-wait duty non-vacuous. The harness sends
// the continuation automatically for {n} announcements, so a completed
// script with a synchronizing marker is the wait's positive-path witness.
complianceTest(
	{
		reqs: ["RFC9051-4.3-1"],
		profiles: ["rev2"],
		title: "client waits for continuation before sending >4096-octet literal data",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { login: true, profile: "rev2" }),
				expectLine(command("APPEND")),
				reply("OK APPEND completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user@example.com", "s3cret");
		const bigBody = Buffer.from(`Subject: big\r\n\r\n${"x".repeat(5000)}\r\n`);
		await driver.append("INBOX", bigBody);
		await server.assertCompleted();
		// When implemented: every literal >4096 octets must be synchronizing
		// (nonSync[i] === false means the client used {n} and the harness's
		// continuation gated the payload).
		const appendLine = server.commandLines.find((l) => l.verb === "APPEND");
		expect(appendLine).toBeDefined();
		expect(appendLine!.literals.length).toBeGreaterThanOrEqual(1);
		for (let i = 0; i < appendLine!.literals.length; i++) {
			if (appendLine!.literals[i].length > 4096) {
				expect(
					appendLine!.nonSync[i],
					`literal #${i} (${appendLine!.literals[i].length} octets) must use the synchronizing form`,
				).toBe(false);
			}
		}
	},
);

// ── RFC9051-4.3-2 + RFC9051-4.3-3: LITERAL- 4096-octet cap ────────────────
// "non-synchronizing literals MUST NOT be larger than 4096 octets" and "Any
// literal larger than 4096 bytes MUST be sent as a synchronizing literal."
// Observable via the literal markers the client emits: no {n+} with n>4096;
// any n>4096 announcement uses the plain {n} synchronizing form.
complianceTest(
	{
		reqs: ["RFC9051-4.3-2", "RFC9051-4.3-3"],
		profiles: ["rev2"],
		title: "client never sends a non-synchronizing literal larger than 4096 octets",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { login: true, profile: "rev2" }),
				expectLine(command("APPEND")),
				reply("OK APPEND completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user@example.com", "s3cret");
		const bigBody = Buffer.from(`Subject: big\r\n\r\n${"y".repeat(6000)}\r\n`);
		await driver.append("INBOX", bigBody);
		await server.assertCompleted();
		// When implemented: inspect every literal announcement marker.
		const appendLine = server.commandLines.find((l) => l.verb === "APPEND");
		expect(appendLine).toBeDefined();
		const markers = [...appendLine!.args.matchAll(/\{(\d+)(\+)?\}/g)];
		expect(markers.length).toBeGreaterThanOrEqual(1);
		for (const m of markers) {
			const size = Number(m[1]);
			const nonSync = m[2] === "+";
			if (nonSync) {
				// RFC9051-4.3-2: {n+} announcements are capped at 4096 octets.
				expect(size, `non-synchronizing literal {${size}+} exceeds 4096`).toBeLessThanOrEqual(
					4096,
				);
			}
			if (size > 4096) {
				// RFC9051-4.3-3: oversized literals use the synchronizing form.
				expect(nonSync, `literal {${size}} must be synchronizing`).toBe(false);
			}
		}
	},
);

// ── RFC9051-4.3-4: quoted string = UTF-8 Unicode, no CR/LF ────────────────
// rev2 redefines quoted strings from rev1's 7-bit rule to UTF-8-encoded
// Unicode excluding CR and LF. The ID command's field/value pairs are the
// quoted strings the client sends today: assert no CR/LF and UTF-8 validity
// (an 8th-bit byte is no longer a violation per se — invalid UTF-8 is).
complianceTest(
	{
		reqs: ["RFC9051-4.3-4"],
		profiles: ["rev2"],
		title: "quoted strings in client commands are valid UTF-8 with no CR/LF",
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...greet({ profile: "rev2" }),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK done", ["* CAPABILITY IMAP4rev2 LITERAL- ID"]),
				expectLine(command("ID")),
				reply("OK done", ["* ID NIL"]),
			],
		]);
		const driver = f.newDriver();
		await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
			id: { name: "compliance-suite", version: "1.0" },
		});
		await server.assertCompleted();
		// ID command is the second command; extract all quoted strings.
		expect(server.commandLines.length).toBeGreaterThanOrEqual(2);
		const idArgs = server.commandLines[1].args;
		const qstrings = idArgs.match(/"((?:[^"\\]|\\.)*)"/g) ?? [];
		expect(qstrings.length).toBeGreaterThanOrEqual(1);
		for (const qs of qstrings) {
			const inner = qs.slice(1, -1);
			// Excluding CR and LF (and NUL per RFC9051-9-4).
			// eslint-disable-next-line no-control-regex
			expect(inner).not.toMatch(/[\r\n\x00]/);
			// The byte sequence must be valid UTF-8 (rev2's quoted-string rule).
			expect(
				isValidUtf8(wireBytes(inner)),
				`quoted string ${qs} must be valid UTF-8 on the wire`,
			).toBe(true);
		}
	},
);

// ── RFC9051-4.3-5: zero-octet synchronizing literal still waits ────────────
// "Even if the octet count is 0, a client transmitting a synchronizing
// literal MUST wait to receive a command continuation request." Under the
// rev2 LITERAL- baseline a {0+} form would also be legal; the duty binds
// whenever the synchronizing form is chosen. The harness auto-continues sync
// literals, so a completed script proves the gated exchange; the marker
// assertion documents which form was used.
complianceTest(
	{
		reqs: ["RFC9051-4.3-5"],
		profiles: ["rev2"],
		title: "zero-octet literal APPEND completes through the literal protocol",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { login: true, profile: "rev2" }),
				expectLine(command("APPEND")),
				reply("OK APPEND completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user@example.com", "s3cret");
		await driver.append("INBOX", Buffer.alloc(0));
		await server.assertCompleted();
		// When implemented: a {0} (synchronizing) announcement must have been
		// gated by the continuation (harness enforces the sequencing); a {0+}
		// non-synchronizing form is also RFC-legal under LITERAL- and needs no
		// wait. Either way the announcement must be well-formed.
		const appendLine = server.commandLines.find((l) => l.verb === "APPEND");
		expect(appendLine).toBeDefined();
		const markers = [...appendLine!.args.matchAll(/\{(\d+)(\+)?\}/g)];
		expect(markers.length).toBeGreaterThanOrEqual(1);
		expect(markers.some((m) => m[1] === "0")).toBe(true);
	},
);

// ── RFC9051-4.3.1-1: 8-bit in literals SHOULD have identified CHARSET ─────
// If the client puts 8-bit/multi-octet content in a literal, it SHOULD do so
// only when the [CHARSET] is identified (e.g., via MIME headers of the
// appended message). driver.append() is the natural surface.
complianceTest(
	{
		reqs: ["RFC9051-4.3.1-1"],
		profiles: ["rev2"],
		title: "client transmitting 8-bit data in literals identifies the CHARSET",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { login: true, profile: "rev2" }),
				expectLine(command("APPEND")),
				reply("OK APPEND completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user@example.com", "s3cret");
		// 8-bit content with the charset identified in the message headers.
		const body = Buffer.from(
			'Subject: café\r\nContent-Type: text/plain; charset="utf-8"\r\n\r\nBody with 8-bit: é\r\n',
			"utf8",
		);
		await driver.append("INBOX", body);
		await server.assertCompleted();
	},
);

// ── RFC9051-4.3.1-2: MUST accept UTF-8 text in quoted-strings ─────────────
// New in rev2. The server sends quoted-strings containing UTF-8 text (free
// of NUL/CR/LF); the client MUST accept them. The ID response is the
// observable surface today: the parsed value must round-trip through the
// session's server-info map, proving the UTF-8 text was accepted as sent.
defineAcceptanceTable({
	name: "accepts UTF-8 text in server-sent quoted-strings",
	profiles: ["rev2"],
	rows: [
		{
			req: "RFC9051-4.3.1-2",
			variant: "2-byte UTF-8 sequences (Latin accents)",
			value: "sérveur-tëst",
		},
		{
			req: "RFC9051-4.3.1-2",
			variant: "3-byte UTF-8 sequences (CJK)",
			value: "サーバ試験",
		},
		{
			req: "RFC9051-4.3.1-2",
			variant: "4-byte UTF-8 sequences (supplementary plane)",
			value: "server-🧪",
		},
	],
	async execute(row) {
		const server = await f.startServer();
		// Pre-encode so the wire carries genuine UTF-8 bytes (the harness
		// serializes script strings as latin1).
		const utf8OnWire = Buffer.from(row.value, "utf8").toString("latin1");
		server.arm([
			[
				...greet({ profile: "rev2" }),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK done", ["* CAPABILITY IMAP4rev2 LITERAL- ID"]),
				expectLine(command("ID")),
				reply("OK done", [`* ID ("name" "${utf8OnWire}")`]),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
			id: { name: "compliance-suite" },
		});
		// MUST accept: the connection survives and the quoted-string value is
		// surfaced as the UTF-8 text that was sent.
		expect(ok).toBe(true);
		expect(driver.active).toBe(true);
		await server.assertCompleted();
		expect(driver.serverInfo()?.get("name")).toBe(row.value);
	},
});

// ── RFC9051-4.3.1-3 + RFC9051-4.3.1-4: binary data must be encoded ────────
// A message containing NUL bytes is binary; the client MUST encode it into a
// textual form (e.g., base64) before transmitting — unencoded binary strings
// are not permitted (the literal8 carve-out applies to server FETCH
// responses, not client APPEND under the rev2 base).
complianceTest(
	{
		reqs: ["RFC9051-4.3.1-3", "RFC9051-4.3.1-4"],
		profiles: ["rev2"],
		title: "binary data (NUL-containing strings) is encoded before transmission",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { login: true, profile: "rev2" }),
				expectLine(command("APPEND")),
				reply("OK APPEND completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user@example.com", "s3cret");
		// Buffer with a NUL byte — triggers the binary-encoding obligation.
		const binaryBody = Buffer.from([
			0x53, 0x75, 0x62, 0x6a, 0x65, 0x63, 0x74, 0x3a,
			0x00, // NUL byte
			0x0d, 0x0a, 0x0d, 0x0a,
		]);
		await driver.append("INBOX", binaryBody);
		await server.assertCompleted();
		// When implemented: no transmitted literal payload may contain NUL —
		// binary content must appear encoded (e.g., base64).
		const appendLine = server.commandLines.find((l) => l.verb === "APPEND");
		expect(appendLine).toBeDefined();
		for (const lit of appendLine!.literals) {
			expect(lit.includes(0x00), "literal payload must not contain NUL").toBe(false);
		}
	},
);

// ── RFC9051-4.3.1-5: excessive-CTL string MAY be treated as binary ────────
// A MAY permission: the client is allowed (not required) to classify
// CTL-heavy strings as binary and encode them. The obligation this test
// pins down is that the behavior is well-defined: the client emits no
// protocol-invalid command for such input.
complianceTest(
	{
		reqs: ["RFC9051-4.3.1-5"],
		profiles: ["rev2"],
		title: "client handles strings with excessive CTL characters without error",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(undefined, { login: true, profile: "rev2" }),
				expectLine(command("APPEND")),
				reply("OK APPEND completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user@example.com", "s3cret");
		const ctlBody = Buffer.concat([
			Buffer.from("Subject: test\r\n\r\n"),
			Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0b]),
		]);
		await driver.append("INBOX", ctlBody);
		// Script completion is the assertion: the client handled the CTL data
		// without sending a protocol-invalid command.
		await server.assertCompleted();
	},
);
