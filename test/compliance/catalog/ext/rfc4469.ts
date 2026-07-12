import type { CatalogModule } from "../types";

const rfc4469: CatalogModule = {
	source: "RFC4469",
	extractionNote:
		"Full document reviewed (Abstract, §1 Introduction, §2 The CATENATE Capability, §3 The " +
		"APPEND Command, §4 Response Codes [§4.1 BADURL Response, §4.2 TOOBIG Response], §5 Formal " +
		"Syntax, §6 Acknowledgements, §7 Security Considerations, §8 IANA Considerations, Appendix A " +
		"Examples, §9 Normative References, Author's Address, Full Copyright Statement, Intellectual " +
		"Property). RFC 4469 (April 2006, LEMONADE era) contains NO RFC 2119 UPPERCASE keywords " +
		"anywhere in the document — verified by a whole-document grep for MUST/SHOULD/MAY/SHALL/" +
		"REQUIRED, zero matches. Every client-binding duty is therefore stated in imperative or " +
		"descriptive prose (or embedded in the §5 ABNF), so EVERY entry below carries a judgment-" +
		"level RFC 2119 mapping with a `notes` explanation of why that level was assigned in the " +
		"absence of a keyword (RFC 8174 discipline: no UPPERCASE keyword → judgment call, level " +
		"inferred from the strength and nature of the prose obligation). " +
		"10 client-binding entries extracted. Command-syntax duties the client emits to use the " +
		"extension (all from §3/§5, judgment-MUST as they define the sole legal wire form of an " +
		"extended CATENATE APPEND): (§3-1) the extended APPEND form replaces the single message " +
		"literal with 'CATENATE (' cat-part list ')'; (§3-2) each TEXT cat-part is the atom TEXT " +
		"followed by a literal; (§3-3) each URL cat-part is the atom URL followed by an astring " +
		"holding an RFC 2192 IMAP URL; (§3-4) at least one cat-part is required (ABNF " +
		"'cat-part *(SP cat-part)', min-one). Scope/content duties (§3, judgment): (§3-5) CATENATE " +
		"is scoped to relative message/part URLs resolvable from the current authenticated session; " +
		"(§3-6) the assembled message must be a valid RFC 2822/MIME message; (§3-7) the client " +
		"supplies the MIME boundaries and Content-Type/Content-Transfer-Encoding lines. " +
		"Response-handling duties the client must accept (§4, judgment): (§4.1-1) a tagged NO may " +
		"carry a BADURL resp-code the client must accept as a well-formed append failure; (§4.2-1) " +
		"a tagged NO may carry a TOOBIG resp-code the client must accept likewise. Capability-gating " +
		"duty (§2, judgment): (§2-1) the client only uses the CATENATE extended APPEND form when the " +
		"server has advertised the CATENATE capability. " +
		"TESTABLE (6): §3-1 (extended-APPEND command form), §3-2 (TEXT cat-part atom), §3-3 (URL " +
		"cat-part atom), §3-4 (min-one-part), §4.1-1 (BADURL acceptance), §4.2-1 (TOOBIG " +
		"acceptance) — all currently self-actualizing FAILs because driver.append()'s catenate " +
		"option throws NotImplementedError, so the client has no CATENATE surface at all (it can " +
		"neither emit the extended form nor be driven to accept a BADURL/TOOBIG NO), which the " +
		"suite records as a failure for each. UNTESTABLE (4): §2-1 (capability-inventory — whether " +
		"the client checked the advertised capability before emitting CATENATE is wire-invisible); " +
		"§3-5 (internal-decision — a relative and an out-of-scope URL are both valid astrings on " +
		"the wire, divergence surfaces only as the server's own NO); §3-6 and §3-7 " +
		"(content-processing — well-formed RFC 2822/MIME message and its MIME " +
		"boundaries/Content-Type/Content-Transfer-Encoding scaffolding are properties of the " +
		"message body the client assembles, not of the IMAP command framing, and a URL part's " +
		"octets are spliced server-side so the client cannot even see them). " +
		"Excluded as server-only: §2 'A server that supports this extension returns \"CATENATE\" as " +
		"one of the responses to the CAPABILITY command' (server advertisement duty — the client " +
		"side is captured by §2-1's gate); §3 'The APPEND command does not cause the \\Seen flag to " +
		"be set for any catenated body part' and 'The APPEND command does not change the selected " +
		"mailbox' (server-side invariants of the append operation, no client action); §3 'the " +
		"server copies octets, unchanged ... It does no data conversion ... nor any verification' " +
		"(server processing of catenated parts); §3 the base-URL evaluation rules " +
		"('imap://user@server/' / '.../mailbox') and the no-further-LOGIN/AUTHENTICATE clause " +
		"(server-side URL resolution semantics); §3/§5 the note that a server implementing only " +
		"this spec 'would return NO' to an out-of-scope absolute URL (server behavior); §4.1/§4.2 " +
		"the definition of WHEN the server returns BADURL/TOOBIG and the server's defensive 4-GB " +
		"handling (server response-generation duty — the client side is captured by §4.1-1/§4.2-1 " +
		"acceptance entries); §3 'If the server implements the IMAP UIDPLUS extension ... it will " +
		"also return an APPENDUID response code' (conditional server behavior, and APPENDUID client " +
		"handling is cataloged under RFC4315 UIDPLUS, not here). §5 Formal Syntax otherwise defines " +
		"the ABNF productions realized by §3-1..§3-4; §6 Acknowledgements, §7 Security " +
		"Considerations (explicitly 'does not raise any security considerations that are not " +
		"present for the base protocol'), §8 IANA Considerations, and Appendix A Examples contain " +
		"no distinct client-binding normative language. " +
		"REV2-CORE CROSS-REFERENCE: CATENATE is NOT folded into IMAP4rev2 (RFC 9051) — the RFC 9051 " +
		"catalog contains no CATENATE requirement, and CATENATE remains a standalone advertised " +
		"extension in rev2 exactly as in rev1. All entries therefore default to " +
		"profiles: [\"rev1\",\"rev2\"] (no rev1-only tagging, no double-scoring risk): a rev2 client " +
		"that opts into CATENATE is bound by this document alone for every duty here. Total: 10 " +
		"client-binding entries (RFC4469-2-1, RFC4469-3-1..7, RFC4469-4.1-1, RFC4469-4.2-1). " +
		"Untestable: 4 (RFC4469-2-1 capability-inventory; RFC4469-3-5 internal-decision; " +
		"RFC4469-3-6, RFC4469-3-7 content-processing). Testable: 6 (RFC4469-3-1..4, RFC4469-4.1-1, " +
		"RFC4469-4.2-1).",
	requirements: [
		// ── §2 The CATENATE Capability ───────────────────────────────────────────

		{
			id: "RFC4469-2-1",
			source: "RFC4469",
			section: "2",
			title: "Client (implicit) only uses CATENATE when the server advertises the capability",
			text:
				"A server that supports this extension returns \"CATENATE\" as one of the responses " +
				"to the CAPABILITY command.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "capability-inventory",
			untestableRationale:
				"The document states the capability contract from the server's side (the server " +
				"advertises \"CATENATE\" via CAPABILITY); the reciprocal client duty — do not send " +
				"the extended CATENATE APPEND form to a server that has not advertised CATENATE — is " +
				"implicit in that contract. Whether the client consulted the advertised capability " +
				"list before emitting CATENATE is an internal decision about its own capability " +
				"inventory: a client that issues CATENATE speculatively without checking, and a " +
				"client that checked and found it advertised, produce byte-identical wire forms. Any " +
				"divergence surfaces only as the server's own BAD/NO rejection of an unsupported " +
				"command, which is the server's behavior, not an observable property of the client's " +
				"capability bookkeeping.",
			notes:
				"Judgment level (implicit MUST). RFC 4469 has no RFC 2119 keywords at all; this " +
				"level is inferred from the capability-gating contract that governs every advertised " +
				"IMAP extension (a client must not use an extension the server has not advertised). " +
				"The quoted sentence is §2 verbatim (server-facing); the CLIENT duty it implies is " +
				"the gate captured here. CATENATE is standalone in IMAP4rev2 (no RFC 9051 " +
				"counterpart), so this remains source-of-truth for both profiles.",
		},

		// ── §3 The APPEND Command / §5 Formal Syntax ─────────────────────────────

		{
			id: "RFC4469-3-1",
			source: "RFC4469",
			section: "3",
			title: "Client emits the extended APPEND with CATENATE and a parenthesized part list",
			text:
				"If the extended form is used, \"CATENATE\" and a parenthesized list of message " +
				"literals and message URLs follows, each of which is appended to the new message.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit MUST — no RFC 2119 keyword in RFC 4469). This defines the " +
				"sole legal wire form of a CATENATE append: in place of the base APPEND's single " +
				"message literal, the client sends the atom CATENATE, a space, then a parenthesized " +
				"list of cat-parts. The §5 ABNF fixes the exact form: 'append-data =/ \"CATENATE\" " +
				"SP \"(\" cat-part *(SP cat-part) \")\"'. A matcher for this entry must require the " +
				"literal atom CATENATE followed by SP and a '('-delimited list, and reject a bare " +
				"single-literal APPEND masquerading as CATENATE. Currently self-actualizing FAIL: " +
				"driver.append()'s catenate option throws NotImplementedError, so the client cannot " +
				"emit the extended form at all. CATENATE is standalone in rev2 (no RFC 9051 " +
				"restatement) — profiles rev1+rev2.",
		},
		{
			id: "RFC4469-3-2",
			source: "RFC4469",
			section: "3",
			title: "Client encodes a TEXT cat-part as the atom TEXT followed by a literal",
			text: "text-literal = \"TEXT\" SP literal",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit MUST — ABNF-derived, no RFC 2119 keyword). §5 defines the " +
				"literal-data cat-part as the atom TEXT, a space, and an IMAP literal ('{n}' " +
				"synchronizing literal or '{n+}' non-synchronizing under LITERAL+). §3 corroborates: " +
				"'If a message literal is specified (indicated by \"TEXT\"), the octets following the " +
				"count are appended.' A matcher must require the exact TEXT atom before the literal " +
				"and reject a bare literal without the TEXT keyword. Structurally part of the §3-1 " +
				"CATENATE form but scored separately because it fixes an independent atom the client " +
				"must emit correctly. Self-actualizing FAIL (no CATENATE driver surface). Standalone " +
				"in rev2 — profiles rev1+rev2.",
		},
		{
			id: "RFC4469-3-3",
			source: "RFC4469",
			section: "3",
			title: "Client encodes a URL cat-part as the atom URL followed by an IMAP-URL astring",
			text: "url = \"URL\" SP astring",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit MUST — ABNF-derived, no RFC 2119 keyword). §5 defines the " +
				"URL cat-part as the atom URL, a space, and an astring; the trailing note of §5 " +
				"binds that astring's content: 'The astring in the definition of url ... contain[s] " +
				"an imapurl as defined by [2]' (RFC 2192, IMAP URL Scheme). §3 corroborates: 'If a " +
				"message URL is specified (indicated by \"URL\"), the octets of the body part " +
				"pointed to by that URL are appended'. A matcher must require the URL atom before " +
				"the astring and reject a URL value that is not a syntactically valid IMAP URL. " +
				"Self-actualizing FAIL (no CATENATE driver surface). Standalone in rev2 — profiles " +
				"rev1+rev2.",
		},
		{
			id: "RFC4469-3-4",
			source: "RFC4469",
			section: "3",
			title: "Client includes at least one cat-part in the CATENATE list",
			text: "append-data =/ \"CATENATE\" SP \"(\" cat-part *(SP cat-part) \")\"",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit MUST — ABNF cardinality, no RFC 2119 keyword). The §5 " +
				"production is 'cat-part *(SP cat-part)': one mandatory cat-part followed by zero or " +
				"more additional ones. An empty CATENATE list — 'CATENATE ()' — is therefore not a " +
				"legal extended APPEND; the client must supply at least one TEXT or URL part. §3 " +
				"corroborates the semantics: 'The subsequent command parameters specify the message " +
				"parts that are appended sequentially to the output message.' A matcher must reject " +
				"a CATENATE with an empty parenthesized list. Self-actualizing FAIL (no CATENATE " +
				"driver surface). Standalone in rev2 — profiles rev1+rev2.",
		},
		{
			id: "RFC4469-3-5",
			source: "RFC4469",
			section: "3",
			title: "Client (implicit) uses only relative current-session IMAP URLs in CATENATE",
			text:
				"The present document only describes the behavior of the command using IMAP URLs " +
				"that refer to specific messages or message parts on the current IMAP server from " +
				"the current authenticated IMAP session.  Because of that, only relative IMAP " +
				"message or message part URLs (i.e., those having no scheme or <iserver>) are used.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"This scopes CATENATE URLs to relative message/part references resolvable from the " +
				"current authenticated session; the following note warns that 'a server implementing " +
				"only this specification would return NO' to an absolute or out-of-session URL. " +
				"Whether a given URL the client composes stays within this relative/current-session " +
				"scope is a decision about what data the client chooses to reference, driven by its " +
				"own intent — not a fixed protocol framing a black-box test can pin. A relative and " +
				"an out-of-scope URL are both syntactically valid astrings on the wire; the only " +
				"consequence of overreach is the server's own NO, which is server behavior. The " +
				"client's adherence to the intended scope is thus not observable independently of " +
				"the server's rejection.",
			notes:
				"Judgment level (implicit SHOULD — descriptive-scope prose, no RFC 2119 keyword). " +
				"Assigned SHOULD rather than MUST because the sentence describes the scope the " +
				"present document covers ('only describes', '...are used') and explicitly leaves " +
				"absolute/out-of-session URLs to a future extension, rather than flatly forbidding " +
				"the client from ever emitting them. The astring content is further bound to be an " +
				"IMAP URL per RFC 2192 (see RFC4469-3-3). CATENATE is standalone in rev2 — profiles " +
				"rev1+rev2.",
		},
		{
			id: "RFC4469-3-6",
			source: "RFC4469",
			section: "3",
			title: "Client (implicit) ensures the catenated result is a valid RFC 2822/MIME message",
			text:
				"The client is responsible for making sure that the catenated message is in the " +
				"format of an Internet Message Format (RFC 2822) [4] or Multipurpose Internet Mail " +
				"Extension (MIME) [5] message.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "content-processing",
			untestableRationale:
				"The duty is that the message assembled from the catenated TEXT and URL parts is a " +
				"well-formed Internet Message Format (RFC 2822) or MIME message. This is a property " +
				"of the message content the client composes from its parts, not of the IMAP protocol " +
				"framing: the client cannot even see the octets a URL part will contribute (the " +
				"server splices them server-side), and whether the final assembled message parses " +
				"as valid RFC 2822/MIME is a content-processing judgment over message bodies rather " +
				"than a wire-observable command form. A black-box compliance harness observing the " +
				"IMAP exchange cannot decide message-format validity of the server-assembled result.",
			notes:
				"Judgment level (implicit MUST — 'is responsible for', no RFC 2119 keyword). " +
				"'Responsible for making sure' reads as a firm obligation, hence MUST rather than " +
				"SHOULD. Distinct from RFC4469-3-7 (the mechanical MIME-boundary/header duty); this " +
				"entry is the overarching well-formedness obligation. CATENATE is standalone in " +
				"rev2 — profiles rev1+rev2.",
		},
		{
			id: "RFC4469-3-7",
			source: "RFC4469",
			section: "3",
			title: "Client (implicit) inserts MIME boundaries and Content-Type/CTE lines as needed",
			text:
				"The client is also responsible for inserting appropriate MIME boundaries between " +
				"body parts, and writing MIME Content-Type and Content-Transfer-Encoding lines as " +
				"needed in the appropriate places.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "content-processing",
			untestableRationale:
				"Because the server copies URL-referenced octets unchanged and does no data " +
				"conversion or MIME verification, the client must itself supply the MIME structure " +
				"gluing the catenated parts together: boundary delimiters between body parts and the " +
				"Content-Type / Content-Transfer-Encoding header lines in the right places. This is " +
				"content-processing over the message the client assembles — the correctness of the " +
				"MIME scaffolding lives in the message body octets, not in the IMAP command framing, " +
				"and a black-box harness cannot judge whether the boundaries and header lines the " +
				"client emitted are 'appropriate' for the parts being joined.",
			notes:
				"Judgment level (implicit MUST — 'is also responsible for', no RFC 2119 keyword), " +
				"paralleling RFC4469-3-6's level for the same 'is responsible for' construction. " +
				"Context: the immediately preceding sentences establish the server 'does no data " +
				"conversion (e.g., MIME transfer encodings) nor any verification that the data is " +
				"appropriate', which is why this mechanical duty falls to the client. CATENATE is " +
				"standalone in rev2 — profiles rev1+rev2.",
		},

		// ── §4 Response Codes ────────────────────────────────────────────────────

		{
			id: "RFC4469-4.1-1",
			source: "RFC4469",
			section: "4.1",
			title: "Client accepts a BADURL resp-code on a CATENATE append failure",
			text:
				"The BADURL response code is returned if the APPEND fails to process one of the " +
				"specified URLs.  Possible reasons for this are bad URL syntax, unrecognized URL " +
				"schema, invalid message UID, or invalid body part.  The BADURL response code " +
				"contains the first URL specified as a parameter to the APPEND command that has " +
				"caused the operation to fail.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit client-handling MUST — the quoted text describes the " +
				"server's generation of BADURL; the reciprocal client duty to accept a tagged NO " +
				"carrying '[BADURL <url>]' as a well-formed append failure, rather than a protocol " +
				"error, is inferred, since §3 introduces these as 'Two response codes ... that can " +
				"be used in the tagged NO response if the APPEND command fails'). The §5 ABNF fixes " +
				"the shape: 'badurl-response-code = \"BADURL\" SP url-resp-text'. A client issuing " +
				"CATENATE must parse and surface a NO [BADURL ...] without choking on the resp-code. " +
				"Currently self-actualizing FAIL: driver.append() catenate throws " +
				"NotImplementedError, so no CATENATE exchange (and thus no BADURL acceptance path) " +
				"can be driven. Standalone in rev2 — profiles rev1+rev2.",
		},
		{
			id: "RFC4469-4.2-1",
			source: "RFC4469",
			section: "4.2",
			title: "Client accepts a TOOBIG resp-code on a CATENATE append failure",
			text:
				"The TOOBIG response code is returned if the resulting message will exceed the 4-GB " +
				"IMAP message limit.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit client-handling MUST — the quoted text is the server's " +
				"generation rule for TOOBIG; the client duty to accept a tagged NO carrying " +
				"'[TOOBIG]' as a well-formed append failure is the reciprocal, per §3's framing of " +
				"the two §4 codes as usable 'in the tagged NO response if the APPEND command " +
				"fails'). The §5 ABNF fixes the shape: 'toobig-response-code = \"TOOBIG\"' (an " +
				"atom-only resp-code, no argument). A client issuing CATENATE must parse and surface " +
				"a NO [TOOBIG] without treating the resp-code as a protocol error. The server-only " +
				"remainder of §4.2 (defensive 4-GB handling, optional server-specific size limit) " +
				"is excluded. Self-actualizing FAIL (no CATENATE driver surface). Standalone in " +
				"rev2 — profiles rev1+rev2.",
		},
	],
};

export default rfc4469;
