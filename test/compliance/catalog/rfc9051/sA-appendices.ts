import type { SpecRequirement } from "../types";

export const note =
	"Appendices A-D (Backward Compatibility with IMAP4rev1, BINARY, LIST-EXTENDED; 63-Bit Sizes) " +
	"were flagged as a coverage gap by the §9-§11 extractor (see s9-syntax-security.ts's module " +
	"note) and are captured here. " +
	"Appendix A (Backward Compatibility with IMAP4rev1): reviewed in full. Two client-binding MUSTs " +
	"extracted from the main appendix body (ENABLE IMAP4rev2 issuance precondition to use IMAP4rev2 " +
	"under dual advertisement; Mailbox International Naming Convention compatibility for clients " +
	"intending IMAP4rev1-server compatibility). The appendix's other normative sentences bind the " +
	"server only (the opening 'implementation ... can advertise' is permissive/non-normative for " +
	"whichever party advertises; 'servers advertising both ... would never return such removed " +
	"response data items' binds the server as sender; 'Servers advertising both IMAP4rev1 and " +
	"IMAP4rev2 MUST NOT generate UTF-8-quoted strings' binds the server as generator). The closing " +
	"'Also see Appendix D' sentence is a cross-reference, not an independent duty. " +
	"Appendix A.1 (Mailbox International Naming Convention): reviewed in full. The descriptive " +
	"modified-UTF-7 encoding rules (which characters shift, which octets map to base64, the five " +
	"corrected UTF-7 problems, the illustrative examples) carry no RFC 2119 keyword and are encoding " +
	"description, not duty text. Three sentences carry keywords: 'Modified base64 MUST NOT be used " +
	"to represent any printing of a US-ASCII character' and 'names ... MUST end in US-ASCII' bind " +
	"whichever party constructs a modified-UTF-7 name (server or client, as either can originate a " +
	"mailbox-name string sent on the wire — e.g., a client issuing CREATE/RENAME with a non-ASCII " +
	"name); both are captured as client-binding since a compliant client constructing such a name is " +
	"squarely within scope, mirroring how RFC3501's parallel appendix text is treated in this " +
	"catalog's RFC 3501 module. 'server implementations MUST preserve the exact form ... and treat " +
	"that text as case sensitive' binds the server only and is not itemized. 'Server implementations " +
	"SHOULD verify that any mailbox name with an embedded \"&\" character, used as an argument to " +
	"CREATE, is: in the correctly modified UTF-7 syntax...' binds the server only (verification duty) " +
	"and is not itemized, but its client-binding counter-duty sentence ('client implementations MUST " +
	"NOT depend upon the server doing this and SHOULD NOT attempt to create a mailbox name with an " +
	"embedded \"&\" character unless it complies with the modified UTF-7 syntax') is extracted as two " +
	"entries (MUST NOT + SHOULD NOT). The final 'Server implementations that export a mail store ... " +
	"MUST convert' sentence binds the server only. " +
	"Appendix B (Backward Compatibility with BINARY Extension): reviewed in full. Its single " +
	"normative sentence ('IMAP4rev2 implementations that support full [RFC3516] functionality need " +
	"to also advertise the BINARY capability') binds whichever implementation advertises CAPABILITY " +
	"data, which in the IMAP protocol model is exclusively the server (clients consume, but never " +
	"emit, a CAPABILITY response/response code) — no client-binding duty exists in this appendix. No " +
	"entries extracted. Additionally the sentence uses lowercase 'need to', not an RFC 2119 keyword " +
	"at all, reinforcing its non-normative-strength framing. " +
	"Appendix C (Backward Compatibility with LIST-EXTENDED Extension): reviewed in full. Its " +
	"descriptive sentences ('IMAP4rev2 incorporates most of the functionality...'; 'the syntax for " +
	"multiple mailbox patterns is not supported ... unless LIST-EXTENDED capability is also " +
	"advertised') describe server-side feature scoping and capability advertisement (again server-" +
	"only per the CAPABILITY model) and carry no RFC 2119 keyword at all. No entries extracted. " +
	"Appendix D (63-Bit Body Part and Message Sizes): reviewed in full. One client-binding duty " +
	"extracted ('client implementations have to expect them', 63-bit-long body part/message sizes) " +
	"— a lowercase-keyword sentence (RFC 8174 judgment call) treated as the practical equivalent of " +
	"MUST given its plain meaning (a client that does not accept/handle 63-bit sizes will fail against " +
	"a compliant server). The preceding sentence ('Server implementations don't have to support 63-" +
	"bit-long body parts/message sizes') binds the server only (permissive non-requirement) and is not " +
	"itemized. The interoperability-issue paragraph (IMAP4rev1 clients unable to retrieve >4Gb " +
	"messages; servers needing to replace/hide oversized messages) is entirely server-facing " +
	"guidance/description with no RFC 2119 keyword and 'This document doesn't prescribe any " +
	"implementation strategy' is explicitly non-normative; no entries extracted from that paragraph.";

