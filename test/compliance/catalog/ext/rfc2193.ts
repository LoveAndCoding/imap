import type { CatalogModule } from "../types";

const rfc2193: CatalogModule = {
	source: "RFC2193",
	extractionNote:
		"Full document reviewed (Abstract, §1 Abstract, §2 Conventions used in this document, " +
		"§3 Introduction and Overview, §4 [4.1 SELECT/EXAMINE/DELETE/SUBSCRIBE/UNSUBSCRIBE/STATUS/" +
		"APPEND Referrals, 4.2 CREATE Referrals, 4.3 RENAME Referrals, 4.4 COPY Referrals], §5.1 " +
		"RLIST command, §5.2 RLSUB Command, §6 Formal Syntax, §6 [duplicate numbering] Security " +
		"Considerations, §7 References, §8 Acknowledgments, §9 Author's Address). Note: the document " +
		"has a genuine section-numbering defect — 'Security Considerations' is labeled '6.' a second " +
		"time, duplicating the Formal Syntax section number; both are cited here by their actual " +
		"content heading rather than papering over the collision. 11 client-binding entries " +
		"extracted, all from §3/§4.1-4.4/§5.1/§5.2, the sections carrying client-directed duties: " +
		"(1) implicit MUST be prepared for a URL of any type in a REFERRAL response code, even though " +
		"it need only process IMAP URLs (testable narrow acceptance/graceful-ignore duty); (2) " +
		"implicit MUST parse/accept a REFERRAL response code (one-or-more URLs) on a tagged NO to " +
		"SELECT/EXAMINE/DELETE/SUBSCRIBE/UNSUBSCRIBE/STATUS/APPEND (testable — REAL candidate, same " +
		"AtomTextCode fallback mechanism as RFC2221); (3) implicit MUST recover ALL listed URLs when " +
		"multiple are given (not just the first) since §3 states a preference ORDER across multiple " +
		"URLs that only matters if every URL is retained (testable, same REAL probe surface, sharper " +
		"than RFC2221 since RFC2193 explicitly anticipates N>1 URLs per response code); (4) implicit " +
		"MUST accept a REFERRAL response code on CREATE (testable, same REAL probe surface); (5) " +
		"implicit MUST accept a REFERRAL response-code PAIR on RENAME, i.e. two URLs meaning old-name/" +
		"new-name rather than a flat multi-replica list (testable — distinct interpretation duty from " +
		"entry 3, since RENAME's multi-URL semantics differ qualitatively from SELECT's replica-list " +
		"semantics); (6) implicit MUST accept a REFERRAL response code on COPY (testable, same REAL " +
		"probe surface); (7) implicit MUST issue RLIST instead of LIST when MAILBOX-REFERRALS is in " +
		"use, so that remote mailboxes are included (testable command-form duty; a driver.rlist() " +
		"verb exists in this worktree as of commit 74a9620 and throws NotImplementedError, so this " +
		"is self-actualizing/unimplemented rather than unreachable for lack of a driver verb); (8) " +
		"implicit MUST issue RLSUB instead of LSUB under the same condition (testable, same " +
		"self-actualizing driver.rlsub()-exists-and-throws-NotImplementedError status); " +
		"(9) implicit MUST connect to the (or each) referral URL's host, honoring its embedded user;" +
		"AUTH=* restriction, to process the referred mailbox (untestable — out-of-band, same multi-" +
		"connection reasoning as RFC2221-4-2, and the identical NOTE text 'user;AUTH=* is specified " +
		"as required by [RFC-2192] to avoid a client falling back to anonymous login' recurs verbatim " +
		"in this document); (10) implicit MUST NOT treat a RENAME's two-URL-same-server referral " +
		"differently from its two-URL-different-server referral at the WIRE level — i.e. the client " +
		"must be able to compare the host components of the pair to decide whether a single " +
		"reissue-on-remote or a constituent CREATE/FETCH/APPEND/DELETE sequence is needed (untestable " +
		"— internal-decision: both interpretations start from the identical two-URL wire shape, and " +
		"which follow-up strategy the client picks is its own internal policy, not something a black-" +
		"box probe of the initial exchange can distinguish). Excluded as server-only: 'IMAP4 servers " +
		"that support this extension MUST list the keyword MAILBOX-REFERRALS in their CAPABILITY " +
		"response' (server capability-advertisement duty; the client-side gating counterpart is " +
		"implicit/untestable/internal-decision for the same reasons as RFC2221's equivalent exclusion " +
		"and already covered by the base CAPABILITY catalog), 'A MAILBOX-REFERRALS capable IMAP4 " +
		"server MUST NOT return referrals that result in a referrals loop' (server-side loop-" +
		"prevention duty), 'If a server replies with multiple URLs for a particular object, they MUST " +
		"all be of the same type... the URL MUST be an IMAP URL' (server-side URL-type-consistency " +
		"duty — the client's corresponding 'handle whatever type shows up' duty is entry 1 above), 'A " +
		"server MAY respond with multiple IMAP mailbox referrals if there is more than one replica' " +
		"and the load-balancing/UIDVALIDITY-sync caveats (server-side replication-strategy prose), " +
		"'Remote mailboxes... SHOULD NOT appear in LIST and LSUB responses... MUST appear in RLIST and " +
		"RLSUB responses' (server-side response-population duty; the client's corresponding 'use RLIST/" +
		"RLSUB to see them' duty is entries 7-8 above), and the closing security-considerations " +
		"paragraph about rogue servers injecting bogus referrals (pure threat-model prose, no " +
		"imperative addressed to the client). §2 Conventions defines terminology only (home server, " +
		"remote mailbox, remote server, shared mailbox, IMAP mailbox referral). §6 Formal Syntax's " +
		"ABNF productions (mailbox_referral, referral_response_code, rlist, rlsub) are wire-form " +
		"grammar already folded into the testable command/response-acceptance entries above, not " +
		"separately-scored duties. REV2/RLIST-RLSUB NOTE (grepped the full rfc9051.txt per the task's " +
		"instruction): RFC 9051 contains ZERO occurrences of 'REFERRAL' anywhere in its body — rev2 " +
		"does not restate, obsolete, or even mention the [REFERRAL ...] response-code mechanism this " +
		"catalog's entries 2-6 depend on. However, RFC 9051's core LIST command DOES explicitly " +
		"address RLIST/RLSUB by name: its REMOTE selection option's defining text is 'Causes the LIST " +
		"command to show remote mailboxes as well as local ones, as described in [RFC2193]. This " +
		"option is intended to replace the RLIST command and, in conjunction with the SUBSCRIBED " +
		"selection option, the RLSUB command.' This means a rev2 client's functional equivalent of " +
		"RLIST/RLSUB is 'LIST (REMOTE) ...' / 'LIST (REMOTE SUBSCRIBED) ...' under core rev2 " +
		"LIST-EXTENDED, not the RLIST/RLSUB command tokens themselves — but RFC 9051 only says REMOTE " +
		"is 'intended to replace' those commands, not that RFC 2193 or its RLIST/RLSUB commands are " +
		"obsoleted, withdrawn, or forbidden; a rev2 server MAY still advertise MAILBOX-REFERRALS and a " +
		"rev2 client MAY still use literal RLIST/RLSUB against it (this is a distinct code path from " +
		"LIST (REMOTE), not a superset/subset relationship the suite can safely collapse). Per the " +
		"plan's instruction, entries 2, 3, 4, 5, 6, 9, and 10 (the REFERRAL-response-code acceptance " +
		"and connection-following duties, which RFC 9051 is entirely silent on) stay dual profiles: " +
		"[\"rev1\",\"rev2\"] as extension-only duties layered atop either base revision. Entries 7-8 " +
		"(issue RLIST/RLSUB in lieu of LIST/LSUB) ALSO stay dual [\"rev1\",\"rev2\"]: RFC 9051's REMOTE " +
		"option is a DIFFERENT, core-rev2 code path with its own (not-cataloged-here, out-of-scope for " +
		"this source) LIST-EXTENDED duties — it does not retroactively convert this RFC's literal " +
		"RLIST/RLSUB command-emission duty into a rev2-core restatement the way RFC5161/RFC9051-6.3.1 " +
		"did for ENABLE, since the command tokens and their wire forms are simply different between " +
		"the two mechanisms. No cross-catalog double-scoring risk: nothing in the RFC9051 catalog " +
		"modules (grepped rfc9051/*.ts: zero REFERRAL/RLIST/RLSUB hits) currently scores the REMOTE " +
		"option, so there is no overlapping entry to adjudicate against, unlike the RFC3348/CHILDREN " +
		"situation this phase also handles elsewhere. REAL-SIGNAL NOTE (mirrors RFC2221's identical " +
		"mechanism and the Phase 5 UNDEFINED-FILTER precedent in ext/rfc5466.ts): 'REFERRAL' is not a " +
		"named text-code kind in src/parser/structure/text.code.ts's switch and falls through to " +
		"`default: code = new AtomTextCode(kind, contents)`. Per §6's ABNF 'referral_response_code = " +
		"\"[\" \"REFERRAL\" 1*(SPACE <url>) \"]\"' the URL(s) are bare space-separated tokens with no " +
		"enclosing parens. HISTORICAL (superseded, M5.16 Finding 7): at AUTHORING TIME, " +
		"AtomTextCode.contents dropped any bare (unparenthesized) argument via " +
		"splitSpaceSeparatedList's default '(' start-token, so the then-expected honest outcome was " +
		"kind === 'REFERRAL' surviving intact (genuine PASS for entries 2, 4, 5, 6) while the URL " +
		"argument(s) — critically including the SECOND URL when RENAME sends a pair, and any THIRD+ " +
		"URL in a multi-replica SELECT response — were expected to be dropped entirely (predicted " +
		"genuine VIOLATION for entries 1 and 3, and for the URL-recovery half of 2/4/5/6). PRESENT " +
		"TRUTH: that bare-argument-drop defect has since been fixed (AtomTextCode now selects null/" +
		"null delimiters for a non-parenthesized argument list, per that class's own doc comment, so " +
		"top-level space-separated bare arguments survive in order instead of being dropped) — every " +
		"one of entries 1-6 now PASSES for real, including the URL-recovery duties (entries 1, 3) this " +
		"note used to predict as violations. Command-emission duties (entries 7-8, RLIST/RLSUB): " +
		"driver.rlist()/driver.rlsub() verbs now exist " +
		"in driver.ts (added by commit 74a9620, Phase 6 Task 1) and throw NotImplementedError, so " +
		"they remain self-actualizing/unimplemented (an honest not-yet-implemented report) rather " +
		"than REAL -- not because the verbs are absent. " +
		"Total: 11 client-binding entries (RFC2193-3-1..4, RFC2193-4.1-1, RFC2193-4.2-1, RFC2193-4.3-1, " +
		"RFC2193-4.3-2, RFC2193-4.4-1, RFC2193-5.1-1, RFC2193-5.2-1). Untestable: 2 " +
		"(RFC2193-3-4 out-of-band; RFC2193-4.3-2 internal-decision).",
	requirements: [
		// ── §3 Introduction and Overview ────────────────────────────────────────

		{
			id: "RFC2193-3-1",
			source: "RFC2193",
			section: "3",
			title: "Client (implicit) MUST be prepared for a URL of any type, though it need only process IMAP URLs",
			text:
				"A client that supports the\n" +
				"REFERRALS extension MUST be prepared for a URL of any type, but it\n" +
				"need only be able to process IMAP URLs.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Explicit RFC 2119 MUST addressed directly to the client (unlike most entries in " +
				"this catalog, which are implicit). 'Be prepared for' is satisfied by a graceful non-" +
				"crash/non-hang response to a non-IMAP URL type (e.g. an http: or ftp: scheme) inside " +
				"a REFERRAL code — the client is not required to act on it, only to not choke on its " +
				"mere presence in the parsed argument list. Conditional on the client supporting " +
				"MAILBOX-REFERRALS at all.",
		},
		{
			id: "RFC2193-3-2",
			source: "RFC2193",
			section: "3",
			title: "Client (implicit) MUST parse/accept a REFERRAL response code on a tagged NO to SELECT/EXAMINE/DELETE/SUBSCRIBE/UNSUBSCRIBE/STATUS/APPEND",
			text:
				"A referral response consists of a tagged NO response and a REFERRAL\n" +
				"response code.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit MUST from a definitional sentence, reinforced by §4.1's " +
				"'An IMAP4 server MAY respond to the SELECT, EXAMINE, DELETE, SUBSCRIBE, UNSUBSCRIBE, " +
				"STATUS or APPEND command with one or more IMAP mailbox referrals' and its worked " +
				"DELETE/SELECT examples). REAL-SIGNAL CANDIDATE: 'REFERRAL' falls through to the " +
				"AtomTextCode default branch (no dedicated text-code class); kind should surface " +
				"intact on the tagged NO's status.text.code — genuine PASS expected for the kind-" +
				"acceptance half. See this module's extractionNote for the full REAL-SIGNAL analysis.",
		},
		{
			id: "RFC2193-3-3",
			source: "RFC2193",
			section: "3",
			title: "Client (implicit) MUST recover every URL when a REFERRAL response code carries multiple",
			text:
				"If the server has a preferred order in which the client should\n" +
				"attempt to access the URLs, the preferred URL SHOULD be listed in the\n" +
				"first, with the remaining URLs presented in descending order of\n" +
				"preference.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit MUST: a stated preference ORDER across multiple URLs is " +
				"meaningless unless the client retains every URL and their relative order, not merely " +
				"the first one it happens to notice). Grounded in §3's 'The REFERRAL response code " +
				"MUST contain as an argument a one or more valid URLs separated by a space' and 'A " +
				"server MAY respond with multiple IMAP mailbox referrals if there is more than one " +
				"replica of the mailbox.' HISTORICAL (superseded, M5.16 Finding 7): at authoring time " +
				"this note predicted a genuine VIOLATION, reasoning that AtomTextCode's bare-argument " +
				"handling emptied code.contents for any unparenthesized argument list (REFERRAL's URLs " +
				"included) regardless of count. That defect was since fixed by the AtomTextCode bare-" +
				"argument split (src/parser/structure/text.code.ts: a leading '(' selects the " +
				"parenthesized-tuple delimiters, anything else selects null/null so top-level space-" +
				"separated bare arguments — e.g. REFERRAL's URL list — survive in order instead of " +
				"being silently dropped) — this row now PASSES for real: every listed URL is recovered, " +
				"in order.",
		},

		// ── §4.1 SELECT, EXAMINE, DELETE, SUBSCRIBE, UNSUBSCRIBE, STATUS and APPEND Referrals ──

		{
			id: "RFC2193-4.1-1",
			source: "RFC2193",
			section: "4.1",
			title: "Client (implicit) MUST accept a REFERRAL response code on SELECT/EXAMINE/DELETE/SUBSCRIBE/UNSUBSCRIBE/STATUS/APPEND specifically",
			text:
				"An IMAP4 server MAY respond to the SELECT, EXAMINE, DELETE,\n" +
				"SUBSCRIBE, UNSUBSCRIBE, STATUS or APPEND command with one or more\n" +
				"IMAP mailbox referrals to indicate to the client that the mailbox is\n" +
				"hosted on a remote server.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit MUST from the server-permission MAY sentence, scoped to " +
				"this specific named set of seven commands as distinct from CREATE/RENAME/COPY which " +
				"get their own §4.2-4.4 treatment and their own entries below). Same REAL-signal " +
				"parse surface as RFC2193-3-2 (this entry names the concrete command set the general " +
				"duty applies to); currently exercisable only via SELECT/EXAMINE/DELETE etc., all of " +
				"which throw NotImplementedError, so a test must use the unsolicited/pre-scripted-" +
				"response harness pattern (as RFC5466-3.1-2 does) rather than driver command-emission " +
				"to reach the REAL parse surface.",
		},

		// ── §4.2 CREATE Referrals ────────────────────────────────────────────────

		{
			id: "RFC2193-4.2-1",
			source: "RFC2193",
			section: "4.2",
			title: "Client (implicit) MUST accept a REFERRAL response code on CREATE",
			text:
				"An IMAP4 server MAY respond to the CREATE command with one or more\n" +
				"IMAP mailbox referrals, if it wishes to direct the client to issue\n" +
				"the CREATE against another server.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit MUST from the server-permission MAY sentence and the " +
				"worked CREATE example). Same REAL-signal parse surface as the other REFERRAL-" +
				"acceptance entries in this catalog; CREATE throws NotImplementedError in the " +
				"driver today.",
		},

		// ── §4.3 RENAME Referrals ────────────────────────────────────────────────

		{
			id: "RFC2193-4.3-1",
			source: "RFC2193",
			section: "4.3",
			title: "Client (implicit) MUST accept a REFERRAL response-code PAIR on RENAME meaning old-name/new-name URLs",
			text:
				"An IMAP4 server MAY respond to the RENAME command with one or more\n" +
				"pairs of IMAP mailbox referrals.  In each pair of IMAP mailbox\n" +
				"referrals, the first one is an URL to the existing mailbox name and\n" +
				"the second is an URL to the requested new mailbox name.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit MUST from the server-permission MAY sentence). Kept " +
				"distinct from RFC2193-3-3 (recover every URL) because RENAME's two-URL semantics are " +
				"a PAIRED interpretation (URL 1 = old name, URL 2 = new name) rather than a flat list " +
				"of interchangeable replica URLs as in SELECT/multi-replica responses — a client must " +
				"assign positional meaning to the pair, not merely retain both strings. HISTORICAL " +
				"(superseded, M5.16 Finding 7): at authoring time this note predicted a genuine " +
				"VIOLATION identical in kind to RFC2193-3-3's, reasoning that the same AtomTextCode " +
				"bare-argument-drop defect applied to every URL in the pair equally. Since fixed by the " +
				"AtomTextCode bare-argument split (see RFC2193-3-3's own note for the mechanism) — this " +
				"row now PASSES for real: both URLs in the pair are recovered, positionally.",
		},
		{
			id: "RFC2193-4.3-2",
			source: "RFC2193",
			section: "4.3",
			title: "Client (implicit) MUST decide same-server-reissue vs. constituent-command-sequence based on comparing the RENAME referral pair's hosts",
			text:
				"If within an IMAP mailbox referral pair, the existing and new mailbox\n" +
				"URLs are on the same server it is an indication that the currently\n" +
				"connected server is unable to perform the operation.  The client can\n" +
				"simply re-issue the RENAME command on the remote server.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"Both the same-server and different-server cases begin from an identical two-URL " +
				"wire shape (a tagged NO with a [REFERRAL url1 url2] code); the RFC itself offers the " +
				"different-server follow-up only as a MAY ('the client MAY issue the constituent " +
				"CREATE, FETCH, APPEND, and DELETE commands against both servers'). Which strategy — " +
				"simple reissue vs. constituent-command decomposition — the client picks after " +
				"comparing the two URLs' host components is an internal decision-procedure choice " +
				"with no distinguishing wire consequence visible from the initial RENAME exchange " +
				"alone; both a client that always decomposes and one that compares hosts first are " +
				"indistinguishable in a single scripted probe of that exchange.",
			notes:
				"Judgment level and explicitly MAY-worded for the different-server branch ('the " +
				"client MAY issue the constituent CREATE, FETCH, APPEND, and DELETE commands'); the " +
				"same-server branch is phrased as a factual indication plus a simple imperative-mood " +
				"description ('The client can simply re-issue') rather than a MUST. Distinct from " +
				"RFC2193-4.3-1 (accept the pair at all) — this entry is about the client's downstream " +
				"choice of remediation strategy once the pair has been recovered, not about parsing " +
				"the pair itself.",
		},

		// ── §4.4 COPY Referrals ──────────────────────────────────────────────────

		{
			id: "RFC2193-4.4-1",
			source: "RFC2193",
			section: "4.4",
			title: "Client (implicit) MUST accept a REFERRAL response code on COPY",
			text:
				"An IMAP4 server MAY respond to the COPY command with one or more IMAP\n" +
				"mailbox referrals.  This indicates that the destination mailbox is on\n" +
				"a remote server.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit MUST from the server-permission MAY sentence and the " +
				"worked COPY example). Same REAL-signal parse surface as the other REFERRAL-" +
				"acceptance entries; COPY throws NotImplementedError in the driver today.",
		},

		// ── §5.1 RLIST command ───────────────────────────────────────────────────

		{
			id: "RFC2193-5.1-1",
			source: "RFC2193",
			section: "5.1",
			title: "Client (implicit) MUST issue RLIST rather than LIST to see remote mailboxes when using MAILBOX-REFERRALS",
			text:
				"A MAILBOX-REFERRALS capable client will issue the RLIST and RLSUB\n" +
				"commands in lieu of LIST and LSUB.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (stated as a factual description — 'will issue' — of what a " +
				"MAILBOX-REFERRALS capable client does, not a keyword sentence, but functions " +
				"normatively in context: §3 explains that remote mailboxes 'SHOULD NOT appear in " +
				"LIST and LSUB responses... [but] MUST appear in RLIST and RLSUB responses', so a " +
				"client that keeps issuing plain LIST cannot discover its remote mailboxes at all). " +
				"Command-form wire shape pinned by §5.1's RLIST syntax (Arguments: reference name, " +
				"mailbox name with possible wildcards; Responses: untagged LIST; Result: OK/NO/BAD) " +
				"and §6's ABNF 'rlist = \"RLIST\" SPACE mailbox SPACE list_mailbox'. A driver.rlist() " +
				"verb exists in test/compliance/driver/driver.ts in this worktree (added by commit " +
				"74a9620, Phase 6 Task 1) and throws NotImplementedError — self-actualizing " +
				"unimplemented (the verb exists and honestly reports its own absence of a real " +
				"implementation), not yet a REAL probe surface.",
		},

		// ── §5.2 RLSUB Command ───────────────────────────────────────────────────

		{
			id: "RFC2193-5.2-1",
			source: "RFC2193",
			section: "5.2",
			title: "Client (implicit) MUST issue RLSUB rather than LSUB to see remote mailboxes when using MAILBOX-REFERRALS",
			text:
				"The RLIST and RLSUB commands\n" +
				"behave identically to their LIST and LSUB counterparts, except remote\n" +
				"mailboxes are returned in addition to local mailboxes in the LIST and\n" +
				"LSUB responses.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level, same normative-in-context reasoning as RFC2193-5.1-1, kept as a " +
				"distinct entry because RLSUB is its own command with its own §5.2 syntax block " +
				"(Arguments: reference name, mailbox name with possible wildcards; Responses: " +
				"untagged LSUB; Result: OK/NO/BAD) and its own ABNF production ('rlsub = \"RLSUB\" " +
				"SPACE mailbox SPACE list_mailbox'), distinct from RLIST's. A driver.rlsub() verb " +
				"exists in driver.ts in this worktree (added by commit 74a9620, Phase 6 Task 1) and " +
				"throws NotImplementedError; same self-actualizing-unimplemented status as " +
				"RFC2193-5.1-1.",
		},

		// ── §3 Introduction and Overview (connection-following duty) ────────────

		{
			id: "RFC2193-3-4",
			source: "RFC2193",
			section: "3",
			title: "Client (implicit) MUST connect to the referral URL's host and honor its embedded auth restriction when processing a referred mailbox",
			text: "user;AUTH=* is specified as required by [RFC-2192] to avoid a\nclient falling back to anonymous login.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "out-of-band",
			untestableRationale:
				"Identical reasoning to RFC2221-4-2: fully exercising this duty requires the client " +
				"to open a second connection to the referral URL's host and carry the user;AUTH=* " +
				"restriction into a follow-up AUTHENTICATE/LOGIN there. This suite's harness scripts " +
				"a single connection per test and has no driver verb that follows a parsed referral " +
				"URL into a new connection, making this a genuine out-of-band, multi-connection " +
				"integration behavior rather than something a black-box single-session probe can " +
				"observe.",
			notes:
				"Judgment level (implicit MUST derived from the NOTE's stated purpose, identical " +
				"wording and reasoning to RFC2221-4-2 — this document's NOTE, 'user;AUTH=* is " +
				"specified as required by [RFC-2192] to avoid a client falling back to anonymous " +
				"login', is the mailbox-referral counterpart of RFC 2221's identical login-referral " +
				"NOTE). §4.1's 'When a client processes an IMAP mailbox referral, it will open a new " +
				"connection or use an existing connection to the remote server so that it is able to " +
				"issue the commands necessary to process the remote mailbox' is the connection-" +
				"establishment half of this same duty, cited together rather than as a separate entry " +
				"since both describe the single act of following a referral to a live connection.",
		},
	],
};

export default rfc2193;
