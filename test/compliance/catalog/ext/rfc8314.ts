import type { CatalogModule } from "../types";

// RFC 8314 — "Cleartext Considered Obsolete: Use of Transport Layer Security
// (TLS) for Email Submission and Access" — updates RFC 1939, 2595, 3501,
// 5068, 6186, 6409. This module extracts only the client (MUA)-binding
// requirements relevant to IMAP access (Implicit TLS on port 993, the TLS
// version/cipher/cert floor that binds the client, SRV-based discovery,
// minimum-confidentiality policy, certificate validation/pinning, and
// client-certificate authentication). See extractionNote below for the full
// section-by-section coverage ledger, including everything intentionally
// skipped (POP-only text, SMTP Submission-only text, and server/MSP-only
// text).

const rfc8314: CatalogModule = {
	source: "RFC8314",
	extractionNote:
		"Coverage ledger (RFC 8314, all sections reviewed): " +
		"§1 Introduction — no client-binding requirements (non-normative overview; its " +
		"three summary bullets are restated normatively in §4/§5 and extracted there). " +
		"§1.1 How This Document Updates Previous RFCs — no client-binding requirements " +
		"(meta-description of the update mechanism, no RFC 2119 keywords). " +
		"§2 Conventions and Terminology — no client-binding requirements (defines terms " +
		"'Implicit TLS', 'Mail Access Server', etc.; referenced by extracted entries but " +
		"contributes no independent duty). " +
		"§3 Implicit TLS — no client-binding requirements of its own (introduces the " +
		"concept; the operative MUSTs are in §3.1/§3.2/§3.3, only one of which is in " +
		"scope). " +
		"§3.1 Implicit TLS for POP — OUT OF SCOPE (POP-only; not an IMAP access protocol). " +
		"§3.2 Implicit TLS for IMAP — extracted 1 (RFC8314-3.2-1; PREAUTH/OK greeting " +
		"state-entry sentences are server-directed, not client-binding, and already " +
		"covered by RFC 3501/9051 greeting-state entries, so not duplicated here). " +
		"§3.3 Implicit TLS for SMTP Submission — OUT OF SCOPE (Submission-only, port 465/587). " +
		"§3.4 Implicit TLS Connection Closure for POP, IMAP, and SMTP Submission — " +
		"extracted 2 (RFC8314-3.4-1, RFC8314-3.4-2); applies to IMAP alongside POP/Submission. " +
		"§4 Use of TLS by Mail Access Servers and Message Submission Servers — OUT OF SCOPE " +
		"(server/MSP-directed operational requirements: TLS support, Implicit TLS " +
		"provisioning, SRV advertisement, deprecation of cleartext servers, mandated " +
		"server-side TLS 1.2 floor and ciphersuites, Received-header ciphersuite logging; " +
		"none bind the IMAP client). §4.1 Deprecation of Cleartext/Old TLS — OUT OF SCOPE " +
		"(server-directed deprecation policy and non-indication-of-validity duty on the " +
		"server). §4.2 Mail Server Use of Client Certificate Authentication — OUT OF SCOPE " +
		"(server-directed: when a server MAY/MUST NOT request client certs, server-side " +
		"SASL EXTERNAL enablement; the client-directed counterpart is §5.5, extracted). " +
		"§4.3 Recording TLS Ciphersuite in 'Received' Header Field — OUT OF SCOPE " +
		"(Submission-server-only logging duty). §4.4 TLS Server Certificate Requirements — " +
		"OUT OF SCOPE (server MUST maintain valid certs; a server-directed duty, not a " +
		"client one; the client-side validation counterpart is §5.3, extracted). " +
		"§4.5/4.5.1-4.5.4 Recommended DNS Records — OUT OF SCOPE (server/MSP-directed DNS " +
		"advertisement: MX, SRV, DNSSEC, TLSA; the client-side SRV-consumption counterpart " +
		"is §5.1, extracted). §4.6 Changes to Internet-Facing Servers — OUT OF SCOPE " +
		"(server-operations guidance, no RFC 2119 keyword). " +
		"§5 Use of TLS by Mail User Agents — the summary-bullet list has eight bullets. " +
		"Four are elaborated in §5.1-§5.3 and extracted once at their elaborating " +
		"subsection to avoid duplicate entries for the same duty: bullet 1 (SHOULD use " +
		"DNS SRV discovery → §5.1/RFC8314-5.1-1), bullet 2 (SHOULD be configurable to " +
		"require minimum confidentiality → §5.2/RFC8314-5.2-1), bullet 3 (MUST NOT treat a " +
		"session as meeting minimum confidentiality if the cert cannot be validated → " +
		"§5.3/RFC8314-5.3-1), and bullet 4 (MAY impose other future minimum-confidentiality " +
		"requirements — a bare MAY with no pass/fail boundary, folded into §5.3's context " +
		"rather than itemized). The remaining four bullets have no subsection elaboration " +
		"and are extracted directly here: extracted 5 (RFC8314-5-1 SHOULD provide a " +
		"prominent confidentiality indication [bullet 5, first sentence]; RFC8314-5-3 the " +
		"MUST NOT constraining what that indication may claim [bullet 5, second sentence], " +
		"split from 5-1 so its SHOULD level stays honest; RFC8314-5-2 mandatory TLS 1.2 " +
		"implementation floor [bullet 6]; RFC8314-5-4 SHOULD implement RFC 7525 recommended " +
		"ciphersuites [bullet 7]; RFC8314-5-5 SHOULD detect TLS availability and offer to " +
		"upgrade a not-minimum-confidentiality account [bullet 8]). " +
		"§5.1 Use of SRV Records in Establishing Configuration — extracted 7 " +
		"(RFC8314-5.1-1 through RFC8314-5.1-7; RFC8314-5.1-7 is the 'MUST NOT test a Mail " +
		"Account configuration by submitting credentials without a minimum-confidentiality " +
		"TLS session' duty, cross-referenced to the observable no-credentials-before-TLS " +
		"behavior of RFC8314-5.2-4). " +
		"§5.2 Minimum Confidentiality Level — extracted 6 (RFC8314-5.2-1 through " +
		"RFC8314-5.2-6). " +
		"§5.3 Certificate Validation — extracted 3 (RFC8314-5.3-1 through RFC8314-5.3-3). " +
		"§5.4 Certificate Pinning — extracted 4 (RFC8314-5.4-1 through RFC8314-5.4-4); the " +
		"MAY-level 'offer to pin' sentence itself is folded into RFC8314-5.4-1's notes as " +
		"context rather than itemized, since the module's pinning entries are the " +
		"constraining MUST/MUST NOT duties around that MAY, and the bare permission " +
		"carries no independent pass/fail boundary of its own. " +
		"§5.5 Client Certificate Authentication — extracted 4 (RFC8314-5.5-1 through " +
		"RFC8314-5.5-4). " +
		"§6 Considerations Related to Antivirus/Antispam Software and Services — OUT OF " +
		"SCOPE (deployment/compatibility discussion for AVAS proxies; no client-binding " +
		"RFC 2119 keyword). " +
		"§7 IANA Considerations (§7.1-7.4) — OUT OF SCOPE (port/registry registration " +
		"records; non-normative for implementations). " +
		"§8 Security Considerations — no client-binding requirements (descriptive threat- " +
		"model discussion of client-certificate identity exposure under TLS 1.2; restates " +
		"rationale already captured normatively via §5.5's cross-referenced MUST NOT " +
		"duties, contributes no new keyword-bearing sentence of its own). " +
		"§9 References, Appendix A (Design Considerations), Acknowledgements, Authors' " +
		"Addresses — OUT OF SCOPE (non-normative). " +
		"Total: 32 requirements extracted across §3.2, §3.4, §5, §5.1-§5.5. " +
		"Cross-reference: RFC 9051 §11.1-1 (RFC9051-11.1-1, in " +
		"test/compliance/catalog/rfc9051/s9-syntax-security.ts) is a pointer requirement " +
		"stating clients 'MUST comply with relevant TLS recommendations from [RFC8314]'; " +
		"this module supplies the concrete text that pointer refers to. RFC 9051 " +
		"§11.2-1/§11.2-2 (Implicit TLS + STARTTLS dual support, port-993/143 racing) " +
		"elaborate this RFC's §3/§1 Implicit TLS preference. RFC 3501 §11.1/§6.2.1 " +
		"(hostname verification, LOGIN-as-last-resort under cleartext) predate this RFC " +
		"and are updated by it per RFC 8314 §1.1.",
	requirements: [
		// ── §3.2 Implicit TLS for IMAP ────────────────────────────────────────
		{
			id: "RFC8314-3.2-1",
			source: "RFC8314",
			section: "3.2",
			title: "Client MUST implement RFC 7817 certificate validation for Implicit TLS on IMAP",
			text:
				'When a TCP connection is established for the "imaps" service (default ' +
				"port 993), a TLS handshake begins immediately. Clients MUST implement " +
				"the certificate validation mechanism described in [RFC7817].",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Conditional: binds when the client connects to the Implicit TLS (port 993) IMAP " +
				"service. Two sub-duties in one sentence: (a) a TCP connection to the imaps port " +
				"begins a TLS handshake immediately (no cleartext preamble) — testable by observing " +
				"the client initiates TLS from byte 0 on a port-993-style connection, matching the " +
				"driver's 'implicit' DriverConnectOptions.security mode (test/compliance/driver/driver.ts). " +
				"(b) The client MUST implement RFC 7817's certificate validation mechanism — RFC 7817 " +
				"is an external document out of this module's scope (see RFC7817-*.ts if/when extracted " +
				"separately), but its concrete hostname/identity-check duty is already catalogued as " +
				"testable at RFC9051-11.1-6 and RFC3501-11.1-3/-7 (SAN/CN matching), exercised by the " +
				"harness's wrong-host/san-only-match/san-mismatch/multi-san cert fixtures " +
				"(test/compliance/harness/certs). The new 'expired' fixture additionally exercises " +
				"certificate-expiry rejection, which this sentence's 'certificate validation mechanism' " +
				"also requires per RFC 7817/PKIX (RFC 5280) but which predates this fixture's addition; " +
				"testability here targets the immediate-handshake and hostname-check behaviors together. " +
				"Cross-reference: RFC9051-11.2-1 (Implicit TLS support) and RFC9051-11.1-6 (hostname " +
				"check via RFC 7817).",
		},

		// ── §3.4 Implicit TLS Connection Closure for POP, IMAP, and SMTP Submission ──
		{
			id: "RFC8314-3.4-1",
			source: "RFC8314",
			section: "3.4",
			title: "Client SHOULD initiate exchange of TLS close alerts before closing an Implicit TLS connection",
			text:
				"When a client or server wishes to close the connection, it SHOULD " +
				"initiate the exchange of TLS close alerts before TCP connection " +
				"termination.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"Whether the client sends a TLS close_notify alert before closing the underlying TCP " +
				"socket is, in principle, observable at the TLS record layer. However, this client's " +
				"public API (Connection/Session in src/index) does not expose a driver-observable " +
				"'graceful TLS shutdown' surface distinct from ordinary socket teardown, and Node's " +
				"tls.TLSSocket.end()/destroy() behavior around close_notify is an internal decision of " +
				"the underlying platform TLS stack the library delegates to, not a client-authored " +
				"protocol action the harness's ComplianceDriver can distinguish from an abrupt close " +
				"without new low-level TLS-record instrumentation the harness does not currently have. " +
				"A compliant (close_notify sent) and non-compliant (abrupt close) shutdown produce " +
				"indistinguishable outcomes at the IMAP protocol layer this harness observes (both end " +
				"the session); only TLS-record-level capture would surface the difference.",
			notes:
				"Conditional: binds only when the client initiates connection closure on an Implicit " +
				"TLS (or STARTTLS-upgraded) connection. Applies to IMAP per this section's heading " +
				"('for POP, IMAP, and SMTP Submission'). Forward-looking note: if the harness gains " +
				"TLS-record-level close_notify capture, this is a re-evaluation candidate (parallel to " +
				"the taxonomy's environment-limit/instrumental-mechanism precedent).",
		},
		{
			id: "RFC8314-3.4-2",
			source: "RFC8314",
			section: "3.4",
			title: "Client MAY close the TCP connection without waiting for the server's TLS close alert",
			text:
				"The client MAY, after sending a TLS close alert, gracefully close " +
				"the TCP connection (e.g., call the close() function on the TCP " +
				"socket or otherwise issue a TCP CLOSE ([RFC793], Section 3.5)) " +
				"without waiting for a TLS response from the server.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"MAY-level permission with no constraining envelope: waiting or not waiting for the " +
				"server's TLS close response are both compliant, so no assertion has a pass/fail " +
				"boundary. Also depends on RFC8314-3.4-1's close_notify send, which is itself " +
				"untestable at this harness's observation layer (see that entry's rationale).",
			notes:
				"Conditional: applies only after the client has sent a TLS close alert per §3.4's " +
				"preceding sentence (RFC8314-3.4-1). Vacuous by requirement level (MAY), independent " +
				"of the instrumentation gap noted in the sibling entry.",
		},

		// ── §5 Use of TLS by Mail User Agents (summary bullets not elaborated elsewhere) ──
		{
			id: "RFC8314-5-1",
			source: "RFC8314",
			section: "5",
			title: "MUAs SHOULD prominently indicate the confidentiality level of an account connection to the user",
			text:
				'MUAs SHOULD provide a prominent indication of the level of ' +
				"confidentiality associated with an account configuration that is " +
				"appropriate for the user interface (for example, a \"lock\" icon or " +
				"changed background color for a visual interface, or some sort of " +
				"audible indication for an audio user interface), at appropriate " +
				"times and/or locations, in order to inform the user of the " +
				"confidentiality of the communications associated with that " +
				"account.",
			level: "SHOULD",
			applicability: "always",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "ui-presentation",
			untestableRationale:
				"This client is a headless protocol library with no user interface of its own (no lock " +
				"icon, no visual/audio indicator); it exposes only the public logger callback and public " +
				"events as notification channels (per the untestability-themes taxonomy's mechanism (a) " +
				"analysis). Unlike RFC3501-7.1-1's ALERT-presentation duty (which was flipped to testable " +
				"because it binds surfacing a specific, server-supplied piece of text through that " +
				"channel), this duty asks for an ambient, always-on UI affordance ('lock icon', 'changed " +
				"background color') describing the account's persistent confidentiality posture — there " +
				"is no discrete server-supplied event to surface through the logger, and 'the client's " +
				"connection is using TLS' is not itself modeled as a loggable occurrence anywhere in " +
				"src/. Building and asserting on such a UI is an application-layer concern the library " +
				"delegates to its consumer by design.",
			notes:
				"Applies at the MUA/account-configuration layer generally, not specifically an IMAP " +
				"wire behavior; retained in scope because the account it describes may be an IMAP " +
				"account. Not elaborated by any RFC 8314 subsection — extracted directly from the §5 " +
				"summary-bullet list per the module's coverage ledger. This entry captures only the " +
				"first sentence of the bullet (the SHOULD-provide-an-indication duty); the bullet's " +
				"second sentence — a MUST NOT constraining WHAT that indication may claim — is a distinct " +
				"obligation extracted separately as RFC8314-5-3 so this entry's SHOULD level stays honest.",
		},
		{
			id: "RFC8314-5-3",
			source: "RFC8314",
			section: "5",
			title: "MUA providing a confidentiality indication MUST NOT indicate confidentiality below TLS 1.1 + cert verification + minimum requirements",
			text:
				"If, however, an MUA provides such an indication, it MUST NOT " +
				"indicate confidentiality for any connection that does not at " +
				"least use TLS 1.1 with certificate verification and also meet the " +
				"minimum confidentiality requirements associated with that account.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "ui-presentation",
			untestableRationale:
				"Constrains the content of the client's confidentiality INDICATION to the user (the 'lock " +
				"icon' / background-color / audible affordance of RFC8314-5-1), not a wire behavior: it " +
				"says the MUA must not TELL the user a connection is confidential unless it uses at least " +
				"TLS 1.1 with certificate verification and meets the account's minimum confidentiality " +
				"requirements. This headless protocol library has no such user-facing confidentiality " +
				"indicator (same mechanism (a) analysis as RFC8314-5-1 and RFC8314-5.4-4): there is no " +
				"discrete server-supplied event to route through the public logger, and the ambient " +
				"'this connection is confidential' UI affordance being constrained is delegated to the " +
				"consuming application by design. The underlying TLS-1.1-floor / certificate-verification " +
				"substance is separately and testably enforced at the connection level via RFC8314-5-2 / " +
				"RFC9051-11.1-2 (TLS 1.2 MUST) and the cert-validation entries cross-referenced at " +
				"RFC8314-3.2-1 / RFC8314-5.3-1 — this entry's untestability is about the indication " +
				"framing, not the TLS/cert content.",
			notes:
				"Second sentence of §5's confidentiality-indication bullet, split from RFC8314-5-1 (its " +
				"SHOULD-provide-an-indication first sentence) so the two requirement levels (SHOULD to " +
				"provide vs. MUST NOT to over-claim) each stay honest. Conditional: binds only when an " +
				"MUA provides a confidentiality indication in the first place ('If, however, an MUA " +
				"provides such an indication'). Cross-reference: RFC8314-5-1 (the gated indication duty), " +
				"RFC8314-5.4-4 (the parallel MUST-NOT-indicate-confidentiality-for-pinned-certs duty).",
		},
		{
			id: "RFC8314-5-2",
			source: "RFC8314",
			section: "5",
			title: "MUAs MUST implement TLS 1.2 or later",
			text:
				"MUAs MUST implement TLS 1.2 [RFC5246] or later. Earlier TLS and " +
				"SSL versions MAY also be supported, so long as the MUA requires at " +
				"least TLS 1.1 [RFC4346] when accessing accounts that are " +
				"configured to impose minimum confidentiality requirements.",
			level: "MUST",
			applicability: "always",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Not elaborated by any RFC 8314 subsection — extracted directly from the §5 summary- " +
				"bullet list. Testable by observing the client can successfully negotiate TLS 1.2+ " +
				"during STARTTLS/Implicit TLS. Cross-reference: this is the RFC 8314 origin of the " +
				"TLS-1.2-floor duty later folded verbatim into RFC 9051 as RFC9051-11.1-2 ('Clients and " +
				"servers MUST implement TLS 1.2 [TLS-1.2] or newer'); RFC9051-11.1-2 is the operative, " +
				"already-catalogued testable entry for rev2 and this entry is its rev1-applicable RFC " +
				"8314 counterpart (RFC 3501/rev1 predates TLS 1.2 and had no such floor of its own, per " +
				"RFC9051-11.1-2's notes — RFC 8314 supplies that floor for rev1 deployments). The " +
				"trailing MAY-earlier-versions/conditional-TLS-1.1-floor clause is bundled here as it " +
				"qualifies the same sentence rather than stating an independent duty.",
		},
		{
			id: "RFC8314-5-4",
			source: "RFC8314",
			section: "5",
			title: "MUAs SHOULD implement the recommended TLS ciphersuites of RFC 7525 (or a successor)",
			text:
				"All MUAs SHOULD implement the recommended TLS ciphersuites " +
				"described in [RFC7525] or a future BCP or Standards Track " +
				"revision of that document.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "capability-inventory",
			untestableRationale:
				"Asserts the implementation's TLS ciphersuite inventory includes the RFC 7525 " +
				"recommended set. This client does not select or enumerate TLS ciphersuites itself: it " +
				"delegates the entire TLS handshake — including ciphersuite negotiation — to Node's " +
				"tls module / the underlying OpenSSL build, and exposes no ciphersuite-selection surface " +
				"in its public API (src/connection). The set of offered ciphersuites is therefore a " +
				"property of the host runtime's OpenSSL configuration, not a client-authored decision " +
				"this harness can enumerate or assert against across the whole negotiation space — the " +
				"defining capability-inventory shape. This mirrors the RFC 2595 / RFC 8314 environment " +
				"reasoning applied elsewhere, but is filed as capability-inventory rather than " +
				"environment-limit because the RFC 7525 suites ARE modern and negotiable by the platform " +
				"(nothing in the environment prevents them); the gap is purely that the client offers no " +
				"ciphersuite-selection affordance of its own to inspect.",
			notes:
				"§5 bullet 7, not elaborated by any RFC 8314 subsection — extracted directly from the " +
				"summary-bullet list. Conditional: relevant to any TLS-capable MUA. Cross-reference: the " +
				"companion server-side duty (§4 'All Mail Access Servers ... SHOULD implement the " +
				"recommended TLS ciphersuites ...') is OUT OF SCOPE (server-directed) per the §4 coverage " +
				"ledger; this is its MUA-directed counterpart.",
		},
		{
			id: "RFC8314-5-5",
			source: "RFC8314",
			section: "5",
			title: "MUA not requiring minimum confidentiality SHOULD detect TLS availability and offer to upgrade the account",
			text:
				"MUAs that are configured to not require minimum confidentiality " +
				"for one or more accounts SHOULD detect when TLS becomes " +
				"available on those accounts (using [RFC6186] or other means) and " +
				"offer to upgrade the account to require TLS.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "capability-inventory",
			untestableRationale:
				"Binds two affordances this headless library does not have: (a) an autonomous " +
				"'detect when TLS becomes available' capability (via RFC 6186 SRV discovery or 'other " +
				"means'), which is the same absent SRV/auto-configuration affordance gated in " +
				"RFC8314-5.1-1 through -5.1-6 (host/port/TLS mode are always caller-supplied, there is no " +
				"discovery code path), and (b) an 'offer to upgrade the account' UI action at the " +
				"account-management layer this per-connection library does not model. A duty conditioned " +
				"on absent capabilities has no exercise path, and the absence itself is a " +
				"capability-inventory fact outside black-box reach.",
			notes:
				"§5 bullet 8, not elaborated by any RFC 8314 subsection — extracted directly from the " +
				"summary-bullet list. Conditional: applies only to accounts configured to NOT require " +
				"minimum confidentiality. Cross-reference: RFC8314-5.1-1 (the RFC 6186 SRV-support " +
				"affordance this bullet's detection leg relies on) and RFC8314-5.2-6 (the most-secure-" +
				"means-available default), both untestable for the same caller-supplies-configuration " +
				"reason.",
		},

		// ── §5.1 Use of SRV Records in Establishing Configuration ────────────────
		{
			id: "RFC8314-5.1-1",
			source: "RFC8314",
			section: "5.1",
			title: "User-configurable MUAs SHOULD support RFC 6186 SRV records for account setup",
			text:
				"User-configurable MUAs SHOULD support the use of [RFC6186] for " +
				"account setup.",
			level: "SHOULD",
			applicability: "always",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "capability-inventory",
			untestableRationale:
				"Asserts the implementation possesses an autonomous account-setup/discovery affordance " +
				"(DNS SRV lookup per RFC 6186) that this client does not have and, by its own " +
				"architecture, delegates entirely to the consuming application: this is a headless " +
				"protocol library where every connection's host/port is supplied explicitly by the " +
				"caller (src/index Connection/Session constructors take host/port directly), with no " +
				"'discover servers for this account' code path to exercise or assert absence of. Same " +
				"capability-inventory pattern as the already-catalogued RFC9051-11.2-2 rationale for " +
				"this exact client shape (test/compliance/catalog/rfc9051/s9-syntax-security.ts).",
			notes:
				"Not IMAP-specific text (applies to MUA account setup generally, covering IMAP/POP/" +
				"Submission uniformly), retained in scope as it governs how an IMAP account's server " +
				"is discovered/configured.",
		},
		{
			id: "RFC8314-5.1-2",
			source: "RFC8314",
			section: "5.1",
			title: "MUAs using RFC 6186 config SHOULD ignore advertised services below minimum confidentiality absent explicit user override",
			text:
				"However, when using configuration information obtained via this " +
				"method, MUAs SHOULD ignore advertised services that do not " +
				"satisfy minimum confidentiality requirements, unless the user " +
				"has explicitly requested reduced confidentiality.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "capability-inventory",
			untestableRationale:
				"Conditional on the client first possessing the SRV-based auto-configuration affordance " +
				"of RFC8314-5.1-1, which this client does not implement (see that entry's rationale); a " +
				"duty conditioned on an absent capability has no exercise path.",
			notes:
				"Conditional: applies only when the MUA uses RFC 6186 SRV-derived configuration " +
				"information, and further conditioned on absence of explicit user override toward " +
				"reduced confidentiality (a user-intent-policy dimension layered on top of the " +
				"capability-inventory gate).",
		},
		{
			id: "RFC8314-5.1-3",
			source: "RFC8314",
			section: "5.1",
			title: "MUAs using RFC 6186 config SHOULD NOT auto-establish non-TLS configs when a TLS one is advertised",
			text:
				"When using configuration information per [RFC6186], MUAs SHOULD " +
				"NOT automatically establish new configurations that do not " +
				"require TLS for all servers, unless there are no advertised " +
				"configurations using TLS.",
			level: "SHOULD NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "capability-inventory",
			untestableRationale:
				"Same SRV-auto-configuration-affordance gate as RFC8314-5.1-1/-2: this client has no " +
				"autonomous 'establish a new configuration from SRV records' code path for the duty to " +
				"bind against.",
			notes:
				"Conditional: applies only when the MUA is auto-establishing configuration from RFC " +
				"6186 SRV records, an affordance this client does not implement.",
		},
		{
			id: "RFC8314-5.1-4",
			source: "RFC8314",
			section: "5.1",
			title: "MUA choosing a non-TLS RFC 6186 config SHOULD warn the user before authenticating",
			text:
				"If such a configuration is chosen, prior to attempting to " +
				"authenticate to the server or use the server for Message " +
				"Submission, the MUA SHOULD warn the user that traffic to that " +
				"server will not be encrypted and that it will therefore likely " +
				"be intercepted by unauthorized parties.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "capability-inventory",
			untestableRationale:
				"Downstream of RFC8314-5.1-3's SRV-auto-configuration gate: this client never " +
				"autonomously chooses a non-TLS configuration from SRV records (no such affordance " +
				"exists), so the warn-before-authenticating duty has no triggering state to observe.",
			notes: "Conditional: applies only after the (unimplemented) auto-configuration path of " +
				"RFC8314-5.1-3 selects a non-TLS configuration.",
		},
		{
			id: "RFC8314-5.1-5",
			source: "RFC8314",
			section: "5.1",
			title: "MUA establishing config from SRV records SHOULD verify DNSSEC signing or FQDN match",
			text:
				"When establishing a new configuration for connecting to an IMAP, " +
				"POP, or SMTP submission server, based on SRV records, an MUA " +
				"SHOULD verify that either (a) the SRV records are signed using " +
				"DNSSEC or (b) the target Fully Qualified Domain Name (FQDN) of " +
				"the SRV record matches the original server FQDN for which the " +
				"SRV queries were made.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "capability-inventory",
			untestableRationale:
				"Explicitly IMAP-naming duty, but gated on the same unimplemented SRV-based " +
				"configuration-establishment affordance as RFC8314-5.1-1 through -5.1-4.",
			notes:
				"Conditional: applies only when establishing configuration from SRV records, which " +
				"this client's host/port-supplied-by-caller architecture does not do.",
		},
		{
			id: "RFC8314-5.1-6",
			source: "RFC8314",
			section: "5.1",
			title: "MUA MUST NOT consult unsigned SRV records on every connection attempt",
			text:
				"An MUA MUST NOT consult SRV records to determine which servers " +
				"to use on every connection attempt, unless those SRV records " +
				"are signed by DNSSEC and have a valid signature.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "capability-inventory",
			untestableRationale:
				"A prohibition on a capability this client does not possess (per-connection SRV " +
				"consultation) is vacuously satisfied by the absence of that capability, and the " +
				"absence itself is a capability-inventory fact this harness cannot establish across the " +
				"whole configuration space (per the taxonomy's capability-inventory defining property).",
			notes:
				"Conditional: binds only if/when the MUA consults SRV records per connection attempt, " +
				"an affordance this client does not implement (host/port are always caller-supplied).",
		},
		{
			id: "RFC8314-5.1-7",
			source: "RFC8314",
			section: "5.1",
			title: "MUA MUST NOT test a Mail Account configuration by submitting credentials without a minimum-confidentiality TLS session",
			text:
				'an MUA MUST NOT attempt to "test" a particular Mail Account ' +
				"configuration by submitting the user's authentication credentials " +
				"to a server, unless a TLS session meeting minimum confidentiality " +
				"levels has been established with that server.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Conditional: binds when the client would submit credentials to test/validate a Mail " +
				"Account configuration. The account-configuration-'test' framing is an MUA-setup-flow " +
				"concept this headless library does not model as a distinct action, but the concrete wire " +
				"constraint it imposes — never sending authentication credentials to a server until a TLS " +
				"session meeting the minimum confidentiality level is established — is exactly the " +
				"observable no-credentials-before-TLS behavior already exercised by RFC8314-5.2-4 (MUST " +
				"NOT perform any operation other than capability discovery / STARTTLS before minimum " +
				"confidentiality is provided). Testable by the same mechanism as RFC8314-5.2-4: script a " +
				"plaintext pre-TLS server and assert the client never issues LOGIN/AUTHENTICATE " +
				"credential-bearing commands before TLS is negotiated. Cross-reference: RFC8314-5.2-4 is " +
				"the broader 'any operation' statement of this same duty; this §5.1 sentence is the " +
				"account-configuration-testing-specific restatement (source text opens 'Similarly, an MUA " +
				"MUST NOT ...', trimmed to the operative clause here). The verbatim source additionally " +
				"continues 'If minimum confidentiality requirements have not been satisfied, the MUA must " +
				"explicitly warn ...', a UI-presentation duty not extracted (delegated to the consuming " +
				"application, per RFC8314-5-1's rationale).",
		},

		// ── §5.2 Minimum Confidentiality Level ────────────────────────────────
		{
			id: "RFC8314-5.2-1",
			source: "RFC8314",
			section: "5.2",
			title: "MUAs SHOULD, by default, require a minimum level of confidentiality per account",
			text:
				"MUAs SHOULD, by default, require a minimum level of " +
				"confidentiality for services accessed by each account. For MUAs " +
				"supporting the ability to access multiple Mail Accounts, this " +
				"requirement SHOULD be configurable on a per-account basis.",
			level: "SHOULD",
			applicability: "always",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "capability-inventory",
			untestableRationale:
				"Binds the existence of a policy affordance ('a default minimum-confidentiality " +
				"requirement, configurable per account') at the MUA/account-management layer. This " +
				"headless library has no account/profile concept of its own (host, port, and TLS mode " +
				"are supplied per-connection by the caller via src/connection/types.ts options) and no " +
				"'default policy absent explicit configuration' state to observe — every connection's " +
				"security mode is the caller's explicit choice. Same pattern as the already-catalogued " +
				"RFC9051-11.2-2 rationale: the duty's escape hatch (caller-supplied configuration) is " +
				"unconditionally in effect for a library-shaped client, so there is no black-box " +
				"observable that separates a compliant default policy from its absence.",
			notes: "Cross-reference: RFC3501-6.2.1/RFC9051's cleartext-avoidance duties for LOGIN are " +
				"the closest already-catalogued analog of a 'minimum confidentiality' policy at the " +
				"single-command level; this entry is the broader account-level policy RFC 8314 adds.",
		},
		{
			id: "RFC8314-5.2-2",
			source: "RFC8314",
			section: "5.2",
			title: "Default minimum confidentiality MUST require cert validation and SHOULD require TLS 1.1+",
			text:
				"The default minimum expected level of confidentiality for all " +
				"new accounts MUST require successful validation of the server's " +
				"certificate and SHOULD require negotiation of TLS version 1.1 " +
				"or greater.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "capability-inventory",
			untestableRationale:
				"Conditional on the account-level 'default minimum confidentiality' policy affordance of " +
				"RFC8314-5.2-1, which this client does not implement as a distinct policy layer (see " +
				"that entry's rationale) — there is no 'new account' creation flow to observe a default " +
				"against.",
			notes:
				"Conditional: applies to 'new accounts' under a minimum-confidentiality default policy " +
				"this client does not model. The underlying cert-validation and TLS-1.1-floor content is " +
				"separately, and already, testable at the connection level via RFC9051-11.1-2/RFC8314-5-2 " +
				"(TLS 1.2 MUST, a stricter floor than this sentence's TLS 1.1 SHOULD) and the hostname/cert " +
				"entries cross-referenced at RFC8314-3.2-1 — this entry's own untestability is about the " +
				"account-policy framing, not the cert/TLS-version content itself.",
		},
		{
			id: "RFC8314-5.2-3",
			source: "RFC8314",
			section: "5.2",
			title: "MUA disabling minimum confidentiality MUST warn the user privacy is not assured",
			text:
				"MUAs MAY permit the user to disable this minimum confidentiality " +
				"requirement during initial account configuration or when " +
				"subsequently editing an account configuration but MUST warn " +
				"users that such a configuration will not assure privacy for " +
				"either passwords or messages.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "capability-inventory",
			untestableRationale:
				"Conditional on the same account-level minimum-confidentiality-policy affordance " +
				"(RFC8314-5.2-1) this client does not implement; there is no 'disable requirement' " +
				"account-configuration action to trigger the warning against.",
			notes:
				"Conditional: binds only when a client that has implemented the RFC8314-5.2-1 policy " +
				"affordance also permits the user to disable it.",
		},
		{
			id: "RFC8314-5.2-4",
			source: "RFC8314",
			section: "5.2",
			title: "MUA requiring minimum confidentiality MUST NOT perform non-discovery operations until it is met",
			text:
				"An MUA that is configured to require a minimum level of " +
				"confidentiality for a Mail Account MUST NOT attempt to perform " +
				"any operation other than capability discovery, or STARTTLS for " +
				"servers not using Implicit TLS, unless the minimum level of " +
				"confidentiality is provided by that connection.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Conditional: binds when the client is configured to require a minimum confidentiality " +
				"level (the broader account-policy affordance of RFC8314-5.2-1 is not modeled by this " +
				"library, but the concrete wire behavior this sentence constrains — issuing only " +
				"CAPABILITY/STARTTLS before TLS is established, never LOGIN/AUTHENTICATE/mailbox " +
				"commands over cleartext — is independently testable regardless of how 'minimum " +
				"confidentiality required' is configured, since this client always negotiates TLS before " +
				"issuing credential-bearing or mailbox commands when configured for STARTTLS/Implicit " +
				"TLS). Testable by scripting a plaintext pre-TLS server and asserting the client's only " +
				"pre-TLS commands are CAPABILITY and/or STARTTLS. Cross-reference: RFC3501-6.2.1's " +
				"cleartext-LOGIN-avoidance MUST/SHOULD-family duties and RFC9051's equivalent cover the " +
				"authentication-command half of this; this entry is the broader 'any operation' framing.",
		},
		{
			id: "RFC8314-5.2-5",
			source: "RFC8314",
			section: "5.2",
			title: "MUAs SHOULD NOT allow easy click-through access when minimum confidentiality is not met",
			text:
				'MUAs SHOULD NOT allow users to easily access or send mail via a ' +
				"connection, or authenticate to any service using a password, if " +
				"that account is configured to impose minimum confidentiality " +
				"requirements and that connection does not meet all of those " +
				"requirements.",
			level: "SHOULD NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "ui-presentation",
			untestableRationale:
				"'Allow users to easily access' describes a UI affordance (a 'click through' dialog, per " +
				"the RFC's own example) that this headless library has no equivalent of — it has no " +
				"user-facing dialog/confirmation surface, only the public logger callback and events. " +
				"Unlike the flipped RFC3501-7.1-1 ALERT duty, there is no discrete server-supplied " +
				"message to route through the logger here; the duty is about the absence/presence of an " +
				"application-level UI escape hatch, which is delegated to the consuming application by " +
				"this library's architecture.",
			notes:
				"Conditional: applies only to accounts configured to impose minimum confidentiality " +
				"requirements whose current connection does not meet them — itself gated on the " +
				"unimplemented account-policy affordance of RFC8314-5.2-1.",
		},
		{
			id: "RFC8314-5.2-6",
			source: "RFC8314",
			section: "5.2",
			title: "MUA without minimum confidentiality requirement SHOULD still attempt the most secure available means",
			text:
				"An MUA that is not configured to require a minimum level of " +
				"confidentiality for a Mail Account SHOULD still attempt to " +
				"connect to the services associated with that account using the " +
				"most secure means available, e.g., by using Implicit TLS or " +
				"STARTTLS.",
			level: "SHOULD",
			applicability: "always",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"'Most secure means available' is an internal preference-ordering decision the client " +
				"makes when the caller has not pinned a specific security mode; for this library, the " +
				"caller always explicitly selects the TLS mode via the TLSSetting configuration option " +
				"(src/connection/types.ts: 'off' | 'starttls' | 'on'), so the library never autonomously " +
				"chooses among Implicit TLS/STARTTLS/cleartext on the caller's behalf. A compliant " +
				"'always prefer the most secure means' internal default and a non-compliant one are " +
				"wire-indistinguishable once the caller has supplied an explicit TLSSetting, and there " +
				"is no 'no configuration supplied' state in which the library's own default-selection " +
				"logic could be observed choosing between modes.",
			notes:
				"Cross-reference: RFC9051-11.2-2 (SHOULD try both port 993 and 143 concurrently by " +
				"default) is the RFC 9051 elaboration of this same 'most secure means available by " +
				"default' preference, already catalogued untestable (user-intent-policy) for the " +
				"identical caller-supplies-configuration reason.",
		},

		// ── §5.3 Certificate Validation ───────────────────────────────────────
		{
			id: "RFC8314-5.3-1",
			source: "RFC8314",
			section: "5.3",
			title: "MUAs MUST validate TLS server certificates per RFC 7817 and PKIX",
			text:
				"MUAs MUST validate TLS server certificates according to " +
				"[RFC7817] and PKIX [RFC5280].",
			level: "MUST",
			applicability: "always",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"RFC 7817 and RFC 5280 (PKIX) are external documents out of this module's scope; their " +
				"concrete duties are already catalogued as testable at RFC9051-11.1-6/RFC3501-11.1-3 " +
				"(hostname/SAN/CN matching, exercised by the harness's wrong-host/san-only-match/" +
				"san-mismatch/multi-san/expired cert fixtures in test/compliance/harness/certs) and via " +
				"standard Node TLS chain-of-trust validation exercised whenever the harness presents an " +
				"untrusted or expired certificate. Cross-reference: near-duplicate of RFC8314-3.2-1's " +
				"'MUST implement the certificate validation mechanism described in [RFC7817]' clause; " +
				"kept as a separate entry because it appears in a distinct section (general MUA policy " +
				"vs. Implicit-TLS-IMAP-specific) and additionally cites PKIX/RFC 5280 by name, which " +
				"§3.2 does not.",
		},
		{
			id: "RFC8314-5.3-2",
			source: "RFC8314",
			section: "5.3",
			title: "MUAs MAY support DANE as an additional certificate-validation means",
			text:
				"MUAs MAY also support DNS-Based Authentication of Named Entities " +
				"(DANE) [RFC6698] as a means of validating server certificates in " +
				"order to meet minimum confidentiality requirements.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "capability-inventory",
			untestableRationale:
				"MAY-level permission asserting the possible existence of a DANE-validation affordance; " +
				"this client implements no DANE/TLSA-record support (no DNS lookups of any kind appear " +
				"in src/), and a MAY grants pure permission with no constraining envelope — absence is " +
				"as compliant as presence, so no black-box assertion has a pass/fail boundary.",
			notes: "Conditional: relevant only if the MUA chooses to support DANE at all.",
		},
		{
			id: "RFC8314-5.3-3",
			source: "RFC8314",
			section: "5.3",
			title: "MUA supporting certificate pinning MUST NOT count it toward minimum confidentiality",
			text:
				"MUAs MAY support the use of certificate pinning but MUST NOT " +
				"consider a connection in which the server's authenticity " +
				"relies on certificate pinning as providing the minimum level " +
				"of confidentiality.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "capability-inventory",
			untestableRationale:
				"Conditional on the client implementing certificate pinning at all (a MAY-gated " +
				"affordance this library does not implement — src/ performs standard PKI chain " +
				"validation with no persistent per-host trust-override store), and further conditioned " +
				"on the internal 'minimum confidentiality' policy determination of RFC8314-5.2-1, itself " +
				"untestable for this client shape. See RFC8314-5.4-* for the fuller certificate-pinning " +
				"entries this MUST NOT summarizes.",
		},

		// ── §5.4 Certificate Pinning ──────────────────────────────────────────
		{
			id: "RFC8314-5.4-1",
			source: "RFC8314",
			section: "5.4",
			title: "MUA MUST NOT offer certificate pinning except during Mail Account setup",
			text:
				"Certificate pinning is only appropriate during Mail Account " +
				"setup and MUST NOT be offered as an option in response to a " +
				"failed certificate validation for an existing Mail Account.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "capability-inventory",
			untestableRationale:
				"Conditional on the client implementing certificate pinning at all (see RFC8314-5.3-3); " +
				"this library implements no pinning affordance, offered at setup time or otherwise, so " +
				"there is no 'offer pinning' UI action to observe the absence or presence of, and no " +
				"'Mail Account setup' concept distinct from an ordinary connection attempt.",
			notes:
				"Context: this section's preceding sentence — 'In the event that the certificate does " +
				"not validate ... the MUA MAY offer to create a persistent binding between that " +
				"certificate and the saved hostname ... This is called \"certificate pinning\"' — is the " +
				"MAY-level permission that this and the following three entries constrain; it is not " +
				"itemized as its own entry because a bare MAY carries no independent pass/fail boundary " +
				"(see extractionNote).",
		},
		{
			id: "RFC8314-5.4-2",
			source: "RFC8314",
			section: "5.4",
			title: "MUA MUST NOT let a certificate pinned for one account validate connections for another",
			text:
				"An MUA that allows certificate pinning MUST NOT allow a " +
				"certificate pinned for one account to validate connections for " +
				"other accounts.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "capability-inventory",
			untestableRationale:
				"Conditional on the client implementing certificate pinning at all, which it does not " +
				"(see RFC8314-5.4-1); the duty additionally presupposes a multi-account model this " +
				"per-connection library has no equivalent of.",
			notes: "Conditional: binds only an MUA that allows certificate pinning.",
		},
		{
			id: "RFC8314-5.4-3",
			source: "RFC8314",
			section: "5.4",
			title: "MUA supporting certificate pinning MUST allow the user to undo a pin",
			text:
				"An MUA that allows certificate pinning MUST also allow a user " +
				"to undo the pinning, i.e., to revoke trust in a certificate " +
				"that has previously been pinned.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "capability-inventory",
			untestableRationale:
				"Conditional on the client implementing certificate pinning at all, which it does not " +
				"(see RFC8314-5.4-1); a revoke-pin affordance cannot be exercised or shown absent " +
				"without the pinning feature itself first existing.",
			notes: "Conditional: binds only an MUA that allows certificate pinning.",
		},
		{
			id: "RFC8314-5.4-4",
			source: "RFC8314",
			section: "5.4",
			title: "MUA MUST NOT indicate confidentiality is provided when authenticity relies on a pinned certificate",
			text:
				"Therefore, the use of a pinned certificate does not meet the " +
				"requirement for a minimum confidentiality level, and an MUA " +
				"MUST NOT indicate to the user that such confidentiality is " +
				"provided.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "ui-presentation",
			untestableRationale:
				"Compound gate: (a) conditional on the client implementing certificate pinning at all, " +
				"which it does not (see RFC8314-5.4-1), and (b) even if it did, 'indicate to the user' " +
				"describes the same UI-affordance category as RFC8314-5-1 (lock icon / confidentiality " +
				"indicator) that this headless library delegates to its consuming application, with no " +
				"discrete server-supplied event to route through the logger.",
			notes: "Conditional: binds only an MUA that allows certificate pinning and provides a " +
				"confidentiality-level UI indication in the first place (RFC8314-5-1).",
		},

		// ── §5.5 Client Certificate Authentication ────────────────────────────
		{
			id: "RFC8314-5.5-1",
			source: "RFC8314",
			section: "5.5",
			title: "MUAs MAY implement client certificate authentication on the Implicit TLS port",
			text:
				"MUAs MAY implement client certificate authentication on the " +
				"Implicit TLS port.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "capability-inventory",
			untestableRationale:
				"MAY-level permission with no constraining envelope, and this client implements no " +
				"TLS client-certificate authentication affordance at all (src/connection has no " +
				"client-cert configuration option) — absence is fully compliant with a MAY, and " +
				"establishing non-existence of the affordance is itself a capability-inventory fact " +
				"outside black-box reach.",
			notes: "Gates the three subsequent MUST/MUST NOT entries in this section, none of which " +
				"can be exercised absent this MAY-level affordance.",
		},
		{
			id: "RFC8314-5.5-2",
			source: "RFC8314",
			section: "5.5",
			title: "MUA MUST NOT provide a client certificate unless requested and authorized for that account",
			text:
				"An MUA MUST NOT provide a client certificate during the TLS " +
				"handshake unless the server requests one and the MUA has been " +
				"authorized to use that client certificate with that account.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "capability-inventory",
			untestableRationale:
				"Conditional on the client implementing client-certificate authentication at all (see " +
				"RFC8314-5.5-1), which it does not — there is no client-certificate-supplying code path " +
				"whose restraint could be observed or violated.",
			notes: "Conditional: binds only an MUA that implements client certificate authentication.",
		},
		{
			id: "RFC8314-5.5-3",
			source: "RFC8314",
			section: "5.5",
			title: "Installing a client cert for one account MUST NOT auto-authorize it for other accounts",
			text:
				"However, installing a client certificate for use with one " +
				"account MUST NOT automatically authorize the use of that " +
				"certificate with other accounts.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "capability-inventory",
			untestableRationale:
				"Conditional on client-certificate authentication support (RFC8314-5.5-1, unimplemented) " +
				"and a multi-account model this per-connection library has no equivalent of.",
			notes: "Conditional: binds only an MUA that implements client certificate authentication " +
				"across multiple accounts.",
		},
		{
			id: "RFC8314-5.5-4",
			source: "RFC8314",
			section: "5.5",
			title: "Client supporting client-cert auth on Implicit TLS MUST implement SASL EXTERNAL",
			text:
				"A client supporting client certificate authentication with " +
				"Implicit TLS MUST implement the SASL EXTERNAL mechanism " +
				"[RFC4422], using the appropriate authentication command " +
				"... AUTHENTICATE for IMAP [RFC3501]).",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "capability-inventory",
			untestableRationale:
				"Conditional on the client implementing client-certificate authentication at all (see " +
				"RFC8314-5.5-1); this client implements no client-certificate support and consequently " +
				"no SASL EXTERNAL mechanism (grepping src/ for SASL mechanism implementations shows " +
				"no EXTERNAL support), so the duty's trigger condition is never met and there is no " +
				"AUTHENTICATE EXTERNAL exchange to observe.",
			notes:
				"Elision: the quoted text omits the sentence's parenthetical enumeration of the " +
				"authentication command per protocol — '(AUTH for POP3 [RFC5034], AUTH for SMTP " +
				"Submission [RFC4954], or AUTHENTICATE for IMAP [RFC3501])' — trimming the POP3/SMTP " +
				"alternatives not relevant to this IMAP-scoped catalog while keeping the IMAP clause " +
				"verbatim. Cross-reference: RFC4422 (SASL) and the AUTHENTICATE command are already " +
				"covered generally by the RFC3501/RFC9051 AUTHENTICATE entries and by rfc4422.ts if/when " +
				"extracted; this entry is the RFC 8314-specific trigger condition (client-cert auth on " +
				"the Implicit TLS port implies SASL EXTERNAL support) rather than new AUTHENTICATE-syntax " +
				"content.",
		},
	],
};

export default rfc8314;