export const requirements: SpecRequirement[] = [
	// ── Appendix A: Backward Compatibility with IMAP4rev1 ───────────────────

	{
		id: "RFC9051-A-1",
		source: "RFC9051",
		section: "A",
		title: "Client MUST issue ENABLE IMAP4rev2 to use IMAP4rev2 when both revisions are advertised",
		text:
			'If both IMAP4rev1 and IMAP4rev2 are advertised, an IMAP client that ' +
			'wants to use IMAP4rev2 MUST issue an "ENABLE IMAP4rev2" command.',
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"Conditional: binds only when the server's CAPABILITY response/code advertises both " +
			"IMAP4rev1 and IMAP4rev2, and the client wants IMAP4rev2 behavior. Testable: script a " +
			"server that advertises both IMAP4REV1 and IMAP4REV2 capabilities and verify the client " +
			"issues 'ENABLE IMAP4rev2' before relying on rev2-only behavior (e.g., before issuing " +
			"commands/expecting responses that are only valid once IMAP4rev2 is enabled).",
	},
	{
		id: "RFC9051-A-2",
		source: "RFC9051",
		section: "A",
		title: "Clients intending IMAP4rev1-server compatibility MUST be compatible with the Mailbox International Naming Convention",
		text:
			"Servers advertising both IMAP4rev1 and IMAP4rev2, and clients " +
			"intending to be compatible with IMAP4rev1 servers, MUST be compatible " +
			"with the Mailbox International Naming Convention described in " +
			"Appendix A.1.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "untestable",
		untestableTheme: "capability-inventory",
		untestableRationale:
			"The sentence binds two distinct parties in one clause (servers advertising both " +
			"revisions; clients intending IMAP4rev1-server compatibility) with a single compound " +
			"'MUST be compatible with' duty. For the client half, 'compatible with' the naming " +
			"convention as a whole is an implementation-wide capability claim, not one wire-observable " +
			"behavior: it is realized through the convention's individual constituent rules (each " +
			"itemized separately below as RFC9051-A-4/A-5/A-6/A-7), and a black-box test can only " +
			"exercise those constituent rules as they are individually triggered, not 'compatibility' " +
			"as a holistic property. This pointer duty is retained for traceability; its operative " +
			"content is realized through the testable sub-duties in Appendix A.1.",
		notes:
			"Conditional: binds the client only when it intends to remain compatible with IMAP4rev1 " +
			"servers (an IMAP4rev2-only client has no obligation here, per Appendix A.1's opening " +
			"sentence, itemized as RFC9051-A-3). The server half of this compound sentence " +
			"('Servers advertising both ... MUST be compatible') binds the server and is not " +
			"separately itemized.",
	},

	// ── Appendix A.1: Mailbox International Naming Convention ──────────────

	{
		id: "RFC9051-A-3",
		source: "RFC9051",
		section: "A",
		title: "Mailbox International Naming Convention support not required for IMAP4rev2-only clients",
		text:
			"Support for the Mailbox International Naming Convention described in " +
			"this section is not required for IMAP4rev2-only clients and servers. " +
			"It is only used for backward compatibility with IMAP4rev1 " +
			"implementations.",
		level: "MAY",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "untestable",
		untestableTheme: "capability-inventory",
		untestableRationale:
			"This sentence carries no RFC 2119 keyword; it states a scoping fact ('not required') " +
			"rather than a prohibition or mandate. Framed here as the MAY-equivalent baseline that " +
			"RFC9051-A-2's conditional MUST narrows: a client that is IMAP4rev2-only has no compatibility " +
			"duty at all, so there is no pass/fail wire behavior to test — non-observance and observance " +
			"of the convention are both compliant for such a client. A black-box test cannot distinguish " +
			"'IMAP4rev2-only, convention not needed' from 'intends IMAP4rev1 compatibility but " +
			"non-compliant', since both look identical unless the convention is actually triggered.",
		notes:
			"Included for completeness/context of the conditional scope on RFC9051-A-2 and the " +
			"following entries; establishes that the entire Appendix A.1 sub-cluster binds only " +
			"clients intending IMAP4rev1-server compatibility, not IMAP4rev2-only clients. Level " +
			"recorded as MAY (permission / no obligation) since the sentence states the convention is " +
			"optional outside the backward-compatibility use case, despite carrying no explicit RFC 2119 " +
			"keyword — a judgment call under RFC 8174.",
	},
	{
		id: "RFC9051-A-4",
		source: "RFC9051",
		section: "A",
		title: "Modified base64 MUST NOT represent a printable US-ASCII character that can represent itself",
		text:
			'Modified base64 MUST NOT be ' +
			'used to represent any printing of a US-ASCII character that can ' +
			"represent itself.  Only characters inside the modified base64 " +
			"alphabet are permitted in modified base64 text.",
		level: "MUST NOT",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"Conditional: binds whichever party constructs a modified-UTF-7 mailbox name string — " +
			"including a client issuing CREATE/RENAME/SUBSCRIBE etc. with a non-ASCII mailbox name " +
			"while intending IMAP4rev1-server compatibility (RFC9051-A-2's scope). The second sentence " +
			"('Only characters inside the modified base64 alphabet are permitted') is included as it " +
			"states the same encoding-validity constraint from the complementary direction (alphabet " +
			"membership) and shares the client-construction binding. Testable: instruct the client to " +
			"create/reference a mailbox name containing non-ASCII characters and inspect the wire-level " +
			"encoded mailbox-name string for conformance (no superfluous encoding of representable " +
			"ASCII, only valid modified-base64 alphabet characters used).",
	},
	{
		id: "RFC9051-A-5",
		source: "RFC9051",
		section: "A",
		title: "Modified UTF-7 names MUST end in US-ASCII",
		text:
			"However, all names start in US-ASCII and " +
			'MUST end in US-ASCII; that is, a name that ends with a non-ASCII ' +
			'ISO-10646 character MUST end with a "-".',
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"Conditional: binds whichever party constructs a modified-UTF-7 mailbox name string, " +
			"including a client (see RFC9051-A-4's note). Testable: instruct the client to create/" +
			"reference a mailbox name ending in a non-ASCII character and verify the wire-level encoded " +
			'name terminates with a shift-back "-" (US-ASCII closing shift), not left open in the ' +
			"modified-base64 shifted state.",
	},
	{
		id: "RFC9051-A-6",
		source: "RFC9051",
		section: "A",
		title: "Client MUST NOT depend on the server validating embedded-ampersand mailbox names",
		text:
			"However, client implementations MUST NOT " +
			"depend upon the server doing this and SHOULD NOT attempt to create a " +
			"mailbox name with an embedded \"&\" character unless it complies with " +
			"the modified UTF-7 syntax.",
		level: "MUST NOT",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "untestable",
		untestableTheme: "internal-decision",
		untestableRationale:
			"'MUST NOT depend upon' constrains the client's internal assumption/reliance on server-side " +
			"validation behavior, not a wire-observable action. A compliant client (that independently " +
			"validates or simply never emits invalid names) and a non-compliant client that happens to " +
			"only ever send valid names because it never exercised the failure path produce identical " +
			"wire traces; the duty only becomes observable if the client actually emits a non-conformant " +
			"embedded-'&' name — but sending such a name would itself violate the paired SHOULD NOT " +
			"duty (RFC9051-A-7) rather than demonstrate reliance on server validation. There is no " +
			"black-box action that isolates 'depends upon the server' from 'independently validates or " +
			"never triggers the case'.",
		notes:
			"Conditional: binds the client only when constructing a mailbox name with an embedded '&' " +
			"character while intending IMAP4rev1-server compatibility (RFC9051-A-2's scope). Split from " +
			"the SHOULD NOT clause in the same sentence, which is itemized separately as RFC9051-A-7 " +
			"since it is independently testable (unlike this MUST NOT dependency-on-reliance clause).",
	},
	{
		id: "RFC9051-A-7",
		source: "RFC9051",
		section: "A",
		title: "Client SHOULD NOT attempt to create an embedded-ampersand mailbox name unless it complies with modified UTF-7 syntax",
		text:
			"However, client implementations MUST NOT " +
			'depend upon the server doing this and SHOULD NOT attempt to create a ' +
			'mailbox name with an embedded "&" character unless it complies with ' +
			"the modified UTF-7 syntax.",
		level: "SHOULD NOT",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"Conditional: binds the client only when it constructs a CREATE (or similar) mailbox-name " +
			"argument containing an embedded '&' character while intending IMAP4rev1-server " +
			"compatibility (RFC9051-A-2's scope). The full sentence is quoted verbatim (identical text " +
			"to RFC9051-A-6) since the MUST NOT and SHOULD NOT clauses are grammatically fused ('MUST " +
			"NOT depend ... and SHOULD NOT attempt ...'); this entry's normative focus is the SHOULD NOT " +
			"half. Testable: instruct the client to create a mailbox name with a syntactically invalid " +
			"embedded-'&' sequence (e.g., a superfluous shift like the RFC's own counter-example " +
			'\'&U,BTFw-&ZeVnLIqe-\') and verify the client does not send it as-is — e.g., it rejects, ' +
			"corrects, or refuses to issue the CREATE rather than transmitting the non-conformant name " +
			"verbatim.",
	},

	// ── Appendix B: Backward Compatibility with BINARY Extension ───────────
	// No entries: reviewed in full (see extractionNote). The appendix's single
	// normative sentence binds whichever implementation advertises the BINARY
	// capability, which is exclusively the server in the IMAP CAPABILITY model.

	// ── Appendix C: Backward Compatibility with LIST-EXTENDED Extension ────
	// No entries: reviewed in full (see extractionNote). Purely descriptive;
	// carries no RFC 2119 keyword at all.

	// ── Appendix D: 63-Bit Body Part and Message Sizes ──────────────────────

	{
		id: "RFC9051-D-1",
		source: "RFC9051",
		section: "D",
		title: "Client implementations have to expect 63-bit-long body part / message sizes",
		text:
			"Server implementations don't have to " +
			"support 63-bit-long body parts/message sizes; however, client " +
			"implementations have to expect them.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			'Lowercase-keyword sentence ("have to expect", not an RFC 2119 keyword) — judgment call ' +
			"under RFC 8174: treated as the practical equivalent of MUST, since its plain meaning is a " +
			"hard interoperability requirement (a client that cannot handle a 63-bit size value will " +
			"fail/misbehave against a compliant server advertising one). The preceding server-permissive " +
			"clause ('Server implementations don't have to support...') is retained in the quoted text " +
			"for grammatical completeness (the 'however' contrast is load-bearing) but binds the server " +
			"only, not the client. Testable: script a server that returns a body part or message size " +
			"value exceeding 32-bit range (up to 63 bits) in a FETCH response (e.g., RFC822.SIZE or a " +
			"BODYSTRUCTURE octet count) and verify the client parses it correctly rather than " +
			"truncating, overflowing, or erroring.",
	},
];
