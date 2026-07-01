import type { SpecRequirement } from "../types";

export const note =
	"§4 Data Formats: " +
	"§4.1 Atom — extracted 1 (keyword-less definitional prose, judgment call: client must form atoms with " +
	"≥1 non-special character; identical to RFC3501-4.1-1, cross-referenced); " +
	"§4.1.1 Sequence Set and UID Set — extracted 1 (new subsection in rev2, absent from RFC 3501 §4; " +
	"keyword-less definitional prose consolidated into one entry, judgment call: a client-composed sequence " +
	"set never contains UIDs and a client-composed UID set never contains the '*' wildcard); " +
	"§4.2 Number — extracted 1 (keyword-less definitional prose, judgment call: client must form numbers " +
	"with ≥1 digit character; identical to RFC3501-4.2-1, cross-referenced); " +
	"§4.3 String — extracted 5 (1 explicit MUST for client synchronizing-literal send-wait carried over from " +
	"rev1; 1 explicit MUST NOT capping non-synchronizing (LITERAL-/RFC 7888) literal size at 4096 octets; " +
	"1 explicit MUST routing oversized literals through the synchronizing form; 1 keyword-less prose for the " +
	"rev2 UTF-8 quoted-string redefinition, materially changed from rev1's 7-bit rule; 1 explicit MUST in a " +
	"Note for zero-octet synchronizing-literal wait, narrowed from rev1 to synchronizing literals only; " +
	"the server-only 'non-synchronizing literal form MUST NOT be sent from server to client' sentence is " +
	"reviewed and excluded as it does not bind the client); " +
	"§4.3.1 8-Bit and Binary Strings — extracted 5 (1 MAY+SHOULD on 8-bit/multi-octet in literals carried " +
	"over from rev1; 1 new rev2 MUST-accept/MAY-transmit UTF-8-in-quoted-strings rule reflecting IMAP4rev2's " +
	"UTF-8-by-default text handling per [I18N-HDRS]; 1 explicit MUST to encode binary data before " +
	"transmitting, now carrying an explicit carve-out for BINARY.PEEK/BINARY literal8 FETCH responses; " +
	"1 keyword-less prose stating the general unencoded-binary-string prohibition that the encode-MUST " +
	"operationalizes, with the same literal8 carve-out; 1 explicit MAY to treat strings with excessive CTL " +
	"characters as binary, identical to rev1); " +
	"§4.4 Parenthesized List — no distinct client-binding requirements beyond format adherence (all sentences " +
	"are structural/definitional with no keyword, unchanged in substance from RFC 3501 §4.4; format " +
	"conformance is covered implicitly by command-level tests); " +
	"§4.5 NIL — no client-binding requirements (entire section is definitional/explanatory with no normative " +
	"keyword and no separately testable client obligation, unchanged in substance from RFC 3501 §4.5, plus " +
	"non-normative worked examples). " +
	"Total entries: 13. Untestable: 0.";

