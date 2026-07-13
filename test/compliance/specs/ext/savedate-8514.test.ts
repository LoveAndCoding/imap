/**
 * RFC 8514 — "Internet Message Access Protocol (IMAP) - SAVEDATE Extension".
 * Client-binding duties for the SAVEDATE FETCH data item (and its date-time / NIL
 * response) and the four SAVED* SEARCH keys.
 *
 * Testable catalog ids covered here (see test/compliance/catalog/ext/rfc8514.ts):
 *
 *   RFC8514-4.2-1  Client emits the SAVEDATE FETCH data item.
 *   RFC8514-4.2-2  Client accepts the SAVEDATE FETCH response as a date-time
 *                  string OR NIL (both branches).
 *   RFC8514-4.3-1  Client emits SAVEDBEFORE <date>.
 *   RFC8514-4.3-2  Client emits SAVEDON <date>.
 *   RFC8514-4.3-3  Client emits SAVEDSINCE <date>.
 *   RFC8514-4.3-4  Client emits SAVEDATESUPPORTED (argument-less probe).
 *
 * The catalog marks all six testable and standalone in rev2 (RFC 9051 does not
 * fold SAVEDATE), so every entry runs both profiles.
 *
 * SYNTAX (RFC 8514 §5 ABNF):
 *   fetch-att      =/ "SAVEDATE"
 *   msg-att-static =/ "SAVEDATE" SP (date-time / nil)
 *   search-key     =/ "SAVEDBEFORE" SP date / "SAVEDON" SP date /
 *                     "SAVEDSINCE" SP date / "SAVEDATESUPPORTED"
 *
 * SELF-ACTUALIZATION: there is no SAVEDATE surface — driver.fetch()/search() throw
 * NotImplementedError → unimplemented. The scripted server pins the exact FETCH
 * data item and the four SEARCH-key command forms so, once a surface exists, the
 * matchers reject a wrong spelling. The FETCH response legs additionally pin the
 * two-branch (date-time / NIL) response shape the client must accept.
 */
