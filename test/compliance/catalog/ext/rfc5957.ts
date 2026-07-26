import type { CatalogModule } from "../types";

const rfc5957: CatalogModule = {
	source: "RFC5957",
	extractionNote:
		"Full document reviewed (Abstract, §1 Introduction, §2 Conventions, §3 DISPLAY Sort " +
		"Value for an Address, §4 The DISPLAYFROM and DISPLAYTO Sort Criteria, §5 Formal Syntax, " +
		"§6 Security Considerations, §7 Internationalization Considerations, §8 IANA " +
		"Considerations, §9 Normative References). RFC 5957 (SORT=DISPLAY, updates RFC 5256) is a " +
		"very small extension: it adds two sort criteria, DISPLAYFROM and DISPLAYTO, to the RFC " +
		"5256 SORT command, sorting on the first From/To address's addr-name instead of its " +
		"addr-mailbox. 3 client-binding entries extracted: (1) RFC5957-1-1 the capability gate " +
		"(implicit MUST NOT, judgment level — §1's declarative 'A server that supports ... " +
		"indicates this by returning \"SORT=DISPLAY\" in its CAPABILITY response' is the only " +
		"advertisement mechanism, so a client may only emit the new criteria after seeing it; " +
		"since the criteria are SORT sort-keys, use also presupposes the RFC 5256 SORT capability " +
		"— per §1 a SORT=DISPLAY server supports 'the full [SORT] extension', so SORT=DISPLAY " +
		"implies SORT, and the gate is checked against both tokens); (2) RFC5957-4-1 the client " +
		"MAY request the DISPLAYFROM/DISPLAYTO orderings (judgment MAY — §4's 'This document " +
		"introduces two new [SORT] sort criteria' carries no RFC 2119 keyword; extension use is " +
		"discretionary); (3) RFC5957-5-1 emitted criteria must take the §5 ABNF form (judgment " +
		"MUST — the sort-key =/ production makes DISPLAYFROM/DISPLAYTO ordinary RFC 5256 " +
		"sort-keys, valid anywhere a sort-key may appear in the parenthesized sort criteria " +
		"list, including as the sort-key following REVERSE). All 3 are testable (conditional, " +
		"self-actualizing today: driver.sort()/uidSort() throw NotImplementedError, so the " +
		"client has no SORT emission surface at all). Untestable: 0. EXCLUDED AS SERVER-ONLY " +
		"(flagged per extractor rule 6): §3 in its entirety — the four-bullet DISPLAY sort-value " +
		"derivation for an address (addr-name decode via RFC 5255 §4.6, e.g. 'If the address " +
		"structure's [IMAP] addr-name is non-NIL, apply the procedure from [RFC5255], Section " +
		"4.6.', then addr-mailbox@addr-host, then addr-mailbox, then empty string) binds the " +
		"party computing sort values, i.e. the server performing server-side sorting; §4's only " +
		"RFC 2119 sentence, 'A message's sort value under these orderings MUST be derived as " +
		"follows', plus its derived-addr construction ('A \"derived-addr\" value is created from " +
		"the [IMAP] envelope structure resulting from a FETCH ENVELOPE on the message.') — same " +
		"server-side computation duty; §7's collation MUST ('the active [RFC4790] collation as " +
		"per [RFC5255] MUST be used when sorting such strings') binds whoever sorts, which under " +
		"this server-side-sorting extension is the server; §7's descriptive limitation ('They do " +
		"not attempt to parse this string in a locale- or language-dependent manner in order to " +
		"determine and sort on some semantically meaningful substring such as the surname.') " +
		"describes what the orderings do, imposing no duty on anyone — a client wanting " +
		"surname sorting simply gets no such semantics, nothing to test. §6 Security " +
		"Considerations (no new issues) and §8 IANA Considerations (registration boilerplate) " +
		"contain no client-directed normative language. REV2-CORE ADJUDICATION (extractor rule " +
		"4): RFC 9051 does not fold SORT or the display criteria into IMAP4rev2 core — a grep of " +
		"catalog/rfc9051*.ts for SORT/DISPLAYFROM/DISPLAYTO returns zero entries — so per the " +
		"plan's double-scoring discipline SORT=DISPLAY remains a standalone extension under both " +
		"profiles and every entry keeps the default profiles: [\"rev1\",\"rev2\"]; no rev1-only " +
		"tagging and no gap-compensation notes are needed. Total: 3 client-binding entries " +
		"(RFC5957-1-1, RFC5957-4-1, RFC5957-5-1).",
	requirements: [
		// ── §1 Introduction (capability advertisement → client gate) ────────────

		{
			id: "RFC5957-1-1",
			source: "RFC5957",
			section: "1",
			title:
				"Client (implicit) MUST NOT send DISPLAYFROM/DISPLAYTO unless the server " +
				"advertises SORT=DISPLAY (with SORT)",
			text:
				"A server that supports the full [SORT] extension as well as both the DISPLAYFROM " +
				'and DISPLAYTO sort criteria indicates this by returning "SORT=DISPLAY" in its ' +
				"CAPABILITY response.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit MUST NOT; the sentence is declarative, with no RFC 2119 " +
				"keyword anywhere in §1). The SORT=DISPLAY capability token is the extension's " +
				"only advertisement mechanism, so the standard capability-gate inference applies: " +
				"a client may only include DISPLAYFROM or DISPLAYTO among its SORT criteria after " +
				"the server has announced SORT=DISPLAY. Because the two criteria are RFC 5256 " +
				"sort-keys usable only inside a SORT/UID SORT command, using them also " +
				"presupposes the SORT capability itself — the quoted sentence ties SORT=DISPLAY " +
				"to a server supporting 'the full [SORT] extension as well as both' criteria, so " +
				"the gate in practice requires both tokens (SORT=DISPLAY advertises full-SORT " +
				"support by definition). Conditional on the client issuing SORT at all. " +
				"driver.sort()/uidSort() are genuinely real, so this row passes for real.",
		},

		// ── §4 The DISPLAYFROM and DISPLAYTO Sort Criteria ──────────────────────

		{
			id: "RFC5957-4-1",
			source: "RFC5957",
			section: "4",
			title:
				"Client MAY request the DISPLAYFROM/DISPLAYTO orderings as SORT sort criteria",
			text:
				"This document introduces two new [SORT] sort criteria, DISPLAYFROM and " +
				"DISPLAYTO.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (MAY; no RFC 2119 keyword — the sentence is definitional, and use " +
				"of an optional extension is inherently discretionary). This entry anchors the " +
				"client's emission of the two new criteria themselves: per §1, 'The [SORT] FROM " +
				"and TO orderings sort messages lexically on the [IMAP] addr-mailbox of the first " +
				"address in the message's From and To headers, respectively.' whereas 'This " +
				"document provides two alternative orderings, DISPLAYFROM and DISPLAYTO, which " +
				"sort messages based on the first From or To address's [IMAP] addr-name " +
				"(generally the same as its [RFC5322] display-name), when present.' — a client " +
				"wanting display-name ordering requests DISPLAYFROM/DISPLAYTO instead of FROM/TO. " +
				"§4's own MUST ('A message's sort value under these orderings MUST be derived as " +
				"follows') is excluded as server-only: it binds the party computing the sort " +
				"values (see extractionNote). Conditional on the client wanting display-based " +
				"ordering and the server advertising SORT=DISPLAY (RFC5957-1-1). " +
				"driver.sort()/uidSort() are genuinely real, so this row passes for real.",
		},

		// ── §5 Formal Syntax (wire form / placement of the new sort-keys) ───────

		{
			id: "RFC5957-5-1",
			source: "RFC5957",
			section: "5",
			title:
				"Client MUST emit DISPLAYFROM/DISPLAYTO as sort-key atoms per the extended " +
				"RFC 5256 ABNF",
			text: 'sort-key =/ "DISPLAYFROM" / "DISPLAYTO"',
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit MUST; ABNF productions carry no RFC 2119 keyword but " +
				"define the only conforming wire forms — catalog precedent treats emitted-syntax " +
				"conformance as an implicit MUST on the emitter). Whitespace in the quoted " +
				"production is flattened from the RFC's aligned ABNF layout ('sort-key      =/ " +
				"...'). Extending the RFC 5256 'sort-key' non-terminal (rather than defining a " +
				"new construct) fixes the criteria's placement: DISPLAYFROM and DISPLAYTO are " +
				"ordinary sort-keys, valid anywhere RFC 5256 permits a sort-key inside the " +
				"parenthesized sort criteria list — as the sole criterion, among other criteria " +
				"in any order, or as the sort-key immediately following REVERSE (REVERSE " +
				"DISPLAYFROM / REVERSE DISPLAYTO) — and they are emitted as bare atoms, not " +
				"quoted strings. §5's companion production 'capability =/ \"SORT=DISPLAY\"' " +
				"extends the capability token grammar (server-emitted; the client's side of that " +
				"token is the RFC5957-1-1 gate). Conditional on the client emitting the display " +
				"criteria at all. driver.sort()/uidSort() are genuinely real, so this row passes " +
				"for real.",
		},
	],
};

export default rfc5957;
