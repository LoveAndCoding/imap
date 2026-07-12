/**
 * RFC 6154 — "IMAP LIST Extension for Special-Use Mailboxes." Covers BOTH the
 * SPECIAL-USE capability (special-use name-attributes + the SPECIAL-USE LIST
 * selection/return options) AND the CREATE-SPECIAL-USE capability (the CREATE
 * `(USE (...))` parameter + the `[USEATTR]` response code).
 *
 * Testable catalog ids covered here (see test/compliance/catalog/ext/rfc6154.ts):
 *
 *   RFC6154-2-1  Client MAY request only special-use mailboxes via the SPECIAL-USE
 *                selection option: `LIST (SPECIAL-USE) "" "*"`. testable.
 *   RFC6154-2-2  Client MAY request special-use attributes via the SPECIAL-USE
 *                return option: `LIST "" "%" RETURN (SPECIAL-USE)`. testable.
 *   RFC6154-3-1  Client MUST NOT use the USE parameter unless CREATE-SPECIAL-USE is
 *                advertised. testable (prohibition).
 *   RFC6154-3-2  Client CREATE with special use MAY carry the USE parameter:
 *                `CREATE MySpecial (USE (\Drafts \Sent))`. testable.
 *   RFC6154-3-3  Client MUST handle a tagged NO carrying `[USEATTR]` on CREATE
 *                refusal. testable.
 *   RFC6154-6-1  Client MUST accept the seven special-use name-attributes
 *                (\All \Archive \Drafts \Flagged \Junk \Sent \Trash) in LIST
 *                responses. testable.
 *   RFC6154-6-2  Client MUST ignore list attributes it does not understand.
 *                testable.
 *
 * Untestable: 0 (every RFC 6154 client entry is testable).
 *
 * PROFILES: all seven keep ["rev1","rev2"]. RFC 9051 (IMAP4rev2) did NOT absorb
 * RFC 6154's special-use surface into core — §6.3.4 CREATE has no USE parameter,
 * §7.3.1 defines no special-use attributes, and there is no SPECIAL-USE option or
 * [USEATTR] code in the rev2 catalog — so RFC 6154 remains a standalone extension
 * scoring these duties under both profiles. RFC6154-3-1 is cross-referenced (not
 * deduped) against the GENERAL option gate RFC9051-6.3.9-5, which is a distinct
 * duty (LIST options vs the CREATE-side USE parameter). See the module extractionNote.
 *
 * driver.create() (widened with useAttributes) is wired as of M2.3: the
 * three CREATE-side tests (RFC6154-3-1/-3-2/-3-3) are REAL SIGNAL — the
 * capability gate rejects `CapabilityError` with zero bytes (3-1), the
 * `CREATE mailbox (USE (...))` wire form is pinned by a tight matcher
 * (3-2), and the tagged `NO [USEATTR]` refusal surfaces as a ServerNoError
 * carrying the typed USEATTR code (3-3). driver.list() (widened with
 * selectOptions/returnOptions) still throws NotImplementedError until M2.7:
 * the LIST-side tests (RFC6154-2-1/-2-2/-6-1/-6-2) drive the verb, catch
 * the rejection, and assert on it and the transcript — genuine (if
 * currently vacuous for the wire-shape assertions) passes whose scripts
 * pin the exact RFC-conformant wire form for when list() lands.
 * REAL SIGNAL for the LIST half (M2.7): driver.list() delegates to
 * ImapClient.list() — the 2-1/2-2 emit-form tests and the 6-1/6-2 acceptance
 * tests drive the real wire exchange end-to-end and assert on the typed
 * MailboxInfo[] results. driver.create() (widened with useAttributes) still
 * throws NotImplementedError: the CREATE-USE surface is M2.3's; the 3-x tests
 * keep the catch-the-rejection shape until it lands.
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { expectLine, reply } from "../../harness/script";
import { NotImplementedError } from "../../driver/errors";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";
import { sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

// Capabilities advertising the SPECIAL-USE / CREATE-SPECIAL-USE features per profile.
function suCaps(profile: "rev1" | "rev2", extra: string[] = ["SPECIAL-USE"]): string[] {
	return profile === "rev2"
		? ["IMAP4rev2", "LITERAL-", ...extra]
		: ["IMAP4rev1", ...extra];
}

// ── RFC6154-2-1: SPECIAL-USE selection option ────────────────────────────────
// `C: t3 LIST (SPECIAL-USE) "" "*"` (§5.2) — the option is a bare atom inside the
// parenthesized selection-option list, immediately after LIST and before the
// reference/pattern. The matcher requires the parenthesized `(SPECIAL-USE)` list
// preceding the reference and pattern, rejecting a bare `LIST "" "*"` with no
// selection option, or the atom placed outside the parentheses. REAL SIGNAL
// (M2.7): the exchange runs end-to-end.
complianceTest(
	{
		reqs: ["RFC6154-2-1"],
		profiles: ["rev1", "rev2"],
		title: "client emits LIST (SPECIAL-USE) selection option to list only special-use mailboxes",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(suCaps(ctx.profile), { profile: ctx.profile, login: true }),
				// Parenthesized selection-option list containing SPECIAL-USE, then the
				// reference and pattern.
				expectLine(
					command("LIST", {
						args: /^\((?:[A-Z-]+ )*SPECIAL-USE(?: [A-Z-]+)*\) (?:""|"[^"]*"|[^\s"]+) (?:""|"[^"]*"|[^\s"]+)$/,
					}),
				),
				reply("OK List completed.", ['* LIST (\\Sent) "/" "Sent Items"']),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		const listing = await driver.list("", "*", { selectOptions: ["SPECIAL-USE"] });
		await server.assertCompleted();
		// SPECIAL-USE appears inside a parenthesized selection list.
		const listLine = server.commandLines.find((l) => l.verb === "LIST");
		expect(listLine, "a LIST command must have been sent").toBeDefined();
		expect(listLine!.args, "SPECIAL-USE must be a parenthesized selection option").toMatch(
			/^\([^)]*SPECIAL-USE[^)]*\)/,
		);
		// The typed result carries the special-use annotation.
		expect(listing).toHaveLength(1);
		expect(listing[0].name).toBe("Sent Items");
		expect(listing[0].specialUse).toBe("\\Sent");
	},
);

// ── RFC6154-2-2: SPECIAL-USE return option ───────────────────────────────────
// `C: t2 LIST "" "%" RETURN (SPECIAL-USE)` (§5.2) — the option appears inside the
// trailing RETURN parenthesized list. The matcher requires the RETURN keyword and
// the parenthesized SPECIAL-USE after the reference/pattern, rejecting a missing
// RETURN keyword or the atom outside the parentheses. REAL SIGNAL (M2.7).
complianceTest(
	{
		reqs: ["RFC6154-2-2"],
		profiles: ["rev1", "rev2"],
		title: "client emits LIST ... RETURN (SPECIAL-USE) to request special-use attributes",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(suCaps(ctx.profile), { profile: ctx.profile, login: true }),
				expectLine(
					command("LIST", {
						args: /^(?:""|"[^"]*"|[^\s"]+) (?:""|"[^"]*"|[^\s"]+) RETURN \((?:[A-Z-]+ )*SPECIAL-USE(?: [A-Z-]+)*\)$/,
					}),
				),
				reply("OK List completed.", ['* LIST (\\Marked \\Sent) "/" "Sent"']),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		const listing = await driver.list("", "%", { returnOptions: ["SPECIAL-USE"] });
		await server.assertCompleted();
		const listLine = server.commandLines.find((l) => l.verb === "LIST");
		expect(listLine, "a LIST command must have been sent").toBeDefined();
		expect(listLine!.args, "SPECIAL-USE must appear inside the RETURN parentheses").toMatch(
			/RETURN \([^)]*SPECIAL-USE[^)]*\)/,
		);
		// The typed result carries the returned special-use attribute.
		expect(listing).toHaveLength(1);
		expect(listing[0].specialUse).toBe("\\Sent");
		expect(listing[0].attributes.has("\\Marked")).toBe(true);
	},
);

// ── RFC6154-3-1: MUST NOT use USE parameter unless CREATE-SPECIAL-USE advertised ─
// PROHIBITION test — never expectLine the forbidden command. Arm a server whose
// CAPABILITY advertises SPECIAL-USE (the LIST-side capability) but NOT
// CREATE-SPECIAL-USE (the distinct CREATE-side capability). Drive create() with a
// USE attribute; a conformant client must not emit a CREATE carrying `(USE (...))`
// when CREATE-SPECIAL-USE was never advertised. REAL SIGNAL (M2.3): the client
// gates the option on the live capability registry and rejects CapabilityError
// with ZERO bytes written (spec I-9); the transcript guard proves no USE
// parameter reached the wire.
complianceTest(
	{
		reqs: ["RFC6154-3-1"],
		profiles: ["rev1", "rev2"],
		title: "client MUST NOT emit CREATE (USE (...)) unless CREATE-SPECIAL-USE is advertised",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				// SPECIAL-USE advertised, CREATE-SPECIAL-USE deliberately NOT.
				...sessionPrelude(suCaps(ctx.profile, ["SPECIAL-USE"]), {
					profile: ctx.profile,
					login: true,
				}),
				// No CREATE-with-USE is scripted — any such command is a violation.
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		let err: unknown;
		try {
			await driver.create("Archive", { useAttributes: ["\\Archive"] });
		} catch (e) {
			err = e;
		}
		expect(
			err,
			"create() with a USE attribute must reject when CREATE-SPECIAL-USE is unadvertised",
		).toBeInstanceOf(Error);
		expect(
			(err as Error).name,
			"the rejection must be a CapabilityError (client-side gate, zero bytes)",
		).toBe("CapabilityError");
		await server.assertCompleted();
		// Transcript guard: no CREATE carrying a USE parameter reached the wire.
		expect(
			server.transcript.clientLines(),
			"no CREATE USE parameter may be sent without CREATE-SPECIAL-USE",
		).not.toMatch(/\bUSE\b/i);
	},
);

// ── RFC6154-3-2: CREATE with the USE parameter ───────────────────────────────
// `C: t2 CREATE MySpecial (USE (\Drafts \Sent))` (§5.3) — the literal atom USE, a
// space, then a parenthesized space-separated list of use-attr tokens. The matcher
// requires the mailbox name followed by `(USE (<attrs>))`, rejecting attributes
// that are not parenthesized, a missing USE keyword, or attributes passed as a bare
// flag list. REAL SIGNAL (M2.3): driver.create() is wired.
complianceTest(
	{
		reqs: ["RFC6154-3-2"],
		profiles: ["rev1", "rev2"],
		title: "client emits CREATE <mailbox> (USE (<attrs>)) to designate special uses at creation",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(suCaps(ctx.profile, ["SPECIAL-USE", "CREATE-SPECIAL-USE"]), {
					profile: ctx.profile,
					login: true,
				}),
				// mailbox SP "(USE (" use-attr *(SP use-attr) "))"
				expectLine(
					command("CREATE", {
						args: /^(?:"[^"]*"|[^\s"]+) \(USE \(\\[A-Za-z]+(?: \\[A-Za-z]+)*\)\)$/,
					}),
				),
				reply("OK Create completed."),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.create("MySpecial", { useAttributes: ["\\Drafts", "\\Sent"] });
		await server.assertCompleted();
		// The attributes appear inside a (USE (...)) parameter, never as a
		// bare flag list (the tight matcher above already enforced the full
		// §5.3 shape; this re-verifies the recorded form).
		const createLine = server.commandLines.find((l) => l.verb === "CREATE");
		expect(createLine, "a CREATE command must have been sent").toBeDefined();
		expect(createLine!.args, "special uses must be inside a (USE (...)) parameter").toMatch(
			/\(USE \(/,
		);
	},
);

// ── RFC6154-3-3: handle a tagged NO carrying [USEATTR] on CREATE refusal ─────
// `C: t3 CREATE Everything (USE (\All))` / `S: t3 NO [USEATTR] \All not supported`
// (§5.3). A client that emitted a special-use CREATE MUST accept a tagged
// `NO [USEATTR] ...` as a well-formed, per-spec refusal — surfacing the CREATE as
// failed, not treating the [USEATTR] resp-text-code as a protocol/parse error.
// REAL SIGNAL (M2.3): driver.create() is wired; the refusal surfaces as a
// ServerNoError carrying the typed { name: "USEATTR" } response code.
complianceTest(
	{
		reqs: ["RFC6154-3-3"],
		profiles: ["rev1", "rev2"],
		title: "client accepts a tagged NO [USEATTR] as a well-formed CREATE-special-use refusal",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(suCaps(ctx.profile, ["SPECIAL-USE", "CREATE-SPECIAL-USE"]), {
					profile: ctx.profile,
					login: true,
				}),
				expectLine(command("CREATE")),
				// §5.3 refusal: tagged NO carrying the [USEATTR] response code.
				reply("NO [USEATTR] \\All not supported"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		let err: unknown;
		try {
			await driver.create("Everything", { useAttributes: ["\\All"] });
		} catch (e) {
			err = e;
		}
		await server.assertCompleted();
		// The client surfaces the CREATE as failed — an ordinary tagged-NO
		// rejection carrying the typed USEATTR code, never a protocol/parse
		// error…
		expect(err, "create() must reject on the NO [USEATTR] refusal").toBeInstanceOf(Error);
		expect((err as Error).name, "the rejection must be a ServerNoError").toBe(
			"ServerNoError",
		);
		expect(
			(err as { code?: { name?: string } }).code?.name,
			"the rejection must carry the typed USEATTR response code",
		).toBe("USEATTR");
		// …and does NOT choke on the [USEATTR] code — the connection remains
		// usable.
		expect(driver.active, "client stays active after a NO [USEATTR] refusal").toBe(true);
	},
);

// ── RFC6154-6-1: accept the seven special-use name-attributes in LIST responses ─
// The seven attributes \All \Archive \Drafts \Flagged \Junk \Sent \Trash extend
// mbx-list-oflag: a client parsing LIST responses MUST accept any of them wherever
// a mailbox-list flag may appear, interleaved with existing flags (\Marked,
// \HasNoChildren, ...). Script a LIST response carrying all seven across several
// mailboxes; the client must parse them without error. REAL SIGNAL (M2.7): the
// typed results carry every entry with its special-use annotation.
complianceTest(
	{
		reqs: ["RFC6154-6-1"],
		profiles: ["rev1", "rev2"],
		title: "client accepts the seven special-use name-attributes in LIST responses",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(suCaps(ctx.profile), { profile: ctx.profile, login: true }),
				expectLine(command("LIST")),
				// All seven special-use attributes, interleaved with ordinary flags.
				reply("OK List completed.", [
					'* LIST (\\HasNoChildren \\All) "/" "All Mail"',
					'* LIST (\\HasNoChildren \\Archive) "/" "Archive"',
					'* LIST (\\HasNoChildren \\Drafts) "/" "Drafts"',
					'* LIST (\\Marked \\Flagged) "/" "Flagged"',
					'* LIST (\\HasNoChildren \\Junk) "/" "Spam"',
					'* LIST (\\HasNoChildren \\Sent) "/" "Sent Items"',
					'* LIST (\\HasNoChildren \\Trash) "/" "Trash"',
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		const listing = await driver.list("", "*", { returnOptions: ["SPECIAL-USE"] });
		await server.assertCompleted();
		// The client parses all seven special-use attributes without error…
		expect(listing).toHaveLength(7);
		const bySpecialUse = new Map(listing.map((mb) => [mb.specialUse, mb.name]));
		for (const attr of [
			"\\All",
			"\\Archive",
			"\\Drafts",
			"\\Flagged",
			"\\Junk",
			"\\Sent",
			"\\Trash",
		]) {
			expect(bySpecialUse.has(attr), `${attr} must be accepted and surfaced`).toBe(true);
		}
		// …and stays connected.
		expect(
			driver.active,
			"client must parse LIST responses carrying special-use attributes",
		).toBe(true);
	},
);

// ── RFC6154-6-2: ignore list attributes the client does not understand ───────
// use-attr-ext = "\" atom ; Clients MUST ignore list attributes they do not
// understand. A client MUST NOT choke on an unrecognized "\"-prefixed atom (e.g. a
// future "\Xyzzy" special use) in a LIST response — it parses the base response and
// skips the unknown attribute. Script a LIST entry mixing a known flag with an
// unknown "\Xyzzy" attribute. REAL SIGNAL (M2.7): the unknown attribute is data
// (preserved in `attributes`, not detected as a special use), never an error.
// applicability "always" per the catalog (baseline robustness).
complianceTest(
	{
		reqs: ["RFC6154-6-2"],
		profiles: ["rev1", "rev2"],
		title: "client ignores an unrecognized list attribute and parses the base LIST response",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(suCaps(ctx.profile), { profile: ctx.profile, login: true }),
				expectLine(command("LIST")),
				// An unrecognized "\Xyzzy" attribute alongside a known one — the client
				// MUST ignore the unknown attribute, not reject the mailbox line.
				reply("OK List completed.", ['* LIST (\\HasNoChildren \\Xyzzy) "/" "INBOX"']),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		const listing = await driver.list("", "*");
		await server.assertCompleted();
		// The client survives the unknown attribute (no parse abort / disconnect)
		// and treats the base LIST entry normally: the entry parses, the unknown
		// attribute rides along as data, and it is NOT mistaken for a special use.
		expect(listing).toHaveLength(1);
		expect(listing[0].name).toBe("INBOX");
		expect(listing[0].attributes.has("\\HasNoChildren")).toBe(true);
		expect(listing[0].specialUse).toBeUndefined();
		expect(
			driver.active,
			"client must remain connected after ignoring an unknown list attribute",
		).toBe(true);
	},
);
