import type { CatalogModule } from "../types";

const rfc4616: CatalogModule = {
	source: "RFC4616",
	extractionNote:
		"Full pass over RFC 4616 (The PLAIN SASL Mechanism) for client-binding " +
		"requirements. Section 1 (Introduction) contributes the security-posture " +
		"duty on advertising/using PLAIN without adequate data security (entry " +
		"1-1); it also carries a MUST that binds IETF protocol specifications " +
		"(not this client), skipped. Section 2 (PLAIN SASL Mechanism) is the " +
		"core: the client message grammar (entry 2-1), the UTF-8 encoding rule " +
		"for authzid/authcid/passwd/NUL (entry 2-2), the NUL-prohibition in the " +
		"three productions (entry 2-3), and the discouragement of non-visible/ " +
		"hard-to-type characters (entry 2-4, judgment-call level). The rest of " +
		"section 2 (server-side octet-acceptance minimum, SASLprep preparation " +
		"of presented/stored strings, authzid derivation, verification, " +
		"credential-database initialization) is server-side verification logic " +
		"and is skipped per scope. Section 3 (Pseudo-Code) is illustrative " +
		"server verification pseudo-code, non-normative for the client, skipped " +
		"in full. Section 4 (Examples) is illustrative, non-normative, skipped. " +
		"Section 5 (Security Considerations) restates and sharpens the " +
		"advertise/use-without-security duty (entry 5-1, supersedes/refines " +
		"entry 1-1's SHOULD framing with an explicit SHOULD NOT) and adds the " +
		"client operational-mode recommendation about mechanisms that reveal " +
		"the password (entry 5-2); the remaining sentences (server " +
		"impersonation risk exposition, pointers to general SASL/Unicode/UTF-8/ " +
		"StringPrep security considerations) are exposition/pointers with no " +
		"independent normative content, skipped. Section 6 (IANA Considerations) " +
		"and Section 7 (Acknowledgements) are administrative, skipped. Section 8 " +
		"and 9 (References) are bibliographic, skipped. Appendix A (Changes " +
		"since RFC 2595) is non-normative change history; it does surface one " +
		"substantive point (LINE FEED/CARRIAGE RETURN are grammatically allowed " +
		"in authzid/authcid/passwd, subject to the same string-preparation " +
		"rules as other characters) but adds no new normative requirement text " +
		"beyond what section 2 already states, skipped. Cross-references: RFC " +
		"4422 (generic SASL framework — authzid semantics, mechanism " +
		"negotiation, security-layer install are framework-level, referenced " +
		"but not duplicated here) and RFC 4959 (SASL-IR — the client message " +
		"this module describes is exactly what would be carried as an initial " +
		"response on the AUTHENTICATE command when the server advertises " +
		"SASL-IR, eliminating the extra continuation round-trip shown in RFC " +
		"4616's own second example).",
	requirements: [
		{
			id: "RFC4616-1-1",
			source: "RFC4616",
			section: "1",
			title: "Advertise/use PLAIN only with adequate data security",
			text:
				"By default, implementations SHOULD advertise and make use of the PLAIN " +
				"mechanism only when adequate data security services are in place.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Binds the client's default posture on the AUTH=PLAIN capability/ " +
				"AUTHENTICATE PLAIN exchange in relation to the connection's security " +
				"state (e.g. pre-STARTTLS/pre-TLS plaintext channel vs. TLS-protected " +
				"or implicit-TLS channel) — the harness can arm a plaintext connection " +
				"and a TLS-protected one and observe whether the client offers/sends " +
				"PLAIN in each. Sharpened to a SHOULD NOT by section 5's restatement " +
				"(entry RFC4616-5-1); both are catalogued as the RFC states them twice " +
				"with different keyword polarity.",
		},
		{
			id: "RFC4616-2-1",
			source: "RFC4616",
			section: "2",
			title: "PLAIN client message format: authzid NUL authcid NUL passwd",
			text:
				"The client presents the authorization identity (identity to act as), " +
				"followed by a NUL (U+0000) character, followed by the authentication " +
				"identity (identity whose password will be used), followed by a NUL " +
				"(U+0000) character, followed by the clear-text password.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Declarative description of the mandatory message layout, not phrased " +
				"with an RFC 2119 keyword; judgment call to record as MUST since the " +
				"formal ABNF (message = [authzid] UTF8NUL authcid UTF8NUL passwd) that " +
				"immediately follows is the normative encoding of this same duty and " +
				"the mechanism has no alternative layout. Self-actualizing: the client " +
				"emits this string as the argument (or initial response, see RFC 4959) " +
				"of AUTHENTICATE PLAIN, directly observable on the wire.",
		},
		{
			id: "RFC4616-2-2",
			source: "RFC4616",
			section: "2",
			title: "authzid/authcid/passwd/NUL transferred as UTF-8",
			text:
				"The authorization identity (authzid), authentication identity " +
				"(authcid), password (passwd), and NUL character deliminators SHALL " +
				"be transferred as [UTF-8] encoded strings of [Unicode] characters.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"SHALL normalized to MUST per RFC 8174 (SHALL is listed alongside MUST " +
				"in RFC 2119's keyword set and carries the same force). Observable by " +
				"decoding the client's PLAIN message bytes as UTF-8 and checking " +
				"round-trip fidelity, including non-ASCII authcid/passwd content.",
		},
		{
			id: "RFC4616-2-3",
			source: "RFC4616",
			section: "2",
			title: "NUL MUST NOT appear inside authzid, authcid, or passwd",
			text:
				"As the NUL (U+0000) character is used as a deliminator, the NUL " +
				"(U+0000) character MUST NOT appear in authzid, authcid, or passwd " +
				"productions.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Directly observable on the wire: a compliant client never emits a " +
				"PLAIN message with more than the two structural NUL delimiters, even " +
				"when given an authzid/authcid/passwd value that itself contains a NUL " +
				"(the harness can supply such a value and confirm the client either " +
				"rejects it before encoding or strips/escapes it rather than emitting " +
				"a malformed message).",
		},
		{
			id: "RFC4616-2-4",
			source: "RFC4616",
			section: "2",
			title: "Discourage non-visible or hard-to-type characters",
			text:
				"Use of non-visible characters or characters that a user may be unable " +
				"to enter on some keyboards is discouraged.",
			level: "SHOULD NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "user-intent-policy",
			untestableRationale:
				"\"Discouraged\" has no RFC 2119 keyword and binds authoring/input " +
				"choices for authcid/authzid content (typically end-user-supplied " +
				"credentials or an operator-configured authzid), not client protocol " +
				"behavior. The client has no way to judge or reject a caller-supplied " +
				"identity string as \"non-visible\" or \"hard to type on some " +
				"keyboards\" — that judgment is inherently about human input " +
				"ergonomics/policy upstream of the wire, not a wire-observable " +
				"encoding rule. Judgment call: recorded at SHOULD NOT strength given " +
				"the advisory language, though the RFC itself uses no keyword here.",
		},
		{
			id: "RFC4616-5-1",
			source: "RFC4616",
			section: "5",
			title: "SHOULD NOT advertise/use PLAIN without adequate data security",
			text:
				"By default, implementations SHOULD NOT advertise and SHOULD NOT make " +
				"use of the PLAIN mechanism unless adequate data security services are " +
				"in place.",
			level: "SHOULD NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Restates entry RFC4616-1-1 with SHOULD NOT polarity in the Security " +
				"Considerations section; catalogued separately because it is a " +
				"distinct verbatim normative sentence at a distinct section/ordinal, " +
				"per the append-only id rule. Same observation strategy as " +
				"RFC4616-1-1: compare PLAIN use/advertisement on plaintext vs. " +
				"TLS-protected connections. Cross-reference RFC 8314 / RFC 4959 " +
				"SASL-IR context: adequate data security is most directly evidenced " +
				"by the connection being under TLS (implicit TLS port or " +
				"post-STARTTLS) before AUTHENTICATE PLAIN / PLAIN-as-initial-response " +
				"is sent.",
		},
		{
			id: "RFC4616-5-2",
			source: "RFC4616",
			section: "5",
			title: "Encourage an operational mode disabling password-revealing mechanisms",
			text:
				"Clients are encouraged to have an operational mode where all " +
				"mechanisms that are likely to reveal the user's password to the " +
				"server are disabled.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "capability-inventory",
			untestableRationale:
				"\"Encouraged\" is permissive/advisory with no RFC 2119 keyword, " +
				"treated as MAY strength. The duty asserts the client should possess " +
				"a configuration mode (an affordance) across its whole configuration " +
				"surface; a black-box exchange can show whether PLAIN was used in one " +
				"session but cannot establish the existence or absence of such an " +
				"operational mode in general, and there is no public knob today to " +
				"probe (mirrors the RFC3501/RFC9051 LOGIN-disable-knob " +
				"capability-inventory entries already in this catalog).",
		},
	],
};

export default rfc4616;
