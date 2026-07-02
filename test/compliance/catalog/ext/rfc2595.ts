import type { CatalogModule } from "../types";

const rfc2595: CatalogModule = {
	source: "RFC2595",
	extractionNote:
		"RFC 2595 (Using TLS with IMAP, POP3 and ACAP). Scope: §2 (Basic Interoperability and " +
		"Security Requirements, which the RFC states apply 'to all implementations of the STARTTLS " +
		"extension for IMAP, POP3 and ACAP' — i.e. bind IMAP clients) and §3 (IMAP STARTTLS " +
		"extension) are fully extracted for client-binding duties, plus the client-directed " +
		"sentences in §9 (Security Considerations) that restate or extend §2/§3 duties. " +
		"§1 (Motivation) and §1.1 (Conventions): no client-binding normative text — background " +
		"and RFC 2119 boilerplate only. " +
		"§4 (POP3 STARTTLS extension) and §5 (ACAP STARTTLS extension): SKIPPED per task scope — " +
		"POP3/ACAP-specific text, not IMAP. §5's client MUST-discard-capabilities duty is the " +
		"ACAP analogue of the already-catalogued RFC2595-3.1-2/3.1-3 IMAP duty; not duplicated here. " +
		"§6 (PLAIN SASL mechanism): SKIPPED — this section is not part of §3 (IMAP STARTTLS) and " +
		"is not itself cipher/cert handling; it defines a SASL mechanism usable by any protocol " +
		"with no in-band login command (ACAP, SMTP). RFC 3501 §6.1.1 separately requires IMAP " +
		"clients to implement 'AUTH=PLAIN (described in [IMAP-TLS])', where [IMAP-TLS] is this " +
		"RFC — that IMAP-specific duty is already catalogued at RFC3501-6.1.1-1; re-cataloguing " +
		"the underlying PLAIN mechanism definition from RFC2595 §6 here would duplicate rather " +
		"than extend it, and the mechanism grammar itself binds whichever protocol invokes PLAIN, " +
		"not the STARTTLS extension. " +
		"§7 (imaps and pop3s ports): SKIPPED — informational discussion of separate-port problems, " +
		"no RFC 2119 keywords; RFC 8314 §3.3 formally replaces this section. " +
		"§8 (IANA Considerations): SKIPPED — registration text, not a client duty. " +
		"§9: client-directed sentences extracted (cache-discard restatement, warn-on-no-privacy, " +
		"configurable-refuse-weak-suites); server-only and PLAIN-specific sentences noted as " +
		"skipped inline. " +
		"§10/§11/Appendix A: SKIPPED — references, author address, and a compliance-checklist " +
		"table that only cross-indexes rules already extracted from §2/§3/§9 (plus POP3/ACAP/PLAIN " +
		"rows out of scope); no new normative text. " +
		"Supersession: RFC 8314 formally updates RFC 2595 (replacing §7 outright and recommending " +
		"Implicit TLS over STARTTLS generally); RFC 3501 §6.2.1/§11.1 and RFC 9051 §11 restate " +
		"much of this RFC's §2.4/§2.5/§3 material almost verbatim as native IMAP4rev1/rev2 text. " +
		"Per task instruction, entries superseded in practice are still catalogued here (RFC 3501 " +
		"cites [IMAP-TLS] = this RFC by reference) with the supersession recorded in `notes`.",
	requirements: [
		// ── §2.1 Cipher Suite Requirements ──────────────────────────────────────
		{
			id: "RFC2595-2.1-1",
			source: "RFC2595",
			section: "2.1",
			title: "Implementations REQUIRED to implement TLS_DHE_DSS_WITH_3DES_EDE_CBC_SHA cipher suite",
			text:
				"Implementation of the TLS_DHE_DSS_WITH_3DES_EDE_CBC_SHA [TLS] cipher suite is REQUIRED. " +
				"This is important as it assures that any two compliant implementations can be configured to interoperate. " +
				"All other cipher suites are OPTIONAL.",
			level: "MUST",
			applicability: "always",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "environment-limit",
			untestableRationale:
				"3DES suites are disabled at OpenSSL security level 2 in modern Node builds (and " +
				"deprecated by RFC 8996); no modern TLS stack can negotiate the mandated suite, so " +
				"compliance is unverifiable black-box on this platform.",
			notes:
				"REQUIRED is the RFC 2119 synonym for MUST; level recorded as MUST. Applies to '§2. " +
				"Basic Interoperability and Security Requirements', which the RFC states apply 'to " +
				"all implementations of the STARTTLS extension for IMAP, POP3 and ACAP' — this binds " +
				"IMAP client implementations, not merely servers, since the sentence says " +
				"'implementations' without restriction. Superseded in practice: RFC 3501 §11.1 " +
				"(RFC3501-11.1-1/-2) restates a near-identical but non-identical cipher-suite pair " +
				"(MUST TLS_RSA_WITH_RC4_128_MD5, SHOULD TLS_DHE_DSS_WITH_3DES_EDE_CBC_SHA) as native " +
				"IMAP4rev1 text; RFC 9051 drops mandated cipher suites entirely in favor of a pointer " +
				"to current TLS best practice (RFC 8314). Both suites are obsolete today (3DES " +
				"deprecated by RFC 8996); text recorded verbatim as written in RFC 2595.",
		},

		// ── §2.2 Privacy Operational Mode Security Requirements ────────────────
		{
			id: "RFC2595-2.2-1",
			source: "RFC2595",
			section: "2.2",
			title: "Clients SHOULD have a privacy-required operational mode refusing authentication without encryption",
			text:
				"Both clients and servers SHOULD have a privacy operational mode which refuses " +
				"authentication unless successful activation of an encryption layer (such as that " +
				"provided by TLS) occurs prior to or at the time of authentication and which will " +
				"terminate the connection if that encryption layer is deactivated.",
			level: "SHOULD",
			applicability: "always",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "capability-inventory",
			untestableRationale:
				"Whether the client implementation possesses a distinct 'privacy operational mode' " +
				"configuration is a capability-existence fact, not a wire behavior; a black-box test " +
				"can exercise only whichever mode is currently configured, and absence of such a mode " +
				"in one session does not establish absence across the implementation's whole " +
				"configuration surface. No public knob exposes this mode today.",
			notes:
				"Binds both client and server ('Both clients and servers'); client half recorded here. " +
				"Applicability 'always': an implementation-level capability requirement, not tied to a " +
				"single session's feature use.",
		},
		{
			id: "RFC2595-2.2-2",
			source: "RFC2595",
			section: "2.2",
			title: "Clients MAY have an operational mode using encryption only when advertised, with authentication proceeding regardless",
			text:
				"Clients MAY have an operational mode which uses encryption only when it is advertised " +
				"by the server, but authentication continues regardless.",
			level: "MAY",
			applicability: "always",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "capability-inventory",
			untestableRationale:
				"MAY grants pure permission for an optional operational mode; there is no constraining " +
				"envelope to test, and possession of such a mode is a capability-existence fact rather " +
				"than an observable wire behavior.",
			notes: "Client-specific MAY (opportunistic-TLS mode), distinct from the SHOULD in RFC2595-2.2-1.",
		},

		// ── §2.3 Clear-Text Password Requirements ───────────────────────────────
		{
			id: "RFC2595-2.3-1",
			source: "RFC2595",
			section: "2.3",
			title: "Clients implementing STARTTLS MUST be configurable to refuse clear-text login without adequate encryption",
			text:
				"Clients and servers which implement STARTTLS MUST be configurable to refuse all " +
				"clear-text login commands or mechanisms (including both standards-track and " +
				"nonstandard mechanisms) unless an encryption layer of adequate strength is active.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "capability-inventory",
			untestableRationale:
				"'MUST be configurable to refuse' asserts the existence of a configuration option; a " +
				"black-box test can only exercise a configuration state that is set, not establish " +
				"that a refuse-clear-text knob exists across the implementation's whole configuration " +
				"space. No public knob of this kind is exposed by the client today.",
			notes:
				"Conditional: binds only implementations that implement STARTTLS. Client half of a " +
				"sentence that also binds servers ('Clients and servers ... MUST be configurable'); " +
				"client obligation recorded here. Closely related to RFC 3501's LOGINDISABLED " +
				"capability duty (RFC3501-6.2.3-1, MUST NOT LOGIN when LOGINDISABLED is advertised), " +
				"which is the concrete, wire-visible, testable narrowing of this general " +
				"configurability duty for the LOGIN command specifically.",
		},

		// ── §2.4 Server Identity Check ──────────────────────────────────────────
		{
			id: "RFC2595-2.4-1",
			source: "RFC2595",
			section: "2.4",
			title: "Client MUST check server hostname against certificate identity during TLS negotiation",
			text:
				"During the TLS negotiation, the client MUST check its understanding of the server " +
				"hostname against the server's identity as presented in the server Certificate " +
				"message, in order to prevent man-in-the-middle attacks.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Conditional: binds only during TLS negotiation (STARTTLS or implicit TLS). Restated " +
				"almost verbatim as native IMAP text in RFC 3501 §11.1 (RFC3501-11.1-3) and RFC 9051 " +
				"§11.1; also the subject of RFC 7817's more detailed hostname-verification service " +
				"and RFC 9525's certificate-matching rules, both of which post-date and refine this " +
				"RFC. Testable: present a server certificate whose identity does not match the " +
				"connection hostname and verify the client does not proceed to treat the session as " +
				"authenticated/trusted without further action (see RFC2595-2.4-4 for the specific " +
				"failure-handling duty).",
		},
		{
			id: "RFC2595-2.4-2",
			source: "RFC2595",
			section: "2.4",
			title: "Client MUST use the connection hostname, not an insecurely-derived one, for certificate comparison",
			text:
				"The client MUST use the server hostname it used to open the connection as the value " +
				"to compare against the server name as expressed in the server certificate. The " +
				"client MUST NOT use any form of the server hostname derived from an insecure remote " +
				"source (e.g., insecure DNS lookup). CNAME canonicalization is not done.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"Which hostname string the client internally feeds into certificate comparison is not " +
				"observable via black-box IMAP protocol testing; the harness connects the client by an " +
				"address it controls and cannot induce a divergent insecure-DNS-derived hostname path, " +
				"and TLS SNI reveals what name the client sends, not what it compares against the " +
				"certificate. Requires white-box inspection of the TLS implementation.",
			notes:
				"Two contiguous sentences: the MUST (use connection hostname) and the MUST NOT (no " +
				"insecure-DNS-derived hostname) are two faces of the same rule; MUST recorded here, " +
				"MUST NOT recorded separately as RFC2595-2.4-3 for keyword fidelity. Restated almost " +
				"verbatim in RFC 3501 §11.1 (RFC3501-11.1-5/-6, also untestable/internal-decision) and " +
				"RFC 9051 §11.1.",
		},
		{
			id: "RFC2595-2.4-3",
			source: "RFC2595",
			section: "2.4",
			title: "Client MUST NOT use a server hostname derived from an insecure remote source for certificate comparison",
			text:
				"The client MUST NOT use any form of the server hostname derived from an insecure " +
				"remote source (e.g., insecure DNS lookup). CNAME canonicalization is not done.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"The provenance of the hostname string used internally for certificate verification is " +
				"not observable via black-box IMAP protocol testing; requires white-box inspection of " +
				"the TLS implementation.",
			notes: "MUST NOT half of the sentence shared with RFC2595-2.4-2; see that entry for the MUST half.",
		},
		{
			id: "RFC2595-2.4-4",
			source: "RFC2595",
			section: "2.4",
			title: "Client SHOULD support subjectAltName dNSName as source of server identity when present",
			text:
				"If a subjectAltName extension of type dNSName is present in the certificate, it " +
				"SHOULD be used as the source of the server's identity.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Conditional: applies only when the presented certificate carries a subjectAltName " +
				"dNSName. Restated in RFC 3501 §11.1 (RFC3501-11.1-7) and refined at length by RFC " +
				"7817's hostname-verification service and RFC 9525's SAN-precedence rules. Testable: " +
				"present a certificate whose CN mismatches the connection hostname but whose SAN " +
				"dNSName matches, and verify a conforming client accepts the identity (SAN takes " +
				"precedence over CN).",
		},
		{
			id: "RFC2595-2.4-5",
			source: "RFC2595",
			section: "2.4",
			title: "Certificate matching is case-insensitive",
			text: "Matching is case-insensitive.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"No explicit RFC 2119 keyword; this is a definitional matching-semantics sentence " +
				"within the enumerated rule list introduced by 'Matching is performed according to " +
				"these rules:' (RFC2595-2.4-1). Level assigned MUST by judgment (pre-8174 lowercase " +
				"convention, following the RFC3501 catalog's own treatment of definitional matching " +
				"rules): a client that rejects a certificate solely due to a case difference would " +
				"violate this rule. Conditional: applies only during certificate hostname comparison. " +
				"Consolidated in RFC 3501 §11.1 alongside the wildcard and multiple-names rules as " +
				"RFC3501-11.1-9; kept as a distinct entry here to preserve per-clause traceability to " +
				"the RFC 2595 source text.",
		},
		{
			id: "RFC2595-2.4-6",
			source: "RFC2595",
			section: "2.4",
			title: "Client MAY use a leftmost wildcard character in certificate name matching",
			text:
				"A \"*\" wildcard character MAY be used as the left-most name component in the " +
				"certificate. ... but would not match example.com.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "environment-limit",
			untestableRationale:
				"The compliance driver connects the client by loopback IP address (127.0.0.1); " +
				"wildcard certificate patterns (e.g. *.example.test) match DNS names only, never IP " +
				"addresses, so wildcard matching can never be exercised on this harness without a " +
				"local DNS resolver fixture connecting the client by hostname.",
			notes:
				"Elision covers the inline example ('For example, *.example.com would match " +
				"a.example.com, foo.example.com, etc.'); the retained clause preserves the boundary " +
				"case ('but would not match example.com'). Consolidated in RFC 3501 §11.1 as part of " +
				"RFC3501-11.1-9 (testable there via SAN-precedence scenarios that don't require " +
				"wildcard matching specifically); RFC 9525 later formalizes and narrows wildcard " +
				"matching rules considerably (e.g. restricting partial-label wildcards), superseding " +
				"this permissive MAY in practice.",
		},
		{
			id: "RFC2595-2.4-7",
			source: "RFC2595",
			section: "2.4",
			title: "A certificate match against any one of multiple present names is acceptable",
			text:
				"If the certificate contains multiple names (e.g. more than one dNSName field), then " +
				"a match with any one of the fields is considered acceptable.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"No explicit RFC 2119 keyword ('is considered acceptable'); level assigned MUST by " +
				"judgment (pre-8174 lowercase-equivalent convention) since this defines the pass " +
				"condition for the MUST-level check of RFC2595-2.4-1 — a client that rejected a " +
				"certificate matching on a non-first SAN entry would violate that check. Conditional: " +
				"applies only during certificate hostname comparison when multiple identity fields are " +
				"present. Consolidated in RFC 3501 §11.1 as part of RFC3501-11.1-9. Testable: present " +
				"a certificate with multiple SAN dNSName entries where only a non-first entry matches " +
				"the connection hostname, and verify the client accepts it.",
		},
		{
			id: "RFC2595-2.4-8",
			source: "RFC2595",
			section: "2.4",
			title: "On hostname/certificate mismatch, client SHOULD ask for user confirmation or terminate and flag suspect identity",
			text:
				"If the match fails, the client SHOULD either ask for explicit user confirmation, or " +
				"terminate the connection and indicate the server's identity is suspect.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Conditional: applies only when the hostname/certificate match of RFC2595-2.4-1 fails. " +
				"Restated verbatim (word-for-word identical in RFC 3501) as RFC3501-11.1-4. Testable: " +
				"present a mismatched certificate and verify the client either surfaces a confirmation " +
				"prompt/event to the consuming application or terminates the connection rather than " +
				"silently proceeding as if the identity check passed.",
		},

		// ── §2.5 TLS Security Policy Check ──────────────────────────────────────
		{
			id: "RFC2595-2.5-1",
			source: "RFC2595",
			section: "2.5",
			title: "Client MUST check the result of STARTTLS and TLS negotiation for acceptable security",
			text:
				"Both the client and server MUST check the result of the STARTTLS command and " +
				"subsequent TLS negotiation to see whether acceptable authentication or privacy was " +
				"achieved. Ignoring this step completely invalidates using TLS for security.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Conditional: applies only when STARTTLS is used. Binds both client and server " +
				"('Both the client and server'); client half recorded here. Restated verbatim in RFC " +
				"3501 §11.1 as RFC3501-11.1-8. The RFC leaves the acceptability decision itself " +
				"'implementation-dependent, and ... beyond the scope of this document' — that " +
				"sub-clause is not catalogued as a separate duty since it imposes no concrete " +
				"observable requirement, only that a check occur at all. Testable: observe whether the " +
				"client aborts or refuses to proceed with a session when the TLS handshake itself " +
				"fails (does not silently continue in the clear after a failed/incomplete negotiation).",
		},

		// ── §3.1 STARTTLS Command ────────────────────────────────────────────────
		{
			id: "RFC2595-3.1-1",
			source: "RFC2595",
			section: "3.1",
			title: "Client MUST NOT issue further commands after STARTTLS until server response and TLS negotiation complete",
			text:
				"A TLS negotiation begins immediately after the CRLF at the end of the tagged OK " +
				"response from the server. Once a client issues a STARTTLS command, it MUST NOT issue " +
				"further commands until a server response is seen and the TLS negotiation is complete.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Conditional: binds only once the client has issued STARTTLS. Restated verbatim in " +
				"RFC 3501 §6.2.1 as RFC3501-6.2.1-3 (also cross-referenced from that catalog entry's " +
				"notes). Testable: after issuing STARTTLS, verify the client sends no further command " +
				"octets on the wire until the server's tagged response and TLS handshake complete " +
				"(command injection / plaintext-command-injection defense).",
		},
		{
			id: "RFC2595-3.1-2",
			source: "RFC2595",
			section: "3.1",
			title: "Client MUST discard cached server capability information once TLS has started",
			text:
				"Once TLS has been started, the client MUST discard cached information about server " +
				"capabilities and SHOULD re-issue the CAPABILITY command. This is necessary to protect " +
				"against man-in-the-middle attacks which alter the capabilities list prior to STARTTLS.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Conditional: binds only once STARTTLS has completed. MUST half of a sentence whose " +
				"SHOULD half is recorded separately as RFC2595-3.1-3. Restated verbatim in RFC 3501 " +
				"§6.2.1 as RFC3501-6.2.1-1, and echoed again in this RFC's own §9 Security " +
				"Considerations (not re-catalogued there as a separate entry — see extractionNote).",
		},
		{
			id: "RFC2595-3.1-3",
			source: "RFC2595",
			section: "3.1",
			title: "Client SHOULD re-issue CAPABILITY command once TLS has started",
			text:
				"Once TLS has been started, the client MUST discard cached information about server " +
				"capabilities and SHOULD re-issue the CAPABILITY command.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"SHOULD half of the sentence shared with RFC2595-3.1-2. Restated verbatim in RFC 3501 " +
				"§6.2.1 as RFC3501-6.2.1-2.",
		},

		// ── §3.2 IMAP LOGINDISABLED capability ──────────────────────────────────
		{
			id: "RFC2595-3.2-1",
			source: "RFC2595",
			section: "3.2",
			title: "Compliant client MUST NOT issue LOGIN when LOGINDISABLED capability is present",
			text:
				"An IMAP client which complies with this specification MUST NOT issue the LOGIN " +
				"command if this capability is present.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Conditional: binds only when the server advertises LOGINDISABLED. This is the " +
				"original source text for RFC 3501's own LOGINDISABLED capability rule " +
				"(RFC3501-6.2.3-1, worded near-identically as native IMAP4rev1 text); RFC 3501 (and " +
				"RFC 9051) supersede this RFC as the primary normative source for IMAP4 clients, but " +
				"the duty traces back to this RFC and RFC 3501 §6.1.1 cites [IMAP-TLS] (this RFC) by " +
				"reference for the LOGINDISABLED capability itself. Testable: after a CAPABILITY " +
				"response advertising LOGINDISABLED, verify the client does not send a LOGIN command " +
				"on that connection.",
		},

		// ── §9 Security Considerations (client-directed sentences only) ────────
		{
			id: "RFC2595-9-1",
			source: "RFC2595",
			section: "9",
			title: "Client SHOULD warn the user when session privacy is not active, and/or refuse to proceed without acceptable security",
			text:
				"A man-in-the-middle attacker can remove STARTTLS from the capability list or " +
				"generate a failure response to the STARTTLS command. In order to detect such an " +
				"attack, clients SHOULD warn the user when session privacy is not active and/or be " +
				"configurable to refuse to proceed without an acceptable level of security.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Conditional: relevant when STARTTLS is stripped or fails during a connection attempt. " +
				"Interpreted per this catalog's logger-capture convention (documented in " +
				"docs/superpowers/specs/2026-06-12-untestability-themes.md): the client is a headless " +
				"protocol library whose user-facing notification channel is the public `logger` " +
				"callback / public events, so 'warn the user' is satisfied by emitting an " +
				"attention-grade (warn/error) logger message or public event when a STARTTLS attempt " +
				"is stripped or fails, honestly interpreted as the strongest observation available at " +
				"the library boundary — not literal UI presentation. Testable: arm a scripted server " +
				"that omits STARTTLS from CAPABILITY (or fails the STARTTLS command) and assert the " +
				"driver's logger/event capture records an attention-grade warning, or that the client " +
				"refuses to proceed to authentication. The 'and/or be configurable to refuse' clause " +
				"is the same configurability duty as RFC2595-2.3-1 applied to this specific attack; " +
				"not re-split into a separate entry.",
		},
		{
			id: "RFC2595-9-2",
			source: "RFC2595",
			section: "9",
			title: "Client implementations SHOULD be configurable to refuse weak mechanisms or cipher suites",
			text:
				"A man-in-the-middle attacker can always cause a down-negotiation to the weakest " +
				"authentication mechanism or cipher suite available. For this reason, implementations " +
				"SHOULD be configurable to refuse weak mechanisms or cipher suites.",
			level: "SHOULD",
			applicability: "always",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "capability-inventory",
			untestableRationale:
				"'SHOULD be configurable to refuse' asserts the existence of a configuration surface; a " +
				"black-box test can exercise only whichever cipher-suite policy is currently " +
				"configured (which is delegated to the underlying TLS stack/Node runtime in this " +
				"client), not establish that a refuse-weak-suites knob exists as client-level " +
				"configuration across the whole implementation surface.",
			notes:
				"Applicability 'always': an implementation-level capability requirement, not tied to a " +
				"single session's feature use. Superseded in practice by RFC 8314's and modern TLS " +
				"guidance's approach of simply prohibiting weak suites/versions outright rather than " +
				"requiring configurability to refuse them.",
		},
		{
			id: "RFC2595-9-3",
			source: "RFC2595",
			section: "9",
			title: "Clients MUST discard cached server-capability information from before the TLS handshake",
			text:
				"Any protocol interactions prior to the TLS handshake are performed in the clear and " +
				"can be modified by a man-in-the-middle attacker. For this reason, clients MUST " +
				"discard cached information about server capabilities advertised prior to the start " +
				"of the TLS handshake.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Conditional: binds only when a TLS handshake (STARTTLS) occurs on the connection. " +
				"This is §9's restatement of the §3.1 duty already catalogued as RFC2595-3.1-2; " +
				"recorded as a separate entry because it is a distinct sentence with its own " +
				"justification (protects against pre-handshake tampering) in a distinct section, per " +
				"this catalog's per-section-1-per-ordinal convention, but the underlying client duty " +
				"and its test are identical to RFC2595-3.1-2 — see that entry for the testable " +
				"assertion.",
		},
	],
};

export default rfc2595;
