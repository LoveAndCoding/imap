import type { SpecRequirement } from "../types";

export const note =
	"§5 Operational Considerations: " +
	"§5.1 Mailbox Naming — extracted 3 (1 explicit MUST NOT on 8-bit mailbox name creation, 1 explicit SHOULD on interpreting 8-bit names as UTF-8, 1 judgment-MUST on case-insensitivity interaction; server-only items noted below). " +
	"The §5.1 client-considerations list (items 1-5, including item 5 on the conventional meanings of '#' and '&') was considered and excluded: it is advisory prose with a lowercase 'should be avoided', not a normative requirement; " +
	"§5.1.1 Mailbox Hierarchy Naming — no distinct client-binding requirements (the MUST is on server export of hierarchical names; client conformance is implicitly covered by command-level tests); " +
	"§5.1.2 Mailbox Namespace Naming Convention — no client-binding normative statements (entire section is a permissive convention note with a server-side MAY example; '#' namespace use is advisory prose only); " +
	"§5.1.3 Mailbox International Naming Convention — extracted 5 (1 MUST NOT on client depending on server validation, 1 SHOULD NOT on creating non-compliant '&'-containing names, 1 MUST NOT on modified BASE64 for printable ASCII, 1 MUST on names ending in US-ASCII, 1 judgment-MUST NOT on implicit shifts and null shifts — RFC3501-5.1.3-5, where 'are not permitted' is plain-English prohibition prose; the remaining encoding rules for printable ASCII self-representation and the '&-' sequence are definitional prose, covered by the explicit-keyword entries when the client sends international mailbox names); " +
	"§5.2 Mailbox Size and Message Status Updates — extracted 2 client-binding entries (1 MUST record mailbox size updates, 1 MUST NOT assume command returns mailbox size; server-only items: server MUST send size updates, server SHOULD send flag updates, NOT permitted to reduce EXISTS via EXISTS response — these are server obligations only); " +
	"§5.3 Response when no Command in Progress — no client-binding normative statements (all MUSTs in this section are server obligations about flow control; client is only expected to handle unilateral untagged responses gracefully, which is covered by §5.2 and command-response handling tests); " +
	"§5.4 Autologout Timer — no client-facing MUST; server MUST maintain ≥30-minute timer and SHOULD reset on any command receipt — both are server obligations; client implication (that it may be disconnected after 30 minutes of inactivity) is not independently testable as a client MUST; " +
	"§5.5 Multiple Commands in Progress — extracted 5 (1 MAY on pipelining, 1 MUST on continuation-request negotiation before next command, 1 MUST NOT on ambiguous multi-command sequences, 1 MUST wait before sending message-sequence-number commands after non-FETCH/STORE/SEARCH, 1 judgment-MUST from the Note on waiting after UID commands — RFC3501-5.5-5). " +
	"Total entries: 15. Untestable: 2.";

