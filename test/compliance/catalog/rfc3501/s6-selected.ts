import type { SpecRequirement } from "../types";

export const note =
	"Re-extracted 2026-06-11 against the verbatim text of RFC 3501 (rfc-editor.org/rfc/rfc3501.txt) after an audit found the prior extraction fabricated. " +
	"§6.4.1 CHECK: 1 entry (NOOP, not CHECK, SHOULD be used for new message polling). " +
	"§6.4.2 CLOSE: 1 entry (SELECT/EXAMINE/LOGOUT MAY be issued without a prior CLOSE). " +
	"§6.4.3 EXPUNGE: no client-binding statements; the section's only normative content (untagged EXPUNGE sent before tagged OK) binds the server. " +
	"§6.4.4 SEARCH: 2 entries (CHARSET specification syntax/placement; server MUST answer unsupported CHARSET with tagged NO, not BAD — derived client duty to treat NO as charset-unsupported). " +
	"§6.4.5 FETCH: 3 entries (BODY[<section>] implicitly sets \\Seen with BODY.PEEK as the non-setting alternative; macros must be used by themselves; MIME part specifier MUST be prefixed by numeric part specifiers). " +
	"§6.4.6 STORE: 1 entry (server SHOULD send untagged FETCH for externally observed flag changes regardless of .SILENT — derived client duty to accept it). " +
	"§6.4.7 COPY: no client-binding entries. Server duties for reference: if the destination mailbox does not exist the server SHOULD return an error and SHOULD NOT automatically create the mailbox (not MUST NOT); unless certain the mailbox can not be created it MUST send the [TRYCREATE] response code in the tagged NO; on any failure it MUST restore the destination mailbox to its state before the COPY attempt. " +
	"§6.4.8 UID: 2 entries (number after '*' in untagged FETCH is always a message sequence number even for UID commands; server MUST implicitly include the UID data item in FETCH responses caused by a UID command — derived client duty to parse it). " +
	"§6.5: framing prose only, no normative statements. " +
	"§6.5.1 X<atom>: 1 entry (non-standard commands MUST use the X prefix).";

