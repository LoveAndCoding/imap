import type { SpecRequirement } from "../types";

export const note =
	"§6.1.1: 2 entries (MUST implement STARTTLS/LOGINDISABLED on cleartext ports; MUST implement " +
	"AUTH=PLAIN on both cleartext and Implicit TLS ports — rev2 splits the single RFC3501 sentence " +
	"into two and adds explicit cleartext/Implicit-TLS port qualifiers). " +
	"§6.1.2: 1 entry (NOOP usable as periodic poll; rev2 text cross-references IDLE §6.3.13). " +
	"§6.1.3: 0 client-binding normative statements (server duty: MUST send BYE before tagged OK). " +
	"§6.2 preamble: 0 client-binding normative statements (state-machine prose, ANONYMOUS access is a " +
	"server MAY, no RFC 2119 keyword binds the client). " +
	"§6.2.1: 3 entries (MUST NOT issue further commands until TLS negotiation is complete; MUST discard " +
	"cached capabilities after STARTTLS; SHOULD re-issue CAPABILITY after STARTTLS). " +
	"§6.2.2: 6 entries (MUST implement AUTHENTICATE; cancellation format; SASL initial-response base64 " +
	"encoding MUSTs — rev2 makes SASL-IR core protocol text rather than a separate extension; SHOULD " +
	"implement additional SASL mechanisms — rev2 recommends GSSAPI/RFC4752, SCRAM-SHA-256(-PLUS), and " +
	"EXTERNAL rather than RFC3501's GSSAPI/DIGEST-MD5; MUST re-issue CAPABILITY after a security-layer " +
	"AUTHENTICATE; MAY retry another mechanism or LOGIN after a NO response). " +
	"§6.2.3: 4 entries (SHOULD NOT use LOGIN except as last resort; SHOULD have a means to disable " +
	"automatic LOGIN; MUST NOT use LOGIN on unsecure networks — new explicit MUST NOT in rev2, RFC3501 " +
	"carried only an unqualified Note on this point; MUST NOT LOGIN when LOGINDISABLED is advertised).";

