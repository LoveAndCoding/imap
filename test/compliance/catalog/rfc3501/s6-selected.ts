import type { SpecRequirement } from "../types";

export const note =
	"§6.4.1 CHECK: extracted 1 client requirement (MAY issue CHECK as keep-alive / to flush pending expunges). " +
	"§6.4.2 CLOSE: no client-binding normative requirements (CLOSE semantics bind the server; client just issues the command). " +
	"§6.4.3 EXPUNGE: extracted 1 client requirement (MUST be prepared to receive untagged EXISTS after EXPUNGE). " +
	"§6.4.4 SEARCH: extracted 2 client requirements (CHARSET argument must precede search keys; client must treat tagged NO as 'charset unsupported' rather than protocol error). " +
	"§6.4.5 FETCH: extracted 5 client requirements (BODY[<section>] sets \\Seen; BODY.PEEK does not; ALL/FAST/FULL macros must be used standalone, not inside parenthesized item lists; client MUST be prepared to receive unsolicited FETCH). " +
	"§6.4.6 STORE: extracted 1 client requirement (MUST expect FETCH response even for SILENT STORE when message flags change as a side-effect). " +
	"§6.4.7 COPY: no client-binding normative requirements (all obligations in this section are server-side: SHOULD refuse if destination absent, MUST NOT auto-create mailbox, MUST return OK on success). " +
	"§6.4.8 UID: extracted 4 client requirements (MUST use UID for cross-session message identity; SHOULD NOT assume sequence-number persistence; MUST NOT use UID value 0; UID prefix is limited to COPY/FETCH/STORE/SEARCH sub-commands). " +
	"§6.5 Experimental/Expansion: no client-binding requirements (framing description only). " +
	"§6.5.1 X<atom>: extracted 1 client requirement (client MUST NOT use X<atom> commands not defined or agreed; must handle tagged BAD from unsupported experimental commands).";

