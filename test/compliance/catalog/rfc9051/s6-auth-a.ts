import type { SpecRequirement } from "../types";

export const note =
	"§6.3.1–§6.3.6 (RFC 9051 §6.3 'Client Commands - Authenticated State', subsections ENABLE " +
	"through RENAME; confirmed boundaries by locating both the ToC and body headings — §6.3.1 " +
	"ENABLE, §6.3.2 SELECT, §6.3.3 EXAMINE, §6.3.4 CREATE, §6.3.5 DELETE, §6.3.6 RENAME, ending " +
	"immediately before §6.3.7 SUBSCRIBE). " +
	"§6.3.1 ENABLE — NEW client command in rev2 (RFC3501 has no counterpart). 3 client-binding " +
	"entries extracted: (1) SHOULD only include extensions that need to be enabled, judged " +
	"untestable (internal-decision: 'needs to be enabled' is the client's own technical judgment, " +
	"not wire-observable — a client that always includes an extension it happens to support is " +
	"behaviorally indistinguishable from one that filters by need); (2) MUST NOT issue ENABLE " +
	"after SELECT/EXAMINE, testable; (3) implicit MUST (judgment call, no RFC 2119 keyword) that " +
	"pipelining ENABLE with a following command is permitted / not an error condition, derived " +
	"from the explicit 'no limitations on pipelining ENABLE' statement plus the worked LOGIN-then-" +
	"ENABLE / ENABLE-then-SELECT examples. Server-only obligations excluded: per-argument ignore/" +
	"enable rules (MUST, bind the server's ENABLE processing), the MUST to send untagged ENABLED, " +
	"the SHOULD scoping each ENABLED response to its triggering ENABLE, and the MUST NOT change " +
	"CAPABILITY as a result of ENABLE (all describe server response-generation duties with no " +
	"paired client parsing/behavior sentence carrying its own keyword, unlike the analogous " +
	"EXAMINE/[READ-ONLY] case in §6.3.3). " +
	"§6.3.2 SELECT — 3 entries: (1) judgment-SHOULD (lowercase 'should' in 'the client should " +
	"assume that all flags can be changed permanently' — RFC 8174 judgment call, treated as a " +
	"real but weaker-than-uppercase SHOULD) on the PERMANENTFLAGS-omitted default, narrower than " +
	"RFC3501-6.3.1-1's four-item omnibus default clause because rev2's SELECT prose ties each " +
	"default to its own item and only PERMANENTFLAGS carries an explicit 'should' sentence in " +
	"this section (UIDNEXT/UIDVALIDITY/FLAGS/EXISTS/LIST are all REQUIRED in rev2's Responses " +
	"table, so the RFC3501 four-item compatibility clause has no rev2 counterpart); (2) implicit-" +
	"MUST (judgment call, carried forward unchanged in substance from RFC3501-6.3.1-2) that a " +
	"failed SELECT leaves no mailbox selected; (3) new-in-rev2 SHOULD-level advisory (judgment " +
	"call on 'advised to ignore', which uses no RFC 2119 keyword but is squarely client-directed) " +
	"that a pure IMAP4rev2 client ignores an untagged RECENT response from an IMAP4rev1-compliant " +
	"server. Server-only obligations excluded: the untagged-data-before-OK MUST, the LIST-" +
	"response-with-OLDNAME MUST, the CLOSED-response-code MUST, and the READ-WRITE/READ-ONLY " +
	"response-code SHOULD/MUST (this last pair is folded into the §6.3.3 EXAMINE entry per the " +
	"RFC3501 catalog's established treatment, since the EXAMINE-specific sentence is the one that " +
	"names a concrete client-facing response code with no server-only framing device). " +
	"§6.3.3 EXAMINE — 1 entry (tagged OK response MUST begin with [READ-ONLY]), unchanged in " +
	"substance from RFC3501-6.3.2-1. " +
	"§6.3.4 CREATE — 0 client-binding normative statements. All MUST/SHOULD/MAY keywords bind " +
	"the server (reject-or-convert non-Net-Unicode names, OLDNAME LIST on normalization, " +
	"\\Subscribed attribute on auto-subscribe, ignore trailing-hierarchy-delimiter declaration, " +
	"create superior hierarchy, new UID values MUST exceed the prior incarnation's). This is a " +
	"strict superset of RFC3501-6.3.3's server-only obligations, adding rev2's Net-Unicode/OLDNAME " +
	"machinery, all still server-side. " +
	"§6.3.5 DELETE — 0 client-binding normative statements. All keywords bind the server (MUST " +
	"NOT remove inferior hierarchical names, error on \\Noselect-with-children, SHOULD disallow " +
	"with HASCHILDREN / MAY allow via \\Noselect, MUST preserve highest-used UID, SHOULD return " +
	"OLDNAME on normalization, MAY announce via unsolicited LIST). Same server-only shape as " +
	"RFC3501-6.3.4, plus rev2's OLDNAME addition (still server-side). " +
	"§6.3.6 RENAME — 1 entry, new in rev2 relative to RFC3501-6.3.5 (which had zero client-" +
	"binding entries): implicit-MUST (judgment call, no RFC 2119 keyword) that a client be able " +
	"to handle a failed RENAME of INBOX, drawn from the explicit parenthetical warning that some " +
	"servers reject INBOX rename with a tagged NO. Server-only obligations excluded: inferior-" +
	"name MUST-also-rename, superior-hierarchy-creation SHOULD, highest-used-UID-preservation " +
	"MUST, INBOX-rename special behavior, OLDNAME SHOULD on normalization, \\Subscribed-attribute " +
	"MUST on auto-subscribe (all server-side, same shape as RFC3501-6.3.5 plus rev2's OLDNAME/" +
	"Net-Unicode additions). " +
	"Total: 8 client-binding entries (RFC9051-6.3.1-1..3, RFC9051-6.3.2-1..3, RFC9051-6.3.3-1, " +
	"RFC9051-6.3.6-1). Untestable: 1 (RFC9051-6.3.1-1, theme internal-decision).";

