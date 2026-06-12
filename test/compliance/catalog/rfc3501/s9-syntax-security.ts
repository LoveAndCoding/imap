import type { SpecRequirement } from "../types";

export const note =
	"§9: Prose rules extracted (priority rule, case-insensitivity, SP strictness, NUL prohibition). " +
	"ABNF productions are not itemized wholesale — they are covered via per-command syntax entries elsewhere — with " +
	"three exceptions for client-binding ABNF comments: the flag-extension comment (client MUST accept " +
	"flag-extension flags) is itemized as RFC3501-9-5; the mailbox production's INBOX comment (all case variants " +
	"of INBOX MUST be interpreted as INBOX) is itemized as RFC3501-9-6; and the body-extension comment's client " +
	"MUST ('Client implementations MUST accept body-extension fields.') is already covered by RFC3501-7.4.2-3 " +
	"(BODYSTRUCTURE extension data) and is cross-referenced rather than duplicated. " +
	"§10 (Author's Note): contains no client-binding normative text; it is a purely editorial statement that this document supersedes RFC 2060, RFC 1730, IMAP2bis.TXT, RFC 1176, and RFC 1064. " +
	"§11.1: All client-binding TLS/STARTTLS obligations extracted (cipher suite MUST/SHOULD, hostname verification MUST/SHOULD/MUST NOT, subjectAltName SHOULD, post-STARTTLS check MUST). " +
	"The §11.1 certificate-matching prose (case-insensitive matching, the '*' wildcard MAY, and the " +
	"multiple-names acceptance rule) is consolidated into a single entry, RFC3501-11.1-9. " +
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
			"Note: [ABNF] rules MUST be followed strictly...",
		level: "MUST",
		applicability: "always",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			'The "MUST take priority" sentence establishes a parsing obligation on any sender or receiver. ' +
			'The "[ABNF] rules MUST be followed strictly" note reinforces this as a blanket sender obligation. ' +
			'The first elision ("...") covers the inline example \\Seen/flag-extension; the trailing "..." marks ' +
			'that the Note continues mid-sentence ("; in particular:") into the three enumerated rules captured ' +
			"as RFC3501-9-2, RFC3501-9-3, and RFC3501-9-4. The normative content is unchanged.",
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
	{
		id: "RFC3501-9-5",
		source: "RFC3501",
		section: "9",
		title: "Client MUST accept flag-extension flags",
		text:
			"Future expansion. Client implementations ; MUST accept flag-extension flags. Server ; " +
			"implementations MUST NOT generate ; flag-extension flags except as defined by ; " +
			"future standard or standards-track ; revisions of this specification.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"ABNF comment on the flag-extension production ('\\' atom) in §9. The interior ';' tokens " +
			"are the comment-leader characters that begin each continuation line of the ABNF comment in " +
			"the RFC's formatting; reading past them, the comment says: 'Future expansion. Client " +
			"implementations MUST accept flag-extension flags. Server implementations MUST NOT generate " +
			"flag-extension flags except as defined by future standard or standards-track revisions of " +
			"this specification.' The client-binding keyword is the first MUST (accept flag-extension " +
			"flags); the MUST NOT sentence binds the server and is retained for completeness. " +
			"Testable: send a FETCH FLAGS response containing an unknown '\\' atom flag (e.g., " +
			"'\\Unknown') and verify the client parses it without error.",
	},
	{
		id: "RFC3501-9-6",
		source: "RFC3501",
		section: "9",
		title: "All case variants of INBOX MUST be interpreted as INBOX",
		text:
			"INBOX is case-insensitive. All case variants of ; INBOX (e.g., \"iNbOx\") MUST be " +
			"interpreted as INBOX ; not as an astring. An astring which consists of ; the " +
			"case-insensitive sequence \"I\" \"N\" \"B\" \"O\" \"X\" ; is considered to be INBOX and " +
			"not an astring. ...",
		level: "MUST",
		applicability: "always",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"ABNF comment on the mailbox production ('INBOX' / astring) in §9. The interior ';' tokens " +
			"are the comment-leader characters that begin each continuation line of the ABNF comment in " +
			"the RFC's formatting. The trailing '...' elides the comment's final cross-reference " +
			"sentence ('Refer to section 5.1 for further semantic details of mailbox names.'). This " +
			"comment binds the client's interpretation of mailbox names: any case variant of INBOX " +
			"(e.g., received in a LIST response or typed by a user) MUST be treated as the special " +
			"INBOX mailbox, not as a distinct astring name. Testable: verify the client treats " +
			"'inbox'/'iNbOx' and 'INBOX' as the same mailbox (e.g., does not present them as distinct " +
			"mailboxes or issue commands treating them as different names).",
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
		applicability: "always",
		profiles: ["rev1"],
		testability: "untestable",
		untestableRationale:
			"RC4 suites are removed from Node's OpenSSL (and prohibited by RFC 7465); " +
			"3DES suites are disabled at OpenSSL security level 2 in Node 20 (RFC 8996); " +
			"the mandated suites cannot be negotiated by any modern stack, so the requirement " +
			"is unverifiable black-box (and obsolete in practice).",
		notes:
			"Applicability is 'always': this is an implementation requirement ('implementations MUST " +
			"implement'), binding the client implementation itself rather than any particular session " +
			"or feature use. " +
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
		applicability: "always",
		profiles: ["rev1"],
		testability: "untestable",
		untestableRationale:
			"RC4 suites are removed from Node's OpenSSL (and prohibited by RFC 7465); " +
			"3DES suites are disabled at OpenSSL security level 2 in Node 20 (RFC 8996); " +
			"the mandated suites cannot be negotiated by any modern stack, so the requirement " +
			"is unverifiable black-box (and obsolete in practice).",
		notes:
			"Applicability is 'always': this is an implementation requirement ('implementations ... " +
			"SHOULD implement'), binding the client implementation itself rather than any particular " +
			"session or feature use. " +
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
		testability: "testable",
		notes:
			"Conditional: applies only during STARTTLS TLS certificate verification when the " +
			"certificate carries a subjectAltName dNSName. Testable: SAN precedence is observable " +
			"from connection outcomes — present a certificate whose CN mismatches the hostname but " +
			"whose SAN dNSName matches (a conforming client proceeds), and one whose CN matches but " +
			"whose SAN dNSName mismatches (a conforming client treats the identity check as failed " +
			"and rejects or seeks user confirmation per RFC3501-11.1-4).",
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
	{
		id: "RFC3501-11.1-9",
		source: "RFC3501",
		section: "11.1",
		title: "Certificate matching: case-insensitive, wildcard MAY, any-of-multiple-names acceptable",
		text:
			"Matching is case-insensitive. A \"*\" wildcard character MAY be used as the left-most " +
			"name component in the certificate. ... If the certificate contains multiple names " +
			"(e.g., more than one dNSName field), then a match with any one of the fields is " +
			"considered acceptable.",
		level: "MAY",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"Consolidated entry: three sentences from the §11.1 certificate-matching rules are " +
			"recorded together because they jointly define how the hostname comparison of " +
			"RFC3501-11.1-3 is performed (case-insensitivity, wildcard acceptance, multiple-names " +
			"acceptance) and none is independently meaningful outside that comparison. The elision " +
			"('...') covers the illustrative example sentence ('For example, *.example.com would " +
			"match a.example.com, foo.example.com, etc. but would not match example.com.'). Level is " +
			"MAY, the strongest (and only) RFC 2119 keyword binding the client here — the wildcard " +
			"permission; the case-insensitivity and multiple-names sentences are keyword-less matching " +
			"semantics the client follows when performing the MUST-level check of RFC3501-11.1-3. " +
			"Conditional: applies only during STARTTLS TLS certificate verification. " +
			"Sub-clause testability: the wildcard sub-clause is untestable with this harness — the " +
			"driver connects by IP address (127.0.0.1) and wildcard patterns (*.example.test) match " +
			"DNS names only; IP addresses are never matched against wildcard patterns. Testing wildcard " +
			"matching would require connecting by DNS hostname, which is unavailable in this loopback " +
			"harness without a local DNS resolver fixture. The case-insensitivity and multiple-names " +
			"sub-clauses remain testable and are implicitly verified by the SAN tests (RFC3501-11.1-7 " +
			"scenarios) where the TLS stack applies these rules when matching SAN fields.",
	},
];
