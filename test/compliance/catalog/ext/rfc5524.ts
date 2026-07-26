import type { CatalogModule } from "../types";

const rfc5524: CatalogModule = {
	source: "RFC5524",
	extractionNote:
		"RFC 5524 (Extended URLFETCH for Binary and Converted Parts). Full document reviewed: " +
		"Abstract, §1 Introduction, §2 Conventions Used in This Document, §3 Extended URLFETCH " +
		"[§3.1 Command Parameters, §3.2 Response Metadata], §4 Example Exchanges, §5 Formal " +
		"Syntax, §6 IANA Considerations, §7 Security Considerations, §8 Acknowledgements, §9 " +
		"References [§9.1 Normative, §9.2 Informative], Author's Address.\n\n" +
		"RELATIONSHIP TO RFC 4467: this document extends URLFETCH (RFC4467-7-3 command form, " +
		"RFC4467-8-3/-8-4 response-acceptance duties, RFC4467-9-3 base ABNF) with optional per-URL " +
		"parameters and a richer, parenthesized response form, gated behind its own distinct " +
		"capability 'URLAUTH=BINARY' (§3, §6: 'This document defines the URLFETCH=BINARY IMAP " +
		"capability' — the document text says URLFETCH=BINARY in §6 but the capability string " +
		"registered and used throughout the formal syntax is 'URLAUTH=BINARY' (the Abstract does " +
		"not itself name any capability string — it is purely descriptive purpose-of-the-extension " +
		"prose); §3 " +
		"'This extension is available in any IMAP server implementation that includes " +
		"URLAUTH=BINARY within its capability string' and §5 ABNF 'capability =/ " +
		'"URLAUTH=BINARY"\' are the authoritative forms and are what this catalog\'s capability-' +
		"gate entry cites). Per the task's reconciliation instruction, this file cross-references " +
		"RFC4467 ids for duties already cataloged there (the unextended command/response shape, " +
		"the base capability-gating pattern, the not-selected-mailbox-required behavior) rather " +
		"than duplicating them — only the BINARY/BODYPARTSTRUCTURE-specific deltas are cataloged " +
		"as new RFC5524 entries.\n\n" +
		"CLIENT/SERVER SPLIT. Excluded as server-only: §3.2 'Servers MUST understand all identity " +
		"content transfer encodings defined in [MIME], as well as the transformation encodings " +
		"\"Base64\" [BASE64] and \"Quoted-Printable\" [MIME]' (server decoding capability, not a " +
		"client action); the BINARY response item's 'If this is not possible ... then this MAY " +
		"contain NIL' (server fallback-generation behavior — the client's counterpart accept-NIL " +
		"duty is folded into RFC5524-3.2-2 below since a client requesting BINARY must in any case " +
		"accept an NIL item, which is the same parse duty as any nstring-valued metadata item); §7 " +
		"'Implementors are directed to the security considerations within [IMAP], [URLAUTH], and " +
		"[BINARY]' and the attacker-capability discussion (informative, no new client MUST); §6 " +
		"IANA registration provisions (registry-maintenance policy, not a live client duty); §9 " +
		"references and boilerplate; §4 worked examples are illustrative only (already covered by " +
		"the §3.1/§3.2 prose and §5 ABNF entries) and are not separately extracted.\n\n" +
		"OUT OF SCOPE (per the Phase 6 reconciliation): the URL-PARTIAL token defined by RFC 5550 " +
		"is a distinct, later document not reviewed here; RFC 5524 §5's grammar has no URL-PARTIAL " +
		"production of its own (it only reuses [URLAUTH] and [BINARY] productions plus its own " +
		"url-fetch-param/url-metadata-el sets), so there is nothing in THIS document's text to " +
		"extract for URL-PARTIAL regardless.\n\n" +
		"CLIENT-BINDING extracted (7 entries): §1/§3/§5 the URLAUTH=BINARY capability gate " +
		"(distinct from the base RFC4467-1-1 URLAUTH gate — a client MUST NOT send the extended, " +
		"parenthesized URLFETCH form or request BINARY/BODYPARTSTRUCTURE unless URLAUTH=BINARY " +
		"specifically was advertised, even if plain URLAUTH was); §3.1 the extended URLFETCH " +
		"per-URL parameter syntax and the three defined parameters (BODYPARTSTRUCTURE, BINARY, " +
		"BODY), the client MUST NOT request both BINARY and BODY, and the no-more-than-once-per-URL " +
		"MUST NOT; §3.2 the client's accept-duty for the extended, per-URL parenthesized metadata " +
		"response form (BODYPARTSTRUCTURE / BINARY / BODY metadata elements, including the literal8 " +
		"NUL-octet framing rule for BINARY); §5 the ABNF-only ext-vs-simple response-shape " +
		"discipline (a client that issued the unextended url-fetch-simple form MUST accept only the " +
		"unextended urldata-simple response shape back, not the extended form).\n\n" +
		"Untestable: 0 entries. Total: 7 client-binding entries (RFC5524-3-1, RFC5524-3.1-1..4, " +
		"RFC5524-3.2-1..2). All cross-reference the corresponding RFC4467 base entries in their " +
		"notes rather than restating shared unextended-URLFETCH duties.\n\n" +
		"RFC 8174 discipline: RFC 5524 predates RFC 8174 and cites RFC 2119 only (§2: 'The key " +
		"words \"MUST\", \"MUST NOT\", \"REQUIRED\", \"SHALL\", \"SHALL NOT\", \"SHOULD\", \"SHOULD " +
		'NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as ' +
		"described in RFC 2119 [KEYWORDS]'), so lowercase 'must'/'should' were never normative " +
		"here anyway; every extracted entry rests on an UPPERCASE RFC 2119 keyword in its source " +
		"sentence EXCEPT the capability-gate entry (RFC5524-3-1, judgment call parallel to " +
		"RFC4467-1-1), flagged in its notes; RFC5524-3.2-2's `text` field (the ABNF-plus-comment " +
		"shape) does itself carry uppercase RFC 2119 keywords ('literal8 MUST be used', 'content " +
		"SHOULD use nstring') and so is not part of this exception list, despite being a " +
		"structural/ABNF-derived entry like the RFC4467-9-1..3 precedent it otherwise parallels.\n\n" +
		"PROFILES: URLAUTH=BINARY is not folded into IMAP4rev2 (RFC 9051) — verified by grepping " +
		"catalog/rfc9051.ts for URLAUTH/BINARY/BODYPARTSTRUCTURE-as-capability (zero hits for this " +
		"capability token). It remains a standalone extension in rev2, so every entry defaults " +
		"profiles: [\"rev1\",\"rev2\"] (a rev2 client using URLAUTH=BINARY is bound by this document " +
		"alone; no double-scoring against a 9051 core duty is possible, matching the RFC4467 " +
		"precedent this document extends). All entries are applicability: conditional (bind only " +
		"when the client uses the URLAUTH=BINARY extension).",
	requirements: [
		// ── §1 / §3 / §5 Capability gate ─────────────────────────────────────────

		{
			id: "RFC5524-3-1",
			source: "RFC5524",
			section: "3",
			title: "Client MUST NOT use extended URLFETCH parameters without the URLAUTH=BINARY capability",
			text:
				"This extension is available in any IMAP server implementation that\n   includes URLAUTH=BINARY within its capability string.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: descriptive availability sentence (§3), no direct RFC 2119 " +
				'keyword, reinforced by §5 ABNF \'capability =/ "URLAUTH=BINARY"\'. This is a ' +
				"DISTINCT capability gate from RFC4467-1-1 (plain 'URLAUTH'): a compliant client " +
				"MUST NOT send the parenthesized extended URLFETCH form (RFC5524-3.1-1) or request " +
				"the BODYPARTSTRUCTURE/BINARY/BODY parameters unless the server specifically " +
				"advertised 'URLAUTH=BINARY', even if it advertised plain 'URLAUTH' alone (per §3: " +
				"'Cases where there is an absence of any parameters or where the URL is sent " +
				"unenclosed cause the command to behave precisely as specified in [URLAUTH]' — i.e. " +
				"the base RFC4467 URLFETCH command itself only needs the RFC4467-1-1 'URLAUTH' " +
				"gate; only the EXTENDED per-URL-parameter form needs this additional gate). " +
				"Testable black-box: a compliant client never emits the parenthesized url-fetch-ext " +
				"form or BINARY/BODYPARTSTRUCTURE/BODY parameters against a server whose CAPABILITY " +
				"omitted URLAUTH=BINARY. Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},

		// ── §3.1 Command Parameters ──────────────────────────────────────────────

		{
			id: "RFC5524-3.1-1",
			source: "RFC5524",
			section: "3.1",
			title: "Extended URLFETCH form parenthesizes each URL together with its requested parameters",
			text:
				"The extended URLFETCH command is distinct by enclosing\n   each URL and associated parameters in a parenthesized list.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: descriptive syntax sentence, no direct RFC 2119 keyword, confirmed " +
				'by §5 ABNF \'url-fetch-ext = "(" url-full *(SP url-fetch-param) ")"\' and the worked ' +
				'examples (\'A001 URLFETCH ("imap://...BINARY" BINARY)\'). A client requesting any ' +
				"per-URL parameter for a given URL MUST wrap that URL and its parameter list in a " +
				"single parenthesized group (per-URL, not one shared parameter list for multiple " +
				"URLs) — this is the extended-vs-simple discipline that distinguishes this command " +
				"form from the unextended RFC4467-7-3/RFC4467-9-3 'URLFETCH 1*(SP url-full)' shape. " +
				"Testable black-box: script an extended-parameter URLFETCH and assert the client " +
				'emits the parenthesized grouping. Conditional; standalone in rev2, so ' +
				'["rev1","rev2"].',
		},
		{
			id: "RFC5524-3.1-2",
			source: "RFC5524",
			section: "3.1",
			title: "Client MUST NOT request both BINARY and BODY for the same URL",
			text: "clients MUST NOT request both BINARY and BODY.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Explicit RFC 2119 MUST NOT binding the client directly. Full context: 'Metadata " +
				"items MUST NOT appear more than once per URL requested, and clients MUST NOT " +
				"request both BINARY and BODY.' This entry covers the mutual-exclusion half; the " +
				"no-duplicate-parameter half is RFC5524-3.1-3. Testable black-box: a compliant " +
				"client's per-URL parameter list in an extended URLFETCH never contains both the " +
				'literal token \'BINARY\' and the literal token \'BODY\' together (BODYPARTSTRUCTURE ' +
				"may still accompany either). Conditional; standalone in rev2, so " +
				'["rev1","rev2"].',
		},
		{
			id: "RFC5524-3.1-3",
			source: "RFC5524",
			section: "3.1",
			title: "Client MUST NOT repeat the same metadata parameter for one URL",
			text: "Metadata items MUST NOT appear more than once per URL requested",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Explicit RFC 2119 MUST NOT binding the client directly (the parameter list is " +
				"client-constructed per §3.1's three named parameters BODYPARTSTRUCTURE/BINARY/" +
				"BODY). Testable black-box: a compliant client's per-URL parameter list in an " +
				"extended URLFETCH never repeats the same parameter token (e.g. never 'BINARY " +
				"BINARY' or 'BODYPARTSTRUCTURE BODYPARTSTRUCTURE'). Companion to RFC5524-3.1-2 " +
				"(the BINARY/BODY mutual-exclusion is a distinct rule from mere non-repetition). " +
				"Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5524-3.1-4",
			source: "RFC5524",
			section: "3.1",
			title: "Client requests one or more of the three named parameters: BODYPARTSTRUCTURE, BINARY, BODY",
			text: "Available parameters are:\n\n   BODYPARTSTRUCTURE",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: introduces the closed parameter set, no direct RFC 2119 keyword; " +
				"level MAY as requesting any parameter is optional (§3: 'Cases where there is an " +
				"absence of any parameters ... cause the command to behave precisely as specified " +
				"in [URLAUTH]'). The extracted client-binding content is the CLOSED VOCABULARY: " +
				"BODYPARTSTRUCTURE ('Provide a BODYPARTSTRUCTURE ... defined in [CONVERT]'), BINARY " +
				"('Provide the data without any Content-Transfer-Encoding ... MAY contain NUL " +
				"octets ... MUST be transferred using the literal8 syntax'), and BODY ('Provide " +
				"the data as-is ... the same data as the unextended [URLAUTH]'), confirmed by §5 " +
				'ABNF \'url-fetch-param = "BODY" / "BINARY" / "BODYPARTSTRUCTURE" / atom\' (the ' +
				"trailing '/ atom' permits future extension parameters, but a client conforming to " +
				"THIS document requests only these three named forms). A client requesting BINARY " +
				"on a URL whose content contains a NUL octet is bound by the reciprocal server " +
				"framing rule (server MUST use literal8) but the client's own duty is simply to " +
				"accept that framing, folded into RFC5524-3.2-2. Testable black-box: a compliant " +
				"client's requested parameter tokens are drawn only from {BODYPARTSTRUCTURE, " +
				"BINARY, BODY} (plus any server-advertised extension atom, out of scope here). " +
				"Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},

		// ── §3.2 Response Metadata ───────────────────────────────────────────────

		{
			id: "RFC5524-3.2-1",
			source: "RFC5524",
			section: "3.2",
			title: "Client MUST accept the extended * URLFETCH response's parenthesized per-URL metadata elements",
			text:
				"Following the URL itself, servers will include a series of\n   parenthesized metadata elements.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: descriptive response-shape sentence (§3.2), no direct RFC 2119 " +
				"keyword, confirmed by §5 ABNF 'urldata-ext = SP url-full url-metadata' / " +
				"'url-metadata = 1*(SP \"(\" url-metadata-el \")\")' / 'url-metadata-el = " +
				"url-meta-bodystruct / url-meta-body / url-meta-binary'. The extracted client duty " +
				"is the reciprocal PARSE obligation: a client that issued an extended (parameterized) " +
				"URLFETCH must accept one parenthesized '(<PARAM> <value>)' group per requested " +
				'metadata item, e.g. \'(BODYPARTSTRUCTURE ("IMAGE" "PNG" () NIL NIL "BINARY" 123)) ' +
				'(BINARY ~{123} ...)\', in the order returned, rather than expecting the plain ' +
				"single-nstring 'urldata-simple' shape (RFC4467-8-3) it would get from an " +
				"unextended request. This is DISTINCT from, and extends, RFC4467-8-3's plain-" +
				"nstring parse duty. Testable black-box: script an extended URLFETCH exchange whose " +
				"response carries one or more parenthesized metadata groups and assert the client " +
				"parses it without erroring. Conditional; standalone in rev2, so " +
				'["rev1","rev2"].',
		},
		{
			id: "RFC5524-3.2-2",
			source: "RFC5524",
			section: "3.2",
			title: "Client MUST accept literal8-framed BINARY metadata and an NIL BINARY item on decode failure",
			text:
				'url-meta-binary       =  "BINARY" SP ( nstring / literal8 )\n      ; If content contains a NUL octet, literal8 MUST be used.\n      ; Otherwise, content SHOULD use nstring.\n      ; On decoding error, NIL should be used.',
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"ABNF-plus-comment client-binding shape (§5, echoing §3.2's prose 'this means that " +
				"the data MAY contain NUL octets and not be formed from textual lines.  Data " +
				"containing NUL octets MUST be transferred using the literal8 syntax defined in " +
				"[BINARY]' and 'If this is not possible ... then this MAY contain NIL'). The client " +
				"duty extracted is the PARSE obligation: a client that requested BINARY must accept " +
				"the '(BINARY <value>)' metadata element whether the value is delivered as a " +
				"literal8 (when the underlying content has a NUL octet — worked example: '(BINARY " +
				"~{123}\\r\\n[123 octets of data, some of which is NUL])') or as a plain nstring " +
				'(when it does not — worked example: \'(BINARY {28}\\r\\nSi vis pacem, para ' +
				"bellum.\\r\\n)'), and must accept a bare NIL value for that item when the server " +
				"could not remove the content-transfer-encoding (worked example: '(BINARY NIL)' " +
				"alongside a still-present BODYPARTSTRUCTURE for an undecodable X-BLURDYBLOOP " +
				"encoding). This is DISTINCT from RFC4467-8-3's plain-URLFETCH NIL-on-invalid-URL " +
				"duty (whole-response NIL for an invalid URL) — here the URL is valid but a single " +
				"metadata ITEM within the parenthesized response is NIL because decoding failed. " +
				"Testable black-box: script BINARY-as-literal8, BINARY-as-nstring, and BINARY-as-NIL " +
				"response variants and assert the client accepts each. Conditional; standalone in " +
				'rev2, so ["rev1","rev2"].',
		},
	],
};

export default rfc5524;
