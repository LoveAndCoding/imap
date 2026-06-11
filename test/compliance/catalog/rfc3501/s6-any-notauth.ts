import type { SpecRequirement } from "../types";

export const note =
	"§6.1.1: 1 entry (MUST implement STARTTLS/LOGINDISABLED/AUTH=PLAIN capabilities). " +
	"§6.1.2: 1 entry (Phase 0 seed, periodic-poll MAY); no additional client-binding normatives in NOOP. " +
	"§6.1.3: 0 client-binding normative statements (server duties only). " +
	"§6.2 preamble: 0 client-binding normative statements (state-machine prose, no RFC 2119 keywords). " +
	"§6.2.1: 3 entries (Phase 0 seeds); no additional client-binding normatives found. " +
	"§6.2.2: 5 entries (MUST implement AUTHENTICATE; cancellation format; SHOULD implement additional SASL; " +
	"CAPABILITY re-issue after security-layer AUTHENTICATE; MAY retry after NO). " +
	"§6.2.3: 3 entries (MUST NOT LOGIN when LOGINDISABLED; SHOULD NOT use LOGIN except as last resort; " +
	"client implementations SHOULD have means to disable automatic LOGIN).";

export const requirements: SpecRequirement[] = [
	// ── §6.1.1 ────────────────────────────────────────────────────────────────
	{
		id: "RFC3501-6.1.1-1",
		source: "RFC3501",
		section: "6.1.1",
		title: "Client MUST implement STARTTLS, LOGINDISABLED, and AUTH=PLAIN capabilities",
		text:
			"Client and server implementations MUST implement the STARTTLS, LOGINDISABLED, and AUTH=PLAIN (described in [IMAP-TLS]) capabilities.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"The sentence binds both client and server. Client duty: correctly recognise and act on " +
			"STARTTLS, LOGINDISABLED, and AUTH=PLAIN capability tokens when present in a CAPABILITY response.",
	},

	// ── §6.1.2 ────────────────────────────────────────────────────────────────
	{
		id: "RFC3501-6.1.2-1",
		source: "RFC3501",
		section: "6.1.2",
		title: "NOOP usable as a periodic poll",
		text:
			"Since any command can return a status update as untagged data, the NOOP command can be used as a periodic poll for new messages or message status updates during a period of inactivity (this is the preferred method to do this).",
		level: "MAY",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"Capability statement; tested as 'client offers a way to issue NOOP'. " +
			"Currently expected to fail as unimplemented (no public NOOP surface).",
	},

	// ── §6.2.1 ────────────────────────────────────────────────────────────────
	{
		id: "RFC3501-6.2.1-1",
		source: "RFC3501",
		section: "6.2.1",
		title: "Client discards cached capabilities after STARTTLS",
		text:
			"Once [TLS] has been started, the client MUST discard cached information about server capabilities and SHOULD re-issue the CAPABILITY command.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes: "MUST half of the sentence (discard cached capabilities).",
	},
	{
		id: "RFC3501-6.2.1-2",
		source: "RFC3501",
		section: "6.2.1",
		title: "Client re-issues CAPABILITY after STARTTLS",
		text:
			"Once [TLS] has been started, the client MUST discard cached information about server capabilities and SHOULD re-issue the CAPABILITY command.",
		level: "SHOULD",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes: "SHOULD half of the sentence (re-issue CAPABILITY).",
	},
	{
		id: "RFC3501-6.2.1-3",
		source: "RFC3501",
		section: "6.2.1",
		title: "Client MUST NOT send further commands until TLS negotiation is complete",
		text:
			"A [TLS] negotiation begins immediately after the CRLF at the end of the tagged OK response from the server.  Once a client issues a STARTTLS command, it MUST NOT issue further commands until a server response is seen and the [TLS] negotiation is complete.",
		level: "MUST NOT",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"Two contiguous sentences from §6.2.1. The first establishes when TLS " +
			"begins; the second is the explicit MUST NOT keyword binding the client. " +
			"Level updated from MUST to MUST NOT to reflect the actual 2119 keyword " +
			"present in the text.",
	},

	// ── §6.2.2 ────────────────────────────────────────────────────────────────
	{
		id: "RFC3501-6.2.2-1",
		source: "RFC3501",
		section: "6.2.2",
		title: "Client MUST implement the AUTHENTICATE command",
		text:
			"While client and server implementations MUST implement the AUTHENTICATE command itself, it is not required to implement any authentication mechanisms other than the PLAIN mechanism described in [IMAP-TLS].",
		level: "MUST",
		applicability: "always",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"The sentence binds both client and server. Client duty: support sending the AUTHENTICATE " +
			"command. The carve-out ('not required to implement any authentication mechanisms other than " +
			"PLAIN') narrows the mechanism obligation but not the command obligation.",
	},
	{
		id: "RFC3501-6.2.2-2",
		source: "RFC3501",
		section: "6.2.2",
		title: "Client cancels AUTHENTICATE exchange by sending a single '*' line",
		text:
			"If the client wishes to cancel an authentication exchange, it issues a line consisting of a single \"*\".",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"No explicit RFC 2119 keyword in this sentence; however, the sentence specifies the " +
			"exclusive protocol mechanism for cancellation. Judgment: implicit MUST — there is no " +
			"alternative; a client that cancels in any other way violates the exchange protocol. " +
			"Applies only when the client chooses to cancel an in-progress AUTHENTICATE exchange.",
	},
	{
		id: "RFC3501-6.2.2-3",
		source: "RFC3501",
		section: "6.2.2",
		title: "Client SHOULD implement additional SASL mechanisms beyond PLAIN",
		text:
			"Client and server implementations SHOULD implement additional [SASL] mechanisms that do not use plaintext passwords, such the GSSAPI mechanism described in [SASL] and/or the [DIGEST-MD5] mechanism.",
		level: "SHOULD",
		applicability: "always",
		profiles: ["rev1"],
		testability: "untestable",
		untestableRationale:
			"Which specific SASL mechanisms are supported is a deployment/configuration choice; " +
			"black-box testing cannot determine whether the client has implemented 'additional' non-plaintext " +
			"mechanisms or merely chosen not to advertise them in a given test environment.",
	},
	{
		id: "RFC3501-6.2.2-4",
		source: "RFC3501",
		section: "6.2.2",
		title: "Client MUST re-issue CAPABILITY after AUTHENTICATE when security layer was negotiated",
		text:
			"This should only be done if a security layer was not negotiated by the AUTHENTICATE command, because the tagged OK response as part of an AUTHENTICATE command is not protected by encryption/integrity checking. [SASL] requires the client to re-issue a CAPABILITY command in this case.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"'[SASL] requires' is the normative basis; RFC 3501 incorporates this by reference. " +
			"'This case' = when a security layer was negotiated via AUTHENTICATE. The obligation is " +
			"that the client MUST re-issue CAPABILITY after a security-layer-negotiating AUTHENTICATE " +
			"rather than relying on any CAPABILITY code in the OK response. Level assigned MUST because " +
			"it is a SASL-normative requirement explicitly called out in the RFC text.",
	},
	{
		id: "RFC3501-6.2.2-5",
		source: "RFC3501",
		section: "6.2.2",
		title: "Client MAY retry authentication after AUTHENTICATE NO response",
		text:
			"If an AUTHENTICATE command fails with a NO response, the client MAY try another authentication mechanism by issuing another AUTHENTICATE command.  It MAY also attempt to authenticate by using the LOGIN command (see section 6.2.3 for more detail).  In other words, the client MAY request authentication types in decreasing order of preference, with the LOGIN command as a last resort.",
		level: "MAY",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"Three consecutive sentences all bearing MAY; extracted as one entry because they form a " +
			"single cohesive policy (retry strategy after failed AUTHENTICATE). Applies when an " +
			"AUTHENTICATE attempt receives a tagged NO response.",
	},

	// ── §6.2.3 ────────────────────────────────────────────────────────────────
	{
		id: "RFC3501-6.2.3-1",
		source: "RFC3501",
		section: "6.2.3",
		title: "Client MUST NOT send LOGIN when LOGINDISABLED is advertised",
		text:
			"A client implementation MUST NOT send a LOGIN command if the LOGINDISABLED capability is advertised.",
		level: "MUST NOT",
		applicability: "always",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"Unconditional applicability: whenever the server advertises LOGINDISABLED in its " +
			"CAPABILITY response the client is absolutely prohibited from issuing LOGIN, regardless " +
			"of any other state.",
	},
	{
		id: "RFC3501-6.2.3-2",
		source: "RFC3501",
		section: "6.2.3",
		title: "Client SHOULD NOT use LOGIN except as a last resort",
		text:
			"The LOGIN command SHOULD NOT be used except as a last resort, and it is recommended that client implementations have a means to disable any automatic use of the LOGIN command.",
		level: "SHOULD NOT",
		applicability: "always",
		profiles: ["rev1"],
		testability: "untestable",
		untestableRationale:
			"'Last resort' is a policy judgment about the client's authentication preference ordering " +
			"which cannot be observed in a single black-box exchange — a client that always offers " +
			"LOGIN immediately might still be compliant if no other mechanisms were available, and " +
			"a test harness cannot distinguish intentional last-resort use from indiscriminate use.",
		notes: "Covers both the SHOULD NOT keyword and the 'recommended ... means to disable' clause in the same sentence.",
	},
	{
		id: "RFC3501-6.2.3-3",
		source: "RFC3501",
		section: "6.2.3",
		title: "Client implementations SHOULD have a means to disable automatic LOGIN",
		text:
			"it is recommended that client implementations have a means to disable any automatic use of the LOGIN command.",
		level: "SHOULD",
		applicability: "always",
		profiles: ["rev1"],
		testability: "untestable",
		untestableRationale:
			"This is a requirement about the client's configuration/UI surface ('have a means to " +
			"disable'), not about observable wire behavior. Black-box protocol testing cannot verify " +
			"whether such a configuration option exists in the implementation.",
		notes:
			"'It is recommended' is lowercase prose equivalent to SHOULD per RFC 2119 §6. " +
			"This sentence appears in the same clause as the SHOULD NOT in RFC3501-6.2.3-2 but " +
			"expresses a distinct, independently assessable obligation (existence of a disable mechanism).",
	},
];