export const requirements: SpecRequirement[] = [
	// ── §4.1 Atom ────────────────────────────────────────────────────────────

	{
		id: "RFC9051-4.1-1",
		source: "RFC9051",
		section: "4.1",
		title: "Atom must consist of one or more non-special characters",
		text: "An atom consists of one or more non-special characters.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"No explicit RFC 2119 keyword; this is a definitional sentence that plainly obliges the client " +
			"whenever it sends an atom. Level assigned as MUST by judgment: violating the definition (sending " +
			"an empty atom or one containing special characters) would be a protocol error. Applicability is " +
			"'always': atoms are unavoidable in IMAP usage — command names, flags, and many arguments are " +
			"atoms, so every client emits atom syntax in normal operation. Text and analysis are unchanged " +
			"from RFC3501-4.1-1 (RFC 3501 §4.1), which this entry cross-references — the sentence is verbatim " +
			"identical between the two RFCs.",
	},

	// ── §4.1.1 Sequence Set and UID Set (new subsection in rev2) ──────────────

	{
		id: "RFC9051-4.1.1-1",
		source: "RFC9051",
		section: "4.1.1",
		title: "Sequence set never contains UIDs; UID set never contains the '*' wildcard",
		text:
			"A sequence set never contains unique identifiers. " +
			'A "UID set" is similar to the sequence set, but uses unique identifiers instead of message ' +
			'sequence numbers, and is not permitted to contain the special symbol "*".',
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"No explicit RFC 2119 keyword; both sentences are definitional prose that jointly define the two " +
			"disjoint set syntaxes a client uses to reference messages (sequence numbers vs. UIDs). Level " +
			"assigned as MUST by judgment: a client composing a sequence-set argument (e.g., for FETCH, STORE, " +
			"COPY, MOVE, SEARCH) must never place a UID value inside it, and a client composing a UID-set " +
			"argument (e.g., for UID FETCH, UID STORE) must never place the '*' wildcard inside it — mixing " +
			"the two forms produces a malformed command. Applicability is 'conditional': binds only when the " +
			"client constructs commands using sequence-set or UID-set syntax (most command usage, but not " +
			"universal). This subsection has no counterpart in RFC 3501 §4 — RFC 3501 defines 'sequence-set' " +
			"and 'uid-set' only as ABNF productions in its §9 Formal Syntax with no equivalent prose " +
			"discussion, so there is no RFC3501 cross-reference for this entry. " +
			"The elision ('...' not used here) is not applicable; both sentences are quoted verbatim and " +
			"joined with a period between them, matching the source's own paragraph break.",
	},

	// ── §4.2 Number ─────────────────────────────────────────────────────────

	{
		id: "RFC9051-4.2-1",
		source: "RFC9051",
		section: "4.2",
		title: "Number must consist of one or more digit characters",
		text: "A number consists of one or more digit characters and represents a numeric value.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"No explicit RFC 2119 keyword; definitional prose that plainly obliges the client whenever it " +
			"sends a number literal. Level assigned as MUST by judgment: sending a zero-length or non-digit " +
			"token where a number is required would be a protocol error. Applicability is 'always': numbers " +
			"are unavoidable in IMAP usage — sequence numbers, literal octet counts, and UIDs all use number " +
			"syntax in normal client operation. Text is verbatim identical to RFC3501-4.2-1 (RFC 3501 §4.2), " +
			"which this entry cross-references.",
	},

	// ── §4.3 String ─────────────────────────────────────────────────────────

	{
		id: "RFC9051-4.3-1",
		source: "RFC9051",
		section: "4.3",
		title: "Client must wait for continuation request before sending synchronizing-literal octet data",
		text:
			"In the case of synchronizing literals transmitted from client to server, the client MUST wait " +
			"to receive a command continuation request (described later in this document) before sending the " +
			"octet data (and the remainder of the command).",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"Explicit MUST. Applicability is 'conditional' because it binds only when the client chooses to " +
			"send a synchronizing literal. Observable at the protocol layer: a conformant client pauses after " +
			"the {N}CRLF prefix and resumes only after receiving a '+ ...' continuation response. This entry " +
			"corresponds to RFC3501-4.3-1 (RFC 3501 §4.3), narrowed in rev2 to 'synchronizing' literals " +
			"specifically because rev2 introduces the non-synchronizing literal (LITERAL-/RFC 7888) form, " +
			"covered separately by RFC9051-4.3-2 and RFC9051-4.3-3, which does not wait.",
	},
	{
		id: "RFC9051-4.3-2",
		source: "RFC9051",
		section: "4.3",
		title: "Non-synchronizing literal MUST NOT exceed 4096 octets unless an extension says otherwise",
		text:
			"Unless otherwise specified in an IMAP extension, non-synchronizing literals MUST NOT be larger " +
			"than 4096 octets.",
		level: "MUST NOT",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"Explicit MUST NOT. New in rev2 (the non-synchronizing literal, distinguished by a '+' before the " +
			"closing brace, e.g. '{123+}', is the LITERAL- extension from RFC 7888 folded into the base " +
			"IMAP4rev2 grammar). Applicability is 'conditional': binds only when the client sends a " +
			"non-synchronizing literal and no negotiated extension raises the limit. No RFC3501 counterpart — " +
			"RFC 3501 has only synchronizing literals. Observable at the protocol layer: a conformant client " +
			"never emits a '{N+}' prefix with N > 4096 (absent an extension); the companion routing rule for " +
			"oversized literals is captured in RFC9051-4.3-3.",
	},
	{
		id: "RFC9051-4.3-3",
		source: "RFC9051",
		section: "4.3",
		title: "Literal larger than 4096 bytes must be sent as a synchronizing literal",
		text: "Any literal larger than 4096 bytes MUST be sent as a synchronizing literal.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"Explicit MUST. New in rev2, paired with RFC9051-4.3-2: together the two sentences mean a client " +
			"choosing the non-synchronizing form for a large payload must fall back to the synchronizing " +
			"('{N}CRLF', wait-for-continuation) form once the payload exceeds 4096 octets. Applicability is " +
			"'conditional': binds only when the client sends a literal larger than 4096 bytes. No RFC3501 " +
			"counterpart. Observable at the protocol layer: a conformant client never emits a non-synchronizing " +
			"'{N+}' prefix for N > 4096; it uses '{N}' and waits for the continuation request instead " +
			"(RFC9051-4.3-1).",
	},
	{
		id: "RFC9051-4.3-4",
		source: "RFC9051",
		section: "4.3",
		title: "Quoted string is zero or more UTF-8-encoded Unicode characters excluding CR and LF",
		text:
			'A quoted string is a sequence of zero or more Unicode characters, excluding CR and LF, encoded ' +
			'in UTF-8, with double quote (<">) characters at each end.',
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"No explicit RFC 2119 keyword; definitional prose that plainly obliges the client when it sends a " +
			"quoted string. Level assigned as MUST by judgment: including CR, LF, or a byte sequence that is " +
			"not valid UTF-8 inside a quoted string would violate the protocol grammar and produce an invalid " +
			"command. Applicability is 'conditional' because it binds only when the client uses quoted-string " +
			"syntax. This entry corresponds to RFC3501-4.3-3 (RFC 3501 §4.3) but is materially changed: rev1 " +
			"restricted quoted strings to '7-bit characters'; rev2 redefines them as UTF-8-encoded Unicode " +
			"characters, reflecting IMAP4rev2's UTF-8-by-default text handling (see also RFC9051-4.3.1-2).",
	},
	{
		id: "RFC9051-4.3-5",
		source: "RFC9051",
		section: "4.3",
		title: "Client must wait for continuation request even for zero-octet synchronizing literals",
		text:
			"Note: Even if the octet count is 0, a client transmitting a synchronizing literal MUST wait to " +
			"receive a command continuation request.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"Explicit MUST appearing in a Note within §4.3. This is a distinct, separately testable obligation " +
			"from RFC9051-4.3-1: it clarifies that the wait requirement is not waived when the literal carries " +
			"zero octets ({0}CRLF). Applicability is 'conditional' because it binds only when the client sends " +
			"a synchronizing literal. This entry corresponds to RFC3501-4.3-2 (RFC 3501 §4.3), narrowed in " +
			"rev2's wording to 'synchronizing' literals specifically (the zero-octet non-synchronizing form, " +
			"'{0+}CRLF', does not wait, consistent with RFC9051-4.3-1's scope).",
	},

	// ── §4.3.1 8-Bit and Binary Strings ─────────────────────────────────────

	{
		id: "RFC9051-4.3.1-1",
		source: "RFC9051",
		section: "4.3.1",
		title: "Implementations MAY transmit 8-bit or multi-octet characters in literals but SHOULD only do so when CHARSET is identified",
		text:
			"IMAP4rev2 implementations MAY transmit 8-bit or multi-octet characters in literals but SHOULD " +
			"do so only when the [CHARSET] is identified.",
		level: "SHOULD",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"Contains both MAY (permission) and SHOULD (recommendation). The strongest client-binding keyword " +
			"is SHOULD: when a client elects to transmit 8-bit or multi-octet characters in a literal, it " +
			"should ensure the charset is identified. Applicability is 'conditional' because it binds only " +
			"when the client transmits 8-bit or multi-octet data. Text is verbatim identical in substance to " +
			"RFC3501-4.3.1-1 (RFC 3501 §4.3.1) apart from 'IMAP4rev1' being replaced with 'IMAP4rev2'; " +
			"cross-referenced accordingly.",
	},
	{
		id: "RFC9051-4.3.1-2",
		source: "RFC9051",
		section: "4.3.1",
		title: "Implementations MUST accept and MAY transmit UTF-8 text in quoted-strings free of NUL, CR, LF",
		text:
			"IMAP4rev2 implementations MUST accept and MAY transmit [UTF-8] text in quoted-strings as long as " +
			"the string does not contain NUL, CR, or LF.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"Explicit MUST (accept) and MAY (transmit). New in rev2 — this sentence has no RFC3501 " +
			"counterpart; it reflects IMAP4rev2's alignment with [I18N-HDRS] making UTF-8 the identified " +
			"charset for header-field values with 8-bit content, distinct from rev1 where 8-bit/multi-octet " +
			"transmission required an explicitly identified [CHARSET] per RFC9051-4.3.1-1. The client-binding " +
			"obligation captured here is the MUST-accept clause: a conformant client must be able to parse " +
			"UTF-8-encoded quoted-strings sent by the server. Applicability is 'always' because the client has " +
			"no way to prevent a server from sending UTF-8 quoted-strings and must be able to accept them in " +
			"any session; the MAY-transmit clause is conditional in practice but is subsumed under the same " +
			"sentence and not split into a separate entry since the two share one grammatical unit and the " +
			"MUST is the binding element. See also RFC9051-4.3-4 (the rev2 UTF-8 quoted-string definition).",
	},
	{
		id: "RFC9051-4.3.1-3",
		source: "RFC9051",
		section: "4.3.1",
		title: "Client and server implementations must encode binary data into textual form before transmitting",
		text:
			"Unless returned in response to BINARY.PEEK[...]/BINARY[...] FETCH, client and server " +
			"implementations MUST encode binary data into a textual form, such as base64, before transmitting " +
			"the data.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"Explicit MUST. A 'binary string' is defined in the same section as any string with NUL " +
			"characters. Applicability is 'conditional' because it binds only when the client has binary data " +
			"to transmit. Observable at the protocol layer: a conformant client never sends a string " +
			"containing NUL bytes; such data must appear encoded (e.g., base64). This entry corresponds to " +
			"RFC3501-4.3.1-2 (RFC 3501 §4.3.1) but is materially updated for rev2: it now carries an explicit " +
			"carve-out ('Unless returned in response to BINARY.PEEK[...]/BINARY[...] FETCH') for the new " +
			"BINARY extension's <literal8> mechanism, under which a server may return unencoded binary data " +
			"in response to a client's BINARY/BINARY.PEEK FETCH request — that carve-out is a server-side " +
			"exception to the encode obligation and does not itself bind the client, but is retained verbatim " +
			"because it scopes when the client-binding MUST applies. See also RFC9051-4.3.1-4.",
	},
	{
		id: "RFC9051-4.3.1-4",
		source: "RFC9051",
		section: "4.3.1",
		title: "Unencoded binary strings are not permitted except when returned via a literal8 BINARY/BINARY.PEEK FETCH response",
		text:
			"Although a BINARY content transfer encoding is defined, unencoded binary strings are not " +
			"permitted, unless returned in a <literal8> in response to a " +
			"BINARY.PEEK[<section-binary>]<<partial>> or BINARY[<section-binary>]<<partial>> FETCH data item.",
		level: "MUST NOT",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"No explicit RFC 2119 keyword ('are not permitted'); this sentence states, in general form, the " +
			"same prohibition that RFC9051-4.3.1-3 operationalizes via the encode-before-transmitting MUST, " +
			"and carries the same literal8/BINARY FETCH carve-out. Level assigned as MUST NOT by judgment: a " +
			"client sending an unencoded string containing NUL or excessive CTL characters (see " +
			"RFC9051-4.3.1-5) outside of a BINARY/BINARY.PEEK FETCH exchange violates this prohibition. " +
			"Applicability is 'conditional' because it binds only when the client has binary-classified data " +
			"to send. New in rev2 — the BINARY content-transfer-encoding and <literal8>/BINARY FETCH data " +
			"item did not exist in RFC 3501, so there is no RFC3501 cross-reference; this entry is closely " +
			"related to (but textually distinct from, and kept separate per the verbatim-text rule from) " +
			"RFC9051-4.3.1-3.",
	},
	{
		id: "RFC9051-4.3.1-5",
		source: "RFC9051",
		section: "4.3.1",
		title: "String with excessive CTL characters MAY be treated as binary",
		text: "A string with an excessive amount of CTL characters MAY also be considered to be binary.",
		level: "MAY",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"Explicit MAY. This sentence extends the definition of 'binary' to strings with excessive CTL " +
			"characters, meaning the MUST-encode obligation from RFC9051-4.3.1-3 MAY also apply to such " +
			"strings. The client-binding is: a client MAY treat excessive-CTL strings as binary (and thus " +
			"encode them). Observable: a client that encodes CTL-heavy strings as base64 is exercising this " +
			"MAY permission. Applicability is 'conditional' because it applies only when the client encounters " +
			"strings with excessive CTL characters. Text is verbatim identical to RFC3501-4.3.1-3 (RFC 3501 " +
			"§4.3.1); cross-referenced accordingly.",
	},
];
