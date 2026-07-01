import type { SpecRequirement } from "../types";

export const note =
	"§9: Prose rules extracted (priority rule, case-insensitivity, SP strictness, NUL prohibition). " +
	"ABNF productions are not itemized wholesale — they are covered via per-command syntax entries " +
	"elsewhere — with four client-relevant ABNF comments identified, mirroring the RFC 3501 " +
	"approach (this RFC's ABNF comments use the same ';'-per-line comment-leader convention as " +
	"RFC 3501's): the flag-extension comment (client MUST accept flag-extension flags) is itemized " +
	"as RFC9051-9-5; the mailbox production's INBOX comment (all case variants of INBOX MUST be " +
	"interpreted as INBOX) is itemized as RFC9051-9-6; the body-extension comment's client MUST " +
	"('Client implementations MUST accept body-extension fields.') is itemized separately as " +
	"RFC9051-9-7 for traceability, cross-referenced to this RFC's BODYSTRUCTURE extension-data " +
	"entry (§7.4.2 module) rather than treated as an independent test target — mirroring how " +
	"RFC3501-9-5's sibling comment is handled for RFC 3501; and a fourth comment, on the " +
	"search-program production ('; CHARSET argument to SEARCH MUST be registered with IANA.'), " +
	"is not itemized as a standalone §9 entry — it is cross-referenced instead to the CHARSET " +
	"entries already extracted from §6.4.4 SEARCH in s6-selected.ts (RFC9051-6.4.4-5, RFC9051-6.4.4-6), " +
	"which cover the same CHARSET-specification/registration duty from the SEARCH-command angle. " +
	"§10 (Author's Note): contains no client-binding normative text; it is a purely editorial " +
	"statement that this document supersedes RFC 3501, RFC 2060, RFC 1730, IMAP2bis.TXT, IMAP2, " +
	"and RFC 1064. " +
	"§11.1: All client-binding TLS obligations extracted (TLS 1.2+ MUST, TLS 1.3 RECOMMENDED, " +
	"TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 MUST-implement when using TLS 1.2, RFC 7525 cipher " +
	"suites RECOMMENDED, hostname-verification MUST, STARTTLS-result-check MUST). Unlike RFC 3501 " +
	"§11.1, this RFC does NOT itemize certificate-matching mechanics (case-insensitivity, wildcard, " +
	"subjectAltName, ask-user-on-mismatch) inline — it delegates that procedure entirely to " +
	"[RFC7817] by reference ('This procedure is described in [RFC7817]'), which is out of scope " +
	"(external document, not itself RFC 9051 text). " +
	"§11.2: Client-binding dual-port-support MUST and try-both-ports SHOULD extracted; the server " +
	"implicit-TLS-port MUST and cleartext-STARTTLS-allowance MUST bind the server only and are not " +
	"itemized. " +
	"§11.3: The client-binding SHOULD/MUST duties for handling unsolicited/premature responses " +
	"before authentication are extracted (ignore non-CAPABILITY/status responses SHOULD, ignore " +
	"ALERT until TLS/SASL-confidentiality SHOULD, ignore message/mailbox-status responses outside " +
	"selected state MUST). The internal cross-reference to §7.1.4 (PREAUTH) points outside this " +
	"module's scope (§7) and is not separately itemized here. " +
	"§11.4, §11.5, §11.6, §11.7: reviewed — no client-binding requirements found. §11.4's response-code " +
	"SHOULD NOT and §11.5's MUST NOT bind the server (as issuer/lister); §11.6 (Use of MD5) carries " +
	"no RFC 2119 keyword at all (purely informational); §11.7's configuration MUST, brute-force-limiting " +
	"SHOULD, password-strength SHOULD, and error-message SHOULD NOTs all bind the server. " +
	"Appendix E (Changes from RFC 3501 / IMAP4rev1): reviewed in full — it is a purely descriptive, " +
	"editorial summary-of-changes list. None of its 30 bullet items independently states a new " +
	"client-binding RFC 2119 duty in Appendix E's own text; where a bullet references a duty (e.g. " +
	"item 22, 'client implementations MUST ignore response codes that they do not recognize'), the " +
	"binding normative sentence lives in the body section that defines it (§7, out of this module's " +
	"scope) and Appendix E merely narrates that the requirement level changed from RFC 3501. No " +
	"entries extracted from Appendix E. " +
	"Appendices A-D (Backward Compatibility with IMAP4rev1, BINARY, LIST-EXTENDED; 63-Bit Sizes) " +
	"were noticed during the read-through and do contain client-binding MUST/SHOULD text (e.g. " +
	"Appendix A's 'client that wants to use IMAP4rev2 MUST issue an \"ENABLE IMAP4rev2\" command' " +
	"and Appendix D's 'client implementations have to expect' 63-bit sizes), but they fall outside " +
	"this task's assigned scope (§9, §10, §11, and the 'Changes from RFC 3501' appendix only) and " +
	"are flagged here for a future extraction pass rather than captured in this module.";

