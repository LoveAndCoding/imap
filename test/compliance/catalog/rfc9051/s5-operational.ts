import type { SpecRequirement } from "../types";

export const note =
	"§5 Operational Considerations: " +
	"§5.1 Mailbox Naming — extracted 5 (rev2 replaces RFC3501's mod-UTF-7 encoding regime with direct Net-Unicode/UTF-8 mailbox names — §5.1.3 'Mailbox International Naming Convention' and all its modified-BASE64 encoding rules are gone entirely): RFC9051-5.1-1, a MAY/MUST compound on creating/interpreting Net-Unicode names; RFC9051-5.1-2, a judgment-MUST on INBOX as the case-insensitive reserved special name; RFC9051-5.1-4, an untestable judgment-MUST on interacting with any server case-sensitivity model (carried over from RFC3501-5.1-3, quote widened to include the contiguous three-models sentence); RFC9051-5.1-5, a testable judgment-MUST on atom-specials quoting; and RFC9051-5.1-6, a judgment-SHOULD on the '#'/'&' conventional-meaning advisory item — item 5 of the client-considerations list, promoted here because RFC 9051 keeps the lowercase lead-in 'certain client considerations' but the pre-9051 catalog treated the identical list as non-normative advisory prose; re-examined in place, see item 5 rationale below. The 'takes no position on case sensitivity' framing sentence, formerly RFC9051-5.1-3, was retired as a non-duty (see the RETIRED IDS comment in this file). " +
	"§5.1's server-only obligations (server MUST prohibit non-compliant 8-bit names; server MAY accept/NFC-normalize denormalized UTF-8; SELECT-after-CREATE round-trip guarantee) are server duties and excluded. Client-consideration list items 1-4 (atom-specials quoting is extracted; CTL-character avoidance, wildcard-character difficulty, hierarchy-delimiter existence) are descriptive/advisory prose with no RFC 2119 keyword and are excluded as non-normative. " +
	"§5.1.1 Mailbox Hierarchy Naming — extracted 1 (1 MUST on left-to-right hierarchy and single-character separator when the client exports hierarchical names; conditional on the client choosing to export hierarchy). " +
	"§5.1.2 Namespaces / §5.1.2.1 Historic Mailbox Namespace Naming Convention / §5.1.2.2 Common Namespace Models — no client-binding requirements (all normative statements — INBOX-in-Personal-Namespace, access-rights-for-Other-Users'-Namespace, one-Personal-Namespace-SHOULD, namespace MAY differ per user — are server/definitional obligations describing namespace models a server exposes; the two '#news' / URL-encoding items in §5.1.2.1 are illustrative MAY prose about server namespace prefixing choices, not client duties; §5.1.2.2 is purely descriptive of two historical namespace-presentation models with no RFC 2119 keyword at all). " +
	"§5.2 Mailbox Size and Message Status Updates — extracted 2 client-binding entries (1 MUST remember mailbox size updates, 1 MUST NOT assume a post-selection command returns mailbox size; server-only items excluded: server MUST send size updates, server SHOULD send flag updates, 'NOT permitted' EXISTS-shrink prohibition binds the server per the surrounding sentence's subject). " +
	"§5.3 Response When No Command in Progress — no client-binding normative statements (both MUSTs bind the server: permission to send untagged non-EXPUNGE responses and the accompanying flow-control obligation; client handling of unilateral responses is covered by §5.2's testable entries). " +
	"§5.4 Autologout Timer — no client-facing MUST; the ≥30-minute timer floor and the reset-on-any-command behavior are both server obligations ('a server has...MUST be at least 30 minutes'; 'resets the autologout timer' has no subject-bound client action). The corollary that a client may be disconnected after 30 minutes of inactivity is an implication, not an independently testable client MUST, consistent with the RFC3501 treatment of the identical rule. " +
	"§5.5 Multiple Commands in Progress (Command Pipelining) — extracted 5, unchanged in substance from RFC3501-5.5 (1 MAY on pipelining, 1 MUST on continuation-request negotiation before the next command, 1 MUST on waiting for completion before a sequence-number command after any non-FETCH/STORE/SEARCH command, 1 MUST from the renumbered Note on waiting after a UID command — this Note's 'MUST' is now uppercase in RFC 9051, unlike RFC3501-5.5-5's lowercase 'must', so no judgment call is needed here, 1 testable-MUST on the UID-SEARCH-sequence-number association rule, which is new explanatory text appended to the Note in rev2 and has no RFC3501 counterpart). The general ambiguity-avoidance MUST NOT ('Clients MUST NOT send multiple commands without waiting if an ambiguity would result', RFC3501-5.5-3) does not appear in RFC 9051's §5.5 text — rev2 restates the same substance as a server-obligation MUST ('If the server detects a possible ambiguity, it MUST execute commands to completion in the order given by the client') plus the concrete client-facing FETCH/STORE/SEARCH rule which is carried forward as RFC9051-5.5-3; this is a genuine textual restructuring, not an oversight, and is called out explicitly rather than silently ported. " +
	"Total entries: 13. Untestable: 1 (RFC9051-5.1-4, carried over from RFC3501-5.1-3, theme internal-decision).";

