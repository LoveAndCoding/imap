/**
 * RFC 5465 — "The IMAP NOTIFY Extension" (capability 'NOTIFY').
 *
 * Testable catalog ids covered HERE (catalog/ext/rfc5465.ts; all dual-profile —
 * NOTIFY is standalone in rev2):
 *
 *   RFC5465-3.1-1   NOTIFY SET / NOTIFY NONE command forms (self-act.)
 *   RFC5465-3.1-2   Accept implicit-NOOP accumulated changes.
 *                                            *** REAL — connectLow parse path ***
 *   RFC5465-3.1-4   NOTIFY SET STATUS form + STATUS burst acceptance (self-act.)
 *   RFC5465-3.1-6   Accept untagged LIST with \NoAccess.   *** REAL — FlagList ***
 *   RFC5465-3.1-7   Accept tagged NO [NOTIFICATIONOVERFLOW].
 *                                            *** REAL — AtomTextCode fallback ***
 *   RFC5465-3.1-8   Accept tagged NO [BADEVENT (events)].  *** REAL — probed:
 *                   kind AND the parenthesized event list surface ***
 *   RFC5465-5-1     FlagChange/AnnotationChange ⇒ MessageNew+MessageExpunge
 *                   (self-act. composition rule)
 *   RFC5465-5-2     MessageNew ⇔ MessageExpunge together (self-act.)
 *   RFC5465-5-3     Suppression via the (mailboxes NONE) event specifier
 *                   (self-act.)
 *   RFC5465-5.1-1   Accept unsolicited FETCH (UID + FLAGS) between commands.
 *                                            *** REAL — fetch parse path ***
 *   RFC5465-5.2-1   Accept unsolicited EXISTS followed by FETCH. *** REAL ***
 *   RFC5465-5.2-2   Accept unsolicited STATUS for non-selected mailboxes.
 *                                            *** REAL — mailbox/status.ts ***
 *   RFC5465-5.2-3   SHOULD NOT request \Seen-setting / bodypart-presupposing
 *                   fetch-atts (self-act.)
 *   RFC5465-5.2-4   No '*' message references under SELECTED MessageNew
 *                   (self-act. negative guard)
 *   RFC5465-5.3-1   Accept unsolicited EXPUNGE between commands. *** REAL ***
 *   RFC5465-5.3-2   MSN prohibition — UID commands only (self-act.)
 *   RFC5465-5.4-1   Accept unsolicited LIST with \Nonexistent. *** REAL ***
 *   RFC5465-5.4-2   Accept extended LIST with OLDNAME. *** REAL VIOLATION —
 *                   probed: listing.ts throws on the trailing extended-data
 *                   group, the line is dropped AND the parse stream dies (a
 *                   trailing EXISTS never surfaces) ***
 *   RFC5465-5.5-1   Accept unsolicited LIST with \Subscribed. *** REAL ***
 *   RFC5465-5.8-1   Accept untagged OK [NOTIFICATIONOVERFLOW]. *** REAL ***
 *   RFC5465-6.1-1   At most one of SELECTED/SELECTED-DELAYED (self-act.)
 *   RFC5465-6.1-2   No non-message events under SELECTED/SELECTED-DELAYED
 *                   (self-act.)
 *   RFC5465-7-1     Extended UPDATE return option w/ fetch-atts (self-act.;
 *                   doubly conditional on CONTEXT=SEARCH)
 *   RFC5465-8-1     fetch-att list only under SELECTED/SELECTED-DELAYED
 *                   (self-act. negative guard)
 *
 * Untestable ids NOT cited (per catalog testability tags):
 *   RFC5465-3.1-3 (internal-decision: omitted-SELECTED semantics),
 *   RFC5465-3.1-5 (performance-expectation: limit-mailboxes advisory),
 *   RFC5465-5.8-2 (internal-state: post-overflow NOTIFY-NONE model).
 *
 * WIRE FORMS pinned by the self-actualizing matchers (RFC 5465 §8 ABNF):
 *   notify-set    → NOTIFY SET (SELECTED (MessageNew MessageExpunge))
 *                     (personal (MessageNew MessageExpunge MailboxName SubscriptionChange))
 *   notify-none   → NOTIFY NONE
 *   status-indicator → NOTIFY SET STATUS (personal (MessageNew MessageExpunge))
 *   events =/ NONE   → NOTIFY SET (SELECTED NONE)
 *   MessageNew fetch-atts → (SELECTED (MessageNew (UID FLAGS ENVELOPE
 *                     BODY.PEEK[HEADER.FIELDS (FROM TO SUBJECT)]) MessageExpunge))
 *   modifier-update  → SEARCH RETURN (COUNT UPDATE (UID BODY.PEEK[HEADER.FIELDS
 *                     (TO FROM SUBJECT)])) FROM "boss"        (§7, RFC's example)
 * Each matcher anchors the FULL argument string: NOTIFY SET without
 * parenthesized event-groups, an event list outside parens, a bare NONE group
 * without its mailbox specifier, or fetch-atts glued outside the MessageNew
 * parenthesis are rejected, never vacuously accepted.
 *
 * OBSERVATION SPLIT (REAL-signal-first, probed before writing):
 *  - The unsolicited responses NOTIFY unleashes (FETCH/EXISTS/EXPUNGE/STATUS/
 *    LIST) and both NOTIFICATIONOVERFLOW forms plus BADEVENT all have REAL
 *    parse paths; those tests run genuinely via connectLow() and assert parsed
 *    VALUES (uid/flags/counts/code kinds), with a trailing sentinel proving
 *    stream survival. FlagList exposes \NoAccess/\Nonexistent/\Subscribed via
 *    .has() (probed).
 *  - PROBED CLIENT FINDING encoded here: '* LIST () "/" "NewMailbox"
 *    ("OLDNAME" ("OldMailbox"))' is DROPPED (MailboxListing takes every token
 *    after the separator as the name and getAStringValue throws on the group)
 *    and the parse stream DIES — no LIST event, and a trailing '* 7 EXISTS'
 *    never surfaces. RFC5465-5.4-2 is an honest violation (same failure class
 *    as the RFC7162-3.1.9-1 SORT finding).
 *  - Command-emission duties have no implemented surface: driver.notify()/
 *    search()/fetch() throw NotImplementedError → honest "unimplemented" with
 *    the exact wire form pinned. driver.login() is deliberately un-caught in
 *    the negative-guard tests so they cannot pass vacuously on inability.
 */
