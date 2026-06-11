import type { SpecRequirement } from "../types";

export const note =
	"§9: Prose rules extracted (priority rule, case-insensitivity, SP strictness, NUL prohibition). " +
	"ABNF productions are intentionally not itemized here — they are covered via per-command syntax entries elsewhere. " +
	"§10 (Author's Note): contains no client-binding normative text; it is a purely editorial statement that this document supersedes RFC 2060, RFC 1730, IMAP2bis.TXT, RFC 1176, and RFC 1064. " +
	"§11.1: All client-binding TLS/STARTTLS obligations extracted (cipher suite MUST/SHOULD, hostname verification MUST/SHOULD/MUST NOT, subjectAltName SHOULD, post-STARTTLS check MUST). " +
	"§11.2: All normative (MUST/SHOULD) sentences in §11.2 bind the SERVER only (error message disclosure, plaintext-password configuration, login-failure brute-force limiting). " +
	"No client-binding requirements found in §11.2; informational guidance about LOGIN plaintext risk carries no RFC 2119 keyword directed at the client.";

export const requirements: SpecRequirement[] = [
	// ── §9 Formal Syntax – prose rules ──────────────────────────────────────

	{
		id: "RFC3501-9-1",
		source: "RFC3501",
		section: "9",
		title: "ABNF alternative-rule priority: earlier rule takes priority",
		text:
			"In the case of alternative or optional rules in which a later rule overlaps an earlier rule, " +
			"the rule which is listed earlier MUST take priority. ... " +
			"Note: [ABNF] rules MUST be followed strictly",
		level: "MUST",
		applicability: "always",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			'The "MUST take priority" sentence establishes a parsing obligation on any sender or receiver. ' +
			'The "[ABNF] rules MUST be followed strictly" note reinforces this as a blanket sender obligation. ' +
			'Elision ("...") covers the inline example \\Seen/flag-extension; the normative content is unchanged.',
	},
	{
		id: "RFC3501-9-2",
		source: "RFC3501",
		section: "9",
		title: "Case-insensitivity of alphabetic token strings",
		text:
			"Except as noted otherwise, all alphabetic characters are case-insensitive. " +
			"The use of upper or lower case characters to define token strings is for editorial clarity only. " +
			"Implementations MUST accept these strings in a case-insensitive fashion.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			'The clause "Except as noted otherwise" makes this the default; specific productions (e.g., base64-char) ' +
			"carry inline notes marking them case-sensitive. This entry captures the default rule; " +
			"case-sensitive exceptions are covered under per-production entries.",
	},
	{
		id: "RFC3501-9-3",
		source: "RFC3501",
		section: "9",
		title: "SP is exactly one space; TAB and LWSP substitution prohibited",
		text:
			"In all cases, SP refers to exactly one space. " +
			"It is NOT permitted to substitute TAB, insert additional spaces, " +
			"or otherwise treat SP as being equivalent to LWSP.",
		level: "MUST NOT",
		applicability: "always",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			'The prohibition is stated with "NOT permitted" rather than "MUST NOT" in the original, ' +
			"but the normative force is equivalent to MUST NOT. Level set accordingly.",
	},
	{
		id: "RFC3501-9-4",
		source: "RFC3501",
		section: "9",
		title: "ASCII NUL character (%x00) must never be used",
		text: "The ASCII NUL character, %x00, MUST NOT be used at any time.",
		level: "MUST NOT",
		applicability: "always",
		profiles: ["rev1"],
		testability: "testable",
	},

	// ── §11.1 STARTTLS Security Considerations ───────────────────────────────

	{
		id: "RFC3501-11.1-1",
		source: "RFC3501",
		section: "11.1",
		title: "Client MUST implement TLS_RSA_WITH_RC4_128_MD5 cipher suite",
		text:
			"IMAP client and server implementations MUST implement the " +
			"TLS_RSA_WITH_RC4_128_MD5 [TLS] cipher suite, and SHOULD implement the " +
			"TLS_DHE_DSS_WITH_3DES_EDE_CBC_SHA [TLS] cipher suite. " +
			"This is important as it assures that any two compliant implementations can be configured to interoperate. " +
			"All other cipher suites are OPTIONAL.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"Conditional: binds only when the client negotiates TLS via STARTTLS. " +
			"Both TLS_RSA_WITH_RC4_128_MD5 and TLS_DHE_DSS_WITH_3DES_EDE_CBC_SHA are now considered obsolete " +
			"(RC4 and 3DES deprecated by later RFCs and RFCs 7465/8996), but the text is recorded verbatim " +
			"as written in RFC 3501. The SHOULD clause for TLS_DHE_DSS_WITH_3DES_EDE_CBC_SHA is captured " +
			"in RFC3501-11.1-2.",
	},
	{
		id: "RFC3501-11.1-2",
		source: "RFC3501",
		section: "11.1",
		title: "Client SHOULD implement TLS_DHE_DSS_WITH_3DES_EDE_CBC_SHA cipher suite",
		text:
			"IMAP client and server implementations MUST implement the " +
			"TLS_RSA_WITH_RC4_128_MD5 [TLS] cipher suite, and SHOULD implement the " +
			"TLS_DHE_DSS_WITH_3DES_EDE_CBC_SHA [TLS] cipher suite.",
		level: "SHOULD",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"Conditional: binds only when the client negotiates TLS via STARTTLS. " +
			"Cipher suite is now obsolete (3DES deprecated); recorded verbatim as written in RFC 3501. " +
			"The MUST clause for TLS_RSA_WITH_RC4_128_MD5 is captured separately in RFC3501-11.1-1.",
	},
	{
		id: "RFC3501-11.1-3",
		source: "RFC3501",
		section: "11.1",
		title: "Client MUST verify server hostname against server certificate during TLS",
		text:
			"During the [TLS] negotiation, the client MUST check its understanding of the server hostname " +
			"against the server's identity as presented in the server Certificate message, " +
			"in order to prevent man-in-the-middle attacks. " +
			"If the match fails, the client SHOULD either ask for explicit user confirmation, " +
			"or terminate the connection and indicate that the server's identity is suspect.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"Conditional: binds only during TLS negotiation via STARTTLS. " +
			"The SHOULD clause for failure handling is captured within the same verbatim text; " +
			"highest binding keyword for this entry is MUST (the check itself). " +
			"The failure-handling SHOULD is also captured as RFC3501-11.1-4.",
	},
	{
		id: "RFC3501-11.1-4",
		source: "RFC3501",
		section: "11.1",
		title: "On hostname/certificate mismatch, client SHOULD ask user or terminate",
		text:
			"If the match fails, the client SHOULD either ask for explicit user confirmation, " +
			"or terminate the connection and indicate that the server's identity is suspect.",
		level: "SHOULD",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"Conditional: applies only when hostname/certificate match fails during STARTTLS TLS negotiation.",
	},
	{
		id: "RFC3501-11.1-5",
		source: "RFC3501",
		section: "11.1",
		title: "Client MUST use original server hostname (not insecure DNS) for certificate comparison",
		text:
			"The client MUST use the server hostname it used to open the connection as the value " +
			"to compare against the server name as expressed in the server certificate. " +
			"The client MUST NOT use any form of the server hostname derived from an insecure remote source " +
			"(e.g., insecure DNS lookup). CNAME canonicalization is not done.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "untestable",
		untestableRationale:
			"Whether the client internally uses an insecure DNS-derived hostname for comparison " +
			"cannot be observed from the outside via black-box testing of the IMAP protocol exchange; " +
			"it requires white-box inspection of the TLS implementation.",
		notes:
			"Conditional: applies only during STARTTLS TLS certificate verification. " +
			"The MUST NOT clause is captured in RFC3501-11.1-6; both share the same verbatim excerpt.",
	},
	{
		id: "RFC3501-11.1-6",
		source: "RFC3501",
		section: "11.1",
		title: "Client MUST NOT use server hostname from insecure remote source for certificate comparison",
		text:
			"The client MUST NOT use any form of the server hostname derived from an insecure remote source " +
			"(e.g., insecure DNS lookup). CNAME canonicalization is not done.",
		level: "MUST NOT",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "untestable",
		untestableRationale:
			"The source of the hostname used internally by the client for certificate verification " +
			"is not observable via black-box IMAP protocol testing.",
	},
	{
		id: "RFC3501-11.1-7",
		source: "RFC3501",
		section: "11.1",
		title: "Client SHOULD use subjectAltName dNSName as source of server identity when present",
		text:
			"If a subjectAltName extension of type dNSName is present in the certificate, " +
			"it SHOULD be used as the source of the server's identity.",
		level: "SHOULD",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "untestable",
		untestableRationale:
			"Which certificate field the client uses for identity comparison is internal TLS state " +
			"not observable via black-box IMAP protocol testing.",
	},
	{
		id: "RFC3501-11.1-8",
		source: "RFC3501",
		section: "11.1",
		title: "Client MUST check result of STARTTLS command and TLS negotiation for acceptable security",
		text:
			"Both the client and server MUST check the result of the STARTTLS command and subsequent " +
			"[TLS] negotiation to see whether acceptable authentication or privacy was achieved.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"Conditional: applies only when STARTTLS is used. " +
			"Testable by observing whether the client aborts the session when TLS negotiation fails " +
			"to achieve the expected security level.",
	},
];
