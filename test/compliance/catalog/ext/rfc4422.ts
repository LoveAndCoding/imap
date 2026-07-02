import type { CatalogModule } from "../types";

const rfc4422: CatalogModule = {
	source: "RFC4422",
	extractionNote:
		"Phase 3 extraction. Scope: the CLIENT-binding portions of the SASL framework as used by " +
		"IMAP AUTHENTICATE (RFC 3501 §6.2.2 / RFC 9051 §6.2.2, both of which incorporate [SASL] i.e. " +
		"this RFC by reference; RFC 4959 layers the SASL-IR initial-response optimization on top). " +
		"§1 Introduction, §1.1-1.3, §2 Identity Concepts: reviewed, no client-binding normative text " +
		"— scene-setting, document-audience notes, and identity-concept vocabulary (authentication " +
		"identity vs. authorization identity) with no RFC 2119 keyword binding client behavior. " +
		"§3 The Authentication Exchange: 1 entry (RFC4422-3-1, client MUST NOT send an initial " +
		"response where the mechanism is not client-first — the four preceding illustration diagrams " +
		"are exchange-shape reference material with no independent normative content of their own). " +
		"§3.1 Mechanism Naming: 1 entry (RFC4422-3.1-1, mechanism-name syntax the client MUST rely on " +
		"when matching/selecting an advertised mechanism string); registration procedure in the same " +
		"section is IANA/mechanism-designer process, skipped. " +
		"§3.2 Mechanism Negotiation: 1 entry (RFC4422-3.2-1, client selects the 'best' supported/" +
		"suitable mechanism from the server's advertised list) plus a skip note — the downgrade-" +
		"detection facility itself is a protocol-designer duty (§4 item 2), not a client obligation, " +
		"so only the client's selection behavior is extracted here. " +
		"§3.3 Request Authentication Exchange: 1 entry (RFC4422-3.3-1, client sends the mechanism " +
		"name to initiate the exchange, optionally with an initial response when the mechanism and " +
		"protocol both allow it). " +
		"§3.4 Challenges and Responses: 1 entry (RFC4422-3.4-1, client's two legal reactions to a " +
		"challenge: respond or abort) — the preceding paragraph enumerating what a mechanism 'may' " +
		"accomplish through challenges/responses is mechanism-designer descriptive text, skipped. " +
		"§3.4.1 Authorization Identity String: 2 entries (RFC4422-3.4.1-1 NUL exclusion + absent/" +
		"empty equivalence; RFC4422-3.4.1-2 non-empty string requests a specific identity) binding " +
		"the client whenever it constructs an authorization identity string. " +
		"§3.5 Aborting Authentication Exchanges: 1 entry (RFC4422-3.5-1, the client aborts by sending " +
		"a protocol-specific message — the concrete IMAP realization is the '*' line of RFC 3501/9051 " +
		"§6.2.2, cross-referenced in the entry). " +
		"§3.6 Authentication Outcome: 1 entry (RFC4422-3.6-1, client installs the negotiated security " +
		"layer upon receipt of a successful outcome). The outcome-message content requirements (what " +
		"makes an outcome unsuccessful, the optional additional-data field, the server-configuration " +
		"guidance on not distinguishing invalid-user from invalid-credentials) are server-side/" +
		"protocol-message-design duties and are skipped. " +
		"§3.7 Security Layers: 3 entries (RFC4422-3.7-1 MUST close the connection on encode/decode " +
		"failure of the security layer, graded MUST/SHOULD-graceful; RFC4422-3.7-2 outgoing buffer " +
		"MUST NOT exceed the peer's negotiated maximum size; RFC4422-3.7-3 SHOULD close the connection " +
		"on receipt of an oversized length field). The buffer-framing description (four-octet length " +
		"prefix) and 'remains in effect until...' persistence description are protocol-mechanics " +
		"context absorbed into the MUST-NOT-exceed entry's text where load-bearing, otherwise skipped " +
		"as non-normative scene-setting. " +
		"§3.8 Multiple Authentications: reviewed, no client-binding entry — every normative statement " +
		"here binds the protocol's technical specification (what it must permit/detail) or describes " +
		"server-side session-state consequences; IMAP's own multiple-authentication posture is out of " +
		"RFC 4422's scope to mandate. Skipped. " +
		"§4 Protocol Requirements, §5 Mechanism Requirements: reviewed in full and skipped — these " +
		"sections exclusively address protocol designers ('its specification MUST supply...') and " +
		"mechanism designers ('SASL mechanism specifications MUST supply...'), i.e. the authors of " +
		"documents like RFC 3501/9051 and of individual SASL mechanisms, not client implementors. " +
		"RFC 3501/9051 already discharge the protocol-designer duties (message formats, initial- " +
		"response field, abort facility via '*', etc.); those discharged duties are catalogued as " +
		"client-observable requirements in the rfc3501/rfc9051 modules, not duplicated here. " +
		"§6 Security Considerations: reviewed section by section. §6.1.1 Hijack Attacks: 1 entry " +
		"(RFC4422-6.1.1-1, SHOULD close connection on integrity-check failure in an active security " +
		"layer). §6.1.2 Downgrade Attacks: 1 entry (RFC4422-6.1.2-1, three parallel SHOULD NOT/SHOULD " +
		"duties around advertising/entering/continuing exchanges below the client's minimum security " +
		"requirements and verifying the negotiated outcome meets them) — the mechanism-discovery-" +
		"facility paragraph and the mechanism/protocol-designer downgrade-resistance paragraph that " +
		"follow are skipped (facility is protocol-designer scope per §4 item 2; resistant-design " +
		"guidance binds mechanism designers). §6.1.3 Replay Attacks, §6.1.4 Truncation Attacks: " +
		"descriptive risk explanations, no RFC 2119 keyword, skipped. §6.1.5 Other Active Attacks: " +
		"2 entries (RFC4422-6.1.5-1 MUST NOT blindly allocate the buffer-size-field amount; " +
		"RFC4422-6.1.5-2 SHOULD close the connection on an oversized block) binding 'the receiver', " +
		"which includes the client whenever it is decoding inbound security-layer buffers — treated " +
		"as the client-side counterpart of RFC4422-3.7-3 (same textual pattern, distinct section/" +
		"context, kept as separate entries per section-scoped ordinal numbering). §6.2 Passive " +
		"Attacks, §6.3 Re-keying, §6.4 Other Considerations: descriptive/SHOULD-for-mechanism-" +
		"designers text (e.g. 'implementations that wish to re-key... SHOULD reauthenticate' binds " +
		"whichever side chooses to re-key, framed as a design option rather than an IMAP client duty; " +
		"no IMAP profile currently defines a re-keying trigger), no additional client-binding entries. " +
		"§7 IANA Considerations, §8 References, §9 Acknowledgements: process/bibliographic, skipped. " +
		"Appendix A (SASL EXTERNAL mechanism) and Appendix B (changes since RFC 2222): skipped as out " +
		"of scope — Appendix A is a single mechanism's technical specification (mechanism-designer/" +
		"implementor-of-that-mechanism content, not general SASL-framework client-binding text; if " +
		"the client ever implements EXTERNAL this appendix becomes a candidate for a dedicated " +
		"extraction), and Appendix B is explicitly non-normative. " +
		"Cross-references: RFC 3501 §6.2.2 and RFC 9051 §6.2.2 define the concrete IMAP AUTHENTICATE " +
		"command (mechanism selection via CAPABILITY, the literal '*' cancellation line, base64 " +
		"encoding) that RFC 4422's abstract framework entries below bind through; RFC 4959 defines " +
		"the SASL-IR initial-response capability/argument that concretizes RFC4422-3-1/3.3-1's " +
		"initial-response permission for IMAP specifically (RFC 9051 folds this into core text). " +
		"AUTHENTICATE itself is unimplemented in this client today, so nearly every entry below is " +
		"'testable' only in the sense that a self-actualizing compliance script could exercise it " +
		"once AUTHENTICATE exists; each such entry's notes say so explicitly. A handful of duties " +
		"are untestable regardless of implementation status (internal-decision mechanism selection, " +
		"user-facing re-prompt behavior) and are tagged with the standard taxonomy themes.",
	requirements: [
		// ── §3 The Authentication Exchange ──────────────────────────────────────
		{
			id: "RFC4422-3-1",
			source: "RFC4422",
			section: "3",
			title: "Client MUST NOT send an initial response when the mechanism does not allow client-first data",
			text:
				"Should a client include an initial response in its request where the mechanism does not " +
				"allow the client to send data first, the authentication exchange fails.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"No explicit RFC 2119 keyword, but 'the authentication exchange fails' states a mandatory " +
				"protocol consequence, not a mere possibility — judgment: implicit MUST NOT binding the " +
				"client's choice to attach an initial response. Applies only when the client sends an " +
				"AUTHENTICATE for a server-first (or empty-first) mechanism (e.g. CRAM-MD5, per §5 item " +
				"2(a) of this RFC) while also supplying SASL-IR initial-response data (RFC 4959 / RFC 9051 " +
				"§6.2.2 initial-response field). Testable once AUTHENTICATE is implemented: script a " +
				"server-first mechanism and confirm the client does not send an initial-response literal " +
				"on the AUTHENTICATE line for it; today the client sends no AUTHENTICATE command at all, " +
				"so the harness assertion has nothing to exercise and the entry fails as unimplemented.",
		},

		// ── §3.1 Mechanism Naming ────────────────────────────────────────────────
		{
			id: "RFC4422-3.1-1",
			source: "RFC4422",
			section: "3.1",
			title: "SASL mechanism names the client selects/sends are 1-20 uppercase ASCII/digit/hyphen/underscore characters",
			text:
				"SASL mechanisms are named by character strings, from 1 to 20 characters in length, " +
				"consisting of ASCII [ASCII] uppercase letters, digits, hyphens, and/or underscores.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Framed descriptively ('are named by') rather than with an RFC 2119 keyword, but the ABNF " +
				"grammar immediately following (sasl-mech = 1*20mech-char; mech-char = UPPER-ALPHA / DIGIT " +
				"/ HYPHEN / UNDERSCORE) is a hard syntactic constraint on any string usable as a mechanism " +
				"name. Judgment: implicit MUST binding the client whenever it sends a mechanism name on " +
				"the AUTHENTICATE command line (name selected from the server's CAPABILITY-advertised " +
				"AUTH= list) — a client that echoed back a non-conforming string would be sending a " +
				"malformed command. Testable once AUTHENTICATE is implemented: assert the mechanism token " +
				"the client places on the wire matches ^[A-Z0-9_-]{1,20}$. The IANA registration procedure " +
				"in the remainder of §3.1 binds IANA/mechanism registrants, not the client, and is skipped.",
		},

		// ── §3.2 Mechanism Negotiation ───────────────────────────────────────────
		{
			id: "RFC4422-3.2-1",
			source: "RFC4422",
			section: "3.2",
			title: "Client selects the best supported and suitable mechanism from the server's advertised list",
			text:
				"Commonly, a protocol will specify that the server advertises supported and available " +
				"mechanisms to the client via some facility provided by the protocol, and the client " +
				"will then select the \"best\" mechanism from this list that it supports and finds suitable.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"No RFC 2119 keyword; 'Commonly' signals a description of typical protocol behavior, and " +
				"which mechanism a client judges 'best' among several it supports is an internal selection " +
				"policy. Two compliant clients presented with the same AUTH= list can pick different (both " +
				"'suitable') mechanisms and produce different, equally compliant wire traces. A black-box " +
				"test can observe which single mechanism name a client sent, but cannot observe the " +
				"selection logic behind it, and RFC 4422 imposes no ordering rule the harness could check " +
				"against (contrast RFC 3501/9051 §6.2.2's explicit 'decreasing order of preference' retry " +
				"guidance, which is separately catalogued and is itself a MAY).",
			notes:
				"Judgment: elevated to MUST-level framing here because IMAP's realization (AUTHENTICATE " +
				"naming exactly one mechanism per attempt, drawn from CAPABILITY) makes 'select from the " +
				"list' a de facto obligation for any client that authenticates via SASL at all, even though " +
				"the source sentence carries no keyword and 'best'/'suitable' are left to local judgment. " +
				"The downgrade-detection mechanism-rediscovery facility discussed in the same section is a " +
				"protocol-designer duty (RFC 4422 §4 item 2: 'a protocol SHOULD specify a facility...') " +
				"realized by IMAP's post-AUTHENTICATE CAPABILITY re-issue duty, already catalogued at " +
				"RFC3501-6.2.2-4 / RFC9051-6.2.2-5; not duplicated here.",
		},

		// ── §3.3 Request Authentication Exchange ─────────────────────────────────
		{
			id: "RFC4422-3.3-1",
			source: "RFC4422",
			section: "3.3",
			title: "Client initiates the exchange by sending the chosen mechanism's name, optionally with an initial response",
			text:
				"The authentication exchange is initiated by the client by requesting authentication via " +
				"a mechanism it specifies. The client sends a message that contains the name of the " +
				"mechanism to the server. ... Where the mechanism is defined to allow the client to send " +
				"data first, and the protocol's request message includes an optional initial response " +
				"field, the client may include the response to the initial challenge in the authentication " +
				"request message.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"No explicit RFC 2119 keyword on the first two sentences, but they describe the single " +
				"mandatory shape of exchange initiation (client sends mechanism name) — implicit MUST, " +
				"judgment. The elided middle sentence is the non-binding downgrade-attack note on " +
				"mechanism-negotiation exposure (already covered contextually by RFC4422-6.1.2-1). The " +
				"final sentence is an explicit 'may' permission for attaching an initial response — this " +
				"is IMAP's SASL-IR facility (RFC 4959; folded into RFC 9051 §6.2.2 core text). Applies " +
				"whenever the client issues AUTHENTICATE. Cross-reference: RFC3501-6.2.2-1 / RFC9051-6.2.2-1 " +
				"(client MUST implement AUTHENTICATE) and RFC9051-6.2.2-3 (initial response MUST be base64 " +
				"and MUST use '=' for zero-length) are the IMAP-concrete realizations of this framework " +
				"duty; not duplicated here. Testable once AUTHENTICATE is implemented: assert the client's " +
				"AUTHENTICATE command line carries a well-formed mechanism-name argument.",
		},

		// ── §3.4 Challenges and Responses ────────────────────────────────────────
		{
			id: "RFC4422-3.4-1",
			source: "RFC4422",
			section: "3.4",
			title: "After receiving a challenge, the client's only two legal moves are to respond or abort",
			text:
				"After receiving a challenge, a client mechanism may issue a response or abort the exchange.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Explicit 'may', but read structurally it enumerates the exhaustive set of legal client " +
				"actions upon receiving a mid-exchange challenge (respond, or abort per §3.5) — a client " +
				"that did neither (e.g. sent a syntactically invalid line, or silently stalled) would " +
				"violate the exchange protocol, so the permission functions as a closed-choice constraint. " +
				"Testable once AUTHENTICATE is implemented: after any server continuation challenge during " +
				"an AUTHENTICATE exchange, assert the client's next line is either a valid response " +
				"(mechanism-specific base64 payload) or the '*' abort line — never a bare CRLF, another " +
				"command, or connection silence. The preceding sentence enumerating what a mechanism 'may' " +
				"accomplish through challenges and responses (authenticate client/server, transfer an " +
				"authorization identity, negotiate a security layer, provide other services) is descriptive " +
				"scope-setting for mechanism designers, not a client obligation, and is skipped.",
		},

		// ── §3.4.1 Authorization Identity String ─────────────────────────────────
		{
			id: "RFC4422-3.4.1-1",
			source: "RFC4422",
			section: "3.4.1",
			title: "Authorization identity string the client sends MUST NOT contain NUL; absent and empty are equivalent",
			text:
				"The authorization identity string is a sequence of zero or more Unicode [Unicode] " +
				"characters, excluding the NUL (U+0000) character, representing the identity to act as. " +
				"If the authorization identity string is absent, the client is requesting to act as the " +
				"identity the server associates with the client's credentials. An empty string is " +
				"equivalent to an absent authorization identity.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"'Excluding the NUL character' is a definitional exclusion functioning as an implicit " +
				"MUST NOT on any client that constructs this string (judgment). The second and third " +
				"sentences are interpretive rules a client follows when *choosing* to omit or empty the " +
				"field (requesting to act as the authenticated identity itself) rather than independent " +
				"MUSTs; included verbatim because they define the semantics the client relies on to decide " +
				"whether to send a proxy-authorization identity at all. Applies whenever a mechanism the " +
				"client uses is capable of transferring an authorization identity string (e.g. PLAIN's " +
				"authzid field, RFC 4616). Testable once AUTHENTICATE with such a mechanism is implemented: " +
				"assert the client never embeds U+0000 in an authzid field it constructs, and that omitting " +
				"the field vs. sending an empty one produces equivalent server-observed behavior.",
		},
		{
			id: "RFC4422-3.4.1-2",
			source: "RFC4422",
			section: "3.4.1",
			title: "A non-empty authorization identity string the client sends requests to act as that specific identity",
			text:
				"A non-empty authorization identity string indicates that the client wishes to act as the " +
				"identity represented by the string.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "user-intent-policy",
			untestableRationale:
				"No RFC 2119 keyword; the sentence states what a non-empty string *means* rather than " +
				"constraining wire bytes. The client-side duty this implies — only send a non-empty authzid " +
				"when the caller genuinely intends proxy authorization to that identity — is a matter of " +
				"invoking-application intent that the wire cannot distinguish from any other reason a " +
				"non-empty string might have been supplied. A black-box test can observe that a non-empty " +
				"authzid was sent, never why.",
			notes:
				"Companion sentence to RFC4422-3.4.1-1; split into its own entry because it addresses the " +
				"non-empty case's semantics specifically and carries a distinct untestability determination " +
				"(intent-conditioned, vs. the syntactic NUL-exclusion and absent/empty equivalence rules of " +
				"the sibling entry, which are wire-observable).",
		},

		// ── §3.5 Aborting Authentication Exchanges ───────────────────────────────
		{
			id: "RFC4422-3.5-1",
			source: "RFC4422",
			section: "3.5",
			title: "Client aborts an authentication exchange by sending a protocol-specific abort message",
			text:
				"A client may abort the authentication exchange by sending a message, the particulars of " +
				"which are protocol specific, to the server, indicating that the exchange is aborted.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Explicit 'may' grants the client the option to abort at all; the concrete IMAP realization " +
				"of 'a message, the particulars of which are protocol specific' is the single-'*'-line " +
				"cancellation already catalogued as RFC3501-6.2.2-2 / RFC9051-6.2.2-2 (there elevated to " +
				"implicit MUST because IMAP defines exactly one abort mechanism, so a client that chooses " +
				"to abort has no alternative form). This entry records the framework-level permission that " +
				"those IMAP-concrete entries realize; not duplicated in substance, kept separate because it " +
				"is the RFC 4422 textual source those entries' judgment calls point back to. Testable once " +
				"AUTHENTICATE is implemented, via the already-catalogued IMAP-concrete entries.",
		},

		// ── §3.6 Authentication Outcome ──────────────────────────────────────────
		{
			id: "RFC4422-3.6-1",
			source: "RFC4422",
			section: "3.6",
			title: "Client MUST install the negotiated security layer upon receipt of a successful outcome",
			text:
				"If use of a security layer is negotiated in the authentication protocol exchange, the " +
				"layer is installed by the server after indicating the outcome of the authentication " +
				"exchange and installed by the client upon receipt of the outcome indication.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Sourced from §3.7 (Security Layers), which restates and sharpens the installation timing " +
				"first introduced descriptively in §3.6's 'If the outcome is successful and a security " +
				"layer was negotiated, this layer is then installed' — the §3.7 sentence is quoted here as " +
				"the operative one because it assigns the installation act explicitly to the client side " +
				"('installed by the client upon receipt'). No RFC 2119 keyword, but the sentence states a " +
				"mandatory causal sequence with no permitted alternative — judgment: implicit MUST. Applies " +
				"only when the negotiated mechanism offers a security layer and negotiation succeeded " +
				"(rare among mechanisms this client is likely to implement first, e.g. PLAIN/OAUTHBEARER " +
				"offer none; a mechanism like GSSAPI or DIGEST-MD5 would trigger it). Testable once " +
				"AUTHENTICATE with a security-layer-negotiating mechanism is implemented: assert that once " +
				"a successful tagged OK arrives, subsequent client-sent octets on the connection are wrapped " +
				"per the negotiated layer's framing rather than sent in the clear.",
		},

		// ── §3.7 Security Layers ─────────────────────────────────────────────────
		{
			id: "RFC4422-3.7-1",
			source: "RFC4422",
			section: "3.7",
			title: "Client MUST close the connection if its active security layer cannot produce or decode buffers",
			text:
				"If at any time the security layer is unable or unwilling to continue producing buffers " +
				"protecting protocol data, the underlying transport connection MUST be closed. If the " +
				"security layer is not able to decode a received buffer, the underlying connection MUST " +
				"be closed. In both cases, the underlying transport connection SHOULD be closed gracefully.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Two MUST sentences (encode-failure, decode-failure) plus a graded SHOULD on close style; " +
				"extracted as one entry because they form a single cohesive fault-handling duty for " +
				"whichever side is operating the security layer, which includes the client once a layer " +
				"is installed (RFC4422-3.6-1). Applies only when the client has an active SASL security " +
				"layer and encounters an encode or decode failure in it. Testable once AUTHENTICATE with a " +
				"security-layer mechanism is implemented: arm a scripted server that sends an undecodable " +
				"protected buffer after layer installation; assert the client closes the connection (and, " +
				"ideally, does so via a clean TCP close/shutdown rather than an abrupt reset, per the " +
				"SHOULD-graceful clause).",
		},
		{
			id: "RFC4422-3.7-2",
			source: "RFC4422",
			section: "3.7",
			title: "Client's outgoing protected buffer MUST NOT exceed the size the peer negotiated as its maximum",
			text:
				"The length of the protected data buffer MUST be no larger than the maximum size that the " +
				"other side expects.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Applies once a security layer with a negotiated (or mechanism-fixed) maximum receive " +
				"buffer size is installed and the client is producing outgoing protected buffers. Testable " +
				"once AUTHENTICATE with such a mechanism is implemented: assert every client-sent protected " +
				"buffer's four-octet length prefix (per the surrounding, non-normative framing description " +
				"in this section) is <= the size the server advertised/negotiated as its maximum.",
		},
		{
			id: "RFC4422-3.7-3",
			source: "RFC4422",
			section: "3.7",
			title: "Client SHOULD close the connection on receipt of an oversized protected-buffer length field",
			text:
				"Upon the receipt of a length field whose value is greater than the maximum size, the " +
				"receiver SHOULD close the connection, as this might be a sign of an attack.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"'The receiver' includes the client whenever it is the recipient of security-layer-" +
				"protected data from the server. Applies once a security layer with a negotiated maximum " +
				"buffer size is installed. Testable once AUTHENTICATE with such a mechanism is implemented: " +
				"arm a scripted server that, after layer installation, sends a length-prefixed buffer whose " +
				"declared length exceeds the negotiated maximum; assert the client closes the connection " +
				"rather than attempting to read/allocate for it (see also RFC4422-6.1.5-1/-2, the parallel " +
				"§6.1.5 statement of the same duty framed as active-attack defense).",
		},

		// ── §6.1.1 Hijack Attacks ────────────────────────────────────────────────
		{
			id: "RFC4422-6.1.1-1",
			source: "RFC4422",
			section: "6.1.1",
			title: "Client SHOULD close the connection when its security layer reports a data-integrity failure",
			text:
				"Implementations SHOULD close the connection when the security services in a SASL " +
				"security layer report protocol data report lack of data integrity.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"'Report protocol data report lack of data integrity' reproduces a minor duplication " +
				"present in the RFC's own published text (verified verbatim against the fetched source; " +
				"not a transcription error introduced here). 'Implementations' includes the client whenever " +
				"it has negotiated a security layer with at least integrity protection. Applies only once " +
				"such a layer is installed and its integrity check fails on inbound data. Testable once " +
				"AUTHENTICATE with an integrity-protecting mechanism is implemented: arm a scripted server " +
				"that sends a protected buffer with a corrupted integrity check after layer installation; " +
				"assert the client closes the connection rather than processing the payload.",
		},

		// ── §6.1.2 Downgrade Attacks ─────────────────────────────────────────────
		{
			id: "RFC4422-6.1.2-1",
			source: "RFC4422",
			section: "6.1.2",
			title: "Client SHOULD NOT advertise, enter, or continue below its minimum security requirements, and SHOULD verify the negotiated outcome meets them",
			text:
				"To protect against this sort of attack, implementations SHOULD NOT advertise mechanisms " +
				"and/or features that cannot meet their minimum security requirements, SHOULD NOT enter " +
				"into or continue authentication exchanges that cannot meet their minimum security " +
				"requirements, and SHOULD verify that completed authentication exchanges result in " +
				"security services that meet their minimum security requirements.",
			level: "SHOULD NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "user-intent-policy",
			untestableRationale:
				"'Minimum security requirements' is a deployment/configuration policy value the client " +
				"(or its embedding application) sets for itself; RFC 4422 does not define what the minimum " +
				"is or how it is expressed. A black-box test can observe which mechanism a client selected " +
				"and whether it proceeded with an exchange, but cannot determine whether that mechanism " +
				"met or violated a policy threshold that exists only in the client's own (unobservable, " +
				"and in this library's case, currently nonexistent) configuration. This mirrors " +
				"RFC3501-6.2.3-2's 'last resort' user-intent-policy determination.",
			notes:
				"'This sort of attack' = the preceding paragraph's downgrade attack via a modified server-" +
				"advertised mechanism list or modified client-advertised feature list. Three parallel " +
				"SHOULD/SHOULD NOT duties bundled into one entry as a single cohesive anti-downgrade policy. " +
				"'Each endpoint needs to independently verify that its security requirements are met' " +
				"(trailing sentence) is elided as restating the same point without new obligation content.",
		},

		// ── §6.1.5 Other Active Attacks ──────────────────────────────────────────
		{
			id: "RFC4422-6.1.5-1",
			source: "RFC4422",
			section: "6.1.5",
			title: "Client MUST NOT blindly allocate memory equal to an inbound protected buffer's declared size",
			text:
				"In particular, it MUST NOT blindly allocate the amount of memory specified in the buffer " +
				"size field, as this might cause the \"out of memory\" condition.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"'Blindly allocate' describes an internal memory-management strategy (allocate " +
				"unconditionally on the declared size vs. allocate incrementally / cap / stream). Two " +
				"clients can both process the same oversized-length-field input without an out-of-memory " +
				"crash — one by capping allocation, one by never having been vulnerable due to its runtime's " +
				"allocator behavior — and a black-box harness cannot distinguish 'complied with this MUST " +
				"NOT' from 'happened not to be affected'. The RFC's own follow-on clause (RFC4422-6.1.5-2, " +
				"close the connection on an oversized block) is the wire-observable consequence a harness " +
				"can actually assert; this entry is the internal-implementation-strategy antecedent of it.",
			notes:
				"'It' = the receiver of a protected data buffer, i.e. the client once a security layer is " +
				"installed and it is decoding inbound buffers from the server (same 'receiver' as " +
				"RFC4422-3.7-3, restated here as active-attack/resource-exhaustion defense rather than " +
				"generic length-field handling).",
		},
		{
			id: "RFC4422-6.1.5-2",
			source: "RFC4422",
			section: "6.1.5",
			title: "Client SHOULD close the connection on receipt of an oversized protected data buffer",
			text:
				"When use of a security layer is negotiated by the authentication protocol exchange, the " +
				"receiver SHOULD handle gracefully any protected data buffer larger than the defined/" +
				"negotiated maximal size. ... If the receiver detects a large block, it SHOULD close the " +
				"connection.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Elided middle sentence is RFC4422-6.1.5-1's MUST NOT (quoted in full as its own entry). " +
				"'The receiver' includes the client under an installed security layer. Restates " +
				"RFC4422-3.7-3's duty in the active-attack framing; kept as a separate entry because it is " +
				"a textually distinct sentence in a distinct section with its own ordinal, per the id " +
				"scheme's per-section numbering rule — a harness assertion satisfying one satisfies both. " +
				"Testable once AUTHENTICATE with a security-layer mechanism is implemented, by the same " +
				"oversized-buffer script described for RFC4422-3.7-3.",
		},
	],
};

export default rfc4422;
