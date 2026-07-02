import type { CatalogModule } from "../types";

/**
 * XOAUTH2 (Google vendor doc, not an RFC/IANA spec):
 * https://developers.google.com/gmail/imap/xoauth2-protocol
 *
 * There are no RFC section numbers to anchor on, so `section` uses the
 * doc's own heading-derived buckets ("format", "exchange", "error") and
 * ids follow `XOAUTH2-<section>-<ordinal>`.
 *
 * Fetch caveat: this is an HTML page, not a fixed .txt RFC. It was
 * retrieved via WebFetch, which converts HTML to markdown and passes it
 * through a summarizing model rather than returning raw bytes — so
 * byte-for-byte verbatim substring matching against the live page is not
 * guaranteed the way it is for RFC .txt sources. Two independent fetches
 * (a full-content pass and a targeted "quote every normative sentence"
 * pass) were cross-checked against each other; quotes below reproduce
 * what both fetches independently returned for the same sentence
 * (agreement across two extraction prompts as a proxy for fidelity to
 * the source). Each entry's `notes` records this provenance.
 */
const xoauth2: CatalogModule = {
	source: "XOAUTH2",
	extractionNote:
		"XOAUTH2 (Google vendor doc, https://developers.google.com/gmail/imap/xoauth2-protocol): " +
		"extracted the client-binding content from the 'The SASL XOAUTH2 Mechanism' and " +
		"'IMAP Protocol Exchange' sections — the initial-client-response byte format " +
		"(XOAUTH2-format-1/2), the AUTHENTICATE XOAUTH2 exchange shape including the SASL-IR " +
		"single-round-trip option (XOAUTH2-exchange-1/2), and the empty-response-after-error-" +
		"challenge duty (XOAUTH2-error-1/2). Reviewed and deliberately excluded as non-client-" +
		"binding: the 'Using OAuth 2.0'/'OAuth 2.0 Scopes' sections (app-registration and " +
		"Google-side verification/compliance policy, not wire behavior of an IMAP client), and " +
		"'Domain-wide delegation for Google Workspace' (a Workspace admin/service-account " +
		"authorization-flow concern, not a SASL client-binding duty). Provenance: this is a " +
		"vendor doc (source: XOAUTH2, not IANA/RFC); fetched via WebFetch (HTML-to-markdown " +
		"through a summarizing model, not raw bytes) on 2026-07-01 — quotes are reproduced as " +
		"returned by two independent fetch passes cross-checked against each other, not verified " +
		"as byte-identical to the live page the way a .txt RFC source would be. See per-entry " +
		"notes for which quotes are exact-as-fetched vs necessarily paraphrased.",
	requirements: [
		{
			id: "XOAUTH2-format-1",
			source: "XOAUTH2",
			section: "format",
			title: "SASL XOAUTH2 initial client response byte format",
			text:
				'The SASL XOAUTH2 initial client response has the following format: base64("user=" {User} "^Aauth=Bearer " {Access Token} "^A^A")',
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Vendor doc (source: XOAUTH2), not IANA/RFC — applies only when the client offers/uses " +
				"AUTH=XOAUTH2. Quote matched exactly across both independent WebFetch passes (full-content " +
				"pass and targeted quote-extraction pass) of " +
				"https://developers.google.com/gmail/imap/xoauth2-protocol as fetched on 2026-07-01; " +
				"treated as verbatim-as-fetched rather than byte-verified against the raw page (WebFetch " +
				"returns HTML-to-markdown through a summarizing model, not raw bytes). Judgment call on " +
				"level: the doc states this as a declarative format definition with no RFC 2119 keyword, " +
				"but the byte layout (literal key names 'user='/'auth=Bearer ', the two literal Ctrl-A " +
				"separators, the trailing double Ctrl-A, base64 framing per RFC 4648) is the wire contract " +
				"the Google IMAP server parses — any deviation is a protocol-level interop failure, not a " +
				"style preference — so this is graded MUST despite the absence of the keyword. ^A denotes " +
				"Ctrl+A (0x01).",
		},
		{
			id: "XOAUTH2-format-2",
			source: "XOAUTH2",
			section: "format",
			title: "Base64 encoding per RFC 4648",
			text: "Use the base64 encoding mechanism defined in RFC 4648.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Vendor doc (source: XOAUTH2). Quote matched exactly across both independent WebFetch " +
				"passes as fetched on 2026-07-01. Graded MUST: this is an imperative instruction ('Use...') " +
				"pinning the encoding alphabet/padding a compliant client must produce for the initial " +
				"response to be parseable by the server; not phrased with an RFC 2119 keyword but " +
				"functionally load-bearing for interop, same reasoning as XOAUTH2-format-1.",
		},
		{
			id: "XOAUTH2-exchange-1",
			source: "XOAUTH2",
			section: "exchange",
			title: "AUTHENTICATE XOAUTH2 command invocation",
			text:
				"To log in with the SASL XOAUTH2 mechanism, the client invokes the `AUTHENTICATE` command " +
				"with the mechanism parameter of `XOAUTH2`, and the initial client response as constructed " +
				"above.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Vendor doc (source: XOAUTH2), from the 'IMAP Protocol Exchange' section. Re-quoted from " +
				"the actual page sentence (previously an invented command template not on the page); the " +
				"quote is reproduced with the page's own backtick code-formatting around `AUTHENTICATE` " +
				"and `XOAUTH2`, and was confirmed verbatim across two independent WebFetch passes of " +
				"https://developers.google.com/gmail/imap/xoauth2-protocol as fetched on 2026-07-01 " +
				"(WebFetch returns HTML-to-markdown through a summarizing model, so this is " +
				"verbatim-as-fetched rather than byte-verified against the raw page). Graded MUST: this is " +
				"the command name and argument shape the server dispatches on; a client using a different " +
				"mechanism keyword would not be invoking XOAUTH2 at all. Cross-reference: RFC 4959 (SASL-IR) defines the " +
				"AUTHENTICATE command's initial-response extension that this exchange relies on; RFC 4422 " +
				"defines the base AUTHENTICATE/SASL negotiation framework.",
		},
		{
			id: "XOAUTH2-exchange-2",
			source: "XOAUTH2",
			section: "exchange",
			title: "SASL-IR enables single-round-trip AUTHENTICATE",
			text:
				"The SASL-IR capability allows for sending the initial client response in the first line " +
				"of the `AUTHENTICATE` command, so that only one round trip is required for authentication.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Vendor doc (source: XOAUTH2). Re-quoted verbatim to include the previously truncated " +
				"trailing words 'for authentication' and the page's backtick formatting around " +
				"`AUTHENTICATE`; confirmed verbatim across two independent WebFetch passes of the page as " +
				"fetched on 2026-07-01 (verbatim-as-fetched, not byte-verified — WebFetch returns " +
				"HTML-to-markdown through a summarizing model). Graded MAY, not MUST: the sentence is descriptive " +
				"('allows for... so that... is required' describes an optimization enabled by the server's " +
				"SASL-IR capability), not an instruction that the client must always use the single-line " +
				"form — a client may instead perform the base multi-line AUTHENTICATE/challenge/response " +
				"exchange without SASL-IR. Cross-reference: RFC 4959 (IMAP SASL-IR extension) is the RFC " +
				"this capability and behavior come from; XOAUTH2 itself only describes using it.",
		},
		{
			id: "XOAUTH2-error-1",
			source: "XOAUTH2",
			section: "error",
			title: "Client sends empty response after error challenge",
			text: 'The client sends an empty response ("\\r\\n") to the challenge containing the error message.',
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableRationale:
				"Observing this duty requires the harness to first induce the server side of an XOAUTH2 " +
				"failure (an invalid/expired bearer token rejected with a base64 JSON error challenge) and " +
				"then verify the client's very next line on the wire is exactly an empty CRLF continuation " +
				"— which in turn requires the client to actually implement XOAUTH2 as a SASL mechanism. " +
				"Per XOAUTH2-format-1's notes and this module's extractionNote, XOAUTH2 support is " +
				"self-actualizing (unimplemented in this client today): there is no code path that sends " +
				"AUTHENTICATE XOAUTH2, receives a challenge, or would emit any second-line response at all, " +
				"so no black-box observation of 'what the client sends after an error challenge' is " +
				"currently possible. Once XOAUTH2 auth is implemented client-side this becomes directly " +
				"testable (arm a scripted server that replies to AUTHENTICATE XOAUTH2 with a base64 error " +
				"challenge, assert the next client line is bare CRLF) — the gap is capability, not intrinsic " +
				"unobservability of the wire behavior.",
			untestableTheme: "capability-inventory",
			notes:
				"Vendor doc (source: XOAUTH2), from the 'IMAP Protocol Exchange' / error-handling " +
				"discussion. Quote matched exactly across both independent WebFetch passes as fetched on " +
				"2026-07-01. Graded MUST: imperative present-tense instruction ('The client sends...') " +
				"describing mandatory protocol conduct, reinforced by XOAUTH2-error-2's explicit 'requires' " +
				"language for the same duty. Cross-reference: RFC 7628 (OAUTHBEARER) §3.2.1 defines the " +
				"standardized successor mechanism's analogous 'client sends a subsequent empty response' " +
				"duty after a kv-error-response challenge — XOAUTH2 predates RFC 7628 and OAUTHBEARER was " +
				"designed in part to standardize this exact pattern.",
		},
		{
			id: "XOAUTH2-error-2",
			source: "XOAUTH2",
			section: "error",
			title: "SASL protocol requires empty response to error challenge",
			text: "The SASL protocol requires clients to send an empty response to this challenge.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableRationale:
				"Same duty as XOAUTH2-error-1 (this sentence is the doc's own restatement, using 'requires' " +
				"instead of describing it in the third person), so the same gap applies: XOAUTH2 " +
				"authentication is not implemented client-side today, so there is no code path that could " +
				"emit a post-challenge response of any shape, empty or otherwise, for the harness to " +
				"observe. See XOAUTH2-error-1's rationale for the concrete future test sketch.",
			untestableTheme: "capability-inventory",
			notes:
				"Vendor doc (source: XOAUTH2). Quote matched exactly across both independent WebFetch " +
				"passes as fetched on 2026-07-01. Graded MUST: explicit 'requires' language, the strongest " +
				"binding-force wording on the page for any client duty. Applies identically to POP and SMTP " +
				"per the doc, but this catalog only extracts the IMAP-relevant client duty. Cross-reference: " +
				"RFC 7628 (OAUTHBEARER), the IETF-standardized successor to XOAUTH2, §3.2.1 codifies this " +
				"same empty-response-on-error behavior as a normative SASL exchange step rather than a " +
				"vendor convention.",
		},
	],
};

export default xoauth2;
