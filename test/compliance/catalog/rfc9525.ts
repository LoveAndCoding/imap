import type { CatalogModule } from "./types";

const rfc9525: CatalogModule = {
	source: "RFC9525",
	extractionNote:
		"Full extraction of RFC 9525 client-binding requirements (the client acting as the " +
		"verifier of a server's presented identity). RFC9525-6.6-1 is the Phase 0 seed entry " +
		"and is retained byte-identical; all other entries below are new. " +
		"§1 (Introduction/Motivation/Applicability/Scope/Terminology): reviewed, purely " +
		"definitional/scoping — no independently testable client MUST/SHOULD beyond what §6/§7 " +
		"already encode; the 'client MUST verify' framing in §1.1 is realized by the §6 " +
		"procedure entries below rather than duplicated here. §2 (Identifying Application " +
		"Services): reviewed — definitional; its one MUST NOT ('Common Name RDN MUST NOT be " +
		"used to identify a service ... other RDNs within the subjectName MUST NOT be used') " +
		"binds certificate *construction*/issuance, which this extraction skips per scope (see " +
		"below), though the client-side consequence (never falling back to CN-ID matching) is " +
		"the implicit complement of the DNS-ID-only construction rule captured in RFC9525-6.1.1-3. " +
		"§3 (Designing Application Protocols): SKIPPED — every normative sentence binds " +
		"'a specification'/'the technology', i.e., protocol designers authoring a normative " +
		"reference to this RFC, not the IMAP client implementation itself. §4 (Representing " +
		"Server Identity) and §5 (Requesting Server Certificates): SKIPPED — issuer/CA and " +
		"service-provider (CSR) side, explicitly out of scope per the task ('Skip CA/issuer-side " +
		"and server-cert-construction text'). §6 (Verifying Service Identity): FULLY extracted " +
		"— §6.1.1 (reference-identifier construction rules), §6.2 (preparing to seek a match, " +
		"component splitting), §6.3 (DNS domain name matching incl. wildcard sub-rule), §6.4 (IP " +
		"address matching), §6.5 (application service type matching), §6.6 (outcome; -1 is the " +
		"retained seed, -2 through -6 are new). §6.1.2 and §6.2's introductory sentence are " +
		"illustrative examples/informative framing with no independent normative content beyond " +
		"what's captured. §7 (Security Considerations): §7.1 (Wildcard Certificates) reviewed — " +
		"purely descriptive risk rationale and administrator/protocol-designer advisories " +
		"('administrators and software developers are advised...', 'application protocols can " +
		"disallow...'); it cross-references the §6.3 wildcard rule already captured " +
		"(RFC9525-6.3-3/-4/-5) but adds no new client MUST/SHOULD/MAY of its own. §7.2 (URI-ID) " +
		"extracted as RFC9525-7.2-1 (validity/ignore rule for URI-ID matching). §7.3 " +
		"(Internationalized Domain Names): reviewed — restates that matching is A-label-only " +
		"(already RFC9525-6.3-2) and disclaims visual-presentation/UI concerns as out of scope; " +
		"no new normative keyword. §7.4 (IP Addresses): reviewed — descriptive risk discussion " +
		"(SNI conveys no IP-ID, textual-IPv4-as-FQDN misclassification risk); no RFC 2119 keyword " +
		"directed at the client. §7.5 (Multiple Presented Identifiers): reviewed — descriptive " +
		"risk discussion of shared-certificate blast radius; the one SHOULD ('to ensure that all " +
		"servers in the set have a strong minimum configuration') binds the deploying " +
		"administrator, not the connecting client. §7.6 (Multiple Reference Identifiers) " +
		"extracted as RFC9525-7.6-1 (client SHOULD take care that CAs are appropriately " +
		"constrained). §7.7 (Certificate Trust): reviewed — descriptive scoping statement " +
		"('this document assumes...'); the one 'responsibility of the application protocol or " +
		"the client' sentence assigns responsibility for a category of check (block-list " +
		"screening) without imposing a MUST/SHOULD of its own. §8 (IANA Considerations): no " +
		"actions, no client-binding text. Appendix A (Changes from RFC 6125): purely editorial " +
		"changelog, no normative text.",
	requirements: [
		{
			id: "RFC9525-6.6-1",
			source: "RFC9525",
			section: "6.6",
			title: "Client rejects certificates that fail identity verification",
			text:
				"If the client does not find a presented identifier matching any of the reference identifiers, then the client MUST proceed as follows. If the client is an automated application, then it SHOULD terminate the communication attempt with a bad certificate error and log the error appropriately. The application MAY provide a configuration setting to disable this behavior, but it MUST NOT disable this security control by default.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Composite requirement: on identity mismatch an automated client SHOULD " +
				"terminate with a bad certificate error, and MUST NOT disable that " +
				"security control by default. Tested as: with default options, a " +
				"certificate whose presented identifiers do not match the reference " +
				"identifiers causes connection failure. Applicability is conditional: " +
				"this requirement applies only when TLS is in use. The client supports " +
				"plaintext connections (no TLS), so certificate identity verification " +
				"binds only when the caller opts into a TLS-secured connection.",
		},

		// ── §6.1.1 Constructing a List of Reference Identifiers — Rules ─────────

		{
			id: "RFC9525-6.1.1-1",
			source: "RFC9525",
			section: "6.1.1",
			title: "Client MUST construct reference identifiers independently of presented identifiers",
			text:
				"The client MUST construct a list of acceptable reference identifiers " +
				"and MUST do so independently of the identifiers presented by the server.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"Whether the client's reference-identifier list was derived solely from its own " +
				"configured hostname input, or was contaminated by data read from the server's " +
				"certificate, is an internal construction-order property. A compliant and a " +
				"non-compliant implementation produce identical wire traces: both connect to the " +
				"same address and both either accept or reject the same certificate whenever the " +
				"server's presented identifier happens to equal the client's configured hostname " +
				"(the only case this harness's loopback fixtures can arrange). The harness cannot " +
				"induce the client to derive a reference identifier from the certificate without " +
				"already knowing the certificate's content, at which point independence versus " +
				"coincidence become indistinguishable from outside. Observable downstream " +
				"consequences of a wrong reference identifier (mismatched-cert rejection or " +
				"wildcard matching) are separately catalogued as testable.",
			notes:
				"Conditional: this requirement applies only when TLS is in use and the client " +
				"performs certificate identity verification. The client supports plaintext " +
				"connections, so this construction step binds only when the caller opts into a " +
				"TLS-secured connection.",
		},
		{
			id: "RFC9525-6.1.1-2",
			source: "RFC9525",
			section: "6.1.1",
			title: "Client MUST NOT treat intermediate resolution values as reference identifiers",
			text:
				"Unless an application defines a process for authenticating intermediate identifiers in a way that then allows them to be used as a reference identifier (for example, see [SMTP-TLS]), any intermediate values are not reference identifiers and MUST NOT be treated as such.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"This client connects by a hostname/address supplied directly by the caller and " +
				"performs no protocol-internal indirection (e.g., DNS SRV or NAPTR-driven " +
				"redirection to a different target host) whose intermediate names could tempt an " +
				"implementation into misuse as a reference identifier. There is no such indirection " +
				"step to arm in the harness, so a compliant and a non-compliant implementation are " +
				"wire-indistinguishable here: neither ever produces an intermediate identifier to " +
				"begin with.",
			notes:
				"Conditional: applies only when TLS certificate identity verification is in use. " +
				"The example citation '[SMTP-TLS]' is retained verbatim as part of the sentence's " +
				"parenthetical; it refers to RFC 8689 (SMTP Require TLS Option) as an example of a " +
				"protocol that does define such an authentication process.",
		},
		{
			id: "RFC9525-6.1.1-3",
			source: "RFC9525",
			section: "6.1.1",
			title: "Client MUST construct reference identifiers per the URI-ID/SRV-ID/IP-ID/DNS-ID priority rules",
			text:
				"Using the combination of one or more FQDNs or IP addresses, plus optionally an application service type, the client MUST construct its list of reference identifiers in accordance with the following rules: * If a server for the application service type is typically associated with a URI for security purposes (i.e., a formal protocol document specifies the use of URIs in server certificates), the reference identifier SHOULD be a URI-ID. * If a server for the application service type is typically discovered by means of DNS SRV records, the reference identifier SHOULD be an SRV-ID. * If the reference identifier is an IP address, the reference identifier is an IP-ID. * In the absence of more specific identifiers, the reference identifier is a DNS-ID. A reference identifier of type DNS-ID can be directly constructed from an FQDN that is (a) contained in or securely derived from the inputs or (b) explicitly associated with the source domain by means of user configuration.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"This is a priority-ordered decision procedure for choosing *which identifier type* " +
				"to construct, not a wire-observable outcome. IMAP has no formal-protocol-document " +
				"mandate for URI-IDs, and this client does not resolve DNS SRV records, so both the " +
				"URI-ID and SRV-ID branches are permanently inapplicable for this implementation " +
				"and the DNS-ID (default/fallback) branch is the only one ever reachable — meaning " +
				"the 'priority' aspect of the rule has no observable branch point here. What remains " +
				"observable — that the client in fact compares the server certificate against the " +
				"caller-supplied hostname as a DNS-ID — is the separately catalogued and testable " +
				"outcome of RFC9525-6.3-1/-2 and RFC9525-6.6-1/-2.",
			notes:
				"Conditional: applies only when TLS certificate identity verification is in use. " +
				"Highest keyword is MUST (the overall construction obligation); the two inner " +
				"clauses use SHOULD (URI-ID, SRV-ID priority) and are retained verbatim as part of " +
				"the same enumerated rule rather than split into separate entries, since they " +
				"jointly define one ordered construction procedure and this client's DNS-ID-only " +
				"behavior does not independently exercise the SHOULD branches. Judgment note: " +
				"'the reference identifier is an IP-ID' / 'the reference identifier is a DNS-ID' in " +
				"the third and fourth bullets carry no RFC 2119 keyword (imperative present tense, " +
				"not 'MUST be'); they are retained verbatim as they complete the same enumerated " +
				"rule set introduced by the lead-in MUST.",
		},

		// ── §6.2 Preparing to Seek a Match ───────────────────────────────────────

		{
			id: "RFC9525-6.2-1",
			source: "RFC9525",
			section: "6.2",
			title: "Client SHOULD stop searching once a presented identifier matches",
			text:
				"The search fails if the client exhausts its list of reference identifiers without finding a match. The search succeeds if any presented identifier matches one of the reference identifiers, at which point the client SHOULD stop the search.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"Whether the client's matching loop terminates early on the first match or " +
				"continues scanning the remainder of its (single-element, for this client) " +
				"reference-identifier list is an internal loop-control detail with no wire " +
				"signature: the connection outcome (accept the certificate) is identical either " +
				"way, since finishing an exhausted scan of an already-matched list changes nothing " +
				"observable.",
			notes:
				"Conditional: applies only during TLS certificate identity verification. This " +
				"client constructs a single DNS-ID reference identifier per RFC9525-6.1.1-3's " +
				"default branch, so the 'search' in practice compares against that one identifier; " +
				"the early-stop SHOULD has no externally observable effect for a single-element " +
				"list, reinforcing the untestability finding.",
		},
		{
			id: "RFC9525-6.2-2",
			source: "RFC9525",
			section: "6.2",
			title: "DNS-ID reference identifier MUST be used directly as the DNS domain name",
			text: "A DNS-ID reference identifier MUST be used directly as the DNS domain name, and there is no application service type.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Conditional: applies only during TLS certificate identity verification when the " +
				"reference identifier is a DNS-ID (the only reference-identifier type this client " +
				"constructs, per RFC9525-6.1.1-3). Testable jointly with RFC9525-6.3-1: connect " +
				"with a caller-supplied hostname and verify the client compares that exact hostname " +
				"(not a derived or truncated form) against the certificate's DNS-ID entries.",
		},
		{
			id: "RFC9525-6.2-3",
			source: "RFC9525",
			section: "6.2",
			title: "IP-ID reference identifier MUST exactly match, no partial matching",
			text:
				"An IP-ID reference identifier MUST exactly match the value of an iPAddress entry in subjectAltName, with no partial (e.g., network- level) matching. There is no application service type.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Conditional: applies only during TLS certificate identity verification when the " +
				"client connects by IP address and constructs an IP-ID reference identifier (the " +
				"harness connects via loopback address, so this branch is reachable). 'network- " +
				"level' is retained verbatim including the mid-word line-wrap space artifact from " +
				"the source RFC text rendering. Testable: present a certificate whose iPAddress SAN " +
				"is a different address on the same subnet as the connection address (e.g., a " +
				"/24-mate) and verify the client rejects it — a conforming client MUST NOT treat " +
				"subnet membership as a match.",
		},
		{
			id: "RFC9525-6.2-4",
			source: "RFC9525",
			section: "6.2",
			title: "Client MUST match DNS name, IP address, or service type per the identifier's produced components",
			text:
				"If the reference identifier produces a domain name, the client MUST match the DNS name; see Section 6.3. If the reference identifier produces an IP address, the client MUST match the IP address; see Section 6.4. If an application service type is present, it MUST also match the service type; see Section 6.5.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Conditional: applies only during TLS certificate identity verification. This is " +
				"the dispatch rule routing to §6.3/§6.4/§6.5; its own obligation is realized and " +
				"tested through those sections' entries (RFC9525-6.3-1/-2, RFC9525-6.4-1, " +
				"RFC9525-6.5-1/-2/-3) rather than independently, but is retained as its own entry " +
				"since it is the RFC's explicit statement that all applicable components (not just " +
				"one) must be matched.",
		},

		// ── §6.3 Matching the DNS Domain Name Portion ────────────────────────────

		{
			id: "RFC9525-6.3-1",
			source: "RFC9525",
			section: "6.3",
			title: "Non-IDN DNS domain name matching MUST be case-insensitive ASCII, label-by-label",
			text:
				"If the DNS domain name portion of a reference identifier is not an internationalized domain name (i.e., an FQDN that conforms to \"preferred name syntax\" as described in Section 3.5 of [DNS-CONCEPTS]), then the matching of the reference identifier against the presented identifier MUST be performed by comparing the set of domain name labels using a case-insensitive ASCII comparison, as clarified by [DNS-CASE]. For example, WWW.BigCompany.Example would be lower-cased to www.bigcompany.example for comparison purposes. Each label MUST match in order for the names to be considered a match, except as supplemented by the rule about checking wildcard labels in presented identifiers given below.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Conditional: applies only during TLS certificate identity verification for " +
				"non-internationalized DNS-ID reference identifiers, the only kind this client " +
				"constructs. Testable: connect using a mixed-case hostname (or present a " +
				"certificate whose DNS-ID SAN uses different case than the connection hostname) " +
				"and verify the client accepts the match. The exception clause ('except as " +
				"supplemented by the rule about checking wildcard labels ... given below') refers " +
				"forward to RFC9525-6.3-3.",
		},
		{
			id: "RFC9525-6.3-2",
			source: "RFC9525",
			section: "6.3",
			title: "IDN DNS domain name matching MUST convert U-labels to A-labels and compare case-insensitively",
			text:
				"If the DNS domain name portion of a reference identifier is an internationalized domain name, then the client MUST convert any U-labels [IDNA-DEFS] in the domain name to A-labels before checking the domain name or comparing it with others. In accordance with [IDNA-PROTO], A-labels MUST be compared as case-insensitive ASCII. Each label MUST match in order for the domain names to be considered to match, except as supplemented by the rule about checking wildcard labels in presented identifiers given below.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "capability-inventory",
			untestableRationale:
				"Exercising this rule requires a hostname that is genuinely an internationalized " +
				"domain name (containing a U-label such as a non-ASCII label), routed through the " +
				"harness's loopback TLS fixtures with a certificate carrying the corresponding " +
				"A-label DNS-ID. Whether this client implements IDNA U-label-to-A-label conversion " +
				"at all is an existence-of-affordance question a single black-box connection " +
				"attempt cannot establish or refute across the implementation's whole input space " +
				"(a failure to connect with a U-label hostname could mean either 'not IDNA-aware' " +
				"or 'the fixture's DNS/hostname plumbing rejected the non-ASCII label before TLS " +
				"was reached', which this harness cannot distinguish).",
			notes:
				"Conditional: applies only during TLS certificate identity verification for " +
				"internationalized DNS-ID reference identifiers. The exception clause mirrors " +
				"RFC9525-6.3-1's and refers forward to RFC9525-6.3-3.",
		},
		{
			id: "RFC9525-6.3-3",
			source: "RFC9525",
			section: "6.3",
			title: "Client MUST match wildcard presented identifiers meeting the single-left-most-label requirements",
			text:
				"If the technology specification supports wildcards in presented identifiers, then the client MUST match the reference identifier against a presented identifier whose DNS domain name portion contains the wildcard character \"*\" in a label, provided these requirements are met: 1. There is only one wildcard character. 2. The wildcard character appears only as the complete content of the left-most label.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "environment-limit",
			untestableRationale:
				"This harness's compliance driver connects the client by loopback IP address " +
				"(127.0.0.1), not by DNS hostname, and wildcard patterns (e.g., '*.example.test') " +
				"match DNS names only — IP addresses are never matched against wildcard patterns " +
				"(RFC9525-6.4-1's octet-for-octet IP-ID rule has no wildcard concept at all). " +
				"Exercising this rule requires the client to connect by a DNS hostname resolved " +
				"against a fixture certificate carrying a wildcard DNS-ID SAN, which is unavailable " +
				"in this loopback harness without a local DNS resolver/hosts-file fixture. Mirrors " +
				"the same finding recorded for RFC 3501 §11.1's consolidated certificate-matching " +
				"entry (the wildcard sub-clause there): the limitation is a harness/environment " +
				"one, not an intrinsic property of the requirement, and is theme-tagged " +
				"'environment-limit' accordingly (rather than 'internal-decision') because a " +
				"future DNS-hostname-capable harness could observe it directly.",
			notes:
				"Conditional: applies only during TLS certificate identity verification when the " +
				"presented certificate's DNS-ID SAN contains a wildcard label. The two enumerated " +
				"validity requirements (single wildcard; complete left-most label) are retained as " +
				"part of the same MUST clause since the RFC states the match obligation and its " +
				"validity preconditions in one sentence; the consequence of the requirements not " +
				"being met is captured separately as RFC9525-6.3-5.",
		},
		{
			id: "RFC9525-6.3-4",
			source: "RFC9525",
			section: "6.3",
			title: "A presented wildcard label matches at most one reference-identifier label",
			text:
				"A wildcard in a presented identifier can only match one label in a reference identifier. This specification covers only wildcard characters in presented identifiers, not wildcard characters in reference identifiers or in DNS domain names more generally. Therefore, the use of wildcard characters as described herein is not to be confused with DNS wildcard matching, where the \"*\" label always matches at least one whole label and sometimes more; see [DNS-CONCEPTS], Section 4.3.3 and [DNS-WILDCARDS]. In particular, it also deviates from [DNS-WILDCARDS], Section 2.1.3.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "environment-limit",
			untestableRationale:
				"Same harness limitation as RFC9525-6.3-3: this is a further constraint on the same " +
				"wildcard-matching behavior (a wildcard label matches exactly one reference-identifier " +
				"label, not the DNS-wildcard 'one-or-more-labels' semantics), reachable only via a " +
				"DNS-hostname connection this loopback-IP harness does not support.",
			notes:
				"Conditional: applies only during TLS certificate identity verification when " +
				"matching a wildcard DNS-ID SAN. Judgment note: 'MUST only match' is expressed as " +
				"'can only match' (lowercase, descriptive framing rather than the explicit keyword " +
				"'MUST'); read in context as normatively equivalent to a MUST-level constraint on " +
				"wildcard span, consistent with RFC 8174's guidance that the capitalized keywords " +
				"carry the normative force and this sentence is restating/clarifying the scope of " +
				"the MUST already stated in RFC9525-6.3-3. Level recorded as MUST accordingly. The " +
				"remainder of the text (contrast with generic DNS wildcard matching) is retained " +
				"verbatim as essential scoping context, not filler.",
		},
		{
			id: "RFC9525-6.3-5",
			source: "RFC9525",
			section: "6.3",
			title: "Presented identifier failing wildcard validity requirements MUST be ignored",
			text: "If the requirements are not met, the presented identifier is invalid and MUST be ignored.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "environment-limit",
			untestableRationale:
				"Same harness limitation as RFC9525-6.3-3: exercising an invalid wildcard presented " +
				"identifier (e.g., two wildcard characters, or a wildcard in a non-left-most label) " +
				"still requires the client to be connecting by DNS hostname so that wildcard-form " +
				"SANs are even candidates for matching; this loopback-IP harness cannot reach that " +
				"code path.",
			notes:
				"Conditional: applies only during TLS certificate identity verification when the " +
				"presented certificate contains a malformed wildcard DNS-ID SAN.",
		},

		// ── §6.4 Matching an IP Address Portion ──────────────────────────────────

		{
			id: "RFC9525-6.4-1",
			source: "RFC9525",
			section: "6.4",
			title: "IP-ID matching MUST be octet-for-octet",
			text: "Matching of an IP-ID is based on an octet-for-octet comparison of the bytes of the reference identity with the bytes contained in the iPAddress subjectAltName.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Conditional: applies only during TLS certificate identity verification when the " +
				"client connects by IP address. Testable: connect by loopback IP address to a " +
				"server presenting a certificate with a matching iPAddress SAN (accepted) versus a " +
				"differing iPAddress SAN (rejected) — the same fixture axis as RFC9525-6.2-3.",
		},
		{
			id: "RFC9525-6.4-2",
			source: "RFC9525",
			section: "6.4",
			title: "URI-ID host-component IP address matching parses as IPv6address or IPv4address",
			text:
				"For an IP address that appears in a URI-ID, the \"host\" component of both the reference identity and the presented identifier must match. These are parsed as either an \"IPv6address\" (following [URI], Section 3.2.2) or an \"IPv4address\" (following [IPv4]). If the resulting octets are equal, the IP address matches.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "capability-inventory",
			untestableRationale:
				"This client never constructs a URI-ID reference identifier (per RFC9525-6.1.1-3, " +
				"IMAP has no formal-protocol-document mandate for URI-IDs and this implementation " +
				"does not derive reference identifiers from a URI scheme+host). Whether the client " +
				"possesses IP-address-in-URI-ID parsing logic at all cannot be established or " +
				"refuted by black-box IMAP-over-TLS connection testing, since the code path is " +
				"never reachable through this client's actual connection API.",
			notes:
				"Conditional: applies only during TLS certificate identity verification for a " +
				"URI-ID reference identifier whose host component is an IP address. Judgment note: " +
				"the source text uses lowercase 'must match', not the capitalized keyword; per RFC " +
				"8174 uncapitalized instances of the keywords do not carry normative force, but " +
				"this sentence is read as inheriting the MUST-level obligation of the general " +
				"IP-address-matching rule (RFC9525-6.4-1) applied to the URI-ID case, so level is " +
				"recorded as MUST rather than treated as non-normative filler.",
		},

		// ── §6.5 Matching the Application Service Type Portion ──────────────────

		{
			id: "RFC9525-6.5-1",
			source: "RFC9525",
			section: "6.5",
			title: "Client MUST check the combined service-type+domain-name pairing and MUST NOT check unpaired combinations",
			text:
				"The client MUST check (1) the combination of (a) an application service type of xmpp-client and (b) a DNS domain name of messenger.example as well as (2) a DNS domain name of app.example. However, the client MUST NOT check the combination of an application service type of xmpp-client and a DNS domain name of app.example because it does not have an SRV-ID of _xmpp-client.app.example in its list of reference identifiers.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "capability-inventory",
			untestableRationale:
				"This client never constructs an SRV-ID or URI-ID reference identifier (it connects " +
				"directly to a caller-supplied hostname/port and does not perform DNS SRV discovery " +
				"per RFC9525-6.1.1-3's default DNS-ID branch), so the illustrated cross-pairing " +
				"mistake (checking a service-type/domain-name combination that was never actually " +
				"paired in the reference-identifier list) has no reachable code path to observe " +
				"either compliance or violation of.",
			notes:
				"Conditional: applies only during TLS certificate identity verification using " +
				"SRV-ID or URI-ID reference identifiers. Text is the RFC's own worked example " +
				"(messaging client with SRV-ID + DNS-ID reference identifiers) rather than an " +
				"abstract rule statement; retained verbatim as the RFC states the obligation only " +
				"in this concrete illustrative form. The MUST clause is captured as the primary " +
				"level for this entry; the MUST NOT clause is the same sentence's necessary " +
				"complement and is not split into a separate entry since the two clauses describe " +
				"one indivisible pairing discipline.",
		},
		{
			id: "RFC9525-6.5-2",
			source: "RFC9525",
			section: "6.5",
			title: "SRV-ID application service name matching MUST be case-insensitive",
			text: "If the identifier is an SRV-ID, then the application service name MUST be matched in a case-insensitive manner, in accordance with [DNS-SRV]. Note that per [SRVNAME], the underscore \"_\" is part of the service name in DNS SRV records and in SRV-IDs.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "capability-inventory",
			untestableRationale:
				"This client does not construct SRV-ID reference identifiers (no DNS SRV discovery), " +
				"so SRV-ID service-name matching has no reachable code path in this implementation " +
				"to observe from outside.",
			notes:
				"Conditional: applies only during TLS certificate identity verification using an " +
				"SRV-ID reference identifier.",
		},
		{
			id: "RFC9525-6.5-3",
			source: "RFC9525",
			section: "6.5",
			title: "URI-ID scheme name matching MUST be case-insensitive",
			text: "If the identifier is a URI-ID, then the scheme name portion MUST be matched in a case-insensitive manner, in accordance with [URI]. Note that the colon \":\" is a separator between the scheme name and the rest of the URI and thus does not need to be included in any comparison.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "capability-inventory",
			untestableRationale:
				"This client does not construct URI-ID reference identifiers (it is not configured " +
				"via a URI scheme with a formal server-certificate URI mandate), so URI-ID scheme " +
				"matching has no reachable code path in this implementation to observe from outside.",
			notes:
				"Conditional: applies only during TLS certificate identity verification using a " +
				"URI-ID reference identifier.",
		},

		// ── §6.6 Outcome (continued) ──────────────────────────────────────────

		{
			id: "RFC9525-6.6-2",
			source: "RFC9525",
			section: "6.6",
			title: "On a successful match, client MUST use the matched reference identifier as the validated identity",
			text: "If the client has found a presented identifier that matches a reference identifier, then the service identity check has succeeded. In this case, the client MUST use the matched reference identifier as the validated identity of the application service.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-state",
			untestableRationale:
				"Whether the client internally records/uses 'the matched reference identifier' " +
				"specifically (as opposed to, say, some other equivalent string) as the validated " +
				"identity of the service is an internal bookkeeping detail. The client's only " +
				"externally observable behavior in the success case is that the connection proceeds " +
				"(already covered by the negative case, RFC9525-6.6-1, and by the matching-rule " +
				"entries in §6.2-6.5); this client exposes no public API surface that reports back " +
				"'the validated identity of the application service' as a distinguishable value a " +
				"black-box test could assert on.",
			notes:
				"Conditional: applies only when TLS certificate identity verification succeeds. " +
				"Companion success-path entry to the seed RFC9525-6.6-1's failure-path text; both " +
				"sentences are drawn from the same §6.6 paragraph sequence but are kept as separate " +
				"entries because they bind disjoint outcomes (match found vs. match not found).",
		},
		{
			id: "RFC9525-6.6-3",
			source: "RFC9525",
			section: "6.6",
			title: "A human-controlled client SHOULD inform the user and auto-terminate on identity mismatch",
			text:
				"If the client is one that is directly controlled by a human user, then it SHOULD inform the user of the identity mismatch and automatically terminate the communication attempt with a bad certificate error in order to prevent users from inadvertently bypassing security protections in hostile situations.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "capability-inventory",
			untestableRationale:
				"This client is a headless protocol library with no built-in end-user interface; " +
				"it is not itself 'a client that is directly controlled by a human user' in the " +
				"sense this sentence addresses (that role belongs to whatever mail application " +
				"embeds this library, which is outside this codebase's boundary). Whether *this* " +
				"library counts as such a client — and therefore whether this SHOULD binds it at " +
				"all — is an API-design/deployment-context classification question, not a " +
				"protocol-observable behavior; unlike the ALERT-text duty (RFC3501 §7.1, flipped " +
				"testable via logger capture per the untestability taxonomy), 'inform the user' " +
				"here has no minimum library-boundary realization to test for, because the RFC's " +
				"own SHOULD is conditioned on a client *architecture* (direct human control) that " +
				"this library does not have.",
			notes:
				"Conditional: applies only during TLS certificate identity verification on an " +
				"identity-mismatch outcome, and only if the client is directly human-controlled. " +
				"Judgment call: this entry is retained (rather than skipped as inapplicable) " +
				"because the applicability question itself is worth recording — a consuming " +
				"application built on this library, if it is the human-facing client, inherits " +
				"this duty even though the library itself does not discharge it directly.",
		},
		{
			id: "RFC9525-6.6-4",
			source: "RFC9525",
			section: "6.6",
			title: "Human-controlled client MAY let advanced users proceed despite mismatch, with caution",
			text:
				"Such clients MAY give advanced users the option of proceeding with acceptance despite the identity mismatch. Although this behavior can be appropriate in certain specialized circumstances, it needs to be handled with extreme caution, for example by first encouraging even an advanced user to terminate the communication attempt and, if they choose to proceed anyway, by forcing the user to view the entire certification path before proceeding.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "capability-inventory",
			untestableRationale:
				"A MAY-level permission grants no constraining envelope: providing or not providing " +
				"an override affordance are both compliant, so there is no pass/fail boundary a " +
				"black-box test could assert on even in principle. Additionally, as with " +
				"RFC9525-6.6-3, this permission is addressed to a human-controlled client, a role " +
				"this headless library does not itself occupy.",
			notes:
				"Conditional: applies only during TLS certificate identity verification, only for " +
				"a human-controlled client, and only on an identity-mismatch outcome.",
		},
		{
			id: "RFC9525-6.6-5",
			source: "RFC9525",
			section: "6.6",
			title: "Ad hoc certificate pinning SHOULD NOT restrict future connections to just the pinned certificate",
			text:
				"The application MAY also present the user with the ability to accept the presented certificate as valid for subsequent connections. Such ad hoc \"pinning\" SHOULD NOT restrict future connections to just the pinned certificate.",
			level: "SHOULD NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "capability-inventory",
			untestableRationale:
				"This client has no public API for accepting-and-pinning a certificate across " +
				"connections at all; the MAY-level affordance ('present the user with the ability " +
				"to accept ... for subsequent connections') is not implemented, so there is no " +
				"pinning behavior to observe as either present-and-compliant or " +
				"present-and-overly-restrictive. Absence of a capability across a client's whole " +
				"configuration space cannot be established by a single black-box connection " +
				"attempt.",
			notes:
				"Conditional: applies only if the client implements ad hoc certificate pinning " +
				"following an identity-mismatch acceptance, which this client does not.",
		},
		{
			id: "RFC9525-6.6-6",
			source: "RFC9525",
			section: "6.6",
			title: "Static per-peer certificate policy SHOULD be prior configuration, not a just-in-time override",
			text: "Local policy that statically enforces a given certificate for a given peer SHOULD be made available only as prior configuration rather than a just-in-time override for a failed connection.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "capability-inventory",
			untestableRationale:
				"This client has no built-in per-peer static certificate-pinning policy feature " +
				"(prior-configuration or just-in-time) at all; whether such a feature, if it " +
				"existed, would be surfaced only as prior configuration is unobservable because " +
				"the feature itself does not exist to inspect.",
			notes:
				"Conditional: applies only if the client implements static per-peer certificate " +
				"enforcement policy, which this client does not. If the client ever grows a " +
				"certificate-pinning configuration option, this entry is a re-evaluation candidate.",
		},

		// ── §7.2 Uniform Resource Identifiers ────────────────────────────────────

		{
			id: "RFC9525-7.2-1",
			source: "RFC9525",
			section: "7.2",
			title: "URI-ID MUST include both scheme and host (reg-name); otherwise it is invalid and MUST be ignored",
			text:
				"For the purposes of this specification, the URI-ID MUST include both a \"scheme\" and a \"host\" component that matches the \"reg-name\" rule; if the entry does not include both, it is not a valid URI-ID and MUST be ignored. Any other components are ignored because only the \"scheme\" and \"host\" components are used for certificate matching as specified under Section 6.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "capability-inventory",
			untestableRationale:
				"This client never constructs or evaluates URI-ID reference identifiers (see " +
				"RFC9525-6.5-3's rationale); URI-ID validity screening has no reachable code path " +
				"in this implementation's actual connection flow to observe from outside.",
			notes:
				"Conditional: applies only during TLS certificate identity verification when the " +
				"client evaluates a URI-ID presented identifier.",
		},

		// ── §7.6 Multiple Reference Identifiers ──────────────────────────────────

		{
			id: "RFC9525-7.6-1",
			source: "RFC9525",
			section: "7.6",
			title: "Client constructing multi-type reference identifiers SHOULD ensure issuing CAs are appropriately constrained",
			text:
				"A client that constructs multiple reference identifiers of different types, such as both DNS-IDs and SRV-IDs as described in Section 6.1.1, SHOULD take care to ensure that CAs issuing such certificates are appropriately constrained.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "out-of-band",
			untestableRationale:
				"This client constructs only a single reference-identifier type (DNS-ID) per " +
				"RFC9525-6.1.1-3, so the multi-type precondition never arises for it. More " +
				"fundamentally, 'taking care to ensure CAs are appropriately constrained' is a " +
				"policy/trust-configuration duty discharged through CA agreements or name-" +
				"constraint enforcement in the trust store — conduct that happens outside the " +
				"IMAP-over-TLS protocol exchange entirely. A black-box connection test can observe " +
				"whether a given certificate chain is accepted or rejected against the platform " +
				"trust store, but cannot establish whether the client 'took care' about issuing-CA " +
				"constraint policy in general; that requires auditing configuration or vendor " +
				"attestation, not protocol observation.",
			notes:
				"Conditional: applies only if the client constructs reference identifiers of " +
				"more than one type, which this client does not (DNS-ID only).",
		},
	],
};

export default rfc9525;
