import type { CatalogModule } from "../types";

const rfc4505: CatalogModule = {
	source: "RFC4505",
	extractionNote:
		"Full pass over RFC 4505 (Anonymous SASL Mechanism, obsoletes RFC 2245) " +
		"for client-binding requirements. Status of This Memo, Copyright Notice, " +
		"and Abstract are administrative/introductory, skipped. Section 1 " +
		"(Introduction) is descriptive scene-setting (mechanism name " +
		"'ANONYMOUS', purpose framing, 'this mechanism does not provide a " +
		"security layer', obsoletion note) with no independent client-binding " +
		"normative sentence beyond what Section 2 states operationally, skipped. " +
		"Section 2 (The Anonymous Mechanism) is the operative client surface: " +
		"the single-message exchange shape (entry 2-1), the trace-information " +
		"encoding rule tying to the 'trace' stringprep profile (entry 2-2), the " +
		"two permitted trace-information forms (entry 2-3), the permission-" +
		"before-identifying-info duty (entry 2-4, restated/sharpened by Section " +
		"5), and the token length ceiling from the 'Note to implementors' " +
		"(entries 2-5, 2-6); the formal ABNF grammar and the 'server that " +
		"permits anonymous access will announce support' sentence bind server " +
		"behavior/are illustrative restatements of the grammar, skipped. Section " +
		"3 (The trace Profile of Stringprep) defines the profile the client must " +
		"apply when preparing the message: the client-preparation duty (entry " +
		"3-1), no-mapping and no-normalization rules (entries 3-2, 3-3), the " +
		"prohibited-character-tables rule (entry 3-4), and the bidirectional-" +
		"check rule (entry 3-5); the framing sentences ('this profile is " +
		"designed for use with...', 'the character repertoire of this profile " +
		"is...', the unassigned-code-points sentence, the itemized table list " +
		"under entry 3-4) are either non-normative framing or already captured " +
		"by the entries above, skipped/merged. Section 4 (Example) is a fully " +
		"worked, non-normative IMAP transcript, illustrative only, skipped in " +
		"full (it does confirm the base64-over-IMAP framing is a profile-level, " +
		"not SASL-level, artifact — already noted in Section 2's own text). " +
		"Section 5 (Security Considerations) contributes client-binding duties " +
		"beyond Section 2: the falsifiability caveat is server/administrator-" +
		"facing exposition with no client action, skipped; the privacy-violation " +
		"caveat restates the permission duty as motivation (entry 5-1 records " +
		"the sharpened operative sentence that follows it); the operative " +
		"sentence 'Clients should not send the email address without the " +
		"explicit permission of the user and should offer the option of " +
		"supplying no trace information' is the client's concrete duty (entry " +
		"5-1) superseding/sharpening entry 2-4's framing; the remaining security " +
		"considerations (denial-of-service via write access, drop-box model, " +
		"expensive-operation throttling, per-user connection limits, anonymous " +
		"proxy servers, man-in-the-middle susceptibility, restricted-data-access " +
		"login-step recommendation, general SASL/StringPrep/Unicode/UTF-8 " +
		"security-consideration pointers) bind server/administrator deployment " +
		"posture or are non-actionable pointers, not client protocol behavior, " +
		"skipped. Section 6 (IANA Considerations) and Section 7 " +
		"(Acknowledgement) are administrative/registration text, skipped. " +
		"Sections 8-9 (References) are bibliographic, skipped. Appendix A " +
		"(Changes since RFC 2245) is non-normative change history restating " +
		"Section 2/3's UTF-8/255-character rules already captured, skipped. " +
		"Editor's Address and the Full Copyright Statement / Intellectual " +
		"Property / Acknowledgement boilerplate are administrative, skipped. " +
		"Cross-reference: RFC 4422 (generic SASL framework, of which ANONYMOUS " +
		"is one named mechanism) and RFC 4959 (SASL-IR, the initial-response " +
		"mechanism the client would use to send the trace-information message " +
		"as an AUTHENTICATE ANONYMOUS argument, avoiding the extra continuation " +
		"round trip shown in Section 4's example) are referenced but not " +
		"duplicated here.",
	requirements: [
		{
			id: "RFC4505-2-1",
			source: "RFC4505",
			section: "2",
			title: "ANONYMOUS exchange is a single client-to-server message",
			text:
				"The mechanism consists of a single message from the client to the " +
				"server.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Declarative description of the mechanism's shape, not phrased with " +
				"an RFC 2119 keyword; judgment call to record as MUST since the rest " +
				"of the RFC (grammar, Section 4 example) treats the one-message " +
				"exchange as the mechanism's defining, non-optional structure. " +
				"Observable on the wire: a compliant client sends exactly one " +
				"argument/initial-response for AUTHENTICATE ANONYMOUS (base64 of the " +
				"<message> production, empty string permitted) and does not attempt " +
				"a multi-message negotiation.",
		},
		{
			id: "RFC4505-2-2",
			source: "RFC4505",
			section: "2",
			title: "Trace information, if included, is UTF-8/Unicode prepared per the trace stringprep profile",
			text:
				"The client may include in this message trace information in the " +
				"form of a string of [UTF-8]-encoded [Unicode] characters prepared " +
				"in accordance with [StringPrep] and the \"trace\" stringprep " +
				"profile defined in Section 3 of this document.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Grants the option to include trace information at all (MAY), and " +
				"binds the encoding/preparation rule when the client does so. " +
				"Observable by decoding the client's ANONYMOUS message bytes as " +
				"UTF-8 and checking that the content is well-formed per the trace " +
				"profile (see entries 3-1..3-5): a compliant client either sends no " +
				"trace information (empty message) or sends prepared UTF-8 text, " +
				"never raw bytes that fail UTF-8 decoding or contain profile-" +
				"prohibited characters.",
		},
		{
			id: "RFC4505-2-3",
			source: "RFC4505",
			section: "2",
			title: "Trace information should be an email address or an opaque non-'@' token",
			text:
				"The trace information, which has no semantical value, should take " +
				"one of two forms: an Internet email address, or an opaque string " +
				"that does not contain the '@' (U+0040) character and that can be " +
				"interpreted by the system administrator of the client's domain.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Binds the client's choice of trace-information content when it " +
				"chooses to send any (per entry 2-2): the value sent should be " +
				"either RFC 2822 addr-spec-shaped (contains '@') or an opaque token " +
				"containing no '@' character at all — the ABNF's UTF1 production " +
				"formalizes the non-'@' constraint for the token form. Observable by " +
				"inspecting the decoded trace-information string for exactly one of " +
				"the two shapes; a value that superficially resembles an email " +
				"address but is malformed, or a token containing '@', would violate " +
				"this duty.",
		},
		{
			id: "RFC4505-2-4",
			source: "RFC4505",
			section: "2",
			title: "Use identifying trace information only with the user's permission",
			text:
				"For privacy reasons, an Internet email address or other information " +
				"identifying the user should only be used with permission from the " +
				"user.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "out-of-band",
			untestableRationale:
				"Whether the human user granted permission for the client to send " +
				"identifying trace information is an out-of-band fact about user " +
				"consent, not something observable from the wire exchange itself — " +
				"the harness can see which trace string was sent but cannot " +
				"determine whether the user authorized sending it. Sharpened to an " +
				"explicit, still-untestable-for-the-same-reason operative duty in " +
				"Section 5 (entry RFC4505-5-1), which additionally requires an " +
				"affirmative opt-out affordance.",
		},
		{
			id: "RFC4505-2-5",
			source: "RFC4505",
			section: "2",
			title: "Token trace information is capped at 255 UTF-8-encoded Unicode characters",
			text:
				"The <token> production is restricted to 255 UTF-8-encoded Unicode " +
				"characters.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"'Restricted to' is declarative rather than RFC 2119-keyworded; " +
				"judgment call to record as MUST since this is the formalization of " +
				"the ABNF 'token = 1*255TCHAR' production immediately preceding it " +
				"— the grammar itself makes the limit a hard bound, not an advisory " +
				"one. Applies only to the opaque-token form of trace information " +
				"(not the email form, which follows addr-spec). Observable by " +
				"counting decoded Unicode characters in a client-emitted token-" +
				"shaped trace string and confirming the client never emits more " +
				"than 255.",
		},
		{
			id: "RFC4505-2-6",
			source: "RFC4505",
			section: "2",
			title: "Token trace information may be as long as 1020 octets when encoded",
			text:
				"As the encoding of a characters uses a sequence of 1 to 4 octets, a " +
				"token may be as long as 1020 octets.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Implementor's-note arithmetic consequence of entry 2-5 (255 " +
				"characters times up to 4 octets per UTF-8 character), phrased with " +
				"MAY strength to signal this is a ceiling on a permitted maximum " +
				"rather than a call to action — the substantive testable bound is " +
				"already entry 2-5's character count; the octet figure is a " +
				"corollary that the harness can equivalently check by measuring the " +
				"raw byte length of a client-emitted token-shaped trace string " +
				"against 1020 as an upper bound.",
		},
		{
			id: "RFC4505-3-1",
			source: "RFC4505",
			section: "3",
			title: "Client prepares the message production per the trace stringprep profile",
			text:
				"Specifically, the client is to prepare the <message> production in " +
				"accordance with this profile.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"'Is to prepare' is declarative rather than RFC 2119-keyworded; " +
				"judgment call to record as MUST since this sentence is the " +
				"explicit statement of who performs stringprep preparation and it " +
				"is presented as mandatory groundwork before transmission, " +
				"consistent with entry 2-2's binding of the message encoding to " +
				"this profile. This entry is the umbrella client-preparation duty; " +
				"entries 3-2..3-5 are the specific rules the client applies while " +
				"carrying it out.",
		},
		{
			id: "RFC4505-3-2",
			source: "RFC4505",
			section: "3",
			title: "No mapping step in trace-profile preparation",
			text: "No mapping is required by this profile.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"A stringprep 'no mapping required' rule governs the internal " +
				"character-transformation algorithm the client runs while preparing " +
				"the message, not a property of the transmitted bytes: many " +
				"distinct client-side code paths (including one that mapped " +
				"characters but happened to produce an unchanged result for a " +
				"given input) are indistinguishable on the wire from one that " +
				"correctly performs no mapping. Only inputs deliberately chosen to " +
				"expose a mapping step (e.g. characters with a stringprep case-fold " +
				"or width-mapping in other profiles) would reveal a violation, and " +
				"RFC 4505's trace profile defines none to test against — the " +
				"absence-of-a-step cannot be black-box confirmed in general.",
		},
		{
			id: "RFC4505-3-3",
			source: "RFC4505",
			section: "3",
			title: "No Unicode normalization step in trace-profile preparation",
			text: "No Unicode normalization is required by this profile.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"Same reasoning as entry 3-2: whether the client's internal " +
				"preparation pipeline applies a normalization step is not " +
				"observable purely from the output bytes for well-formed input, " +
				"since already-normalized input round-trips identically whether or " +
				"not a (no-op) normalization pass ran. Distinguishing 'no " +
				"normalization performed' from 'normalization performed but input " +
				"was already normal' requires knowledge of the client's internal " +
				"processing, not just the wire artifact.",
		},
		{
			id: "RFC4505-3-4",
			source: "RFC4505",
			section: "3",
			title: "Trace-profile message excludes prohibited StringPrep character tables",
			text: "Characters from the following tables of [StringPrep] are prohibited:",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Introduces the itemized list (C.2.1 ASCII control characters, C.2.2 " +
				"non-ASCII control characters, C.3 private use characters, C.4 non-" +
				"character code points, C.5 surrogate codes, C.6 characters " +
				"inappropriate for plain text, C.8 characters that change display " +
				"properties, C.9 tagging characters) that this single entry " +
				"represents in aggregate rather than as six-plus separate catalog " +
				"rows, since the RFC states the prohibition once and enumerates the " +
				"tables as its object. Observable by inspecting a client-emitted, " +
				"decoded trace-information string for characters falling in any of " +
				"the named StringPrep C.2.1/C.2.2/C.3/C.4/C.5/C.6/C.8/C.9 tables " +
				"(e.g. ASCII control characters, unpaired surrogates) and confirming " +
				"none are present, e.g. when the harness supplies such a character " +
				"as part of a caller-controlled trace value and observes whether " +
				"the client strips/rejects it rather than transmitting it verbatim.",
		},
		{
			id: "RFC4505-3-5",
			source: "RFC4505",
			section: "3",
			title: "Trace-profile preparation requires bidirectional character checking",
			text:
				"This profile requires bidirectional character checking per Section " +
				"6 of [StringPrep].",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"StringPrep Section 6 bidirectional checking (the 'Bidi' rule " +
				"restricting mixing of RandALCat and LCat characters, and requiring " +
				"a RandALCat string to start and end with RandALCat characters) is " +
				"an internal validation algorithm the client runs before deciding " +
				"whether to send a trace string at all; a black-box observer sees " +
				"only whether a given string was sent or withheld, which is equally " +
				"consistent with the client running the check correctly, running a " +
				"different check, or running no check at all when the supplied " +
				"trace value happens to already satisfy (or violate and get " +
				"rejected upstream for unrelated reasons) the Bidi rule. No wire-" +
				"observable artifact distinguishes 'bidirectional check performed' " +
				"from 'no check performed, input happened to pass'.",
		},
		{
			id: "RFC4505-5-1",
			source: "RFC4505",
			section: "5",
			title: "Do not send email trace info without permission; offer no-trace-information option",
			text:
				"Clients should not send the email address without the explicit " +
				"permission of the user and should offer the option of supplying no " +
				"trace information, thus only exposing the source IP address and " +
				"time.",
			level: "SHOULD NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "out-of-band",
			untestableRationale:
				"Two duties: (1) not sending the user's email address as trace " +
				"information absent explicit user permission — like entry 2-4, " +
				"whether permission was obtained is an out-of-band fact about user " +
				"consent invisible to a black-box wire observer, who can see only " +
				"which string (if any) was sent; and (2) that the client offers a " +
				"UI/API affordance to supply no trace information — an affordance-" +
				"existence claim about the client's configuration surface, not a " +
				"single-exchange wire observation (a session sending no trace " +
				"information is consistent with the option existing and being " +
				"exercised, or with the client simply defaulting to empty with no " +
				"user-facing option at all). Sharpens entry 2-4's framing into an " +
				"explicit SHOULD NOT plus an additional MAY-strength affordance " +
				"duty; both halves share the same out-of-band untestability.",
		},
	],
};

export default rfc4505;
