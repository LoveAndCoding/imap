import type { CatalogModule } from "../types";

const rfc8514: CatalogModule = {
	source: "RFC8514",
	extractionNote:
		"Full document reviewed (Abstract, §1 Introduction, §2 Conventions [RFC 8174 keyword " +
		"boilerplate], §3 Save Date Message Attribute, §4 IMAP Protocol Changes [§4.1 CAPABILITY " +
		"Identification, §4.2 FETCH Command and Response Extensions, §4.3 SEARCH Command Extension], " +
		"§5 Formal Syntax, §6 Security Considerations, §7 IANA Considerations, §8 Normative " +
		"References, Acknowledgements, Author's Address). SAVEDATE is a small, standalone extension " +
		"that adds a 'save date' message attribute and surfaces it via one new FETCH data item and " +
		"four new SEARCH keys. 6 client-binding entries extracted, all from §4.2 (FETCH) and §4.3 " +
		"(SEARCH) — the only sections containing client-directed wire surface: (1) the SAVEDATE FETCH " +
		"data item the client emits (RFC8514-4.2-1); (2) the SAVEDATE FETCH-response data item the " +
		"client must parse — a string date-time OR NIL when the underlying storage lacks the save " +
		"date attribute (RFC8514-4.2-2, the sole entry with an explicit response shape the client " +
		"must accept both branches of, pinned by §5's 'msg-att-static =/ \"SAVEDATE\" SP (date-time " +
		"/ nil)'); (3-6) the four SEARCH keys the client emits — SAVEDBEFORE / SAVEDON / SAVEDSINCE / " +
		"SAVEDATESUPPORTED (RFC8514-4.3-1..4). ALL SIX are judgment-level (implicit) duties: this RFC " +
		"defines the SAVEDATE FETCH item and the four SEARCH keys as protocol vocabulary in §4.2/§4.3 " +
		"prose and formalizes them in §5 ABNF, but NONE of those definitions carry an RFC 2119 " +
		"keyword directing the client — there is no 'the client MUST send SAVEDATE' sentence. Each is " +
		"leveled by judgment as an implicit MUST on wire form: a client that wants the save date, or " +
		"wants to search by it, MUST use exactly these atoms and MUST accept exactly this response " +
		"shape, because the ABNF admits no alternative spelling; the notes on each entry record the " +
		"no-keyword judgment call. All six are testable (a black-box scripted exchange can drive the " +
		"exact command form and assert the client's parse/emit behavior; unimplemented today, so they " +
		"self-actualize as failures against RFC8514 — the compliance suite scores absence of a " +
		"conditional feature as non-compliance for that source). " +
		"SKIPPED AS SERVER-ONLY (no client action to emit, observe, or enforce): §3's two MUSTs on " +
		"the attribute's semantics — 'the current date and time at which the message is delivered to " +
		"a mailbox MUST be used to set the save date attribute' and 'Once calculated, the save date " +
		"attribute MUST NOT change as long as the message is contained within the same mailbox' — " +
		"both bind the server's mailbox storage (how it computes and freezes the attribute), not any " +
		"client behavior; a client cannot set, observe the setting of, or enforce immutability of a " +
		"server-side attribute. §4.1's 'IMAP servers that support this extension MUST include " +
		"\"SAVEDATE\" in the response list to the CAPABILITY command' binds the server's CAPABILITY " +
		"advertisement (the reciprocal client duty — only using an extension the server advertised — " +
		"is the generic RFC 3501/9051 capability-negotiation obligation already cataloged there, not " +
		"a distinct RFC 8514 client duty). §4.3's normative fallback 'When the underlying storage of " +
		"a mailbox does not support the save date attribute, the SAVEDBEFORE, SAVEDON, and SAVEDSINCE " +
		"search keys MUST use the internal date attribute instead' (and its MULTISEARCH per-mailbox " +
		"refinement 'this fallback behavior MUST apply to each mailbox individually') binds the " +
		"SERVER's SEARCH implementation — it dictates which attribute the server substitutes when " +
		"executing the search; the client neither selects nor can observe which attribute the server " +
		"used (the SEARCH result set is identical in form either way), so it is not client-binding. " +
		"§5 Formal Syntax adds no independent duty — its four ABNF productions (capability, fetch-att, " +
		"msg-att-static, search-key) formalize exactly the §4.2/§4.3 vocabulary already captured; the " +
		"'msg-att-static =/ \"SAVEDATE\" SP (date-time / nil)' production is quoted inside " +
		"RFC8514-4.2-2 as the normative pin for the two-branch response shape rather than scored as a " +
		"separate entry. §1 Introduction, §2 Conventions, §6 Security Considerations (explicitly 'no " +
		"known additional security issues'), §7 IANA Considerations, and §8 References contain no " +
		"client-directed normative language. " +
		"REV2 PROFILE: SAVEDATE remains a standalone extension under IMAP4rev2 (RFC 9051 does not " +
		"fold the save-date attribute, the SAVEDATE FETCH item, or the SAVED* SEARCH keys into core " +
		"— confirmed by grep of catalog/rfc9051: no SAVEDATE / SAVEDBEFORE / SAVEDON / SAVEDSINCE " +
		"content). No rev2-core double-scoring applies, so all six entries carry the default " +
		"profiles [\"rev1\",\"rev2\"] and are source-of-truth for both profiles via this document " +
		"alone. Total: 6 client-binding entries (RFC8514-4.2-1..2, RFC8514-4.3-1..4). Untestable: 0.",
	requirements: [
		// ── §4.2 FETCH Command and Response Extensions ───────────────────────────

		{
			id: "RFC8514-4.2-1",
			source: "RFC8514",
			section: "4.2",
			title: "Client (implicit) MUST emit the SAVEDATE FETCH data item to request the save date",
			text:
				"This extension defines one new data item for the FETCH command: " +
				"SAVEDATE The save date of the message.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit MUST on wire form; no RFC 2119 keyword in the source " +
				"sentence). §4.2 defines SAVEDATE as protocol vocabulary — the FETCH data item that " +
				"retrieves the save date — and §5 formalizes it as 'fetch-att =/ \"SAVEDATE\"', which " +
				"admits no alternative spelling. A client that wishes to fetch the save date must " +
				"therefore include the bare atom SAVEDATE in the FETCH data-item list (e.g. " +
				"'C: A101 FETCH 998 (SAVEDATE)', per the RFC's own example). Conditional on the client " +
				"choosing to use the SAVEDATE extension at all. Standalone in rev2 (no RFC 9051 " +
				"counterpart), so profiles [\"rev1\",\"rev2\"]. Currently self-actualizing fail: the " +
				"driver has no SAVEDATE fetch surface, so the client cannot exercise this data item — " +
				"which the compliance suite records as non-compliance for RFC8514.",
		},
		{
			id: "RFC8514-4.2-2",
			source: "RFC8514",
			section: "4.2",
			title: "Client (implicit) MUST accept the SAVEDATE FETCH response as a date-time string or NIL",
			text:
				"This extension defines one new data item for the FETCH response: " +
				"SAVEDATE A string representing the save date of the message.  However, if the " +
				"underlying mailbox storage does not support the save date message attribute, the " +
				"value returned for the SAVEDATE item is always NIL, rather than a string.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit client-parse MUST; the source sentence describes the " +
				"server-returned value with no RFC 2119 keyword directing the client). The client " +
				"must accept BOTH branches of the response: a quoted date-time string (per the " +
				"example '* 998 FETCH (SAVEDATE \"01-Jan-2015 18:50:53 +0100\")') AND a bare NIL when " +
				"the underlying storage lacks the save date attribute — treating NIL as a normal, " +
				"well-formed value rather than a parse error. §5's 'msg-att-static =/ \"SAVEDATE\" SP " +
				"(date-time / nil)' is the normative pin for this two-branch shape: the response is " +
				"exactly a date-time OR nil, nothing else. A parser that rejects the NIL branch (or " +
				"mis-parses date-time) is non-conformant. Conditional on the client using SAVEDATE. " +
				"Standalone in rev2, profiles [\"rev1\",\"rev2\"]. Self-actualizing fail today: no " +
				"SAVEDATE fetch surface exists to receive and parse either branch.",
		},

		// ── §4.3 SEARCH Command Extension ────────────────────────────────────────

		{
			id: "RFC8514-4.3-1",
			source: "RFC8514",
			section: "4.3",
			title: "Client (implicit) MUST emit SAVEDBEFORE <date> to search by save date earlier than a date",
			text:
				"This extension defines four new search keys for the SEARCH command: " +
				"SAVEDBEFORE <date> Messages whose save date (disregarding time and timezone) is " +
				"earlier than the specified date.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit MUST on wire form; no RFC 2119 keyword directs the client). " +
				"§4.3 defines SAVEDBEFORE as a SEARCH key taking a <date> argument, formalized in §5 " +
				"as 'search-key =/ \"SAVEDBEFORE\" SP date'. A client searching for messages saved " +
				"before a date must emit exactly the atom SAVEDBEFORE followed by a space and an IMAP " +
				"date (per the RFC's example 'C: A102 SEARCH SAVEDON 28-Dec-2014' form). The <date> " +
				"in the prose is the ABNF 'date' nonterminal, not literal angle brackets on the wire. " +
				"Conditional on the client using SAVEDATE search. Standalone in rev2, profiles " +
				"[\"rev1\",\"rev2\"]. Self-actualizing fail today: no SAVEDATE search surface exists. " +
				"The complementary server duty — falling back to internal date when storage lacks the " +
				"save date attribute — is server-only and excluded (see extractionNote).",
		},
		{
			id: "RFC8514-4.3-2",
			source: "RFC8514",
			section: "4.3",
			title: "Client (implicit) MUST emit SAVEDON <date> to search by save date within a date",
			text:
				"SAVEDON <date> Messages whose save date (disregarding time and timezone) is within " +
				"the specified date.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit MUST on wire form; no RFC 2119 keyword). §4.3 defines " +
				"SAVEDON as a SEARCH key taking a <date>, formalized in §5 as 'search-key =/ " +
				"\"SAVEDON\" SP date'; a client searching by exact save-date day must emit the atom " +
				"SAVEDON SP date (per the RFC example 'C: A102 SEARCH SAVEDON 28-Dec-2014'). <date> " +
				"is the ABNF 'date' nonterminal, not literal angle brackets. Conditional on the " +
				"client using SAVEDATE search. Standalone in rev2, profiles [\"rev1\",\"rev2\"]. " +
				"Self-actualizing fail today: no SAVEDATE search surface.",
		},
		{
			id: "RFC8514-4.3-3",
			source: "RFC8514",
			section: "4.3",
			title: "Client (implicit) MUST emit SAVEDSINCE <date> to search by save date within or later than a date",
			text:
				"SAVEDSINCE <date> Messages whose save date (disregarding time and timezone) is " +
				"within or later than the specified date.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit MUST on wire form; no RFC 2119 keyword). §4.3 defines " +
				"SAVEDSINCE as a SEARCH key taking a <date>, formalized in §5 as 'search-key =/ " +
				"\"SAVEDSINCE\" SP date'; a client searching for messages saved on or after a date " +
				"must emit the atom SAVEDSINCE SP date (per the RFC example 'C: A103 SEARCH " +
				"SAVEDSINCE 28-Dec-2014'). <date> is the ABNF 'date' nonterminal, not literal angle " +
				"brackets. Conditional on the client using SAVEDATE search. Standalone in rev2, " +
				"profiles [\"rev1\",\"rev2\"]. Self-actualizing fail today: no SAVEDATE search surface.",
		},
		{
			id: "RFC8514-4.3-4",
			source: "RFC8514",
			section: "4.3",
			title: "Client (implicit) MUST emit SAVEDATESUPPORTED to search by save-date support",
			text:
				"SAVEDATESUPPORTED Matches all messages in the mailbox when the underlying storage of " +
				"that mailbox supports the save date attribute.  Conversely, it matches no messages " +
				"in the mailbox when the save date attribute is not supported.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit MUST on wire form; no RFC 2119 keyword). Although §4.3's " +
				"lead-in says 'four new search keys', it defines FIVE keys — SAVEDBEFORE, SAVEDON, " +
				"SAVEDSINCE, and SAVEDATESUPPORTED — with SAVEDATESUPPORTED also present in the §5 " +
				"ABNF 'search-key =/ ... / \"SAVEDATESUPPORTED\"' (the '(disregarding time...)' trio " +
				"plus this argument-less probe); this catalog treats SAVEDATESUPPORTED as a fourth " +
				"distinct client-emittable SEARCH key regardless of the lead-in's count. Unlike the " +
				"other three it takes NO date argument (it is a boolean probe of whether the mailbox " +
				"storage supports the save date attribute). A client using it must emit the bare atom " +
				"SAVEDATESUPPORTED. Conditional on the client using SAVEDATE search. Standalone in " +
				"rev2, profiles [\"rev1\",\"rev2\"]. Self-actualizing fail today: no SAVEDATE search " +
				"surface.",
		},
	],
};

export default rfc8514;