export const requirements: SpecRequirement[] = [
	// §5.1 Mailbox Naming
	{
		id: "RFC3501-5.1-1",
		source: "RFC3501",
		section: "5.1",
		title: "Client MUST NOT create 8-bit mailbox names",
		text: "Client implementations MUST NOT attempt to create 8-bit mailbox names, and SHOULD interpret any 8-bit mailbox names returned by LIST or LSUB as UTF-8.",
		level: "MUST NOT",
		applicability: "always",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"Explicit MUST NOT. The full compound sentence is quoted; this entry's level is the MUST NOT clause (no 8-bit name creation), while the SHOULD clause (interpret 8-bit names as UTF-8) is catalogued separately as RFC3501-5.1-2. Applies whenever the client issues a CREATE, RENAME, or SUBSCRIBE command. Observable at the protocol layer: any mailbox name argument containing an octet > 0x7F constitutes a violation.",
	},
	{
		id: "RFC3501-5.1-2",
		source: "RFC3501",
		section: "5.1",
		title: "Client SHOULD interpret 8-bit mailbox names returned by LIST or LSUB as UTF-8",
		text: "...SHOULD interpret any 8-bit mailbox names returned by LIST or LSUB as UTF-8.",
		level: "SHOULD",
		applicability: "always",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"Explicit SHOULD. The leading '...' elides the subject and first clause of the compound sentence ('Client implementations MUST NOT attempt to create 8-bit mailbox names, and'), which is quoted in full in RFC3501-5.1-1; the elided subject of this clause is 'Client implementations'. Applicability is 'always': the client cannot control when a server returns an 8-bit mailbox name (non-conforming server behaviour but one that must be handled gracefully), so readiness to interpret such names as UTF-8 is an unconditional response-handling duty. Observable: a client that decodes such a name using a non-UTF-8 interpretation (e.g., Latin-1) or discards it without UTF-8 interpretation fails this requirement.",
	},
	{
		id: "RFC3501-5.1-3",
		source: "RFC3501",
		section: "5.1",
		title: "Client MUST interact with any server case-sensitivity model",
		text: "Client implementations MUST interact with any of these.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev1"],
		testability: "untestable",
		untestableTheme: "internal-decision",
		untestableRationale:
			"The sentence is a blanket obligation to interoperate with all three server case-sensitivity models (fully case-sensitive, case-insensitive with case-preservation, case-insensitive with case-coercion). There is no single observable protocol interaction that proves general compliance; a client can pass any particular test case yet still fail with an untested server variant. Full coverage would require testing against all three server behaviours, which is an integration property rather than a single black-box observable.",
		notes:
			"Explicit MUST in §5.1. The antecedent 'any of these' refers to the three case-sensitivity models for non-INBOX mailbox names described immediately before: (1) fully case-sensitive, (2) case-insensitive but case-preserving, (3) case-insensitive with case-folding. The practical implication is that clients must never assume a particular server model and must reuse the exact server-returned mailbox name strings in subsequent commands.",
	},

	// §5.1.3 Mailbox International Naming Convention
	{
		id: "RFC3501-5.1.3-1",
		source: "RFC3501",
		section: "5.1.3",
		title: "Clients MUST NOT depend on server validation of modified UTF-7 mailbox names",
		text: "However, client implementations MUST NOT depend upon the server doing this, and SHOULD NOT attempt to create a mailbox name with an embedded \"&\" character unless it complies with the modified UTF-7 syntax.",
		level: "MUST NOT",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "untestable",
		untestableTheme: "internal-decision",
		untestableRationale:
			"'Depending on the server' is an internal client design choice not directly observable at the protocol boundary. A client that silently relies on the server to reject invalid modified UTF-7 names is indistinguishable (at the wire level) from one that validates locally, unless the client sends an invalid name — at which point RFC3501-5.1.3-2 would be violated instead.",
		notes:
			"Explicit MUST NOT. The full compound sentence is quoted; this entry's level is the MUST NOT clause (do not depend on server validation), while the SHOULD NOT clause (non-compliant '&'-names) is catalogued separately as RFC3501-5.1.3-2. The antecedent 'this' refers to the server verifying that '&'-containing CREATE arguments are in the correctly modified UTF-7 syntax. Applicability is 'conditional' because the obligation only arises when the client uses international (non-ASCII) mailbox names. Companion to RFC3501-5.1.3-2.",
	},
	{
		id: "RFC3501-5.1.3-2",
		source: "RFC3501",
		section: "5.1.3",
		title: "Client SHOULD NOT create mailbox names with bare '&' unless modified UTF-7 compliant",
		text: "...SHOULD NOT attempt to create a mailbox name with an embedded \"&\" character unless it complies with the modified UTF-7 syntax.",
		level: "SHOULD NOT",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"Explicit SHOULD NOT. The leading '...' elides the first clause of the compound sentence ('However, client implementations MUST NOT depend upon the server doing this, and'), which is quoted in full in RFC3501-5.1.3-1; the elided subject of this clause is 'client implementations'. Applicability is 'conditional' because it binds only when the client attempts to CREATE a mailbox containing the '&' character. Observable: a client that issues CREATE with a mailbox name containing a literal '&' not followed by '-' (or a valid modified BASE64 shift sequence) violates this.",
	},
	{
		id: "RFC3501-5.1.3-3",
		source: "RFC3501",
		section: "5.1.3",
		title: "Modified BASE64 MUST NOT encode printable US-ASCII that can represent itself",
		text: "Modified BASE64 MUST NOT be used to represent any printing US-ASCII character which can represent itself.",
		level: "MUST NOT",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"Explicit MUST NOT in §5.1.3. 'Printing US-ASCII characters that can represent themselves' are octets 0x20–0x25 and 0x27–0x7E (all printable ASCII except '&'). Applicability is 'conditional' because it only applies when the client encodes international mailbox names using modified UTF-7. Observable: a client that encodes, e.g., the letter 'A' inside a modified BASE64 shift sequence rather than representing it directly produces a malformed mailbox name.",
	},
	{
		id: "RFC3501-5.1.3-4",
		source: "RFC3501",
		section: "5.1.3",
		title: "International mailbox names MUST end in US-ASCII",
		text: "However, all names start in US-ASCII, and MUST end in US-ASCII; that is, a name that ends with a non-ASCII ISO-10646 character MUST end with a \"-\").",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"Explicit MUST in §5.1.3. Quoted exactly as printed in the RFC, including the leading 'However,' and the stray closing parenthesis ')' after the final quoted '-' — that unbalanced paren is present in the published RFC 3501 text. Applicability is 'conditional' because it only applies when the client encodes international mailbox names using modified UTF-7. Observable: any mailbox name transmitted by the client that terminates with an open modified BASE64 shift sequence (i.e., no closing '-' after the Base64 data) violates this rule.",
	},

	{
		id: "RFC3501-5.1.3-5",
		source: "RFC3501",
		section: "5.1.3",
		title: "No implicit shift from BASE64 to US-ASCII; null shifts are not permitted",
		text: "There is no implicit shift from BASE64 to US-ASCII, and null shifts (\"-&\" while in BASE64; note that \"&-\" while in US-ASCII means \"&\") are not permitted.",
		level: "MUST NOT",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"No RFC 2119 keyword; 'are not permitted' is plain-English prohibition prose. Level assigned as MUST NOT by judgment: a null shift in a modified UTF-7 mailbox name is declared impermissible, so a conforming client must never emit one. Applicability is 'conditional' because it only applies when the client encodes international mailbox names using modified UTF-7. Observable: a client-transmitted mailbox name containing the sequence '-&' inside a modified BASE64 section (a null shift) violates this rule; '&-' in US-ASCII context is the legitimate encoding of '&' and is not a null shift.",
	},

	// §5.2 Mailbox Size and Message Status Updates
	{
		id: "RFC3501-5.2-1",
		source: "RFC3501",
		section: "5.2",
		title: "Client MUST record mailbox size updates",
		text: "Regardless of what implementation decisions a client makes on remembering data from the server, a client implementation MUST record mailbox size updates.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"Explicit MUST. The obligation is that the client must update its internal state whenever an untagged EXISTS response is received, regardless of which command is in progress. Observable indirectly: a client that ignores unilateral EXISTS updates and subsequently uses a stale message count (e.g., attempting to FETCH a sequence number beyond the updated EXISTS value) reveals non-compliance.",
	},
	{
		id: "RFC3501-5.2-2",
		source: "RFC3501",
		section: "5.2",
		title: "Client MUST NOT assume subsequent commands return mailbox size",
		text: "It MUST NOT assume that any command after the initial mailbox selection will return the size of the mailbox.",
		level: "MUST NOT",
		applicability: "always",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"Explicit MUST NOT. This is the logical complement of RFC3501-5.2-1: the client must maintain its own size record (from unilateral EXISTS updates) rather than expecting the server to re-report it. Observable: a client that issues a command (e.g., NOOP) solely to obtain the current message count, and then fails to function correctly when the server does not include an EXISTS response, would reveal this dependency.",
	},

	// §5.5 Multiple Commands in Progress
	{
		id: "RFC3501-5.5-1",
		source: "RFC3501",
		section: "5.5",
		title: "Client MAY pipeline commands without waiting for completion",
		text: "The client MAY send another command without waiting for the completion result response of a command, subject to ambiguity rules (see below) and flow control constraints on the underlying data stream.",
		level: "MAY",
		applicability: "always",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"Explicit MAY. Records the permission to pipeline. Full sentence quoted verbatim, including '(see below)' and 'on the underlying data stream'. The 'ambiguity rules (see below)' are elaborated in RFC3501-5.5-2, RFC3501-5.5-3, and RFC3501-5.5-4. Observable: a client that sends two commands back-to-back before receiving the tagged completion of the first is exercising this MAY.",
	},
	{
		id: "RFC3501-5.5-2",
		source: "RFC3501",
		section: "5.5",
		title: "Command continuation request and response MUST be negotiated before next command",
		text: "However, any command continuation request responses and command continuations MUST be negotiated before any subsequent command is initiated.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"Explicit MUST in §5.5. Applicability is 'conditional' because it applies only when a command generates a continuation request (i.e., involves a client-to-server literal). Observable: a client that pipelines a second command before completing the literal-upload handshake for the first violates this. This interacts with RFC3501-4.3-1 (the literal continuation rule) but is a separate obligation in the pipelining context.",
	},
	{
		id: "RFC3501-5.5-3",
		source: "RFC3501",
		section: "5.5",
		title: "Client MUST NOT send multiple commands without waiting if an ambiguity would result",
		text: "Clients MUST NOT send multiple commands without waiting if an ambiguity would result.",
		level: "MUST NOT",
		applicability: "always",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"Explicit MUST NOT. The primary no-ambiguity pipelining rule. An ambiguity arises when an untagged EXPUNGE response to an earlier pipelined command could invalidate message sequence numbers in a later pipelined command. Examples of invalid non-waiting sequences from the RFC: 'FETCH + NOOP + STORE' and 'STORE + COPY + FETCH' (because NOOP and COPY can elicit EXPUNGE responses that would shift sequence numbers for the subsequent STORE/FETCH). Observable: a client that sends a NOOP, COPY, CLOSE, EXPUNGE, or UID EXPUNGE followed immediately by a command referencing message sequence numbers without waiting for the first command's completion violates this.",
	},
	{
		id: "RFC3501-5.5-4",
		source: "RFC3501",
		section: "5.5",
		title: "Client MUST wait for completion before sending sequence-number command after non-FETCH/STORE/SEARCH",
		text: "Therefore, if the client sends any command other than FETCH, STORE, or SEARCH, it MUST wait for the completion result response before sending a command with message sequence numbers.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"Explicit MUST in §5.5. This is the concrete operational rule implementing the ambiguity prohibition of RFC3501-5.5-3. Only FETCH, STORE, and SEARCH are safe to pipeline with subsequent sequence-number commands because servers are prohibited from sending EXPUNGE responses while those commands are in progress. All other commands (NOOP, COPY, CHECK, CLOSE, EXPUNGE, UID EXPUNGE, etc.) may elicit an EXPUNGE, so the client must wait for their completion before issuing any command that uses message sequence numbers. Applicability is 'conditional' because it binds only when the client is pipelining commands that reference message sequence numbers. Observable at the protocol layer: after any non-FETCH/STORE/SEARCH command tag is sent, a conformant client does not transmit another command containing a sequence-number set until it has received the tagged completion response.",
	},
	{
		id: "RFC3501-5.5-5",
		source: "RFC3501",
		section: "5.5",
		title: "Client must wait for completion after a UID command before sending a sequence-number command",
		text: "Note: UID FETCH, UID STORE, and UID SEARCH are different commands from FETCH, STORE, and SEARCH. If the client sends a UID command, it must wait for a completion result response before sending a command with message sequence numbers.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"The keyword 'must' is lowercase in the RFC text (pre-RFC-8174 convention does not formally distinguish case, but this catalog flags it). Level assigned as MUST by judgment: the Note closes the loophole that UID FETCH/UID STORE/UID SEARCH might be mistaken for the FETCH/STORE/SEARCH exemption of RFC3501-5.5-4 — UID commands can elicit untagged EXPUNGE responses, so the same wait obligation applies. Applicability is 'conditional' because it binds only when the client pipelines a UID command ahead of a command that uses message sequence numbers. Observable: after sending any UID command, a conformant client does not transmit a command containing a sequence-number set until it has received the tagged completion response.",
	},
];
