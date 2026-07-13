/**
 * RFC 5256 — "Internet Message Access Protocol - SORT and THREAD Extensions"
 * (capability tokens SORT, THREAD=ORDEREDSUBJECT, THREAD=REFERENCES).
 * Client-binding duties for the SORT/UID SORT and THREAD/UID THREAD command
 * forms and for accepting the untagged `* SORT` / `* THREAD` responses.
 *
 * Testable catalog ids covered here (see test/compliance/catalog/ext/rfc5256.ts):
 *
 *   RFC5256-1-2                Client uses only threading algorithms the server
 *                              advertises via THREAD=<alg>.
 *   RFC5256-BASE.6.4.SORT-1    SORT form: (criteria) charset search-keys.
 *   RFC5256-BASE.6.4.SORT-2    Charset argument is MANDATORY in SORT.
 *   RFC5256-BASE.6.4.SORT-3    US-ASCII/UTF-8 charset floor (emission labeling).
 *   RFC5256-BASE.6.4.SORT-4    UID SORT: same argument interpretation; UID results.
 *   RFC5256-BASE.6.4.SORT-5    Tolerate untagged EXPUNGE during a UID SORT.
 *   RFC5256-BASE.6.4.THREAD-1  THREAD form: algorithm charset search-keys.
 *   RFC5256-BASE.6.4.THREAD-2  Charset argument is MANDATORY in THREAD.
 *   RFC5256-BASE.6.4.THREAD-3  US-ASCII/UTF-8 charset floor for THREAD.
 *   RFC5256-BASE.6.4.THREAD-4  UID THREAD: same interpretation; UID results.
 *   RFC5256-BASE.6.4.THREAD-5  Tolerate untagged EXPUNGE during a UID THREAD.
 *   RFC5256-BASE.6.4.THREAD-6  SHOULD treat descendents of a child in an
 *                              ORDEREDSUBJECT response as siblings of that child.
 *   RFC5256-BASE.7.2.SORT-1    Accept `* SORT` with zero or more numbers.
 *                              *** REAL SIGNAL *** — src/parser/structure/sort.ts
 *                              parses the response (contrary to the Stage-B audit
 *                              expectation that no parse surface existed).
 *   RFC5256-BASE.7.2.THREAD-1  Accept `* THREAD` with zero or more threads.
 *                              *** REAL SIGNAL *** — src/parser/structure/thread.ts.
 *   RFC5256-BASE.7.2.THREAD-2  Parse thread nesting/sub-thread structure.
 *                              *** REAL VIOLATION *** — the parsed ThreadMessage's
 *                              only public accessor for descendents is a
 *                              self-referential getter (`get children() { return
 *                              this.children; }`), so reading the delivered
 *                              structure recurses infinitely (RangeError). The
 *                              thread tree is parsed but unrecoverable through
 *                              the public API.
 *   RFC5256-5-1                SORT grammar: defined criteria atoms only;
 *                              REVERSE prefixes a single sort-key.
 *   RFC5256-5-2                THREAD grammar: registered algorithm atom;
 *                              charset then one or more search keys.
 *
 * Untestable ids NOT cited (per the catalog module's testability tags):
 *   RFC5256-1-1   (capability-inventory — SORT-prefix family recognition),
 *   RFC5256-2.1-1 (content-processing — disconnected-client base-subject algo).
 *
 * COMMAND SYNTAX (RFC 5256 §5 ABNF):
 *   sort            = ["UID" SP] "SORT" SP sort-criteria SP search-criteria
 *   sort-criteria   = "(" sort-criterion *(SP sort-criterion) ")"
 *   sort-criterion  = ["REVERSE" SP] sort-key
 *   sort-key        = "ARRIVAL" / "CC" / "DATE" / "FROM" / "SIZE" / "SUBJECT" / "TO"
 *   thread          = ["UID" SP] "THREAD" SP thread-alg SP search-criteria
 *   thread-alg      = "ORDEREDSUBJECT" / "REFERENCES" / thread-alg-ext
 *   search-criteria = charset 1*(SP search-key)     ; charset is NOT optional
 * RESPONSE SYNTAX (§5):
 *   sort-data      = "SORT" *(SP nz-number)
 *   thread-data    = "THREAD" [SP 1*thread-list]
 *   thread-list    = "(" (thread-members / thread-nested) ")"
 *   thread-members = nz-number *(SP nz-number) [SP thread-nested]
 *   thread-nested  = 2*thread-list
 *
 * OBSERVATION SPLIT:
 *  - Command-emission duties have NO driver surface — driver.sort/uidSort/
 *    thread/uidThread() throw NotImplementedError → unimplemented. Matchers pin
 *    the exact wire forms (parenthesized non-empty criteria, mandatory charset,
 *    REVERSE prefixing a defined sort-key, bare algorithm atom) so they are
 *    non-vacuous once implemented: an unparenthesized criteria list, a missing
 *    charset (e.g. `SORT (SUBJECT) ALL`), a standalone REVERSE, or a
 *    parenthesized algorithm all fail the expectLine step.
 *  - Response-acceptance duties ARE genuinely exercisable: connectLow() opens
 *    the public Connection (issues no commands), and the parser routes
 *    `* SORT`/`* THREAD` to SortResponse{ids}/ThreadResponse{threads} surfaced
 *    as untaggedResponse events. BASE.7.2.SORT-1 / BASE.7.2.THREAD-1 run as
 *    REAL genuine-pass tests; BASE.7.2.THREAD-2 runs as a REAL honest violation
 *    (broken `children` accessor, see above).
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

// Parsed shapes surfaced on untaggedResponse events (read structurally so a
// wrong parse cannot pass). ThreadNode.children is the ONLY public accessor
// for a thread's descendents on the delivered object.
interface SortContent {
	ids?: number[];
}
interface ThreadNode {
	id?: number;
	children: ThreadNode[];
}
interface ThreadContent {
	threads?: ThreadNode[];
}
function contentOf<T>(ev: ObservedEvent): T {
	return ((ev.detail as { content?: unknown } | undefined)?.content ?? {}) as T;
}

// A charset argument may be emitted as a bare atom or a quoted string (§5:
// charset = atom / quoted).
const cs = (name: string) => `(?:${name}|"${name}")`;

// ═════════════════════════════════════════════════════════════════════════════
// RFC5256-BASE.7.2.SORT-1 — accept `* SORT` with space-delimited numbers (REAL)
// ═════════════════════════════════════════════════════════════════════════════
// The parser routes `* SORT n…` to SortResponse (src/parser/structure/sort.ts),
// which must preserve the server's sort order — the numbers arrive in sorted
// order, not numeric order. A trailing `* 7 EXISTS` proves the response stream
// survived the SORT line. Genuine outcome.
complianceTest(
	{
		reqs: ["RFC5256-BASE.7.2.SORT-1"],
		profiles: ["rev1", "rev2"],
		title: "client accepts an untagged SORT response, preserving the server's sort order",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				// sort-data = "SORT" *(SP nz-number) — deliberately NOT in numeric
				// order (5 3 4 1 2): the order IS the payload.
				send("* SORT 5 3 4 1 2\r\n"),
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
		const sortEvent = await waitForUntagged(driver, "SORT");
		await waitForUntagged(driver, "EXISTS");
		// Non-vacuous: the exact numbers in the exact wire order. A parser that
		// re-sorted, deduplicated, or dropped members fails here.
		const s = contentOf<SortContent>(sortEvent);
		expect(s.ids, "SORT response numbers must be delivered in server order").toEqual([
			5, 3, 4, 1, 2,
		]);
	},
);

// §3 example: 'S: * SORT' — the zero-match form is a bare `* SORT` with no
// numbers at all, and must parse as an empty result, not an error.
complianceTest(
	{
		reqs: ["RFC5256-BASE.7.2.SORT-1"],
		profiles: ["rev1", "rev2"],
		title: "client accepts a bare `* SORT` (zero matches) as an empty result",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				send("* SORT\r\n"),
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
		const sortEvent = await waitForUntagged(driver, "SORT");
		await waitForUntagged(driver, "EXISTS");
		const s = contentOf<SortContent>(sortEvent);
		expect(s.ids, "a no-match SORT response is an empty list, not an error").toEqual([]);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5256-BASE.7.2.THREAD-1 — accept `* THREAD` with parenthesized threads (REAL)
// ═════════════════════════════════════════════════════════════════════════════
// The parser routes `* THREAD (…)…` to ThreadResponse{threads}. This test
// asserts the RESPONSE SHAPE only (thread count + each thread's first member),
// which is reachable through the public `id` field; the nested structure duty
// is BASE.7.2.THREAD-2 below.
complianceTest(
	{
		reqs: ["RFC5256-BASE.7.2.THREAD-1"],
		profiles: ["rev1", "rev2"],
		title: "client accepts an untagged THREAD response of parenthesized threads",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				// The RFC §4's own example: two threads, the second with a
				// parent/child chain splitting into two sub-threads.
				send("* THREAD (2)(3 6 (4 23)(44 7 96))\r\n"),
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
		const threadEvent = await waitForUntagged(driver, "THREAD");
		await waitForUntagged(driver, "EXISTS");
		const t = contentOf<ThreadContent>(threadEvent);
		// Non-vacuous shape check: exactly two threads, rooted at 2 and 3.
		expect(t.threads?.length, "two parenthesized threads must be delivered").toBe(2);
		expect(t.threads?.[0].id).toBe(2);
		expect(t.threads?.[1].id).toBe(3);
	},
);

// §3 example: 'S: * THREAD' — the zero-match form is a bare `* THREAD`
// (thread-data = "THREAD" [SP 1*thread-list] — the whole list is optional).
complianceTest(
	{
		reqs: ["RFC5256-BASE.7.2.THREAD-1"],
		profiles: ["rev1", "rev2"],
		title: "client accepts a bare `* THREAD` (zero matches) as an empty result",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				send("* THREAD\r\n"),
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
		const threadEvent = await waitForUntagged(driver, "THREAD");
		await waitForUntagged(driver, "EXISTS");
		const t = contentOf<ThreadContent>(threadEvent);
		expect(t.threads, "a no-match THREAD response is an empty list, not an error").toEqual([]);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5256-BASE.7.2.THREAD-2 — parse nesting/sub-thread structure (REAL VIOLATION)
// ═════════════════════════════════════════════════════════════════════════════
// The full structural duty: parent/child chains, sub-thread splits with the
// first member of each sub-thread as siblings, unlimited nesting, and the
// `((3)(5))` missing-parent sibling form. The delivered ThreadMessage's ONLY
// public accessor for descendents is its `children` getter, which is
// self-referential in the client (`get children() { return this.children; }`)
// and recurses infinitely (RangeError) on first access — the parsed tree is
// unrecoverable through the public API, an honest violation of the acceptance
// duty (the client cannot deliver the structure it parsed).
complianceTest(
	{
		reqs: ["RFC5256-BASE.7.2.THREAD-2"],
		profiles: ["rev1", "rev2"],
		title:
			"client delivers the parsed thread structure (parent/child chains, sub-thread splits, missing-parent siblings)",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				send("* OK ready\r\n"),
				// §4 example thread (3 → 6 → {4→23, 44→7→96}) plus the RFC's
				// missing-parent form ((3)(5)): "3 and 5 are siblings of a parent
				// that does not match the search criteria".
				send("* THREAD (2)(3 6 (4 23)(44 7 96))((3)(5))\r\n"),
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
		const threadEvent = await waitForUntagged(driver, "THREAD");
		await waitForUntagged(driver, "EXISTS");
		const t = contentOf<ThreadContent>(threadEvent);
		expect(t.threads?.length, "three top-level threads must be delivered").toBe(3);
		const chain = t.threads![1];
		expect(chain.id, "second thread is rooted at 3").toBe(3);
		// Walk the delivered structure through its public accessor. This is where
		// the violation surfaces today: reading `.children` recurses infinitely.
		const chainChildren = chain.children;
		expect(chainChildren.length, "3 has the single successive child 6").toBe(1);
		expect(chainChildren[0].id).toBe(6);
		const split = chainChildren[0].children;
		expect(split.length, "the thread splits into two sub-threads under 6").toBe(2);
		expect(split[0].id, "first sub-thread root (sibling)").toBe(4);
		expect(split[1].id, "second sub-thread root (sibling)").toBe(44);
		expect(split[1].children[0].id, "44 → 7 chain continues").toBe(7);
		expect(split[1].children[0].children[0].id, "7 → 96 (no nesting limit)").toBe(96);
		// The number-less thread-nested form ((3)(5)): a parentless container
		// whose two sub-threads are siblings.
		const orphan = t.threads![2];
		expect(orphan.id, "missing-parent thread has no root message").toBeUndefined();
		expect(
			orphan.children.map((s) => s.id),
			"3 and 5 are siblings under the absent parent",
		).toEqual([3, 5]);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5256-BASE.6.4.SORT-1 / -2 — SORT command form with mandatory charset
// ═════════════════════════════════════════════════════════════════════════════
// driver.sort() throws today → unimplemented. The matcher pins the full form
// `(criteria) charset key` with exactly one search key, so a SORT that omits
// the charset (`SORT (SUBJECT) ALL` — only two arguments) cannot match.
complianceTest(
	{
		reqs: ["RFC5256-BASE.6.4.SORT-1", "RFC5256-BASE.6.4.SORT-2"],
		profiles: ["rev1", "rev2"],
		title: "SORT command form: parenthesized criteria, then MANDATORY charset, then search keys",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "SORT"], { login: true }),
				...selectExchange("INBOX"),
				expectLine(command("SORT", { args: new RegExp(`^\\(SUBJECT\\) ${cs("US-ASCII")} ALL$`, "i") })),
				reply("OK SORT completed", ["* SORT 2 3 4 1"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.sort(["SUBJECT"], ["ALL"], "US-ASCII");
		await server.assertCompleted();
		const sort = server.commandLines.find((l) => l.verb === "SORT");
		expect(sort, "SORT must have been emitted").toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5256-5-1 — SORT grammar: defined atoms only; REVERSE prefixes a sort-key
// ═════════════════════════════════════════════════════════════════════════════
// sort-criterion = ["REVERSE" SP] sort-key: REVERSE is a modifier, not a
// standalone key. The exact-pin matcher rejects `(REVERSE)` alone, a trailing
// REVERSE, quoted criteria, or any atom outside the eight defined ones.
complianceTest(
	{
		reqs: ["RFC5256-5-1"],
		profiles: ["rev1", "rev2"],
		title: "SORT criteria grammar: REVERSE composes with a following sort-key inside the parenthesized list",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "SORT"], { login: true }),
				...selectExchange("INBOX"),
				// (REVERSE SIZE DATE): REVERSE modifies SIZE; DATE is a second,
				// unreversed criterion in the same list.
				expectLine(
					command("SORT", {
						args: new RegExp(`^\\(REVERSE SIZE DATE\\) ${cs("US-ASCII")} ALL$`, "i"),
					}),
				),
				reply("OK SORT completed", ["* SORT 4 3 2 1"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.sort(["REVERSE", "SIZE", "DATE"], ["ALL"], "US-ASCII");
		await server.assertCompleted();
		const sort = server.commandLines.find((l) => l.verb === "SORT");
		expect(sort, "SORT must have been emitted").toBeDefined();
		// When implemented: REVERSE must appear only as a prefix of a sort-key.
		expect(sort!.args).not.toMatch(/REVERSE\)/i);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5256-BASE.6.4.SORT-3 — US-ASCII/UTF-8 charset floor (emission labeling)
// ═════════════════════════════════════════════════════════════════════════════
// The client-side residue of the floor MUST: a client using SORT must be able
// to declare UTF-8 and label its criteria accordingly. The matcher pins the
// declared charset to UTF-8 (only US-ASCII and UTF-8 are universally
// implementable — any other label would not satisfy the floor).
complianceTest(
	{
		reqs: ["RFC5256-BASE.6.4.SORT-3"],
		profiles: ["rev1", "rev2"],
		title: "SORT declares the UTF-8 charset when driven with UTF-8 criteria",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "SORT"], { login: true }),
				...selectExchange("INBOX"),
				expectLine(command("SORT", { args: new RegExp(`^\\(SUBJECT\\) ${cs("UTF-8")} ALL$`, "i") })),
				reply("OK SORT completed", ["* SORT 1 2"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.sort(["SUBJECT"], ["ALL"], "UTF-8");
		await server.assertCompleted();
		const sort = server.commandLines.find((l) => l.verb === "SORT");
		expect(sort, "SORT must have been emitted").toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5256-BASE.6.4.SORT-4 — UID SORT: same argument form; results are UIDs
// ═════════════════════════════════════════════════════════════════════════════
// "the arguments to UID SORT are interpreted the same as in SORT" — the wire
// form after the UID prefix is byte-identical to SORT's, and the untagged SORT
// response the server returns carries UIDs. driver.uidSort() throws today.
complianceTest(
	{
		reqs: ["RFC5256-BASE.6.4.SORT-4"],
		profiles: ["rev1", "rev2"],
		title: "UID SORT command form: identical (criteria) charset keys arguments; UID results",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "SORT"], { login: true }),
				...selectExchange("INBOX"),
				expectLine(
					command("UID SORT", { args: new RegExp(`^\\(DATE\\) ${cs("US-ASCII")} ALL$`, "i") }),
				),
				reply("OK UID SORT completed", ["* SORT 42305 42315 42316"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.uidSort(["DATE"], ["ALL"], "US-ASCII");
		await server.assertCompleted();
		const uidSort = server.commandLines.find((l) => l.verb === "UID SORT");
		expect(uidSort, "UID SORT must have been emitted").toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5256-BASE.6.4.SORT-5 — tolerate untagged EXPUNGE during a UID SORT
// ═════════════════════════════════════════════════════════════════════════════
// "…but are permitted during a UID SORT command": the scripted server
// interleaves an untagged EXPUNGE between the UID SORT command and its tagged
// completion. When implemented, the client must complete the command normally.
complianceTest(
	{
		reqs: ["RFC5256-BASE.6.4.SORT-5"],
		profiles: ["rev1", "rev2"],
		title: "client tolerates an untagged EXPUNGE interleaved into a UID SORT response",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "SORT"], { login: true }),
				...selectExchange("INBOX", { exists: 3 }),
				expectLine(command("UID SORT")),
				// EXPUNGE first, then the SORT data, then the tagged OK — the
				// renumbering happens mid-response.
				reply("OK UID SORT completed", ["* 3 EXPUNGE", "* SORT 23764 23765"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.uidSort(["ARRIVAL"], ["ALL"], "US-ASCII");
		await server.assertCompleted();
		// When implemented: the interleaved EXPUNGE must not abort the command —
		// the script only completes if the client consumed the full response.
		expect(server.commandLines.some((l) => l.verb === "UID SORT")).toBe(true);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5256-BASE.6.4.THREAD-1 / -2 — THREAD command form with mandatory charset
// ═════════════════════════════════════════════════════════════════════════════
// thread = "THREAD" SP thread-alg SP search-criteria: the algorithm atom is
// UNparenthesized (unlike SORT's criteria list), followed by the mandatory
// charset and at least one search key. The exact three-argument pin rejects a
// parenthesized algorithm or a charset-less `THREAD REFERENCES ALL`.
complianceTest(
	{
		reqs: ["RFC5256-BASE.6.4.THREAD-1", "RFC5256-BASE.6.4.THREAD-2"],
		profiles: ["rev1", "rev2"],
		title: "THREAD command form: bare algorithm atom, then MANDATORY charset, then search keys",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "SORT", "THREAD=ORDEREDSUBJECT", "THREAD=REFERENCES"], {
					login: true,
				}),
				...selectExchange("INBOX"),
				expectLine(
					command("THREAD", { args: new RegExp(`^REFERENCES ${cs("US-ASCII")} ALL$`, "i") }),
				),
				reply("OK THREAD completed", ["* THREAD (2)(3 6 (4 23)(44 7 96))"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.thread("REFERENCES", ["ALL"], "US-ASCII");
		await server.assertCompleted();
		const thread = server.commandLines.find((l) => l.verb === "THREAD");
		expect(thread, "THREAD must have been emitted").toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5256-BASE.6.4.THREAD-3 — US-ASCII/UTF-8 charset floor for THREAD
// ═════════════════════════════════════════════════════════════════════════════
complianceTest(
	{
		reqs: ["RFC5256-BASE.6.4.THREAD-3"],
		profiles: ["rev1", "rev2"],
		title: "THREAD declares the UTF-8 charset when driven with UTF-8 criteria",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "THREAD=REFERENCES"], { login: true }),
				...selectExchange("INBOX"),
				expectLine(
					command("THREAD", { args: new RegExp(`^REFERENCES ${cs("UTF-8")} ALL$`, "i") }),
				),
				reply("OK THREAD completed", ["* THREAD (1)(2)"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.thread("REFERENCES", ["ALL"], "UTF-8");
		await server.assertCompleted();
		const thread = server.commandLines.find((l) => l.verb === "THREAD");
		expect(thread, "THREAD must have been emitted").toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5256-BASE.6.4.THREAD-4 / RFC5256-5-2 — UID THREAD form + thread grammar
// ═════════════════════════════════════════════════════════════════════════════
// UID THREAD arguments are interpreted exactly as THREAD's; the §5 grammar
// admits only registered algorithm atoms (this document: ORDEREDSUBJECT and
// REFERENCES) followed by the shared search-criteria = charset 1*(SP
// search-key) production. Results in the untagged THREAD response are UIDs.
complianceTest(
	{
		reqs: ["RFC5256-BASE.6.4.THREAD-4", "RFC5256-5-2"],
		profiles: ["rev1", "rev2"],
		title: "UID THREAD command form: registered algorithm atom, charset, one or more search keys",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "THREAD=ORDEREDSUBJECT", "THREAD=REFERENCES"], {
					login: true,
				}),
				...selectExchange("INBOX"),
				expectLine(
					command("UID THREAD", {
						args: new RegExp(`^ORDEREDSUBJECT ${cs("US-ASCII")} ALL$`, "i"),
					}),
				),
				reply("OK UID THREAD completed", ["* THREAD (23701)(23702 23703)"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.uidThread("ORDEREDSUBJECT", ["ALL"], "US-ASCII");
		await server.assertCompleted();
		const uidThread = server.commandLines.find((l) => l.verb === "UID THREAD");
		expect(uidThread, "UID THREAD must have been emitted").toBeDefined();
		// When implemented: the algorithm is one of the atoms this document
		// registers, never quoted, never parenthesized.
		expect(uidThread!.args).toMatch(/^(?:ORDEREDSUBJECT|REFERENCES) /i);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5256-BASE.6.4.THREAD-5 — tolerate untagged EXPUNGE during a UID THREAD
// ═════════════════════════════════════════════════════════════════════════════
complianceTest(
	{
		reqs: ["RFC5256-BASE.6.4.THREAD-5"],
		profiles: ["rev1", "rev2"],
		title: "client tolerates an untagged EXPUNGE interleaved into a UID THREAD response",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "THREAD=REFERENCES"], { login: true }),
				...selectExchange("INBOX", { exists: 3 }),
				expectLine(command("UID THREAD")),
				reply("OK UID THREAD completed", ["* 3 EXPUNGE", "* THREAD (23764 23765)"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.uidThread("REFERENCES", ["ALL"], "US-ASCII");
		await server.assertCompleted();
		expect(server.commandLines.some((l) => l.verb === "UID THREAD")).toBe(true);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5256-1-2 — use only threading algorithms the server advertises (THREAD=)
// ═════════════════════════════════════════════════════════════════════════════
// The server advertises ONLY THREAD=ORDEREDSUBJECT. A conformant client's
// THREAD command must name an advertised algorithm; the negative half asserts
// no THREAD REFERENCES ever reaches the wire in this session.
complianceTest(
	{
		reqs: ["RFC5256-1-2"],
		profiles: ["rev1", "rev2"],
		title: "client issues THREAD only with an algorithm advertised via THREAD=<alg>",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "THREAD=ORDEREDSUBJECT"], { login: true }),
				...selectExchange("INBOX"),
				expectLine(command("THREAD", { args: /^ORDEREDSUBJECT /i })),
				reply("OK THREAD completed", ["* THREAD (1)(2 3)"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.thread("ORDEREDSUBJECT", ["ALL"], "US-ASCII");
		await server.assertCompleted();
		// When implemented: only the advertised algorithm may have been used.
		expect(
			server.transcript.clientLines(),
			"an unadvertised algorithm must never be issued",
		).not.toMatch(/THREAD REFERENCES/i);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5256-BASE.6.4.THREAD-6 — ORDEREDSUBJECT: descendents of a child → siblings
// ═════════════════════════════════════════════════════════════════════════════
// The RFC's only explicit "Client implementations SHOULD" sentence.
// ORDEREDSUBJECT threads are at most two levels deep; a server response that
// nevertheless nests deeper — (166 167 168) chains a grandchild 168 under 167 —
// SHOULD be delivered with 168 flattened to a sibling of 167. driver.thread()
// throws today → unimplemented; and note that even the acceptance half cannot
// currently be observed because the delivered structure's `children` accessor
// is broken (see the BASE.7.2.THREAD-2 violation above).
complianceTest(
	{
		reqs: ["RFC5256-BASE.6.4.THREAD-6"],
		profiles: ["rev1", "rev2"],
		title:
			"client treats descendents of a child in an ORDEREDSUBJECT THREAD response as siblings of that child",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "THREAD=ORDEREDSUBJECT"], { login: true }),
				...selectExchange("INBOX"),
				expectLine(command("THREAD", { args: /^ORDEREDSUBJECT /i })),
				// Illegally deep for ORDEREDSUBJECT: 166 → 167 → 168 (grandchild).
				reply("OK THREAD completed", ["* THREAD (166 167 168)"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		// The delivered thread exposes 167 AND 168 as siblings under 166 (the
		// SHOULD-normalized shape, RFC5256-BASE.6.4.THREAD-6), not a 3-deep chain
		// -- `ThreadCommand`'s ORDEREDSUBJECT flattening (`commands/message/
		// thread.ts`) is what produces this.
		const threads = await driver.thread("ORDEREDSUBJECT", ["ALL"], "US-ASCII");
		await server.assertCompleted();
		expect(server.commandLines.some((l) => l.verb === "THREAD")).toBe(true);
		expect(threads).toHaveLength(1);
		expect(threads[0].seq).toBe(166);
		expect(threads[0].children.map((c) => c.seq)).toEqual([167, 168]);
		expect(threads[0].children.every((c) => c.children.length === 0)).toBe(true);
	},
);