export const requirements: SpecRequirement[] = [

	// §6.4.1 CHECK ──────────────────────────────────────────────────────────────

	{
		id: "RFC3501-6.4.1-1",
		source: "RFC3501",
		section: "6.4.1",
		title: "Client MAY issue CHECK periodically as keep-alive and to flush pending expunges",
		text:
			"The client MAY issue a CHECK command at periodic intervals as a \"keep alive\" mechanism, " +
			"in addition to using it to flush on demand any pending server expunges that the server is caching.",
		level: "MAY",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"Applicability is 'conditional' because this is an optional client strategy; the client is " +
			"not required to send CHECK at all. Testable in the sense that a client that does send CHECK " +
			"for keep-alive/flush purposes is conforming.",
	},

	// §6.4.2 CLOSE ─────────────────────────────────────────────────────────────
	// No client-binding normative statements in this section. CLOSE semantics
	// (permanent removal of \Deleted messages, return to authenticated state, no
	// untagged EXPUNGE) are all server obligations. The section contains no
	// MUST/SHOULD/MAY that binds the client.

	// §6.4.3 EXPUNGE ────────────────────────────────────────────────────────────

	{
		id: "RFC3501-6.4.3-1",
		source: "RFC3501",
		section: "6.4.3",
		title: "Client MUST be prepared to receive untagged EXISTS after EXPUNGE",
		text:
			"After an EXPUNGE command has been issued, the client MUST be prepared to receive an " +
			"untagged EXISTS response for the new number of messages in the mailbox before the tagged " +
			"response to the EXPUNGE command.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"Applicability is 'conditional' because the obligation fires only when the client has " +
			"issued an EXPUNGE command. The server may or may not send the untagged EXISTS; the client " +
			"must be prepared to handle it if it arrives.",
	},

	// §6.4.4 SEARCH ─────────────────────────────────────────────────────────────
	//
	// The SEARCH section's client-binding normative content is sparse. The MUST
	// about returning a tagged NO for unsupported CHARSET is a server obligation.
	// However, the wording creates an implicit client expectation: when the client
	// specifies CHARSET, it must interpret a tagged NO (not BAD) as "charset
	// unsupported". There is also a prose rule that the OPTIONAL [CHARSET]
	// specification must be placed before the search criteria.

	{
		id: "RFC3501-6.4.4-1",
		source: "RFC3501",
		section: "6.4.4",
		title: "Client MUST place optional CHARSET specification before search criteria",
		text:
			"The OPTIONAL [CHARSET] specification indicates the [CHARSET] of the strings used in the " +
			"search criteria. US-ASCII [CHARSET] is assumed if the [CHARSET] specification is omitted.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"No explicit 2119 keyword for the client; the grammar rule is imperative ('specification " +
			"indicates... is assumed if omitted'). If the client sends CHARSET it MUST place it " +
			"immediately after SEARCH (before any search key); omitting it defaults to US-ASCII. " +
			"Treated as MUST for argument-syntax compliance. Applicability is 'conditional' because " +
			"it applies only when the client chooses to include a CHARSET argument.",
	},
	{
		id: "RFC3501-6.4.4-2",
		source: "RFC3501",
		section: "6.4.4",
		title: "Client MUST interpret tagged NO (not BAD) as unsupported-CHARSET response",
		text:
			"If the server does not support the specified [CHARSET], it MUST return a tagged NO response (not a BAD).",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"This is primarily a server obligation but creates a corresponding client-binding: the " +
			"client MUST NOT treat a tagged NO to a CHARSET SEARCH as a protocol error or as a BAD; " +
			"it must handle NO as a clean 'charset not supported' signal. Testable: a client that " +
			"retries with BAD handling or crashes on NO from a CHARSET SEARCH violates this. " +
			"Applicability is 'conditional' — only when CHARSET argument is used.",
	},

	// §6.4.5 FETCH ──────────────────────────────────────────────────────────────
	//
	// RFC 3501 §6.4.5 client-binding normative statements:
	//
	// 1. BODY[<section>] sets \Seen; BODY.PEEK does not.
	// 2. The macro items ALL, FAST, FULL are exclusive: they may not be mixed
	//    with explicit data-item names in the same parenthesized list (the RFC
	//    states that a macro may not be used in a list — each macro is "an
	//    alternate form … which … is equivalent to"; they are defined to stand
	//    alone as the second argument).
	// 3. Client MUST be prepared to receive unsolicited FETCH responses (per
	//    §2.2.2 and the note in §6.4.5 about implicit flag changes setting \Seen).
	// 4. Partial fetch notation <<partial>> — client uses this in requests; the
	//    server returns the specified octet range.
	// 5. BODY.PEEK is the alternate form that does not implicitly set \Seen.

	{
		id: "RFC3501-6.4.5-1",
		source: "RFC3501",
		section: "6.4.5",
		title: "BODY[<section>] sets \\Seen flag; client must expect this side-effect",
		text:
			"BODY.PEEK[<section>] An alternate form of BODY[<section>] that does not implicitly set " +
			"the \\Seen flag.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"The converse (i.e., BODY[<section>] DOES implicitly set \\Seen) is the client-binding " +
			"stated by contrast. A client that uses BODY[<section>] must expect \\Seen to be set; " +
			"a client that wishes to avoid setting \\Seen MUST use BODY.PEEK[<section>]. " +
			"No explicit 2119 keyword; the 'does not implicitly set' formulation is definitional and " +
			"treated as MUST (it is an architectural invariant). Testable: verify \\Seen is set after " +
			"a non-PEEK BODY fetch and NOT set after a PEEK fetch.",
	},
	{
		id: "RFC3501-6.4.5-2",
		source: "RFC3501",
		section: "6.4.5",
		title: "FETCH macro ALL must be used alone (not mixed with explicit item names)",
		text:
			"ALL             Macro equivalent to: (FLAGS INTERNALDATE RFC822.SIZE ENVELOPE)",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"RFC 3501 §6.4.5 defines ALL, FAST, and FULL as macros; the ABNF grammar for the FETCH " +
			"command (§9) permits either 'macro' or '(' fetch-att ')' as the second argument, " +
			"not a mixture. A client MUST NOT include ALL (or FAST or FULL) inside a parenthesized " +
			"list of items. Applicability is 'conditional' — only when client chooses to use ALL. " +
			"Treated as MUST (syntax compliance).",
	},
	{
		id: "RFC3501-6.4.5-3",
		source: "RFC3501",
		section: "6.4.5",
		title: "FETCH macro FAST must be used alone",
		text:
			"FAST            Macro equivalent to: (FLAGS INTERNALDATE RFC822.SIZE)",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"Same structural rule as RFC3501-6.4.5-2. A client MUST NOT embed FAST inside a " +
			"parenthesized item list. Applicability is 'conditional'.",
	},
	{
		id: "RFC3501-6.4.5-4",
		source: "RFC3501",
		section: "6.4.5",
		title: "FETCH macro FULL must be used alone",
		text:
			"FULL            Macro equivalent to: (FLAGS INTERNALDATE RFC822.SIZE ENVELOPE BODY)",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"Same structural rule as RFC3501-6.4.5-2 and RFC3501-6.4.5-3. A client MUST NOT embed " +
			"FULL inside a parenthesized item list. Applicability is 'conditional'.",
	},
	{
		id: "RFC3501-6.4.5-5",
		source: "RFC3501",
		section: "6.4.5",
		title: "Client MUST be prepared to receive unsolicited FETCH responses at any time",
		text:
			"A FETCH response MUST be returned to the client if a STORE command modifies the message " +
			"(e.g., the \\Seen flag is set by a STORE command), even for a SILENT STORE command. " +
			"[Combined with §2.2.2: A client MUST be prepared to accept any server response at all times.]",
		level: "MUST",
		applicability: "always",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"RFC 3501 §6.4.5 does not spell out 'client MUST be prepared for unsolicited FETCH' " +
			"independently; however the combined §2.2.2 obligation ('accept any server response at " +
			"all times') and the well-known cause (implicit flag changes, \\Seen set on BODY[] fetch, " +
			"concurrent client actions) make this always-applicable. The STORE MUST statement " +
			"(quoted verbatim from §6.4.6 for text accuracy) is the strongest textual anchor. " +
			"Testable: send a BODY[TEXT] fetch; verify client accepts an unsolicited * N FETCH " +
			"(FLAGS (\\Seen)) without error.",
	},

	// §6.4.6 STORE ──────────────────────────────────────────────────────────────

	{
		id: "RFC3501-6.4.6-1",
		source: "RFC3501",
		section: "6.4.6",
		title: "Client MUST expect FETCH response even for a SILENT STORE when flags change",
		text:
			"A FETCH response MUST be returned to the client if a STORE command modifies the message " +
			"(e.g., the \\Seen flag is set by a STORE command), even for a SILENT STORE command.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"This is a server obligation ('MUST be returned'), but it creates a symmetric client " +
			"obligation: a client using SILENT STORE MUST NOT suppress or discard FETCH responses " +
			"because it expects none. The SILENT modifier means no FETCH is returned for the " +
			"requested flag change, but an implicit change (e.g., \\Seen set as a side-effect) still " +
			"triggers one. Applicability is 'conditional' — fires when SILENT modifier is used. " +
			"Testable: issue SILENT STORE that causes \\Seen side-effect; verify client handles " +
			"the resulting FETCH response.",
	},

	// §6.4.7 COPY ───────────────────────────────────────────────────────────────
	// §6.4.7 contains no normative client-binding statements. The server obligations
	// are: SHOULD return error if destination does not exist; MUST NOT auto-create
	// the mailbox; MUST return OK on success. None of these bind the client's
	// behavior or impose obligations on how the client constructs or processes the
	// COPY command beyond the standard argument syntax (message set + mailbox name).

	// §6.4.8 UID ────────────────────────────────────────────────────────────────

	{
		id: "RFC3501-6.4.8-1",
		source: "RFC3501",
		section: "6.4.8",
		title: "Client MUST use UID to persist message identity across sessions",
		text:
			"Clients MUST use the UID of the message to refer to the message if the client wishes " +
			"the message number to persist across sessions.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "untestable",
		untestableRationale:
			"Whether the client correctly uses UIDs for cross-session identity is a design/architectural " +
			"quality decision. In a single protocol exchange a test can verify the client uses UID " +
			"variants, but whether it uses UIDs (vs. sequence numbers) for persistence across sessions " +
			"requires observing multi-session behavior over time — not directly observable in a " +
			"single black-box protocol test.",
		notes:
			"Applicability is 'conditional' because the obligation fires only 'if the client wishes " +
			"the message number to persist across sessions' — a design-time choice.",
	},
	{
		id: "RFC3501-6.4.8-2",
		source: "RFC3501",
		section: "6.4.8",
		title: "Client SHOULD NOT assume message sequence numbers persist across sessions",
		text:
			"Clients SHOULD NOT assume that message numbers are persistent, and SHOULD use the UID " +
			"if they wish to refer to the same message in a future session.",
		level: "SHOULD NOT",
		applicability: "always",
		profiles: ["rev1"],
		testability: "untestable",
		untestableRationale:
			"Whether the client assumes sequence-number persistence across sessions is an internal " +
			"design property, not directly observable at the protocol layer in a single session.",
	},
	{
		id: "RFC3501-6.4.8-3",
		source: "RFC3501",
		section: "6.4.8",
		title: "Client MUST NOT use UID value 0 in any context",
		text:
			"The unique identifier value of 0 is reserved and MUST NOT be used.",
		level: "MUST NOT",
		applicability: "always",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"Although 'MUST NOT be used' appears in the UID command section (§6.4.8), it applies " +
			"globally — any use of UID 0 as an argument in UID FETCH/SEARCH/STORE/COPY is a " +
			"protocol violation. Testable by verifying the client never emits a UID argument of 0.",
	},
	{
		id: "RFC3501-6.4.8-4",
		source: "RFC3501",
		section: "6.4.8",
		title: "UID command is limited to COPY, FETCH, STORE, and SEARCH sub-commands",
		text:
			"Redefinition of the message numbering scheme is limited to the following commands: " +
			"COPY, FETCH, STORE, and SEARCH. Attempting to use the UID command with any other command " +
			"will return BAD.",
		level: "MUST NOT",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"No explicit client-binding 2119 keyword; the statement 'Attempting to use ... will return " +
			"BAD' is a server guarantee that defines the client's permissible argument set. A client " +
			"MUST NOT issue UID with any command other than COPY, FETCH, STORE, or SEARCH. Treated " +
			"as MUST NOT. Applicability is 'conditional' — only when using the UID prefix.",
	},

	// §6.5 Client Commands - Experimental/Expansion ─────────────────────────────
	// No client-binding normative statements in the §6.5 header section itself.

	// §6.5.1 X<atom> ─────────────────────────────────────────────────────────────

	{
		id: "RFC3501-6.5.1-1",
		source: "RFC3501",
		section: "6.5.1",
		title: "Client MUST NOT use experimental commands in a way not defined or agreed",
		text:
			"Experimental or private extensions to this protocol are submitted by publishing a " +
			"document describing the syntax, arguments, data, and semantics of the extension. ... " +
			"Any server receiving an experimental command that it does not support MUST respond " +
			"with a tagged BAD response.",
		level: "MUST NOT",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"The verbatim text is from §6.5.1. The ellipsis elides the preceding command-tag " +
			"definition sentence. The primary client-binding obligation derived from this section is: " +
			"a client MUST NOT use X<atom> commands unless it has published or agreed on their " +
			"semantics; and it must be prepared to receive a tagged BAD response if the server " +
			"does not support the experimental command. The 'server MUST respond with BAD' clause " +
			"is included verbatim because it directly constrains what the client must handle. " +
			"Applicability is 'conditional' — only when the client uses experimental commands.",
	},
];
