/**
 * RFC 5466 — "IMAP4 Extension for Named Searches (Filters)" (capability
 * 'FILTERS').
 *
 * FILTERS defines no commands of its own: filters are stored through the
 * RFC 5464 SETMETADATA machinery under the reserved '/private|/shared/filters/*'
 * server-entry hierarchies and referenced via the FILTER search key. Only
 * RFC 5466's OWN client duties are cited here — the generic METADATA duties a
 * filter-managing client also carries live in metadata-5464.test.ts.
 *
 * Testable catalog ids covered here (catalog/ext/rfc5466.ts; all dual-profile —
 * FILTERS is standalone in rev2):
 *
 *   RFC5466-3.1-1   FILTER <filter_name> search-key wire form.
 *                     *** REAL as of M5.4 (SearchCriteria.filter) — PASS ***
 *   RFC5466-3.1-2   Accept tagged NO [UNDEFINED-FILTER <name>].
 *                     *** REAL — split legs; both PASS (see PROBE OUTCOME) ***
 *   RFC5466-3.1-3   MUST NOT pair FILTER with an explicit CHARSET other than
 *                   UTF-8/US-ASCII (negative guard; enforced client-side by
 *                   `assertFilterCharsetCompatible()` as of M5.4)
 *   RFC5466-3.2-1   Stored filter search-key values MUST be UTF-8.
 *                     *** REAL as of M5.4 (metadata.set()) — PASS ***
 *   RFC5466-3.2-2   Define/modify a filter via SETMETADATA "" on the reserved
 *                   /private|/shared/filters/values/<name> entries.
 *                     *** REAL as of M5.4 (metadata.set()) — PASS ***
 *   RFC5466-4-1     filter-name grammar (1*ATOM-CHAR except "/") at BOTH
 *                   emission sites: FILTER argument + entry-name segment.
 *                     *** REAL as of M5.4 — PASS ***
 *
 * Untestable ids NOT cited (per catalog testability tags):
 *   RFC5466-3-1 (capability-inventory: FILTERS gate), RFC5466-3.2-3
 *   (user-intent-policy: both-entries deletion), RFC5466-3.2-4
 *   (content-processing: () around non-RFC3501 keys), RFC5466-3.2-5
 *   (internal-decision: private-description precedence), RFC5466-3.2-6
 *   (ui-presentation: MAY display name), RFC5466-3.2-7/-3.2-8
 *   (content-processing: description language tags / i-default), RFC5466-5-1
 *   and RFC5466-5-2 (user-intent-policy: TLS-when-important, prefer-private).
 *
 * WIRE FORMS pinned by the self-actualizing matchers (RFC 5466 §3.1/§3.2/§4):
 *   search-key =/ "FILTER" SP filter-name → SEARCH FILTER on-vacation
 *   filter definition                     → SETMETADATA "" (/private/filters/
 *                                            values/<name> <non-NIL value>)
 *     (the mailbox argument is the empty string — a SERVER annotation — and
 *      the value is an IMAP search-criteria string; UTF-8 octets on the wire)
 *   filter-name = 1*<any ATOM-CHAR except "/"> — no '/', '(', ')', '{', SP,
 *     CTL, '%', '*', '"', '\', ']', and no UTF-8/non-ASCII octets
 * Each matcher anchors the FULL argument string: an unquoted-empty or missing
 * mailbox argument, a wrong entry hierarchy, a NIL "definition", or fetch-style
 * decoration around the FILTER key are rejected, never vacuously accepted.
 *
 * OBSERVATION SPLIT (REAL-signal-first, probed before writing):
 *  - PROBE OUTCOME (scripted 'a1 NO [UNDEFINED-FILTER on-vacation] Filter not
 *    found' against connectLow): the suspected hyphen-tokenization failure
 *    does NOT occur — the lexer's AtomRule character class includes '-' and
 *    the OperatorRule only fires when a token STARTS at the hyphen, so
 *    'UNDEFINED-FILTER' lexes as a single atom and the resp-code surfaces on
 *    the taggedResponse event with kind === "UNDEFINED-FILTER" intact, as an
 *    orderly NO; a trailing '* 7 EXISTS' still parses (stream survives). The
 *    mandated filter-name argument is ALSO preserved: `AtomTextCode`
 *    (`parser/structure/text.code.ts`) picks its split mode by the leading
 *    token — a bare (unparenthesized) argument list uses the null/null form
 *    that treats the whole token list as already "in" the list, rather than
 *    the default '(' start-token that would never "enter" on a bare argument
 *    (same mechanics cover a name with digits, e.g. '2nd-try', and
 *    REFERRAL/NOUPDATE/MAXCONVERTMESSAGES's own bare arguments). This fix
 *    predates M4.14 (landed as a general AtomTextCode bare-vs-parenthesized
 *    split, `test/unit/parser/tolerance.test.ts`'s
 *    "Bare (unparenthesized) resp-code arguments" suite already pins the
 *    UNDEFINED-FILTER case directly) — BOTH legs below are therefore genuine
 *    PASSes at the raw-parser layer, not `expectFailure`-annotated. M4.14's
 *    own scoped fix is a layer up: `src/protocol/response-codes.ts` +
 *    `src/commands/collector.ts`'s `toTypedResponseCode()` now give
 *    UNDEFINED-FILTER a dedicated typed variant (`{name: "UNDEFINED-FILTER",
 *    filterName}`) instead of the generic `{name, args}` fallback the public
 *    SDK surface used to render it through — registry-coverage.ts's note is
 *    updated to match (see `docs/compliance-adjudications.md` for the
 *    SearchCriteria.filter deferral this milestone also records, option (b)).
 *  - Command-emission duties: REAL as of M5.4. `SearchCriteria.filter`
 *    (`commands/search-criteria.ts`, gated on `FILTERS`) and the METADATA
 *    facet's real `setmetadata()` land together, closing the four rows this
 *    milestone carried forward from M4.14 (RFC5466-3.1-1, RFC5466-3.2-1,
 *    RFC5466-3.2-2, RFC5466-4-1) — see docs/compliance-adjudications.md for
 *    the M4.14/M5.4 scope history. Each test below now drives the real
 *    `search()`/`setmetadata()` wire exchange and asserts on the exact
 *    scripted wire form, rather than catching an expected
 *    `NotImplementedError`.
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

// ── shared event-shape helpers (notify-5465 pattern) ─────────────────────────
interface StatusContent {
	status?: string;
	text?: { code?: { kind?: string; contents?: string[] }; content?: string };
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

// filter-name = 1*<any ATOM-CHAR except "/"> (RFC 5466 §4): rejects '/', the
// atom-specials '(' ')' '{' SP '%' '*' '"' '\' ']', CTLs (0x00-0x1F, 0x7F),
// and every non-ASCII octet (filter-name disallows UTF-8).
// eslint-disable-next-line no-control-regex
const FILTER_NAME_RE = /^[^/(){%*"\\\] \u0000-\u001F\u007F-\uFFFF]+$/;

// Per-profile capability sets for driven (command-emission) scenarios. §3.2:
// a FILTERS server must also provide SETMETADATA/GETMETADATA, so the storage
// scenarios advertise METADATA alongside FILTERS.
function filtersCaps(profile: string, extra: string[] = []): string[] {
	return profile === "rev2"
		? ["IMAP4rev2", "LITERAL-", "FILTERS", ...extra]
		: ["IMAP4rev1", "FILTERS", ...extra];
}

// Opens a connectLow session against a script of lines followed by a
// '* 7 EXISTS' survival sentinel; returns the driver after script completion.
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
// RFC5466-3.1-2 — accept a tagged NO [UNDEFINED-FILTER <name>] (REAL)
// ═════════════════════════════════════════════════════════════════════════════
// §3.1: a reference to a nonexistent/unaccessible filter fails the SEARCH with
// a tagged NO carrying the UNDEFINED-FILTER resp-code followed by the filter
// name; the client must treat it as a well-formed command failure, not a
// protocol error. PROBED: 'UNDEFINED-FILTER' lexes as a single atom (AtomRule
// includes '-'; OperatorRule never gets a shot mid-token), the code surfaces
// via the AtomTextCode fallback with kind intact, and the stream survives —
// genuine pass.
complianceTest(
	{
		reqs: ["RFC5466-3.1-2"],
		profiles: ["rev1", "rev2"],
		title: "client accepts a tagged NO [UNDEFINED-FILTER <name>] as a clean SEARCH failure",
		timeout: 5000,
	},
	async () => {
		const driver = await unsolicited([
			"a1 NO [UNDEFINED-FILTER on-vacation] Filter not found",
		]);
		const found = await pollFor(() =>
			taggedEvents(driver).some(
				(t) =>
					t.tag?.id === "a1" &&
					t.status?.status === "NO" &&
					t.status?.text?.code?.kind === "UNDEFINED-FILTER",
			),
		);
		expect(
			found,
			"the tagged NO must surface with a parsed UNDEFINED-FILTER resp-code (not be " +
				"mangled by the lexer or dropped)",
		).toBe(true);
		// Stream survival past the refusal.
		await waitForUntagged(driver, "EXISTS");
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5466-3.1-2 — the offending filter-name argument surfaces (REAL — PASS)
// ═════════════════════════════════════════════════════════════════════════════
// §4 ABNF: resp-text-code =/ "UNDEFINED-FILTER" SP filter-name — the code the
// client must accept CARRIES the name of the nonexistent/unaccessible filter,
// and a client that discards it cannot tell its caller WHICH filter failed.
// M4.14 RE-PROBE: an earlier probe (before AtomTextCode's bare-vs-parenthesized
// split landed) found this argument dropped; that fix predates this milestone's
// dispatch (`test/unit/parser/tolerance.test.ts`'s "Bare (unparenthesized)
// resp-code arguments" suite pins the UNDEFINED-FILTER case directly), so
// code.contents already comes back ["on-vacation"] here — a genuine pass, not
// `expectFailure`-annotated. M4.14's own scoped fix is the layer above this
// raw-parser check: `toTypedResponseCode()` (src/commands/collector.ts) now
// renders UNDEFINED-FILTER through a dedicated typed `{name, filterName}`
// variant (src/protocol/response-codes.ts) instead of the generic
// `{name, args}` fallback — see test/unit/commands/collector.test.ts.
complianceTest(
	{
		reqs: ["RFC5466-3.1-2"],
		profiles: ["rev1", "rev2"],
		title: "the UNDEFINED-FILTER resp-code exposes the offending filter-name argument",
		timeout: 5000,
	},
	async () => {
		const driver = await unsolicited([
			"a1 NO [UNDEFINED-FILTER on-vacation] Filter not found",
		]);
		const found = await pollFor(() =>
			taggedEvents(driver).some((t) => t.tag?.id === "a1"),
		);
		expect(found, "the tagged NO must surface").toBe(true);
		const no = taggedEvents(driver).find((t) => t.tag?.id === "a1");
		expect(no?.status?.status).toBe("NO");
		expect(no?.status?.text?.code?.kind).toBe("UNDEFINED-FILTER");
		// SPEC: the resp-code is "UNDEFINED-FILTER" SP filter-name — the parsed
		// code must carry the name, not discard it. AtomTextCode's
		// bare-vs-parenthesized split (predates M4.14) preserves it.
		expect(
			no?.status?.text?.code?.contents,
			"the filter-name following UNDEFINED-FILTER must be exposed (RFC 5466 §3.1/§4)",
		).toEqual(["on-vacation"]);
		await waitForUntagged(driver, "EXISTS");
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5466-3.1-1 — FILTER <filter_name> search-key wire form
// ═════════════════════════════════════════════════════════════════════════════
// §3.1 Syntax: FILTER <filter_name>; §4: search-key =/ "FILTER" SP filter-name.
// The anchored matcher pins the SOLE legal form — the atom FILTER, one space,
// the bare filter-name atom; a quoted name, parenthesized decoration, or any
// other criterion alongside is rejected. REAL as of M5.4: driver.search()
// delegates through `SearchCriteria.filter`.
complianceTest(
	{
		reqs: ["RFC5466-3.1-1"],
		profiles: ["rev1", "rev2"],
		title: "SEARCH FILTER <filter_name> command form",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(filtersCaps(ctx.profile), { profile: ctx.profile, login: true }),
				...selectExchange("INBOX", { exists: 4, profile: ctx.profile }),
				expectLine(command("SEARCH", { args: /^FILTER on-vacation$/i })),
				reply(
					"OK SEARCH completed",
					ctx.profile === "rev2" ? ['* ESEARCH (TAG "a3") ALL 2,10'] : ["* SEARCH 2 10"],
				),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.search(["FILTER on-vacation"]);
		await server.assertCompleted();
		const search = server.commandLines.find((l) => l.verb === "SEARCH");
		expect(search, "SEARCH must have been emitted").toBeDefined();
		expect(search!.args, "the sole legal form is 'FILTER' SP filter-name").toMatch(
			/^FILTER on-vacation$/i,
		);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5466-3.1-3 — no explicit CHARSET other than UTF-8/US-ASCII with FILTER
// ═════════════════════════════════════════════════════════════════════════════
// §3.1: FILTER implies CHARSET "UTF-8" (stored filter values are UTF-8 per
// §3.2); an explicit CHARSET other than UTF-8/US-ASCII draws an unconditional
// tagged BAD [BADCHARSET], so the client MUST NOT emit the combination. The
// caller asks for FILTER with CHARSET ISO-8859-1; the client must refuse
// locally, drop, or correct the charset — the forbidden pairing may never hit
// the wire. REAL SIGNAL for the SELECT half (M2.2): driver.select() now
// really selects the mailbox; driver.search() itself still throws
// NotImplementedError (M3, swallowed below) -- the transcript guard is what
// actually proves the prohibition once SEARCH lands.
complianceTest(
	{
		reqs: ["RFC5466-3.1-3"],
		profiles: ["rev1", "rev2"],
		title: "client never pairs the FILTER key with an explicit non-UTF-8/US-ASCII CHARSET",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(filtersCaps(ctx.profile), { profile: ctx.profile, login: true }),
				...selectExchange("INBOX", { exists: 4, profile: ctx.profile }),
				// If the client (compliantly) proceeds with a corrected SEARCH, accept it.
				expectLine(command(/^(SEARCH|UID|NOOP)$/)),
				reply("OK completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		// The caller asks for the forbidden combination; a compliant client may
		// throw locally instead of emitting it, so the call itself is caught.
		await driver
			.search(["FILTER on-vacation"], { charset: "ISO-8859-1" })
			.catch(() => undefined);
		// No client line may carry a FILTER key together with an explicit CHARSET
		// other than UTF-8/US-ASCII (grammar puts CHARSET before the keys).
		expect(
			server.transcript.clientLines(),
			"FILTER implies CHARSET UTF-8; an explicit CHARSET other than UTF-8/US-ASCII " +
				"alongside FILTER is a hard error (RFC 5466 §3.1)",
		).not.toMatch(
			/^.*\bCHARSET (?!"?(?:UTF-8|US-ASCII)"?(?:\\r|\s|$))\S+.*\bFILTER\b.*$/im,
		);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5466-3.2-2 — filter definition via SETMETADATA on the reserved entries
// ═════════════════════════════════════════════════════════════════════════════
// §3.2: a filter is created/modified by storing a NON-NIL value in the
// "/private/filters/values/<filter_name>" (or /shared/...) SERVER entry — the
// mailbox argument is the empty string "". The anchored matcher rejects a
// non-empty mailbox, a wrong hierarchy, or a NIL "definition". REAL as of
// M5.4: driver.setmetadata() delegates through the real METADATA facet.
complianceTest(
	{
		reqs: ["RFC5466-3.2-2"],
		profiles: ["rev1", "rev2"],
		title: 'filter definition is SETMETADATA "" (/private/filters/values/<name> <non-NIL value>)',
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(filtersCaps(ctx.profile, ["METADATA"]), {
					profile: ctx.profile,
					login: true,
				}),
				// SETMETADATA "" (/private/filters/values/on-vacation <value>) — the
				// value is a search-criteria string (quoted or literal), never NIL.
				expectLine(
					command("SETMETADATA", {
						args: /^"" \("?\/private\/filters\/values\/on-vacation"? (?:"[^"]+"|\{\d+\+?\})\)$/i,
					}),
				),
				reply("OK SETMETADATA completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.setmetadata("", [
			{ entry: "/private/filters/values/on-vacation", value: "FLAGGED UNDELETED" },
		]);
		await server.assertCompleted();
		const set = server.commandLines.find((l) => l.verb === "SETMETADATA");
		expect(set, "SETMETADATA must have been emitted").toBeDefined();
		expect(
			set!.args,
			"the mailbox argument is the empty string (server annotation) and the entry " +
				"lives under the reserved /private/filters/values hierarchy",
		).toMatch(/^"" \("?\/private\/filters\/values\/on-vacation"? /i);
		expect(set!.args, "a definition stores a non-NIL value").not.toMatch(/\bNIL\)$/i);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5466-3.2-1 — stored filter search-key values MUST be encoded in UTF-8
// ═════════════════════════════════════════════════════════════════════════════
// §3.2: 'values of all search keys stored in these entries MUST be encoded in
// UTF-8.' The consumer supplies a JS string containing non-ASCII (a Cyrillic
// FROM term); the client chooses the octets it serializes — the emitted value
// (quoted or literal) must be exactly the UTF-8 encoding of that string. REAL
// as of M5.4: driver.setmetadata() delegates through the real METADATA facet
// (`SetMetadataCommand.write()` -> `CommandWriter.nstring()`, which always
// takes the quoted/literal — never bare-atom — path for a `string` value).
complianceTest(
	{
		reqs: ["RFC5466-3.2-1"],
		profiles: ["rev1", "rev2"],
		title: "stored filter value octets are the UTF-8 encoding of the search criterion",
		timeout: 5000,
	},
	async (ctx) => {
		const criterion = 'FROM "Иван"'; // non-ASCII search-key value
		const utf8 = Buffer.from(criterion, "utf8");
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(filtersCaps(ctx.profile, ["METADATA"]), {
					profile: ctx.profile,
					login: true,
				}),
				// The value may ride as a literal ({n} marker stays in the flat line;
				// payload octets surface via commandLines[].literals) or as a quoted
				// string whose raw octets appear latin1-decoded in args.
				expectLine(
					command("SETMETADATA", {
						args: /^"" \("?\/private\/filters\/values\/otpusk"? (?:"[^"]+"|\{\d+\+?\})\)$/i,
					}),
				),
				reply("OK SETMETADATA completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.setmetadata("", [
			{ entry: "/private/filters/values/otpusk", value: criterion },
		]);
		await server.assertCompleted();
		const set = server.commandLines.find((l) => l.verb === "SETMETADATA");
		expect(set, "SETMETADATA must have been emitted").toBeDefined();
		if (set!.literals.length) {
			// Literal form: the payload octets must be exactly the UTF-8 encoding.
			expect(
				set!.literals[0].equals(utf8),
				`literal value octets must be UTF-8 for ${JSON.stringify(criterion)}; got ` +
					`<${set!.literals[0].toString("hex")}> expected <${utf8.toString("hex")}>`,
			).toBe(true);
		} else {
			// Quoted form: args holds the raw wire octets latin1-decoded, so the
			// UTF-8 bytes of the criterion must appear verbatim.
			expect(
				set!.args,
				"quoted value octets must be the UTF-8 encoding of the criterion",
			).toContain(utf8.toString("latin1"));
		}
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC5466-4-1 — filter-name grammar at both emission sites
// ═════════════════════════════════════════════════════════════════════════════
// §4: filter-name = 1*<any ATOM-CHAR except "/"> — no '/', no UTF-8, none of
// '(' ')' '{' SP CTL '%' '*' '"' '\' ']'. The grammar governs the FILTER
// search-key argument AND the <filter_name> segment of the reserved METADATA
// entry names (the '/' exclusion keeps the name a single hierarchy segment).
// Driven with a legal name exercising the edge ATOM-CHARs (digits, '-', '.');
// both emitted sites must carry it verbatim and grammar-clean. REAL as of
// M5.4: `SearchCriteria.filter` (search-side) and `metadata.set()` (entry-name
// side) both delegate through the real wire.
complianceTest(
	{
		reqs: ["RFC5466-4-1"],
		profiles: ["rev1", "rev2"],
		title: "emitted filter-name conforms to the filter-name grammar at both emission sites",
		timeout: 5000,
	},
	async (ctx) => {
		const name = "Q1-2024.important";
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(filtersCaps(ctx.profile, ["METADATA"]), {
					profile: ctx.profile,
					login: true,
				}),
				...selectExchange("INBOX", { exists: 4, profile: ctx.profile }),
				expectLine(command("SEARCH", { args: /^FILTER Q1-2024\.important$/i })),
				reply(
					"OK SEARCH completed",
					ctx.profile === "rev2" ? ['* ESEARCH (TAG "a4") ALL 7'] : ["* SEARCH 7"],
				),
				expectLine(
					command("SETMETADATA", {
						args: /^"" \("?\/private\/filters\/values\/Q1-2024\.important"? (?:"[^"]+"|\{\d+\+?\})\)$/i,
					}),
				),
				reply("OK SETMETADATA completed"),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user", "pass");
		await driver.select("INBOX");
		await driver.search([`FILTER ${name}`]);
		await driver.setmetadata("", [
			{ entry: `/private/filters/values/${name}`, value: "SUBJECT quarterly" },
		]);
		await server.assertCompleted();
		// Site 1: the FILTER search-key argument.
		const search = server.commandLines.find((l) => l.verb === "SEARCH");
		expect(search, "SEARCH must have been emitted").toBeDefined();
		const searchName = search!.args.replace(/^FILTER /i, "");
		expect(searchName, "the FILTER argument carries the name verbatim").toBe(name);
		expect(
			searchName,
			"the FILTER argument must be 1*ATOM-CHAR excluding '/' (RFC 5466 §4)",
		).toMatch(FILTER_NAME_RE);
		// Site 2: the <filter_name> segment of the reserved entry name.
		const set = server.commandLines.find((l) => l.verb === "SETMETADATA");
		expect(set, "SETMETADATA must have been emitted").toBeDefined();
		const segment = /\/private\/filters\/values\/([^ )"]+)/i.exec(set!.args)?.[1];
		expect(segment, "the entry name carries the filter-name segment verbatim").toBe(name);
		expect(
			segment,
			"the entry's <filter_name> segment must be 1*ATOM-CHAR excluding '/' (RFC 5466 §4)",
		).toMatch(FILTER_NAME_RE);
	},
);
