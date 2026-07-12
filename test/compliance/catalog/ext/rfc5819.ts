import type { CatalogModule } from "../types";

const rfc5819: CatalogModule = {
	source: "RFC5819",
	extractionNote:
		"RFC 5819 (IMAP4 Extension for Returning STATUS Information in Extended LIST — the LIST-STATUS " +
		"capability). Full document reviewed: Abstract, §1 Introduction, §1.1 Conventions, §2 STATUS " +
		"Return Option to LIST Command, §3 Examples, §4 Formal Syntax, §5 Security Considerations, §6 " +
		"IANA Considerations, §7 Acknowledgements, §8 Normative References, Authors' Addresses. All " +
		"normative content is concentrated in §2 (with §3 supplying the worked examples and §4 the " +
		"ABNF). 4 client-binding entries extracted, all homed at §2. " +
		"SERVER-VS-CLIENT SPLIT (extractor rule 6): every RFC 2119 keyword in this document is " +
		"SERVER-directed — §2's 'the server MUST return an untagged LIST response followed by an " +
		"untagged STATUS response', 'the STATUS response MUST NOT be returned and the LIST response " +
		"MUST include the \\NoSelect attribute', and 'it MAY drop the corresponding STATUS reply' all " +
		"bind the server's response generation, not the client. The document defines NO explicit " +
		"RFC 2119 client obligation. The client-binding duties are therefore all JUDGMENT-LEVEL " +
		"implicit duties (disclosed per entry, same treatment as the implicit-MUST entries in " +
		"ext/rfc5161.ts): (RFC5819-2-1) the command form the client emits to invoke the feature — " +
		"'LIST ... RETURN (STATUS (<status items>))' — drawn from §2's 'extending the LIST command " +
		"with a new return option, STATUS ... takes STATUS data items as parameters' plus §4's " +
		"return-option/status-option ABNF; (RFC5819-2-2) the client's duty to ASSOCIATE each untagged " +
		"'* STATUS' response with the immediately-preceding untagged '* LIST' entry (the interleaving " +
		"the server MUST produce is only useful if the client pairs them correctly); (RFC5819-2-3) the " +
		"client's duty to accept that STATUS is returned for matching SELECTABLE mailboxes only — a " +
		"listed mailbox that carries \\NoSelect and has NO paired STATUS response is a normal, " +
		"well-formed outcome, not an error; (RFC5819-2-4) the client's duty to accept a tagged OK " +
		"completion even when some requested STATUS replies were dropped by the server. " +
		"Server-only duties EXCLUDED (rule 6): the server MUST return the LIST+STATUS pair for each " +
		"selectable mailbox (server response-generation duty; the client-side residue is the paired " +
		"association captured by RFC5819-2-2 and the accept-only-selectable residue captured by " +
		"RFC5819-2-3); the server MUST NOT return STATUS / MUST include \\NoSelect on the can't-select " +
		"path (server response-shaping duty; client residue captured by RFC5819-2-3); the server MAY " +
		"drop STATUS on unexpected error (server option; client residue captured by RFC5819-2-4); the " +
		"buffering guidance 'the server may have to buffer the LIST reply until it has successfully " +
		"looked up the necessary STATUS information' (server implementation note, no client action); §5 " +
		"Security Considerations ('a server implementation needs to make sure that it can still serve " +
		"other IMAP connections') binds the server; §6 IANA Considerations registers the LIST-STATUS " +
		"capability and the STATUS return option (registry action, no client duty); §4 ABNF is a syntax " +
		"production reflected in RFC5819-2-1's command form, not a distinct duty. " +
		"REV2-CORE ADJUDICATION (rule 4). RFC 9051 folded LIST-STATUS into rev2 core: §6.3.9.2 (LIST " +
		"Return Options, STATUS) restates RFC 5819 §2's three normative sentences NEARLY VERBATIM " +
		"('the server MUST return an untagged LIST response followed by an untagged STATUS response ... " +
		"except for some cases described below'; the can't-select \\NoSelect rule; 'it MAY drop the " +
		"corresponding STATUS reply'). CRITICAL: those rev2 restatements are all SERVER-directed, and " +
		"catalog/rfc9051.ts (s6-auth-b.ts §6.3.9 entries RFC9051-6.3.9-1..-6 and the §6.3.9.x " +
		"subsection entries) contains NO client-binding entry corresponding to any of the four LIST-" +
		"STATUS client duties below — the rev2 §6.3.9 client entries cover reference-argument use " +
		"(-1/-2/-3), handling unsolicited extension data (-4), not sending an unadvertised option (-5), " +
		"not duplicating an option (-6), and LIST-attribute inference (§6.3.9.4), none of which is the " +
		"STATUS-association / accept-missing-STATUS duty. Because rev2 core as cataloged does NOT " +
		"absorb these client duties into a scored entry, all four entries KEEP profiles [\"rev1\"," +
		"\"rev2\"] (there is no RFC9051 counterpart id to dedupe against — the rev1-only tag is used " +
		"only where an IDENTICAL already-scored rev2-core client duty exists, which is not the case " +
		"here). RFC5819-2-1's command form is the closest to a rev2 overlap: RFC9051-6.3.9-5 (MUST NOT " +
		"send an unadvertised option) constrains WHEN the client may send RETURN (STATUS ...) under " +
		"rev2, but it is a distinct prohibition, not a restatement of the affirmative command-form " +
		"duty, so no dedupe applies; noted in RFC5819-2-1. " +
		"Total: 4 client-binding entries (RFC5819-2-1..RFC5819-2-4). Untestable: 1 (RFC5819-2-2, theme " +
		"internal-decision). Testable: 3 (RFC5819-2-1 command form, RFC5819-2-3 accept selectable-only, " +
		"RFC5819-2-4 accept tagged-OK-with-dropped-STATUS) — all self-actualizing fails today: " +
		"driver.list() with returnOptions throws NotImplementedError, so the client has no LIST-STATUS " +
		"surface, which the suite records as a failure for this RFC.",
	requirements: [
		// ── §2 STATUS Return Option to LIST Command ──────────────────────────────

		{
			id: "RFC5819-2-1",
			source: "RFC5819",
			section: "2",
			title: "Client (implicit) emits LIST ... RETURN (STATUS (<status items>)) to request STATUS in LIST",
			text:
				"In order to achieve this goal, this document is extending the LIST command with a new " +
				"return option, STATUS. This option takes STATUS data items as parameters.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit command-form MUST; no RFC 2119 keyword binds the client — the " +
				"keyworded sentences in §2 all bind the SERVER). The client-binding duty is the wire form it " +
				"must emit to invoke LIST-STATUS: a LIST command carrying 'RETURN (STATUS (<status items>))', " +
				"i.e. the return-option / status-option ABNF of §4 ('return-option =/ status-option', " +
				"'status-option = \"STATUS\" SP \"(\" status-att *(SP status-att) \")\"'). Conditional on the " +
				"client choosing to use the LIST-STATUS extension at all. Kept profiles [\"rev1\",\"rev2\"]: " +
				"RFC 9051 §6.3.9.2 restates the STATUS return option as rev2 core, but only as a SERVER duty; " +
				"catalog/rfc9051.ts carries no client-binding entry for the affirmative command form, so this " +
				"is not double-scored (see this module's extractionNote rev2-core adjudication). The nearest " +
				"rev2 client entry, RFC9051-6.3.9-5 (MUST NOT send an option the server has not advertised), " +
				"is a distinct prohibition gating WHEN this option may be sent, not a restatement of the " +
				"command form, so no rev1-only dedupe applies. Currently self-actualizing fail: driver.list() " +
				"invoked with a returnOptions payload throws NotImplementedError, so the client has no LIST-" +
				"STATUS surface to emit this form.",
		},
		{
			id: "RFC5819-2-2",
			source: "RFC5819",
			section: "2",
			title: "Client (implicit) MUST associate each untagged STATUS response with its preceding LIST entry",
			text:
				"For each selectable mailbox matching the list pattern and selection options, the server MUST " +
				"return an untagged LIST response followed by an untagged STATUS response containing the " +
				"information requested in the STATUS return option.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"The quoted sentence binds the SERVER ('the server MUST return'); the implicit client duty " +
				"is to ASSOCIATE each untagged '* STATUS' response with the '* LIST' entry it immediately " +
				"follows, so the STATUS counts are attributed to the correct mailbox. That association is a " +
				"purely internal client bookkeeping decision with no wire signature: a client that pairs the " +
				"responses correctly and one that mis-pairs (or ignores the ordering) both send an identical " +
				"LIST-STATUS command and both consume the same untagged responses off the wire — the " +
				"divergence surfaces only in the client's internal model / its UI, never in the bytes it " +
				"emits. No black-box test can distinguish a correctly-associating client from a mis-" +
				"associating one. Same class as the RFC5161-3.1-3 / RFC9051-6.3.9-3 internal-decision " +
				"entries.",
			notes:
				"Judgment level (implicit MUST derived from the interleaved-response contract; the source " +
				"sentence's own MUST binds the server). The verbatim text is quoted as the server obligation " +
				"whose client-side counterpart this entry captures. Kept profiles [\"rev1\",\"rev2\"]: RFC " +
				"9051 §6.3.9.2 restates this same server sentence nearly verbatim as rev2 core, but " +
				"catalog/rfc9051.ts has no client-binding STATUS-association entry, so this is not double-" +
				"scored (see extractionNote). The association duty is source-of-truth for both profiles via " +
				"this document.",
		},
		{
			id: "RFC5819-2-3",
			source: "RFC5819",
			section: "2",
			title: "Client (implicit) MUST accept STATUS for selectable mailboxes only (listed \\NoSelect entry with no STATUS is not an error)",
			text:
				"If an attempted STATUS for a listed mailbox fails because the mailbox can't be selected " +
				"(e.g., if the \"l\" ACL right [ACL] is granted to the mailbox and the \"r\" right is not " +
				"granted, or due to a race condition between LIST and STATUS changing the mailbox to " +
				"\\NoSelect), the STATUS response MUST NOT be returned and the LIST response MUST include the " +
				"\\NoSelect attribute.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit client-handling MUST; the quoted sentence's MUST NOT / MUST bind " +
				"the SERVER's response shaping). STATUS is returned for matching SELECTABLE mailboxes only; a " +
				"listed mailbox that carries the \\NoSelect attribute and has NO paired '* STATUS' response " +
				"is a normal, well-formed outcome per this rule (illustrated by §3's 'bar' example: '* LIST " +
				"(\\NoSelect) \".\" \"bar\"' with no STATUS reply, annotated 'The \"bar\" mailbox isn't " +
				"selectable, so it has no STATUS reply.'). A compliant client MUST accept such a LIST-STATUS " +
				"exchange — completing on the tagged OK — rather than treating the missing STATUS for a " +
				"\\NoSelect entry as a protocol error or a stalled request. Conditional on the client using " +
				"LIST-STATUS. Kept profiles [\"rev1\",\"rev2\"]: RFC 9051 §6.3.9.2 restates the same can't-" +
				"select \\NoSelect rule as a rev2-core SERVER duty, and catalog/rfc9051.ts carries no client-" +
				"binding entry for accepting a STATUS-less \\NoSelect LIST entry, so this is not double-scored " +
				"(see extractionNote). Testable: script the §3 example exchange — a '* LIST (\\NoSelect) ... " +
				"\"bar\"' with no following '* STATUS', then a tagged OK — and assert the client completes the " +
				"command successfully without erroring on the absent STATUS. Currently self-actualizing fail: " +
				"driver.list() with returnOptions throws NotImplementedError, so the client cannot drive a " +
				"LIST-STATUS exchange to completion at all.",
		},
		{
			id: "RFC5819-2-4",
			source: "RFC5819",
			section: "2",
			title: "Client (implicit) MUST accept a tagged OK completion even when some STATUS replies were dropped",
			text:
				"If the server runs into unexpected problems while trying to look up the STATUS information, " +
				"it MAY drop the corresponding STATUS reply. In such a situation, the LIST command would " +
				"still return a tagged OK reply.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit client-handling MUST inferred from a server-MAY sentence; no RFC " +
				"2119 keyword binds the client directly). The RFC defines a LIST-STATUS response in which the " +
				"server dropped one or more requested STATUS replies (on unexpected lookup problems) as a " +
				"normal outcome that STILL completes with a tagged OK — not an error and not a partial " +
				"failure the client must reject. A compliant client MUST therefore accept the tagged OK " +
				"completion of a LIST ... RETURN (STATUS ...) command even when fewer '* STATUS' responses " +
				"arrive than mailboxes were listed (or none arrive), treating it as successful completion " +
				"with incomplete STATUS data rather than a command failure. Conditional on the client using " +
				"LIST-STATUS. Kept profiles [\"rev1\",\"rev2\"]: RFC 9051 §6.3.9.2 restates 'it MAY drop the " +
				"corresponding STATUS reply' as a rev2-core SERVER option, and catalog/rfc9051.ts has no " +
				"client-binding entry for accepting a tagged-OK-with-dropped-STATUS completion, so this is " +
				"not double-scored (see extractionNote). Distinct from RFC5819-2-3: -3 is the deterministic " +
				"can't-select (\\NoSelect) path, -4 is the server's optional best-effort drop on unexpected " +
				"error. Testable: script a LIST-STATUS exchange in which a listed selectable mailbox receives " +
				"no '* STATUS' reply before the tagged OK, and assert the client completes successfully. " +
				"Currently self-actualizing fail: driver.list() with returnOptions throws " +
				"NotImplementedError.",
		},
	],
};

export default rfc5819;
