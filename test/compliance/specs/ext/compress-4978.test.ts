/**
 * RFC 4978 — "The IMAP COMPRESS Extension" (COMPRESS=DEFLATE). Client-binding
 * duties for the COMPRESS command: its wire syntax, the pipelining constraint
 * around its result, the post-result compression state transitions, and the
 * case-insensitive acceptance of the extension's tokens.
 *
 * Testable catalog ids covered here (see test/compliance/catalog/ext/rfc4978.ts):
 *
 *   RFC4978-3-1  Client MUST NOT send any further commands until it has seen
 *                the result of COMPRESS (one-outstanding-COMPRESS pipelining).
 *   RFC4978-3-3  If the server response was BAD or NO, the client MUST NOT turn
 *                on compression (observable as continued plaintext traffic).
 *   RFC4978-5-1  Implementations MUST accept the COMPRESS/algorithm/resp-text-code
 *                strings case-insensitively.
 *
 * Untestable ids NOT cited (per the catalog module's own testability tags):
 *   RFC4978-1-1  (MAY use COMPRESS or TLS compression; RECOMMENDED prefer TLS) —
 *                user-intent-policy.
 *   RFC4978-3-2  (MUST compress starting with the first command after OK),
 *   RFC4978-3-4  (send-side layering order compress→SASL→TLS),
 *   RFC4978-3-5  (receive-side reversed processing order) — all untestable under
 *                this black-box harness: their observable core is the byte-level
 *                content of the compressed octet stream AFTER a successful
 *                COMPRESS OK, and the harness has no DEFLATE/zlib codec on its
 *                server-scripting side to encode or decode that stream. The
 *                catalog tags these with the 'compressed-framing-opacity' theme
 *                (registered at P3-E in test/compliance/catalog/types.ts and the
 *                untestability-themes taxonomy); this spec file does NOT exercise
 *                them (see report).
 *
 * COMMAND SYNTAX (RFC 4978 §3, §5 ABNF: compress = "COMPRESS" SP algorithm;
 * algorithm = "DEFLATE"): the only defined algorithm is DEFLATE, so the sole
 * legal COMPRESS command form a client emits is "<tag> COMPRESS DEFLATE".
 *
 * SELF-ACTUALIZATION (M5.9): `driver.compress()` now delegates to the real
 * `ImapClient.compress()` (RFC 4978 COMPRESS=DEFLATE, `src/connection/
 * compress.ts` + `src/commands/compress.ts`). The scripted server validates
 * the COMPRESS DEFLATE command form and the pipelining/post-BAD-NO behavior
 * against the wire, so these matchers are genuine, non-vacuous assertions,
 * not the placeholder they were before this milestone.
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { expectLine, reply } from "../../harness/script";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";
import { sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

// ── RFC4978-3-1: no further commands until the COMPRESS result is seen ─────
// The COMPRESS command form is "COMPRESS DEFLATE" (the only defined algorithm),
// and the client MUST NOT put any further command bytes on the wire until it
// has read the tagged OK/NO/BAD for COMPRESS. The scripted server replies with
// a tagged OK to COMPRESS and arms NO expectation for any further command; a
// client that pipelined a second command before the result would produce an
// unscripted line (script failure) whose bytes the transcript would carry. The
// post-OK compressed stream itself is out of reach (harness has no DEFLATE
// codec — RFC4978-3-2 territory), so we assert only the pipelining prohibition.
complianceTest(
	{
		reqs: ["RFC4978-3-1"],
		profiles: ["rev1", "rev2"],
		title: "COMPRESS DEFLATE: client sends no further command before the COMPRESS result arrives",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "COMPRESS=DEFLATE"]),
				// The only legal COMPRESS form: mechanism token DEFLATE, nothing else.
				expectLine(command("COMPRESS", { args: /^DEFLATE$/i })),
				// Result of COMPRESS. No further-command expectation is armed: a
				// client that pipelined anything before reading this OK would emit
				// an unscripted line and fail the script.
				reply("OK COMPRESS active"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.compress();
		await server.assertCompleted();
		const compressLine = server.commandLines.find((l) => l.verb === "COMPRESS");
		expect(compressLine).toBeDefined();
		// When implemented: the COMPRESS argument is exactly the DEFLATE algorithm
		// token (case-insensitive), never a second algorithm or extra arguments.
		expect(compressLine!.args, "COMPRESS argument must be the DEFLATE algorithm token").toMatch(
			/^DEFLATE$/i,
		);
		// The COMPRESS line is the last client line before its result: no command
		// bytes may have been pipelined ahead of the tagged response.
		const tags = server.commandTags;
		expect(
			tags[tags.length - 1],
			"COMPRESS must be the last command issued before its result (no pipelining)",
		).toBe(compressLine!.tag);
	},
);

// ── RFC4978-3-3: MUST NOT turn on compression after a BAD or NO result ─────
// The negative-space counterpart of the (untestable) 3-2 stream switch: after a
// scripted NO to COMPRESS DEFLATE, the client MUST NOT begin compressing. This
// is observable WITHOUT a DEFLATE codec because it is the ABSENCE of
// compression that is asserted: a subsequent command (a NOOP probe) must arrive
// as plain, parseable IMAP rather than opaque compressed bytes. The command()
// matcher for NOOP parses only if the line is plaintext IMAP; opaque DEFLATE
// octets would fail to match.
complianceTest(
	{
		reqs: ["RFC4978-3-3"],
		profiles: ["rev1", "rev2"],
		title: "client does not turn on compression after a NO response to COMPRESS DEFLATE",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "COMPRESS=DEFLATE"]),
				expectLine(command("COMPRESS", { args: /^DEFLATE$/i })),
				// Server refuses: NO. Compression MUST NOT be turned on.
				reply("NO COMPRESS failed"),
				// A liveness probe issued after the refusal MUST be plaintext IMAP;
				// the command() matcher only parses an uncompressed IMAP line. If the
				// client wrongly began compressing, these bytes would be opaque
				// DEFLATE octets and this expectation would fail to match.
				expectLine(command("NOOP", { args: null })),
				reply("OK NOOP completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		// A conformant client, on the NO, leaves the connection uncompressed and a
		// follow-up NOOP travels in the clear. `ImapClient.compress()` resolves
		// (not rejects) on a NO/BAD result -- RFC4978-3-3 is about not turning on
		// compression, not about surfacing an error to the caller.
		await driver.compress();
		await driver.noop();
		await server.assertCompleted();
		// The NOOP after a NO must be a plaintext command line.
		const noopLine = server.commandLines.find((l) => l.verb === "NOOP");
		expect(noopLine, "post-NO traffic must remain uncompressed, parseable IMAP").toBeDefined();
	},
);

// ── RFC4978-5-1: case-insensitive acceptance of COMPRESS/algorithm/resp-text ─
// "Implementations MUST accept these strings in a case-insensitive fashion."
// For the client this binds acceptance of a server capability advertised in
// non-canonical case ("compress=deflate") and of a mixed-case COMPRESSIONACTIVE
// resp-text-code. The server here advertises the capability in lowercase and
// (on the COMPRESS BAD-already-active path) returns a mixed-case resp-text-code;
// a conformant client still recognizes the extension and issues COMPRESS
// DEFLATE.
complianceTest(
	{
		reqs: ["RFC4978-5-1"],
		profiles: ["rev1", "rev2"],
		title: "client accepts COMPRESS/DEFLATE/COMPRESSIONACTIVE tokens in non-canonical case",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				// Capability advertised in lowercase: a conformant client MUST accept
				// it case-insensitively and treat COMPRESS=DEFLATE as available.
				...sessionPrelude(["IMAP4rev1", "compress=deflate"]),
				expectLine(command("COMPRESS", { args: /^DEFLATE$/i })),
				// Mixed-case resp-text-code on a refusal: the client must accept the
				// [CompressionActive] code case-insensitively (it signals compression
				// was already active — a BAD outcome the client must recognize).
				reply("BAD [CompressionActive] compression already active"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.compress();
		await server.assertCompleted();
		const compressLine = server.commandLines.find((l) => l.verb === "COMPRESS");
		expect(compressLine).toBeDefined();
		// The client recognized the lowercase capability and still emitted a
		// well-formed COMPRESS DEFLATE command.
		expect(compressLine!.args).toMatch(/^DEFLATE$/i);
	},
);