export const requirements: SpecRequirement[] = [

	// RETIRED IDS (fabricated quotes removed 2026-06-11, never reuse):
	// RFC3501-6.4.3-1, RFC3501-6.4.5-3, RFC3501-6.4.5-4, RFC3501-6.4.5-5,
	// RFC3501-6.4.8-1, RFC3501-6.4.8-2, RFC3501-6.4.8-3, RFC3501-6.4.8-4

	// §6.4.1 CHECK ──────────────────────────────────────────────────────────────

	{
		id: "RFC3501-6.4.1-1",
		source: "RFC3501",
		section: "6.4.1",
		title: "Client SHOULD use NOOP, not CHECK, for new message polling",
		text:
			"There is no guarantee that an EXISTS untagged response will happen as a result of " +
			"CHECK. NOOP, not CHECK, SHOULD be used for new message polling.",
		level: "SHOULD",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"The SHOULD binds the client's choice of polling command: a client that polls for new " +
			"messages SHOULD issue NOOP rather than CHECK, because CHECK carries no guarantee of an " +
			"EXISTS untagged response. Applicability is 'conditional' because it fires only when the " +
			"client polls for new messages. Testable: observe which command the client issues when " +
			"polling. (This text replaces a previously fabricated quote under the same id; the old " +
			"text was never cited by tests.)",
	},

	// §6.4.2 CLOSE ─────────────────────────────────────────────────────────────

	{
		id: "RFC3501-6.4.2-1",
		source: "RFC3501",
		section: "6.4.2",
		title: "Client MAY issue SELECT, EXAMINE, or LOGOUT without a prior CLOSE",
		text:
			"Even if a mailbox is selected, a SELECT, EXAMINE, or LOGOUT command MAY be issued " +
			"without previously issuing a CLOSE command.",
		level: "MAY",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"Grants the client explicit permission to switch mailboxes or log out while a mailbox is " +
			"selected; SELECT/EXAMINE/LOGOUT implicitly close the selected mailbox without expunging. " +
			"Applicability is 'conditional' because it applies only when a mailbox is selected and the " +
			"client chooses to skip CLOSE. Testable: a client that issues SELECT while another mailbox " +
			"is selected, without CLOSE, is conforming.",
	},

	// §6.4.3 EXPUNGE ────────────────────────────────────────────────────────────
	// No client-binding normative statements. The section's only normative content
	// ("Before returning an OK to the client, an untagged EXPUNGE response is sent
	// for each message that is removed") binds the server. The previous entry
	// RFC3501-6.4.3-1 quoted text that does not exist in RFC 3501 and is retired.

	// §6.4.4 SEARCH ─────────────────────────────────────────────────────────────

	{
		id: "RFC3501-6.4.4-1",
		source: "RFC3501",
		section: "6.4.4",
		title: "CHARSET specification is the word CHARSET followed by a registered charset",
		text:
			"The OPTIONAL [CHARSET] specification consists of the word \"CHARSET\" followed by a " +
			"registered [CHARSET]. It indicates the [CHARSET] of the strings that appear in the " +
			"search criteria.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"Judgment call: no 2119 keyword binds the client in this sentence; it is a definitional " +
			"syntax rule, treated as MUST for argument-syntax compliance. The §6.4.4 Arguments list " +
			"('OPTIONAL [CHARSET] specification' before 'searching criteria') and the §9 formal syntax " +
			"(search = \"SEARCH\" [SP \"CHARSET\" SP astring] 1*(SP search-key)) place the CHARSET " +
			"specification immediately after SEARCH, before any search key — that ordering duty is the " +
			"derived client obligation. Applicability is 'conditional' because it applies only when the " +
			"client includes a CHARSET argument.",
	},
	{
		id: "RFC3501-6.4.4-2",
		source: "RFC3501",
		section: "6.4.4",
		title: "Client must treat tagged NO (not BAD) as the unsupported-CHARSET outcome",
		text:
			"If the server does not support the specified [CHARSET], it MUST return a tagged NO " +
			"response (not a BAD).",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"The quoted MUST binds the server. The derived client duty is to treat a tagged NO to a " +
			"CHARSET SEARCH as 'charset unsupported' (a clean, recoverable failure — e.g., retry " +
			"without CHARSET or with US-ASCII) rather than as a protocol error, and not to expect BAD " +
			"for this case. Applicability is 'conditional' — only when the client uses a CHARSET " +
			"argument. Testable: drive a NO response to a CHARSET SEARCH and verify the client handles " +
			"it as an unsupported-charset result, not a parser/protocol failure.",
	},

	// §6.4.5 FETCH ──────────────────────────────────────────────────────────────

	{
		id: "RFC3501-6.4.5-1",
		source: "RFC3501",
		section: "6.4.5",
		title: "BODY[<section>] implicitly sets \\Seen; BODY.PEEK is the non-setting alternative",
		text:
			"The \\Seen flag is implicitly set; if this causes the flags to change, they SHOULD be " +
			"included as part of the FETCH responses. ... An alternate form of BODY[<section>] that " +
			"does not implicitly set the \\Seen flag.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"The ellipsis elides the intervening data-item heading 'BODY.PEEK[<section>]<<partial>>' " +
			"between the two sentences; the second sentence is the definition of BODY.PEEK. Judgment " +
			"call on level: the quoted SHOULD binds the server's flag reporting, not the client. The " +
			"client-binding half is definitional — BODY[<section>] implicitly sets \\Seen, and " +
			"BODY.PEEK[<section>] is the only defined form that does not, so a client that needs to " +
			"fetch body content without setting \\Seen MUST use BODY.PEEK; a client using BODY[...] " +
			"must expect the \\Seen side-effect (and possibly updated FLAGS in the FETCH response). " +
			"Treated as MUST as an architectural invariant. Applicability is 'conditional' — fires " +
			"when the client fetches body sections. Testable: verify the client uses BODY.PEEK when " +
			"it intends not to mark messages seen, and tolerates FLAGS data in BODY fetch responses.",
	},
	{
		id: "RFC3501-6.4.5-2",
		source: "RFC3501",
		section: "6.4.5",
		title: "FETCH macros (ALL/FAST/FULL) must be used by themselves",
		text:
			"A macro must be used by itself, and not in conjunction with other macros or data items.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"Judgment call: lowercase 'must' (RFC 3501 predates RFC 8174 case-sensitivity), treated " +
			"as a binding MUST — the §9 formal syntax also permits only 'macro' or a fetch-att list " +
			"as the FETCH second argument, never a mixture. This single entry replaces the previous " +
			"three per-macro entries (RFC3501-6.4.5-3 and RFC3501-6.4.5-4 are retired); it covers " +
			"ALL, FAST, and FULL alike. Applicability is 'conditional' — only when the client uses a " +
			"macro. Testable: verify the client never emits a macro inside or alongside a " +
			"parenthesized item list.",
	},
	{
		id: "RFC3501-6.4.5-6",
		source: "RFC3501",
		section: "6.4.5",
		title: "MIME part specifier MUST be prefixed by numeric part specifiers",
		text:
			"The MIME part specifier MUST be prefixed by one or more numeric part specifiers.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"Binds the client's construction of BODY[<section>] section specifications: MIME may not " +
			"be the sole part specifier (unlike HEADER, HEADER.FIELDS, HEADER.FIELDS.NOT, and TEXT, " +
			"which can stand alone). Applicability is 'conditional' — only when the client fetches a " +
			"MIME section. Testable: verify any emitted BODY[...MIME] section is prefixed by a " +
			"numeric part specifier (e.g., BODY[4.1.MIME], never BODY[MIME]). Id ordinal 6 because " +
			"ordinals 3-5 are retired and never reused.",
	},

	// §6.4.6 STORE ──────────────────────────────────────────────────────────────

	{
		id: "RFC3501-6.4.6-1",
		source: "RFC3501",
		section: "6.4.6",
		title: "Untagged FETCH may arrive for external flag changes even with .SILENT",
		text:
			"Regardless of whether or not the \".SILENT\" suffix was used, the server SHOULD send an " +
			"untagged FETCH response if a change to a message's flags from an external source is " +
			"observed.",
		level: "SHOULD",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"The quoted SHOULD binds the server (this is the Note in §6.4.6; the leading 'Note:' " +
			"label is omitted, the sentence is otherwise verbatim). The derived client duty: a client " +
			"using .SILENT STORE variants must still be prepared to receive and process unsolicited " +
			"untagged FETCH responses for externally observed flag changes — .SILENT suppresses only " +
			"the echo of the client's own change. Applicability is 'conditional' — relevant when the " +
			"client uses .SILENT. Testable: deliver an unsolicited FETCH after a .SILENT STORE and " +
			"verify the client accepts it without error.",
	},

	// §6.4.7 COPY ───────────────────────────────────────────────────────────────
	// No client-binding normative statements. Server duties (verified verbatim
	// against RFC 3501): "If the destination mailbox does not exist, a server
	// SHOULD return an error.  It SHOULD NOT automatically create the mailbox."
	// — note SHOULD NOT, not MUST NOT; "the server MUST send the response code
	// "[TRYCREATE]" as the prefix of the text of the tagged NO response" unless
	// it is certain the destination can not be created; and "If the COPY command
	// is unsuccessful for any reason, server implementations MUST restore the
	// destination mailbox to its state before the COPY attempt." The [TRYCREATE]
	// hint is advisory for the client ("it can attempt a CREATE command and
	// retry the COPY") but carries no client-binding 2119 keyword.

	// §6.4.8 UID ────────────────────────────────────────────────────────────────
	// RFC3501-6.4.8-1 through RFC3501-6.4.8-4 are retired (fabricated quotes;
	// no such sentences exist in §6.4.8). New entries start at ordinal 5.

	{
		id: "RFC3501-6.4.8-5",
		source: "RFC3501",
		section: "6.4.8",
		title: "Number after '*' in untagged FETCH is a sequence number, even for UID commands",
		text:
			"The number after the \"*\" in an untagged FETCH response is always a message sequence " +
			"number, not a unique identifier, even for a UID command response.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"Judgment call: no 2119 keyword; this is a declarative interpretation rule, treated as " +
			"MUST because a client that interprets the leading number of an untagged FETCH as a UID " +
			"will corrupt its message-state mapping. The UID itself is delivered via the UID data " +
			"item inside the response (see RFC3501-6.4.8-6). Applicability is 'conditional' — most " +
			"relevant when the client issues UID commands. Testable: respond to UID FETCH with " +
			"'* 23 FETCH (... UID 4827313)' and verify the client maps the data to sequence number " +
			"23 / UID 4827313, not to UID 23.",
	},
	{
		id: "RFC3501-6.4.8-6",
		source: "RFC3501",
		section: "6.4.8",
		title: "FETCH responses caused by UID commands implicitly include the UID data item",
		text:
			"server implementations MUST implicitly include the UID message data item as part of any " +
			"FETCH response caused by a UID command, regardless of whether a UID was specified as a " +
			"message data item to the FETCH.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"Verbatim mid-sentence quote (the elided leading word is 'However,'). The MUST binds the " +
			"server; the derived client duty is to parse and accept a UID data item in FETCH " +
			"responses to UID FETCH/UID STORE even when the client did not request UID, rather than " +
			"rejecting it as unexpected data. Applicability is 'conditional' — fires when the client " +
			"uses UID commands. Testable: issue UID FETCH without UID in the item list and verify " +
			"the client accepts the implicit UID item in the response.",
	},

	// §6.5 Client Commands - Experimental/Expansion ─────────────────────────────
	// The §6.5 heading has no body text of its own (it proceeds directly to
	// §6.5.1); no normative statements.

	// §6.5.1 X<atom> ─────────────────────────────────────────────────────────────

	{
		id: "RFC3501-6.5.1-1",
		source: "RFC3501",
		section: "6.5.1",
		title: "Non-standard commands MUST use the X prefix",
		text:
			"Commands which are not part of this specification, a standard or standards-track " +
			"revision of this specification, or an IESG-approved experimental protocol, MUST use " +
			"the X prefix.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"Binds any party emitting non-standard commands — for a client library this means any " +
			"private/experimental command it sends MUST be X-prefixed. Applicability is " +
			"'conditional' — only when the client sends commands outside the specification (e.g., " +
			"vendor extensions not sanctioned by a standards-track document). Testable: verify the " +
			"client never emits a non-standard, non-extension command without the X prefix. (This " +
			"text replaces a previously fabricated quote under the same id.)",
	},
];