export const requirements: SpecRequirement[] = [
	// §5.1 Mailbox Naming
	{
		id: "RFC9051-5.1-1",
		source: "RFC9051",
		section: "5.1",
		title: "Client MAY create Net-Unicode mailbox names and MUST interpret 8-bit LIST names as Net-Unicode",
		text: "In IMAP4rev2, mailbox names are encoded in Net-Unicode [NET-UNICODE] (this differs from IMAP4rev1). Client implementations MAY attempt to create Net-Unicode mailbox names and MUST interpret any 8-bit mailbox names returned by LIST as [NET-UNICODE].",
		level: "MUST",
		applicability: "always",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"This is the rev2 replacement for RFC3501-5.1-1/-2 and the entire mod-UTF-7 regime of RFC3501-5.1.3: IMAP4rev2 drops modified UTF-7 mailbox-name encoding entirely and switches to Net-Unicode (effectively UTF-8, normalized per Net-Unicode rules). The quoted sentence carries a compound obligation: a MAY (client may create Net-Unicode mailbox names — permissive, not independently testable as a pass/fail duty) and a MUST (client must interpret any 8-bit LIST-returned name as Net-Unicode). This entry's level is keyed to the MUST clause, which is the operative testable duty; the MAY clause is recorded for completeness since it cannot be split without breaking the sentence's referential unity ('this differs from IMAP4rev1' explains why net-Unicode appears in rev2, not rev1). Applicability is 'always': the client cannot control whether a server returns an 8-bit-containing mailbox name, so readiness to interpret it as Net-Unicode/UTF-8 is unconditional. Observable: a client that decodes an 8-bit LIST-returned mailbox name using a non-UTF-8 interpretation (e.g., Latin-1 or an unmodified mod-UTF-7 decoder) or discards it fails this requirement.",
	},
	{
		id: "RFC9051-5.1-2",
		source: "RFC9051",
		section: "5.1",
		title: "INBOX is a case-insensitive special name; interpretation of other names is implementation dependent",
		text: "The case-insensitive mailbox name INBOX is a special name reserved to mean \"the primary mailbox for this user on this server\".",
		level: "MUST",
		applicability: "always",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"No RFC 2119 keyword in this sentence itself, but 'reserved to mean' states a fixed protocol semantic that a conforming client must honor: it must treat the string \"INBOX\" (in any case) as denoting the user's primary mailbox rather than as an arbitrary user-chosen name. Level assigned as MUST by judgment, unchanged in substance from the identical RFC3501 sentence (RFC3501-5.1, not separately catalogued there but implicit in the case-insensitivity duty). Observable: a client that sends 'inbox' or 'InBox' as a SELECT/CREATE argument expecting it to name a distinct mailbox from 'INBOX', or that fails to special-case 'INBOX' for case-insensitive matching, violates the protocol's fixed semantic.",
	},
	// RETIRED IDS (never reuse): RFC9051-5.1-3 — formerly catalogued the sentence "In particular, this
	// specification takes no position on case sensitivity in non-INBOX mailbox names." Retired 2026-07-01
	// (independent audit): the sentence is a non-duty — it states a design fact about the specification
	// itself, and no RFC 2119 level is assignable to it. Its antecedent role for RFC9051-5.1-4's "any of
	// these" is preserved by widening that entry's quote to include the contiguous preceding sentence
	// enumerating the three server case-sensitivity models.
	{
		id: "RFC9051-5.1-4",
		source: "RFC9051",
		section: "5.1",
		title: "Client MUST be able to interact with any server case-sensitivity model",
		text: "Some server implementations are fully case sensitive in ASCII range; others preserve the case of a newly created name but otherwise are case insensitive; and yet others coerce names to a particular case. Client implementations must be able to interact with any of these.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev2"],
		testability: "untestable",
		untestableTheme: "internal-decision",
		untestableRationale:
			"Direct carry-forward of RFC3501-5.1-3's untestability analysis: this is a blanket obligation to interoperate with all three server case-sensitivity models (fully case-sensitive in ASCII range, case-insensitive but case-preserving, case-insensitive with case-coercion) enumerated in the first quoted sentence. There is no single observable protocol interaction that proves general compliance; a client can pass any particular test case yet still fail with an untested server variant. The harness could script all three server models, but no single client wire behavior would distinguish universal compliance — mailbox names originate with the consuming application and the library forwards them, so the 'interacts with any model' property has no finite black-box observable. Full coverage would require an open-ended integration property, not a single assertion.",
		notes:
			"Casing delta from the predecessor: RFC 3501 prints 'Client implementations MUST interact with any of these.' (uppercase MUST, catalogued as RFC3501-5.1-3), while RFC 9051 prints 'Client implementations must be able to interact with any of these.' (lowercase 'must', with 'be able to' inserted). RFC 9051 is an RFC-8174-era document, so this lowercase instance is flagged as a judgment call; level assigned as MUST by judgment, consistent with the RFC3501 predecessor's explicit uppercase MUST for the same substantive duty. The antecedent 'any of these' refers to the three case-sensitivity models enumerated in the first quoted sentence (the quote was widened to include that contiguous preceding sentence when the former antecedent entry RFC9051-5.1-3, the 'takes no position' framing sentence, was retired as a non-duty — see the RETIRED IDS comment above). Practical implication: clients must never assume a particular server model and must reuse exact server-returned mailbox name strings in subsequent commands.",
	},
	{
		id: "RFC9051-5.1-5",
		source: "RFC9051",
		section: "5.1",
		title: "Mailbox names containing atom-specials MUST be quoted-string or literal",
		text: "Any character that is one of the atom-specials (see \"Formal Syntax\" in Section 9) will require that the mailbox name be represented as a quoted string or literal.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"No RFC 2119 keyword; 'will require' is a definitional statement of formal-syntax necessity. Level assigned as MUST by judgment: a mailbox name containing an atom-special character cannot be legally transmitted as a bare atom per the ABNF in Section 9, so any client that attempts to send it as an unquoted atom produces a syntactically invalid command. Applicability is 'conditional' because it only binds when the client transmits a mailbox name containing an atom-special character. Item 1 of the numbered client-considerations list; items 2-4 (CTL/non-graphic character UI difficulty, list-wildcard character conflicts, hierarchy-delimiter reservation) are excluded as descriptive/advisory prose with no formal-syntax necessity attached. Observable: a client-transmitted mailbox name containing an atom-special character (e.g., a space or '(') sent as a bare unquoted atom rather than a quoted string or literal violates IMAP command syntax.",
	},
	{
		id: "RFC9051-5.1-6",
		source: "RFC9051",
		section: "5.1",
		title: "'#' and '&' have conventional meanings and should be avoided outside that convention",
		text: "Two characters, \"#\" and \"&\", have meanings by convention and should be avoided except when used in that convention.",
		level: "SHOULD",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"Lowercase 'should' in the RFC text. Level assigned as SHOULD by judgment: item 5 of the numbered client-considerations list in §5.1, cross-referencing §5.1.2.1 (the '#' namespace-prefix convention) and Appendix A.1 (the '&' mod-UTF-7-legacy escape convention, retained in rev2's appendix as historical/interoperability guidance even though §5.1.3's encoding rules were removed from the body). Differs from the RFC3501 catalog's treatment (RFC3501-5.1's note excluded the identical list item 5 as non-normative advisory prose); re-examined here because 'should be avoided except when used in that convention' states an affirmative recommended constraint on client-chosen mailbox names with a concrete pass/fail reading (avoid unconventional use of these two characters), which meets the bar for a judgment-assigned SHOULD in this catalog's existing practice for lowercase keywords elsewhere in §5 (e.g., RFC9051-5.1-4). Applicability is 'conditional': it binds only when the client is choosing/creating a new mailbox name that could contain '#' or '&'. Observable: a client that creates a mailbox name using a leading '#' not intended as a namespace prefix, or an embedded '&' not intended as the Appendix A.1 escape convention, departs from this recommendation (SHOULD, not MUST, so this is not an outright prohibition).",
	},

	// §5.1.1 Mailbox Hierarchy Naming
	{
		id: "RFC9051-5.1.1-1",
		source: "RFC9051",
		section: "5.1.1",
		title: "Exported hierarchical mailbox names MUST be left-to-right with a single separator character",
		text: "If it is desired to export hierarchical mailbox names, mailbox names MUST be left-to-right hierarchical, using a single ASCII character to separate levels of hierarchy. The same hierarchy separator character is used for all levels of hierarchy within a single name.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"Explicit MUST. Unchanged in substance from RFC3501-5.1.1 (not separately catalogued as a distinct id in the RFC3501 module, folded into that module's §5.1 note as 'no distinct client-binding requirements... implicitly covered by command-level tests' — re-examined here and extracted directly, since the sentence states an affirmative structural constraint on any hierarchical mailbox name the client constructs, which is independently observable). Applicability is 'conditional': it binds only when the client constructs/sends a mailbox name intended to represent hierarchy (e.g., 'Parent/Child'). Observable: a client-transmitted mailbox name using more than one distinct hierarchy-separator character, or one not left-to-right ordered, violates this rule. Note the RFC's separator character is server-determined (via LIST hierarchy delimiter), not client-chosen — the client's duty is to use that single reported separator consistently, not to invent one. Trigger caveat: the conditional trigger ('If it is desired to export hierarchical mailbox names') is intent-based and invisible on the wire — no observation can establish whether the client 'desired' hierarchy; the test observable is therefore limited to the syntax the client emits when it does use hierarchical names (left-to-right ordering, single separator character).",
	},

	// §5.2 Mailbox Size and Message Status Updates
	{
		id: "RFC9051-5.2-1",
		source: "RFC9051",
		section: "5.2",
		title: "Client MUST remember mailbox size updates",
		text: "Regardless of what implementation decisions a client makes on remembering data from the server, a client implementation MUST remember mailbox size updates.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"Explicit MUST. Wording differs slightly from the RFC3501 predecessor (RFC3501-5.2-1: '...MUST record mailbox size updates' vs. rev2's '...MUST remember mailbox size updates' — 'remember' replaces 'record'; substance is identical). The obligation is that the client must update its internal state whenever an untagged EXISTS response is received, regardless of which command is in progress. Observable indirectly: a client that ignores unilateral EXISTS updates and subsequently uses a stale message count (e.g., attempting to FETCH a sequence number beyond the updated EXISTS value) reveals non-compliance.",
	},
	{
		id: "RFC9051-5.2-2",
		source: "RFC9051",
		section: "5.2",
		title: "Client MUST NOT assume subsequent commands return mailbox size",
		text: "It MUST NOT assume that any command after the initial mailbox selection will return the size of the mailbox.",
		level: "MUST NOT",
		applicability: "always",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"Explicit MUST NOT, verbatim-identical to RFC3501-5.2-2. This is the logical complement of RFC9051-5.2-1: the client must maintain its own size record (from unilateral EXISTS updates) rather than expecting the server to re-report it. Observable: a client that issues a command (e.g., NOOP) solely to obtain the current message count, and then fails to function correctly when the server does not include an EXISTS response, would reveal this dependency.",
	},

	// §5.5 Multiple Commands in Progress (Command Pipelining)
	{
		id: "RFC9051-5.5-1",
		source: "RFC9051",
		section: "5.5",
		title: "Client MAY pipeline commands without waiting for completion",
		text: "The client MAY send another command without waiting for the completion result response of a command, subject to ambiguity rules (see below) and flow control constraints on the underlying data stream.",
		level: "MAY",
		applicability: "always",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"Explicit MAY, verbatim-identical to RFC3501-5.5-1. Records the permission to pipeline; the 'ambiguity rules (see below)' are elaborated in RFC9051-5.5-2 and RFC9051-5.5-3. Observable: a client that sends two commands back-to-back before receiving the tagged completion of the first is exercising this MAY.",
	},
	{
		id: "RFC9051-5.5-2",
		source: "RFC9051",
		section: "5.5",
		title: "Command continuation request and response MUST be negotiated before next command",
		text: "However, any command continuation request responses and command continuations MUST be negotiated before any subsequent command is initiated.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"Explicit MUST, verbatim-identical to RFC3501-5.5-2. Applicability is 'conditional' because it applies only when a command generates a continuation request (i.e., involves a client-to-server literal). Observable: a client that pipelines a second command before completing the literal-upload handshake for the first violates this.",
	},
	{
		id: "RFC9051-5.5-3",
		source: "RFC9051",
		section: "5.5",
		title: "Client MUST wait for completion before sending sequence-number command after non-FETCH/STORE/SEARCH",
		text: "Therefore, if the client sends any command other than FETCH, STORE, or SEARCH, it MUST wait for the completion result response before sending a command with message sequence numbers.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"Explicit MUST, verbatim-identical to RFC3501-5.5-4. This is the concrete operational rule; rev2 restructures the surrounding prose so that the general 'Clients MUST NOT send multiple commands without waiting if an ambiguity would result' sentence of RFC3501-5.5-3 is replaced by a server-facing sentence ('If the server detects a possible ambiguity, it MUST execute commands to completion in the order given by the client') — that replacement sentence binds the server, not the client, and is excluded here; this entry is the surviving client-facing rule that RFC3501-5.5-3/-4 jointly expressed. Only FETCH, STORE, and SEARCH are safe to pipeline with subsequent sequence-number commands because servers are prohibited from sending EXPUNGE responses while those commands are in progress. Applicability is 'conditional' because it binds only when the client is pipelining commands that reference message sequence numbers. Observable: after any non-FETCH/STORE/SEARCH command tag is sent, a conformant client does not transmit another command containing a sequence-number set until it has received the tagged completion response.",
	},
	{
		id: "RFC9051-5.5-4",
		source: "RFC9051",
		section: "5.5",
		title: "Client MUST wait for completion after a UID command before sending a sequence-number command",
		text: "Note: EXPUNGE responses are permitted while UID FETCH, UID STORE, and UID SEARCH are in progress. If the client sends a UID command, it MUST wait for a completion result response before sending a command that uses message sequence numbers (this may include UID SEARCH).",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"Explicit MUST — and, unlike RFC3501-5.5-5's lowercase 'must' for the substantively identical Note, RFC 9051 prints this keyword in uppercase, so no judgment call on case is needed here (a genuine normative-strength correction/clarification between revisions, not just a rewording). The Note closes the loophole that UID FETCH/UID STORE/UID SEARCH might be mistaken for the FETCH/STORE/SEARCH exemption of RFC9051-5.5-3 — UID commands can elicit untagged EXPUNGE responses, so the same wait obligation applies. The parenthetical '(this may include UID SEARCH)' is new/clarifying relative to RFC3501's Note and is quoted as part of the same sentence. Applicability is 'conditional' because it binds only when the client pipelines a UID command ahead of a command that uses message sequence numbers. Observable: after sending any UID command, a conformant client does not transmit a command containing a sequence-number set until it has received the tagged completion response.",
	},
	{
		id: "RFC9051-5.5-5",
		source: "RFC9051",
		section: "5.5",
		title: "Sequence numbers in a UID SEARCH argument are associated with messages prior to that command's EXPUNGE effects",
		text: "Any message sequence numbers in an argument to UID SEARCH are associated with messages prior to the effect of any untagged EXPUNGE responses returned by the UID SEARCH.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"No RFC 2119 keyword; the sentence is declarative ('are associated with'), stating a fixed interpretive rule rather than issuing an imperative. Level assigned as MUST by judgment: this sentence has no counterpart in RFC3501-5.5's Note and is new explanatory text appended in rev2, resolving the 'UID SEARCH + UID SEARCH may be valid or invalid' ambiguity flagged later in the same section by fixing how the client must interpret sequence numbers it sent as UID SEARCH arguments relative to EXPUNGE responses the same command may return. Applicability is 'conditional' because it binds only when the client includes message sequence numbers in a UID SEARCH argument while pipelining. Observable: a client that, after receiving untagged EXPUNGE responses during a UID SEARCH, re-interprets its own already-sent sequence-number arguments against the post-EXPUNGE numbering (rather than the pre-EXPUNGE numbering) misapplies this rule — though this is chiefly a client-side interpretive duty about its own request semantics rather than a directly observable wire artifact; catalogued as testable because the client's resulting protocol behavior (which messages it expects the UID SEARCH argument to have matched) is in principle inferable from subsequent command behavior in a scripted scenario.",
	},
];