export const requirements: SpecRequirement[] = [
	// ── §6.3.1 ENABLE (new client command in rev2) ─────────────────────────────

	{
		id: "RFC9051-6.3.1-1",
		source: "RFC9051",
		section: "6.3.1",
		title: "Client SHOULD only include extensions that need to be enabled",
		text: "Clients SHOULD only include extensions that need to be enabled by the server.",
		level: "SHOULD",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "untestable",
		untestableTheme: "internal-decision",
		untestableRationale:
			"Whether a given extension 'needs to be enabled' is the client's own internal " +
			"determination about its capability negotiation strategy, not something observable " +
			"from the ENABLE command on the wire. A client that includes an extension it happens " +
			"to support (but does not strictly need enabled) is behaviorally indistinguishable, " +
			"at the protocol level, from one that first checks necessity before including it — " +
			"both send a syntactically identical ENABLE argument list. No black-box test can " +
			"distinguish a principled 'only if needed' client from an unconditional one, because " +
			"'needs to be enabled' is a design-time property of the extension (does it change wire " +
			"behavior the client must adapt to?), not a per-connection runtime signal.",
		notes:
			"Applies only when the client chooses to use ENABLE at all (conditional on the client " +
			"implementing/using any enable-requiring extension). Context: 'Several IMAP extensions " +
			"allow the server to return unsolicited responses specific to these extensions... ENABLE " +
			"provides an explicit indication from the client that it supports particular extensions.' " +
			"Example extension named in this section's worked example is CONDSTORE [RFC7162].",
	},
	{
		id: "RFC9051-6.3.1-2",
		source: "RFC9051",
		section: "6.3.1",
		title: "Client MUST NOT issue ENABLE after SELECT/EXAMINE",
		text: "Clients MUST NOT issue ENABLE once they SELECT/EXAMINE a mailbox;",
		level: "MUST NOT",
		applicability: "always",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"Full context: 'The ENABLE command is only valid in the authenticated state, before " +
			"any mailbox is selected.' The clause 'however, server implementations don't have to " +
			"check that no mailbox is selected or was previously selected during the duration of a " +
			"connection' is a server-side leniency note (servers are not required to enforce this), " +
			"but the prohibition is squarely on the client and is quoted verbatim on its own since " +
			"it is a complete, independently normative sentence. Testable: observe that the client " +
			"never sends ENABLE after a successful (or even attempted) SELECT/EXAMINE in the same " +
			"connection.",
	},
	{
		id: "RFC9051-6.3.1-3",
		source: "RFC9051",
		section: "6.3.1",
		title: "Client may pipeline ENABLE with an immediately following command",
		text:
			"There are no limitations on pipelining ENABLE. For example, it is possible to send " +
			"ENABLE and then immediately SELECT, or a LOGIN immediately followed by ENABLE.",
		level: "MAY",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"No RFC 2119 keyword; judgment call reading this as an explicit MAY-level permission " +
			"(the sentence exists specifically to lift any implicit pipelining restriction a client " +
			"might otherwise assume applies to ENABLE, mirroring the general pipelining permissions " +
			"of §5.5). Distinguished from RFC9051-6.3.1-2: that entry prohibits ENABLE strictly " +
			"after a mailbox is selected; this entry affirms that ENABLE may be pipelined with an " +
			"adjacent command (LOGIN, SELECT) without waiting for the prior command's completion " +
			"response. Testable: a client exercising pipelining may send 'LOGIN ...' immediately " +
			"followed by 'ENABLE ...' (or 'ENABLE ...' immediately followed by 'SELECT ...') on the " +
			"wire without waiting for the intervening tagged response; a test can observe that the " +
			"client does not artificially serialize these when it otherwise pipelines.",
	},

	// ── §6.3.2 SELECT ─────────────────────────────────────────────────────────

	{
		id: "RFC9051-6.3.2-1",
		source: "RFC9051",
		section: "6.3.2",
		title: "Client should assume all flags are permanent when PERMANENTFLAGS is omitted",
		text:
			"OK [PERMANENTFLAGS (<list of flags>)] A list of message flags that the client can " +
			"change permanently. If this is missing, the client should assume that all flags can " +
			"be changed permanently.",
		level: "SHOULD",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"Lowercase 'should' in the source text (RFC 9051 postdates RFC 8174, which asks authors " +
			"to reserve uppercase for RFC 2119 keywords and treats lowercase usage as deliberately " +
			"weaker/descriptive). Judgment call: recorded at level SHOULD because the sentence still " +
			"states a concrete, testable default-assumption duty, but the lowercase form is noted " +
			"here as the reason no stronger level is claimed. Narrower in rev2 than RFC3501-6.3.1-1's " +
			"four-item omnibus compatibility clause (FLAGS/EXISTS/RECENT/UIDNEXT/UIDVALIDITY/" +
			"PERMANENTFLAGS all-missing-data defaults): in rev2, FLAGS, EXISTS, LIST are REQUIRED " +
			"untagged responses and UIDNEXT/UIDVALIDITY are REQUIRED OK untagged responses per the " +
			"§6.3.2 Responses table, so only PERMANENTFLAGS remains an omittable item with its own " +
			"stated default in this section. Applies whenever the server's tagged OK to SELECT omits " +
			"the PERMANENTFLAGS response code. Testable: after a SELECT whose OK response carries no " +
			"[PERMANENTFLAGS ...] code, the client does not refuse to attempt permanent flag changes " +
			"(e.g., STORE without \\*) that it would otherwise attempt against a mailbox that " +
			"advertised those flags as permanent.",
	},
	{
		id: "RFC9051-6.3.2-2",
		source: "RFC9051",
		section: "6.3.2",
		title: "Client must track that a failed SELECT leaves no mailbox selected",
		text:
			"The SELECT command automatically deselects any currently selected mailbox before " +
			"attempting the new selection. Consequently, if a mailbox is selected and a SELECT " +
			"command that fails is attempted, no mailbox is selected.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"Carried forward unchanged in substance from RFC3501-6.3.1-2 (identical sentence pair " +
			"in rev2's §6.3.2). No RFC 2119 keyword; the sentence describes a mandatory protocol " +
			"state-machine invariant. Judgment: implicit MUST, same reasoning as the RFC3501 entry — " +
			"a client that treats a failed SELECT as leaving the previous mailbox selected would " +
			"issue subsequent Selected-state commands against a mailbox it is no longer in. " +
			"Testable: send SELECT for a non-existent mailbox when a mailbox is already selected; " +
			"observe that the client does not issue Selected-state commands (e.g., FETCH, STORE) " +
			"after the tagged NO.",
	},
	{
		id: "RFC9051-6.3.2-3",
		source: "RFC9051",
		section: "6.3.2",
		title: "Pure IMAP4rev2 client is advised to ignore an untagged RECENT response",
		text:
			"Note that IMAP4rev1-compliant servers can also send the untagged RECENT response " +
			"that was deprecated in IMAP4rev2, e.g., \"* 0 RECENT\". Pure IMAP4rev2 clients are " +
			"advised to ignore the untagged RECENT response.",
		level: "SHOULD",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"New in rev2 (RFC3501 has no counterpart; \\Recent/RECENT is native rev1 vocabulary " +
			"there, not deprecated). No RFC 2119 keyword; 'advised to ignore' is judged as an " +
			"implicit SHOULD (weaker than a MUST-level prohibition, since a client is not forbidden " +
			"from acting on RECENT, merely advised the value is no longer meaningful in rev2). " +
			"Applies only to a client interacting with a server that is IMAP4rev1-compliant (or " +
			"otherwise still emitting RECENT) while the client itself operates as 'pure IMAP4rev2' " +
			"(applicability conditional on that server behavior; the client cannot control whether " +
			"the server sends this deprecated response). Testable: on receipt of an unsolicited " +
			"untagged '* n RECENT' response, the client does not treat it as authoritative mailbox " +
			"state (e.g., does not surface a 'recent count' derived from it, does not fail/error on " +
			"an unexpected response) but continues normal operation.",
	},

	// ── §6.3.3 EXAMINE ────────────────────────────────────────────────────────

	{
		id: "RFC9051-6.3.3-1",
		source: "RFC9051",
		section: "6.3.3",
		title: "Client must recognise [READ-ONLY] in tagged OK response to EXAMINE",
		text:
			"The text of the tagged OK response to the EXAMINE command MUST begin with the " +
			"\"[READ-ONLY]\" response code.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"Unchanged in substance from RFC3501-6.3.2-1. The MUST keyword binds the server to " +
			"send [READ-ONLY]; the client-binding implication (same reasoning as the RFC3501 entry) " +
			"is that a conforming client MUST parse and respect this response code to know it is in " +
			"a read-only Selected state. Testable: after EXAMINE the server response MUST carry " +
			"[READ-ONLY]; a client that ignores this and attempts write operations (e.g., STORE " +
			"\\Deleted) violates the protocol constraint. 'EXAMINE is identical to SELECT and " +
			"returns the same output; however, the selected mailbox is identified as read-only. No " +
			"changes to the permanent state of the mailbox, including per-user state, are permitted' " +
			"is server-side descriptive/prohibitive framing with no separate client-facing keyword " +
			"sentence and is not separately catalogued.",
	},

	// ── §6.3.4 CREATE ─────────────────────────────────────────────────────────
	// No client-binding normative statements. All RFC 2119 keywords (reject-or-convert
	// non-Net-Unicode names; OLDNAME LIST on normalization; \Subscribed on auto-subscribe;
	// ignore trailing-delimiter declaration; create superior hierarchy; new UID values MUST
	// exceed prior incarnation's) bind the server.

	// ── §6.3.5 DELETE ─────────────────────────────────────────────────────────
	// No client-binding normative statements. All RFC 2119 keywords (MUST NOT remove inferior
	// hierarchical names; SHOULD disallow with HASCHILDREN / MAY allow via \Noselect; MUST
	// preserve highest-used UID; SHOULD return OLDNAME on normalization; MAY announce via
	// unsolicited LIST) bind the server.

	// ── §6.3.6 RENAME ─────────────────────────────────────────────────────────

	{
		id: "RFC9051-6.3.6-1",
		source: "RFC9051",
		section: "6.3.6",
		title: "Client needs to be able to handle failure of a RENAME of INBOX",
		text:
			"Renaming INBOX is permitted and does not result in a tagged BAD response, and it has " +
			"special behavior: It moves all messages in INBOX to a new mailbox with the given name, " +
			"leaving INBOX empty. ... (Note that some servers disallow renaming INBOX by returning " +
			"a tagged NO response, so clients need to be able to handle the failure of such RENAME " +
			"commands.)",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"New in rev2 relative to RFC3501-6.3.5, which had zero client-binding entries; this " +
			"parenthetical note has no RFC3501 counterpart. Elision (marked '...') removes an " +
			"intervening sentence about inferior-hierarchical-name behavior on INBOX rename that is " +
			"a server-side descriptive clause unrelated to this duty, preserving the direct textual " +
			"link between 'renaming INBOX is permitted' and the parenthetical about handling its " +
			"failure. No RFC 2119 keyword ('need to be able to handle'); judgment: implicit MUST, " +
			"analogous to RFC3501-6.3.1-2/RFC9051-6.3.2-2's state-machine-robustness pattern — a " +
			"client that cannot gracefully handle a tagged NO in response to 'RENAME INBOX ...' " +
			"(e.g., crashes, corrupts its mailbox-state tracking, or assumes the rename always " +
			"succeeds) fails to interoperate with the (permitted) subset of servers that reject " +
			"INBOX renames. Applicability conditional: only binds a client that issues RENAME with " +
			"INBOX as the existing-mailbox-name argument. Testable: issue 'RENAME INBOX newname', " +
			"respond with a tagged NO; observe the client surfaces/handles the failure (e.g., " +
			"through its normal command-failure path) rather than behaving as though INBOX had been " +
			"renamed.",
	},
];
