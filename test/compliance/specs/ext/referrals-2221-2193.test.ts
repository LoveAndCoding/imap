/**
 * RFC 2221 — "IMAP4 Login Referrals" (capability 'LOGIN-REFERRALS') and
 * RFC 2193 — "IMAP4 Mailbox Referrals" (capability 'MAILBOX-REFERRALS').
 *
 * Both extensions hang their entire client-visible surface off the SAME
 * mechanism: a `[REFERRAL <url>...]` response code carried on a tagged
 * NO/OK or an untagged BYE. Neither RFC's REFERRAL code is one of the named
 * kinds src/parser/structure/text.code.ts special-cases (APPENDUID/
 * BADCHARSET/CAPABILITIES/COPYUID/MODIFIED/PERMANENTFLAGS/HIGHESTMODSEQ/
 * UIDNEXT/UIDVALIDITY/UNSEEN) — it falls through to the `default: code = new
 * AtomTextCode(kind, contents)` branch. AtomTextCode hands its argument
 * tokens to splitSpaceSeparatedList with the default '(' start-token; per
 * both RFCs' ABNF the URL argument is BARE (no surrounding parens —
 * RFC2221 §5 'resp_text_code =/ "REFERRAL" SPACE <imapurl>', RFC2193 §6
 * 'referral_response_code = "[" "REFERRAL" 1*(SPACE <url>) "]"'), so the
 * bare argument never "starts the list" and code.contents comes back []
 * even though code.kind correctly surfaces as "REFERRAL" — the 4th
 * confirmed instance of this AtomTextCode bare-arg-drop defect (after
 * RFC5466 UNDEFINED-FILTER, RFC4467/BADEVENT precedent notes elsewhere).
 * Every acceptance duty below is therefore split into two legs exactly
 * like the RFC5466-3.1-2/UNDEFINED-FILTER precedent: a genuine PASS on
 * kind-acceptance (the stream survives, kind === "REFERRAL"), and a
 * genuine VIOLATION on URL-exposure (contents comes back [] instead of
 * carrying the URL(s)).
 *
 * Testable catalog ids covered here (see test/compliance/catalog/ext/
 * rfc2221.ts and rfc2193.ts; all dual-profile [rev1, rev2] — neither RFC is
 * restated, obsoleted, or mentioned anywhere in RFC 9051):
 *
 *   RFC2221-4.1-1  Accept [REFERRAL ...] on tagged NO to LOGIN/AUTHENTICATE.
 *                    *** REAL — kind-pass leg ***
 *   RFC2221-4.1-2  Recover the referral URL from that tagged NO.
 *                    *** REAL — url-drop violation leg ***
 *   RFC2221-4.1-3  Do not treat a tagged OK carrying [REFERRAL ...] as an
 *                  unqualified plain success.
 *                    *** REAL — kind-pass leg (qualified-success shape) ***
 *   RFC2221-4.2-1  Treat an untagged BYE carrying [REFERRAL ...] as a
 *                  startup redirection, not a bare refusal.
 *                    *** REAL — kind-pass leg ***
 *   RFC2193-3-2    Accept a REFERRAL response code on tagged NO to
 *                  SELECT/EXAMINE/DELETE/SUBSCRIBE/UNSUBSCRIBE/STATUS/APPEND.
 *                    *** REAL — kind-pass leg ***
 *   RFC2193-3-3    Recover every URL when a REFERRAL code carries multiple.
 *                    *** REAL — url-drop violation leg (multi-URL) ***
 *   RFC2193-4.1-1  Accept [REFERRAL ...] on the seven named commands
 *                  specifically. *** REAL — kind-pass leg ***
 *   RFC2193-4.2-1  Accept [REFERRAL ...] on CREATE. *** REAL — kind-pass ***
 *   RFC2193-4.3-1  Accept a REFERRAL response-code PAIR on RENAME (old/new).
 *                    *** REAL — url-drop violation leg (pair) ***
 *   RFC2193-4.4-1  Accept [REFERRAL ...] on COPY. *** REAL — kind-pass ***
 *   RFC2193-5.1-1  Issue RLIST rather than LIST under MAILBOX-REFERRALS
 *                    (REAL as of M5.13 — driver.rlist() wired through
 *                    list({ referrals: true }); command form pinned).
 *   RFC2193-5.2-1  Issue RLSUB rather than LSUB under MAILBOX-REFERRALS
 *                    (REAL as of M5.13 — driver.rlsub() wired through
 *                    lsub(ref, pattern, { referrals: true }); form pinned).
 *   RFC2221-3-1    Client MUST NOT follow more than 10 levels of referral
 *                    without consulting the user (self-actualizing — no
 *                    driver surface follows a referral chain at all today).
 *   RFC2193-3-1    Client (implicit) MUST be prepared for a URL of any type
 *                    in a REFERRAL code, though it need only process IMAP
 *                    URLs. *** REAL — kind-pass leg (non-IMAP URL scheme) ***
 *
 * Untestable ids NOT cited (per the catalog modules' own testability tags):
 *   RFC2221-4-1 (internal-decision — permanent-vs-temporary),
 *   RFC2221-4-2/-6-1 and RFC2193-3-4 (out-of-band — following a referral to
 *   a second connection), RFC2193-4.3-2 (internal-decision — reissue vs.
 *   constituent-command strategy choice).
 *
 * OBSERVATION SPLIT:
 *  - REFERRAL acceptance (kind-pass legs) and URL-recovery (violation legs)
 *    are probed via connectLow()+scripted unsolicited data, mirroring the
 *    RFC5466 UNDEFINED-FILTER precedent: no command-emission surface is
 *    needed to observe how the client parses a resp-code it receives.
 *  - RLIST/RLSUB command-emission duties: REAL as of M5.13 —
 *    driver.rlist()/rlsub() are wired through the public fold-ins
 *    (list({ referrals: true }) / lsub(ref, pattern, { referrals: true }));
 *    the scripted server pins the exact command form.
 *
 * TYPED SURFACE NOTE (M5.13): beyond the parse-level acceptance probed
 * here, the REFERRAL code now has a dedicated TypedResponseCode variant
 * ({ name: "REFERRAL", urls: string[] }, src/protocol/response-codes.ts)
 * carried on ServerNoError/ServerBadError/AuthError `.code` — surfaced as
 * data only; the client never auto-follows a referral (spec §3.6's note).
 */
