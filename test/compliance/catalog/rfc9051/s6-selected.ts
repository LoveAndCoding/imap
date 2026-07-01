import type { SpecRequirement } from "../types";

export const note =
	"Extracted 2026-07-01 against the verbatim text of RFC 9051 (rfc-editor.org/rfc/rfc9051.txt); every quote machine-verified against the flattened RFC text. " +
	"§6.4 intro: state-table prose only, no client-binding statements. " +
	"§6.4.1 CLOSE: 1 entry (SELECT/EXAMINE/LOGOUT MAY be issued without a prior CLOSE; the added rev2 remark that CLOSE-LOGOUT/CLOSE-SELECT is faster than EXPUNGE sequences is advisory, not catalogued). " +
	"§6.4.2 UNSELECT (new in the rev2 base spec, absorbed from RFC 3691): 1 entry (UNSELECT acts as CLOSE without expunge — keyword-less architectural invariant, judgment call). " +
	"§6.4.3 EXPUNGE: no client-binding statements; the untagged-EXPUNGE-before-OK sentence binds the server. " +
	"§6.4.4 SEARCH: 7 entries (rev2-only clients MUST ignore legacy SEARCH responses; ESEARCH is still sent on no matches — derived duty to accept an item-less ESEARCH; client MUST NOT assume ALL result order; SAVE alone suppresses the ESEARCH response — derived; CHARSET specification syntax; clients SHOULD use UTF-8; unsupported CHARSET answered with tagged NO plus BADCHARSET — derived). Not catalogued as client duties: 'Any options not defined by extensions that the server supports MUST be rejected with a BAD response', 'This [COUNT] result option MUST always be included in the ESEARCH response', and the single-ESEARCH-response guarantee — all bind the server. " +
	"§6.4.4.1 SAVE result variable: no client-binding entries — every normative statement governs the server's maintenance of the search result variable (resets, non-changes, EXPUNGE adjustment, empty-sequence handling). " +
	"§6.4.4.2: 1 entry (client MAY pipeline SEARCH RETURN (SAVE) with '$'-using commands absent ambiguity). " +
	"§6.4.4.3: 1 entry (tagged NO with NOTSAVED and search-result reset — derived client duty). " +
	"§6.4.4.4: examples only ('explanatory comments in examples that start with // are not part of the protocol'); no normative statements. " +
	"§6.4.5 FETCH: 3 entries (macro used by itself — lowercase 'must', judgment call backed by the §9 formal syntax; BINARY data items requestable only for leaf body parts; BODY[<section>] implicitly sets \\Seen with BODY.PEEK as the non-setting alternative — BINARY/BINARY.PEEK behave alike). 'msg-att-static ... MUST NOT change' binds the server. " +
	"§6.4.5.1: 2 entries (nested parts MUST be indicated by dotted part numbers; HEADER/HEADER.FIELDS/HEADER.FIELDS.NOT/TEXT prefix constraint and MIME MUST be prefixed by numeric part specifiers). " +
	"§6.4.6 STORE: 1 entry (untagged FETCH may arrive despite .SILENT for externally observed flag changes — derived duty to accept it). " +
	"§6.4.7 COPY: no client-binding entries. Server duties for reference (deltas from RFC 3501 noted): nonexistent destination MUST yield an error and the server MUST NOT automatically create the mailbox (strengthened from 3501's SHOULD / SHOULD NOT); [TRYCREATE] MUST prefix the tagged NO unless creation is impossible (the retry-after-CREATE hint remains advisory for the client); a failed COPY MUST restore the destination 'other than possibly incrementing UIDNEXT'; COPYUID is returned on success (client-side COPYUID handling is a §7.1 response-codes concern, left to the §7 extractor). " +
	"§6.4.8 MOVE (new in the rev2 base spec, absorbed from RFC 6851): 2 entries (COPYUID REQUIRED in an untagged OK before EXPUNGE responses — derived duty to parse it there; no message-sequence-number commands while MOVE is in progress — judgment call on a keyword-less safety invariant, formal handling requirements live in §5.5). Atomicity per message, no STORE response codes, and \\Deleted never set are server duties. " +
	"§6.4.9 UID: 3 entries (ESEARCH for UID SEARCH MUST include the UID indicator and its numbers are UIDs — derived; number after '*' in an untagged FETCH or EXPUNGE response is always a sequence number, now explicitly covering EXPUNGE; server MUST implicitly include the UID data item in FETCH responses caused by UID commands — derived). The UID command's first form now includes MOVE; UID EXPUNGE (new in the rev2 base spec, absorbed from RFC 4315) carries no client-binding 2119 keyword — its use for disconnected resynchronization is stated with 'can ensure' (advisory) and is not catalogued. " +
	"§6.5: 1 entry (non-spec commands MUST have at least one associated capability name — untestable, out-of-band). The prohibition on added untagged responses unless requested via the associated command or ENABLE binds the server.";

