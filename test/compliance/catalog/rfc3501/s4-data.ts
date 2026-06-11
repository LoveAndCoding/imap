import type { SpecRequirement } from "../types";

export const note =
	"§4 Data Formats: " +
	"§4.1 Atom — extracted 1 (keyword-less definitional prose, judgment call: client must form atoms with ≥1 non-special character); " +
	"§4.2 Number — extracted 1 (keyword-less definitional prose, judgment call: client must form numbers with ≥1 digit character); " +
	"§4.3 String — extracted 3 (1 explicit MUST for client literal send-wait, 1 explicit MUST in Note for zero-octet literal, 1 keyword-less prose for quoted-string character constraints); " +
	"§4.3.1 8-bit and Binary Strings — extracted 2 (1 MAY+SHOULD on 8-bit/multi-octet in literals, 1 explicit MUST to encode binary data before transmitting); " +
	"§4.4 Parenthesized List — no distinct client-binding requirements beyond format adherence (all sentences are structural/definitional with no keyword; format conformance is covered implicitly by command-level tests); " +
	"§4.5 NIL — no client-binding requirements (entire section is definitional/explanatory with no normative keyword and no separately testable client obligation). " +
	"Total entries: 8. Untestable: 0.";

export const requirements: SpecRequirement[] = [
	{
		id: "RFC3501-4.1-1",
		source: "RFC3501",
		section: "4.1",
		title: "Atom must consist of one or more non-special characters",
		text: "An atom consists of one or more non-special characters.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"No explicit RFC 2119 keyword; this is a definitional sentence that plainly obliges the client whenever it sends an atom. Level assigned as MUST by judgment: violating the definition (sending an empty atom or one containing special characters) would be a protocol error. Applicability is 'conditional' because it binds only when the client sends data in atom syntax.",
	},
	{
		id: "RFC3501-4.2-1",
		source: "RFC3501",
		section: "4.2",
		title: "Number must consist of one or more digit characters",
		text: "A number consists of one or more digit characters, and represents a numeric value.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"No explicit RFC 2119 keyword; definitional prose that plainly obliges the client whenever it sends a number literal. Level assigned as MUST by judgment: sending a zero-length or non-digit token where a number is required would be a protocol error. Applicability is 'conditional' because it binds only when the client sends data in number syntax.",
	},
	{
		id: "RFC3501-4.3-1",
		source: "RFC3501",
		section: "4.3",
		title: "Client must wait for continuation request before sending literal octet data",
		text: "In the case of literals transmitted from client to server, the client MUST wait to receive a command continuation request (described later in this document) before sending the octet data (and the remainder of the command).",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"Explicit MUST. Applicability is 'conditional' because it binds only when the client chooses to send a literal string. Observable at the protocol layer: a conformant client pauses after the {N}CRLF prefix and resumes only after receiving a '+ ...' continuation response.",
	},
	{
		id: "RFC3501-4.3-2",
		source: "RFC3501",
		section: "4.3",
		title: "Client must wait for continuation request even for zero-octet literals",
		text: "Even if the octet count is 0, a client transmitting a literal MUST wait to receive a command continuation request.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"Explicit MUST appearing in a Note within §4.3. This is a distinct, separately testable obligation from RFC3501-4.3-1: it clarifies that the wait requirement is not waived when the literal carries zero octets ({0}CRLF). Applicability is 'conditional' because it binds only when the client sends a literal.",
	},
	{
		id: "RFC3501-4.3-3",
		source: "RFC3501",
		section: "4.3",
		title: "Quoted string must contain only 7-bit characters excluding CR and LF",
		text: "A quoted string is a sequence of zero or more 7-bit characters, excluding CR and LF, with double quote (<\">) characters at each end.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"No explicit RFC 2119 keyword; definitional prose that plainly obliges the client when it sends a quoted string. Level assigned as MUST by judgment: including a non-7-bit character, CR, or LF inside a quoted string would violate the protocol grammar and produce an invalid command. Applicability is 'conditional' because it binds only when the client uses quoted-string syntax.",
	},
	{
		id: "RFC3501-4.3.1-1",
		source: "RFC3501",
		section: "4.3.1",
		title: "Implementations MAY transmit 8-bit or multi-octet characters in literals but SHOULD only do so when CHARSET is identified",
		text: "IMAP4rev1 implementations MAY transmit 8-bit or multi-octet characters in literals, but SHOULD do so only when the [CHARSET] is identified.",
		level: "SHOULD",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"Contains both MAY (permission) and SHOULD (recommendation). The strongest client-binding keyword is SHOULD: when a client elects to transmit 8-bit or multi-octet characters in a literal, it should ensure the charset is identified. Applicability is 'conditional' because it binds only when the client transmits 8-bit or multi-octet data.",
	},
	{
		id: "RFC3501-4.3.1-2",
		source: "RFC3501",
		section: "4.3.1",
		title: "Implementations must encode binary data into a textual form before transmitting",
		text: "Implementations MUST encode binary data into a textual form, such as BASE64, before transmitting the data.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"Explicit MUST. A 'binary string' is defined in the same section as any string with NUL characters. Applicability is 'conditional' because it binds only when the client has binary data to transmit. Observable at the protocol layer: a conformant client never sends a string containing NUL bytes; such data must appear encoded (e.g., BASE64).",
	},
	{
		id: "RFC3501-4.3.1-3",
		source: "RFC3501",
		section: "4.3.1",
		title: "String with excessive CTL characters MAY be treated as binary",
		text: "A string with an excessive amount of CTL characters MAY also be considered to be binary.",
		level: "MAY",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"Explicit MAY. This sentence extends the definition of 'binary' to strings with excessive CTL characters, meaning the MUST-encode obligation from RFC3501-4.3.1-2 MAY also apply to such strings. The client-binding is: a client MAY treat excessive-CTL strings as binary (and thus encode them). Observable: a client that encodes CTL-heavy strings as BASE64 is exercising this MAY permission. Applicability is 'conditional' because it applies only when the client encounters strings with excessive CTL characters.",
	},
];