import { expect } from "vitest";

import type { ObservedEvent } from "../../driver/driver";
import { command } from "../../harness/matchers";
import { close, expectLine, reply, send } from "../../harness/script";
import { complianceTest } from "../../runner/compliance-test";
import { waitForUntagged } from "../../runner/events";
import { useComplianceFixture } from "../../runner/fixture";
import { selectExchange, sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

// ── shared event-shape helpers (condstore-7162 pattern) ─────────────────────
function contentOf<T>(ev: ObservedEvent): T {
	return ((ev.detail as { content?: unknown } | undefined)?.content ?? {}) as T;
}
interface StatusContent {
	status?: string;
	text?: { code?: { kind?: string; contents?: string[] }; content?: string };
}
function statusEvents(driver: { events: ObservedEvent[] }): StatusContent[] {
	return driver.events
		.filter((e) => e.type === "serverStatus")
		.map((e) => (e.detail as { content?: StatusContent } | undefined)?.content ?? {});
}
interface TaggedContent {
	tag?: { id?: string };
	status?: StatusContent;
}
function taggedEvents(driver: { events: ObservedEvent[] }): TaggedContent[] {
	return driver.events
		.filter((e) => e.type === "taggedResponse")
		.map((e) => (e.detail ?? {}) as TaggedContent);
}
async function pollFor(
	predicate: () => boolean,
	timeoutMs = 800,
	intervalMs = 10,
): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		if (predicate()) return true;
		if (Date.now() >= deadline) return false;
		await new Promise<void>((r) => setTimeout(r, intervalMs));
	}
}

interface ParsedFlags {
	has(name: string): boolean;
}
interface ParsedFetch {
	sequenceNumber?: number;
	uid?: { id?: number };
	flags?: ParsedFlags;
}
interface ParsedList {
	name?: string;
	separator?: string;
	flags?: ParsedFlags;
}
interface ParsedStatus {
	name?: string;
	uidnext?: number;
	messages?: number;
}

// Per-profile capability sets for driven (command-emission) scenarios.
function notifyCaps(profile: string, extra: string[] = []): string[] {
	return profile === "rev2"
		? ["IMAP4rev2", "LITERAL-", "NOTIFY", ...extra]
		: ["IMAP4rev1", "NOTIFY", ...extra];
}