export const requirements: SpecRequirement[] = [

	// §6.4.1 CLOSE ──────────────────────────────────────────────────────────────

	{
		id: "RFC9051-6.4.1-1",
		source: "RFC9051",
		section: "6.4.1",
		title: "Client MAY issue SELECT, EXAMINE, or LOGOUT without a prior CLOSE",
		text:
			"Even if a mailbox is selected, a SELECT, EXAMINE, or LOGOUT command MAY be issued " +
			"without previously issuing a CLOSE command.",
		level: "MAY",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"Identical wording to RFC3501-6.4.2-1 (CLOSE moved from §6.4.2 to §6.4.1 in 9051). " +
			"SELECT, EXAMINE, and LOGOUT implicitly close the currently selected mailbox without " +
			"doing an expunge. Applicability is 'conditional' because it applies only when a mailbox " +
			"is selected and the client chooses to skip CLOSE. Testable: a client that issues SELECT " +
			"while another mailbox is selected, without CLOSE, is conforming.",
	},

	// §6.4.2 UNSELECT ───────────────────────────────────────────────────────────

	{
		id: "RFC9051-6.4.2-1",
		source: "RFC9051",
		section: "6.4.2",
		title: "UNSELECT deselects like CLOSE but without permanently removing messages",
		text:
			"The UNSELECT command frees a session's resources associated with the selected mailbox " +
			"and returns the server to the authenticated state. This command performs the same " +
			"actions as CLOSE, except that no messages are permanently removed from the currently " +
			"selected mailbox.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"UNSELECT is new in the rev2 base spec (absorbed from RFC 3691); §6.4.2 contains no " +
			"2119 keywords. Judgment call on level, following the RFC3501-6.4.5-1 BODY.PEEK " +
			"precedent for definitional alternatives treated as architectural invariants: UNSELECT " +
			"is the only command that leaves the selected state without either expunging (CLOSE) or " +
			"selecting/examining another mailbox, so a client that needs to deselect while " +
			"preserving \\Deleted messages MUST use UNSELECT rather than CLOSE. Applicability is " +
			"'conditional' — fires when the client deselects intending not to expunge. Testable: " +
			"drive the deselect-without-expunge path and assert UNSELECT (not CLOSE) is emitted and " +
			"the session is treated as back in the authenticated state.",
	},

	// §6.4.3 EXPUNGE ────────────────────────────────────────────────────────────
	// No client-binding normative statements. "Before returning an OK to the
	// client, an untagged EXPUNGE response is sent for each message that is
	// removed" binds the server (and is keyword-less in 9051).

	// §6.4.4 SEARCH ─────────────────────────────────────────────────────────────

	{
		id: "RFC9051-6.4.4-1",
		source: "RFC9051",
		section: "6.4.4",
		title: "rev2-only clients MUST ignore legacy untagged SEARCH responses",
		text:
			"Note that IMAP4rev1 used SEARCH responses [RFC3501] instead of ESEARCH responses. " +
			"Clients that support only IMAP4rev2 MUST ignore SEARCH responses.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"Direct client duty and a core rev2 delta: the untagged SEARCH response of IMAP4rev1 is " +
			"replaced by ESEARCH. 'Clients that support only IMAP4rev2' is interpreted for the rev2 " +
			"profile: in a rev2 session the client must neither treat a stray legacy '* SEARCH ...' " +
			"line as search results nor as a protocol error — it ignores it. Applicability 'always': " +
			"the duty is not gated on any client feature use. Testable: inject '* SEARCH 2 84 882' " +
			"ahead of the ESEARCH/tagged OK of a rev2 SEARCH and verify the legacy data is ignored.",
	},
	{
		id: "RFC9051-6.4.4-2",
		source: "RFC9051",
		section: "6.4.4",
		title: "ESEARCH is still sent on no matches, without the requested item",
		text:
			"If the SEARCH results in no matches, the server MUST NOT include the MIN result option " +
			"in the ESEARCH response; however, it still MUST send the ESEARCH response.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"Both quoted MUSTs bind the server; the same sentence is repeated for the MAX and ALL " +
			"result options (quoted here from the MIN item). The derived client duty is to treat an " +
			"ESEARCH response that carries no MIN/MAX/ALL return items — possibly no items at all, " +
			"e.g. '* ESEARCH (TAG \"A284\")' as in the §6.4.4 example — as a valid empty result, not " +
			"a malformed response. Applicability is 'conditional' — fires when the client issues " +
			"SEARCH. Testable: script a no-match SEARCH answered by a bare ESEARCH and verify the " +
			"client reports an empty result set without error.",
	},
	{
		id: "RFC9051-6.4.4-3",
		source: "RFC9051",
		section: "6.4.4",
		title: "Client MUST NOT assume ESEARCH ALL results are in any particular order",
		text:
			"Return all message numbers/UIDs that satisfy the SEARCH criteria using the sequence-set " +
			"syntax. Note that the client MUST NOT assume that messages/UIDs will be listed in any " +
			"particular order.",
		level: "MUST NOT",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"Definition of the ALL result option; the second sentence is a direct client MUST NOT. " +
			"Applicability is 'conditional' — fires when the client requests (or defaults to) the " +
			"ALL result option. Testable at the API boundary: deliver an ESEARCH ALL sequence-set in " +
			"non-ascending order (e.g. 'ALL 21,2,10:15') and assert the client's exposed result set " +
			"is the correct set of messages regardless of ordering.",
	},
	{
		id: "RFC9051-6.4.4-4",
		source: "RFC9051",
		section: "6.4.4",
		title: "SAVE as the only result option suppresses the ESEARCH response",
		text:
			"In absence of any other SEARCH result option, the SAVE result option also suppresses " +
			"any ESEARCH response that would have been otherwise returned by the SEARCH command.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"Judgment call: no 2119 keyword; this is definitional server behavior under BCP 14 " +
			"(lowercase words in 9051 are non-normative). The derived client duty is treated as " +
			"MUST because a client issuing SEARCH RETURN (SAVE) with no other result option that " +
			"waits for an ESEARCH response will hang or mis-handle the exchange — it must accept " +
			"completion with only the tagged OK. Applicability is 'conditional' — only when the " +
			"client uses RETURN (SAVE) alone. Testable: script SEARCH RETURN (SAVE) answered by a " +
			"tagged OK with no ESEARCH and verify the client completes cleanly.",
	},
	{
		id: "RFC9051-6.4.4-5",
		source: "RFC9051",
		section: "6.4.4",
		title: "CHARSET specification is the word CHARSET plus a registered charset name",
		text:
			"The OPTIONAL [CHARSET] specification consists of the word \"CHARSET\" followed by the " +
			"name of a character set from the registry [CHARSET-REG]. It indicates the [CHARSET] of " +
			"the strings that appear in the search criteria.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"Judgment call (mirrors RFC3501-6.4.4-1): no 2119 keyword binds the client in this " +
			"sentence; it is a definitional syntax rule, treated as MUST for argument-syntax " +
			"compliance. Wording delta from 3501: 'a registered [CHARSET]' became 'the name of a " +
			"character set from the registry [CHARSET-REG]'. The §6.4.4 Arguments list and the §9 " +
			"formal syntax (search = \"SEARCH\" [search-return-opts] [SP \"CHARSET\" SP charset] " +
			"1*(SP search-key)) place the CHARSET specification after any result specifier and " +
			"before all search keys — that ordering is the derived client obligation. Applicability " +
			"is 'conditional' — only when the client includes a CHARSET argument.",
	},
	{
		id: "RFC9051-6.4.4-6",
		source: "RFC9051",
		section: "6.4.4",
		title: "Clients SHOULD use UTF-8 in SEARCH; omitting CHARSET implies UTF-8",
		text:
			"Clients SHOULD use UTF-8. Note that if CHARSET is not provided, IMAP4rev2 servers MUST " +
			"assume UTF-8, so selecting CHARSET UTF-8 is redundant. It is permitted for improved " +
			"compatibility with existing IMAP4rev1 clients.",
		level: "SHOULD",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"'Clients SHOULD use UTF-8' is a direct client duty new in rev2 (the preceding sentence, " +
			"not quoted, obliges servers to support US-ASCII and UTF-8). The second quoted sentence " +
			"binds the server and grants the client permission to omit CHARSET entirely, since " +
			"UTF-8 is the rev2 default. Applicability is 'conditional' — fires when the client " +
			"issues SEARCH with string criteria. Testable: drive a search with non-ASCII criteria " +
			"through the API and verify the wire encoding is UTF-8 (with CHARSET UTF-8 or no " +
			"CHARSET at all, never a legacy charset).",
	},
	{
		id: "RFC9051-6.4.4-7",
		source: "RFC9051",
		section: "6.4.4",
		title: "Client must treat tagged NO (with BADCHARSET) as the unsupported-CHARSET outcome",
		text:
			"If the server does not support the specified [CHARSET], it MUST return a tagged NO " +
			"response (not a BAD). This response SHOULD contain the BADCHARSET response code, which " +
			"MAY list the CHARSETs supported by the server.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"The quoted keywords bind the server (cross-ref RFC3501-6.4.4-2; rev2 adds the " +
			"BADCHARSET response code sentence to §6.4.4). The derived client duty is to treat a " +
			"tagged NO — possibly carrying BADCHARSET with a supported-charset list — as 'charset " +
			"unsupported' (a recoverable failure, e.g. retry in UTF-8) rather than a protocol " +
			"error, and not to expect BAD for this case. Applicability is 'conditional' — only when " +
			"the client sends a CHARSET argument. Testable: answer a CHARSET SEARCH with " +
			"'NO [BADCHARSET (UTF-8)] ...' and verify the client surfaces an unsupported-charset " +
			"failure, not a parse/protocol error.",
	},

	// §6.4.4.1 SAVE Result Option and SEARCH Result Variable ────────────────────
	// No client-binding normative statements: the MUST NOT / MUST duties here
	// (which SEARCH commands may not change the search result variable, the
	// NO-with-SAVE reset, automatic adjustment on EXPUNGE, treating an empty
	// "$" as a valid but non-matching list) all govern the server's maintenance
	// of the search result variable.

	// §6.4.4.2 Multiple Commands in Progress ────────────────────────────────────

	{
		id: "RFC9051-6.4.4.2-1",
		source: "RFC9051",
		section: "6.4.4.2",
		title: "Client MAY pipeline SEARCH RETURN (SAVE) with '$'-using commands absent ambiguity",
		text:
			"A client MAY pipeline a SEARCH RETURN (SAVE) command with one or more commands using " +
			"the \"$\" marker, as long as this doesn't create an ambiguity, as described in " +
			"Section 5.5.",
		level: "MAY",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"Direct client permission with a constraining envelope: pipelining is allowed only when " +
			"it creates no ambiguity per §5.5 (which carries the formal client/server handling " +
			"requirements). The preceding paragraph obliges the server to execute the dependent " +
			"commands in received order. Applicability is 'conditional' — only when the client uses " +
			"the SAVE result option and the '$' marker. Testable: pipeline SEARCH RETURN (SAVE) " +
			"with a '$'-consuming FETCH and verify correct correlation of both completions.",
	},

	// §6.4.4.3 Refusing to Save Search Results ──────────────────────────────────

	{
		id: "RFC9051-6.4.4.3-1",
		source: "RFC9051",
		section: "6.4.4.3",
		title: "Refused SAVE arrives as tagged NO with NOTSAVED; '$' becomes empty",
		text:
			"In some cases, the server MAY refuse to save a SEARCH (SAVE) result, for example, if " +
			"an internal limit on the number of saved results is reached. In this case, the server " +
			"MUST return a tagged NO response containing the NOTSAVED response code and set the " +
			"search result variable to the empty sequence, as described in Section 6.4.4.1.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"The quoted MAY/MUST bind the server. The derived client duty is twofold: accept a " +
			"tagged NO carrying the NOTSAVED response code as the save-refused outcome of a SEARCH " +
			"RETURN (SAVE), and treat the '$' marker as the empty sequence afterwards (not the " +
			"previously saved result). Applicability is 'conditional' — only when the client uses " +
			"RETURN (SAVE). Testable: answer SEARCH RETURN (SAVE) with 'NO [NOTSAVED] ...' and " +
			"verify the client surfaces the failure cleanly and does not reuse a stale '$' value.",
	},

	// §6.4.4.4 Examples Showing Use of the SAVE Result Option ───────────────────
	// Examples only; the section states its // comments "are not part of the
	// protocol". No normative statements.

	// §6.4.5 FETCH ──────────────────────────────────────────────────────────────

	{
		id: "RFC9051-6.4.5-1",
		source: "RFC9051",
		section: "6.4.5",
		title: "FETCH macros (ALL/FAST/FULL) must be used by themselves",
		text:
			"There are three macros that specify commonly used sets of data items and can be used " +
			"instead of data items. A macro must be used by itself and not in conjunction with " +
			"other macros or data items.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"Judgment call: lowercase 'must' — RFC 9051 uses the BCP 14 [RFC2119] [RFC8174] " +
			"boilerplate (§1.1), so lowercase keywords carry no normative force; the binding force " +
			"comes from the §9 formal syntax, which allows only \"ALL\" / \"FULL\" / \"FAST\" or a " +
			"fetch-att (list) as the FETCH second argument, never a mixture. Cross-ref " +
			"RFC3501-6.4.5-2 (3501 reads 'by itself, and not'; 9051 drops the comma). Applicability " +
			"is 'conditional' — only when the client uses a macro. Testable: verify the client " +
			"never emits a macro inside or alongside a parenthesized item list.",
	},
	{
		id: "RFC9051-6.4.5-2",
		source: "RFC9051",
		section: "6.4.5",
		title: "BINARY data items can only be requested for leaf body parts",
		text:
			"Note that this data item can only be requested for leaf body parts: those that have " +
			"media types other than multipart/*, message/rfc822, or message/global.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"BINARY data items are new in the rev2 base spec (absorbed from RFC 3516). Judgment " +
			"call on level: no 2119 keyword, but §1.1 defines 'can' as 'a possible circumstance or " +
			"situation, as opposed to an optional facility' — requesting BINARY of a non-leaf part " +
			"is outside what the protocol admits, so the constraint is treated as MUST for " +
			"command-construction compliance. The sentence appears verbatim under both " +
			"BINARY[<section-binary>]<<partial>> (quoted here) and BINARY.SIZE[<section-binary>]; " +
			"it governs BINARY.PEEK equally, as BINARY.PEEK is defined as an alternate form of " +
			"BINARY. Applicability is 'conditional' — only when the client uses BINARY items. " +
			"Testable: verify any emitted BINARY/BINARY.PEEK/BINARY.SIZE item targets a leaf part " +
			"of the advertised BODYSTRUCTURE.",
	},
	{
		id: "RFC9051-6.4.5-3",
		source: "RFC9051",
		section: "6.4.5",
		title: "BODY[<section>] implicitly sets \\Seen; BODY.PEEK is the non-setting alternative",
		text:
			"The \\Seen flag is implicitly set; if this causes the flags to change, they SHOULD be " +
			"included as part of the FETCH responses. ... An alternate form of BODY[<section>] that " +
			"does not implicitly set the \\Seen flag.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"The ellipsis elides the intervening data-item heading 'BODY.PEEK[<section>]<<partial>>' " +
			"between the two sentences; the second sentence is the definition of BODY.PEEK. " +
			"Judgment call on level (cross-ref RFC3501-6.4.5-1, unchanged in substance): the quoted " +
			"SHOULD binds the server's flag reporting; the client-binding half is definitional — a " +
			"client that needs body content without setting \\Seen MUST use BODY.PEEK, and a client " +
			"using BODY[...] must expect the \\Seen side effect (and possibly FLAGS in the FETCH " +
			"response). The BINARY items carry the same dichotomy: BINARY.PEEK is 'An alternate " +
			"form of BINARY[<section-binary>] that does not implicitly set the \\Seen flag.' " +
			"Applicability is 'conditional' — fires when the client fetches body/binary sections. " +
			"Testable: verify the client uses the .PEEK form when it intends not to mark messages " +
			"seen and tolerates FLAGS data in BODY fetch responses.",
	},

	// §6.4.5.1 FETCH Section Specification ──────────────────────────────────────

	{
		id: "RFC9051-6.4.5.1-1",
		source: "RFC9051",
		section: "6.4.5.1",
		title: "Nested parts MUST be indicated by a period followed by the part number",
		text:
			"Multipart messages are assigned consecutive part numbers, as they occur in the " +
			"message. If a particular part is of type message or multipart, its parts MUST be " +
			"indicated by a period followed by the part number within that nested multipart part.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"Governs the dotted-path syntax of section specifications the client constructs (e.g. " +
			"4.2.2.1 in the §6.4.5.1 example); the part-number assignment itself is the server's " +
			"model, but the client-side duty is to reference nested parts only via " +
			"period-separated numeric paths. Applicability is 'conditional' — only when the client " +
			"fetches nested body parts. Testable: verify emitted section specifications for nested " +
			"parts use the dotted numeric form.",
	},
	{
		id: "RFC9051-6.4.5.1-2",
		source: "RFC9051",
		section: "6.4.5.1",
		title: "Part-specifier prefix rules; MIME MUST be prefixed by numeric specifiers",
		text:
			"The HEADER, HEADER.FIELDS, HEADER.FIELDS.NOT, and TEXT part specifiers can be the sole " +
			"part specifier or can be prefixed by one or more numeric part specifiers, provided " +
			"that the numeric part specifier refers to a part of type MESSAGE/RFC822 or " +
			"MESSAGE/GLOBAL. The MIME part specifier MUST be prefixed by one or more numeric part " +
			"specifiers.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"Binds the client's construction of BODY[<section>] section specifications (cross-ref " +
			"RFC3501-6.4.5-6; 9051 moves the rule into the dedicated §6.4.5.1 and adds " +
			"MESSAGE/GLOBAL). Two duties: numeric prefixes before the HEADER family or TEXT are " +
			"valid only against MESSAGE/RFC822 or MESSAGE/GLOBAL parts, and MIME may never stand " +
			"alone (BODY[4.1.MIME], never BODY[MIME]). §6.4.5.1 also notes non-numeric part " +
			"specifiers have to be the last specifier in a section specification. Applicability is " +
			"'conditional' — only when the client fetches such sections. Testable: inspect emitted " +
			"section specifications against the advertised BODYSTRUCTURE.",
	},

	// §6.4.6 STORE ──────────────────────────────────────────────────────────────

	{
		id: "RFC9051-6.4.6-1",
		source: "RFC9051",
		section: "6.4.6",
		title: "Untagged FETCH may arrive for external flag changes even with .SILENT",
		text:
			"Regardless of whether or not the \".SILENT\" suffix was used, the server SHOULD send " +
			"an untagged FETCH response if a change to a message's flags from an external source " +
			"is observed. The intent is that the status of the flags is determinate without a race " +
			"condition.",
		level: "SHOULD",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"This is the Note in §6.4.6; the leading 'Note:' label is omitted, the sentences are " +
			"otherwise verbatim (cross-ref RFC3501-6.4.6-1, which quoted only the first sentence). " +
			"The quoted SHOULD binds the server; the derived client duty is that a client using " +
			".SILENT STORE variants must still be prepared to receive and process unsolicited " +
			"untagged FETCH responses for externally observed flag changes — .SILENT suppresses " +
			"only the echo of the client's own change. Applicability is 'conditional' — relevant " +
			"when the client uses .SILENT. Testable: deliver an unsolicited FETCH after a .SILENT " +
			"STORE and verify the client accepts it without error.",
	},

	// §6.4.7 COPY ───────────────────────────────────────────────────────────────
	// No client-binding normative statements. Server duties (verified verbatim,
	// with deltas from RFC 3501): "If the destination mailbox does not exist, a
	// server MUST return an error.  It MUST NOT automatically create the
	// mailbox." (3501 said SHOULD / SHOULD NOT); "the server MUST send the
	// response code "[TRYCREATE]" as the prefix of the text of the tagged NO
	// response" unless certain creation is impossible — the retry-after-CREATE
	// hint stays advisory for the client; on failure the server "MUST restore
	// the destination mailbox to its state before the COPY attempt (other than
	// possibly incrementing UIDNEXT), i.e., partial copy MUST NOT be done"; the
	// server "MUST NOT send a COPYUID response code" for COPY-only-permission
	// mailboxes. Client-side COPYUID handling belongs to §7.1 (responses
	// extractor).

	// §6.4.8 MOVE ───────────────────────────────────────────────────────────────

	{
		id: "RFC9051-6.4.8-1",
		source: "RFC9051",
		section: "6.4.8",
		title: "COPYUID for MOVE arrives in an untagged OK before the EXPUNGEs",
		text:
			"Servers are also REQUIRED to send the COPYUID response code in an untagged OK before " +
			"sending EXPUNGE or similar responses.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"MOVE is new in the rev2 base spec (absorbed from RFC 6851). REQUIRED is the BCP 14 " +
			"synonym of MUST and binds the server; the derived client duty is to parse and " +
			"correlate a COPYUID response code delivered in an *untagged* OK during MOVE/UID MOVE " +
			"— unlike COPY, where COPYUID rides the tagged OK — so the new UIDs are known before " +
			"the subsequent EXPUNGE responses renumber the source mailbox. Applicability is " +
			"'conditional' — only when the client uses MOVE. Testable: script '* OK [COPYUID ...]' " +
			"followed by EXPUNGE responses and the tagged OK, and verify the client exposes the " +
			"UID mapping.",
	},
	{
		id: "RFC9051-6.4.8-2",
		source: "RFC9051",
		section: "6.4.8",
		title: "No sequence-number commands while the server is processing MOVE",
		text:
			"The server may send EXPUNGE responses before the tagged response, so the client " +
			"cannot safely send more commands with message sequence number arguments while the " +
			"server is processing MOVE.",
		level: "MUST NOT",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"Judgment call: keyword-less ('cannot safely') — under the 9051 BCP 14 boilerplate " +
			"lowercase words are non-normative, and §1.1 defines 'can' as possibility, so 'cannot " +
			"safely' states that no safe way exists. Treated as MUST NOT because violating it " +
			"risks operating on renumbered messages (data loss); the formal ambiguity-handling " +
			"requirements live in §5.5 (referenced at the end of §6.4.8), and the closing " +
			"paragraph extends the hazard: it is 'unsafe to pipeline any command that relies on " +
			"message sequence numbers after a MOVE or UID MOVE', and MOVE cannot be pipelined " +
			"with commands that might cause renumbering. Applicability is 'conditional' — only " +
			"when the client uses MOVE. Testable: request a sequence-number-based operation " +
			"through the API while a scripted MOVE is still in flight and verify the client does " +
			"not emit it before the MOVE's tagged response.",
	},

	// §6.4.9 UID ────────────────────────────────────────────────────────────────

	{
		id: "RFC9051-6.4.9-1",
		source: "RFC9051",
		section: "6.4.9",
		title: "ESEARCH for UID SEARCH carries the UID indicator; its numbers are UIDs",
		text:
			"The interpretation of the arguments is the same as with SEARCH; however, the numbers " +
			"returned in an ESEARCH response for a UID SEARCH command are unique identifiers " +
			"instead of message sequence numbers. Also, the corresponding ESEARCH response MUST " +
			"include the UID indicator.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"The quoted MUST binds the server. The derived client duty is to interpret all numeric " +
			"data in a UID-indicator-bearing ESEARCH response (MIN/MAX/ALL values) as UIDs, and to " +
			"expect the UID indicator on ESEARCH responses to UID SEARCH — the §6.4.4 example " +
			"('* ESEARCH (TAG \"A285\") UID MIN 7 MAX 3800') illustrates the format. Applicability " +
			"is 'conditional' — only when the client issues UID SEARCH. Testable: answer UID " +
			"SEARCH with a UID-flagged ESEARCH and verify the client maps results to UIDs, not " +
			"sequence numbers.",
	},
	{
		id: "RFC9051-6.4.9-2",
		source: "RFC9051",
		section: "6.4.9",
		title: "Number after '*' in untagged FETCH/EXPUNGE is a sequence number, even for UID commands",
		text:
			"The number after the \"*\" in an untagged FETCH or EXPUNGE response is always a " +
			"message sequence number, not a unique identifier, even for a UID command response.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"Judgment call: no 2119 keyword; a declarative interpretation rule treated as MUST " +
			"(cross-ref RFC3501-6.4.8-5) because a client that reads the leading number as a UID " +
			"corrupts its message-state mapping. 9051 extends the sentence to cover EXPUNGE " +
			"responses explicitly, which matters when processing UID EXPUNGE and UID MOVE. " +
			"Applicability is 'conditional' — most relevant when the client issues UID commands " +
			"(kept aligned with the 3501 analog; the rule itself governs every untagged " +
			"FETCH/EXPUNGE). Testable: respond to UID FETCH with '* 23 FETCH (... UID 4827313)' " +
			"and verify the client maps the data to sequence number 23 / UID 4827313, not UID 23.",
	},
	{
		id: "RFC9051-6.4.9-3",
		source: "RFC9051",
		section: "6.4.9",
		title: "FETCH responses caused by UID commands implicitly include the UID data item",
		text:
			"However, server implementations MUST implicitly include the UID message data item as " +
			"part of any FETCH response caused by a UID command, regardless of whether a UID was " +
			"specified as a message data item to the FETCH.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"The MUST binds the server (cross-ref RFC3501-6.4.8-6, which elided the leading " +
			"'However,'; quoted in full here). The derived client duty is to parse and accept a " +
			"UID data item in FETCH responses to UID commands even when UID was not requested, " +
			"rather than rejecting it as unexpected data; the following Note extends the rule to " +
			"any UID command that causes an untagged FETCH. Applicability is 'conditional' — " +
			"fires when the client uses UID commands. Testable: issue UID FETCH without UID in " +
			"the item list and verify the client accepts the implicit UID item in the response.",
	},

	// §6.5 Client Commands - Experimental/Expansion ─────────────────────────────

	{
		id: "RFC9051-6.5-1",
		source: "RFC9051",
		section: "6.5",
		title: "Non-spec commands MUST have an associated capability name",
		text:
			"Each command that is not part of this specification MUST have at least one capability " +
			"name (see Section 6.1.1) associated with it. (Multiple commands can be associated " +
			"with the same capability name.)",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "untestable",
		untestableRationale:
			"Whether a non-standard command the client emits 'has a capability name associated " +
			"with it' is a fact about the command's defining extension document, not about any " +
			"observable wire behavior of this client: a session trace showing the client sending " +
			"XFOO is identical whether or not some specification associates XFOO with a " +
			"capability. Establishing compliance requires auditing documentation outside the " +
			"protocol exchange.",
		untestableTheme: "out-of-band",
		notes:
			"This replaces RFC 3501's X-prefix convention (cross-ref RFC3501-6.5.1-1, which was " +
			"testable because the X prefix is visible on the wire; 9051 drops the X-prefix rule " +
			"entirely). The duty primarily binds extension designers; the client-side residue is " +
			"that any command outside RFC 9051 that the client emits must be one tied to a " +
			"capability name. The related duty to use extension commands only when the capability " +
			"is advertised is a §6.1.1 concern. §6.5's other normative sentence (servers MUST NOT " +
			"send added untagged responses unless requested via the associated command or ENABLE) " +
			"binds the server.",
	},
];
