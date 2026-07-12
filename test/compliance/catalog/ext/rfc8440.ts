import type { CatalogModule } from "../types";

const rfc8440: CatalogModule = {
	source: "RFC8440",
	extractionNote:
		"Full document reviewed (Abstract, §1 Introduction, §2 Conventions Used in This Document, " +
		"§3 MYRIGHTS Return Option to LIST Command, §4 Examples, §5 Formal Syntax, §6 Security " +
		"Considerations, §7 Privacy Considerations, §8 IANA Considerations [§8.1 Registration of " +
		"IMAP Capability LIST-MYRIGHTS, §8.2 Registration of LIST-EXTENDED Option MYRIGHTS], §9 " +
		"References, Acknowledgments, Authors' Addresses). RFC 8440 is a small reconciliation-delta " +
		"source (Phase 6 Task 3) defining the LIST-MYRIGHTS extension: a new \"MYRIGHTS\" LIST return " +
		"option (built on RFC 5258 extended LIST) that lets a client fold per-mailbox MYRIGHTS " +
		"lookups into a single LIST command, instead of issuing one LIST followed by N separate " +
		"MYRIGHTS commands. 4 client-binding entries extracted from §3 (the sole normative section): " +
		"(1) RFC8440-3-1 — client (implicit) MUST emit LIST ... RETURN (MYRIGHTS) to request " +
		"interleaved rights information, formalized in §5 as 'return-option =/ \"MYRIGHTS\"'; " +
		"(2) RFC8440-3-2 — client MUST NOT assume an untagged MYRIGHTS response for a mailbox " +
		"precedes that mailbox's LIST response — i.e. it must accept the mandated ordering " +
		"(LIST-before-MYRIGHTS per mailbox) and not require or depend on a reversed or interleaved " +
		"pairing scheme; " +
		"(3) RFC8440-3-3 — client (implicit) MUST accept a LIST response with no accompanying " +
		"MYRIGHTS response as a well-formed 'rights lookup unavailable for this mailbox' outcome, not " +
		"a protocol error; " +
		"(4) RFC8440-6-1 — client SHOULD use a suitably narrow match pattern and/or selection option " +
		"to limit the mailboxes for which it requests MYRIGHTS, given the server-side cost of " +
		"generating many MYRIGHTS responses. " +
		"CROSS-REFERENCE RATHER THAN DUPLICATION (per this task's explicit instruction): the untagged " +
		"MYRIGHTS RESPONSE's own wire shape (mailbox name + rights string; the client's duty to parse " +
		"it and to ignore the virtual 'd'/'c' rights within it) is ALREADY fully cataloged under RFC " +
		"4314 §3.8/§3.5/§2.1.1 — confirmed by reading ext/rfc4314.ts: RFC4314-2.1.1-3 ('Client MUST " +
		"ignore virtual d/c rights in MYRIGHTS/ACL/LISTRIGHTS responses') explicitly already covers " +
		"MYRIGHTS-response parsing, and RFC 4314 §3.5/§3.8 define the MYRIGHTS command and its " +
		"untagged response shape ('* MYRIGHTS <mailbox> <rights>', quoted in RFC 8440's own §4 " +
		"examples, e.g. '* MYRIGHTS \"INBOX\" lrswipkxtecda'). RFC 8440 does not redefine this response " +
		"shape — §3's 'an untagged MYRIGHTS response containing the set of rights granted to the " +
		"logged-in user' is a direct citation of RFC 4314's existing response format, only newly " +
		"triggered by a LIST return option instead of an explicit MYRIGHTS command. This catalog " +
		"therefore scores ONLY the delta RFC 8440 actually adds — the LIST-side request/ordering/" +
		"absence semantics — and cross-references RFC4314-2.1.1-3 for the response-content parsing " +
		"duty rather than re-quoting or re-scoring it. " +
		"SKIPPED AS SERVER-ONLY (no client action to emit, observe, or enforce): §3's 'For each " +
		"listable mailbox matching the list pattern and selection options, the server MUST return an " +
		"untagged LIST response and SHOULD also return an untagged MYRIGHTS response' (server " +
		"response-generation MUST/SHOULD — the client's reciprocal accept-both-and-accept-absence " +
		"duties are RFC8440-3-2/-3-3); §3's 'If the server is unable to look up the set of rights for " +
		"a given mailbox, it does not send the MYRIGHTS reply for that mailbox' (server-side decision " +
		"of WHEN to omit MYRIGHTS — the client's reciprocal accept-omission duty is RFC8440-3-3); §5 " +
		"Formal Syntax's 'return-option =/ \"MYRIGHTS\"' formalizes exactly the same LIST return option " +
		"already quoted and scored under RFC8440-3-1, not scored again as an independent entry; §6 " +
		"Security Considerations' first sentence ('this extension makes it a bit easier for clients " +
		"to overload the server ... a server implementation needs to make sure that it can still " +
		"serve other IMAP connections') is predominantly a server-capacity-planning note, with only " +
		"its final clause ('Clients SHOULD use a suitable match pattern...') being client-directed — " +
		"that clause alone is scored as RFC8440-6-1; §7 Privacy Considerations (explicitly 'does not " +
		"introduce any additional privacy concerns beyond those described in [RFC4314]'); §8 IANA " +
		"Considerations (capability/option registry registrations, not client behavior) and §9 " +
		"References contain no distinct client-directed normative language. " +
		"REV2-CORE ADJUDICATION: LIST-MYRIGHTS is NOT folded into IMAP4rev2 core — confirmed by grep " +
		"of catalog/rfc9051: no MYRIGHTS return-option content anywhere in the rev2 core LIST entries " +
		"(RFC9051-6.3.9.x covers SUBSCRIBED/RECURSIVEMATCH/CHILDREN/CHILDINFO/OLDNAME return options " +
		"only). LIST-MYRIGHTS remains a standalone extension in both profiles, layered atop RFC 4314 " +
		"(also standalone in rev2 per ext/rfc4314.ts's own adjudication) and RFC 5258 extended LIST " +
		"(rev2-core per catalog/rfc9051/s6-auth-b.ts, but the MYRIGHTS return option itself is not " +
		"absorbed). No rev1-only tag applies; all entries carry the default profiles " +
		"[\"rev1\",\"rev2\"]. " +
		"Total: 4 client-binding entries (RFC8440-3-1..3, RFC8440-6-1). Untestable: 0 — all four are " +
		"testable black-box: driver.list() and driver.myrights() both throw NotImplementedError, so " +
		"every entry is currently a self-actualizing failure (the client has no LIST-MYRIGHTS-aware " +
		"surface at all).",
	requirements: [
		// ── §3 MYRIGHTS Return Option to LIST Command ─────────────────────────────

		{
			id: "RFC8440-3-1",
			source: "RFC8440",
			section: "3",
			title: "Client (implicit) MUST emit LIST ... RETURN (MYRIGHTS) to request interleaved rights information",
			text:
				"This document extends the LIST command with a new \"MYRIGHTS\" return option " +
				"[RFC5258] that allows the client to request all of the desired information in a " +
				"single command.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit MUST on wire form; no RFC 2119 keyword in the source " +
				"sentence). §5 formalizes it as 'return-option =/ \"MYRIGHTS\"', which admits no " +
				"alternative spelling. A client that wants MYRIGHTS folded into a mailbox listing " +
				"(rather than issuing MYRIGHTS per mailbox after a separate LIST, per §1's motivating " +
				"complaint that the naive approach 'wastes bandwidth and can degrade performance if " +
				"the client does not pipeline the requests') must include the bare atom MYRIGHTS in " +
				"the LIST command's RETURN option list, per the example 'C: A01 LIST \"\" % RETURN " +
				"(MYRIGHTS)'. The response-content parsing duty (rights-string shape, ignoring virtual " +
				"'d'/'c') is cross-referenced to RFC4314-2.1.1-3 rather than re-scored here — see " +
				"extractionNote. Conditional on the server advertising LIST-MYRIGHTS and the client " +
				"choosing to use it. Standalone in rev2 (no RFC 9051 counterpart), so profiles " +
				"[\"rev1\",\"rev2\"]. Self-actualizing fail: driver.list()'s returnOptions surface " +
				"exists but the verb throws NotImplementedError, so no RETURN (MYRIGHTS) option can be " +
				"driven to completion.",
		},
		{
			id: "RFC8440-3-2",
			source: "RFC8440",
			section: "3",
			title: "Client MUST NOT expect/require a MYRIGHTS response before the LIST response for the same mailbox",
			text:
				"The ordering of the responses is significant only in that the server MUST NOT send a " +
				"MYRIGHTS response for a given mailbox before it sends the LIST response for that " +
				"mailbox.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"The quoted sentence is literally the SERVER's ordering constraint ('the server MUST " +
				"NOT send'); the client-binding corollary recorded here (implicit MUST NOT, no " +
				"independent client-directed keyword) is that a conformant client's response-pairing " +
				"logic must key an untagged MYRIGHTS response to the most recently emitted LIST " +
				"response for the same mailbox name, never the reverse — i.e. the client must not " +
				"require, expect, or special-case a MYRIGHTS-before-LIST ordering, and must associate " +
				"each MYRIGHTS response with the LIST response that necessarily preceded it for that " +
				"mailbox (per the worked example in §4: '* LIST () \".\" \"INBOX\"' immediately followed " +
				"by '* MYRIGHTS \"INBOX\" lrswipkxtecda', repeated per mailbox). Testable black-box: " +
				"script a LIST RETURN (MYRIGHTS) exchange with correctly ordered LIST/MYRIGHTS pairs " +
				"across multiple mailboxes and assert the client correlates each MYRIGHTS response to " +
				"its preceding same-name LIST response rather than misattributing it. Conditional on " +
				"the client using LIST-MYRIGHTS. Standalone in rev2, profiles [\"rev1\",\"rev2\"]. " +
				"Self-actualizing fail: driver.list() throws NotImplementedError, so no ordered " +
				"LIST/MYRIGHTS response pair can be driven to the client for correlation.",
		},
		{
			id: "RFC8440-3-3",
			source: "RFC8440",
			section: "3",
			title: "Client (implicit) MUST accept a LIST response with no accompanying MYRIGHTS response as well-formed",
			text:
				"If the server is unable to look up the set of rights for a given mailbox, it does not " +
				"send the MYRIGHTS reply for that mailbox.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit client-accept MUST; the source sentence describes the " +
				"server's omission behavior with no RFC 2119 keyword directing the client). A " +
				"conformant client must treat a LIST response with no paired MYRIGHTS response as a " +
				"normal, well-formed outcome (the server could not compute rights for that mailbox), " +
				"not a protocol violation or an error to surface. Reinforced by §3's SHOULD-level " +
				"framing elsewhere ('the server ... SHOULD also return an untagged MYRIGHTS response') " +
				"— since MYRIGHTS is only a SHOULD from the server, the client cannot treat its absence " +
				"as exceptional. Per the worked example in §4: 'the \"bar\" mailbox doesn't exist, so " +
				"it has no MYRIGHTS reply' — '* LIST (\\NonExistent) \".\" \"bar\"' with no following " +
				"MYRIGHTS line, and the second example where '\"foo\" itself doesn't match the " +
				"selection criteria' so its LIST-via-CHILDINFO appears with no MYRIGHTS pairing either. " +
				"Testable black-box: script a LIST RETURN (MYRIGHTS) response where one mailbox's LIST " +
				"line has no following MYRIGHTS line and assert the client does not error/hang/retry, " +
				"treating that mailbox as simply lacking rights information. Conditional on the client " +
				"using LIST-MYRIGHTS. Standalone in rev2, profiles [\"rev1\",\"rev2\"]. " +
				"Self-actualizing fail: driver.list() throws NotImplementedError, so no MYRIGHTS-omission " +
				"case can be driven to the client.",
		},

		// ── §6 Security Considerations (client-directed SHOULD) ──────────────────

		{
			id: "RFC8440-6-1",
			source: "RFC8440",
			section: "6",
			title: "Client SHOULD scope LIST-MYRIGHTS requests with a narrow match pattern/selection option",
			text:
				"Clients SHOULD use a suitable match pattern and/or selection option to limit the set " +
				"of mailboxes returned to only those in whose rights they are interested.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Explicit client-directed SHOULD (uppercase, unambiguous), the second half of §6's " +
				"security-considerations sentence pair (the first half, describing server-side " +
				"overload risk and the server's need to yield execution to other connections, is " +
				"server-only and excluded — see extractionNote). Motivated by the preceding " +
				"introductory framing that 'generating the MYRIGHTS responses for a large number of " +
				"mailboxes may be an expensive operation for the server'. Testable black-box: script a " +
				"mailbox hierarchy with many mailboxes and assert the client's LIST RETURN (MYRIGHTS) " +
				"pattern/selection options are scoped (e.g. a specific subtree or subscribed-only " +
				"selection) rather than an unqualified wildcard sweep, when the client is only " +
				"interested in a subset of mailboxes' rights. Conditional on the client using " +
				"LIST-MYRIGHTS. Standalone in rev2, profiles [\"rev1\",\"rev2\"]. Self-actualizing " +
				"fail: driver.list() throws NotImplementedError, so no pattern/selection-option choice " +
				"can be observed.",
		},
	],
};

export default rfc8440;
