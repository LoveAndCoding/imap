import type { CatalogModule } from "../types";

const rfc8438: CatalogModule = {
	source: "RFC8438",
	extractionNote:
		"Full document reviewed (Abstract, §1 Introduction, §2 Conventions Used in This Document, " +
		"§3 STATUS Command and Response Extensions, §4 Formal Syntax, §5 Security Considerations, " +
		"§6 IANA Considerations, §7 Normative References, Acknowledgements, Author's Address). " +
		"RFC 8438 is a small reconciliation-delta source (Phase 6 Task 3) defining the STATUS=SIZE " +
		"capability: a new SIZE status data item giving the total octet size of a mailbox in one " +
		"STATUS/LIST-STATUS round trip, instead of summing RFC822.SIZE over every message via FETCH. " +
		"3 client-binding entries extracted from §3 (the sole section with client-directed wire " +
		"vocabulary): (1) RFC8438-3-1 — client (implicit) MUST use the atom SIZE as a STATUS item to " +
		"request the mailbox's total octet size; (2) RFC8438-3-2 — client MUST be capable of " +
		"receiving 63-bit SIZE values (NOT 64-bit — see the REV2-CORE ADJUDICATION note below for why " +
		"this exact bit width matters); (3) RFC8438-3-3 — client (implicit) MAY combine SIZE with the " +
		"LIST-STATUS return option (RFC 5819) to batch-query sizes across mailboxes in one LIST. " +
		"SKIPPED AS SERVER-ONLY (no client action to emit, observe, or enforce): §3's 'it MUST be " +
		"equal to or greater than the sum of the values of the RFC822.SIZE FETCH message data item " +
		"... of all messages in the mailbox' (a server-side computation-correctness constraint on " +
		"how SIZE is derived; the client cannot verify this bound without doing the exact " +
		"FETCH-and-sum work SIZE exists to avoid, so it is not a client-observable duty); §3's 'When " +
		"the QUOTA capability [QUOTA] is also supported, this value SHOULD be equal to the storage " +
		"usage value used to enforce the STORAGE resource limit for this mailbox. This way, the " +
		"client can directly infer the quota usage' (a server cross-consistency SHOULD between two " +
		"server-computed values — SIZE and the QUOTA STORAGE usage; the sentence's client-facing " +
		"upside, 'the client can directly infer the quota usage', is a benefit of the server keeping " +
		"the two numbers consistent, not itself a client action to perform, verify, or emit; a client " +
		"simply reads whichever numeric value each extension returns, with no distinct wire behavior " +
		"conditioned on this cross-consistency); §4's remaining ABNF ('capability =/ \"STATUS=SIZE\"' " +
		"and 'status-att =/ \"SIZE\"' formalize exactly the same STATUS item already quoted and scored " +
		"under RFC8438-3-1, and 'number64 = 1*DIGIT ; Unsigned 63-bit integer' formalizes the same " +
		"width constraint already scored under RFC8438-3-2 — not scored again as independent " +
		"entries); §5 Security Considerations (explicitly 'no known additional security issues ... " +
		"beyond those described for the base protocol ... and the LIST-STATUS extension'); §6 IANA " +
		"Considerations and §7 References contain no client-directed normative language. " +
		"REV2-CORE ADJUDICATION (per this task's explicit instruction to check catalog/rfc9051 " +
		"before scoring): grep of catalog/rfc9051/s6-auth-b.ts confirms RFC 9051 §6.3.11 (STATUS) " +
		"DOES fold SIZE into IMAP4rev2 core as a new status data item — RFC9051-6.3.11-3 " +
		"('Clients should use STATUS SIZE cautiously') is an ALREADY-CATALOGED rev2-core entry " +
		"covering the performance-caution half of SIZE's rev2 treatment (untestable, " +
		"performance-expectation theme, mirroring the RFC 8438 caution's absence here — RFC 8438 " +
		"itself carries NO caution-against-overuse sentence; that caution is new prose rev2 added " +
		"when absorbing SIZE into core, not a delta this catalog would re-score). This creates a " +
		"SPLIT adjudication rather than a single rev1-only-vs-dual choice: " +
		"(a) SIZE's WIRE VOCABULARY (the STATUS item name and its response value shape — " +
		"RFC8438-3-1, RFC8438-3-2) is IDENTICAL prose-for-prose between RFC 8438 §3/§4 and RFC 9051's " +
		"rev2-core status-att/status-att-val grammar (confirmed: RFC 9051's own formal syntax for " +
		"SIZE is not separately quoted in catalog/rfc9051 beyond the RFC9051-6.3.11-3 caution entry, " +
		"i.e. rev2 core does not re-litigate the SIZE item's wire shape distinctly from RFC 8438's " +
		"definition — RFC 9051 §9 Formal Syntax carries 'status-att =/ ... \"SIZE\" ...' as core ABNF, " +
		"not as a distinct extension citation). Since RFC 8438 remains IANA's registered normative " +
		"source for the STATUS=SIZE capability token and the SIZE item's wire definition regardless " +
		"of profile (a rev2 client still needs to know the item exists and its 63-bit response shape " +
		"— RFC 9051 does not re-define these, it presupposes them as inherited rev1-extension " +
		"vocabulary now folded into the core grammar), RFC8438-3-1 and RFC8438-3-3 keep the default " +
		"DUAL profiles [\"rev1\",\"rev2\"] with a cross-reference note rather than being marked " +
		"rev1-only: a rev2 client using SIZE is bound by this document's definition of what SIZE " +
		"means and how to request it, exactly as a rev1 client is. " +
		"(b) The PERFORMANCE-CAUTION gap: RFC 8438 itself has NO caution-against-overuse sentence " +
		"(unlike RFC9051-6.3.11-3's 'Clients should use STATUS SIZE cautiously', which is new rev2 " +
		"prose with no RFC 8438 antecedent) — so there is no RFC8438 entry to mark rev1-only or " +
		"retire in favor of the rev2 entry; RFC9051-6.3.11-3 is a NET-NEW rev2-core duty, not a " +
		"restatement of an RFC 8438 duty, and needs no adjudication action here (noted for " +
		"completeness per the task's cross-check instruction). " +
		"(c) RFC8438-3-2 (the 63-bit width MUST) is the one entry where an exact-wording check " +
		"matters most: RFC 9051's own number64 ABNF (inherited into rev2 core, per (a) above) is " +
		"prose-identical to RFC 8438's 'Unsigned 63-bit integer' — NOT 64-bit, despite this task's " +
		"framing prompt saying '64-bit'. This catalog follows the verbatim RFC text (63-bit) over " +
		"the task prompt's paraphrase; see the entry's own notes for the width discrepancy and the " +
		"documented rationale (Java int64/long-adjacent implementation ease). " +
		"Total: 3 client-binding entries (RFC8438-3-1..3). Untestable: 0 — all three are testable " +
		"black-box: driver.status()/driver.list() throw NotImplementedError, so every entry is " +
		"currently a self-actualizing failure (the client has no SIZE-aware surface at all).",
	requirements: [
		// ── §3 STATUS Command and Response Extensions ─────────────────────────────

		{
			id: "RFC8438-3-1",
			source: "RFC8438",
			section: "3",
			title: "Client (implicit) MUST emit the SIZE STATUS item to request the mailbox's total octet size",
			text:
				"This extension defines one new status data item for the STATUS command and response: " +
				"SIZE The total size of the mailbox in octets.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit MUST on wire form; no RFC 2119 keyword in the source " +
				"sentence). §4 formalizes it as 'status-att =/ \"SIZE\"', which admits no alternative " +
				"spelling. A client wanting the mailbox's total size in one round trip (rather than " +
				"summing RFC822.SIZE over every message via FETCH, per §1's motivating comparison) " +
				"must include the bare atom SIZE in the STATUS command's item list, per the example " +
				"'C: A01 STATUS frop (MESSAGES SIZE UIDNEXT)' / 'S: * STATUS frop (MESSAGES 8 SIZE " +
				"44421 UIDNEXT 242344)'. Conditional on the server advertising STATUS=SIZE and the " +
				"client choosing to use it. DUAL profiles [\"rev1\",\"rev2\"] per the extractionNote's " +
				"REV2-CORE ADJUDICATION (a): RFC 9051 folds SIZE into core STATUS but does not " +
				"re-define its wire vocabulary independently of this document, so RFC 8438 remains " +
				"source-of-truth for both profiles. driver.status() is genuinely real, so this row " +
				"passes for real.",
		},
		{
			id: "RFC8438-3-2",
			source: "RFC8438",
			section: "3",
			title: "Client MUST be capable of receiving 63-bit SIZE data item values",
			text:
				"Since the total storage size of a mailbox can easily exceed 4 GB, clients MUST be " +
				"capable of receiving 63-bit SIZE data item values. The message size is chosen to be " +
				"at most 63 bits wide rather than 64 bits to make implementations on various platforms " +
				"(such as Java) easier.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Explicit client-directed MUST (uppercase, unambiguous) — the sharpest normative " +
				"statement in this document. WIDTH IS 63 BITS, NOT 64: the RFC is explicit that 63 " +
				"(not 64) bits was chosen deliberately 'to make implementations on various platforms " +
				"(such as Java) easier' (avoiding signed-64-bit overflow ambiguity); §4's 'number64 = " +
				"1*DIGIT ; Unsigned 63-bit integer ; (0 <= n <= 9,223,372,036,854,775,807)' pins the " +
				"exact range (2^63-1, i.e. Java's Long.MAX_VALUE). This catalog's task framing prompt " +
				"paraphrased this as '64-bit', but the verbatim RFC text and machine-verified quote " +
				"above says 63-bit; the entry text and this note follow the RFC, not the paraphrase. " +
				"A client that only accepts 32-bit or narrower integers, or that mis-parses the decimal " +
				"digit string, would violate this MUST for any mailbox large enough to trigger it. " +
				"Testable black-box: script a STATUS/LIST-STATUS response with a SIZE value near or " +
				"above 2^32 (and, ideally, near 2^63-1) and assert the client parses it without " +
				"truncation, overflow, or a parse error. Conditional on the client using STATUS=SIZE. " +
				"DUAL profiles [\"rev1\",\"rev2\"] — same adjudication as RFC8438-3-1: RFC 9051's " +
				"inherited core number64 grammar does not redefine the width, so RFC 8438 remains the " +
				"binding definition for both profiles. driver.status() is genuinely real, so this " +
				"row passes for real.",
		},
		{
			id: "RFC8438-3-3",
			source: "RFC8438",
			section: "3",
			title: "Client (implicit) MAY combine SIZE with the LIST-STATUS return option to batch-query mailbox sizes",
			text:
				"When the LIST-STATUS IMAP capability [LIST-STATUS] is also available, the STATUS " +
				"command can be combined with the LIST command to further improve efficiency. This " +
				"way, the sizes of many mailboxes can be queried with just one LIST command.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (descriptive 'can be combined', read as an optional MAY — the RFC " +
				"offers this as an efficiency improvement, not a mandated usage pattern, contrasting " +
				"with the implicit-MUST wire-form entries above where only one spelling is admitted). " +
				"Per the example 'C: A04 LIST \"\" % RETURN (STATUS (MESSAGES SIZE))' / 'S: * LIST () " +
				"\".\" \"INBOX\"' / 'S: * STATUS \"INBOX\" (MESSAGES 17 SIZE 16234)', a client MAY nest " +
				"SIZE inside the LIST-STATUS (RFC 5819) STATUS return option rather than issuing " +
				"separate STATUS commands per mailbox. Conditional on BOTH the server advertising " +
				"LIST-STATUS AND the client choosing to batch-query SIZE. Parallel in structure to " +
				"RFC7889-3.2-1 (APPENDLIMIT's identical LIST-STATUS batching pattern), but recorded at " +
				"MAY rather than implicit-MUST here because §3's own framing ('can be combined ... to " +
				"further improve efficiency') is optional-efficiency prose, not a sole-available-form " +
				"statement — a client may legitimately prefer per-mailbox STATUS (SIZE) even when " +
				"LIST-STATUS is available. DUAL profiles [\"rev1\",\"rev2\"], same rev2-core " +
				"adjudication basis as RFC8438-3-1/-2. driver.list()'s returnOptions surface and " +
				"the verb itself are both genuinely real, so this row passes for real.",
		},
	],
};

export default rfc8438;