export const requirements: SpecRequirement[] = [
	// ── §9 Formal Syntax – prose rules ──────────────────────────────────────

	{
		id: "RFC9051-9-1",
		source: "RFC9051",
		section: "9",
		title: "ABNF alternative-rule priority: earlier rule takes priority",
		text:
			"In the case of alternative or optional rules in which a later rule " +
			"overlaps an earlier rule, the rule that is listed earlier MUST take " +
			"priority. ... Note: [ABNF] rules MUST be followed strictly; in particular:",
		level: "MUST",
		applicability: "always",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			'The "MUST take priority" sentence establishes a parsing obligation on any sender or ' +
			'receiver. The "[ABNF] rules MUST be followed strictly" note reinforces this as a blanket ' +
			"sender obligation. The elision (\"...\") covers the inline example (\\Seen vs. " +
			'flag-extension) and the sentence "Some, but not all, instances of this rule are noted ' +
			'below." The numbered list that follows the Note colon is captured as RFC9051-9-2, ' +
			"RFC9051-9-3, and RFC9051-9-4. Cross-reference: equivalent to RFC3501-9-1, but RFC 9051 " +
			'rewords "MUST be followed strictly ; in particular:" without the RFC 3501 ABNF-comment ' +
			"';' continuation markers (this RFC's formal-syntax prose is ordinary paragraph text, not " +
			"an ABNF comment block, so no ';' artifacts exist here).",
	},
	{
		id: "RFC9051-9-2",
		source: "RFC9051",
		section: "9",
		title: "Case-insensitivity of alphabetic token strings",
		text:
			"Unless otherwise noted, all alphabetic characters are case " +
			"insensitive. The use of uppercase or lowercase characters to " +
			"define token strings is for editorial clarity only. " +
			"Implementations MUST accept these strings in a case-insensitive " +
			"fashion.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			'The clause "Unless otherwise noted" makes this the default; specific productions (e.g., ' +
			"base64-char, marked \"Case sensitive\") carry inline notes marking them case-sensitive. " +
			"This entry captures the default rule; case-sensitive exceptions are covered under " +
			'per-production entries. Cross-reference: equivalent to RFC3501-9-2; RFC 9051 rewords ' +
			'"Except as noted otherwise" (RFC 3501) as "Unless otherwise noted" and "upper or lower ' +
			'case" as "uppercase or lowercase" — textually distinct but semantically identical.',
	},
	{
		id: "RFC9051-9-3",
		source: "RFC9051",
		section: "9",
		title: "SP is exactly one space; TAB and LWSP substitution prohibited",
		text:
			"In all cases, SP refers to exactly one space. It is NOT " +
			"permitted to substitute TAB, insert additional spaces, or " +
			"otherwise treat SP as being equivalent to linear whitespace " +
			"(LWSP).",
		level: "MUST NOT",
		applicability: "always",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			'The prohibition is stated with "NOT permitted" rather than "MUST NOT" in the original, ' +
			"but the normative force is equivalent to MUST NOT. Level set accordingly. Cross-reference: " +
			'equivalent to RFC3501-9-3; RFC 9051 spells out "linear whitespace (LWSP)" instead of ' +
			'RFC 3501\'s bare "LWSP" — same defined term, expanded on first use.',
	},
	{
		id: "RFC9051-9-4",
		source: "RFC9051",
		section: "9",
		title: "ASCII NUL character (%x00) must never be used except in OCTET",
		text:
			"The ASCII NUL character, %x00, MUST NOT be used anywhere, with " +
			"the exception of the OCTET production.",
		level: "MUST NOT",
		applicability: "always",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"Cross-reference: narrows RFC3501-9-4 ('MUST NOT be used at any time', no exception stated) " +
			"by adding an explicit carve-out for the OCTET production (used by literal8/CHAR8 octet " +
			"streams, e.g. binary FETCH/APPEND literals introduced by RFC 9051). This is a substantive " +
			"change from RFC 3501, not just a rewording: RFC 9051 permits NUL within raw octet literals.",
	},
	{
		id: "RFC9051-9-5",
		source: "RFC9051",
		section: "9",
		title: "Client MUST accept flag-extension flags",
		text:
			"; Future expansion.  Client implementations " +
			"; MUST accept flag-extension flags.  Server " +
			"; implementations MUST NOT generate " +
			"; flag-extension flags except as defined by " +
			"; a future Standard or Standards Track " +
			"; revisions of this specification.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"ABNF comment on the flag-extension production (\"\\\" atom) in §9. The interior ';' tokens " +
			"are the comment-leader characters that begin each continuation line of the ABNF comment in " +
			"the RFC's formatting (same convention as RFC 3501). The client-binding keyword is the " +
			"first MUST (accept flag-extension flags); the MUST NOT sentence binds the server and is " +
			"retained for completeness. RFC 9051 " +
			"appends a new final sentence (not present in RFC 3501) noting '\\Recent' was defined in " +
			"RFC 3501 and is now deprecated — that sentence carries no independent client duty and is " +
			"omitted from this entry's text. Testable: send a FETCH FLAGS response containing an " +
			"unknown '\\' atom flag (e.g., '\\Unknown') and verify the client parses it without error. " +
			"Cross-reference: equivalent to RFC3501-9-5.",
	},
	{
		id: "RFC9051-9-6",
		source: "RFC9051",
		section: "9",
		title: "All case variants of INBOX MUST be interpreted as INBOX",
		text:
			"; INBOX is case insensitive.  All case variants " +
			"; of INBOX (e.g., \"iNbOx\") MUST be interpreted as " +
			"; INBOX, not as an astring.  An astring that " +
			"; consists of the case-insensitive sequence " +
			"; \"I\" \"N\" \"B\" \"O\" \"X\" is considered " +
			"; to be an INBOX and not an astring. ...",
		level: "MUST",
		applicability: "always",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"ABNF comment on the mailbox production (\"INBOX\" / astring) in §9. The interior ';' " +
			"tokens are the comment-leader characters that begin each continuation line of the ABNF " +
			"comment in the RFC's formatting (same convention as RFC 3501). The trailing '...' elides " +
			"the comment's final cross-reference sentence ('; Refer to Section 5.1 for further ; " +
			"semantic details of mailbox names.'). This comment binds the client's interpretation of " +
			"mailbox names: any case variant of INBOX (e.g., received in a LIST response or typed by a " +
			"user) MUST be treated as the special INBOX mailbox, not as a distinct astring name. " +
			"Testable: verify the client treats 'inbox'/'iNbOx' and 'INBOX' as the same mailbox (e.g., " +
			"does not present them as distinct mailboxes or issue commands treating them as different " +
			"names). Cross-reference: equivalent to RFC3501-9-6; wording differs slightly ('MUST be " +
			"interpreted as INBOX, not as an astring' vs. RFC 3501's 'MUST be interpreted as INBOX not " +
			"as an astring'; 'consists of the case-insensitive sequence' vs. RFC 3501's 'consists of " +
			"the case-insensitive sequence'; RFC 9051 says 'is considered to be an INBOX' (with " +
			"article 'an') where RFC 3501 says 'is considered to be INBOX' (no article) — recorded " +
			"verbatim as written in each RFC).",
	},
	{
		id: "RFC9051-9-7",
		source: "RFC9051",
		section: "9",
		title: "Client MUST accept body-extension fields (cross-reference)",
		text:
			"; Future expansion.  Client implementations " +
			"; MUST accept body-extension fields.  Server " +
			"; implementations MUST NOT generate " +
			"; body-extension fields except as defined by " +
			"; future Standard or Standards Track " +
			"; revisions of this specification.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"ABNF comment on the body-extension production in §9 (note: unlike the flag-extension " +
			"comment, this one reads 'defined by future Standard' with no article 'a' before 'future' " +
			"— recorded verbatim as written). Structurally identical in force to " +
			"the flag-extension comment (RFC9051-9-5): client MUST accept unrecognized body-extension " +
			"fields returned within BODYSTRUCTURE. This duty is already covered by this RFC's " +
			"BODYSTRUCTURE extension-data entry in the §7.4.2 module and is cross-referenced rather " +
			"than duplicated as a separately-tested entry, mirroring how RFC3501-9-5's sibling comment " +
			"is handled for RFC 3501 (see RFC3501-9-5's module note referencing RFC3501-7.4.2-3). " +
			"Recorded here for completeness of the §9 ABNF-comment sweep. Cross-reference: RFC3501 has " +
			"no standalone RFC3501-9-7 counterpart — its equivalent comment is folded directly into " +
			"the RFC3501-9-5 module note rather than itemized; this module itemizes it separately for " +
			"traceability but treats it as a duplicate-coverage cross-reference, not a new test target.",
	},

	// ── §11.1 TLS-Related Security Considerations ────────────────────────────

	{
		id: "RFC9051-11.1-1",
		source: "RFC9051",
		section: "11.1",
		title: "Client MUST comply with relevant TLS recommendations from RFC 8314",
		text: "IMAP client and server implementations MUST comply with relevant TLS recommendations from [RFC8314].",
		level: "MUST",
		applicability: "always",
		profiles: ["rev2"],
		testability: "untestable",
		untestableTheme: "capability-inventory",
		untestableRationale:
			"RFC 8314 is an external document establishing a broad basket of TLS/implicit-TLS " +
			"recommendations (e.g., prefer implicit TLS, upgrade mechanisms, deployment guidance) " +
			"rather than a single wire-observable behavior. Compliance with 'relevant recommendations' " +
			"quantifies over an open-ended external document and cannot be reduced to one black-box " +
			"assertion; the concrete, individually testable duties RFC 9051 pulls from that basket " +
			"(TLS 1.2+ MUST, cipher-suite MUST, hostname-check MUST) are separately catalogued as " +
			"RFC9051-11.1-2 through RFC9051-11.1-6 and RFC9051-11.2-1/2.",
		notes:
			"New in RFC 9051 (no RFC 3501 counterpart — RFC 8314 postdates RFC 3501). This is a pointer " +
			"requirement; its operative content is realized through the specific, testable sub-duties " +
			"itemized separately in this module. Adjacent qualifying sentence (same paragraph, " +
			"immediately following the quoted MUST): 'If recommendations/requirements in this document " +
			"conflict with recommendations from [RFC8314], for example in regards to TLS ciphersuites, " +
			"recommendations from this document take precedence.' This precedence rule qualifies the " +
			"quoted MUST: RFC 9051's own TLS 1.2+/cipher-suite/hostname-check sub-duties (RFC9051-11.1-2 " +
			"through RFC9051-11.1-6) govern over any conflicting RFC 8314 recommendation, so compliance " +
			"with relevant recommendations from RFC 8314 is bounded by, and does not override, this " +
			"document's own text where the two diverge.",
	},
	{
		id: "RFC9051-11.1-2",
		source: "RFC9051",
		section: "11.1",
		title: "Clients MUST implement TLS 1.2 or newer",
		text: "Clients and servers MUST implement TLS 1.2 [TLS-1.2] or newer.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"New in RFC 9051 — RFC 3501 (2003) predates TLS 1.2 (2008) and had no minimum-version " +
			"requirement. This is a substantive strengthening over RFC 3501's §11.1, which only " +
			"mandated specific (now-obsolete) cipher suites without a protocol-version floor. Testable " +
			"by observing that the client can successfully negotiate TLS 1.2+ during STARTTLS/implicit " +
			"TLS and/or refuses to complete a handshake that downgrades below TLS 1.2.",
	},
	{
		id: "RFC9051-11.1-3",
		source: "RFC9051",
		section: "11.1",
		title: "Use of TLS 1.3 is RECOMMENDED for clients",
		text:
			"Use of TLS 1.3 [TLS-1.3] is RECOMMENDED. TLS 1.2 may be used only in " +
			"cases where the other party has not yet implemented TLS 1.3.",
		level: "SHOULD",
		applicability: "always",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"'RECOMMENDED' is the RFC 2119 keyword equivalent of SHOULD (RFC 2119 §1). New in RFC 9051 " +
			"(TLS 1.3 postdates RFC 3501). Testable by observing the client offers/negotiates TLS 1.3 " +
			"when the server supports it, falling back to 1.2 only when the server does not.",
	},
	{
		id: "RFC9051-11.1-4",
		source: "RFC9051",
		section: "11.1",
		title: "Client MUST implement TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 when using TLS 1.2",
		text:
			"Additionally, when using TLS 1.2, IMAP implementations MUST implement " +
			"the TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 cipher suite. This is " +
			"important as it ensures that any two compliant implementations can be " +
			"configured to interoperate.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"Conditional: binds only when the client uses TLS 1.2 (as opposed to TLS 1.3, which has its " +
			"own mandatory-to-implement suite set per [TLS-1.3] §9.1, referenced but not itemized here " +
			"since that pointer carries no independent RFC 9051 text). Replaces RFC 3501's obsolete " +
			"mandated suite (RFC3501-11.1-1, TLS_RSA_WITH_RC4_128_MD5) with a modern AEAD suite that " +
			"remains negotiable on current OpenSSL/Node stacks — unlike its RFC 3501 predecessor, this " +
			"entry is testable rather than environment-limited.",
	},
	{
		id: "RFC9051-11.1-5",
		source: "RFC9051",
		section: "11.1",
		title: "Other RFC 7525-recommended TLS 1.2 cipher suites are RECOMMENDED for clients",
		text:
			"Other TLS cipher suites recommended in " +
			"RFC 7525 [RFC7525] are RECOMMENDED: " +
			"TLS_DHE_RSA_WITH_AES_128_GCM_SHA256, " +
			"TLS_DHE_RSA_WITH_AES_256_GCM_SHA384, and " +
			"TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384. All other cipher suites are " +
			"OPTIONAL.",
		level: "SHOULD",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"'RECOMMENDED' is the RFC 2119 keyword equivalent of SHOULD. Conditional: applies only when " +
			"using TLS 1.2. Cross-reference: successor to RFC3501-11.1-2's SHOULD-implement clause, " +
			"but with an entirely different (modern, AEAD) cipher-suite list — TLS_DHE_DSS_WITH_3DES_EDE_CBC_SHA " +
			"is not carried forward. Unlike RFC3501-11.1-2, these suites remain negotiable on modern " +
			"OpenSSL/Node stacks and so are testable rather than environment-limited. Test-harness note: " +
			"two of the three listed suites (TLS_DHE_RSA_WITH_AES_128_GCM_SHA256, " +
			"TLS_DHE_RSA_WITH_AES_256_GCM_SHA384) are finite-field Diffie-Hellman (DHE) variants, which " +
			"require the test server to be configured with explicit DH parameters (e.g. a dhparam file/" +
			"tls.createSecureContext dhparam option) before OpenSSL will offer or negotiate them — unlike " +
			"the ECDHE suites elsewhere in this module, which use a built-in curve and need no equivalent " +
			"setup. A harness testing these two suites specifically must supply DH parameters or the " +
			"negotiation will fail for reasons unrelated to client compliance.",
	},
	{
		id: "RFC9051-11.1-6",
		source: "RFC9051",
		section: "11.1",
		title: "Client MUST verify server hostname against server certificate during TLS negotiation",
		text:
			"During the TLS negotiation [TLS-1.3] [TLS-1.2], the client MUST check " +
			"its understanding of the server hostname against the server's " +
			"identity as presented in the server Certificate message, in order to " +
			"prevent on-path attackers attempting to masquerade as the server. " +
			"This procedure is described in [RFC7817].",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"Conditional: binds only during TLS negotiation (STARTTLS or Implicit TLS port). " +
			"Cross-reference: equivalent duty to RFC3501-11.1-3, but RFC 9051 removes the inline " +
			"failure-handling guidance (RFC 3501's 'the client SHOULD either ask for explicit user " +
			"confirmation, or terminate the connection...') and instead delegates the entire matching " +
			"procedure — including case-insensitivity, wildcard handling, subjectAltName precedence, " +
			"multiple-name acceptance, hostname provenance (RFC3501-11.1-5/6/7/9's RFC 3501 " +
			"counterparts), and mismatch handling — to [RFC7817] by reference ('This procedure is " +
			"described in [RFC7817]'). [RFC7817] is an external document, not RFC 9051 text, so its " +
			"content is out of scope for this extraction; only the MUST-check sentence quoted above is " +
			"RFC 9051's own normative text. Also reworded the threat model from RFC 3501's generic " +
			"'man-in-the-middle attacks' to 'on-path attackers attempting to masquerade as the server' " +
			"(RFC 9051 uses the more precise, currently-preferred IETF terminology).",
	},
	{
		id: "RFC9051-11.1-7",
		source: "RFC9051",
		section: "11.1",
		title: "Client MUST check result of STARTTLS command and TLS negotiation for acceptable security",
		text:
			"Both the client and server MUST check the result of the STARTTLS " +
			"command and subsequent TLS [TLS-1.3] [TLS-1.2] negotiation to see " +
			"whether acceptable authentication and/or privacy was achieved.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"Conditional: applies only when STARTTLS (or Implicit TLS) is used. Testable by observing " +
			"whether the client aborts the session when TLS negotiation fails to achieve the expected " +
			"security level. Cross-reference: equivalent to RFC3501-11.1-8; RFC 9051 changes 'whether " +
			"acceptable authentication or privacy was achieved' (RFC 3501) to 'whether acceptable " +
			"authentication and/or privacy was achieved' (RFC 9051) — a minor wording clarification, " +
			"not a substantive change.",
	},

	// ── §11.2 STARTTLS Command versus Use of Implicit TLS Port ───────────────

	{
		id: "RFC9051-11.2-1",
		source: "RFC9051",
		section: "11.2",
		title: "Client MUST implement both Implicit TLS and STARTTLS negotiation",
		text:
			"For maximum backward compatibility, the client MUST implement both " +
			"TLS negotiation on an Implicit TLS port and TLS negotiation using the " +
			"STARTTLS command on a cleartext port.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"No RFC 3501 counterpart — RFC 3501 §11.1 only covered the STARTTLS command; the Implicit " +
			"TLS port (port 993 usage standardized) was formalized later by RFC 8314 and folded into " +
			"RFC 9051. Testability flip (mandated by audit under taxonomy rule 2): unlike the generic " +
			"capability-inventory duties in the untestability-themes taxonomy (which quantify over an " +
			"open-ended or unobservable affordance set), this duty quantifies over a CLOSED two-element " +
			"set (Implicit TLS, STARTTLS) and the client exposes a public knob selecting between them: " +
			"the TLSSetting enum (src/connection/types.ts), whose 'DEFAULT'/'on' value negotiates " +
			"Implicit TLS and whose 'STARTTLS' value negotiates STARTTLS on a cleartext port. A " +
			"two-session test pair — one connection configured for Implicit TLS, one configured for " +
			"STARTTLS, both observed to complete a successful TLS handshake — jointly establishes that " +
			"both code paths are implemented, closing the inventory gap the untestable rationale " +
			"previously relied on.",
	},
	{
		id: "RFC9051-11.2-2",
		source: "RFC9051",
		section: "11.2",
		title: "Clients SHOULD try both port 993 and port 143 (and both IPv4/IPv6) concurrently by default",
		text:
			"For this reason, IMAP4rev2 clients SHOULD try both ports 993 and 143 (and " +
			"both IPv4 and IPv6) concurrently by default, unless overridden by " +
			"either user configuration or DNS SRV records [RFC6186].",
		level: "SHOULD",
		applicability: "always",
		profiles: ["rev2"],
		testability: "untestable",
		untestableTheme: "user-intent-policy",
		untestableRationale:
			"This client is a headless protocol library, not an end-user mail application: every " +
			"connection it makes is initiated with a host/port explicitly supplied by the consuming " +
			"application's configuration (there is no 'no configuration provided' state in which the " +
			"library autonomously decides which port(s) to dial). The duty's own text carries an escape " +
			"hatch — 'unless overridden by ... user configuration' — and for a library-shaped client " +
			"that escape hatch is unconditionally in effect on every connection: the port is always " +
			"user-supplied, so the SHOULD to concurrently race ports 'by default' never actually " +
			"applies. Whether a given connection reflects 'the user configured a specific port' versus " +
			"'the client defaulted and should have raced' is a question about user intent invisible on " +
			"the wire (and invisible in the API call) — indistinguishable from any other user-intent-" +
			"policy duty in the taxonomy. No pass/fail boundary exists: a client that always uses the " +
			"configured port is compliant precisely because the escape hatch always applies.",
		notes:
			"No RFC 3501 counterpart — dual-port racing guidance is new in RFC 9051, following the " +
			"Implicit TLS port's standardization.",
	},

	// ── §11.3 Client Handling of Unsolicited/Premature Responses ─────────────

	{
		id: "RFC9051-11.3-1",
		source: "RFC9051",
		section: "11.3",
		title: "Before authentication, clients SHOULD ignore responses other than CAPABILITY and status responses",
		text:
			"Before authentication, clients SHOULD ignore any " +
			"responses other than CAPABILITY and server status responses " +
			"(Section 7.1), as well as any response codes other than " +
			"CAPABILITY.",
		level: "SHOULD",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"Conditional: applies only in the Not Authenticated state, before STARTTLS/AUTHENTICATE " +
			"commands are issued. No RFC 3501 counterpart — RFC 3501 had no §11.3-equivalent discussion " +
			"of pre-authentication response injection; this guidance is new in RFC 9051, addressing a " +
			"security concern (TLS-stripping / cleartext response injection) not covered in RFC 3501. " +
			"Testable: script a pre-authentication server that sends a disallowed unsolicited response " +
			"(e.g. a LIST or FETCH response) before login and verify the client does not act on it " +
			"(e.g. does not surface mailbox data derived from it).",
	},
	{
		id: "RFC9051-11.3-2",
		source: "RFC9051",
		section: "11.3",
		title: "Clients SHOULD ignore the ALERT response code until TLS/SASL confidentiality is negotiated",
		text:
			"Clients SHOULD " +
			"ignore the ALERT response code until after TLS (whether using " +
			"STARTTLS or TLS negotiation on an Implicit TLS port) or a SASL " +
			"security layer with confidentiality protection has been " +
			"successfully negotiated.",
		level: "SHOULD",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"Conditional: applies only before TLS/SASL-confidentiality has been negotiated. No RFC 3501 " +
			"counterpart — RFC 3501 had no ALERT pre-authentication/pre-TLS suppression guidance " +
			"(RFC3501-7.1-1's ALERT-presentation duty is unconditional). This is new security guidance " +
			"in RFC 9051, cross-referenced by Appendix E item 26 ('Added warnings about use of ALERT " +
			"response codes and PREAUTH response'). Testable: script a pre-TLS/pre-authentication " +
			"server that sends an ALERT response code and verify the client does not present it to the " +
			"user via its notification channel (logger/events) at that point in the session, in " +
			"contrast to a post-TLS ALERT which RFC9051's cross-referenced §7.1 ALERT-presentation duty " +
			"(out of this module's scope) requires surfacing. Cross-reference (bidirectional): this " +
			"duty near-duplicates RFC9051-7.1-1 in s7-responses-a.ts, which states the same " +
			"SHOULD-ignore-unprotected-ALERT guidance from the §7.1 ALERT response-code definition " +
			"angle; see that entry's notes for the reciprocal cross-reference back to this one and for " +
			"the absence-assertion/vacuous-pass-pairing caveat that applies equally here.",
	},
	{
		id: "RFC9051-11.3-3",
		source: "RFC9051",
		section: "11.3",
		title: "Outside selected state, clients MUST ignore responses/response codes related to message and mailbox status",
		text:
			"Unless explicitly allowed by an IMAP " +
			"extension, when not in selected state, clients MUST ignore " +
			"responses / response codes related to message and mailbox status " +
			"such as FLAGS, EXIST, EXPUNGE, and FETCH.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"Conditional: applies whenever the client is not in the Selected state (Not Authenticated or " +
			"Authenticated state) and no enabled extension explicitly permits such responses. No RFC " +
			"3501 counterpart — new hardening guidance in RFC 9051 against injected/spoofed mailbox-" +
			"status responses outside their valid state. Testable: script a server that sends a FLAGS, " +
			"EXISTS, EXPUNGE, or FETCH response while the client is in Authenticated (not Selected) " +
			"state and verify the client does not treat it as valid mailbox state (e.g. does not update " +
			"an internal message count or emit it as a meaningful event).",
	},

	// ── Appendix E: Changes from RFC 3501 / IMAP4rev1 ─────────────────────────
	// No entries: reviewed in full (see extractionNote). Appendix E is a purely
	// descriptive changelog; every bullet either states a non-normative summary
	// or points to a normative sentence that lives in the body section defining
	// it (out of this module's §9/§10/§11 scope), so it contributes no
	// independent client-binding requirement text of its own.
];
