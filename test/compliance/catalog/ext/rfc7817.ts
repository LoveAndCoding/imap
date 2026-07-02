import type { CatalogModule } from "../types";

const rfc7817: CatalogModule = {
	source: "RFC7817",
	extractionNote:
		"§1 (Introduction): scoping/motivation prose only, no RFC 2119 keywords — reviewed, no " +
		"client-binding requirements. §2 (Conventions): defines the reference-identifier/CN-ID/" +
		"DNS-ID/SRV-ID/URI-ID terminology used by §3 but contains no independent normative text " +
		"itself — terms are consumed inline by the §3 entries below rather than catalogued " +
		"separately. §3 (Email Server Certificate Verification Rules): fully extracted — this is " +
		"the document's sole client-binding normative section (entries RFC7817-3-1 through " +
		"RFC7817-3-7). §4 and §4.1 (Compliance Checklist for Certification Authorities / Notes on " +
		"Delegated Email Services): bind CAs ('CAs MUST support issuance...'), not the IMAP " +
		"client — skipped per scope. §5 and §5.1 (Compliance Checklist for Mail Service Providers " +
		"and CSR Generation Tools / Notes on Hosting Multiple Domains): bind Mail Service " +
		"Providers and CSR tooling ('MUST include the DNS-ID identifier type in Certificate " +
		"Signing Requests...'), server/operator-side — skipped per scope. §6 (Examples): " +
		"informative worked examples of certificate content, no client duties — reviewed, no " +
		"client-binding requirements. §7 (Operational Considerations): a pointer back to §5/§5.1, " +
		"no independent normative text — reviewed, no client-binding requirements. §8 (Security " +
		"Considerations): informative discussion of why reference identifiers must derive from " +
		"trustworthy hostnames; contains no RFC 2119 keyword directed at the client (the " +
		"trustworthy-source guidance is already covered by RFC3501-11.1-5/-6's MUST/MUST NOT on " +
		"hostname provenance) — reviewed, no additional client-binding requirements. §9 " +
		"(References): bibliographic, skipped. Appendix A (Changes to RFCs 2595, 3207, 3501, and " +
		"5804): the RFC 3501 replacement paragraph is a pointer back to this document's own §3 " +
		"('the IMAP client checks its understanding of the server identity ... as specified in " +
		"Section 3 of [RFC7817]') and introduces no new normative text beyond §3 — extracted as " +
		"RFC7817-A-1 to record the supersession of RFC3501-11.1-3's original wording, since it is " +
		"IMAP-specific and load-bearing for the RFC3501/RFC9525 cross-reference; the RFC 2595, " +
		"3207, and 5804 replacement paragraphs bind non-IMAP protocols (POP3/ACAP, SMTP " +
		"Submission, ManageSieve) and are out of scope for this IMAP catalog. Acknowledgements " +
		"and Author's Address: administrative, skipped. " +
		"Cross-reference summary: RFC 7817 §3 and RFC 9525 (RFC 6125's successor) jointly define " +
		"the client's TLS identity-verification duty. RFC 7817 supplies the email-specific " +
		"reference-identifier construction (which domain names/service types feed the check) and " +
		"defers the actual matching algorithm and match/no-match handling to RFC 6125 §6, which " +
		"this catalog tracks via its RFC 9525 successor (RFC9525-6.6-1, the mismatch/termination " +
		"duty). RFC3501-11.1-3 (MUST check hostname against certificate identity) is the original " +
		"IMAP-specific statement of the same outcome duty that RFC7817-3-1 restates and — per " +
		"Appendix A — textually supersedes; RFC3501-11.1-9 (case-insensitive/wildcard/multiple-" +
		"names matching) overlaps with RFC7817-3-6's wildcard rule. Where a duty is the same " +
		"across documents, the RFC 3501/RFC 9525 entry is treated as primary (it is what the " +
		"compliance harness already exercises against the live client) and the RFC 7817 entry is " +
		"catalogued as the input-construction/refinement layer feeding that same check, with an " +
		"explicit note on which entry is primary.",
	requirements: [
		// ── §3 Email Server Certificate Verification Rules ──────────────────────
		{
			id: "RFC7817-3-1",
			source: "RFC7817",
			section: "3",
			title: "Client MUST check server identity against reference identifiers during TLS",
			text:
				"During a TLS negotiation, an email client (i.e., an SMTP, IMAP, POP3, or " +
				"ManageSieve client) MUST check its understanding of the server identity " +
				"(client's reference identifiers) against the server's identity as presented in " +
				"the server Certificate message in order to prevent man-in-the-middle attacks.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Conditional: binds only when TLS is in use (direct TLS or post-STARTTLS). " +
				"Primary/duplicate: this restates the outcome duty already catalogued as " +
				"RFC3501-11.1-3 ('the client MUST check its understanding of the server hostname " +
				"against the server's identity as presented in the server Certificate message') " +
				"and, per this document's own Appendix A, textually supersedes that paragraph's " +
				"wording for IMAP. RFC3501-11.1-3 is treated as primary for compliance testing " +
				"(it is what the harness exercises against connection outcomes); this entry is " +
				"catalogued for completeness and because it broadens the duty's scope statement " +
				"('reference identifiers', plural, defined in §2) rather than the single-hostname " +
				"framing RFC 3501 used. Tested the same way as RFC3501-11.1-3: a certificate " +
				"whose presented identity does not match the reference identifiers must cause the " +
				"connection to fail or be flagged, not silently succeed.",
		},
		{
			id: "RFC7817-3-2",
			source: "RFC7817",
			section: "3",
			title: "Identity check performed only after certification path validation",
			text:
				"This check is only performed after the server certificate passes certification " +
				"path validation as described in Section 6 of [RFC5280].",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"This sentence carries no RFC 2119 keyword (it is descriptive: 'is only " +
				"performed'), and it constrains the internal ordering of two verification steps " +
				"(chain validation, then identity matching) inside the TLS/certificate stack. A " +
				"black-box harness observes only the final accept/reject outcome of the " +
				"connection attempt, not the sequence in which the underlying TLS library " +
				"evaluated chain validity versus hostname identity — both a compliant and a " +
				"non-compliant ordering can converge on the same wire-visible pass/fail. This is " +
				"further downstream of the client's own code, since Node's TLS/OpenSSL stack " +
				"performs path validation, not the IMAP client library itself.",
		},
		{
			id: "RFC7817-3-3",
			source: "RFC7817",
			section: "3",
			title: "Matching performed per RFC 6125 §6 rules (order, pinning, failure procedure)",
			text:
				"Matching is performed according to the rules specified in Section 6 of " +
				"[RFC6125], including the relative order of matching of different identifier " +
				"types, \"certificate pinning\", and the procedure on failure to match.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"This is a pointer/incorporation-by-reference sentence delegating the algorithmic " +
				"details (identifier-type precedence order, optional certificate-pinning " +
				"override, and the exact match-failure procedure) to RFC 6125 §6. The " +
				"match-failure outcome itself is separately catalogued and testable as " +
				"RFC9525-6.6-1 (connection must fail on mismatch). The internal precedence order " +
				"in which a client tries DNS-ID vs. CN-ID vs. SRV-ID candidates before landing on " +
				"a match/no-match verdict is not independently observable on the wire — only the " +
				"final verdict is, and that verdict is what RFC9525-6.6-1 tests. 'Certificate " +
				"pinning' is an optional client-local override mechanism (RFC 6125 §6.1) whose " +
				"presence or absence cannot be established by a black-box protocol exchange.",
			notes:
				"Cross-reference: the failure-procedure clause is realized in this catalog by " +
				"RFC9525-6.6-1 (RFC 9525 is RFC 6125's successor); that entry is primary for the " +
				"observable failure behavior.",
		},
		{
			id: "RFC7817-3-4",
			source: "RFC7817",
			section: "3",
			title: "Reference identifiers for DNS-ID/CN-ID: email domain and/or connection hostname",
			text:
				"For DNS-ID and CN-ID identifier types, the client MUST use one or more of the " +
				"following as \"reference identifiers\": (a) the domain portion of the user's " +
				"email address, (b) the hostname it used to open the connection (without CNAME " +
				"canonicalization). The client MAY also use (c) a value securely derived from " +
				"(a) or (b), such as using \"secure\" DNSSEC [RFC4033] [RFC4034] [RFC4035] " +
				"validated lookup.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"This constrains which internal value(s) the client selects as candidate " +
				"reference identifiers before comparison, not the comparison outcome itself. A " +
				"harness can only observe the connect hostname it supplied and the final " +
				"accept/reject verdict on a given certificate; it cannot distinguish a client " +
				"that internally used 'the hostname it used to open the connection' as its sole " +
				"reference identifier from one that also (compliantly, per the MAY) derived and " +
				"used a DNSSEC-validated value, when both converge on the same match/no-match " +
				"result against a given certificate. This client is a headless library that " +
				"receives a caller-supplied host option (see RFC3501-11.1-5/-6, which cover the " +
				"MUST/MUST NOT half of hostname provenance already) and has no email-address-" +
				"domain input at the protocol layer to begin with, so option (a) does not apply " +
				"to this client's architecture; option (c) is a MAY and is vacuous for testing " +
				"regardless.",
			notes:
				"Cross-reference: RFC3501-11.1-5 (MUST use original hostname, not insecure DNS, " +
				"for certificate comparison) and RFC3501-11.1-6 (MUST NOT use hostname from an " +
				"insecure remote source) already catalogue the MUST/MUST NOT provenance half of " +
				"this same 'which hostname feeds the check' duty for the connection-hostname " +
				"reference identifier (b); those entries are primary. This entry additionally " +
				"records the email-address-domain reference identifier (a), which has no " +
				"counterpart in RFC 3501 §11.1 and no analog in this client's option surface " +
				"(the client is not itself an MUA and is not given an email address to derive a " +
				"domain from).",
		},
		{
			id: "RFC7817-3-5",
			source: "RFC7817",
			section: "3",
			title: "SRV-ID reference identifier required when using RFC 6186 service discovery",
			text:
				"When using email service discovery procedure specified in [RFC6186], the " +
				"client MUST also use the domain portion of the user's email address as another " +
				"\"reference identifier\" to compare against an SRV-ID identifier in the server " +
				"certificate.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "capability-inventory",
			untestableRationale:
				"This duty is conditional on the client implementing RFC 6186 DNS SRV/TXT-based " +
				"email service autoconfiguration, a discovery mechanism this IMAP client library " +
				"does not implement — it is given a host/port directly by its caller and performs " +
				"no SRV lookup. A duty conditioned on possessing an unimplemented optional " +
				"capability cannot be exercised; there is no reference-identifier-construction " +
				"behavior to observe because the triggering precondition (RFC 6186 discovery) " +
				"never occurs. Vacuously satisfied by non-implementation of RFC 6186, and there " +
				"is no black-box test that distinguishes 'doesn't implement RFC 6186' from 'has a " +
				"latent bug in SRV-ID reference-identifier construction' since neither path " +
				"exists on the wire.",
		},
		{
			id: "RFC7817-3-6",
			source: "RFC7817",
			section: "3",
			title: "Supplemental identifier-type rules: DNS-ID required, SRV-ID conditional, URI-ID forbidden, CN-ID permitted, wildcard MAY",
			text:
				"The rules and guidelines defined in [RFC6125] apply to an email server " +
				"certificate with the following supplemental rules: 1. Support for the DNS-ID " +
				"identifier type (subjectAltName of dNSName type [RFC5280]) is REQUIRED in email " +
				"client software implementations. 2. Support for the SRV-ID identifier type " +
				"(subjectAltName of SRVName type [RFC4985]) is REQUIRED for email client " +
				"software implementations that support [RFC6186]. ... 3. A URI-ID identifier " +
				"type (subjectAltName of uniformResourceIdentifier type [RFC5280]) MUST NOT be " +
				"used by clients for server verification, as URI-IDs were not historically used " +
				"for email. 4. For backward compatibility with deployed software, a CN-ID " +
				"identifier type (CN attribute from the subject name, see [RFC6125]) MAY be used " +
				"for server identity verification. 5. Email protocols allow use of certain " +
				"wildcards in identifiers presented by email servers. The \"*\" wildcard " +
				"character MAY be used as the left-most name component of a DNS-ID or CN-ID in " +
				"the certificate. ... Note that the wildcard character MUST NOT be used as a " +
				"fragment of the left-most name component (e.g., \"*oo.example.com\", " +
				"\"f*o.example.com\", or \"foo*.example.com\").",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Composite entry consolidating the five supplemental identifier-type rules of " +
				"§3, mirroring the consolidation style of RFC3501-11.1-9. Level recorded as MUST " +
				"NOT (rule 3, URI-ID prohibition, and the wildcard-fragment prohibition in rule " +
				"5) as the strongest keyword; rules 1-2 are REQUIRED-level support mandates " +
				"(equivalent to MUST per RFC 2119) and rule 4-5's affirmative wildcard grant is " +
				"MAY-level. Elisions ('...') cover the SRV-ID-types-per-RFC6186-and-ManageSieve-" +
				"sieve-name clause of rule 2 (an operational detail, not an independent " +
				"normative clause) and the worked wildcard-matching example in rule 5 ('a DNS-ID " +
				"of \"*.example.com\" would match \"a.example.com\"...'), matching the elision " +
				"already made for the same example sentence in RFC3501-11.1-9. " +
				"Cross-reference: the wildcard-permission clause (rule 5, first two sentences) " +
				"duplicates RFC3501-11.1-9's wildcard MAY verbatim in substance; RFC3501-11.1-9 " +
				"is primary since it is the entry the harness's SAN-matching tests already " +
				"exercise. The new material here beyond RFC3501-11.1-9 is: DNS-ID support is " +
				"REQUIRED (a client capability-possession duty, not previously catalogued for " +
				"IMAP since RFC 3501 predates RFC 6125's DNS-ID terminology), SRV-ID support is " +
				"conditionally REQUIRED, URI-ID use is prohibited, CN-ID use is permitted for " +
				"backward compatibility, and — new and independently testable — the wildcard " +
				"character MUST NOT appear as a fragment of the left-most label (only whole-label " +
				"left-most wildcards are permitted). Tested as: a certificate presenting a " +
				"partial-label wildcard SAN (e.g. 'f*o.example.test') MUST NOT be accepted as a " +
				"match for a hostname it would only fuzzily resemble; this sub-clause has no " +
				"RFC3501-11.1-9 counterpart (that entry only recorded the whole-label wildcard " +
				"MAY) and is the reason this entry is not marked as a pure duplicate.",
		},
		{
			id: "RFC7817-3-7",
			source: "RFC7817",
			section: "3",
			title: "URI-ID identifier type MUST NOT be used for server verification",
			text:
				"A URI-ID identifier type (subjectAltName of uniformResourceIdentifier type " +
				"[RFC5280]) MUST NOT be used by clients for server verification, as URI-IDs were " +
				"not historically used for email.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Broken out from the RFC7817-3-6 composite as its own entry because it is an " +
				"independently testable, self-contained prohibition (unlike rules 1/2's " +
				"capability-possession framing): a certificate whose only subjectAltName is a " +
				"uniformResourceIdentifier entry matching the connection target MUST NOT be " +
				"accepted as a name match by a conforming client. No RFC 3501/RFC 9525 " +
				"counterpart exists — URI-ID is new terminology from RFC 6125 with no prior IMAP " +
				"treatment, so this entry has no primary/duplicate elsewhere in the catalog.",
		},
		// ── Appendix A: Changes to RFC 3501 §11.1 ────────────────────────────────
		{
			id: "RFC7817-A-1",
			source: "RFC7817",
			section: "A",
			title: "RFC 3501 §11.1 hostname-check paragraph is replaced by a pointer to RFC 7817 §3",
			text:
				"The 3rd paragraph (and its subparagraphs) in Section 11.1 of RFC 3501 is " +
				"replaced with the following text: During the TLS negotiation, the IMAP client " +
				"checks its understanding of the server identity against the provided server's " +
				"identity as specified in Section 3 of [RFC7817].",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"This is the IMAP-specific supersession statement: RFC 7817 formally replaces RFC " +
				"3501 §11.1's 3rd paragraph (which included the original text catalogued as " +
				"RFC3501-11.1-3 through RFC3501-11.1-9) with a one-sentence pointer to this " +
				"document's own §3. The replacement text carries no new normative keyword beyond " +
				"restating the §3 MUST already catalogued as RFC7817-3-1; it is extracted " +
				"separately here (rather than folded into RFC7817-3-1) because it is the specific " +
				"textual link establishing that RFC 7817 §3 — not RFC 3501 §11.1's original " +
				"prose — is the currently-in-force IMAP client identity-check text. " +
				"Primary/duplicate: RFC3501-11.1-3 remains the catalogued, harness-tested entry " +
				"for the underlying check-hostname-against-certificate duty; this entry is a " +
				"provenance/supersession record, not an independent behavioral test. Testable in " +
				"the same manner and by the same test as RFC7817-3-1/RFC3501-11.1-3 (mismatch " +
				"causes rejection), since it asserts the identical outcome duty.",
		},
	],
};

export default rfc7817;
