import type { CatalogModule } from "../types";

const rfc7628: CatalogModule = {
	source: "RFC7628",
	extractionNote:
		"PHASE 3 EXTRACTION: client-binding OAUTHBEARER duties only, per scope. " +
		"Section 1 (Introduction) and Section 2 (Terminology) are context-setting " +
		"(OAuth flow narrative, RFC 2119 boilerplate, base64 note already covered by " +
		"RFC 4959/RFC 3501's base64-encoding requirement) — no independent " +
		"client-binding normative text. Section 3 (OAuth SASL Mechanism " +
		"Specifications): the mechanism-selection preamble and TLS sentence " +
		"extracted (3-1); the failure/dummy-response flow summary extracted (3-2). " +
		"Section 3.1 (Initial Client Response): the GS2-header/kvpair response " +
		"shape (3.1-1), the REQUIRED 'auth' key carrying the Bearer payload " +
		"(3.1-2, the concrete 'auth=Bearer <token>' duty), and the single-kvsep " +
		"failure-only response shape (3.1-3) extracted. The host/port MUST is " +
		"SKIPPED: its text ('For OAuth token types such as OAuth 1.0a that use " +
		"keyed message digests, the client MUST send host and port number " +
		"key/values') binds only OAuth Access Token Types using keyed message " +
		"digests (OAUTH10A), which is out of scope for this OAUTHBEARER-focused " +
		"extraction; the paired server-side fail-the-request clause in the same " +
		"sentence is a server duty regardless. Section 3.1.1 (Reserved " +
		"Key/Values): mthd/path/post/qs defaults and the 'OAuth authorization " +
		"schemes MAY define usage' grant are OAUTH10A/keyed-message-digest " +
		"machinery (signature base string construction) — out of scope, skipped " +
		"in full; no OAUTHBEARER-applicable normative text remains. Section 3.2 " +
		"(Server's Response) and 3.2.1 (OAuth Identifiers in the SASL Context): " +
		"server-side validation duties and application-integration guidance — no " +
		"client-binding normative text, skipped. Section 3.2.2 (Server Response " +
		"to Failed Authentication): defines the server's JSON error object " +
		"(status/scope/openid-configuration) and carries a SHOULD NOT on scope " +
		"formatting and a SHOULD on client scope defaulting behavior, but these " +
		"are token-endpoint / OAuth-authorization-flow behaviors external to the " +
		"SASL exchange itself (out-of-band relative to what the compliance " +
		"harness observes on the AUTHENTICATE wire) — skipped as out of scope for " +
		"a protocol-message-format catalog; flagged for judgment below. Section " +
		"3.2.3 (Completing an Error Message Sequence): the client's MUST-send " +
		"dummy-response-or-abort duty on a failure challenge extracted (3.2.3-1) " +
		"— this is the core 'client MUST send AQ==/abort after a failure " +
		"challenge' duty scoped by the task. Section 3.3 (OAuth Access Token " +
		"Types using Keyed Message Digests): entirely OAUTH10A signature-base-" +
		"string construction — out of scope, skipped in full. Section 4 " +
		"(Examples): illustrative only, not independently normative; the AQ== " +
		"dummy-response example (4.3) is cited in 3.2.3-1's notes as concrete " +
		"confirmation of the abstract %x01 duty, not catalogued as its own " +
		"requirement. Section 5 (Security Considerations) restates the " +
		"OAUTHBEARER TLS MUST already captured in 3-1 ('TLS MUST be provided by " +
		"the application when choosing this authentication mechanism') — not " +
		"re-catalogued as a duplicate entry; the OAUTH10A-scoped 'RECOMMENDED' " +
		"and the SHOULD-cache-credentials guidance are informative/OAUTH10A-" +
		"scoped and skipped. Section 6 (Internationalization Considerations): " +
		"informative discussion of identifier display, no MUST/SHOULD client " +
		"duty. Section 7 (IANA Considerations): registry bookkeeping, not a " +
		"client duty, skipped.",
	requirements: [
		{
			id: "RFC7628-3-1",
			source: "RFC7628",
			section: "3",
			title: "TLS MUST be used for OAUTHBEARER",
			text:
				"for the two mechanisms specified in this document, TLS MUST be " +
				"used for OAUTHBEARER to protect the bearer token; for OAUTH10A, " +
				"the use of TLS is RECOMMENDED.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Applicability is conditional: binds only when the client selects " +
				"AUTH=OAUTHBEARER. Tested as: the AUTHENTICATE OAUTHBEARER exchange is " +
				"only attempted over a TLS-secured connection (implicit TLS port or " +
				"post-STARTTLS), never in cleartext. Cross-reference: RFC 4422 §3.3 " +
				"defines the general SASL requirement that a mechanism's own security " +
				"properties (here, bearer-token confidentiality) determine whether an " +
				"external security layer such as TLS is required; RFC 7628 §5 restates " +
				"this same MUST ('TLS MUST be provided by the application when choosing " +
				"this authentication mechanism') — not catalogued separately as it is " +
				"the identical duty repeated, not new normative content.",
		},
		{
			id: "RFC7628-3-2",
			source: "RFC7628",
			section: "3",
			title: "Client MUST send an additional message after a failed authentication",
			text:
				"In the case where authentication fails, the server sends an error " +
				"result; the client MUST then send an additional message to the " +
				"server in order to allow the server to finish the exchange.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"This is the general-flow statement of the duty; the concrete wire " +
				"format of that 'additional message' (a single %x01 byte, base64 " +
				"'AQ==', or a SASL abort) is separately catalogued at " +
				"RFC7628-3.2.3-1 — kept as two entries because §3 states the " +
				"obligation exists (client must respond) while §3.2.3 states its " +
				"required shape (specific abort/dummy forms); both are independently " +
				"verbatim RFC sentences. Applicability is conditional on the client " +
				"having initiated an AUTH=OAUTHBEARER exchange that the server then " +
				"fails.",
		},
		{
			id: "RFC7628-3.1-1",
			source: "RFC7628",
			section: "3.1",
			title: "Initial client response is a GS2 header plus key/value pairs",
			text:
				"Client responses are a GS2 [RFC5801] header followed by zero or " +
				"more key/value pairs, or it may be empty.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment call: the source sentence is declarative ('are'), not a " +
				"lowercase or explicit RFC 2119 keyword, but it defines the mandatory " +
				"wire shape of the initial client response for these mechanisms (the " +
				"ABNF 'client-resp' production that immediately follows makes the " +
				"same shape normative in grammar form) — leveled MUST per RFC 8174 " +
				"judgment: a client that sends a response outside this grammar (e.g. " +
				"omitting the gs2-header, or malformed kvpair syntax) cannot be " +
				"correctly parsed as this mechanism. Tested as: the base64-decoded " +
				"AUTHENTICATE OAUTHBEARER initial response begins with a GS2 header " +
				"('n,' or 'y,' or 'p=...,', followed by an optional authzid segment " +
				"and a comma) and, if non-empty beyond the header, is followed by " +
				"%x01-separated key=value pairs terminated by a trailing %x01%x01. " +
				"Cross-reference: RFC 4959 (SASL-IR) governs sending this initial " +
				"response inline on the AUTHENTICATE command line rather than waiting " +
				"for a server continuation request; this entry governs only the " +
				"payload's internal shape once it is sent, by either delivery path.",
		},
		{
			id: "RFC7628-3.1-2",
			source: "RFC7628",
			section: "3.1",
			title: "Client response MUST include the REQUIRED 'auth' key carrying the Bearer payload",
			text:
				"auth (REQUIRED):  The payload that would be in the HTTP " +
				"Authorization header if this OAuth exchange was being carried out " +
				"over HTTP.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment call: 'REQUIRED' is capitalized as an RFC 2119 keyword " +
				"in this key/value definition list (equivalent to MUST per RFC 2119 " +
				"§1) even though the surrounding prose is a definition-list entry " +
				"rather than a full imperative sentence — leveled MUST. This is the " +
				"concrete 'auth=Bearer <token>' duty named in the extraction scope: " +
				"for the OAUTHBEARER mechanism the auth value takes the form " +
				"'Bearer <token>' (confirmed by the worked examples in §4.1, e.g. " +
				"'auth=Bearer vF9dft4qmTc2Nvb3RlckBhbHRhdmlzdGEuY29tCg=='). Tested " +
				"as: the decoded initial client response contains a kvpair whose key " +
				"is 'auth' and whose value begins with 'Bearer '. Cross-reference: " +
				"the XOAUTH2 vendor mechanism (catalogued separately in " +
				"ext/xoauth2.ts) is the older Google-specific predecessor that " +
				"popularized this same 'auth=Bearer <token>' initial-response shape " +
				"outside of IETF standardization; RFC 7628 standardizes the " +
				"equivalent duty for AUTH=OAUTHBEARER.",
		},
		{
			id: "RFC7628-3.1-3",
			source: "RFC7628",
			section: "3.1",
			title: "Single-kvsep client response is valid only in the authentication-failure context",
			text:
				"The client response consisting of only a single kvsep is used " +
				"only when authentication fails and is only valid in that context.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment call: phrased as a definitional constraint ('is used " +
				"only ... and is only valid in that context') rather than an " +
				"explicit MUST/MUST NOT, but the double 'only' restriction is a " +
				"binding usage constraint on the client's message choice per RFC " +
				"8174 judgment — leveled MUST (a client MUST NOT send a bare-kvsep " +
				"response as its *initial* response with intent other than " +
				"triggering the failure path; the RFC's own next sentence confirms " +
				"a bare-kvsep first message is permitted only as a degenerate " +
				"discovery probe the server MAY simply fail). Tested as: a " +
				"bare-%x01 (base64 'AQ==') response is sent by the client only as " +
				"the second message of a two-round exchange, following a server " +
				"failure challenge — never as the unsolicited first message of a " +
				"normal (non-probing) AUTHENTICATE OAUTHBEARER attempt. " +
				"Applicability is conditional on the client's OAUTHBEARER usage.",
		},
		{
			id: "RFC7628-3.2.3-1",
			source: "RFC7628",
			section: "3.2.3",
			title: "Client MUST send a dummy response or SASL abort after a failure challenge",
			text:
				"The client MUST then send either an additional client response " +
				"consisting of a single %x01 (control A) character to the server " +
				"in order to allow the server to finish the exchange or a SASL " +
				"abort message as generally defined in Section 3.5 of SASL " +
				"[RFC4422].",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"This is the core error-response continuation duty named in the " +
				"extraction scope. The single %x01 character, base64-encoded, is " +
				"'AQ==' (confirmed by the worked example in §4.3: '\"AQ==\" is the " +
				"base64 encoding of the ASCII value 0x01'); the RFC also names an " +
				"IMAP-specific alternative abort form ('*', the AUTHENTICATE-" +
				"cancellation syntax of RFC 3501 §6.2.2) as satisfying the same " +
				"'SASL abort message' alternative. Tested as: after the server " +
				"sends a continuation-request challenge carrying a failure JSON " +
				"object (following a rejected initial response), the client's next " +
				"line on the wire is either the literal base64 token 'AQ==' or the " +
				"IMAP command-continuation cancellation '*' — and the client does " +
				"not attempt to resend corrected OAuth credentials in that slot, " +
				"since RFC 4422 §3.6 (cross-referenced below) prohibits a second " +
				"credential-bearing round after failure. Cross-reference: RFC 4422 " +
				"§3.6 ('SASL mechanisms MUST NOT include ... additional information " +
				"in an unsuccessful outcome') is why this fixed-format dummy/abort " +
				"response exists at all — this entry is RFC 7628's client-side " +
				"realization of that RFC 4422 framework constraint. RFC 4959 " +
				"(SASL-IR) does not alter this continuation-phase behavior since " +
				"SASL-IR only affects delivery of the *initial* response.",
		},
	],
};

export default rfc7628;