import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { expectLine, reply } from "../../harness/script";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";
import { selectExchange, sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

// ═════════════════════════════════════════════════════════════════════════════
// RFC8514-4.2-1 / -4.2-2 — FETCH SAVEDATE + a date-time response value
// ═════════════════════════════════════════════════════════════════════════════
// The client emits the bare atom SAVEDATE in a FETCH item list and must accept a
// quoted date-time value in the response. driver.fetch() throws today →
// unimplemented. The scripted server pins the SAVEDATE atom and a date-time reply.
complianceTest(
	{
		reqs: ["RFC8514-4.2-1", "RFC8514-4.2-2"],
		profiles: ["rev1", "rev2"],
		title: "FETCH SAVEDATE command form and a date-time response value",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "SAVEDATE"]),
				// fetch-att =/ "SAVEDATE" — the bare atom in the FETCH item list.
				expectLine(command("FETCH", { args: /^998 \(SAVEDATE\)$/i })),
				// msg-att-static =/ "SAVEDATE" SP date-time (the date-time branch).
				reply("OK FETCH completed", ['* 998 FETCH (SAVEDATE "01-Jan-2015 18:50:53 +0100")']),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.fetch("998", ["SAVEDATE"]); // throws NotImplementedError today
		await server.assertCompleted();
		const fetch = server.commandLines.find((l) => l.verb === "FETCH");
		expect(fetch, "FETCH must have been emitted").toBeDefined();
		expect(fetch!.args, "the bare SAVEDATE data item was emitted").toMatch(/\(SAVEDATE\)$/i);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC8514-4.2-2 — accept a NIL SAVEDATE value (storage lacks the attribute)
// ═════════════════════════════════════════════════════════════════════════════
// When the underlying storage lacks the save-date attribute, the SAVEDATE value
// is NIL rather than a string — the client must accept the NIL branch as a normal
// value. driver.fetch() throws today → unimplemented. The scripted server pins the
// SAVEDATE atom and a NIL reply, exercising the second branch of the response.
complianceTest(
	{
		reqs: ["RFC8514-4.2-2"],
		profiles: ["rev1", "rev2"],
		title: "FETCH SAVEDATE accepts a NIL value (storage without the save-date attribute)",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "SAVEDATE"]),
				expectLine(command("FETCH", { args: /^998 \(SAVEDATE\)$/i })),
				// msg-att-static =/ "SAVEDATE" SP nil (the NIL branch).
				reply("OK FETCH completed", ["* 998 FETCH (SAVEDATE NIL)"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.fetch("998", ["SAVEDATE"]); // throws NotImplementedError today
		await server.assertCompleted();
		expect(server.commandLines.find((l) => l.verb === "FETCH")).toBeDefined();
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC8514-4.3-1 / -4.3-2 / -4.3-3 — SAVEDBEFORE / SAVEDON / SAVEDSINCE <date>
// ═════════════════════════════════════════════════════════════════════════════
// The three date-taking SAVED* SEARCH keys. driver.search() throws today →
// unimplemented. Each scripted server pins exactly one key atom followed by an
// IMAP date, rejecting a wrong key spelling or a missing date.
for (const key of ["SAVEDBEFORE", "SAVEDON", "SAVEDSINCE"] as const) {
	const reqMap = {
		SAVEDBEFORE: "RFC8514-4.3-1",
		SAVEDON: "RFC8514-4.3-2",
		SAVEDSINCE: "RFC8514-4.3-3",
	} as const;
	complianceTest(
		{
			reqs: [reqMap[key]],
			profiles: ["rev1", "rev2"],
			title: `SEARCH ${key} <date> command form`,
			timeout: 5000,
		},
		async () => {
			const server = await f.startServer();
			server.arm([
				[
					...sessionPrelude(["IMAP4rev1", "SAVEDATE"], { login: true }),
					...selectExchange("INBOX", { exists: 5 }),
					// search-key =/ "<KEY>" SP date — the atom then an IMAP date.
					expectLine(
						command("SEARCH", { args: new RegExp(`^${key} 28-Dec-2014$`, "i") }),
					),
					reply("OK SEARCH completed", ["* SEARCH 1 3 5"]),
				],
			]);
			const driver = await f.connectPlain(server);
			await driver.login("user", "pass");
			await driver.select("INBOX");
			await driver.search({ key, date: "28-Dec-2014" });
			await server.assertCompleted();
			const search = server.commandLines.find((l) => l.verb === "SEARCH");
			expect(search, "SEARCH must have been emitted").toBeDefined();
			expect(search!.args, `the ${key} search key with a date was emitted`).toMatch(
				new RegExp(`^${key} 28-Dec-2014$`, "i"),
			);
		},
	);
}

// ═════════════════════════════════════════════════════════════════════════════
// RFC8514-4.3-4 — SAVEDATESUPPORTED (argument-less probe)
// ═════════════════════════════════════════════════════════════════════════════
// SAVEDATESUPPORTED is a boolean probe of whether the mailbox storage supports the
// save-date attribute; it takes NO date argument. driver.search() throws today →
// unimplemented. The scripted server pins the bare atom with no argument.
complianceTest(
	{
		reqs: ["RFC8514-4.3-4"],
		profiles: ["rev1", "rev2"],
		title: "SEARCH SAVEDATESUPPORTED command form (argument-less probe)",
		expectFailure: "unimplemented",
		timeout: 5000,
	},
	async () => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "SAVEDATE"], { login: true }),
				...selectExchange("INBOX", { exists: 4 }),
				// search-key =/ "SAVEDATESUPPORTED" — no date argument follows.
				expectLine(command("SEARCH", { args: /^SAVEDATESUPPORTED$/i })),
				reply("OK SEARCH completed", ["* SEARCH 1 2 3 4"]),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		// SAVEDATESUPPORTED has no SearchCriteria field of its own (spec §5.3
		// models only the three date-taking SAVED* keys) -- driver.search()
		// throws NotImplementedError before touching the wire.
		await driver.search({ key: "SAVEDATESUPPORTED" });
		await server.assertCompleted();
		const search = server.commandLines.find((l) => l.verb === "SEARCH");
		expect(search, "SEARCH must have been emitted").toBeDefined();
		expect(search!.args, "SAVEDATESUPPORTED takes no argument").toMatch(/^SAVEDATESUPPORTED$/i);
	},
);
