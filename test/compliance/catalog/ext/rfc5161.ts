import type { CatalogModule } from "../types";

const rfc5161: CatalogModule = {
	source: "RFC5161",
	extractionNote:
		"Full document reviewed (Abstract, §1 Overview, §2 Conventions, §3 Protocol Changes " +
		"[§3.1 The ENABLE Command, §3.2 The ENABLED Response, §3.3 Note to Designers], §4 Formal " +
		"Syntax, §5 Security Considerations, §6 IANA Considerations, §7 Acknowledgments, §8/§9 " +
		"References, Editors' Addresses, Full Copyright Statement, Intellectual Property). " +
		"4 client-binding entries extracted, all from §3.1/§3.2 (the only sections containing " +
		"client-directed duties): (1) SHOULD only include extensions that need to be enabled " +
		"(judgment-testable per the RFC9051-6.3.1-1 precedent — untestable, internal-decision: a " +
		"client that always includes a supported extension is wire-indistinguishable from one that " +
		"filters by necessity); (2) MUST NOT issue ENABLE after SELECT/EXAMINE (testable — " +
		"unimplemented today, so self-actualizing fail); (3) implicit-MUST (judgment call, no RFC " +
		"2119 keyword) that a client only ENABLE extensions it itself supports, drawn from ENABLE's " +
		"defining purpose ('provides an explicit indication from the client that it supports " +
		"particular extensions') — untestable, internal-decision, since a client that names an " +
		"unsupported extension anyway produces a legal wire form indistinguishable from a truthful " +
		"one absent the extension's own behavior; (4) implicit client duty (judgment call, no " +
		"keyword) that an ENABLE for which no extension was successfully enabled (empty untagged " +
		"ENABLED response, or an ENABLE command that enabled nothing) is not itself an error " +
		"condition to the client — testable, unimplemented today. Excluded as server-only: the " +
		"per-argument ignore-unknown/ignore-unpermitted/enable-if-supported trio (MUST, binds the " +
		"server's ENABLE processing), the MUST to send untagged ENABLED on success (server response-" +
		"generation duty), the SHOULD scoping each ENABLED response to its triggering ENABLE when " +
		"multiple ENABLEs are issued (server-side accounting), and the MUST NOT change CAPABILITY as " +
		"a result of ENABLE (server-side invariant demonstrated by example, no client action " +
		"required to observe or enforce it). Excluded as keyword-less permission-lifting prose " +
		"imposing no duty: 'There are no limitations on pipelining ENABLE' with its worked LOGIN-" +
		"then-ENABLE / ENABLE-then-SELECT examples (a client that serializes ENABLE with its " +
		"neighbors is fully compliant) — same exclusion RFC9051-6.3.1 applied to the identical " +
		"sentence, retired there as RFC9051-6.3.1-3. §3.3 (Note to Designers) addresses extension " +
		"designers, not IMAP clients — no client-binding content. §4 Formal Syntax, §5 Security " +
		"Considerations, and §6 IANA Considerations contain no client-directed normative language " +
		"(§4's 'MUST accept these strings in a case-insensitive fashion' in the ABNF preamble binds " +
		"parsers of the capability token generally per RFC 5234 conventions and is boilerplate " +
		"shared with the base ABNF meta-grammar, not a distinct RFC 5161 client duty beyond what " +
		"case-insensitive capability matching already requires under RFC 3501/9051). " +
		"REV2-CORE CROSS-REFERENCE: under IMAP4rev2 (RFC 9051), ENABLE is a CORE command, not an " +
		"extension — RFC9051-6.3.1-1 (SHOULD only include extensions that need to be enabled) and " +
		"RFC9051-6.3.1-2 (MUST NOT issue ENABLE after SELECT/EXAMINE) restate this file's entries " +
		"3.1-1 and 3.1-2 as baseline rev2 duties, word-for-word identical text in both cases. To " +
		"avoid double-scoring the same duty against two sources for a rev2 client, RFC5161-3.1-1 " +
		"and RFC5161-3.1-2 are tagged profiles: [\"rev1\"] only here (they remain the binding text " +
		"for a rev1 client that opts into the ENABLE extension; the rev2 baseline obligation is " +
		"scored via RFC9051-6.3.1-1/-2 instead). RFC5161-3.1-3 (only-ENABLE-what-you-support) and " +
		"RFC5161-3.2-1 (empty ENABLED is not an error) have no RFC 9051 §6.3.1 counterpart text " +
		"(9051 does not restate them), so they remain source-of-truth for both profiles: " +
		"[\"rev1\",\"rev2\"] — a rev2 client using ENABLE is bound by these two duties only through " +
		"this document, since RFC 9051 folds in the command mechanics but not this pair of ancillary " +
		"duties. Total: 4 client-binding entries (RFC5161-3.1-1..3, RFC5161-3.2-1). Untestable: 2 " +
		"(RFC5161-3.1-1, RFC5161-3.1-3; both theme internal-decision).",
	requirements: [
		// ── §3.1 The ENABLE Command ─────────────────────────────────────────────

		{
			id: "RFC5161-3.1-1",
			source: "RFC5161",
			section: "3.1",
			title: "Client SHOULD only include extensions that need to be enabled",
			text: "Clients SHOULD only include extensions that need to be enabled by the server.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"Whether a given extension 'needs to be enabled' is the client's own internal " +
				"determination about its capability negotiation strategy, not something observable " +
				"from the ENABLE command on the wire. A client that includes an extension it happens " +
				"to support (but does not strictly need enabled) is behaviorally indistinguishable, " +
				"at the protocol level, from one that first checks necessity before including it — " +
				"both send a syntactically identical ENABLE argument list. No black-box test can " +
				"distinguish a principled 'only if needed' client from an unconditional one.",
			notes:
				"Applies only when the client chooses to use ENABLE at all (conditional on the " +
				"client implementing/using any enable-requiring extension). Word-for-word identical " +
				"to RFC9051-6.3.1-1, which restates this duty as rev2's own baseline text (ENABLE is " +
				"a core rev2 command, not an extension there). Tagged rev1-only here to avoid double-" +
				"scoring the identical duty against both sources for a rev2 client; see this module's " +
				"extractionNote for the full rev2-core cross-reference. Full context in this document: " +
				"'At the time of publication, CONDSTORE is the only such extension (i.e., ENABLE " +
				"CONDSTORE is an additional \"CONDSTORE enabling command\" as defined in [RFC4551]). " +
				"Future RFCs may add to this list.'",
		},
		{
			id: "RFC5161-3.1-2",
			source: "RFC5161",
			section: "3.1",
			title: "Client MUST NOT issue ENABLE after SELECT/EXAMINE",
			text: "Clients MUST NOT issue ENABLE once they SELECT/EXAMINE a mailbox",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "testable",
			notes:
				"Full context: 'The ENABLE command is only valid in the authenticated state (see " +
				"[RFC3501]), before any mailbox is selected. Clients MUST NOT issue ENABLE once they " +
				"SELECT/EXAMINE a mailbox; however, server implementations don't have to check that " +
				"no mailbox is selected or was previously selected during the duration of a " +
				"connection.' The trailing server-leniency clause is excluded (it describes a server " +
				"implementation option, not a client duty); the prohibition itself is quoted verbatim " +
				"as a complete, independently normative sentence. Conditional on the client using " +
				"ENABLE at all. Word-for-word identical to RFC9051-6.3.1-2 (rev2's own baseline text " +
				"for the same duty); tagged rev1-only here per this module's rev2-core cross-" +
				"reference. Currently self-actualizing fail: driver.enable() throws " +
				"NotImplementedError unconditionally, so the client has no ENABLE surface at all — " +
				"trivially it cannot violate this ordering, but it also cannot exercise the " +
				"authenticated-state ENABLE path the RFC anticipates, which the compliance suite " +
				"records as a failure for this entry.",
		},
		{
			id: "RFC5161-3.1-3",
			source: "RFC5161",
			section: "3.1",
			title: "Client (implicit) MUST only ENABLE extensions it itself supports",
			text:
				"The ENABLE extension provides an explicit indication from the client that it " +
				"supports particular extensions.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"No sentence in this document says in RFC 2119 terms 'a client MUST NOT name an " +
				"extension it does not support'; the duty is inferred from ENABLE's stated purpose — " +
				"an ENABLE argument is defined as 'an explicit indication from the client that it " +
				"supports particular extensions', so naming an extension the client does not in fact " +
				"support would make that indication false. Whether the client 'supports' a named " +
				"extension is an internal fact about its own implementation, not something the " +
				"ENABLE command's wire form can attest to either way: a truthful and an untruthful " +
				"ENABLE argument list are syntactically identical, and any divergence would surface " +
				"only through the named extension's own subsequent behavior (already covered, where " +
				"testable, by that extension's own catalog entries) rather than through ENABLE " +
				"itself. Judgment call: this is an implicit-MUST derived from the command's defining " +
				"semantics rather than an explicit RFC 2119 keyword sentence, in the same vein as " +
				"other implicit-MUST entries carried in this catalog family.",
			notes:
				"Judgment level (implicit MUST, no RFC 2119 keyword in the source sentence) drawn " +
				"from §1 Overview's definition of what ENABLE means, not from an imperative sentence " +
				"in §3.1 itself. Has no RFC 9051 §6.3.1 restatement (9051 folds in the ENABLE command " +
				"mechanics but not this defining-purpose sentence), so it remains source-of-truth via " +
				"this document alone for both rev1 and rev2 clients that use ENABLE.",
		},

		// ── §3.2 The ENABLED Response ────────────────────────────────────────────

		{
			id: "RFC5161-3.2-1",
			source: "RFC5161",
			section: "3.2",
			title: "Client (implicit) MUST NOT treat an empty/no-op ENABLE as an error",
			text:
				"The ENABLED response may contain no capabilities, which means that no extensions " +
				"listed by the client were successfully enabled.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit client-handling MUST inferred from a MAY-worded server-" +
				"behavior sentence; no RFC 2119 keyword binds the client directly here). The RFC " +
				"defines an ENABLED response with zero capabilities as a normal, well-formed outcome " +
				"('may contain no capabilities') rather than an error condition — so a compliant " +
				"client must accept a tagged OK completing an ENABLE command whose ENABLED response " +
				"names none of the requested extensions (or names fewer than requested) as a " +
				"successful command completion, not a failure. Has no RFC 9051 §6.3.1 restatement, " +
				"so it remains source-of-truth via this document alone for both profiles. Currently " +
				"self-actualizing fail: driver.enable() throws NotImplementedError unconditionally, " +
				"so the client has no ENABLE surface capable of completing (with an empty or non-" +
				"empty ENABLED response) at all.",
		},
	],
};

export default rfc5161;