export const requirements: SpecRequirement[] = [
	// ── §6.1.1 ────────────────────────────────────────────────────────────────
	{
		id: "RFC9051-6.1.1-1",
		source: "RFC9051",
		section: "6.1.1",
		title: "Client MUST implement STARTTLS and LOGINDISABLED capabilities on cleartext ports",
		text:
			"Client and server implementations MUST implement the STARTTLS (Section 6.2.1) and LOGINDISABLED capabilities on cleartext ports.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"The sentence binds both client and server. Client duty: correctly recognise and act on " +
			"STARTTLS and LOGINDISABLED capability tokens when present in a CAPABILITY response on a " +
			"cleartext port. Rev2 delta vs RFC3501-6.1.1-1: RFC3501 bundled STARTTLS, LOGINDISABLED, and " +
			"AUTH=PLAIN into a single undifferentiated MUST sentence; rev2 splits the obligation into two " +
			"sentences and scopes this one to cleartext ports specifically (see RFC9051-6.1.1-2 for the " +
			"AUTH=PLAIN half, now scoped to both cleartext and Implicit TLS ports).",
	},
	{
		id: "RFC9051-6.1.1-2",
		source: "RFC9051",
		section: "6.1.1",
		title: "Client MUST implement AUTH=PLAIN capability on both cleartext and Implicit TLS ports",
		text:
			"Client and server implementations MUST also implement AUTH=PLAIN (described in [PLAIN]) capability on both cleartext and Implicit TLS ports.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"The sentence binds both client and server. Client duty: correctly recognise and act on the " +
			"AUTH=PLAIN capability token. Rev2 delta: the reference target changed from [IMAP-TLS] (RFC3501) " +
			"to [PLAIN] (RFC 4616), and the port scope is now explicit ('both cleartext and Implicit TLS " +
			"ports') where RFC3501 had no port qualifier at all — reflecting rev2's formal recognition of " +
			"Implicit TLS ports (RFC 8314) alongside STARTTLS.",
	},

	// ── §6.1.2 ────────────────────────────────────────────────────────────────
	{
		id: "RFC9051-6.1.2-1",
		source: "RFC9051",
		section: "6.1.2",
		title: "NOOP usable as a periodic poll",
		text:
			"Since any command can return a status update as untagged data, the NOOP command can be used as a periodic poll for new messages or message status updates during a period of inactivity (the IDLE command; see Section 6.3.13) should be used instead of NOOP if real-time updates to mailbox state are desirable).",
		level: "MAY",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"Capability statement; tested as 'client offers a way to issue NOOP'. " +
			"Currently expected to fail as unimplemented (no public NOOP surface), matching " +
			"RFC3501-6.1.2-1. Rev2 delta: the sentence now parenthetically cross-references the IDLE " +
			"command (§6.3.13) as the preferred mechanism for real-time updates, in place of RFC3501's " +
			"'this is the preferred method' framing of NOOP-as-poll. The verbatim RFC text has an internal " +
			"parenthesis-nesting inconsistency (the '(the IDLE command...)' aside is not properly closed " +
			"before 'should be used instead of NOOP' and a stray ')' appears at the end); reproduced here " +
			"exactly as published, per the verbatim-text rule.",
	},

	// ── §6.2.1 ────────────────────────────────────────────────────────────────
	{
		id: "RFC9051-6.2.1-1",
		source: "RFC9051",
		section: "6.2.1",
		title: "Client MUST NOT send further commands until TLS negotiation is complete",
		text:
			"Once a client issues a STARTTLS command, it MUST NOT issue further commands until a server response is seen and the TLS negotiation is complete.",
		level: "MUST NOT",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"Matches RFC3501-6.2.1-3's MUST NOT half. Rev2 delta: the sentence drops the preceding " +
			"'[TLS] negotiation begins immediately after the CRLF...' lead-in as a separate clause (moved " +
			"earlier in the paragraph and now cites [TLS-1.3] instead of the generic [TLS] reference), so " +
			"only the MUST NOT sentence itself is extracted here.",
	},
	{
		id: "RFC9051-6.2.1-2",
		source: "RFC9051",
		section: "6.2.1",
		title: "Client discards cached capabilities after STARTTLS",
		text:
			"Once TLS has been started, the client MUST discard cached information about server capabilities and SHOULD reissue the CAPABILITY command.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"MUST half of the sentence (discard cached capabilities). Matches RFC3501-6.2.1-1. Rev2 " +
			"spells 'reissue' as one word where RFC3501 used 're-issue'; otherwise the clause is unchanged.",
	},
	{
		id: "RFC9051-6.2.1-3",
		source: "RFC9051",
		section: "6.2.1",
		title: "Client re-issues CAPABILITY after STARTTLS",
		text:
			"Once TLS has been started, the client MUST discard cached information about server capabilities and SHOULD reissue the CAPABILITY command.",
		level: "SHOULD",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes: "SHOULD half of the sentence (reissue CAPABILITY). Matches RFC3501-6.2.1-2.",
	},

	// ── §6.2.2 ────────────────────────────────────────────────────────────────
	{
		id: "RFC9051-6.2.2-1",
		source: "RFC9051",
		section: "6.2.2",
		title: "Client MUST implement the AUTHENTICATE command",
		text:
			"While client and server implementations MUST implement the AUTHENTICATE command itself, it is not required to implement any authentication mechanisms other than the PLAIN mechanism described in [PLAIN].",
		level: "MUST",
		applicability: "always",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"The sentence binds both client and server. Client duty: support sending the AUTHENTICATE " +
			"command. The carve-out ('not required to implement any authentication mechanisms other than " +
			"PLAIN') narrows the mechanism obligation but not the command obligation. Matches " +
			"RFC3501-6.2.2-1; rev2 delta is only the reference target, [PLAIN] (RFC 4616) in place of " +
			"RFC3501's [IMAP-TLS].",
	},
	{
		id: "RFC9051-6.2.2-2",
		source: "RFC9051",
		section: "6.2.2",
		title: "Client cancels AUTHENTICATE exchange by sending a single '*' line",
		text:
			"If the client wishes to cancel an authentication exchange, it issues a line consisting of a single \"*\".",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"No explicit RFC 2119 keyword in this sentence; however, the sentence specifies the " +
			"exclusive protocol mechanism for cancellation, and the following sentence confirms the server " +
			"MUST reject such a response with tagged BAD — establishing this as the binding wire format. " +
			"Judgment: implicit MUST — there is no alternative; a client that cancels in any other way " +
			"violates the exchange protocol. Applies only when the client chooses to cancel an in-progress " +
			"AUTHENTICATE exchange. Matches RFC3501-6.2.2-2 verbatim (unchanged wording between revisions).",
	},
	{
		id: "RFC9051-6.2.2-3",
		source: "RFC9051",
		section: "6.2.2",
		title: "Client MUST encode the SASL initial response as base64 and use a pad character for zero-length responses",
		text:
			"As with any other client response, the initial response MUST be encoded as base64. It also MUST be transmitted outside of a quoted string or literal. To send a zero-length initial response, the client MUST send a single pad character (\"=\").",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"New in rev2: RFC3501 (and its separate SASL-IR extension, RFC 4959) treated the initial " +
			"response as an optional add-on; RFC 9051 folds SASL-IR into the core AUTHENTICATE command text " +
			"and states these three MUSTs directly. Applies only when the client sends an initial response " +
			"as part of AUTHENTICATE (the initial response itself remains OPTIONAL per the command's " +
			"Arguments listing), hence 'conditional' applicability — but whenever a client does send one, " +
			"these encoding rules bind unconditionally. Three contiguous sentences extracted as one entry " +
			"because they form a single cohesive encoding rule for the same wire object (the initial-response " +
			"string).",
	},
	{
		id: "RFC9051-6.2.2-4",
		source: "RFC9051",
		section: "6.2.2",
		title: "Client SHOULD implement additional SASL mechanisms beyond PLAIN",
		text:
			"Client and server implementations SHOULD implement additional [SASL] mechanisms that do not use plaintext passwords, such as the GSSAPI mechanism described in [RFC4752], the SCRAM-SHA-256/SCRAM-SHA-256-PLUS [SCRAM-SHA-256] mechanisms, and/or the EXTERNAL [SASL] mechanism for mutual TLS authentication.",
		level: "SHOULD",
		applicability: "always",
		profiles: ["rev2"],
		testability: "untestable",
		untestableTheme: "capability-inventory",
		untestableRationale:
			"Which specific SASL mechanisms are supported is a deployment/configuration choice; " +
			"black-box testing cannot determine whether the client has implemented 'additional' non-plaintext " +
			"mechanisms or merely chosen not to advertise them in a given test environment.",
		notes:
			"Matches RFC3501-6.2.2-3's untestability determination (same theme, same reasoning). Rev2 " +
			"delta: the recommended mechanism list changed from 'GSSAPI and/or DIGEST-MD5' (RFC3501, " +
			"referencing [SASL] and [DIGEST-MD5]) to 'GSSAPI ([RFC4752]), SCRAM-SHA-256/SCRAM-SHA-256-PLUS, " +
			"and/or EXTERNAL' — DIGEST-MD5 is dropped (deprecated for plaintext-equivalent weaknesses) and " +
			"SCRAM-SHA-256(-PLUS) and EXTERNAL are added. This sentence appears standalone in rev2's body " +
			"text (not nested inside the server-configuration 'Note:' as in RFC3501), but the client-facing " +
			"obligation is otherwise the same.",
	},
	{
		id: "RFC9051-6.2.2-5",
		source: "RFC9051",
		section: "6.2.2",
		title: "Client MUST re-issue CAPABILITY after AUTHENTICATE when security layer was negotiated",
		text:
			"This should only be done if a security layer was not negotiated by the AUTHENTICATE command, because the tagged OK response as part of an AUTHENTICATE command is not protected by encryption/integrity checking. [SASL] requires the client to re-issue a CAPABILITY command in this case.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"'[SASL] requires' is the normative basis; RFC 9051 incorporates this by reference, same as " +
			"RFC3501-6.2.2-4. 'This case' = when a security layer was negotiated via AUTHENTICATE. The " +
			"obligation is that the client MUST re-issue CAPABILITY after a security-layer-negotiating " +
			"AUTHENTICATE rather than relying on any CAPABILITY response code in the OK response. Level " +
			"assigned MUST because it is a SASL-normative requirement explicitly called out in the RFC " +
			"text. Wording is verbatim-identical to RFC3501-6.2.2-4 apart from the preceding sentence's " +
			"subject (a server MAY include a CAPABILITY response code, vs RFC3501's equivalent framing).",
	},
	{
		id: "RFC9051-6.2.2-6",
		source: "RFC9051",
		section: "6.2.2",
		title: "Client MAY retry authentication after AUTHENTICATE NO response",
		text:
			"If an AUTHENTICATE command fails with a NO response, the client MAY try another authentication mechanism by issuing another AUTHENTICATE command. It MAY also attempt to authenticate by using the LOGIN command (see Section 6.2.3 for more detail). In other words, the client MAY request authentication types in decreasing order of preference, with the LOGIN command as a last resort.",
		level: "MAY",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"Three consecutive sentences all bearing MAY; extracted as one entry because they form a " +
			"single cohesive policy (retry strategy after failed AUTHENTICATE). Applies when an " +
			"AUTHENTICATE attempt receives a tagged NO response. Matches RFC3501-6.2.2-5 verbatim apart " +
			"from the section cross-reference (6.2.3 in both, section numbering unchanged).",
	},

	// ── §6.2.3 ────────────────────────────────────────────────────────────────
	{
		id: "RFC9051-6.2.3-1",
		source: "RFC9051",
		section: "6.2.3",
		title: "Client SHOULD NOT use LOGIN except as a last resort",
		text:
			"The LOGIN command SHOULD NOT be used except as a last resort (after attempting and failing to authenticate using the AUTHENTICATE command one or more times), and it is recommended that client implementations have a means to disable any automatic use of the LOGIN command.",
		level: "SHOULD NOT",
		applicability: "always",
		profiles: ["rev2"],
		testability: "untestable",
		untestableTheme: "user-intent-policy",
		untestableRationale:
			"'Last resort' is a policy judgment about the client's authentication preference ordering " +
			"which cannot be observed in a single black-box exchange — a client that always offers " +
			"LOGIN immediately might still be compliant if no other mechanisms were available, and " +
			"a test harness cannot distinguish intentional last-resort use from indiscriminate use.",
		notes:
			"Covers both the SHOULD NOT keyword and the 'recommended ... means to disable' clause in the " +
			"same sentence, matching RFC3501-6.2.3-2. Rev2 delta: the parenthetical " +
			"'(after attempting and failing to authenticate using the AUTHENTICATE command one or more " +
			"times)' is new, making explicit what RFC3501 left implicit about what 'last resort' means.",
	},
	{
		id: "RFC9051-6.2.3-2",
		source: "RFC9051",
		section: "6.2.3",
		title: "Client implementations SHOULD have a means to disable automatic LOGIN",
		text:
			"...it is recommended that client implementations have a means to disable any automatic use of the LOGIN command.",
		level: "SHOULD",
		applicability: "always",
		profiles: ["rev2"],
		testability: "untestable",
		untestableTheme: "capability-inventory",
		untestableRationale:
			"This is a requirement about the client's configuration/UI surface ('have a means to " +
			"disable'), not about observable wire behavior. A behavioral test could only exercise a " +
			"public configuration affordance that actually exists (set the disable option, observe no " +
			"LOGIN on the wire); the requirement instead asserts the EXISTENCE of such an affordance, " +
			"which is an API-inventory fact a black-box protocol exchange cannot establish.",
		notes:
			"'It is recommended' is lowercase prose equivalent to SHOULD per RFC 2119 §6. " +
			"This sentence appears in the same clause as the SHOULD NOT in RFC9051-6.2.3-1 but " +
			"expresses a distinct, independently assessable obligation (existence of a disable mechanism), " +
			"matching RFC3501-6.2.3-3's determination and elision pattern.",
	},
	{
		id: "RFC9051-6.2.3-3",
		source: "RFC9051",
		section: "6.2.3",
		title: "Clients MUST NOT use LOGIN on unsecure networks",
		text: "For that reason, clients MUST NOT use LOGIN on unsecure networks.",
		level: "MUST NOT",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "untestable",
		untestableTheme: "internal-decision",
		untestableRationale:
			"'Unsecure network' is a deployment-environment property with no wire signature: " +
			"plaintext-at-the-socket does not imply an unsecure network (localhost connections, trusted " +
			"LANs, VPN tunnels, and TLS-terminating proxies all present a plaintext socket over a secure " +
			"path). A plaintext LOGIN on a trusted network is fully compliant and produces a wire trace " +
			"indistinguishable from a violating plaintext LOGIN on the open Internet, so a black-box " +
			"harness that withholds STARTTLS/Implicit TLS cannot construct 'an unsecure network' — it can " +
			"only construct a plaintext socket, whose security is the deployment's fact, not the wire's. " +
			"The enforceable half of this concern is the LOGINDISABLED prohibition (RFC9051-6.2.3-4), " +
			"which is wire-observable and separately catalogued.",
		notes:
			"New explicit MUST NOT in rev2. RFC3501's equivalent text was an unqualified Note ('Use of " +
			"the LOGIN command over an insecure network (such as the Internet) is a security risk...') with " +
			"no RFC 2119 keyword, and was not previously catalogued as a distinct RFC3501 entry (no match " +
			"found for 'unsecure networks' / 'insecure network' in the RFC3501 catalog module). RFC 9051 " +
			"promotes this to a binding MUST NOT: 'For that reason' refers back to the preceding sentence " +
			"identifying that anyone monitoring network traffic can obtain plaintext passwords sent via " +
			"LOGIN. Applicability judged 'conditional' (binds only when the client is on, or cannot confirm " +
			"it is not on, an unsecure network). Distinct from the unobservable 'last resort' " +
			"preference-ordering judgment in RFC9051-6.2.3-1, but likewise untestable — see the rationale.",
	},
	{
		id: "RFC9051-6.2.3-4",
		source: "RFC9051",
		section: "6.2.3",
		title: "Client MUST NOT send LOGIN when LOGINDISABLED is advertised",
		text:
			"A client implementation MUST NOT send a LOGIN command if the LOGINDISABLED capability is advertised.",
		level: "MUST NOT",
		applicability: "always",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"Unconditional applicability: whenever the server advertises LOGINDISABLED in its " +
			"CAPABILITY response the client is absolutely prohibited from issuing LOGIN, regardless " +
			"of any other state. Matches RFC3501-6.2.3-1 verbatim (unchanged wording between revisions). " +
			"Cross-reference: RFC 9051 states this same rule twice with different wording — here in " +
			"§6.2.3 and in §7.2.2 for the CAPABILITY response description; the §7.2.2 occurrence belongs " +
			"to a different catalog section (Phase 2 scope boundary: this file covers §6.1/§6.2 only).",
	},
];
