import type { CatalogModule } from "../types";

const rfc2342: CatalogModule = {
	source: "RFC2342",
	extractionNote:
		"RFC 2342 (IMAP4 Namespace, the NAMESPACE command + `* NAMESPACE` response) fully " +
		"reviewed for client-binding requirements. §1 Abstract and §2 Conventions are " +
		"definitional/boilerplate: the namespace-class definitions ('Personal Namespace', " +
		"'Other Users' Namespace', 'Shared Namespace'), the 'INBOX MUST appear within the " +
		"user's personal namespace' invariant, the 'SHOULD be only one Personal/Other Users' " +
		"Namespace' typicality, and 'the currently authenticated user MUST be explicitly " +
		"granted access rights' all constrain the SERVER's namespace model (what it exposes / " +
		"how it names things), not any wire action the client must emit — server-only, " +
		"excluded. §3 Introduction and Overview contributes one client entry (3-1: SHOULD allow " +
		"the user to manually enter a namespace prefix, since a server MAY expose only a subset " +
		"of its namespaces) — untestable, ui-presentation. §4 Requirements binds the server " +
		"('servers ... MUST list the keyword NAMESPACE in their CAPABILITY response') and states " +
		"the command is valid in Authenticated and Selected state (a state-availability fact " +
		"about the command, not a keyworded client duty; the client's not-in-wrong-state duty is " +
		"the ordinary base-spec command-state discipline, not restated here) — no distinct " +
		"client-binding requirement. §5 NAMESPACE Command is the substantive section and " +
		"contributes 5-1..5-4: the client MUST be prepared for multiple Personal/Other Users' " +
		"Namespaces (5-1, rev2-core overlap → rev1-only), the client SHOULD let the user select " +
		"which namespace to create a mailbox in when ambiguous (5-2, rev2-core overlap → " +
		"rev1-only), the client-may-append-'%'-to-the-Other-Users'-prefix LIST-construction " +
		"permission (5-3, MAY-level judgment, untestable user-intent-policy), and the implicit " +
		"client duty to accept a NIL for any unavailable namespace class in the `* NAMESPACE` " +
		"response (5-4, judgment-level parse duty, testable). Excluded from §5 as server-only: " +
		"the response-generation rule that non-standards-track Namespace_Response_Extensions " +
		"MUST be prefixed with 'X-' (binds the server, which emits the response), the " +
		"Namespace_Response_Extensions-MAY-be-included permission (server response option), the " +
		"'server MAY choose to make available ... only a subset' statement (server option; its " +
		"client consequence is captured by 3-1), the SHOULD that the next hierarchy level after " +
		"the Other Users' prefix consist of <username> (binds the server's naming), and the " +
		"trio of server LIST-response options for Other Users' namespace listing (server SHOULD " +
		"NOT return non-granting users / MAY return only granting users / MAY return NO — all " +
		"server behavior). §6 Formal Syntax is ABNF grammar (Namespace / Namespace_Command / " +
		"Namespace_Response / Namespace_Response_Extension productions); its lone embedded " +
		"'MUST be of modified UTF-7 format' note is interleaved with ABNF comment markers and " +
		"binds whoever ENCODES the response string (the server), so it is not cataloged as a " +
		"client duty. §7 Security Considerations binds the server (SHOULD NOT list non-granting " +
		"users). §8/§9 References/Acknowledgments and the Authors'/Copyright material contain no " +
		"normative client content. " +
		"REV2-CORE ADJUDICATION (RFC 9051 §6.3.10): IMAP4rev2 folded NAMESPACE into core and " +
		"restated exactly two of this document's client duties. RFC9051-6.3.10-1 restates 5-1 " +
		"('a client MUST be prepared for them' for multiple namespaces) — word-for-word " +
		"equivalent duty (RFC 9051 flips the clause order to 'a server will typically support' " +
		"vs RFC 2342's 'typically a server will support', identical meaning). RFC9051-6.3.10-2 " +
		"restates 5-2 ('a client SHOULD let the user select which namespaces to create the " +
		"mailbox in') and merely widens it with an added 'or just use the first Personal " +
		"Namespace' escape that only loosens the same SHOULD — the binding duty is identical. " +
		"To avoid double-scoring the same duty against two sources for a rev2 client, 5-1 and " +
		"5-2 are tagged profiles: [\"rev1\"] here (source-of-truth for a rev1 client using " +
		"NAMESPACE; the rev2 obligation is scored via RFC9051-6.3.10-1/-2 instead). The " +
		"remaining client entries have no RFC 9051 §6.3.10 counterpart text: 3-1 (manual-prefix " +
		"entry) and 5-3 (append-'%' LIST construction) are §3/§5 prose RFC 9051 does not carry " +
		"forward, and 5-4 (accept NIL classes) is an implicit parse duty RFC 9051 states only " +
		"through its own ABNF — so 3-1, 5-3, and 5-4 remain source-of-truth for both profiles: " +
		"[\"rev1\",\"rev2\"]. Total: 5 client-binding entries (RFC2342-3-1, RFC2342-5-1..5-4). " +
		"Untestable: 4 (3-1 ui-presentation; 5-1 internal-decision; 5-2 user-intent-policy; 5-3 " +
		"user-intent-policy). Testable: 1 (5-4).",
	requirements: [
		// ── §3 Introduction and Overview ─────────────────────────────────────────

		{
			id: "RFC2342-3-1",
			source: "RFC2342",
			section: "3",
			title: "Client SHOULD allow the user to manually enter a namespace prefix",
			text:
				"To provide the ability to access these namespaces, a client SHOULD allow the user " +
				"the ability to manually enter a namespace prefix.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "ui-presentation",
			untestableRationale:
				"Whether a client offers the user a UI affordance to type in a namespace prefix by " +
				"hand is a property of the client's user interface, not of any command it puts on the " +
				"wire. The NAMESPACE command and every subsequent LIST/CREATE are byte-identical " +
				"whether the prefix the client used was auto-discovered or hand-entered by the user, " +
				"so no black-box exchange can establish that the manual-entry affordance exists. The " +
				"full context ('A server MAY choose to make available to the NAMESPACE command only a " +
				"subset of the complete set of namespaces the server supports. To provide the ability " +
				"to access these namespaces ...') makes this conditional on the deployment having " +
				"namespaces the NAMESPACE command does not surface.",
			notes:
				"Conditional on the client using NAMESPACE at all and on the server exposing only a " +
				"subset of its namespaces (the motivating case in §3). No RFC 9051 §6.3.10 " +
				"counterpart — 9051 does not carry this §3 UI-guidance sentence forward — so this " +
				"remains source-of-truth for both profiles.",
		},

		// ── §5 NAMESPACE Command ─────────────────────────────────────────────────

		{
			id: "RFC2342-5-1",
			source: "RFC2342",
			section: "5",
			title: "Client MUST be prepared for multiple Personal/Other Users' Namespaces",
			text:
				"Although typically a server will support only a single Personal Namespace, and a " +
				"single Other User's Namespace, circumstances exist where there MAY be multiples of " +
				"these, and a client MUST be prepared for them.",
			level: "MUST",
			applicability: "always",
			profiles: ["rev1"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"'Being prepared for' an open-ended number of namespaces is a robustness property of " +
				"the client's namespace-handling logic, not a single observable wire action. A test " +
				"can script a `* NAMESPACE` response carrying multiple Personal Namespace pairs and " +
				"confirm the client parses them without error, but that slice only confirms the " +
				"parser accepts valid syntax — it has no pass/fail boundary distinct from ordinary " +
				"NAMESPACE-response parsing, and 'prepared for them' as a general duty extends beyond " +
				"any one scripted scenario to the client's whole design. Same reasoning the rev2 " +
				"restatement (RFC9051-6.3.10-1) records for the identical duty.",
			notes:
				"REV2-CORE OVERLAP: word-for-word equivalent to RFC9051-6.3.10-1, which restates this " +
				"exact duty as IMAP4rev2 baseline (NAMESPACE is a core command in RFC 9051, not an " +
				"extension). RFC 9051 flips the clause order ('a server will typically support' vs " +
				"this document's 'typically a server will support'); the normative content — client " +
				"MUST be prepared for multiple Personal/Other Users' Namespaces — is identical. " +
				"Tagged rev1-only here so the duty is scored once per profile: RFC2342-5-1 for a rev1 " +
				"client using NAMESPACE, RFC9051-6.3.10-1 for a rev2 client. Full context: the " +
				"sentence continues 'If a client is configured such that it is required to create a " +
				"certain mailbox, there can be circumstances where it is unclear which Personal " +
				"Namespaces it should create the mailbox in.' — which motivates RFC2342-5-2.",
		},
		{
			id: "RFC2342-5-2",
			source: "RFC2342",
			section: "5",
			title: "Client SHOULD let the user select which namespace to create the mailbox in",
			text: "In these situations a client SHOULD let the user select which namespaces to create the mailbox in.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "untestable",
			untestableTheme: "user-intent-policy",
			untestableRationale:
				"'These situations' is when a client configured to create a mailbox faces multiple " +
				"Personal Namespaces and it is unclear which should receive it. Whether the client " +
				"prompts the user to choose is a UI/policy decision with no distinguishing wire " +
				"signature: the resulting CREATE command names one concrete mailbox path either way, " +
				"and a client that silently picked a namespace is byte-indistinguishable from one " +
				"whose user was prompted and chose that same namespace. No black-box observation can " +
				"establish which branch, if either, was implemented.",
			notes:
				"REV2-CORE OVERLAP: restated by RFC9051-6.3.10-2, which carries the identical SHOULD " +
				"and merely widens it with an added escape clause ('..., or just use the first " +
				"Personal Namespace') that only loosens the same obligation — the binding duty (let " +
				"the user select) is identical. Tagged rev1-only here so a rev2 client is scored via " +
				"RFC9051-6.3.10-2 instead, avoiding double-counting. Conditional on the client " +
				"supporting mailbox creation under NAMESPACE with multiple Personal Namespaces " +
				"present.",
		},
		{
			id: "RFC2342-5-3",
			source: "RFC2342",
			section: "5",
			title: "Client MAY append '%' to the Other Users' prefix to discover other users' namespaces",
			text:
				"A client can construct a LIST command by appending a \"%\" to the Other Users' " +
				"Namespace prefix to discover the Personal Namespaces of other users that are " +
				"available to the currently authenticated user.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "user-intent-policy",
			untestableRationale:
				"This is permissive guidance ('a client can construct'), granting the client an " +
				"optional technique for discovering other users' namespaces — it imposes no duty and " +
				"forbids nothing. Whether a client ever chooses to build such a LIST is entirely its " +
				"own feature decision; a client that never issues an 'Other Users/%' LIST is fully " +
				"compliant. There is no pass/fail boundary to observe: the presence of such a LIST " +
				"proves the client exercised an option, and its absence proves nothing (the option " +
				"was simply not taken). No black-box test can compel or forbid the technique.",
			notes:
				"Judgment level: no RFC 2119 keyword — 'a client can construct' reads as MAY-level " +
				"permission per the sense of RFC 2119/8174, so tagged MAY. No RFC 9051 §6.3.10 " +
				"counterpart text (9051 does not restate this discovery-technique prose), so it " +
				"remains source-of-truth for both profiles.",
		},
		{
			id: "RFC2342-5-4",
			source: "RFC2342",
			section: "5",
			title: "Client (implicit) MUST accept a NIL for any unavailable namespace class",
			text: "The response will contain a NIL for any namespace class that is not available.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit client-parsing MUST inferred from a descriptive " +
				"response-format sentence; no RFC 2119 keyword binds the client directly here). The " +
				"`* NAMESPACE` response has three positional namespace-class slots (Personal, Other " +
				"Users', Shared), and any class the server does not expose is transmitted as the " +
				"atom NIL rather than a parenthesized (prefix delimiter) list. A compliant client " +
				"parsing a NAMESPACE response must therefore accept NIL in any of the three slots — " +
				"e.g. `* NAMESPACE ((\"\" \"/\")) NIL NIL` (personal only) or `* NAMESPACE NIL NIL " +
				"((\"\" \".\"))` (shared only, per the RFC's Example 5.2) — as a well-formed response, " +
				"not a parse error. Observable: script a NAMESPACE response with one or more NIL " +
				"classes and confirm the client completes the command successfully rather than " +
				"erroring. Conditional on the client using NAMESPACE. No RFC 9051 §6.3.10 prose " +
				"counterpart (9051 states the NIL-per-class shape only through its ABNF), so this " +
				"remains source-of-truth for both profiles.",
		},
	],
};

export default rfc2342;