// Opens a connectLow session against a script of unsolicited lines followed by
// a '* 7 EXISTS' survival sentinel; returns the driver after script completion.
async function unsolicited(lines: string[]) {
	const server = await f.startServer();
	server.arm([
		[
			send("* OK ready\r\n"),
			...lines.map((l) => send(`${l}\r\n`)),
			send("* 7 EXISTS\r\n"),
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
	return driver;
}

// ═════════════════════════════════════════════════════════════════════════════
// RFC5465-3.1-2 — accept implicit-NOOP accumulated changes (REAL)
// ═════════════════════════════════════════════════════════════════════════════
// A client issuing NOTIFY SET with a mailbox selected must tolerate untagged
// FETCH/EXISTS/EXPUNGE interleaved before the tagged OK, exactly as for a
// NOOP. The acceptance core — that burst arriving without any command in
// progress — is exercised genuinely via connectLow. Non-vacuous: every line's
// parsed values must surface and the sentinel proves stream survival.
complianceTest(
	{
		reqs: ["RFC5465-3.1-2"],
		profiles: ["rev1", "rev2"],
		title: "client accepts an implicit-NOOP burst of accumulated FETCH/EXISTS/EXPUNGE changes",
		timeout: 5000,
	},
	async () => {
		const driver = await unsolicited([
			"* 5 EXISTS",
			"* 2 EXPUNGE",
			"* 2 FETCH (FLAGS (\\Answered))",
		]);
		await waitForUntagged(driver, "FETCH");
		await waitForUntagged(driver, "EXISTS");
		const expunge = contentOf<{ sequenceNumber?: number }>(
			await waitForUntagged(driver, "EXPUNGE"),
		);
		expect(expunge.sequenceNumber).toBe(2);
		const fetch = contentOf<ParsedFetch>(await waitForUntagged(driver, "FETCH"));
		expect(fetch.sequenceNumber).toBe(2);
		expect(fetch.flags?.has("\\Answered")).toBe(true);
		const existsCounts = driver.events
			.filter(
				(e) =>
					e.type === "untaggedResponse" &&
					(e.detail as { type?: string })?.type === "EXISTS",
			)
			.map((e) => contentOf<{ count?: number }>(e).count);
		expect(existsCounts).toEqual([5, 7]);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5465-5.1-1 — accept unsolicited FETCH (UID + FLAGS) between commands (REAL)
// ═════════════════════════════════════════════════════════════════════════════
// §5.1: a FlagChange in the selected mailbox arrives as an unsolicited FETCH
// carrying UID and FLAGS — the RFC's own example values ('* 99 FETCH (UID 9999
// FLAGS ($Junk))'). Keyword flags surface via FlagList.has (probed).
complianceTest(
	{
		reqs: ["RFC5465-5.1-1"],
		profiles: ["rev1", "rev2"],
		title: "client accepts an unsolicited FETCH with UID and keyword FLAGS outside any command",
		timeout: 5000,
	},
	async () => {
		const driver = await unsolicited(["* 99 FETCH (UID 9999 FLAGS ($Junk))"]);
		const fetch = contentOf<ParsedFetch>(await waitForUntagged(driver, "FETCH"));
		await waitForUntagged(driver, "EXISTS");
		expect(fetch.sequenceNumber).toBe(99);
		expect(fetch.uid?.id).toBe(9999);
		expect(fetch.flags?.has("$Junk")).toBe(true);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5465-5.2-1 — accept unsolicited EXISTS followed by FETCH (REAL)
// ═════════════════════════════════════════════════════════════════════════════
// §5.2: a MessageNew in the selected mailbox arrives as an unsolicited EXISTS
// then an unsolicited FETCH with the requested attributes (RFC example: '* 444
// EXISTS' + '* 444 FETCH (UID 9999)').
complianceTest(
	{
		reqs: ["RFC5465-5.2-1"],
		profiles: ["rev1", "rev2"],
		title: "client accepts the MessageNew EXISTS-then-FETCH unsolicited sequence",
		timeout: 5000,
	},
	async () => {
		const driver = await unsolicited(["* 444 EXISTS", "* 444 FETCH (UID 9999)"]);
		const fetch = contentOf<ParsedFetch>(await waitForUntagged(driver, "FETCH"));
		expect(fetch.sequenceNumber).toBe(444);
		expect(fetch.uid?.id).toBe(9999);
		const existsCounts = driver.events
			.filter(
				(e) =>
					e.type === "untaggedResponse" &&
					(e.detail as { type?: string })?.type === "EXISTS",
			)
			.map((e) => contentOf<{ count?: number }>(e).count);
		// The new-message EXISTS parsed (and the survival sentinel followed).
		expect(existsCounts).toEqual([444, 7]);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5465-5.2-2 — accept unsolicited STATUS for non-selected mailboxes (REAL)
// ═════════════════════════════════════════════════════════════════════════════
// §5.2 (and the parallel §5.1/§5.3 branches, scored once here): events in a
// NON-selected watched mailbox arrive as unsolicited STATUS responses for
// mailboxes the client never named in a STATUS command. RFC example values.
complianceTest(
	{
		reqs: ["RFC5465-5.2-2"],
		profiles: ["rev1", "rev2"],
		title: "client accepts an unsolicited STATUS (UIDNEXT MESSAGES) for a never-requested mailbox",
		timeout: 5000,
	},
	async () => {
		const driver = await unsolicited([
			'* STATUS "Lists/Lemonade" (UIDNEXT 10002 MESSAGES 503)',
		]);
		const status = contentOf<ParsedStatus>(await waitForUntagged(driver, "STATUS"));
		await waitForUntagged(driver, "EXISTS");
		// (The client currently surfaces the name with its quoting intact — the
		// values are the acceptance observable.)
		// TODO(name-fidelity): toContain deliberately tolerates the undequoted
		// STATUS mailbox name (`"Lists/Lemonade"` with quotes). The acceptance
		// duty is value-proven by UIDNEXT/MESSAGES below, but this leniency
		// papers over a real dequoting quirk — tighten to toBe("Lists/Lemonade")
		// once the client dequotes STATUS names, or add a name-fidelity leg.
		expect(status.name).toContain("Lists/Lemonade");
		expect(status.uidnext).toBe(10002);
		expect(status.messages).toBe(503);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5465-5.3-1 — accept unsolicited EXPUNGE between commands (REAL)
// ═════════════════════════════════════════════════════════════════════════════
// §5.3: a MessageExpunge in the selected mailbox arrives as an unsolicited
// EXPUNGE (RFC example '* 444 EXPUNGE') outside any command in progress.
complianceTest(
	{
		reqs: ["RFC5465-5.3-1"],
		profiles: ["rev1", "rev2"],
		title: "client accepts an unsolicited EXPUNGE outside any command",
		timeout: 5000,
	},
	async () => {
		const driver = await unsolicited(["* 444 EXPUNGE"]);
		const expunge = contentOf<{ sequenceNumber?: number }>(
			await waitForUntagged(driver, "EXPUNGE"),
		);
		await waitForUntagged(driver, "EXISTS");
		expect(expunge.sequenceNumber).toBe(444);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5465-3.1-6 — accept untagged LIST with \NoAccess (REAL)
// ═════════════════════════════════════════════════════════════════════════════
// §3.1: a NOTIFY naming a mailbox the client may LIST but not monitor draws an
// untagged extended LIST response with the \NoAccess name attribute (§8:
// mbx-list-oflag =/ "\NoAccess"). The non-RFC3501 attribute must parse and be
// exposed, not choke the stream.
complianceTest(
	{
		reqs: ["RFC5465-3.1-6"],
		profiles: ["rev1", "rev2"],
		title: "client accepts an untagged LIST carrying the \\NoAccess name attribute",
		timeout: 5000,
	},
	async () => {
		const driver = await unsolicited(['* LIST (\\NoAccess) "/" "SharedStuff"']);
		const list = contentOf<ParsedList>(await waitForUntagged(driver, "LIST"));
		await waitForUntagged(driver, "EXISTS");
		expect(list.name).toBe("SharedStuff");
		expect(list.flags?.has("\\NoAccess")).toBe(true);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5465-5.4-1 — accept unsolicited LIST with \Nonexistent (REAL)
// ═════════════════════════════════════════════════════════════════════════════
// §5.4: a MailboxName event for a now-inaccessible name arrives as an
// unsolicited LIST including the \Nonexistent attribute (RFC example: '* LIST
// (\NonExistent) "." "INBOX.DeletedMailbox"').
complianceTest(
	{
		reqs: ["RFC5465-5.4-1"],
		profiles: ["rev1", "rev2"],
		title: "client accepts an unsolicited LIST carrying the \\NonExistent name attribute",
		timeout: 5000,
	},
	async () => {
		const driver = await unsolicited(['* LIST (\\NonExistent) "." "INBOX.DeletedMailbox"']);
		const list = contentOf<ParsedList>(await waitForUntagged(driver, "LIST"));
		await waitForUntagged(driver, "EXISTS");
		expect(list.name).toBe("INBOX.DeletedMailbox");
		expect(list.separator).toBe(".");
		expect(list.flags?.has("\\NonExistent")).toBe(true);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5465-5.5-1 — accept unsolicited LIST with \Subscribed (REAL)
// ═════════════════════════════════════════════════════════════════════════════
// §5.5: a SubscriptionChange event arrives as an unsolicited LIST (not LSUB)
// whose \Subscribed presence/absence carries the subscription state.
complianceTest(
	{
		reqs: ["RFC5465-5.5-1"],
		profiles: ["rev1", "rev2"],
		title: "client accepts an unsolicited LIST carrying the \\Subscribed attribute",
		timeout: 5000,
	},
	async () => {
		const driver = await unsolicited(['* LIST (\\Subscribed) "/" SubscribedMailbox']);
		const list = contentOf<ParsedList>(await waitForUntagged(driver, "LIST"));
		await waitForUntagged(driver, "EXISTS");
		expect(list.name).toBe("SubscribedMailbox");
		expect(list.flags?.has("\\Subscribed")).toBe(true);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5465-5.4-2 — accept extended LIST with OLDNAME (REAL — HONEST VIOLATION)
// ═════════════════════════════════════════════════════════════════════════════
// §5.4: each renamed mailbox draws an RFC 5258 extended LIST response for the
// NEW name carrying the OLDNAME extended data item (§8: oldname-extended-item
// = "OLDNAME" SP "(" mailbox ")"). §3 makes the extended shape unconditional
// on LIST-EXTENDED advertisement. PROBED BEFORE WRITING: MailboxListing takes
// every token after the separator as the mailbox name, getAStringValue throws
// on the trailing ("OLDNAME" ("OldMailbox")) group, the line is silently
// dropped AND the parse stream dies — no LIST event, and a trailing '* 7
// EXISTS' never surfaces (the client goes deaf). The assertions encode the
// SPEC (accept + survive), so this test fails today as an honest violation.
complianceTest(
	{
		reqs: ["RFC5465-5.4-2"],
		profiles: ["rev1", "rev2"],
		title: "client accepts the extended LIST response carrying the OLDNAME data item",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				// RFC 5465 §5.4's rename response shape.
				send('* LIST () "/" "NewMailbox" ("OLDNAME" ("OldMailbox"))\r\n'),
				send("* 7 EXISTS\r\n"),
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
		// SPEC: the extended LIST must be parsed and surfaced for the NEW name.
		const listEvent = await waitForUntagged(driver, "LIST", { timeoutMs: 600 }).catch(
			() => undefined,
		);
		expect(
			listEvent,
			"a '* LIST () \"/\" \"NewMailbox\" (\"OLDNAME\" (\"OldMailbox\"))' response must be " +
				"accepted (RFC 5465 §5.4 / RFC 5258) — the client currently throws ParsingError " +
				"on the extended data item and drops the line",
		).toBeDefined();
		const parsed = contentOf<ParsedList>(listEvent!);
		expect(parsed.name).toBe("NewMailbox");
		// SPEC: the response stream must survive the line — the client must not go
		// deaf. Probed: the trailing EXISTS is currently lost too.
		const exists = await waitForUntagged(driver, "EXISTS", { timeoutMs: 400 }).catch(
			() => undefined,
		);
		expect(
			exists,
			"the response stream must survive an extended LIST response — responses after it must still parse",
		).toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5465-3.1-7 — accept a tagged NO [NOTIFICATIONOVERFLOW] refusal (REAL)
// ═════════════════════════════════════════════════════════════════════════════
// §3.1: the server MAY refuse a prohibitively expensive NOTIFY with a tagged
// NO [NOTIFICATIONOVERFLOW]; the client must treat it as a well-formed
// refusal, not a protocol error. Probed: the code surfaces via the
// AtomTextCode fallback with its kind intact.
complianceTest(
	{
		reqs: ["RFC5465-3.1-7"],
		profiles: ["rev1", "rev2"],
		title: "client accepts a tagged NO [NOTIFICATIONOVERFLOW] as a clean command refusal",
		timeout: 5000,
	},
	async () => {
		const driver = await unsolicited(["a1 NO [NOTIFICATIONOVERFLOW] Too much"]);
		const found = await pollFor(() =>
			taggedEvents(driver).some(
				(t) =>
					t.tag?.id === "a1" &&
					t.status?.status === "NO" &&
					t.status?.text?.code?.kind === "NOTIFICATIONOVERFLOW",
			),
		);
		expect(
			found,
			"the tagged NO must surface with a parsed NOTIFICATIONOVERFLOW resp-code",
		).toBe(true);
		// Stream survival past the refusal.
		await waitForUntagged(driver, "EXISTS");
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5465-5.8-1 — accept the untagged OK [NOTIFICATIONOVERFLOW] disable (REAL)
// ═════════════════════════════════════════════════════════════════════════════
// §5.8: after a previously successful NOTIFY SET the server may disable
// notifications by sending an untagged 'OK [NOTIFICATIONOVERFLOW]' at ANY
// time. Distinct from the §3.1 tagged-NO refusal above.
complianceTest(
	{
		reqs: ["RFC5465-5.8-1"],
		profiles: ["rev1", "rev2"],
		title: "client accepts an untagged OK [NOTIFICATIONOVERFLOW] arriving between commands",
		timeout: 5000,
	},
	async () => {
		const driver = await unsolicited(["* OK [NOTIFICATIONOVERFLOW] Notifications disabled"]);
		const found = await pollFor(() =>
			statusEvents(driver).some(
				(c) => c.status === "OK" && c.text?.code?.kind === "NOTIFICATIONOVERFLOW",
			),
		);
		expect(
			found,
			"an untagged OK [NOTIFICATIONOVERFLOW] must surface as a parsed resp-code, not be dropped",
		).toBe(true);
		await waitForUntagged(driver, "EXISTS");
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5465-3.1-8 — accept a tagged NO [BADEVENT (events)] (REAL)
// ═════════════════════════════════════════════════════════════════════════════
// §3.1/§8: unsupported-events-code = "BADEVENT" SP "(" event-name *(SP
// event-name) ")". The NO-not-BAD refusal must parse, including the supported
// event-name list. Probed: kind AND the list contents surface.
complianceTest(
	{
		reqs: ["RFC5465-3.1-8"],
		profiles: ["rev1", "rev2"],
		title: "client accepts a tagged NO [BADEVENT (MessageNew MessageExpunge)] listing supported events",
		timeout: 5000,
	},
	async () => {
		const driver = await unsolicited([
			"a1 NO [BADEVENT (MessageNew MessageExpunge)] Unsupported event",
		]);
		const found = await pollFor(() => taggedEvents(driver).length >= 1);
		expect(found, "the tagged NO [BADEVENT ...] must surface").toBe(true);
		const [no] = taggedEvents(driver);
		expect(no.status?.status).toBe("NO");
		expect(no.status?.text?.code?.kind).toBe("BADEVENT");
		// The supported-event list must be exposed, not dropped.
		expect(no.status?.text?.code?.contents).toEqual(["MessageNew", "MessageExpunge"]);
		await waitForUntagged(driver, "EXISTS");
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5465-3.1-1 — NOTIFY SET command form (self-actualizing)
// ═════════════════════════════════════════════════════════════════════════════
// §8: notify-set = "SET" [status-indicator] SP event-groups; event-group =
// "(" filter-mailboxes SP events ")". The anchored matcher rejects a SET with
// unparenthesized groups, an event list outside its parens, or a missing
// mailbox specifier. notify() throws → unimplemented.
complianceTest(
	{
		reqs: ["RFC5465-3.1-1"],
		profiles: ["rev1", "rev2"],
		title: "NOTIFY SET command form with parenthesized event-groups",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(notifyCaps(ctx.profile), { profile: ctx.profile, login: true }),
				expectLine(
					command("NOTIFY", {
						args: /^SET \(SELECTED \(MessageNew MessageExpunge\)\) \(personal \(MessageNew MessageExpunge MailboxName SubscriptionChange\)\)$/i,
					}),
				),
				reply("OK NOTIFY completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		await driver.notify({
			set: [
				{ mailboxes: "SELECTED", events: ["MessageNew", "MessageExpunge"] },
				{
					mailboxes: "personal",
					events: ["MessageNew", "MessageExpunge", "MailboxName", "SubscriptionChange"],
				},
			],
		});
		await server.assertCompleted();
		const notify = server.commandLines.find((l) => l.verb === "NOTIFY");
		expect(notify, "NOTIFY must have been emitted").toBeDefined();
		expect(notify!.args, "every event-group must be parenthesized").toMatch(
			/^SET (\([^)]+\([^)]+\)\) ?)+$/i,
		);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5465-3.1-1 — NOTIFY NONE command form (self-actualizing)
// ═════════════════════════════════════════════════════════════════════════════
// §8: notify-none = "NONE" — the bare atom, no groups, nothing else.
complianceTest(
	{
		reqs: ["RFC5465-3.1-1"],
		profiles: ["rev1", "rev2"],
		title: "NOTIFY NONE command form",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(notifyCaps(ctx.profile), { profile: ctx.profile, login: true }),
				expectLine(command("NOTIFY", { args: /^NONE$/i })),
				reply("OK NOTIFY completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		await driver.notify({ none: true });
		await server.assertCompleted();
		const notify = server.commandLines.find((l) => l.verb === "NOTIFY");
		expect(notify, "NOTIFY must have been emitted").toBeDefined();
		expect(notify!.args).toMatch(/^NONE$/i);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5465-3.1-4 — NOTIFY SET STATUS form + pre-OK STATUS acceptance
// ═════════════════════════════════════════════════════════════════════════════
// §3.1/§8 status-indicator: 'SET STATUS' asks the server to send one STATUS
// response per watched non-selected mailbox BEFORE the tagged OK; the client
// must both emit the indicator in place and accept the burst. notify() throws
// today → unimplemented; completing the exchange (STATUS lines consumed, OK
// reached) is the acceptance observable.
complianceTest(
	{
		reqs: ["RFC5465-3.1-4"],
		profiles: ["rev1", "rev2"],
		title: "NOTIFY SET STATUS form; client accepts the STATUS burst before the tagged OK",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(notifyCaps(ctx.profile), { profile: ctx.profile, login: true }),
				expectLine(
					command("NOTIFY", {
						args: /^SET STATUS \(personal \(MessageNew MessageExpunge\)\)$/i,
					}),
				),
				// One STATUS per watched non-selected mailbox, then the tagged OK.
				reply("OK NOTIFY completed", [
					'* STATUS "Lists/Lemonade" (UIDNEXT 10002 MESSAGES 503 UIDVALIDITY 1)',
					"* STATUS misc (UIDNEXT 999 MESSAGES 42 UIDVALIDITY 2)",
				]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		await driver.notify({
			status: true,
			set: [{ mailboxes: "personal", events: ["MessageNew", "MessageExpunge"] }],
		});
		await server.assertCompleted();
		const notify = server.commandLines.find((l) => l.verb === "NOTIFY");
		expect(notify, "NOTIFY must have been emitted").toBeDefined();
		expect(notify!.args, "the STATUS indicator rides between SET and the groups").toMatch(
			/^SET STATUS \(/i,
		);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5465-5-1 — FlagChange requires MessageNew AND MessageExpunge
// ═════════════════════════════════════════════════════════════════════════════
// §5: 'If the FlagChange and/or AnnotationChange events are specified,
// MessageNew and MessageExpunge MUST also be specified by the client' — one of
// the document's few direct client MUSTs. The anchored matcher pins the
// complete triple; the transcript guard additionally rejects ANY event list
// containing FlagChange without both companions.
complianceTest(
	{
		reqs: ["RFC5465-5-1"],
		profiles: ["rev1", "rev2"],
		title: "an event list containing FlagChange also contains MessageNew and MessageExpunge",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(notifyCaps(ctx.profile), { profile: ctx.profile, login: true }),
				expectLine(
					command("NOTIFY", {
						args: /^SET \(SELECTED \(MessageNew MessageExpunge FlagChange\)\)$/i,
					}),
				),
				reply("OK NOTIFY completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		// The caller asks for flag-change monitoring; the client's emitted list
		// must carry the mandatory message-event companions.
		await driver.notify({
			set: [{ mailboxes: "SELECTED", events: ["MessageNew", "MessageExpunge", "FlagChange"] }],
		});
		await server.assertCompleted();
		const lines = server.transcript.clientLines();
		// No parenthesized event list anywhere may contain FlagChange while
		// missing MessageNew or MessageExpunge.
		expect(lines).not.toMatch(
			/\((?=[^()]*\bFlagChange\b)(?![^()]*\bMessageNew\b)[^()]*\)|\((?=[^()]*\bFlagChange\b)(?![^()]*\bMessageExpunge\b)[^()]*\)/i,
		);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5465-5-2 — MessageNew and MessageExpunge always together
// ═════════════════════════════════════════════════════════════════════════════
// §5: 'If one of MessageNew or MessageExpunge is specified, then both events
// MUST be specified.' The guard rejects any event list carrying exactly one.
complianceTest(
	{
		reqs: ["RFC5465-5-2"],
		profiles: ["rev1", "rev2"],
		title: "no event list contains exactly one of MessageNew/MessageExpunge",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(notifyCaps(ctx.profile), { profile: ctx.profile, login: true }),
				expectLine(
					command("NOTIFY", {
						args: /^SET \(SELECTED \(MessageNew MessageExpunge\)\)$/i,
					}),
				),
				reply("OK NOTIFY completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		await driver.notify({
			set: [{ mailboxes: "SELECTED", events: ["MessageNew", "MessageExpunge"] }],
		});
		await server.assertCompleted();
		const lines = server.transcript.clientLines();
		expect(lines).not.toMatch(
			/\((?=[^()]*\bMessageNew\b)(?![^()]*\bMessageExpunge\b)[^()]*\)|\((?=[^()]*\bMessageExpunge\b)(?![^()]*\bMessageNew\b)[^()]*\)/i,
		);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5465-5-3 — suppression via the (mailboxes NONE) event specifier
// ═════════════════════════════════════════════════════════════════════════════
// §5/§8 events =/ "NONE": suppression intent for one mailbox group is encoded
// as the bare NONE specifier inside the group ('(SELECTED NONE)' — the RFC's
// snapshot facility). The anchored matcher rejects a parenthesized NONE, a
// group without its mailbox specifier, or extra content.
complianceTest(
	{
		reqs: ["RFC5465-5-3"],
		profiles: ["rev1", "rev2"],
		title: "event suppression is encoded as the (SELECTED NONE) event-group form",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(notifyCaps(ctx.profile), { profile: ctx.profile, login: true }),
				expectLine(
					command("NOTIFY", {
						args: /^SET \(SELECTED NONE\) \(personal \(MessageNew MessageExpunge\)\)$/i,
					}),
				),
				reply("OK NOTIFY completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		await driver.notify({
			set: [
				{ mailboxes: "SELECTED", events: "NONE" },
				{ mailboxes: "personal", events: ["MessageNew", "MessageExpunge"] },
			],
		});
		await server.assertCompleted();
		const notify = server.commandLines.find((l) => l.verb === "NOTIFY");
		expect(notify, "NOTIFY must have been emitted").toBeDefined();
		expect(notify!.args, "NONE is a bare specifier inside the group").toMatch(
			/\(SELECTED NONE\)/i,
		);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5465-6.1-1 — at most one of SELECTED / SELECTED-DELAYED per command
// ═════════════════════════════════════════════════════════════════════════════
// §6.1/§8: 'Only one of them can be specified in a NOTIFY command.' The caller
// asks for BOTH; the client must refuse locally or drop one — the transcript
// may never carry event-groups naming both. notify() still throws
// NotImplementedError (caught below), so the transcript guard is the real
// (if currently vacuous) check.
complianceTest(
	{
		reqs: ["RFC5465-6.1-1"],
		profiles: ["rev1", "rev2"],
		title: "client never emits both SELECTED and SELECTED-DELAYED groups in one NOTIFY",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(notifyCaps(ctx.profile), { profile: ctx.profile, login: true }),
				// If the client (compliantly) proceeds with a reduced NOTIFY, accept it.
				expectLine(command("NOTIFY")),
				reply("OK NOTIFY completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver
			.notify({
				set: [
					{ mailboxes: "SELECTED", events: ["MessageNew", "MessageExpunge"] },
					{ mailboxes: "SELECTED-DELAYED", events: ["MessageNew", "MessageExpunge"] },
				],
			})
			.catch(() => undefined);
		const lines = server.transcript.clientLines();
		const both = /\(SELECTED /i.test(lines) && /\(SELECTED-DELAYED /i.test(lines);
		expect(
			both,
			"a single NOTIFY command may name at most one selected-family specifier (RFC 5465 §6.1)",
		).toBe(false);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5465-6.1-2 — no non-message events under SELECTED/SELECTED-DELAYED
// ═════════════════════════════════════════════════════════════════════════════
// §6.1: 'It is an error to specify other types of events with either the
// SELECTED or the SELECTED-DELAYED selector.' The caller asks for MailboxName
// under SELECTED; the transcript may never carry a selected-family group
// containing a non-message event.
complianceTest(
	{
		reqs: ["RFC5465-6.1-2"],
		profiles: ["rev1", "rev2"],
		title: "client never pairs non-message events with the SELECTED/SELECTED-DELAYED selector",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(notifyCaps(ctx.profile), { profile: ctx.profile, login: true }),
				expectLine(command("NOTIFY")),
				reply("OK NOTIFY completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver
			.notify({
				set: [
					{
						mailboxes: "SELECTED",
						events: ["MessageNew", "MessageExpunge", "MailboxName"],
					},
				],
			})
			.catch(() => undefined);
		expect(
			server.transcript.clientLines(),
			"a SELECTED/SELECTED-DELAYED group may carry only <message-event>s (RFC 5465 §6.1)",
		).not.toMatch(
			/\(SELECTED(?:-DELAYED)? \([^)]*(MailboxName|SubscriptionChange|MailboxMetadataChange|ServerMetadataChange)/i,
		);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5465-8-1 — fetch-att list only under SELECTED/SELECTED-DELAYED
// ═════════════════════════════════════════════════════════════════════════════
// §8 ABNF comment on message-event: the optional MessageNew fetch-att
// parenthesis 'may only be present for the SELECTED/SELECTED-DELAYED mailbox
// filter'. The caller asks for fetch-atts on a personal group; the client must
// refuse locally or strip them — the transcript may never carry 'MessageNew ('
// inside a non-selected event-group.
complianceTest(
	{
		reqs: ["RFC5465-8-1"],
		profiles: ["rev1", "rev2"],
		title: "client never attaches MessageNew fetch-atts inside a non-SELECTED event group",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(notifyCaps(ctx.profile), { profile: ctx.profile, login: true }),
				expectLine(command("NOTIFY")),
				reply("OK NOTIFY completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver
			.notify({
				set: [
					{
						mailboxes: "personal",
						events: [
							{ event: "MessageNew", fetchAtts: ["UID", "FLAGS"] },
							"MessageExpunge",
						],
					},
				],
			})
			.catch(() => undefined);
		expect(
			server.transcript.clientLines(),
			"the fetch-att parenthesis may only appear under SELECTED/SELECTED-DELAYED (RFC 5465 §8)",
		).not.toMatch(
			/\((?:personal|inboxes|subscribed|subtree|mailboxes)[^(]*\([^)]*MessageNew \(/i,
		);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5465-5.2-3 — SHOULD NOT request \Seen-setting / bodypart fetch-atts
// ═════════════════════════════════════════════════════════════════════════════
// §5.2: the MessageNew fetch-att list should avoid attributes that implicitly
// set \Seen (unpeeked BODY[...]) or presuppose a bodypart (BODY.PEEK[2]). The
// anchored matcher pins the RFC-recommended safe list; the guards reject the
// two forbidden shapes anywhere in the transcript.
complianceTest(
	{
		reqs: ["RFC5465-5.2-3"],
		profiles: ["rev1", "rev2"],
		title: "MessageNew fetch-atts avoid unpeeked BODY sections and numbered part specifiers",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(notifyCaps(ctx.profile), { profile: ctx.profile, login: true }),
				// §3.1's example fetch-att list (safe: peeked header fields only).
				expectLine(
					command("NOTIFY", {
						args: /^SET \(SELECTED \(MessageNew \(UID FLAGS ENVELOPE BODY\.PEEK\[HEADER\.FIELDS \(FROM TO SUBJECT\)\]\) MessageExpunge\)\)$/i,
					}),
				),
				reply("OK NOTIFY completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		await driver.notify({
			set: [
				{
					mailboxes: "SELECTED",
					events: [
						{
							event: "MessageNew",
							fetchAtts: [
								"UID",
								"FLAGS",
								"ENVELOPE",
								"BODY.PEEK[HEADER.FIELDS (FROM TO SUBJECT)]",
							],
						},
						"MessageExpunge",
					],
				},
			],
		});
		await server.assertCompleted();
		const lines = server.transcript.clientLines();
		// No unpeeked BODY[...] (implicitly sets \Seen)…
		expect(lines).not.toMatch(/BODY\[/i);
		// …and no numbered part specifier (presupposes a bodypart's existence).
		expect(lines).not.toMatch(/BODY\.PEEK\[\d/i);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5465-5.2-4 — no '*' message references under SELECTED MessageNew
// ═════════════════════════════════════════════════════════════════════════════
// §5.2: with MessageNew active for the selected mailbox, the message count can
// change at any time, so '*' (and 'n:*') no longer denotes a specific message.
// The caller asks for a '3:*' fetch after the NOTIFY; the client must refuse
// locally or re-address — no '*' may reach the wire.
complianceTest(
	{
		reqs: ["RFC5465-5.2-4"],
		profiles: ["rev1", "rev2"],
		title: "client avoids '*' message references while SELECTED MessageNew is active",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(notifyCaps(ctx.profile), { profile: ctx.profile, login: true }),
				...selectExchange("INBOX", { exists: 3, profile: ctx.profile }),
				expectLine(
					command("NOTIFY", {
						args: /^SET \(SELECTED \(MessageNew MessageExpunge\)\)$/i,
					}),
				),
				reply("OK NOTIFY completed"),
				// A compliant re-addressed fetch (or none at all) is accepted.
				expectLine(command(/^(FETCH|UID|NOOP)$/)),
				reply("OK completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		await driver.select("INBOX");
		await driver.notify({
			set: [{ mailboxes: "SELECTED", events: ["MessageNew", "MessageExpunge"] }],
		});
		// The caller asks for a '*'-terminated range — it must not hit the wire.
		await driver.fetch("3:*", ["FLAGS"]).catch(() => undefined);
		expect(
			server.transcript.clientLines(),
			"no '*' message reference may be emitted while SELECTED MessageNew is active (RFC 5465 §5.2)",
		).not.toMatch(/\*/);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5465-5.3-2 — MSN prohibition: UID commands only after SELECTED expunges
// ═════════════════════════════════════════════════════════════════════════════
// §5.3: with immediate expunge notifications the meaning of an MSN can change
// between composing and parsing a command — 'such a client cannot use FETCH,
// but has to use UID FETCH'. The caller asks for a message-addressed fetch;
// the script only completes if it arrives as a UID command.
complianceTest(
	{
		reqs: ["RFC5465-5.3-2"],
		profiles: ["rev1", "rev2"],
		title: "client uses UID FETCH (not FETCH) while SELECTED MessageExpunge is active",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(notifyCaps(ctx.profile), { profile: ctx.profile, login: true }),
				...selectExchange("INBOX", { exists: 5, profile: ctx.profile }),
				expectLine(
					command("NOTIFY", {
						args: /^SET \(SELECTED \(MessageNew MessageExpunge\)\)$/i,
					}),
				),
				reply("OK NOTIFY completed"),
				// The message-addressed command MUST arrive as a UID command.
				expectLine(command("UID FETCH", { args: /\(FLAGS\)$/i })),
				reply("OK Fetch completed", ["* 1 FETCH (UID 1 FLAGS (\\Seen))"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		await driver.select("INBOX");
		await driver.notify({
			set: [{ mailboxes: "SELECTED", events: ["MessageNew", "MessageExpunge"] }],
		});
		await driver.fetch("1:5", ["FLAGS"]);
		await server.assertCompleted();
		// Non-vacuous: a UID FETCH was recorded and no bare FETCH ever was.
		expect(server.commandLines.some((l) => l.verb === "UID FETCH")).toBe(true);
		expect(server.commandLines.some((l) => l.verb === "FETCH")).toBe(false);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5465-7-1 — extended UPDATE return option with fetch-atts
// ═════════════════════════════════════════════════════════════════════════════
// §7/§8 modifier-update = "UPDATE" [ "(" fetch-att *(SP fetch-att) ")" ]: when
// the server also supports CONTEXT=SEARCH, the UPDATE return option may carry
// a parenthesized fetch-att list (the RFC's own example command). Doubly
// conditional — the capability list advertises NOTIFY + CONTEXT=SEARCH.
complianceTest(
	{
		reqs: ["RFC5465-7-1"],
		profiles: ["rev1", "rev2"],
		title: 'SEARCH RETURN (COUNT UPDATE (fetch-atts)) FROM "boss" command form',
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(notifyCaps(ctx.profile, ["CONTEXT=SEARCH"]), {
					profile: ctx.profile,
					login: true,
				}),
				...selectExchange("INBOX", { exists: 4, profile: ctx.profile }),
				// §7's example: fetch-atts parenthesized INSIDE the UPDATE option.
				expectLine(
					command("SEARCH", {
						args: /^RETURN \(COUNT UPDATE \(UID BODY\.PEEK\[HEADER\.FIELDS \(TO FROM SUBJECT\)\]\)\) FROM "boss"$/i,
					}),
				),
				reply("OK SEARCH completed", ["* ESEARCH (TAG \"a4\") COUNT 4"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass"); // throws NotImplementedError today
		await driver.select("INBOX");
		await driver.search([{ from: "boss" }], {
			return: ["COUNT", "UPDATE (UID BODY.PEEK[HEADER.FIELDS (TO FROM SUBJECT)])"],
		});
		await server.assertCompleted();
		const search = server.commandLines.find((l) => l.verb === "SEARCH");
		expect(search, "SEARCH must have been emitted").toBeDefined();
		expect(search!.args, "fetch-atts ride inside the UPDATE parenthesis").toMatch(
			/UPDATE \(/i,
		);
	},
);