import { expect } from "vitest";

import type { ObservedEvent } from "../../driver/driver";
import { command } from "../../harness/matchers";
import { close, expectLine, reply, send } from "../../harness/script";
import { complianceTest } from "../../runner/compliance-test";
import { waitForUntagged } from "../../runner/events";
import { useComplianceFixture } from "../../runner/fixture";
import { sessionPrelude } from "../../runner/state";

const f = useComplianceFixture();

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
function serverStatusEvents(driver: { events: ObservedEvent[] }): StatusContent[] {
	return driver.events
		.filter((e) => e.type === "serverStatus")
		.map((e) => (e.detail as { content?: StatusContent } | undefined)?.content ?? {});
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

// Opens a connectLow session against a script of lines followed by a
// '* 7 EXISTS' survival sentinel (skipped after a BYE, since the server
// closes instead); returns the driver after script completion.
async function unsolicited(lines: string[], opts: { bye?: boolean } = {}) {
	const server = await f.startServer();
	server.arm([
		[
			send("* OK ready\r\n"),
			...lines.map((l) => send(`${l}\r\n`)),
			...(opts.bye ? [] : [send("* 7 EXISTS\r\n")]),
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
// RFC2221-4.1-1 — accept [REFERRAL ...] on a tagged NO to LOGIN (kind-pass)
// ═════════════════════════════════════════════════════════════════════════════
// §4.1 worked example: 'A001 NO [REFERRAL IMAP://MIKE@SERVER2/] Specified
// user is invalid on this server. Try SERVER2.' The client must surface the
// tagged NO with the REFERRAL kind intact rather than dropping the line or
// treating it as an unparseable status.
complianceTest(
	{
		reqs: ["RFC2221-4.1-1"],
		profiles: ["rev1", "rev2"],
		title: "client accepts a tagged NO [REFERRAL <url>] to LOGIN as a well-formed home-server referral",
		timeout: 5000,
	},
	async () => {
		const driver = await unsolicited([
			"a1 NO [REFERRAL IMAP://MIKE@SERVER2/] Specified user is invalid on this server. Try SERVER2.",
		]);
		const found = await pollFor(() =>
			taggedEvents(driver).some(
				(t) =>
					t.tag?.id === "a1" &&
					t.status?.status === "NO" &&
					t.status?.text?.code?.kind === "REFERRAL",
			),
		);
		expect(
			found,
			"the tagged NO must surface with a parsed REFERRAL resp-code kind (not be " +
				"mangled by the lexer or dropped)",
		).toBe(true);
		await waitForUntagged(driver, "EXISTS");
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC2221-4.1-2 — recover the referral URL from that tagged NO (HONEST VIOLATION)
// ═════════════════════════════════════════════════════════════════════════════
// §3/§4.1: the REFERRAL response code MUST contain the URL as its argument —
// a client that discards it cannot act on the referral at all. PROBED: the
// URL is bare (unparenthesized) per §5's ABNF, so AtomTextCode.contents
// drops it (splitSpaceSeparatedList's default '(' start-token never fires).
complianceTest(
	{
		reqs: ["RFC2221-4.1-2"],
		profiles: ["rev1", "rev2"],
		title: "the REFERRAL resp-code on a tagged NO to LOGIN exposes the referral URL argument",
		timeout: 5000,
	},
	async () => {
		const driver = await unsolicited([
			"a1 NO [REFERRAL IMAP://MIKE@SERVER2/] Specified user is invalid on this server. Try SERVER2.",
		]);
		const found = await pollFor(() => taggedEvents(driver).some((t) => t.tag?.id === "a1"));
		expect(found, "the tagged NO must surface").toBe(true);
		const no = taggedEvents(driver).find((t) => t.tag?.id === "a1");
		expect(no?.status?.status).toBe("NO");
		expect(no?.status?.text?.code?.kind).toBe("REFERRAL");
		// SPEC: resp_text_code =/ "REFERRAL" SPACE <imapurl> — the URL must be
		// exposed, not discarded. Probed: contents is [] (bare-argument drop).
		expect(
			no?.status?.text?.code?.contents,
			"the referral URL following REFERRAL must be exposed (RFC 2221 §3/§4.1/§5) — " +
				"the client currently discards every non-parenthesized resp-code argument",
		).toEqual(["IMAP://MIKE@SERVER2/"]);
		await waitForUntagged(driver, "EXISTS");
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC2221-4.1-3 — a tagged OK carrying [REFERRAL ...] is a qualified success,
// not a bare unqualified OK (kind-pass)
// ═════════════════════════════════════════════════════════════════════════════
// §4 worked example: 'A001 OK [REFERRAL IMAP://MATTHEW@SERVER2/] Specified
// user's personal mailboxes located on Server2, but public mailboxes are
// available.' The client must be able to observe this OK carries a REFERRAL
// code distinctly from a bare OK.
complianceTest(
	{
		reqs: ["RFC2221-4.1-3"],
		profiles: ["rev1", "rev2"],
		title: "client observes a tagged OK [REFERRAL <url>] as a qualified success, not a bare OK",
		timeout: 5000,
	},
	async () => {
		const driver = await unsolicited([
			"a1 OK [REFERRAL IMAP://MATTHEW@SERVER2/] Specified user's personal mailboxes located on Server2, but public mailboxes are available.",
		]);
		const found = await pollFor(() =>
			taggedEvents(driver).some(
				(t) =>
					t.tag?.id === "a1" &&
					t.status?.status === "OK" &&
					t.status?.text?.code?.kind === "REFERRAL",
			),
		);
		expect(
			found,
			"the tagged OK must surface with a parsed REFERRAL resp-code kind — a client " +
				"that cannot distinguish this from a bare OK cannot learn personal mailboxes " +
				"are elsewhere",
		).toBe(true);
		await waitForUntagged(driver, "EXISTS");
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC2221-4.2-1 — an untagged BYE carrying [REFERRAL ...] is a startup
// redirection, not a bare connection refusal (kind-pass)
// ═════════════════════════════════════════════════════════════════════════════
// §4.2 worked example: 'S: * BYE [REFERRAL IMAP://user;AUTH=*@SERVER2/]
// Server not accepting connections. Try SERVER2.' Pre-authentication BYE is
// otherwise indistinguishable from an ordinary refusal unless the client
// inspects the resp-code.
complianceTest(
	{
		reqs: ["RFC2221-4.2-1"],
		profiles: ["rev1", "rev2"],
		title: "client observes an untagged BYE [REFERRAL <url>] as a startup redirection, not a bare refusal",
		timeout: 5000,
	},
	async () => {
		const driver = await unsolicited(
			["* BYE [REFERRAL IMAP://user;AUTH=*@SERVER2/] Server not accepting connections. Try SERVER2."],
			{ bye: true },
		);
		const found = await pollFor(() =>
			serverStatusEvents(driver).some(
				(s) => s.status === "BYE" && s.text?.code?.kind === "REFERRAL",
			),
		);
		expect(
			found,
			"the untagged BYE must surface with a parsed REFERRAL resp-code kind — a " +
				"client that cannot distinguish this from a bare BYE cannot follow the " +
				"startup redirection",
		).toBe(true);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC2193-3-2 / RFC2193-4.1-1 — accept [REFERRAL ...] on tagged NO to
// SELECT/EXAMINE/DELETE/SUBSCRIBE/UNSUBSCRIBE/STATUS/APPEND (kind-pass)
// ═════════════════════════════════════════════════════════════════════════════
// §4.1: 'An IMAP4 server MAY respond to the SELECT, EXAMINE, DELETE,
// SUBSCRIBE, UNSUBSCRIBE, STATUS or APPEND command with one or more IMAP
// mailbox referrals.' Probed here via SELECT's tagged NO.
complianceTest(
	{
		reqs: ["RFC2193-3-2", "RFC2193-4.1-1"],
		profiles: ["rev1", "rev2"],
		title: "client accepts a tagged NO [REFERRAL <url>] to SELECT as a well-formed mailbox referral",
		timeout: 5000,
	},
	async () => {
		const driver = await unsolicited([
			"a1 NO [REFERRAL IMAP://user;AUTH=*@SERVER2/INBOX] Remote mailbox. Try SERVER2.",
		]);
		const found = await pollFor(() =>
			taggedEvents(driver).some(
				(t) =>
					t.tag?.id === "a1" &&
					t.status?.status === "NO" &&
					t.status?.text?.code?.kind === "REFERRAL",
			),
		);
		expect(
			found,
			"the tagged NO to SELECT must surface with a parsed REFERRAL resp-code kind",
		).toBe(true);
		await waitForUntagged(driver, "EXISTS");
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC2193-3-3 — recover EVERY URL when a REFERRAL code carries multiple
// (HONEST VIOLATION)
// ═════════════════════════════════════════════════════════════════════════════
// §3: 'The REFERRAL response code MUST contain as an argument a one or more
// valid URLs separated by a space' with a stated preference ORDER — which
// is meaningless unless every URL (and their order) survives. Probed with
// two replica URLs on a DELETE failure.
complianceTest(
	{
		reqs: ["RFC2193-3-3"],
		profiles: ["rev1", "rev2"],
		title: "the REFERRAL resp-code on a tagged NO exposes every listed URL, in order, when multiple replicas are given",
		timeout: 5000,
	},
	async () => {
		const driver = await unsolicited([
			"a1 NO [REFERRAL IMAP://user;AUTH=*@SERVER2/INBOX IMAP://user;AUTH=*@SERVER3/INBOX] Try another replica.",
		]);
		const found = await pollFor(() => taggedEvents(driver).some((t) => t.tag?.id === "a1"));
		expect(found, "the tagged NO must surface").toBe(true);
		const no = taggedEvents(driver).find((t) => t.tag?.id === "a1");
		expect(no?.status?.status).toBe("NO");
		expect(no?.status?.text?.code?.kind).toBe("REFERRAL");
		// SPEC: both URLs, in the server's preference order, must be exposed.
		// Probed: contents is [] regardless of arity (bare-argument drop applies
		// uniformly whether one or many space-separated URLs are present).
		expect(
			no?.status?.text?.code?.contents,
			"every URL in a multi-replica REFERRAL response code must be exposed, in " +
				"order (RFC 2193 §3) — the client currently discards all of them",
		).toEqual(["IMAP://user;AUTH=*@SERVER2/INBOX", "IMAP://user;AUTH=*@SERVER3/INBOX"]);
		await waitForUntagged(driver, "EXISTS");
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC2193-4.2-1 — accept [REFERRAL ...] on CREATE (kind-pass)
// ═════════════════════════════════════════════════════════════════════════════
complianceTest(
	{
		reqs: ["RFC2193-4.2-1"],
		profiles: ["rev1", "rev2"],
		title: "client accepts a tagged NO [REFERRAL <url>] to CREATE as a well-formed mailbox referral",
		timeout: 5000,
	},
	async () => {
		const driver = await unsolicited([
			"a1 NO [REFERRAL IMAP://user;AUTH=*@SERVER2/NewBox] Try CREATE on SERVER2.",
		]);
		const found = await pollFor(() =>
			taggedEvents(driver).some(
				(t) =>
					t.tag?.id === "a1" &&
					t.status?.status === "NO" &&
					t.status?.text?.code?.kind === "REFERRAL",
			),
		);
		expect(found, "the tagged NO to CREATE must surface with a parsed REFERRAL kind").toBe(
			true,
		);
		await waitForUntagged(driver, "EXISTS");
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC2193-4.3-1 — accept a REFERRAL response-code PAIR on RENAME meaning
// old-name/new-name URLs (HONEST VIOLATION)
// ═════════════════════════════════════════════════════════════════════════════
// §4.3: 'In each pair of IMAP mailbox referrals, the first one is an URL to
// the existing mailbox name and the second is an URL to the requested new
// mailbox name.' A client must recover BOTH, positionally, to interpret the
// pair. Probed: same bare-argument drop applies regardless of arity.
complianceTest(
	{
		reqs: ["RFC2193-4.3-1"],
		profiles: ["rev1", "rev2"],
		title: "the REFERRAL resp-code on a tagged NO to RENAME exposes the old-name/new-name URL pair, positionally",
		timeout: 5000,
	},
	async () => {
		const driver = await unsolicited([
			"a1 NO [REFERRAL IMAP://user;AUTH=*@SERVER2/OldBox IMAP://user;AUTH=*@SERVER2/NewBox] Try RENAME on SERVER2.",
		]);
		const found = await pollFor(() => taggedEvents(driver).some((t) => t.tag?.id === "a1"));
		expect(found, "the tagged NO must surface").toBe(true);
		const no = taggedEvents(driver).find((t) => t.tag?.id === "a1");
		expect(no?.status?.status).toBe("NO");
		expect(no?.status?.text?.code?.kind).toBe("REFERRAL");
		// SPEC: position 1 = old-name URL, position 2 = new-name URL.
		expect(
			no?.status?.text?.code?.contents,
			"the RENAME REFERRAL pair (old-name URL, new-name URL) must be exposed, " +
				"positionally (RFC 2193 §4.3) — the client currently discards both",
		).toEqual(["IMAP://user;AUTH=*@SERVER2/OldBox", "IMAP://user;AUTH=*@SERVER2/NewBox"]);
		await waitForUntagged(driver, "EXISTS");
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC2193-4.4-1 — accept [REFERRAL ...] on COPY (kind-pass)
// ═════════════════════════════════════════════════════════════════════════════
complianceTest(
	{
		reqs: ["RFC2193-4.4-1"],
		profiles: ["rev1", "rev2"],
		title: "client accepts a tagged NO [REFERRAL <url>] to COPY as a well-formed mailbox referral",
		timeout: 5000,
	},
	async () => {
		const driver = await unsolicited([
			"a1 NO [REFERRAL IMAP://user;AUTH=*@SERVER2/Dest] Destination is remote. Try SERVER2.",
		]);
		const found = await pollFor(() =>
			taggedEvents(driver).some(
				(t) =>
					t.tag?.id === "a1" &&
					t.status?.status === "NO" &&
					t.status?.text?.code?.kind === "REFERRAL",
			),
		);
		expect(found, "the tagged NO to COPY must surface with a parsed REFERRAL kind").toBe(true);
		await waitForUntagged(driver, "EXISTS");
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC2193-5.1-1 — RLIST command form (REAL — M5.13)
// ═════════════════════════════════════════════════════════════════════════════
// §5.1: 'RLIST' takes the same reference-name/mailbox-pattern arguments as
// LIST; §6 ABNF: 'rlist = "RLIST" SPACE mailbox SPACE list_mailbox'.
// driver.rlist() is wired (M5.13) through the public
// `list({ referrals: true })` fold-in, which swaps the wire verb to RLIST.
//
// Matcher revised at M5.13 (when this row first ran for real): the original
// pinned form `"" "*"` guessed a QUOTED pattern while the row was
// unimplemented. §6's `list_mailbox` grammar ('1*list-char / string', with
// list-wildcards among list-char) permits the bare-atom form, which is what
// this client emits for a wildcard pattern (same bare convention every
// passing LIST test pins, e.g. `LIST "" %` in appendlimit-7889) — the
// matcher now pins the actual conformant emission and still accepts the
// equally-legal quoted form.
complianceTest(
	{
		reqs: ["RFC2193-5.1-1"],
		profiles: ["rev1", "rev2"],
		title: "RLIST command form: RLIST <reference> <mailbox-pattern>",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				// login: true — RLIST is an authenticated-state verb (same
				// states as LIST); the pre-M5.13 script omitted the login
				// because the driver verb threw before any state check.
				...sessionPrelude(
					ctx.profile === "rev2"
						? ["IMAP4rev2", "LITERAL-", "MAILBOX-REFERRALS"]
						: ["IMAP4rev1", "MAILBOX-REFERRALS"],
					{ login: true, profile: ctx.profile },
				),
				expectLine(command("RLIST", { args: /^"" (?:\*|"\*")$/ })),
				reply("OK RLIST completed", ['* LIST (\\HasNoChildren) "/" "INBOX"']),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user@example.com", "s3cret");
		const infos = await driver.rlist("", "*");
		await server.assertCompleted();
		const rlist = server.commandLines.find((l) => l.verb === "RLIST");
		expect(rlist, "RLIST must have been emitted").toBeDefined();
		expect(rlist!.args, "RLIST takes reference SP mailbox-pattern, same shape as LIST").toMatch(
			/^"" (?:\*|"\*")$/,
		);
		// Non-vacuous: the untagged LIST reply (RFC 2193 §5.1 Responses:
		// untagged LIST) rides back through the same result surface as LIST.
		expect(infos.map((i) => i.name)).toContain("INBOX");
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC2193-5.2-1 — RLSUB command form (REAL — M5.13)
// ═════════════════════════════════════════════════════════════════════════════
// §5.2: 'RLSUB' takes the same arguments as LSUB; §6 ABNF: 'rlsub = "RLSUB"
// SPACE mailbox SPACE list_mailbox'. driver.rlsub() is wired (M5.13)
// through `lsub(ref, pattern, { referrals: true })`, the LSUB sibling of
// the RLIST fold-in; `LsubCommand` swaps the wire verb to RLSUB.
//
// Matcher revised at M5.13, same rationale as RFC2193-5.1-1's above: the
// bare-atom wildcard pattern form is the conformant emission §6's
// `list_mailbox` grammar permits; the quoted form stays accepted as
// equally legal.
complianceTest(
	{
		reqs: ["RFC2193-5.2-1"],
		profiles: ["rev1", "rev2"],
		title: "RLSUB command form: RLSUB <reference> <mailbox-pattern>",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				// login: true — RLSUB is an authenticated-state verb (same
				// states as LSUB); same pre-M5.13 script omission as RLIST's.
				...sessionPrelude(
					ctx.profile === "rev2"
						? ["IMAP4rev2", "LITERAL-", "MAILBOX-REFERRALS"]
						: ["IMAP4rev1", "MAILBOX-REFERRALS"],
					{ login: true, profile: ctx.profile },
				),
				expectLine(command("RLSUB", { args: /^"" (?:\*|"\*")$/ })),
				reply("OK RLSUB completed", ['* LSUB () "/" "INBOX"']),
			],
		]);
		const driver = await f.connectPlain(server);
		await driver.login("user@example.com", "s3cret");
		const infos = await driver.rlsub("", "*");
		await server.assertCompleted();
		const rlsub = server.commandLines.find((l) => l.verb === "RLSUB");
		expect(rlsub, "RLSUB must have been emitted").toBeDefined();
		expect(rlsub!.args, "RLSUB takes reference SP mailbox-pattern, same shape as LSUB").toMatch(
			/^"" (?:\*|"\*")$/,
		);
		// Non-vacuous: the untagged LSUB reply (RFC 2193 §5.2 Responses:
		// untagged LSUB) rides back through the same result surface as LSUB.
		expect(infos.map((i) => i.name)).toContain("INBOX");
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC2221-3-1 — MUST NOT follow >10 levels of referral without consulting the
// user (self-actualizing)
// ═════════════════════════════════════════════════════════════════════════════
// §3: 'A client MUST NOT follow more than 10 levels of referral without
// consulting the user.' Conditional on the client implementing referral-
// following at all — exercising the numeric ceiling would require scripting
// 11 chained servers and a second-connection-per-hop client capability. No
// driver surface follows a referral chain today: LOGIN/AUTHENTICATE always
// throw NotImplementedError before a first referral could even be recovered
// and followed, let alone an 11th — self-actualizing failure, script/matcher
// pinned so the assertion is non-vacuous once referral-following lands.
complianceTest(
	{
		reqs: ["RFC2221-3-1"],
		profiles: ["rev1", "rev2"],
		title: "client does not auto-follow more than 10 levels of chained referral without consulting the user",
		timeout: 5000,
	},
	async () => {
		// Intended script (once a referral-following driver verb exists): chain
		// 11 LOGIN attempts, each replying with a tagged NO [REFERRAL <urlN>]
		// pointing at the next hop; assert the client stops auto-following
		// after the 10th and does not itself issue an unconsulted 12th LOGIN.
		// Today, driver.login() sends a real LOGIN and rejects on the tagged
		// NO [REFERRAL ...] — no referral-following exists to recover and chase
		// the URL, so there is only ever this one LOGIN attempt — self-actualizing.
		const server = await f.startServer();
		server.arm([
			[
				...sessionPrelude(["IMAP4rev1", "LOGIN-REFERRALS"]),
				expectLine(command("LOGIN")),
				reply("NO [REFERRAL IMAP://user;AUTH=*@SERVER2/] Try SERVER2."),
			],
		]);
		const driver = await f.connectPlain(server);
		let err: unknown;
		try {
			await driver.login("user", "pass");
		} catch (e) {
			err = e;
		}
		expect(err, "LOGIN rejected with a REFERRAL must surface as an error").toBeDefined();
		await server.assertCompleted();
		// No referral-following surface exists: only the single scripted LOGIN
		// was ever sent — certainly not an unconsulted 12th attempt.
		const loginCommands = server.commandLines.filter((l) => l.verb === "LOGIN");
		expect(
			loginCommands.length,
			"no referral-following surface exists yet — exactly one LOGIN attempt",
		).toBe(1);
	},
);

// ═════════════════════════════════════════════════════════════════════════════
// RFC2193-3-1 — client MUST be prepared for a URL of any type, though it
// need only process IMAP URLs (REAL — kind-pass leg)
// ═════════════════════════════════════════════════════════════════════════════
// §3: 'A client that supports the REFERRALS extension MUST be prepared for a
// URL of any type, but it need only be able to process IMAP URLs.' 'Be
// prepared for' is satisfied by a graceful non-crash/non-hang response to a
// non-IMAP URL scheme (e.g. 'http:') inside a REFERRAL code — the client is
// not required to act on it, only to not choke on its mere presence. Probed
// via a non-IMAP-scheme URL in a tagged NO's REFERRAL code, mirroring the
// kind-pass legs above: the AtomTextCode fallback's kind-acceptance is
// scheme-agnostic (only the URL argument content itself is dropped, per this
// module's REAL-SIGNAL note — a pre-existing, orthogonal defect, not this
// entry's concern), so the client must still surface the tagged NO with the
// REFERRAL kind intact and continue the session rather than crashing/hanging
// on an unrecognized URL scheme.
complianceTest(
	{
		reqs: ["RFC2193-3-1"],
		profiles: ["rev1", "rev2"],
		title: "client is prepared for (does not crash on) a non-IMAP-scheme URL in a REFERRAL response code",
		timeout: 5000,
	},
	async () => {
		const driver = await unsolicited([
			"a1 NO [REFERRAL http://example.com/not-an-imap-url] See http://example.com/not-an-imap-url instead.",
		]);
		const found = await pollFor(() =>
			taggedEvents(driver).some(
				(t) =>
					t.tag?.id === "a1" &&
					t.status?.status === "NO" &&
					t.status?.text?.code?.kind === "REFERRAL",
			),
		);
		expect(
			found,
			"the tagged NO must surface with a parsed REFERRAL resp-code kind even when " +
				"the enclosed URL is a non-IMAP scheme (RFC 2193 §3: MUST be prepared for a " +
				"URL of any type) — a client choking on/crashing on the unrecognized scheme " +
				"would fail this",
		).toBe(true);
		// "Be prepared for" is satisfied by graceful tolerance, not by acting on
		// the non-IMAP URL — the session must continue normally afterward.
		await waitForUntagged(driver, "EXISTS");
	},
);
