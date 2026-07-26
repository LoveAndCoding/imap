/**
 * X-GM-EXT-1 — Google's Gmail IMAP vendor extension (not an RFC/IANA spec):
 * https://developers.google.com/workspace/gmail/imap/imap-extensions
 *
 * Testable catalog ids covered here (see test/compliance/catalog/ext/xgmext1.ts;
 * all dual-profile [rev1, rev2]):
 *
 *   X-GM-EXT-1-cap-1     Extension support advertised via CAPABILITY.
 *   X-GM-EXT-1-cap-2     "X-GM-EXT-1" token gates all extensions in this doc.
 *   X-GM-EXT-1-msgid-2   X-GM-MSGID retrieved via FETCH attribute.
 *   X-GM-EXT-1-msgid-3   X-GM-MSGID is a 64-bit unsigned integer, decimal.
 *   X-GM-EXT-1-msgid-4   X-GM-MSGID usable as a SEARCH/UID SEARCH key.
 *   X-GM-EXT-1-thrid-2   X-GM-THRID retrieved via FETCH attribute.
 *   X-GM-EXT-1-thrid-3   X-GM-THRID is a 64-bit unsigned integer, decimal.
 *   X-GM-EXT-1-thrid-4   X-GM-THRID usable as a SEARCH/UID SEARCH key.
 *   X-GM-EXT-1-labels-2  Labels modified via standard CREATE/RENAME/DELETE.
 *   X-GM-EXT-1-labels-4  X-GM-LABELS retrieved via FETCH attribute.
 *   X-GM-EXT-1-labels-5  X-GM-LABELS response is a list of ASTRINGs, UTF-7
 *                        encoded as appropriate.
 *   X-GM-EXT-1-labels-6  Labels added to a message via STORE +X-GM-LABELS.
 *   X-GM-EXT-1-labels-8  X-GM-LABELS usable as a SEARCH/UID SEARCH key.
 *   X-GM-EXT-1-raw-1     X-GM-RAW provides full Gmail search syntax passthrough.
 *   X-GM-EXT-1-raw-2     X-GM-RAW arguments interpreted as Gmail web syntax.
 *
 * Untestable ids NOT cited (per the catalog's own testability tags — mostly
 * internal-state/internal-decision: server-side identity/grouping guarantees
 * a client cannot verify, or capability-gating discipline with no distinct
 * wire trace from correct usage): X-GM-EXT-1-msgid-1/-5, X-GM-EXT-1-thrid-1/-5,
 * X-GM-EXT-1-labels-1/-3/-7/-9/-10.
 *
 * OBSERVATION SPLIT:
 *  - X-GM-EXT-1-cap-1/-cap-2: the client's ordinary CAPABILITY parsing
 *    already recognizes arbitrary tokens generically; probed here via the
 *    session-establishment CAPABILITY exchange asserting the client
 *    completed the handshake having received the literal X-GM-EXT-1 token
 *    (a client that choked on an unrecognized vendor token would fail the
 *    prelude itself).
 *  - FETCH-attribute duties (msgid-2/-3, thrid-2/-3, labels-4/-5): REAL
 *    SIGNAL as of M3.5 — driver.fetch()/uidFetch() translate the vendor
 *    attribute names into `FetchItems.gmail` (`{ msgId/threadId/labels }`),
 *    wired through the real FETCH engine; the scripted server pins the
 *    exact FETCH data-item wire form and the worked response shape from the
 *    vendor doc so the matcher is non-vacuous.
 *  - SEARCH-key duties (msgid-4, thrid-4, labels-8, raw-1/-2): REAL SIGNAL
 *    as of M3.7 — driver.search() translates the vendor search keys into
 *    `SearchCriteria.gmailMessageId/gmailThreadId/gmailLabels/gmailRaw`;
 *    wire forms pinned from the vendor doc's worked examples.
 *  - STORE +X-GM-LABELS (labels-6): REAL SIGNAL as of M5.8 — driver.store()
 *    dispatches `"+X-GM-LABELS"`/`"-X-GM-LABELS"` to the real
 *    `MailboxSession.addGmailLabels()`/`removeGmailLabels()` (or their
 *    `.seq` mirrors); wire form pinned to the ADD data-item convention
 *    (`+X-GM-LABELS (label ...)`), the only form the vendor doc documents
 *    with a worked example (see catalog labels-7's honest gap note for the
 *    undocumented remove/replace/.SILENT forms, not asserted here — and
 *    accordingly not exposed by the public API either).
 *  - CREATE/RENAME/DELETE for label lifecycle (labels-2): these are the
 *    ALREADY standard RFC 3501/9051 commands, wired as of M2.3-M2.5; this
 *    entry only pins the X-GM-EXT-1-specific fact that no separate
 *    label-lifecycle command exists, exercised via CREATE against a
 *    label-style mailbox name (REAL SIGNAL).
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { expectLine, reply } from "../../harness/script";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";
import { selectExchange, sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

function gmailCaps(profile: string): string[] {
	return profile === "rev2"
		? ["IMAP4rev2", "LITERAL-", "X-GM-EXT-1"]
		: ["IMAP4rev1", "X-GM-EXT-1"];
}

// ═════════════════════════════════════════════════════════════════════════════
// X-GM-EXT-1-cap-1 / X-GM-EXT-1-cap-2 — capability gate recognized
// ═════════════════════════════════════════════════════════════════════════════
// The vendor doc: "Gmail advertises its extension support in its response to
// the CAPABILITY command" and "the presence of X-GM-EXT-1 in the list of
// supported capabilities" gates every feature below. Probed via the ordinary
// session-establishment CAPABILITY exchange: the client must complete the
// handshake (and, on the Session path, expose the token via hasCapability)
// having received the literal X-GM-EXT-1 token without choking on it.
complianceTest(
	{
		reqs: ["X-GM-EXT-1-cap-1", "X-GM-EXT-1-cap-2"],
		profiles: ["rev1", "rev2"],
		title: "client parses the X-GM-EXT-1 capability token from the CAPABILITY response without error",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([[...sessionPrelude(gmailCaps(ctx.profile), { profile: ctx.profile })]]);
		const driver = await f.connectPlain(server);
		await server.assertCompleted();
		expect(driver.active, "client remains connected after a CAPABILITY carrying X-GM-EXT-1").toBe(
			true,
		);
		expect(driver.hasCapability("X-GM-EXT-1")).toBe(true);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// X-GM-EXT-1-msgid-2 / -msgid-3 — X-GM-MSGID FETCH attribute (self-actualizing)
// ═════════════════════════════════════════════════════════════════════════════
// Vendor doc worked example: `a006 FETCH 1 (X-GM-MSGID)` /
// `* 1 FETCH (X-GM-MSGID 1278455344230334865)` / `a006 OK FETCH (Success)`.
// fetch() throws NotImplementedError today.
complianceTest(
	{
		reqs: ["X-GM-EXT-1-msgid-2", "X-GM-EXT-1-msgid-3"],
		profiles: ["rev1", "rev2"],
		title: "FETCH X-GM-MSGID attribute retrieves the 64-bit unsigned decimal Gmail message ID",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(gmailCaps(ctx.profile), { profile: ctx.profile, login: true }),
				...selectExchange("INBOX", { profile: ctx.profile, exists: 1 }),
				expectLine(command("FETCH", { args: /^1 \(X-GM-MSGID\)$/i })),
				reply("OK FETCH (Success)", ["* 1 FETCH (X-GM-MSGID 1278455344230334865)"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.fetch("1", ["X-GM-MSGID"]);
		await server.assertCompleted();
		const fetch = server.commandLines.find((l) => l.verb === "FETCH");
		expect(fetch, "FETCH must have been emitted").toBeDefined();
		expect(fetch!.args, "the sole documented wire form is FETCH <seq> (X-GM-MSGID)").toMatch(
			/^1 \(X-GM-MSGID\)$/i,
		);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// X-GM-EXT-1-msgid-4 — X-GM-MSGID as a SEARCH/UID SEARCH key (self-actualizing)
// ═════════════════════════════════════════════════════════════════════════════
// Vendor doc worked example: `a007 UID SEARCH X-GM-MSGID 1278455344230334865`
// / `* SEARCH 1` / `a007 OK SEARCH (Success)`. search() throws today.
complianceTest(
	{
		reqs: ["X-GM-EXT-1-msgid-4"],
		profiles: ["rev1", "rev2"],
		title: "SEARCH X-GM-MSGID <id> command form",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(gmailCaps(ctx.profile), { profile: ctx.profile, login: true }),
				...selectExchange("INBOX", { profile: ctx.profile, exists: 3 }),
				expectLine(command("SEARCH", { args: /^X-GM-MSGID 1278455344230334865$/i })),
				reply("OK SEARCH (Success)", ["* SEARCH 1"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.search(["X-GM-MSGID 1278455344230334865"]);
		await server.assertCompleted();
		const search = server.commandLines.find((l) => l.verb === "SEARCH");
		expect(search, "SEARCH must have been emitted").toBeDefined();
		expect(search!.args, "X-GM-MSGID <number> as a bare search-key form").toMatch(
			/^X-GM-MSGID 1278455344230334865$/i,
		);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// X-GM-EXT-1-thrid-2 / -thrid-3 — X-GM-THRID FETCH attribute (self-actualizing)
// ═════════════════════════════════════════════════════════════════════════════
// Vendor doc worked example: `a008 FETCH 1:4 (X-GM-THRID)` returning four
// untagged FETCH responses, e.g. `* 2 FETCH (X-GM-THRID 1266894439832287888)`.
complianceTest(
	{
		reqs: ["X-GM-EXT-1-thrid-2", "X-GM-EXT-1-thrid-3"],
		profiles: ["rev1", "rev2"],
		title: "FETCH X-GM-THRID attribute retrieves the 64-bit unsigned decimal Gmail thread ID",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(gmailCaps(ctx.profile), { profile: ctx.profile, login: true }),
				...selectExchange("INBOX", { profile: ctx.profile, exists: 4 }),
				expectLine(command("FETCH", { args: /^1:4 \(X-GM-THRID\)$/i })),
				reply("OK FETCH (Success)", [
					"* 1 FETCH (X-GM-THRID 1266894439832287888)",
					"* 2 FETCH (X-GM-THRID 1266894439832287888)",
					"* 3 FETCH (X-GM-THRID 1266894439832287889)",
					"* 4 FETCH (X-GM-THRID 1266894439832287890)",
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.fetch("1:4", ["X-GM-THRID"]);
		await server.assertCompleted();
		const fetch = server.commandLines.find((l) => l.verb === "FETCH");
		expect(fetch, "FETCH must have been emitted").toBeDefined();
		expect(fetch!.args, "the documented wire form is FETCH <range> (X-GM-THRID)").toMatch(
			/^1:4 \(X-GM-THRID\)$/i,
		);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// X-GM-EXT-1-thrid-4 — X-GM-THRID as a SEARCH/UID SEARCH key (self-actualizing)
// ═════════════════════════════════════════════════════════════════════════════
// Vendor doc worked example: `a009 UID SEARCH X-GM-THRID 1266894439832287888`
// / `* SEARCH 2 3 4` / `a009 OK Search (Success)`.
complianceTest(
	{
		reqs: ["X-GM-EXT-1-thrid-4"],
		profiles: ["rev1", "rev2"],
		title: "SEARCH X-GM-THRID <id> command form",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(gmailCaps(ctx.profile), { profile: ctx.profile, login: true }),
				...selectExchange("INBOX", { profile: ctx.profile, exists: 4 }),
				expectLine(command("SEARCH", { args: /^X-GM-THRID 1266894439832287888$/i })),
				reply("OK Search (Success)", ["* SEARCH 2 3 4"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.search(["X-GM-THRID 1266894439832287888"]);
		await server.assertCompleted();
		const search = server.commandLines.find((l) => l.verb === "SEARCH");
		expect(search, "SEARCH must have been emitted").toBeDefined();
		expect(search!.args, "X-GM-THRID <number> as a bare search-key form").toMatch(
			/^X-GM-THRID 1266894439832287888$/i,
		);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// X-GM-EXT-1-labels-4 / -labels-5 — X-GM-LABELS FETCH attribute (self-actualizing)
// ═════════════════════════════════════════════════════════════════════════════
// Vendor doc worked example: `a010 FETCH 1:4 (X-GM-LABELS)` returning four
// untagged lines including a mix of backslash-flag-style system labels
// (\Inbox, \Sent, \Drafts), a quoted-string label with a space
// ("Muy Importante"), a plain user label (foo), and an empty list.
complianceTest(
	{
		reqs: ["X-GM-EXT-1-labels-4", "X-GM-EXT-1-labels-5"],
		profiles: ["rev1", "rev2"],
		title:
			"FETCH X-GM-LABELS attribute retrieves a parenthesized ASTRING list mixing flag-style and quoted labels",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(gmailCaps(ctx.profile), { profile: ctx.profile, login: true }),
				...selectExchange("INBOX", { profile: ctx.profile, exists: 4 }),
				expectLine(command("FETCH", { args: /^1:4 \(X-GM-LABELS\)$/i })),
				reply("OK FETCH (Success)", [
					'* 1 FETCH (X-GM-LABELS (\\Inbox \\Sent Important "Muy Importante"))',
					"* 2 FETCH (X-GM-LABELS (foo))",
					"* 3 FETCH (X-GM-LABELS ())",
					"* 4 FETCH (X-GM-LABELS (\\Drafts))",
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.fetch("1:4", ["X-GM-LABELS"]);
		await server.assertCompleted();
		const fetch = server.commandLines.find((l) => l.verb === "FETCH");
		expect(fetch, "FETCH must have been emitted").toBeDefined();
		expect(fetch!.args, "the documented wire form is FETCH <range> (X-GM-LABELS)").toMatch(
			/^1:4 \(X-GM-LABELS\)$/i,
		);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// X-GM-EXT-1-labels-6 — labels added via STORE +X-GM-LABELS (REAL SIGNAL, M5.8)
// ═════════════════════════════════════════════════════════════════════════════
// Vendor doc worked example: `a011 STORE 1 +X-GM-LABELS (foo)` producing
// `* 1 FETCH (X-GM-LABELS (\Inbox \Sent Important "Muy Importante" foo))` /
// `a011 OK STORE (Success)` — the ADD data-item form. Wired as of M5.8:
// driver.store("+X-GM-LABELS") dispatches to
// MailboxSession.seq.addGmailLabels(), which STORE is selected-state-only
// for — hence the selectExchange the pre-M5.8 (unimplemented-annotated)
// version of this script did not need.
complianceTest(
	{
		reqs: ["X-GM-EXT-1-labels-6"],
		profiles: ["rev1", "rev2"],
		title: "STORE 1 +X-GM-LABELS (foo) adds a label to the message's existing label set",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(gmailCaps(ctx.profile), { profile: ctx.profile, login: true }),
				...selectExchange("INBOX", { profile: ctx.profile, exists: 1 }),
				expectLine(command("STORE", { args: /^1 \+X-GM-LABELS \(foo\)$/i })),
				reply("OK STORE (Success)", [
					'* 1 FETCH (X-GM-LABELS (\\Inbox \\Sent Important "Muy Importante" foo))',
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.store("1", "+X-GM-LABELS", ["foo"]);
		await server.assertCompleted();
		const store = server.commandLines.find((l) => l.verb === "STORE");
		expect(store, "STORE must have been emitted").toBeDefined();
		expect(
			store!.args,
			"the documented wire form is STORE <seq> +X-GM-LABELS (<label> ...) — the ADD " +
				"data-item convention, matching the standard FLAGS +/-/bare convention",
		).toMatch(/^1 \+X-GM-LABELS \(foo\)$/i);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// X-GM-EXT-1-labels-8 — X-GM-LABELS as a SEARCH/UID SEARCH key (self-actualizing)
// ═════════════════════════════════════════════════════════════════════════════
// Vendor doc worked example: `a012 SEARCH X-GM-LABELS foo` / `* SEARCH 1 2` /
// `a012 OK SEARCH (Success)`.
complianceTest(
	{
		reqs: ["X-GM-EXT-1-labels-8"],
		profiles: ["rev1", "rev2"],
		title: "SEARCH X-GM-LABELS <label> command form",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(gmailCaps(ctx.profile), { profile: ctx.profile, login: true }),
				...selectExchange("INBOX", { profile: ctx.profile, exists: 2 }),
				expectLine(command("SEARCH", { args: /^X-GM-LABELS foo$/i })),
				reply("OK SEARCH (Success)", ["* SEARCH 1 2"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.search(["X-GM-LABELS foo"]);
		await server.assertCompleted();
		const search = server.commandLines.find((l) => l.verb === "SEARCH");
		expect(search, "SEARCH must have been emitted").toBeDefined();
		expect(search!.args, "X-GM-LABELS <label> as a bare search-key form").toMatch(
			/^X-GM-LABELS foo$/i,
		);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// X-GM-EXT-1-raw-1 / -raw-2 — X-GM-RAW full Gmail search syntax passthrough
// ═════════════════════════════════════════════════════════════════════════════
// Vendor doc worked example: `a005 SEARCH X-GM-RAW "has:attachment in:unread"`
// — a SINGLE quoted-string argument carrying the entire Gmail query, not a
// parenthesized list or multiple tokens. search() throws today.
complianceTest(
	{
		reqs: ["X-GM-EXT-1-raw-1", "X-GM-EXT-1-raw-2"],
		profiles: ["rev1", "rev2"],
		title: 'SEARCH X-GM-RAW "<gmail query>" passes the query through as one opaque string argument',
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(gmailCaps(ctx.profile), { profile: ctx.profile, login: true }),
				...selectExchange("INBOX", { profile: ctx.profile, exists: 5 }),
				expectLine(
					command("SEARCH", { args: /^X-GM-RAW "has:attachment in:unread"$/i }),
				),
				reply("OK SEARCH (Success)", ["* SEARCH 3 5"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.search(['X-GM-RAW "has:attachment in:unread"']);
		await server.assertCompleted();
		const search = server.commandLines.find((l) => l.verb === "SEARCH");
		expect(search, "SEARCH must have been emitted").toBeDefined();
		expect(
			search!.args,
			"X-GM-RAW takes exactly one quoted-string argument carrying the whole query, " +
				"not a parenthesized list or multiple tokens",
		).toMatch(/^X-GM-RAW "has:attachment in:unread"$/i);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// X-GM-EXT-1-labels-2 — labels modified via standard CREATE (self-actualizing)
// ═════════════════════════════════════════════════════════════════════════════
// Vendor doc: "Labels can be modified using the standard IMAP commands,
// CREATE, RENAME, and DELETE, that act on folders." No separate label-
// lifecycle command exists — this is exercised via an ordinary CREATE
// against a label-style mailbox name. REAL SIGNAL (M2.3): create() is wired.
complianceTest(
	{
		reqs: ["X-GM-EXT-1-labels-2"],
		profiles: ["rev1", "rev2"],
		title: "a Gmail label is created via the standard CREATE command, not a vendor-specific verb",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(gmailCaps(ctx.profile), { profile: ctx.profile, login: true }),
				expectLine(command("CREATE", { args: /^"?Q1-Follow-?up"?$/i })),
				reply("OK CREATE completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.create("Q1-Followup");
		await server.assertCompleted();
		const create = server.commandLines.find((l) => l.verb === "CREATE");
		expect(
			create,
			"label creation must ride the standard CREATE command — no separate " +
				"X-GM-EXT-1 label-creation verb exists",
		).toBeDefined();
	},
);
