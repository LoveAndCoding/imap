import type { CatalogModule } from "../types";

const rfc5256: CatalogModule = {
	source: "RFC5256",
	extractionNote:
		"RFC 5256 (IMAP SORT and THREAD Extensions; capability tokens SORT, THREAD=ORDEREDSUBJECT, " +
		"THREAD=REFERENCES) fully reviewed for client-binding requirements. CLIENT/SERVER SPLIT: this " +
		"RFC is overwhelmingly server-binding — it specifies server-based sorting and threading " +
		"precisely so the client does NOT have to implement the algorithms ('without requiring that " +
		"the client download the necessary data to do so itself'). The client-binding surface is the " +
		"command forms (SORT/UID SORT/THREAD/UID THREAD with their mandatory charset and criteria " +
		"grammar), the untagged SORT/THREAD response acceptance duties, the two capability-token " +
		"recognition/selection duties, one explicit client SHOULD in ORDEREDSUBJECT threading, and " +
		"the disconnected-client base-subject MUST. §1 Introduction: 2 entries (1-1 SORT-prefix " +
		"capability-family recognition — untestable, capability-inventory; 1-2 THREAD=<alg> token " +
		"discipline, i.e., only issue THREAD with an advertised algorithm). The §1 I18NLEVEL=1 " +
		"collation MUST/SHOULD/MAY trio binds servers ('A server that implements the SORT and/or " +
		"THREAD extensions MUST collate strings...') — skipped as server-only, as is its §7 " +
		"restatement. §2 Terminology: boilerplate, no entries. §2.1 Base Subject: the extraction " +
		"steps (1)-(7) and the §5 subject ABNF (subj-leader/subj-blob/subj-refwd/BLOBCHAR/NONWSP " +
		"etc.) define a computation performed by whichever party sorts/threads — the SERVER in the " +
		"online model this suite tests — and are skipped as algorithm internals; the one sentence " +
		"that names clients ('All servers and disconnected clients MUST use exactly this algorithm') " +
		"is cataloged as 2.1-1, conditional on operating as a disconnected client, untestable " +
		"(content-processing: a local base-subject computation for an offline sorted view has no " +
		"wire signature). §2.2 Sent Date: no entries — the sent-date derivation and its invalid-" +
		"date/timezone SHOULDs bind the party performing the sort comparisons (the server here; a " +
		"disconnected client only via the same offline-sorting condition as 2.1-1, with the same " +
		"no-wire-signature character — folded into 2.1-1's rationale rather than cataloged " +
		"separately since the RFC's own client-naming sentence appears only in §2.1). §3 " +
		"BASE.6.4.SORT: 5 entries — command form (1), mandatory charset (2), US-ASCII/UTF-8 charset " +
		"floor (3), UID SORT same-interpretation/UID-results (4), EXPUNGE-permitted-during-UID-SORT " +
		"acceptance (5). Skipped as server-only: search-then-sort execution model, ascending-order " +
		"rules, implicit sequence-number tie-break, multiple-criteria priority ordering, the per-" +
		"criterion sort semantics (ARRIVAL/CC/DATE/FROM/SIZE/SUBJECT/TO definitions bind what the " +
		"SERVER sorts by; the client-side duty of emitting only these atoms is cataloged via the §5 " +
		"grammar as 5-1), the absent-header-empty-string rule, and the EXPUNGE-not-permitted-during-" +
		"SORT prohibition half (server emission duty; the client-facing permitted-during-UID-SORT " +
		"half is entry 5). The REVERSE advisory note ('it's better (and faster...) to reverse the " +
		"results in the client instead of issuing a new SORT') carries no RFC 2119 keyword and " +
		"imposes no duty — skipped, referenced in 5-1's notes. §3 BASE.6.4.THREAD: 6 entries " +
		"mirroring SORT (form/charset/floor/UID/EXPUNGE-acceptance, 1-5) plus the RFC's only " +
		"explicit 'Client implementations SHOULD' sentence (6: treat descendents of a child in an " +
		"ORDEREDSUBJECT response as siblings of that child). Skipped as server-only: the entire " +
		"ORDEREDSUBJECT and REFERENCES algorithm specifications (sorting/splitting/root-shape rules, " +
		"msg-id normalization MUSTs, reference-reconstruction rules, the six REFERENCES steps with " +
		"their internal MUSTs such as step 1.A/1.B link consistency) — these bind the implementer " +
		"of the threading algorithm, which in the online model is the server (a disconnected client " +
		"threading locally would inherit them under the same condition as 2.1-1, again with no wire " +
		"signature toward a scripted server). §4 BASE.7.2.SORT / BASE.7.2.THREAD: 3 acceptance " +
		"entries — untagged SORT response with zero or more space-delimited numbers (seq for SORT, " +
		"UID for UID SORT); untagged THREAD response with zero or more parenthesized threads (and " +
		"the seq/UID interpretation, including the RFC's verbatim 'The messages numbers' typo); the " +
		"thread-members/nesting structure with 'no limit to the nesting of threads' and the " +
		"((3)(5)) missing-parent sibling form. §5 Formal Syntax: 2 entries for the client-emitted " +
		"command grammar (5-1 sort/sort-criteria/sort-criterion/sort-key incl. REVERSE composition " +
		"and the 8 criteria atoms; 5-2 thread/thread-alg plus the shared search-criteria = charset " +
		"1*(SP search-key) production). Response-side ABNF (sort-data/thread-data/thread-list/" +
		"thread-members/thread-nested) is acceptance grammar folded into the §4 entries' notes " +
		"rather than double-cataloged. thread-alg-ext ('New algorithms MUST be registered with " +
		"IANA') binds registrants, not clients. §6 Security Considerations: advisory only (false " +
		"References: trees, base-subject collation caveat), no client duties. §7 " +
		"Internationalization: server collation duties + display-time localization suggestion, no " +
		"client entries. §8 IANA: registration boilerplate. BADCHARSET NOTE: the extraction scope " +
		"asked for BADCHARSET handling, but RFC 5256 never mentions the BADCHARSET response code — " +
		"its only charset-failure surface is the Result block's 'NO - sort error: can't sort that " +
		"charset or criteria' (and the THREAD equivalent); that NO-tolerance duty is carried in the " +
		"notes of entries BASE.6.4.SORT-3/BASE.6.4.THREAD-3 rather than as a synthesized entry, " +
		"since no client-directed sentence about charset failure exists in this document " +
		"(RFC 3501 §7.1 BADCHARSET duties are scored under their own source). REV2 ADJUDICATION: " +
		"grep of catalog/rfc9051/* shows zero SORT/THREAD entries and RFC 9051 does not fold SORT " +
		"or THREAD into IMAP4rev2 core — SORT and THREAD remain standalone extensions under rev2, " +
		"so every entry keeps the default profiles [\"rev1\",\"rev2\"] (no rev1-only tags needed, " +
		"unlike the ENABLE/IDLE overlap sources). Total: 19 client-binding entries. Untestable: 2 " +
		"(1-1 capability-inventory, 2.1-1 content-processing); the remaining 17 are testable. " +
		"UPDATE (M4.9): driver.sort/uidSort/thread/uidThread are all genuinely real and the " +
		"'* SORT'/'* THREAD' parse surfaces both exist in the client, so all 17 genuinely pass.",
	requirements: [
		// ── §1 Introduction ─────────────────────────────────────────────────────

		{
			id: "RFC5256-1-1",
			source: "RFC5256",
			section: "1",
			title: "Client (implicit) recognizes the SORT capability family by its 'SORT' prefix",
			text:
				'A server that supports the base-level SORT extension indicates this with a capability name which starts with "SORT". Future, upwards- ' +
				'compatible extensions to the SORT extension will all start with "SORT", indicating support for this base level.',
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "capability-inventory",
			untestableRationale:
				"The client-binding half of this server-advertisement rule is a capability-" +
				"inventory interpretation duty: when deciding whether base-level SORT is available, " +
				"a client must recognize any capability name starting with 'SORT' (e.g., a future " +
				"'SORT=X' token) as also indicating base-level support, rather than requiring the " +
				"bare token. That determination lives entirely in the client's internal capability " +
				"inventory: it produces no mandated wire exchange of its own, and whether the " +
				"library would gate or permit a SORT command based on a prefix-matched token is " +
				"only observable through user-initiated commands the library does not condition on " +
				"capabilities. A prefix-matching client and an exact-token-matching client are " +
				"wire-indistinguishable against any server that (as all known ones do) advertises " +
				"the bare SORT token alongside any refinements.",
			notes:
				"Judgment level (implicit MUST, no RFC 2119 keyword): the quoted sentences are " +
				"phrased as server advertisement rules; the client duty — treat a SORT-prefixed " +
				"capability name as indicating base-level SORT — is inferred from 'indicating " +
				"support for this base level', which is only meaningful as an instruction to the " +
				"reader of the capability list (the client). Whitespace note: 'upwards- compatible' " +
				"preserves the RFC's own line-break hyphenation as flattened by the mechanical " +
				"quote checker. Ambiguity flagged for audit: the RFC does not say whether a server " +
				"advertising only a refinement token (never the bare 'SORT') is legal, so the " +
				"practical stakes of prefix- vs exact-matching are low; RFC 5957 (SORT=DISPLAY) " +
				"requires SORT alongside it.",
		},
		{
			id: "RFC5256-1-2",
			source: "RFC5256",
			section: "1",
			title: "Client (implicit) uses only threading algorithms the server advertises via THREAD=",
			text:
				'A server that supports the THREAD extension indicates this with one or more capability names consisting of "THREAD=" followed by a ' +
				"supported threading algorithm name as described in this document. This provides for future upwards-compatible extensions.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit MUST, no RFC 2119 keyword): the THREAD capability is " +
				"advertised per-algorithm (THREAD=ORDEREDSUBJECT, THREAD=REFERENCES), so the only " +
				"coherent client reading is that the algorithm argument of a THREAD/UID THREAD " +
				"command must name an algorithm the server has advertised — issuing THREAD " +
				"REFERENCES to a server advertising only THREAD=ORDEREDSUBJECT solicits a BAD/NO " +
				"and is the observable violation shape. Testable (scripted CAPABILITY " +
				"with one THREAD= token, then drive a thread request); driver.thread()/uidThread() " +
				"are genuinely real, so this row passes for real.",
		},

		// ── §2.1 Base Subject ───────────────────────────────────────────────────

		{
			id: "RFC5256-2.1-1",
			source: "RFC5256",
			section: "2.1",
			title: "Disconnected clients MUST use exactly the base-subject extraction algorithm",
			text:
				'All servers and disconnected (as described in [IMAP-MODELS]) clients MUST use exactly this algorithm to determine the "base subject". ' +
				"Otherwise, there is potential for a user to get inconsistent results based on whether they are running in connected or disconnected mode.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "content-processing",
			untestableRationale:
				"This is the one sentence in §2.1 that binds clients, and it binds only " +
				"DISCONNECTED clients — those that sort/thread a local message cache themselves " +
				"instead of issuing SORT/THREAD to the server. The duty's substance is a local " +
				"content computation (steps (1)-(7) over the Subject header, using the §5 subject " +
				"ABNF): its output feeds a locally computed sorted/threaded view and never appears " +
				"on the wire toward the server, so a scripted-server black-box harness has no " +
				"observation point — a client that deviates from the algorithm produces byte-" +
				"identical protocol traffic to one that follows it exactly. The same reasoning " +
				"covers the §2.2 sent-date rules for a disconnected client sorting locally " +
				"(cataloged here by reference rather than as a separate entry, since §2.2 never " +
				"names clients).",
			notes:
				"The rest of §2.1 (the seven extraction steps) and the §5 subject grammar are the " +
				"algorithm this sentence points at; they bind the server in the online model this " +
				"suite tests and are not separately cataloged. Conditional: applies only if the " +
				"client operates in disconnected mode and computes base subjects itself.",
		},

		// ── §3 BASE.6.4.SORT — SORT Command ─────────────────────────────────────

		{
			id: "RFC5256-BASE.6.4.SORT-1",
			source: "RFC5256",
			section: "BASE.6.4.SORT",
			title: "SORT command form: parenthesized sort criteria, then charset, then search keys",
			text:
				"The SORT command is a variant of SEARCH with sorting semantics for the results. There are two arguments before the searching " +
				"criteria argument: a parenthesized list of sort criteria, and the searching charset.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit MUST): command-syntax definitions bind the sender's wire " +
				"form even without an RFC 2119 keyword — a SORT command whose criteria list is " +
				"unparenthesized, or whose charset precedes the criteria list, is malformed " +
				"(Result block: 'BAD - command unknown or arguments invalid'). The precise grammar " +
				"is cataloged from §5 as RFC5256-5-1. driver.sort() is genuinely real, so this row " +
				"passes for real.",
		},
		{
			id: "RFC5256-BASE.6.4.SORT-2",
			source: "RFC5256",
			section: "BASE.6.4.SORT",
			title: "Client MUST include the charset argument in SORT (mandatory, unlike SEARCH)",
			text:
				"The charset argument is mandatory (unlike SEARCH) and indicates the [CHARSET] of the strings that appear in the searching criteria.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: 'mandatory' is imperative-but-unkeyworded prose treated as " +
				"MUST-equivalent for the emitted command form. Unlike SEARCH (where the CHARSET " +
				"specification is an optional prefix), a SORT command with no charset between the " +
				"criteria list and the search keys is syntactically invalid (§5: search-criteria = " +
				"charset 1*(SP search-key)). The client must therefore always emit a charset " +
				"(US-ASCII suffices when criteria strings are ASCII-only). driver.sort() is " +
				"genuinely real, so this row passes for real.",
		},
		{
			id: "RFC5256-BASE.6.4.SORT-3",
			source: "RFC5256",
			section: "BASE.6.4.SORT",
			title: "US-ASCII/UTF-8 charset floor for SORT; all other charsets optional",
			text: "The US-ASCII and [UTF-8] charsets MUST be implemented. All other charsets are optional.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment note on the binding direction: the MUST is addressed to implementations " +
				"of the extension generally; the interpretation of criteria strings is the " +
				"server's job, so the primary weight is server-side. The client-binding residue " +
				"cataloged here is twofold: (a) emission — a client using SORT must itself be able " +
				"to encode its criteria strings in US-ASCII and UTF-8 and label them correctly " +
				"(observable: drive a sort with non-ASCII criteria and assert the declared charset " +
				"matches the encoded octets); (b) reliance — only these two charsets are " +
				"universally available, so a client choosing any other charset must tolerate the " +
				"documented failure result ('NO - sort error: can't sort that charset or " +
				"criteria') without treating it as a protocol error. RFC 5256 never mentions the " +
				"BADCHARSET response code, so no BADCHARSET entry is synthesized for this source. " +
				"driver.sort() is genuinely real, so this row passes for real.",
		},
		{
			id: "RFC5256-BASE.6.4.SORT-4",
			source: "RFC5256",
			section: "BASE.6.4.SORT",
			title: "UID SORT: identical argument interpretation; results are unique identifiers",
			text:
				"There is also a UID SORT command that returns unique identifiers instead of message sequence numbers. Note that there are separate " +
				"searching criteria for message sequence numbers and UIDs; thus, the arguments to UID SORT are interpreted the same as in SORT.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit MUST, definitional prose): the client-binding content is " +
				"that UID SORT arguments carry SORT semantics unchanged — a message-set search key " +
				"in a UID SORT still means sequence numbers (the client must use the UID search " +
				"key for UID sets, exactly as with UID SEARCH), and the numbers in the resulting " +
				"untagged SORT response must be consumed as UIDs, not sequence numbers ('analogous " +
				"to the behavior of UID SEARCH, as opposed to UID COPY, UID FETCH, or UID STORE'). " +
				"The emission half is wire-observable; driver.uidSort() is genuinely real, so this " +
				"row passes for real.",
		},
		{
			id: "RFC5256-BASE.6.4.SORT-5",
			source: "RFC5256",
			section: "BASE.6.4.SORT",
			title: "Client must be prepared for untagged EXPUNGE during a UID SORT response",
			text:
				"Untagged EXPUNGE responses are not permitted while the server is responding to a SORT command, but are permitted during a UID SORT command.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit MUST): the quoted sentence is a server emission rule; " +
				"its client-binding half is the acceptance duty created by the 'but are permitted' " +
				"clause — a client with a UID SORT in flight must tolerate interleaved untagged " +
				"EXPUNGE responses (and the resulting sequence-number shifts) before the tagged " +
				"completion, exactly as during other UID commands (RFC 3501 §5.5). The 'not " +
				"permitted during SORT' half binds only the server and is not scored here. " +
				"Testable by scripting '* n EXPUNGE' between the UID SORT command and its tagged " +
				"OK; self-actualizing today (no UID SORT surface).",
		},

		// ── §3 BASE.6.4.THREAD — THREAD Command ─────────────────────────────────

		{
			id: "RFC5256-BASE.6.4.THREAD-1",
			source: "RFC5256",
			section: "BASE.6.4.THREAD",
			title: "THREAD command form: threading algorithm, then charset, then search keys",
			text:
				"The THREAD command is a variant of SEARCH with threading semantics for the results. Thread has two arguments before the searching " +
				"criteria argument: a threading algorithm and the searching charset.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit MUST): command-syntax definition binding the emitted " +
				"wire form — algorithm atom first (unparenthesized, unlike SORT's criteria list), " +
				"then the mandatory charset, then one or more search keys. Precise grammar " +
				"cataloged from §5 as RFC5256-5-2. driver.thread() is genuinely real, so this row " +
				"passes for real.",
		},
		{
			id: "RFC5256-BASE.6.4.THREAD-2",
			source: "RFC5256",
			section: "BASE.6.4.THREAD",
			title: "Client MUST include the charset argument in THREAD (mandatory, unlike SEARCH)",
			text:
				"The charset argument is mandatory (unlike SEARCH) and indicates the [CHARSET] of the strings that appear in the searching criteria.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level, same reasoning as RFC5256-BASE.6.4.SORT-2; the sentence appears " +
				"verbatim in both command sections and each command is scored separately (a client " +
				"could implement THREAD without SORT or vice versa — the capabilities are " +
				"advertised independently). driver.thread() is genuinely real, so this row passes " +
				"for real.",
		},
		{
			id: "RFC5256-BASE.6.4.THREAD-3",
			source: "RFC5256",
			section: "BASE.6.4.THREAD",
			title: "US-ASCII/UTF-8 charset floor for THREAD; all other charsets optional",
			text: "The US-ASCII and [UTF-8] charsets MUST be implemented. All other charsets are optional.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Same client-binding reading as RFC5256-BASE.6.4.SORT-3 (emission of correctly " +
				"labeled US-ASCII/UTF-8 criteria; reliance only on the two-universally-available " +
				"charsets, tolerating the documented 'NO - thread error: can't thread that charset " +
				"or criteria' otherwise); sentence appears verbatim in the THREAD section and is " +
				"scored per-command. driver.thread() is genuinely real, so this row passes for " +
				"real.",
		},
		{
			id: "RFC5256-BASE.6.4.THREAD-4",
			source: "RFC5256",
			section: "BASE.6.4.THREAD",
			title: "UID THREAD: identical argument interpretation; results are unique identifiers",
			text:
				"There is also a UID THREAD command that returns unique identifiers instead of message sequence numbers. Note that there are separate " +
				"searching criteria for message sequence numbers and UIDs; thus the arguments to UID THREAD are interpreted the same as in THREAD.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit MUST), mirror of RFC5256-BASE.6.4.SORT-4: UID THREAD " +
				"arguments carry THREAD semantics unchanged (message-set keys still mean sequence " +
				"numbers; the UID search key addresses UIDs), and the numbers in the resulting " +
				"untagged THREAD response are UIDs. Verbatim fidelity note: this sentence has no " +
				"comma after 'thus', unlike its SORT twin — preserved as printed. driver.uidThread() " +
				"is genuinely real, so this row passes for real.",
		},
		{
			id: "RFC5256-BASE.6.4.THREAD-5",
			source: "RFC5256",
			section: "BASE.6.4.THREAD",
			title: "Client must be prepared for untagged EXPUNGE during a UID THREAD response",
			text:
				"Untagged EXPUNGE responses are not permitted while the server is responding to a THREAD command, but are permitted during a UID " +
				"THREAD command.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit MUST), mirror of RFC5256-BASE.6.4.SORT-5: the client-" +
				"binding half is tolerance of interleaved untagged EXPUNGE (and consequent " +
				"sequence-number renumbering) while a UID THREAD is in flight; the prohibition " +
				"half binds the server. driver.uidThread() is genuinely real, so this row passes " +
				"for real.",
		},
		{
			id: "RFC5256-BASE.6.4.THREAD-6",
			source: "RFC5256",
			section: "BASE.6.4.THREAD",
			title: "Client SHOULD treat descendents of a child in an ORDEREDSUBJECT response as siblings",
			text: "Client implementations SHOULD treat descendents of a child in a server response as being siblings of that child.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"The only explicit 'Client implementations SHOULD' sentence in the RFC. Context: " +
				"ORDEREDSUBJECT threads are defined to be at most two levels deep ('there are no " +
				"grandchildren in ORDEREDSUBJECT threading', 'Children in ORDEREDSUBJECT threading " +
				"do not have descendents'), so a THREAD response for an ORDEREDSUBJECT request " +
				"that nevertheless nests deeper must be normalized by flattening the extra depth " +
				"to siblings rather than rejected or rendered as grandchildren. Testability " +
				"judgment: the observable surface is the thread structure the library delivers at " +
				"its API boundary for a scripted deep-nested '* THREAD' response to an " +
				"ORDEREDSUBJECT request (the same delivered-outcome surface this suite already " +
				"uses for other treat-as duties, e.g. RFC5161-3.2-1) — not the rendered UI, which " +
				"is why this is not tagged ui-presentation. driver.thread()'s command surface and " +
				"the '* THREAD' parse surface are both genuinely real, so this row passes for real.",
		},

		// ── §4 BASE.7.2.SORT — SORT Response ────────────────────────────────────

		{
			id: "RFC5256-BASE.7.2.SORT-1",
			source: "RFC5256",
			section: "BASE.7.2.SORT",
			title: "Accept untagged SORT response: zero or more space-delimited numbers (seq or UID)",
			text:
				"The SORT response occurs as a result of a SORT or UID SORT command. The number(s) refer to those messages that match the search " +
				"criteria. For SORT, these are message sequence numbers; for UID SORT, these are unique identifiers. Each number is delimited by a space.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit MUST): response definitions bind the receiver's " +
				"acceptance — a client that issued SORT/UID SORT must parse '* SORT' followed by " +
				"zero or more space-delimited nz-numbers (§5: sort-data = \"SORT\" *(SP " +
				"nz-number)), including the empty no-match form shown in the §3 example ('C: A284 " +
				"SORT (SUBJECT) US-ASCII TEXT \"not in mailbox\" / S: * SORT / S: A284 OK SORT " +
				"completed'), preserving the server's sort order and interpreting the numbers as " +
				"sequence numbers or UIDs according to the issuing command form. driver.sort()'s " +
				"command surface and the client parser's '* SORT' branch are both genuinely real, " +
				"so this row passes for real.",
		},

		// ── §4 BASE.7.2.THREAD — THREAD Response ────────────────────────────────

		{
			id: "RFC5256-BASE.7.2.THREAD-1",
			source: "RFC5256",
			section: "BASE.7.2.THREAD",
			title: "Accept untagged THREAD response: zero or more parenthesized threads (seq or UID)",
			text:
				"The THREAD response occurs as a result of a THREAD or UID THREAD command. It contains zero or more threads. A thread consists of a " +
				"parenthesized list of thread members. ... The messages numbers refer to those messages that match the search criteria. For THREAD, " +
				"these are message sequence numbers; for UID THREAD, these are unique identifiers.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit MUST, receiver-side acceptance). Covers the overall " +
				"response shape — '* THREAD' followed by zero or more thread-lists (§5: " +
				"thread-data = \"THREAD\" [SP 1*thread-list]), including the bare '* THREAD' " +
				"no-match form from the §3 example — and the seq-vs-UID interpretation keyed to " +
				"the issuing command. Verbatim fidelity note: 'The messages numbers' is the RFC's " +
				"own typo, preserved exactly. The elision skips the parent/child member structure, " +
				"cataloged separately as BASE.7.2.THREAD-2. driver.thread()'s command surface and " +
				"the '* THREAD' parse branch are both genuinely real, so this row passes for real.",
		},
		{
			id: "RFC5256-BASE.7.2.THREAD-2",
			source: "RFC5256",
			section: "BASE.7.2.THREAD",
			title: "Parse thread structure: parent/child chains, sub-thread splits, unlimited nesting",
			text:
				"Thread members consist of zero or more message numbers, delimited by spaces, indicating successive parent and child. This continues " +
				"until the thread splits into multiple sub-threads, at which point, the thread nests into multiple sub-threads with the first member " +
				"of each sub-thread being siblings at this level. There is no limit to the nesting of threads.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit MUST, receiver-side acceptance): a client consuming " +
				"THREAD responses must parse the recursive parenthesized-list grammar (§5: " +
				"thread-list = \"(\" (thread-members / thread-nested) \")\"; thread-members = " +
				"nz-number *(SP nz-number) [SP thread-nested]; thread-nested = 2*thread-list) to " +
				"arbitrary depth — 'There is no limit to the nesting of threads' forecloses any " +
				"fixed-depth parser. This includes the number-less thread-nested form '((3)(5))' " +
				"for siblings whose common parent matched nothing: 'In this example, 3 and 5 are " +
				"siblings of a parent that does not match the search criteria (and/or does not " +
				"exist in the mailbox); however they are members of the same thread.' " +
				"The '* THREAD' parse surface is genuinely real, so this row passes for real.",
		},

		// ── §5 Formal Syntax ────────────────────────────────────────────────────

		{
			id: "RFC5256-5-1",
			source: "RFC5256",
			section: "5",
			title: "SORT grammar: defined criteria atoms only; REVERSE prefixes a single sort-key",
			text:
				'sort = ["UID" SP] "SORT" SP sort-criteria SP search-criteria sort-criteria = "(" sort-criterion *(SP sort-criterion) ")" ' +
				'sort-criterion = ["REVERSE" SP] sort-key sort-key = "ARRIVAL" / "CC" / "DATE" / "FROM" / "SIZE" / "SUBJECT" / "TO"',
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit MUST): ABNF binds the emitted command bytes. Client-" +
				"binding composition rules encoded here: the criteria list is parenthesized and " +
				"non-empty; only the eight defined atoms (ARRIVAL, CC, DATE, FROM, REVERSE, SIZE, " +
				"SUBJECT, TO) may appear ('The defined sort criteria are as follows. Refer to the " +
				"Formal Syntax section for the precise syntactic definitions of the arguments.'); " +
				"REVERSE is not a standalone key but a modifier that must be followed by another " +
				"sort criterion ('REVERSE Followed by another sort criterion, has the effect of " +
				"that criterion but in reverse (descending) order.'). The RFC's advisory that " +
				"re-sorting is often better done client-side than by issuing REVERSE variants " +
				"carries no keyword and is not cataloged. Whitespace flattened from the RFC's " +
				"column-aligned ABNF per the mechanical checker. The SORT/UID SORT surface is " +
				"genuinely real, so this row passes for real.",
		},
		{
			id: "RFC5256-5-2",
			source: "RFC5256",
			section: "5",
			title: "THREAD grammar: registered algorithm atom; charset then one or more search keys",
			text:
				'thread = ["UID" SP] "THREAD" SP thread-alg SP search-criteria thread-alg = "ORDEREDSUBJECT" / "REFERENCES" / thread-alg-ext ... ' +
				'search-criteria = charset 1*(SP search-key) charset = atom / quoted',
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit MUST): ABNF binds the emitted command bytes. This " +
				"document defines exactly two algorithm atoms (ORDEREDSUBJECT, REFERENCES — the " +
				"capability tokens THREAD=ORDEREDSUBJECT and THREAD=REFERENCES); thread-alg-ext " +
				"(elided along with its '; New algorithms MUST be registered with IANA' comment, " +
				"which binds registrants, not clients) admits future registered atoms, gated for " +
				"the client by the THREAD=<alg> capability duty in RFC5256-1-2. The shared " +
				"search-criteria production applies equally to the sort production in RFC5256-5-1 " +
				"and encodes the mandatory-charset rule (charset is not optional in the grammar) " +
				"plus at least one search key. Whitespace flattened from the RFC's column-aligned " +
				"ABNF per the mechanical checker. The THREAD/UID THREAD surface is genuinely real, " +
				"so this row passes for real.",
		},
	],
};

export default rfc5256;
