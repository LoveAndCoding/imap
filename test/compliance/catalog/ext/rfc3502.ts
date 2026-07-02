import type { CatalogModule } from "../types";

const rfc3502: CatalogModule = {
	source: "RFC3502",
	extractionNote:
		"Full document reviewed (Status of this Memo, Copyright Notice, Abstract, Terminology, " +
		"Introduction, §6.3.11 APPEND Command, 'Modification to IMAP4rev1 Base Protocol Formal " +
		"Syntax' [ABNF], 'MULTIAPPEND Interaction with UIDPLUS Extension', Security Considerations, " +
		"Normative/Informative References, Author's Address, Full Copyright Statement, " +
		"Acknowledgement). RFC 3502 is a small, focused extension: it redefines RFC 3501's §6.3.11 " +
		"APPEND command so that a single APPEND may carry MORE THAN ONE message-literal group " +
		"(each an OPTIONAL flag list + OPTIONAL date-time + message literal), makes the whole " +
		"multi-message operation atomic (all-or-nothing), and — when UIDPLUS is also present — " +
		"widens the APPENDUID response code to return a set of UIDs. " +
		"CLIENT/SERVER SPLIT: §6.3.11 is written mostly from the SERVER's point of view (the " +
		"server's obligations when processing an APPEND). The client-binding surface this catalog " +
		"captures is: (a) the multi-message command SYNTAX the client emits (the '1*append-message' " +
		"ABNF is the defining new capability — RFC3502-6.3.11-1); (b) the per-message RFC-2822 " +
		"format SHOULD that constrains what the client uploads (RFC3502-6.3.11-2, inherited base-" +
		"APPEND text restated verbatim in this document); (c) the atomicity guarantee the client is " +
		"entitled to RELY ON and must handle correctly — a failed MULTIAPPEND leaves the mailbox " +
		"exactly as before, so the client must treat the batch as all-or-nothing rather than " +
		"assuming a partial upload (RFC3502-intro-1 for the extension's headline atomicity promise, " +
		"RFC3502-6.3.11-3 for the normative restore MUST the client relies on, and RFC3502-6.3.11-4 " +
		"for the server's licence to abort early which the client's error-handling must accommodate); " +
		"(d) the optional NOOP/CHECK-after-APPEND client action when the server does not send an " +
		"unsolicited EXISTS (RFC3502-6.3.11-5); and (e) client acceptance of a SET-valued APPENDUID " +
		"response code (as many UIDs as messages appended, in append order) when both MULTIAPPEND " +
		"and UIDPLUS are in use (RFC3502-uidplus-1). " +
		"EXCLUDED as SERVER-ONLY: the 8-bit-preservation / MIME reversible-conversion MUST ('A " +
		"server implementation that is unable to preserve 8-bit data properly MUST be able to " +
		"reversibly convert...' binds the server's storage layer); the flag-list SHOULD and date-" +
		"time SHOULD ('the flags SHOULD be set in the resulting message', 'the internal date SHOULD " +
		"be set in the resulting message' — both describe the resulting server-side message state, " +
		"not a client emission); the zero-length-literal 'MUST return a NO' (server response " +
		"generation); the TRYCREATE trio ('a server MUST return an error', 'MUST NOT automatically " +
		"create the mailbox', 'the server MUST send the response code \"[TRYCREATE]\"' — all server " +
		"response duties; the sentence's own 'This gives a hint to the client that it can attempt a " +
		"CREATE command and retry' is a descriptive rationale with no RFC 2119 client keyword and no " +
		"MULTIAPPEND-specific content, so it is not carried as a distinct duty); the selected-mailbox " +
		"EXISTS-notification SHOULD ('the server SHOULD notify the client immediately via an untagged " +
		"EXISTS response' binds the server — only the client's fallback NOOP/CHECK MAY in the same " +
		"paragraph is client-binding and is captured as RFC3502-6.3.11-5); and the UIDPLUS-interaction " +
		"ordering/exclusion prose ('The UIDs returned should be in the order the articles where " +
		"appended', 'The message set may not contain extraneous UIDs or the symbol \"*\"') which are " +
		"lowercase-'should'/'may not' SERVER response-construction duties — carried only in the " +
		"supporting text of the client-acceptance entry RFC3502-uidplus-1, not as separate client " +
		"duties. EXCLUDED as non-normative/advisory: the Introduction's pipelined-batch discussion " +
		"(items 1-3 on why a LITERAL+ pipelined batch is inferior to MULTIAPPEND) is descriptive " +
		"rationale with no RFC 2119 keyword binding the client; the RFC-2822 header-omission Note " +
		"('There MAY be exceptions, e.g., draft messages...The full implications of doing so MUST be " +
		"understood and carefully weighed') is a design-caution addressed to the human implementer, " +
		"not a wire-observable client duty. Security Considerations raise nothing beyond base IMAP. " +
		"REV2-CORE CROSS-REFERENCE: MULTIAPPEND is NOT folded into IMAP4rev2. RFC 9051's core APPEND " +
		"(its own §6.3.11) is single-message ('append = \"APPEND\" SP mailbox [SP flag-list] [SP " +
		"date-time] SP literal' — no '1*' repetition), and MULTIAPPEND remains a standalone, " +
		"separately-advertised capability in a rev2 world. No entry here duplicates a rev2-core duty, " +
		"so ALL entries keep the default profiles [\"rev1\",\"rev2\"] (a rev2 client that uses the " +
		"MULTIAPPEND extension is bound by this document, not by rev2 core). " +
		"Total: 7 client-binding entries (RFC3502-intro-1; RFC3502-6.3.11-1..5; RFC3502-uidplus-1). " +
		"Untestable: 1 (RFC3502-6.3.11-2, theme content-processing — whether the uploaded octets " +
		"'are in the format of an RFC-2822 message' is a content-shape judgment not decidable from " +
		"the APPEND wire framing). All 7 are conditional (bind only when the client uses the " +
		"MULTIAPPEND extension); RFC3502-uidplus-1 is additionally conditional on UIDPLUS.",
	requirements: [
		// ── Introduction: the atomicity promise ──────────────────────────────────

		{
			id: "RFC3502-intro-1",
			source: "RFC3502",
			section: "intro",
			title: "MULTIAPPEND is atomic (all-or-nothing) — client must handle it as such",
			text:
				"A MULTIAPPEND APPEND operation is atomic; either all messages are successfully " +
				"appended, or no messages are appended.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit client-handling MUST): the Introduction states the " +
				"extension's headline guarantee as a declarative fact ('is atomic'), not with an " +
				"explicit RFC 2119 client keyword, but it defines the contract the client is entitled " +
				"to rely on and must therefore handle correctly — on a failed MULTIAPPEND the client " +
				"MUST treat the entire batch as not appended (no messages), never as a partial upload. " +
				"The normative enforcement of this promise is the server-side restore MUST quoted in " +
				"RFC3502-6.3.11-3; this entry captures the client-facing expectation the promise " +
				"creates. Conditional on the client using MULTIAPPEND. Standalone in rev2 (MULTIAPPEND " +
				"is not folded into IMAP4rev2 core, whose APPEND is single-message and thus has no " +
				"multi-message atomicity duty to double-score against), so profiles [\"rev1\",\"rev2\"]. " +
				"Testable via a scripted failing MULTIAPPEND (server returns tagged NO): a compliant " +
				"client must surface the whole batch as failed rather than reporting some messages as " +
				"stored.",
		},

		// ── §6.3.11 APPEND Command ────────────────────────────────────────────────

		{
			id: "RFC3502-6.3.11-1",
			source: "RFC3502",
			section: "6.3.11",
			title: "Client MAY send multiple message-literal groups in one APPEND",
			text:
				"one or more messages to upload, specified as: OPTIONAL flag parenthesized list " +
				"OPTIONAL date/time string message literal " +
				'... append = "APPEND" SP mailbox 1*append-message ' +
				"append-message = [SP flag-list] [SP date-time] SP literal",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level, MAY: RFC 3502's whole purpose is to permit — not require — a client " +
				"to batch multiple messages into a single APPEND. The Arguments block ('one or more " +
				"messages to upload') and the modified ABNF ('1*append-message', where each " +
				"append-message is an optional flag-list + optional date-time + literal) together " +
				"define the new client-emittable command shape; the '1*' repetition is the sole " +
				"syntactic difference from base RFC 3501 APPEND. Text stitches the Arguments block " +
				"(with its two indented OPTIONAL items and the 'message literal' line) to the two " +
				"formal-syntax productions with a '...' elision spanning the intervening APPEND " +
				"prose and section boundary; each fragment is verified verbatim (whitespace-flattened) " +
				"against the RFC. Conditional on the client choosing to use MULTIAPPEND. Standalone " +
				"in rev2 — IMAP4rev2 core APPEND is single-message (no '1*append-message'), so this " +
				"multi-message form is bound only by this document; profiles [\"rev1\",\"rev2\"]. " +
				"Testable: a matcher must accept a genuine multi-group APPEND (>=2 append-message " +
				"groups, correct optional flag-list/date-time framing and back-to-back literals) and " +
				"reject a client that can only emit the single-message base form.",
		},
		{
			id: "RFC3502-6.3.11-2",
			source: "RFC3502",
			section: "6.3.11",
			title: "Each appended message SHOULD be in RFC-2822 format",
			text: "This argument SHOULD be in the format of an [RFC-2822] message.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "content-processing",
			untestableRationale:
				"Whether the octets the client uploads for a given message-literal argument 'are in " +
				"the format of an RFC-2822 message' is a judgment about the content/shape of the " +
				"message body, not about the APPEND command's wire framing. A client that uploads a " +
				"well-formed RFC-2822 message and one that uploads arbitrary octets of the same " +
				"declared length produce byte-for-byte-identical APPEND framing on the wire (same " +
				"literal count, same flags, same date-time); the SHOULD can only be assessed by " +
				"parsing and semantically validating the uploaded body against RFC 2822, which the " +
				"compliance harness deliberately does not do (the client supplies message bodies " +
				"opaquely). No black-box test of the APPEND exchange can distinguish a compliant " +
				"RFC-2822 upload from a non-conforming one.",
			notes:
				"Inherited base-APPEND text restated verbatim in RFC 3502 (identical sentence appears " +
				"in RFC 3501 §6.3.11); carried here because RFC 3502 re-publishes the full APPEND " +
				"command definition and this SHOULD constrains each of the potentially-many messages a " +
				"MULTIAPPEND client uploads. Conditional on using MULTIAPPEND. Standalone in rev2 " +
				"(MULTIAPPEND not in rev2 core), profiles [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC3502-6.3.11-3",
			source: "RFC3502",
			section: "6.3.11",
			title: "On failure the mailbox is restored (no partial append) — client-relied guarantee",
			text:
				"If the append is unsuccessful for any reason (including being cancelled), the mailbox " +
				"MUST be restored to its state before the APPEND attempt; no partial appending is " +
				"permitted.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"The quoted MUST is grammatically SERVER-directed (the server restores the mailbox), " +
				"but it is the normative backbone of the client-facing atomicity contract (see " +
				"RFC3502-intro-1): it guarantees the client that a failed MULTIAPPEND appended NOTHING, " +
				"which the client's batch-upload error handling MUST assume. Carried as the client-" +
				"binding expectation this rule creates rather than as a server obligation the suite " +
				"cannot drive; the server/client split is called out explicitly here and in the " +
				"extractionNote. Distinct from base RFC 3501 APPEND only in that here 'the APPEND " +
				"attempt' may span multiple messages, giving the restore its all-or-nothing bite. " +
				"Conditional on using MULTIAPPEND; standalone in rev2, profiles [\"rev1\",\"rev2\"]. " +
				"Testable via a scripted MULTIAPPEND that the server fails after accepting some " +
				"literals: the client must not report any message of the batch as successfully stored.",
		},
		{
			id: "RFC3502-6.3.11-4",
			source: "RFC3502",
			section: "6.3.11",
			title: "Server MAY abort before processing all messages — client must handle early failure",
			text: "The server MAY return an error before processing all the message arguments.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Grammatically a SERVER permission, carried for its client-binding consequence: a " +
				"MULTIAPPEND client MUST be prepared for the batch to fail partway (a tagged NO arriving " +
				"before every message literal has been consumed) and, combined with RFC3502-6.3.11-3, " +
				"must treat that as the whole batch having appended nothing — it must not assume the " +
				"server processes all message arguments before responding. New in MULTIAPPEND (base " +
				"single-message APPEND has no 'all the message arguments' to short-circuit). Conditional " +
				"on using MULTIAPPEND; standalone in rev2, profiles [\"rev1\",\"rev2\"]. Testable: a " +
				"scripted early tagged-NO (before the last literal) must be surfaced by the client as a " +
				"failed append of the entire batch.",
		},
		{
			id: "RFC3502-6.3.11-5",
			source: "RFC3502",
			section: "6.3.11",
			title: "Client MAY issue NOOP/CHECK after APPEND if no unsolicited EXISTS arrives",
			text:
				"If the server does not do so, the client MAY issue a NOOP command (or failing that, a " +
				"CHECK command) after one or more APPEND commands.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Client-binding MAY: when appending to the currently-selected mailbox and the server " +
				"does not immediately send an untagged EXISTS (the preceding server SHOULD, excluded " +
				"as server-only), the client is permitted to poll for the new-message state with NOOP " +
				"or, failing that, CHECK. Inherited base-APPEND text; the phrase 'after one or more " +
				"APPEND commands' fits the multi-message MULTIAPPEND case naturally. Conditional on " +
				"using MULTIAPPEND against a selected mailbox; standalone in rev2, profiles " +
				"[\"rev1\",\"rev2\"]. Testable as a permitted-but-optional client action (a client that " +
				"issues NOOP/CHECK after the APPEND completes exercises this MAY; one that does not is " +
				"equally compliant — the test asserts the wire form is well-formed when the client " +
				"does choose to poll).",
		},

		// ── MULTIAPPEND Interaction with UIDPLUS Extension ────────────────────────

		{
			id: "RFC3502-uidplus-1",
			source: "RFC3502",
			section: "uidplus",
			title: "Client must accept a set-valued APPENDUID response for a MULTIAPPEND batch",
			text:
				'resp-code-apnd = "APPENDUID" SP nz-number SP set ... That is, the APPENDUID response ' +
				"code returns as many UIDs as there were messages appended in the multiple append.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit client-handling MUST): when a server supports both " +
				"MULTIAPPEND and UIDPLUS, the APPENDUID response code's final field is widened from a " +
				"single UID to a 'set' ('resp-code-apnd = \"APPENDUID\" SP nz-number SP set'), carrying " +
				"as many UIDs as messages were appended. A client that consumes APPENDUID after a " +
				"MULTIAPPEND MUST accept and correctly parse this SET form (e.g. '2:4' or '2,4,6'), not " +
				"only the single-UID base form — otherwise it would mis-handle the very response its " +
				"batch upload elicits. The grammatically SERVER-directed ordering/exclusion sentences " +
				"in the same section ('The UIDs returned should be in the order the articles where " +
				"appended.' and 'The message set may not contain extraneous UIDs or the symbol \"*\".') " +
				"bind the server's response construction and are NOT carried as separate client duties; " +
				"they are noted here as the shape of the response the client must accept. Text stitches " +
				"the modified ABNF production to the explanatory sentence with a '...' elision; both " +
				"fragments verified verbatim (whitespace-flattened). DOUBLY conditional — binds only a " +
				"client that uses MULTIAPPEND AND is talking to a UIDPLUS server (and itself consumes " +
				"APPENDUID). Standalone in rev2 (neither MULTIAPPEND nor this widened resp-code-apnd is " +
				"rev2 core), profiles [\"rev1\",\"rev2\"]. Testable: a scripted tagged OK carrying " +
				"'[APPENDUID <uidvalidity> <set>]' after a multi-message APPEND — the client must treat " +
				"it as success and expose the full set of assigned UIDs, not just the first.",
		},
	],
};

export default rfc3502;
