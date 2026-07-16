import type { CatalogModule } from "../types";

const rfc5802: CatalogModule = {
	source: "RFC5802",
	extractionNote:
		"Full pass over RFC 5802 (SCRAM SASL and GSS-API Mechanisms) for CLIENT-binding " +
		"requirements only; SCRAM's server-side duties (authentication-database lookup/" +
		"storage, salt/iteration-count generation and persistence, ClientKey verification, " +
		"nonce augmentation, channel-binding-data construction/comparison against the " +
		"client's 'c=' value) are out of scope per the design's black-box client-catalog " +
		"rule and are skipped throughout, noted inline where a section is otherwise mixed. " +
		"§1 (Introduction) and §2 (Conventions/Terminology/Notation) are scene-setting, " +
		"glossary, and pseudocode-notation definitions with no independent client duty of " +
		"their own beyond what §3/§5/§7 state operationally; not separately catalogued " +
		"(the UTF-8/SASLprep encoding duty they foreshadow is captured where §3 states it " +
		"normatively, entry 3-1). §3 (SCRAM Algorithm Overview) contributes the username/" +
		"password UTF-8 encoding duty (entry 3-1) and the ClientProof/AuthMessage/" +
		"ClientSignature computation formulas, which are self-actualizing derived values " +
		"rather than independently testable prose duties — the formulas themselves are " +
		"absorbed as computation context into entry 5-8 (ClientProof) and the server-" +
		"signature-verification duty (entry 5.1 attributes below); the informative note " +
		"encouraging non-ASCII test-codepoint coverage is implementor guidance with no " +
		"keyword, skipped. §4 (SCRAM Mechanism Names) is entirely mechanism-naming-" +
		"convention and IANA-registration process for mechanism designers/registrants, not " +
		"client behavior — skipped in full (the client only ever needs to recognize/select " +
		"an already-registered name string off a CAPABILITY list, a duty already generically " +
		"covered by RFC4422-3.1-1/3.2-1 in the existing rfc4422.ts catalog; not duplicated). " +
		"§5 (SCRAM Authentication Exchange) is the core extraction target: the message-" +
		"validity gate on the client-first-message's leading gs2-cbind-flag byte (entry " +
		"5-1), the message-ordering/fixed-attribute-order rule (entry 5-2), and the server-" +
		"signature verification duty restated at the end of §5 alongside the drop-connection " +
		"consequence (entry 5-3). §5.1 (SCRAM Attributes) contributes one entry per client-" +
		"relevant attribute: 'a' authzid (5.4, syntax only — the semantic proxy-" +
		"authorization-intent half mirrors RFC4422-3.4.1-2's untestable determination and is " +
		"not re-extracted since RFC 5802 adds no new client text on it beyond a syntax " +
		"pointer), 'n' username (5.5 MUST-include, 5.6 SHOULD-SASLprep, 5.7 comma/equals " +
		"escaping), 'm' reserved-extension rejection (5.9), 'r' nonce (5.10 composition/" +
		"uniqueness, 5.11 client MUST verify nonce echo), 'c' channel-binding (5.12 REQUIRED " +
		"attribute + its two-part construction duty), 'p' proof (5.13), 'v' verifier (5.14, " +
		"the client-side half of server-signature verification — the same duty already " +
		"captured operationally at entry 5-3, cross-referenced rather than duplicated as a " +
		"separate testable assertion of what the client does with the decoded value), the " +
		"server-final-message-optional-on-failure client-acceptance duty (entry 5.15), and " +
		"the two extension-handling MUSTs (entries 5.16 mandatory-extension-failure, 5.17 " +
		"unknown-optional-extension-ignore). The 's' (salt) and 'i' (iteration-count) " +
		"attributes are server-emitted values the client only consumes as opaque input to " +
		"the SaltedPassword computation; no independent client-observable duty attaches to " +
		"them beyond 'use whatever value the server sent', already implicit in the p= " +
		"proof computation — skipped as having no separately testable client text. §5.2 " +
		"(Compliance with SASL Mechanism Requirements) is a checklist restating RFC 4422 " +
		"§5's mechanism-designer compliance points about the mechanism itself (client-" +
		"first-ness, additional-success-data, authzid transport capability, no security " +
		"layer, authzid hashing) — descriptive mechanism-property assertions, not " +
		"independent client behavioral duties beyond what §5/§5.1/§6 already state " +
		"operationally; skipped as non-duplicative. §6 (Channel Binding) is fully extracted: " +
		"the gs2-cbind-flag selection rules the client MUST follow depending on its own and " +
		"the server's advertised channel-binding support (entries 6-1 through 6-3, covering " +
		"the n/y/p flag-choice matrix) and §6.1's default-channel-binding-type client SHOULD " +
		"(entry 6.1-1, tls-unique). The server-advertisement SHOULD (servers SHOULD " +
		"advertise both variants), the server's y-flag-with-support-MUST-fail-authentication " +
		"rule, and the server's channel-binding-type-choice/'c=' validation MUSTs are server-" +
		"side and skipped. §7 (Formal Syntax) is extracted for the ABNF productions that fix " +
		"the client message wire format the client MUST emit: gs2-cbind-flag/gs2-header " +
		"(entry 7-1, folded into the channel-binding entries' notes as the authoritative " +
		"grammar rather than a separate prose-less entry), client-first-message(-bare) and " +
		"client-final-message(-without-proof) production shapes (entry 7-2), and the cbind-" +
		"input presence/absence rule tying cbind-data to the flag value (entry 7-3, the " +
		"concrete syntactic form of the §5.1 'c=' attribute's two-part construction duty in " +
		"entry 5.12). The attr-val/value/value-safe-char/printable/base64/posit-number/" +
		"saslname low-level lexical productions, the server-only productions (nonce's s-" +
		"nonce half as server-authored, salt, iteration-count, verifier-as-sent-by-server, " +
		"server-error-value enumeration itself as a closed vocabulary the client only needs " +
		"to accept-and-report rather than construct), and server-first-message/server-final-" +
		"message productions are server-authored wire shapes the client parses/accepts, not " +
		"emits — parsing-acceptance is generically covered by the client's obligation not to " +
		"fail on any spec-conformant server message (not independently testable beyond " +
		"'the client does not crash/misbehave on a well-formed server-first-message', which " +
		"has no crisper pass/fail boundary than existing generic-parsing entries elsewhere " +
		"in the catalog) — skipped as non-novel. §8 (SCRAM as a GSS-API Mechanism) and its " +
		"sub-sections are explicitly declared 'INFORMATIONAL for SASL implementors' by the " +
		"RFC's own text ('NORMATIVE for GSS-API implementors' only) — this client is a pure " +
		"SASL/IMAP implementation, not a GSS-API mechanism provider, so §8/8.1/8.2/8.3 are " +
		"entirely out of scope and skipped in full per the RFC's own applicability statement. " +
		"§9 (Security Considerations) is reviewed in full: the substantive attacker-" +
		"capability/threat-model paragraphs (offline dictionary attack absent a strong " +
		"security layer, MITM detection via channel binding, stolen-authentication-database " +
		"exposure, salt-reuse impersonation risk, hash-function-negotiation-is-out-of-scope " +
		"note, mechanism-list-protection discussion, unaddressed channel-binding-type-" +
		"downgrade limitation, and the iteration-count DoS-by-server risk) are risk " +
		"exposition and design-rationale prose with no client-actionable RFC 2119 keyword " +
		"text distinct from what §5/§6 already impose as duties — no additional client-" +
		"binding entries extracted; the one quasi-normative sentence ('it is important that " +
		"clients be able to sort a locally available list of mechanisms by preference') " +
		"restates RFC4422-3.2-1's already-catalogued internal-decision mechanism-selection " +
		"duty and is not re-extracted as a duplicate. §10 (IANA Considerations) and §11 " +
		"(Acknowledgements) are registration-template and administrative text, skipped. " +
		"§12 (References) is bibliographic, skipped. Appendix A (Other Authentication " +
		"Mechanisms) and Appendix B (Design Motivations) are non-normative comparative/" +
		"rationale prose, skipped. Cross-references: RFC 4422 (SASL framework — mechanism " +
		"naming/negotiation/initial-response/abort/security-layer-install duties already " +
		"catalogued in rfc4422.ts and not duplicated here); RFC 5801 (GS2 — defines the gs2-" +
		"header bridge structure SCRAM's client-first-message wraps; SCRAM's own §7 grammar " +
		"is authoritative for the SASL-mechanism-specific header shape used here, so RFC " +
		"5801 itself is not separately extracted); RFC 4959 (SASL-IR) / RFC 3501 §6.2.2 / " +
		"RFC 9051 §6.2.2 (the IMAP AUTHENTICATE carrier that base64-encodes/decodes each " +
		"SCRAM message line — already catalogued generically, not duplicated); RFC 7677 " +
		"(SCRAM-SHA-256 — a small hash-function-substitution and iteration-count-minimum " +
		"delta over this module, catalogued separately in rfc7677.ts, which cross-references " +
		"these ids rather than repeating the exchange-shape duties). AUTHENTICATE and every " +
		"SASL mechanism (including SCRAM) are unimplemented in this client today, so every " +
		"entry below is 'testable' in the sense that a self-actualizing compliance script " +
		"could exercise it once SCRAM support exists — each entry's notes say so explicitly, " +
		"following the RFC4422/RFC4616/RFC2195 Phase 3 SASL-catalog precedent.",
	requirements: [
		// ── §5 SCRAM Authentication Exchange ─────────────────────────────────────
		{
			id: "RFC5802-5-1",
			source: "RFC5802",
			section: "5",
			title: "Client-first-message MUST start with the gs2-cbind-flag byte n, y, or p",
			text:
				"Note that the client's first message will always start with \"n\", \"y\", " +
				"or \"p\"; otherwise, the message is invalid and authentication MUST fail.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Applies whenever the client selects AUTH=SCRAM-SHA-1(-PLUS). Testable once " +
				"SCRAM is implemented: decode the client's AUTHENTICATE SCRAM-SHA-1 initial " +
				"response / first continuation line and assert its first character is exactly " +
				"one of 'n', 'y', or 'p' (the gs2-cbind-flag production, entry RFC5802-7-1). " +
				"Unimplemented today — self-actualizing failure until SCRAM lands.",
		},
		{
			id: "RFC5802-5-2",
			source: "RFC5802",
			section: "5",
			title: "Attribute order in client (and server) messages is fixed except for extension attributes",
			text:
				"Note that the order of attributes in client or server messages is fixed, " +
				"with the exception of extension attributes (described by the \"extensions\" " +
				"ABNF production), which can appear in any order in the designated positions.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"No explicit RFC 2119 keyword ('is fixed'); judgment call to implicit MUST — " +
				"§7's ABNF productions (client-first-message-bare = [reserved-mext \",\"] " +
				"username \",\" nonce [\",\" extensions]; client-final-message-without-proof = " +
				"channel-binding \",\" nonce [\",\" extensions]) are the authoritative, non-" +
				"permissive grammar this sentence summarizes, so a client emitting attributes " +
				"out of this order would violate the grammar, not merely a style preference. " +
				"Testable once SCRAM is implemented: parse the client's first and final " +
				"message strings and assert attributes appear in the ABNF-mandated positions " +
				"(n before r in client-first-message-bare; c before r before p in client-" +
				"final-message).",
		},
		{
			id: "RFC5802-5-3",
			source: "RFC5802",
			section: "5",
			title: "Client MUST treat a mismatched ServerSignature as authentication failure",
			text:
				"The client then authenticates the server by computing the ServerSignature " +
				"and comparing it to the value sent by the server.  If the two are different, " +
				"the client MUST consider the authentication exchange to be unsuccessful, and " +
				"it might have to drop the connection.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"The core server-verifier duty this catalog scopes in per the task's explicit " +
				"inclusion of 'server-signature VERIFICATION duty (client MUST verify " +
				"ServerSignature)' — this is a client-binding MUST even though it concerns " +
				"authenticating the server, because it binds what the client itself computes " +
				"and how it must react. The 'might have to drop the connection' clause is a " +
				"permissive elaboration (MAY-strength), not an independent MUST — only the " +
				"'consider ... unsuccessful' determination is mandatory. Testable once SCRAM " +
				"is implemented: script a server that returns a syntactically valid 'v=' " +
				"verifier value that does NOT match the ServerSignature the correct algorithm " +
				"would produce for the exchanged messages/shared secret; assert the client " +
				"does not report/treat the authentication as successful. Cross-reference: " +
				"entry RFC5802-5.14-1 (the 'v' attribute's purpose) states the same duty from " +
				"the attribute-definition side; this entry is the operationally-worded MUST " +
				"the design doc's scope note calls out explicitly, kept as a separate id " +
				"since it is a textually distinct sentence at a distinct section/ordinal.",
		},

		// ── §5.1 SCRAM Attributes ────────────────────────────────────────────────
		{
			id: "RFC5802-5.1-1",
			source: "RFC5802",
			section: "5.1",
			title: "'a=' authzid syntax matches 'n='s comma/equals quoting rule",
			text:
				"The syntax of this field is the same as that of the \"n\" field with respect " +
				"to quoting of '=' and ','.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Binds the client whenever it constructs an 'a=' authzid attribute in the gs2-" +
				"header (e.g. to act as a different user than the authenticated 'n=' identity, " +
				"a proxy-authorization use case) — it MUST apply the same '=2C'/'=3D' escaping " +
				"as RFC5802-5.1-3 (the 'n=' rule) to any ',' or '=' byte in the authzid value. " +
				"Applicability conditional on the client both supporting SCRAM and choosing to " +
				"populate a non-empty authzid; the semantic 'wants to authenticate as one user " +
				"but act as a different user' half of the source paragraph is proxy-intent " +
				"framing already covered by RFC4422-3.4.1-2's untestable user-intent-policy " +
				"determination in the existing rfc4422.ts catalog and is not re-extracted here. " +
				"Testable once SCRAM (with authzid support) is implemented: supply an authzid " +
				"containing ',' or '=' and assert the client-first-message's 'a=' value has " +
				"those bytes escaped per the saslname production (entry RFC5802-7-3's sibling " +
				"grammar), never emitted raw.",
		},
		{
			id: "RFC5802-5.1-2",
			source: "RFC5802",
			section: "5.1",
			title: "Client MUST include the 'n=' username attribute in its first message",
			text: "A client MUST include it in its first message to the server.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"'It' = the 'n' username attribute, per the surrounding paragraph ('This " +
				"attribute specifies the name of the user whose password is used for " +
				"authentication'). Testable once SCRAM is implemented: parse the client-" +
				"first-message-bare and assert an 'n=' attribute is present.",
		},
		{
			id: "RFC5802-5.1-3",
			source: "RFC5802",
			section: "5.1",
			title: "Client SHOULD SASLprep the username before sending, and SHOULD abort on preparation failure/empty result",
			text:
				"Before sending the username to the server, the client SHOULD prepare the " +
				"username using the \"SASLprep\" profile [RFC4013] of the \"stringprep\" " +
				"algorithm [RFC3454] treating it as a query string (i.e., unassigned Unicode " +
				"code points are allowed).  If the preparation of the username fails or " +
				"results in an empty string, the client SHOULD abort the authentication " +
				"exchange (*).",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Applies whenever the client constructs the 'n=' attribute value from a " +
				"caller-supplied username. Testable once SCRAM (with SASLprep) is implemented: " +
				"supply a username with a SASLprep-normalizable form (e.g. differing Unicode " +
				"normalization forms per the §3 informative note's example codepoints) and " +
				"assert the emitted 'n=' value is the prepared form; separately, supply a " +
				"username whose SASLprep application fails (e.g. contains a prohibited " +
				"bidirectional or unassigned-under-'stored strings'-style codepoint) and " +
				"assert the client aborts rather than sending an unprepared value. The " +
				"footnoted '(*) An interactive client can request a repeated entry of the " +
				"username value' is UI-affordance guidance for interactive clients, not a " +
				"duty this headless library can be scored on, and is not separately extracted.",
		},
		{
			id: "RFC5802-5.1-4",
			source: "RFC5802",
			section: "5.1",
			title: "Comma and equals in the username are escaped as '=2C' and '=3D'",
			text:
				"The characters ',' or '=' in usernames are sent as '=2C' and '=3D' " +
				"respectively.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"No explicit RFC 2119 keyword ('are sent as'); judgment call to implicit MUST " +
				"— this is the saslname production's escaping rule (entry RFC5802-7-3's " +
				"sibling grammar: 'saslname = 1*(value-safe-char / \"=2C\" / \"=3D\")') stated " +
				"in prose, and the very next sentence makes the server-side failure mode of " +
				"non-compliance explicit ('If the server receives a username that contains " +
				"'=' not followed by either '2C' or '3D', then the server MUST fail the " +
				"authentication') — i.e. a client that fails to escape breaks the exchange. " +
				"Testable once SCRAM is implemented: supply a username containing ',' and/or " +
				"'=' and assert the client-first-message's 'n=' value has them escaped rather " +
				"than emitted raw.",
		},
		{
			id: "RFC5802-5.1-5",
			source: "RFC5802",
			section: "5.1",
			title: "Presence of the reserved 'm=' attribute in a client message MUST cause authentication failure",
			text:
				"This attribute is reserved for future extensibility.  In this version of " +
				"SCRAM, its presence in a client or a server message MUST cause authentication " +
				"failure when the attribute is parsed by the other end.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Binds the client on both sides of the wire: as a producer, the client MUST " +
				"NOT emit an 'm=' attribute (since this version of SCRAM defines no mandatory " +
				"extension for it to carry); as a consumer, the client MUST fail the exchange " +
				"if the server's message includes one. Testable once SCRAM is implemented: (a) " +
				"assert the client never emits 'm=' in its own messages under normal operation; " +
				"(b) script a server-first-message or server-final-message containing an " +
				"'m=' attribute and assert the client fails the authentication rather than " +
				"continuing.",
		},
		{
			id: "RFC5802-5.1-6",
			source: "RFC5802",
			section: "5.1",
			title: "'r=' nonce is a sequence of random printable ASCII characters excluding comma, unquoted",
			text:
				"This attribute specifies a sequence of random printable ASCII characters " +
				"excluding ',' (which forms the nonce used as input to the hash function).  " +
				"No quoting is applied to this string.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Fixes the c-nonce production the client MUST emit (printable = %x21-2B / " +
				"%x2D-7E, i.e. printable ASCII excluding ','). Testable once SCRAM is " +
				"implemented: assert the client's 'r=' value in client-first-message is " +
				"composed only of printable-ASCII bytes excluding ',' and is not quoted/" +
				"escaped like a saslname value.",
		},
		{
			id: "RFC5802-5.1-7",
			source: "RFC5802",
			section: "5.1",
			title: "Client's nonce MUST be different for each authentication",
			text:
				"It is important that this value be different for each authentication (see " +
				"[RFC4086] for more details on how to achieve this).",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"'It is important that' is judgment-called to MUST strength: nonce reuse " +
				"across authentications defeats SCRAM's replay/freshness guarantees, and the " +
				"sentence is a load-bearing security property, not optional advice. Testable " +
				"once SCRAM is implemented: perform two successive authentication exchanges " +
				"against a scripted server and assert the client's two 'r=' client-nonce " +
				"values differ (a client emitting a fixed or otherwise predictable c-nonce " +
				"would be a genuine, wire-observable spec violation, distinguishing this from " +
				"the internal-decision entries elsewhere in the catalog where compliant/non-" +
				"compliant clients are wire-indistinguishable).",
		},
		{
			id: "RFC5802-5.1-8",
			source: "RFC5802",
			section: "5.1",
			title: "Client MUST verify the server echoed its nonce as the initial part of the combined nonce",
			text:
				"The client MUST verify that the initial part of the nonce used in " +
				"subsequent messages is the same as the nonce it initially specified.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Applies after receiving the server-first-message and before sending the " +
				"client-final-message. Testable once SCRAM is implemented: script a server " +
				"that returns a combined nonce in 'r=' whose leading portion does NOT match " +
				"the client's own client-first-message c-nonce, and assert the client aborts " +
				"the exchange (e.g. sends the '*' cancellation, per RFC4422-3.5-1 / RFC3501-" +
				"6.2.2-2 / RFC9051-6.2.2-2) rather than proceeding to compute and send a " +
				"client-final-message against the mismatched nonce.",
		},
		{
			id: "RFC5802-5.1-9",
			source: "RFC5802",
			section: "5.1",
			title: "'c=' channel-binding attribute is REQUIRED in the client-final-message",
			text:
				"This REQUIRED attribute specifies the base64-encoded GS2 header and channel " +
				"binding data.  It is sent by the client in its second authentication " +
				"message.  The attribute data consist of:",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"'REQUIRED' per RFC 8174/RFC 2119 keyword equivalence. Testable once SCRAM is " +
				"implemented: assert every client-final-message includes a 'c=' attribute " +
				"whose value is valid base64 (per the base64 ABNF production).",
		},
		{
			id: "RFC5802-5.1-10",
			source: "RFC5802",
			section: "5.1",
			title: "'c=' value's first component is the client-first-message's GS2 header, including channel-binding-type prefix iff channel binding is used",
			text:
				"the GS2 header from the client's first message (recall that the GS2 header " +
				"contains a channel binding flag and an optional authzid).  This header is " +
				"going to include channel binding type prefix (see [RFC5056]), if and only if " +
				"the client is using channel binding;",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Fixes the first half of the client's 'c=' construction: the base64-encoded " +
				"cbind-input begins with the identical gs2-header bytes the client sent in " +
				"its client-first-message (entry RFC5802-7-1/-7-3). Testable once SCRAM (with " +
				"and without channel binding) is implemented: decode the client's 'c=' value " +
				"and assert its leading gs2-header segment byte-matches the gs2-header the " +
				"client emitted in client-first-message, in both the plain (n/y-flag) and " +
				"channel-binding (p-flag, cb-name prefix present) cases.",
		},
		{
			id: "RFC5802-5.1-11",
			source: "RFC5802",
			section: "5.1",
			title: "'c=' value's second component is the external channel's binding data, present iff channel binding is used",
			text:
				"followed by the external channel's channel binding data, if and only if the " +
				"client is using channel binding.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "capability-inventory",
			untestableRationale:
				"Conditional on 'the client is using channel binding' — structurally unsatisfiable " +
				"for this client: channel binding (and every -PLUS mechanism variant) is a permanent " +
				"design non-goal (spec §13; §9.2 'no channel binding = -PLUS variants out of scope'). " +
				"This client deliberately does not implement or advertise SCRAM-*-PLUS, which RFC 5802 " +
				"explicitly permits for non-channel-binding clients (the RFC5802-6-3 branch this client " +
				"always takes). No code path exists through this client's actual API in which the " +
				"conditioned 'c=' cbind-data clause could ever be exercised — every 'c=' value this " +
				"client emits is the n/y-flag, no-cbind-data shape, which is the OTHER half of this " +
				"same source bullet (already covered by RFC5802-5.1-10), never the p-flag half this " +
				"entry states. Same never-reachable-affordance reasoning as RFC5802-6-1. Reclassified " +
				"from 'testable' at M5.16. Reactivation condition: implementing SCRAM-*-PLUS " +
				"(tls-exporter per RFC 9266) is a legitimate potential post-1.0 feature; if it lands, " +
				"this row must be reclassified testable again.",
			notes:
				"The second half of the 'c=' construction duty, paired with RFC5802-5.1-10 — " +
				"split into its own entry because it is the distinct 'cbind-data' clause of " +
				"the same source bullet (cf. the §7 cbind-input production, entry RFC5802-7-3, " +
				"which states the same presence/absence rule formally). Applicability " +
				"conditional on the client supporting and using channel binding (the p-flag " +
				"path) — this client has no TLS channel-binding (tls-unique/tls-server-end-" +
				"point) implementation today, so testing this entry is additionally gated on " +
				"that prerequisite beyond SCRAM itself.",
		},
		{
			id: "RFC5802-5.1-12",
			source: "RFC5802",
			section: "5.1",
			title: "'p=' proof is the client-computed, base64-encoded ClientProof",
			text:
				"This attribute specifies a base64-encoded ClientProof.  The client computes " +
				"this value as described in the overview and sends it to the server.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"'As described in the overview' = §3's ClientProof := ClientKey XOR " +
				"ClientSignature formula (ClientSignature := HMAC(StoredKey, AuthMessage); " +
				"AuthMessage := client-first-message-bare + \",\" + server-first-message + " +
				"\",\" + client-final-message-without-proof), absorbed here as computation " +
				"context per the extractionNote. Testable once SCRAM is implemented: given a " +
				"scripted server with a known salt/iteration-count/challenge and a known " +
				"client password, compute the expected ClientProof independently (e.g. via a " +
				"Node reference HMAC-SHA-1/PBKDF2-style derivation) and assert the client's " +
				"'p=' value, base64-decoded, matches byte-for-byte.",
		},
		{
			id: "RFC5802-5.1-13",
			source: "RFC5802",
			section: "5.1",
			title: "'v=' verifier is the base64-encoded ServerSignature the client uses to verify the server",
			text:
				"This attribute specifies a base64-encoded ServerSignature.  It is sent by " +
				"the server in its final message, and is used by the client to verify that " +
				"the server has access to the user's authentication information.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Server-emitted attribute, but its client-consumption duty is exactly the " +
				"verification MUST already captured operationally as RFC5802-5-3; this entry " +
				"is the attribute-definition-side statement of the same duty, kept as a " +
				"separate id (distinct sentence/section/ordinal) per the append-only id rule, " +
				"and its test is the same script described in RFC5802-5-3's notes (a mismatched " +
				"'v=' must not be accepted as successful).",
		},
		{
			id: "RFC5802-5.1-14",
			source: "RFC5802",
			section: "5.1",
			title: "Client MAY receive no server-final-message at all on authentication failure",
			text:
				"On failed authentication, the entire server-final-message is OPTIONAL; " +
				"specifically, a server implementation MAY conclude the SASL exchange with a " +
				"failure without sending the server-final-message.  This results in an " +
				"application-level error response without an extra round-trip.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"A server-permission sentence, but it binds the client's acceptance surface: " +
				"a compliant client MUST be able to recognize a failed SCRAM exchange conveyed " +
				"purely via the application-level (IMAP tagged NO/BAD) response with no " +
				"trailing 'e=' or 'v=' continuation line at all, not only the alternative " +
				"where the server sends a server-final-message containing 'e='. Testable once " +
				"SCRAM is implemented: script a server that fails the exchange by returning a " +
				"tagged NO immediately after the client-final-message, with no additional SASL " +
				"continuation line, and assert the client surfaces this as an authentication " +
				"failure rather than hanging, erroring on missing continuation data, or " +
				"misinterpreting it as success.",
		},
		{
			id: "RFC5802-5.1-15",
			source: "RFC5802",
			section: "5.1",
			title: "Client MUST fail authentication on an unsupported mandatory extension",
			text:
				"Mandatory extensions sent by one peer but not understood by the other MUST " +
				"cause authentication failure (the server SHOULD send the \"extensions-not-" +
				"supported\" server-error-value).",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"'One peer... the other' includes the client whenever the server sends a " +
				"mandatory extension (an 'm=' value, since this version of SCRAM defines none, " +
				"any 'm=' the server sends is by definition unsupported by this client) the " +
				"client does not understand — the same wire consequence as RFC5802-5.1-5, " +
				"restated here in the general mandatory-extension-handling framing rather than " +
				"the specific 'm=' attribute-definition framing; kept as a separate entry per " +
				"the distinct-sentence/section rule. Testable once SCRAM is implemented, by " +
				"the same script as RFC5802-5.1-5.",
		},
		{
			id: "RFC5802-5.1-16",
			source: "RFC5802",
			section: "5.1",
			title: "Client MUST ignore unknown optional extension attributes",
			text: "Unknown optional extensions MUST be ignored upon receipt.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Binds the client whenever a server-first-message or server-final-message's " +
				"'extensions' production (optional, unrecognized attr-val pairs) contains an " +
				"attribute name the client does not recognize. Testable once SCRAM is " +
				"implemented: script a server-first-message with a trailing unrecognized " +
				"attr-val (e.g. 'x=foo') appended per the extensions ABNF production, and " +
				"assert the client proceeds with the exchange normally (computing and sending " +
				"a well-formed client-final-message) rather than failing or misparsing on the " +
				"unknown attribute.",
		},

		// ── §6 Channel Binding ───────────────────────────────────────────────────
		{
			id: "RFC5802-6-1",
			source: "RFC5802",
			section: "6",
			title: "Client supporting channel binding MUST NOT use the 'n' gs2-cbind-flag if the server did not advertise a -PLUS mechanism",
			text:
				"If the client supports channel binding and the server does not appear to " +
				"(i.e., the client did not see the -PLUS name advertised by the server), then " +
				"the client MUST NOT use an \"n\" gs2-cbind-flag.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "capability-inventory",
			untestableRationale:
				"The duty's own antecedent — 'if the client supports channel binding' — is " +
				"structurally unsatisfiable for this client: channel binding (and with it every " +
				"-PLUS mechanism variant) is a permanent design non-goal (spec §13; §9.2 'no " +
				"channel binding = -PLUS variants out of scope'), so no code path exists through " +
				"this client's actual API in which the conditioned prohibition could be either " +
				"honored or violated. A wire exchange showing gs2-cbind-flag 'n' is fully " +
				"compliant here via the RFC5802-6-3 branch ('if the client does not support " +
				"channel binding, then it MUST use an \"n\" gs2-cbind-flag') and carries zero " +
				"information about this entry's channel-binding-capable-client duty — the same " +
				"never-reachable-affordance reasoning as the RFC9525 URI-ID/SRV-ID rows already " +
				"classified under this theme. Reclassified from 'testable' at M5.1 " +
				"(adjudicated): the original classification was written before SCRAM landed, " +
				"against a hypothetical future client that might implement channel binding; " +
				"this library's never will.",
			notes:
				"Applies only to a client that itself supports channel binding, connecting to " +
				"a server whose CAPABILITY list advertises only the non-PLUS mechanism name " +
				"(e.g. SCRAM-SHA-1 without SCRAM-SHA-1-PLUS). The correct flag in that case is " +
				"'y' (the client believes the server lacks channel-binding support), reserving " +
				"'n' exclusively for clients that do not support channel binding at all (entry " +
				"RFC5802-6-3 — the branch THIS client permanently takes, verified by the " +
				"RFC5802-6-3-citing test asserting every SCRAM exchange uses flag 'n').",
		},
		{
			id: "RFC5802-6-2",
			source: "RFC5802",
			section: "6",
			title: "Client supporting mechanism negotiation and channel binding MUST use the 'p' gs2-cbind-flag when the server offers the PLUS variant",
			text:
				"Clients that support mechanism negotiation and channel binding MUST use a " +
				"\"p\" gs2-cbind-flag when the server offers the PLUS-variant of the desired " +
				"GS2 mechanism.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "capability-inventory",
			untestableRationale:
				"Conditional on 'clients that support mechanism negotiation and channel binding' — " +
				"this client permanently does not support channel binding (spec §13 non-goal) and never " +
				"registers or selects a -PLUS mechanism name, which RFC 5802 explicitly permits for " +
				"non-channel-binding clients (the RFC5802-6-3 'n'-flag branch this client always takes). " +
				"No code path exists in which this client could see a server offer -PLUS and be asked to " +
				"choose 'p' in response — the antecedent client capability this row quantifies over does " +
				"not exist. Same never-reachable-affordance reasoning as RFC5802-6-1. Reclassified from " +
				"'testable' at M5.16. Reactivation condition: implementing SCRAM-*-PLUS (tls-exporter per " +
				"RFC 9266) is a legitimate potential post-1.0 feature; if it lands, this row must be " +
				"reclassified testable again.",
			notes:
				"Applies to a channel-binding-capable client when the server's CAPABILITY list " +
				"advertises the -PLUS mechanism name.",
		},
		{
			id: "RFC5802-6-3",
			source: "RFC5802",
			section: "6",
			title: "Client without channel-binding support MUST use 'n'; a client requiring it MUST use 'p'; 'y' is never used absent mechanism negotiation",
			text:
				"If the client does not support channel binding, then it MUST use an \"n\" " +
				"gs2-cbind-flag.  Conversely, if the client requires the use of channel " +
				"binding then it MUST use a \"p\" gs2-cbind-flag.  Clients that do not support " +
				"mechanism negotiation never use a \"y\" gs2-cbind-flag, they use either \"p\" " +
				"or \"n\" according to whether they require and support the use of channel " +
				"binding or whether they do not, respectively.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Three parallel MUSTs bundled as one entry (closed decision matrix over the " +
				"client's own channel-binding capability/requirement, complementing entries " +
				"RFC5802-6-1/-6-2's 'y'/'p' cases for the mechanism-negotiation-capable side). " +
				"Testable once SCRAM is implemented: for a client with no channel-binding " +
				"implementation at all, assert every SCRAM exchange uses gs2-cbind-flag 'n' " +
				"regardless of what the server advertises; if/when the client implements " +
				"channel binding as a hard requirement, assert it always uses 'p', never 'n' " +
				"or 'y'.",
		},
		{
			id: "RFC5802-6.1-1",
			source: "RFC5802",
			section: "6.1",
			title: "'tls-unique' is the default channel binding type",
			text:
				"'tls-unique' is the default channel binding type for any application that " +
				"doesn't specify one.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "capability-inventory",
			untestableRationale:
				"Conditional on 'the client uses channel binding without an application-specified " +
				"override' — this client permanently implements no channel binding (spec §13 non-goal), " +
				"so it never sends a 'p=' gs2-cbind-flag whose cb-name could be checked against this " +
				"default at all; it always takes the RFC5802-6-3 'n'-flag branch, which RFC 5802 " +
				"explicitly permits for non-channel-binding clients. No cb-name value of any kind is ever " +
				"observable on this client's wire. Same never-reachable-affordance reasoning as " +
				"RFC5802-6-1. Reclassified from 'testable' at M5.16. Reactivation condition: implementing " +
				"SCRAM-*-PLUS (tls-exporter per RFC 9266) is a legitimate potential post-1.0 feature; if " +
				"it lands, this row must be reclassified testable again.",
			notes:
				"No explicit RFC 2119 keyword ('is the default'); judgment call to implicit " +
				"MUST as a definitional default that applies unless IMAP (the carrying " +
				"protocol) specifies a different channel-binding type, which it does not.",
		},
		{
			id: "RFC5802-6.1-2",
			source: "RFC5802",
			section: "6.1",
			title: "Client SHOULD implement the 'tls-unique' channel binding type if it implements any channel binding",
			text:
				"Clients SHOULD implement the \"tls-unique\" [RFC5929] channel binding type, " +
				"if they implement any channel binding.  Clients and servers SHOULD choose " +
				"the highest-layer/innermost end-to-end TLS channel as the channel to which " +
				"to bind.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "capability-inventory",
			untestableRationale:
				"Conditional on 'if they implement any channel binding' — this client's own text " +
				"already records that it implements none today, and channel binding is a permanent " +
				"design non-goal (spec §13), not merely a not-yet-implemented feature. The antecedent " +
				"is structurally unsatisfiable for a conformant deployment of this client, so the " +
				"which-channel-binding-type-to-implement SHOULD (and its 'innermost TLS channel' " +
				"second clause) never binds. Same never-reachable-affordance reasoning as RFC5802-6-1. " +
				"Reclassified from 'testable' at M5.16. Reactivation condition: implementing " +
				"SCRAM-*-PLUS (tls-exporter per RFC 9266) is a legitimate potential post-1.0 feature; " +
				"if it lands, this row must be reclassified testable again.",
			notes:
				"Conditional on the client implementing channel binding at all (this client " +
				"implements none today). The 'innermost TLS channel' half is bundled " +
				"into this entry as it is the same sentence's second clause; both halves share " +
				"the SHOULD strength and the channel-binding-implemented precondition.",
		},

		// ── §7 Formal Syntax ─────────────────────────────────────────────────────
		{
			id: "RFC5802-7-1",
			source: "RFC5802",
			section: "7",
			title: "gs2-cbind-flag / gs2-header ABNF the client MUST construct",
			text:
				"gs2-cbind-flag  = (\"p=\" cb-name) / \"n\" / \"y\" ... gs2-header      = " +
				"gs2-cbind-flag \",\" [ authzid ] \",\"",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"The authoritative grammar underlying the prose channel-binding-flag duties " +
				"(entries RFC5802-6-1 through 6-3) and the client-first-message's leading-byte " +
				"gate (entry RFC5802-5-1); elided middle comment lines (the '\"n\" -> client " +
				"doesn't...' annotations) are non-normative clarifying comments already folded " +
				"into those entries' prose, not repeated here as separate text. Testable once " +
				"SCRAM is implemented: assert the client's gs2-header segment matches this " +
				"ABNF exactly, including the two trailing/embedded commas and empty-authzid " +
				"representation when no 'a=' is sent.",
		},
		{
			id: "RFC5802-7-2",
			source: "RFC5802",
			section: "7",
			title: "client-first-message / client-final-message(-without-proof) ABNF the client MUST construct",
			text:
				"client-first-message-bare = [reserved-mext \",\"] username \",\" nonce [\",\" " +
				"extensions] ... client-first-message = gs2-header client-first-message-bare " +
				"... client-final-message-without-proof = channel-binding \",\" nonce [\",\" " +
				"extensions] ... client-final-message = client-final-message-without-proof " +
				"\",\" proof",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Fixes the two client message shapes wholesale — this is the authoritative " +
				"grammar the client-first-message ordering duty (RFC5802-5-2), the username-" +
				"inclusion duty (RFC5802-5.1-2), the nonce attribute (RFC5802-5.1-6/-7), the " +
				"channel-binding attribute (RFC5802-5.1-9 through -11), and the proof " +
				"attribute (RFC5802-5.1-12) all compose into on the wire. Not a duplicate of " +
				"those prose entries: this entry is the structural/positional grammar itself " +
				"(what goes where, separated by which commas), testable independently by " +
				"asserting the client's two message strings parse against these exact " +
				"productions (reserved-mext and extensions both absent in this version's " +
				"normal operation, per RFC5802-5.1-5's m= rejection duty).",
		},
		{
			id: "RFC5802-7-3",
			source: "RFC5802",
			section: "7",
			title: "cbind-data MUST be present in cbind-input iff the gs2-cbind-flag is 'p', and MUST be absent for 'y' or 'n'",
			text:
				"cbind-input   = gs2-header [ cbind-data ] ... cbind-data MUST be present for " +
				"gs2-cbind-flag of \"p\" and MUST be absent for \"y\" or \"n\".",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"The formal-grammar statement of the same duty prose-stated as entry " +
				"RFC5802-5.1-11 ('followed by the external channel's channel binding data, " +
				"if and only if the client is using channel binding') — kept as a separate id " +
				"because it is the distinct §7 ABNF-comment sentence, with its own explicit " +
				"'p'-vs-'y'/'n' MUST/MUST-absent framing not present verbatim in §5.1's prose. " +
				"Testable once SCRAM (with and without channel binding) is implemented: for a " +
				"'p'-flag exchange, assert the base64-decoded 'c=' value's cbind-input has a " +
				"trailing cbind-data segment after the gs2-header; for 'n'/'y'-flag exchanges, " +
				"assert cbind-input is exactly the gs2-header with nothing appended.",
		},

		// ── §3 Algorithm Overview (username/password encoding) ──────────────────
		{
			id: "RFC5802-3-1",
			source: "RFC5802",
			section: "3",
			title: "Username and password MUST be encoded in UTF-8",
			text: "Note that both the username and the password MUST be encoded in UTF-8 [RFC3629].",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Applies to the raw username/password values the client's SASLprep step " +
				"(entry RFC5802-5.1-3) and ClientProof computation (entry RFC5802-5.1-12) " +
				"consume, before/alongside those transformations — the client's caller-" +
				"supplied credential strings must round-trip through UTF-8 rather than, e.g., " +
				"an uninspected Latin-1 byte string. Testable once SCRAM is implemented: " +
				"supply a username/password containing non-ASCII codepoints (the §3 " +
				"informative note's own examples, U+00BD and U+00B4, are convenient probes " +
				"given their distinct NFC/NFKC forms) and assert the client's wire-encoded " +
				"'n=' value and the password bytes fed into SaltedPassword/HMAC are valid, " +
				"round-trip-faithful UTF-8.",
		},
		{
			id: "RFC5802-3-2",
			source: "RFC5802",
			section: "3",
			title: "Client MUST either implement SASLprep or disallow non-US-ASCII Unicode codepoints in prepared strings",
			text:
				"implementations MUST either implement SASLprep or disallow use of non " +
				"US-ASCII Unicode codepoints in \"str\".",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Quoted from the §2.2 Normalize(str) notation definition but stated as an " +
				"operative MUST on 'implementations'; catalogued under §3 (Algorithm Overview) " +
				"rather than §2 because it is the client's actionable fallback-compliance " +
				"duty for the Normalize() step §3's SaltedPassword formula invokes, and §2 is " +
				"treated as pure notation per the extractionNote. Binds the client whenever it " +
				"prepares a username (RFC5802-5.1-3) or password (RFC5802-3-1) via " +
				"Normalize(): either genuinely apply SASLprep, or reject/refuse any non-ASCII " +
				"codepoint in the value rather than passing it through unprepared. Testable " +
				"once SCRAM is implemented: supply a non-ASCII username/password and assert " +
				"the client either normalizes it (SASLprep applied, verifiable against a " +
				"reference implementation) or refuses to proceed — never silently forwards " +
				"the raw non-ASCII string as if it were already prepared.",
		},
	],
};

export default rfc5802;
