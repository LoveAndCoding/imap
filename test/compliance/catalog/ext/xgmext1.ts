import type { CatalogModule } from "../types";

/**
 * X-GM-EXT-1 (Google vendor doc, not an RFC/IANA spec):
 * https://developers.google.com/workspace/gmail/imap/imap-extensions
 *
 * There are no RFC section numbers to anchor on, so `section` uses a
 * documented per-feature bucket scheme derived from the page's own
 * headings, and ids follow `X-GM-EXT-1-<section>-<ordinal>`:
 *
 *   - `cap`    — the X-GM-EXT-1 capability gate ("Checking for the presence
 *                of extensions") that all other sections below are
 *                conditional on.
 *   - `msgid`  — the "Access to the Gmail unique message ID: X-GM-MSGID"
 *                section: the X-GM-MSGID FETCH attribute and its use in
 *                SEARCH/UID SEARCH.
 *   - `thrid`  — the "Access to the Gmail thread ID: X-GM-THRID" section:
 *                the X-GM-THRID FETCH attribute and its use in
 *                SEARCH/UID SEARCH.
 *   - `labels` — the "Access to Gmail labels: X-GM-LABELS" section: the
 *                X-GM-LABELS FETCH attribute, its STORE forms, and its use
 *                in SEARCH/UID SEARCH.
 *   - `raw`    — the "Extension of the SEARCH command: X-GM-RAW" section:
 *                the X-GM-RAW search key.
 *
 * Fetch caveat: this is an HTML page, not a fixed .txt RFC. It was
 * retrieved via WebFetch, which converts HTML to markdown and passes it
 * through a summarizing model rather than returning raw bytes — so
 * byte-for-byte verbatim substring matching against the live page is not
 * guaranteed the way it is for RFC .txt sources. Following the XOAUTH2
 * precedent (Phase 3), FIVE independent WebFetch passes were taken on
 * 2026-07-04 (one broad-summary pass plus four progressively targeted
 * quote-extraction passes covering: general sections; the X-GM-EXT-1/
 * X-GM-LABELS/STORE examples; the X-GM-MSGID/X-GM-THRID worked FETCH/
 * SEARCH examples; and the X-GM-RAW/Special-Use-LIST sections) and
 * cross-checked against each other. The first (broad-summary) pass
 * produced a looser paraphrase that disagreed with the other four on
 * specific wording (e.g. it invented/altered the special-folder list and
 * omitted worked examples); passes 2-5 agreed verbatim with each other on
 * every overlapping sentence and all worked command/response examples, so
 * only sentences confirmed across at least two of the targeted passes are
 * used as quoted `text`. All quoted `text` segments were additionally
 * checked with a Node script (flatten-whitespace substring match) against
 * the concatenated targeted-pass output; see this module's extractionNote
 * and the per-entry notes for what is exact-as-fetched vs paraphrased.
 * No worked example of `-X-GM-LABELS` or `.SILENT` STORE forms appears
 * anywhere in any of the five fetches — this is recorded honestly in the
 * relevant entries' notes rather than invented.
 */
const xgmext1: CatalogModule = {
	source: "X-GM-EXT-1",
	extractionNote:
		"X-GM-EXT-1 (Google vendor doc, https://developers.google.com/workspace/gmail/imap/imap-extensions): " +
		"extracted the client-binding content from five sections of the page — 'Checking for the " +
		"presence of extensions' (X-GM-EXT-1-cap-1/2, the capability gate all other sections are " +
		"conditional on), 'Access to the Gmail unique message ID: X-GM-MSGID' (X-GM-EXT-1-msgid-1..5), " +
		"'Access to the Gmail thread ID: X-GM-THRID' (X-GM-EXT-1-thrid-1..5), 'Access to Gmail labels: " +
		"X-GM-LABELS' (X-GM-EXT-1-labels-1..8), and 'Extension of the SEARCH command: X-GM-RAW' " +
		"(X-GM-EXT-1-raw-1..2). Reviewed and deliberately excluded as non-client-binding or out of this " +
		"catalog's scope: the 'Special-Use Extension of the LIST command' and 'XLIST is deprecated' " +
		"sections (these describe RFC 6154 Special-Use attributes and the XLIST-to-Special-Use " +
		"migration, which are already covered by the existing RFC 6154 catalog — cataloging them again " +
		"under X-GM-EXT-1 would be cross-catalog double-scoring of the same client duty against a " +
		"different source id); the IMAP ID/RFC 2971 contact-address recommendation (already covered by " +
		"the existing RFC 2971 catalog). Provenance: this is a vendor doc (source: X-GM-EXT-1, not IANA/ " +
		"RFC); fetched via WebFetch (HTML-to-markdown through a summarizing model, not raw bytes) with " +
		"five independent passes on 2026-07-04 — a broad-summary pass and four targeted quote-extraction " +
		"passes, cross-checked against each other per the XOAUTH2 precedent. Quotes below are reproduced " +
		"only where at least two independent targeted passes agreed verbatim; the lone broad-summary pass " +
		"disagreed with the others on specific wording (special-folder list, presence of worked examples) " +
		"and was NOT used as a source of any quoted text. Every `text` field was mechanically verified as " +
		"a whitespace-flattened substring of the cross-checked targeted-pass output via a throwaway Node " +
		"script; all quotes passed (see this task's final report for the pasted all-pass output). No " +
		"RFC 2119 keywords appear anywhere on the page (it is a plain descriptive vendor doc), so every " +
		"entry's `level` is a judgment call explained in its own `notes` field rather than a lifted " +
		"keyword, following the XOAUTH2 precedent for keyword-less vendor docs.",
	requirements: [
		{
			id: "X-GM-EXT-1-cap-1",
			source: "X-GM-EXT-1",
			section: "cap",
			title: "Extension support advertised via CAPABILITY",
			text: "Gmail advertises its extension support in its response to the `CAPABILITY` command.",
			level: "MUST",
			applicability: "always",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Vendor doc (source: X-GM-EXT-1). Quote confirmed verbatim across two independent " +
				"targeted WebFetch passes of " +
				"https://developers.google.com/workspace/gmail/imap/imap-extensions as fetched on " +
				"2026-07-04 (verbatim-as-fetched, not byte-verified against the raw page — WebFetch " +
				"returns HTML-to-markdown through a summarizing model). Graded MUST despite the descriptive " +
				"phrasing ('advertises'): this is a statement of server behavior, but it establishes the " +
				"mechanism (CAPABILITY response) a client MUST consult before relying on any X-GM-EXT-1 " +
				"feature — a client that assumes the extensions are present without checking CAPABILITY " +
				"has no spec-compliant basis for using them. This entry gates every other entry in this " +
				"module: X-GM-MSGID/X-GM-THRID/X-GM-LABELS/X-GM-RAW are only valid/advertised when the " +
				"server's CAPABILITY response includes X-GM-EXT-1 (see X-GM-EXT-1-cap-2 for the literal " +
				"token). Applicability is 'always' (not conditional) because capability-checking discipline " +
				"applies regardless of whether the client goes on to use any specific extension.",
		},
		{
			id: "X-GM-EXT-1-cap-2",
			source: "X-GM-EXT-1",
			section: "cap",
			title: "X-GM-EXT-1 token gates all extensions in this document",
			text:
				"The support of extensions in this document are indicated by the presence of " +
				"`X-GM-EXT-1` in the list of supported capabilities.",
			level: "MUST",
			applicability: "always",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Vendor doc (source: X-GM-EXT-1). Quote confirmed verbatim across two independent " +
				"targeted WebFetch passes as fetched on 2026-07-04. Graded MUST: a client MUST treat the " +
				"literal presence of the `X-GM-EXT-1` capability token as the sole gate for whether " +
				"X-GM-MSGID, X-GM-THRID, X-GM-LABELS, and X-GM-RAW are valid to use — using any of them " +
				"without the server having advertised this token is a protocol violation against a server " +
				"that never offered them (the RFC 3501/9051 base rule that clients MUST NOT use " +
				"capabilities the server did not advertise applies here; this entry documents the specific " +
				"token name Gmail uses for that gate). Cross-reference: this is the same 'do not use " +
				"unadvertised extensions' discipline already generally cataloged under RFC 3501/RFC 9051 " +
				"capability handling; this entry exists to pin the specific vendor token name so the four " +
				"feature sections below can each cite it as their capability precondition instead of " +
				"repeating the general rule four times.",
		},
		{
			id: "X-GM-EXT-1-msgid-1",
			source: "X-GM-EXT-1",
			section: "msgid",
			title: "X-GM-MSGID identifies a message across folders",
			text:
				"Gmail provides a unique message ID for each email so that a unique message may be " +
				"identified across multiple folders.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableRationale:
				"This sentence describes a server-side identity guarantee (the same message keeps the " +
				"same X-GM-MSGID as it is copied/moved across Gmail folders/labels) — there is no client " +
				"duty to verify or enforce this; it is a property of the server's ID assignment scheme " +
				"that a client can only ever observe by reading whatever value the server sends back. A " +
				"client cannot be non-compliant with a fact about server-side ID stability; it can only " +
				"consume whatever value is returned. The client-observable duties this fact underlies " +
				"(retrieve via FETCH, use in SEARCH) are separately cataloged as testable entries below.",
			untestableTheme: "internal-state",
			notes:
				"Vendor doc (source: X-GM-EXT-1), from 'Access to the Gmail unique message ID: " +
				"X-GM-MSGID'. Quote confirmed verbatim across two independent targeted WebFetch passes as " +
				"fetched on 2026-07-04. Graded MUST as a description of a server guarantee the client's " +
				"downstream duties (below) depend on being true; applicability conditional on the client " +
				"choosing to use X-GM-MSGID at all, gated by X-GM-EXT-1-cap-2.",
		},
		{
			id: "X-GM-EXT-1-msgid-2",
			source: "X-GM-EXT-1",
			section: "msgid",
			title: "X-GM-MSGID retrieved via FETCH attribute",
			text: "Retrieval of this message ID is supported via the `X-GM-MSGID` attribute on the `FETCH` command.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Vendor doc (source: X-GM-EXT-1). Quote confirmed verbatim across two independent " +
				"targeted WebFetch passes as fetched on 2026-07-04. Worked example cross-checked in a " +
				"third independent targeted pass: `a006 FETCH 1 (X-GM-MSGID)` / " +
				"`* 1 FETCH (X-GM-MSGID 1278455344230334865)` / `a006 OK FETCH (Success)`. Graded MUST: " +
				"this defines the literal FETCH attribute name (`X-GM-MSGID`) a compliant server " +
				"recognizes and a client must send exactly this token (case per IMAP's atom-insensitivity) " +
				"to request the message ID — any other spelling is not this extension. Applicability " +
				"conditional on X-GM-EXT-1-cap-2 (capability gate) and on the client choosing to request " +
				"this attribute.",
		},
		{
			id: "X-GM-EXT-1-msgid-3",
			source: "X-GM-EXT-1",
			section: "msgid",
			title: "X-GM-MSGID is a 64-bit unsigned integer, decimal form of the web/API hex ID",
			text:
				"The message ID is a 64-bit unsigned integer and is the decimal equivalent for the ID " +
				"hex string used in the web interface and the Gmail API.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Vendor doc (source: X-GM-EXT-1). Quote confirmed verbatim across two independent " +
				"targeted WebFetch passes as fetched on 2026-07-04, and the worked FETCH example's literal " +
				"value `1278455344230334865` (decimal, fits in 64 unsigned bits: max " +
				"18446744073709551615) is consistent with this description. Graded MUST as a wire-format " +
				"contract: a client parsing the FETCH response's X-GM-MSGID value MUST treat it as an " +
				"unsigned 64-bit decimal integer (not e.g. hex, not signed) to correctly round-trip it " +
				"against the hex ID shown elsewhere (Gmail web UI, Gmail API) — a client that mis-parses " +
				"the representation (e.g. as a signed 32-bit int) would corrupt the ID. This also " +
				"establishes the 'treat as opaque beyond its numeric/stability properties' duty implied by " +
				"Task scope: the doc does not document any internal structure/semantics within the 64 " +
				"bits beyond 'unique message ID' and 'decimal form of the hex string' — a client should not " +
				"assume any further structure (e.g. that ranges of IDs are chronological or otherwise " +
				"meaningful) since none is documented.",
		},
		{
			id: "X-GM-EXT-1-msgid-4",
			source: "X-GM-EXT-1",
			section: "msgid",
			title: "X-GM-MSGID usable as a SEARCH/UID SEARCH key",
			text:
				"The `X-GM-MSGID` attribute may also be used in the `SEARCH` or `UID SEARCH` commands to " +
				"find the sequence numbers or `UID` of a message given Gmail's message ID.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Vendor doc (source: X-GM-EXT-1). Quote confirmed verbatim across two independent " +
				"targeted WebFetch passes as fetched on 2026-07-04. Worked example cross-checked in a " +
				"third independent pass: `a007 UID SEARCH X-GM-MSGID 1278455344230334865` / " +
				"`* SEARCH 1` / `a007 OK SEARCH (Success)`. Graded MAY: the sentence is permissive " +
				"('may also be used') describing an available search-key form, not a mandated usage — a " +
				"client is free to never use X-GM-MSGID as a search key. The wire form itself " +
				"(`X-GM-MSGID <number>` as a search-key/criterion) is nonetheless testable: if a client " +
				"does emit this search key, it must use this exact literal form to be understood by the " +
				"server.",
		},
		{
			id: "X-GM-EXT-1-msgid-5",
			source: "X-GM-EXT-1",
			section: "msgid",
			title: "X-GM-MSGID valid only under the X-GM-EXT-1 capability",
			text:
				"The support of extensions in this document are indicated by the presence of " +
				"`X-GM-EXT-1` in the list of supported capabilities.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableRationale:
				"This entry cross-references the capability gate (X-GM-EXT-1-cap-2, same quote) as it " +
				"specifically applies to X-GM-MSGID. A black-box harness can observe whether the client " +
				"sends a FETCH/SEARCH with the X-GM-MSGID attribute in a given session, and whether the " +
				"server advertised X-GM-EXT-1 in that session's CAPABILITY response — but 'the client must " +
				"not assume X-GM-MSGID is usable without first checking CAPABILITY' is a duty about the " +
				"client's internal decision process (whether it consulted the capability list before " +
				"acting), not a distinguishing wire signature: a client that checks and one that guesses-" +
				"and-happens-to-be-right against a real Gmail server emit identical FETCH/SEARCH bytes. " +
				"The observable half (does the server accept X-GM-MSGID only when it advertised " +
				"X-GM-EXT-1) is a server-side fact, not a client duty; the client-side gating discipline " +
				"itself has no separate wire trace from correct usage.",
			untestableTheme: "internal-decision",
			notes:
				"Vendor doc (source: X-GM-EXT-1). Same underlying quote as X-GM-EXT-1-cap-2, restated " +
				"under the msgid section per the task's requested scheme (capability gate applied to each " +
				"feature area) so the msgid family documents its own precondition rather than only relying " +
				"on a cross-reference. Graded MUST for the same reason as X-GM-EXT-1-cap-2.",
		},
		{
			id: "X-GM-EXT-1-thrid-1",
			source: "X-GM-EXT-1",
			section: "thrid",
			title: "X-GM-THRID associates messages into Gmail threads",
			text:
				"Gmail provides a thread ID to associate groups of messages in the same manner as in the " +
				"Gmail web interface.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableRationale:
				"Describes a server-side grouping guarantee (messages sharing a thread ID are the same " +
				"conversation as Gmail's web UI would group them) — this is a fact about server-side " +
				"threading logic, not a client behavior. A client cannot violate or fulfill 'associates " +
				"groups of messages the same way the web interface does'; it can only read back whatever " +
				"thread ID value the server assigns. The client-observable duties (retrieve via FETCH, use " +
				"in SEARCH) are cataloged separately as testable entries below.",
			untestableTheme: "internal-state",
			notes:
				"Vendor doc (source: X-GM-EXT-1), from 'Access to the Gmail thread ID: X-GM-THRID'. " +
				"Quote confirmed verbatim across two independent targeted WebFetch passes as fetched on " +
				"2026-07-04. Graded MUST as a description of the server guarantee underlying the testable " +
				"duties below; conditional on the client choosing to use X-GM-THRID, gated by " +
				"X-GM-EXT-1-cap-2.",
		},
		{
			id: "X-GM-EXT-1-thrid-2",
			source: "X-GM-EXT-1",
			section: "thrid",
			title: "X-GM-THRID retrieved via FETCH attribute",
			text: "Retrieval of this thread ID is supported via the `X-GM-THRID` attribute on the `FETCH` command.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Vendor doc (source: X-GM-EXT-1). Quote confirmed verbatim across two independent " +
				"targeted WebFetch passes as fetched on 2026-07-04. Worked example cross-checked in a " +
				"third independent pass: `a008 FETCH 1:4 (X-GM-THRID)` returning four untagged FETCH " +
				"responses each carrying a decimal X-GM-THRID value (e.g. " +
				"`* 2 FETCH (X-GM-THRID 1266894439832287888)`), terminated `a008 OK FETCH (Success)`. " +
				"Graded MUST: pins the literal FETCH attribute name (`X-GM-THRID`) a compliant server " +
				"recognizes. Applicability conditional on the capability gate and on the client requesting " +
				"this attribute.",
		},
		{
			id: "X-GM-EXT-1-thrid-3",
			source: "X-GM-EXT-1",
			section: "thrid",
			title: "X-GM-THRID is a 64-bit unsigned integer, decimal form of the web/API hex ID",
			text:
				"The thread ID is a 64-bit unsigned integer and is the decimal equivalent for the ID hex " +
				"string used in the web interface and the Gmail API.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Vendor doc (source: X-GM-EXT-1). Quote confirmed verbatim across two independent " +
				"targeted WebFetch passes as fetched on 2026-07-04; consistent with the worked example's " +
				"literal decimal values (e.g. `1266894439832287888`, well within unsigned 64-bit range). " +
				"Graded MUST for the same wire-format-contract reasoning as X-GM-EXT-1-msgid-3: a client " +
				"parsing X-GM-THRID MUST treat the value as unsigned 64-bit decimal, and should treat the " +
				"ID as otherwise opaque (stable/comparable for grouping purposes only) since the doc " +
				"documents no further internal structure.",
		},
		{
			id: "X-GM-EXT-1-thrid-4",
			source: "X-GM-EXT-1",
			section: "thrid",
			title: "X-GM-THRID usable as a SEARCH/UID SEARCH key",
			text:
				"The `X-GM-THRID` attribute may also be used in the `SEARCH` or `UID SEARCH` commands to " +
				"find the sequence numbers or `UID`s of messages in a given thread.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Vendor doc (source: X-GM-EXT-1). Quote confirmed verbatim across two independent " +
				"targeted WebFetch passes as fetched on 2026-07-04. Worked example cross-checked in a " +
				"third independent pass: `a009 UID SEARCH X-GM-THRID 1266894439832287888` / " +
				"`* SEARCH 2 3 4` / `a009 OK Search (Success)` — note multiple matching UIDs returned for " +
				"one thread ID, consistent with 'find the ... UIDs of messages in a given thread' " +
				"(plural). Graded MAY: permissive availability of a search-key form, not a mandated usage. " +
				"The literal wire form (`X-GM-THRID <number>` as a search key) is testable if a client does " +
				"emit it.",
		},
		{
			id: "X-GM-EXT-1-thrid-5",
			source: "X-GM-EXT-1",
			section: "thrid",
			title: "X-GM-THRID valid only under the X-GM-EXT-1 capability",
			text:
				"The support of extensions in this document are indicated by the presence of " +
				"`X-GM-EXT-1` in the list of supported capabilities.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableRationale:
				"Same reasoning as X-GM-EXT-1-msgid-5, restated for X-GM-THRID: the internal decision of " +
				"whether the client consulted CAPABILITY before using X-GM-THRID has no wire signature " +
				"distinct from correct usage; only the server-side acceptance/rejection is observable, and " +
				"that is a server behavior, not a client duty this harness scores.",
			untestableTheme: "internal-decision",
			notes:
				"Vendor doc (source: X-GM-EXT-1). Same underlying quote as X-GM-EXT-1-cap-2, restated " +
				"under the thrid section so this feature family documents its own capability precondition. " +
				"Graded MUST for the same reason as X-GM-EXT-1-cap-2.",
		},
		{
			id: "X-GM-EXT-1-labels-1",
			source: "X-GM-EXT-1",
			section: "labels",
			title: "Gmail labels are IMAP folders",
			text: "Gmail treats labels as folders for the purposes of IMAP.",
			level: "MUST",
			applicability: "always",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableRationale:
				"A description of Gmail's server-side mapping of its label model onto IMAP's mailbox/ " +
				"folder model — this is server architecture, not a client action. No client behavior is " +
				"mandated by this sentence in isolation; it is background context motivating the following " +
				"testable duties (label modification via CREATE/RENAME/DELETE, retrieval via X-GM-LABELS).",
			untestableTheme: "internal-decision",
			notes:
				"Vendor doc (source: X-GM-EXT-1), from 'Access to Gmail labels: X-GM-LABELS'. Quote " +
				"confirmed verbatim across two independent targeted WebFetch passes as fetched on " +
				"2026-07-04. Graded MUST as a definitional/architectural statement, not a client action " +
				"item; kept 'always' applicability since it is background fact rather than conditioned on " +
				"the client choosing a feature.",
		},
		{
			id: "X-GM-EXT-1-labels-2",
			source: "X-GM-EXT-1",
			section: "labels",
			title: "Labels modified via standard CREATE/RENAME/DELETE",
			text:
				"Labels can be modified using the standard IMAP commands, `CREATE`, `RENAME`, and " +
				"`DELETE`, that act on folders.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Vendor doc (source: X-GM-EXT-1). Quote confirmed verbatim across two independent " +
				"targeted WebFetch passes as fetched on 2026-07-04. Graded MUST: this pins the specific, " +
				"already-standard command set (CREATE/RENAME/DELETE from RFC 3501/9051) as the mechanism " +
				"for label lifecycle management under X-GM-EXT-1 — i.e., there is no separate X-GM-LABEL-" +
				"CREATE-style command; a client MUST reuse the base IMAP folder-lifecycle commands rather " +
				"than inventing a Gmail-specific one. This is a cross-reference note: the wire forms of " +
				"CREATE/RENAME/DELETE themselves are already cataloged as testable under RFC 3501/RFC 9051; " +
				"this entry exists only to record the X-GM-EXT-1-specific fact that no additional/different " +
				"command exists for label lifecycle, avoiding double-scoring the base commands' own forms " +
				"against this source.",
		},
		{
			id: "X-GM-EXT-1-labels-3",
			source: "X-GM-EXT-1",
			section: "labels",
			title: "System labels are reserved and bracket-prefixed",
			text:
				"System labels, which are labels created by Gmail, are reserved and prefixed by " +
				'"[Gmail]" or "[GoogleMail]" in the list of labels.',
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableRationale:
				"This describes a server-side naming convention/reservation applied to Gmail's own " +
				"system-created labels (e.g. how they appear in the mailbox-listing hierarchy under " +
				"'[Gmail]'/'[GoogleMail]'). There is no client duty here beyond passively observing " +
				"whatever names the server sends — a client cannot violate a reservation rule that " +
				"constrains what the server is allowed to name things, and any client action on these " +
				"names (LIST/SELECT) is already covered by the general, already-cataloged mailbox-naming " +
				"and LIST-response duties under RFC 3501/RFC 9051. Nothing X-GM-EXT-1-specific is asked of " +
				"the client beyond that.",
			untestableTheme: "internal-decision",
			notes:
				"Vendor doc (source: X-GM-EXT-1). Quote confirmed verbatim across two independent " +
				"targeted WebFetch passes as fetched on 2026-07-04. Graded MUST as a description of a " +
				"server-side reservation/naming rule, not a client action.",
		},
		{
			id: "X-GM-EXT-1-labels-4",
			source: "X-GM-EXT-1",
			section: "labels",
			title: "X-GM-LABELS retrieved via FETCH attribute",
			text: "The labels for a given message may be retrieved by using the `X-GM-LABELS` attribute with the `FETCH` command.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Vendor doc (source: X-GM-EXT-1). Quote confirmed verbatim across two independent " +
				"targeted WebFetch passes as fetched on 2026-07-04. Worked example cross-checked in a " +
				"third independent pass: `a010 FETCH 1:4 (X-GM-LABELS)` returning four untagged FETCH " +
				"lines including `* 1 FETCH (X-GM-LABELS (\\Inbox \\Sent Important \"Muy Importante\"))`, " +
				"`* 2 FETCH (X-GM-LABELS (foo))`, `* 3 FETCH (X-GM-LABELS ())` (empty label list — a " +
				"message with no labels), and `* 4 FETCH (X-GM-LABELS (\\Drafts))`, terminated " +
				"`a010 OK FETCH (Success)`. Observed system labels in the worked examples: `\\Inbox`, " +
				"`\\Sent`, `\\Drafts` (backslash-prefixed, i.e. flag-like atoms) alongside non-backslash " +
				"labels `Important`, `\"Muy Importante\"` (quoted string, containing a space) and a plain " +
				"user label `foo` — this establishes the FETCH response's X-GM-LABELS list may mix " +
				"backslash-flag-style system labels with plain/quoted-string user label names in the same " +
				"parenthesized list, and may legitimately be empty. Graded MAY: permissive ('may be " +
				"retrieved'), describing an available attribute, not a mandated retrieval.",
		},
		{
			id: "X-GM-EXT-1-labels-5",
			source: "X-GM-EXT-1",
			section: "labels",
			title: "X-GM-LABELS response is a list of ASTRINGs, UTF-7 encoded as appropriate",
			text: "The attribute is returned as a list of `ASTRING`s, encoded in UTF-7 as appropriate.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Vendor doc (source: X-GM-EXT-1). Quote confirmed verbatim across two independent " +
				"targeted WebFetch passes as fetched on 2026-07-04. Graded MUST as a wire-format contract " +
				"for the FETCH response: a client parsing X-GM-LABELS MUST accept each list member as an " +
				"IMAP ASTRING (atom or quoted-string/literal, per RFC 3501/9051 ASTRING grammar) and MUST " +
				"decode label text using modified UTF-7 where the server has encoded it that way ('as " +
				"appropriate' — i.e. plain-ASCII labels need no decoding, non-ASCII label text is UTF-7 " +
				"encoded per the same mailbox-name convention IMAP already uses elsewhere). A client " +
				"hard-coding an assumption that labels are always plain ASCII atoms would misparse non-" +
				"ASCII label names. Cross-reference: this reuses IMAP's existing modified UTF-7 mailbox-" +
				"name convention (RFC 3501 §5.1.3 / RFC 9051 equivalent), already cataloged generally; this " +
				"entry records that X-GM-LABELS values are subject to the same convention.",
		},
		{
			id: "X-GM-EXT-1-labels-6",
			source: "X-GM-EXT-1",
			section: "labels",
			title: "Labels added to a message via STORE +X-GM-LABELS",
			text: "Labels may be added to a message using the `STORE` command in conjunction with the `X-GM-LABELS` attribute.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Vendor doc (source: X-GM-EXT-1). Quote confirmed verbatim across two independent " +
				"targeted WebFetch passes as fetched on 2026-07-04. Worked example cross-checked in a " +
				"third independent pass, and it specifically uses the ADD form of STORE data-item syntax: " +
				"`a011 STORE 1 +X-GM-LABELS (foo)` producing " +
				"`* 1 FETCH (X-GM-LABELS (\\Inbox \\Sent Important \"Muy Importante\" foo))` " +
				"(the new label `foo` appended to the message's existing label set) and terminated " +
				"`a011 OK STORE (Success)`. This confirms the `+X-GM-LABELS` (add) STORE data-item form, " +
				"matching the standard IMAP STORE convention where a bare data-item name (X-GM-LABELS) " +
				"would replace/set the full list, `+`-prefixed adds, and `-`-prefixed removes (RFC 3501 " +
				"§6.4.6 / RFC 9051 equivalent for the base FLAGS data-item, whose add/remove/replace " +
				"convention this attribute reuses). Graded MAY: 'may be added' is permissive availability of " +
				"the STORE form, not a mandated action; the wire form itself (once a client chooses to add " +
				"a label) is a testable syntactic contract.",
		},
		{
			id: "X-GM-EXT-1-labels-7",
			source: "X-GM-EXT-1",
			section: "labels",
			title: "-X-GM-LABELS (remove) and X-GM-LABELS (replace) STORE forms are not documented with a worked example",
			text: "Labels may be added to a message using the `STORE` command in conjunction with the `X-GM-LABELS` attribute.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableRationale:
				"None of five independent WebFetch passes of the page (2026-07-04) surfaced a worked " +
				"example, or even a sentence, documenting `-X-GM-LABELS` (remove) or bare `X-GM-LABELS` " +
				"(replace) STORE forms, or a `.SILENT` variant — only the `+X-GM-LABELS` (add) form has a " +
				"quoted sentence and worked example (X-GM-EXT-1-labels-6). Per this task's Step 2 rule " +
				"('do NOT fabricate a quote... use a documented paraphrase in notes'), no `text` is " +
				"asserted for the remove/replace/SILENT forms beyond the same general 'STORE command in " +
				"conjunction with the X-GM-LABELS attribute' sentence already used for the add form — this " +
				"entry exists to record the gap honestly rather than to assert an unverified normative " +
				"claim about remove/replace syntax. In practice Gmail's servers are widely known to accept " +
				"the standard `-X-GM-LABELS`/bare-`X-GM-LABELS`/`.SILENT` STORE conventions (mirroring " +
				"FLAGS), but that is outside what this specific page verifiably documents, so it is not " +
				"asserted as a catalog fact with page-sourced text. This is flagged as an ambiguity in the " +
				"final task report.",
			untestableTheme: "internal-decision",
			notes:
				"Vendor doc (source: X-GM-EXT-1). Kept MAY/conditional/untestable rather than omitted " +
				"entirely, so the gap itself is auditable in the catalog (an extractor re-fetching the page " +
				"later can see this was checked and not found, rather than silently absent). If a future " +
				"page revision adds a worked -X-GM-LABELS/.SILENT example, this entry should be split into " +
				"proper testable sibling entries with their own quoted text.",
		},
		{
			id: "X-GM-EXT-1-labels-8",
			source: "X-GM-EXT-1",
			section: "labels",
			title: "X-GM-LABELS usable as a SEARCH/UID SEARCH key",
			text:
				"The `X-GM-LABELS` attribute may also be used in the `SEARCH` or `UID SEARCH` commands to " +
				"find the sequence numbers or `UID`s of all messages in the folder with a given label.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Vendor doc (source: X-GM-EXT-1). Quote confirmed verbatim across two independent " +
				"targeted WebFetch passes as fetched on 2026-07-04. No worked SEARCH example for this " +
				"specific form was found in any of the five fetches (only the FETCH/STORE examples for " +
				"X-GM-LABELS were shown); the sentence itself is nonetheless clear and unambiguous about " +
				"the wire form (`X-GM-LABELS <label>` as a search key), consistent with the analogous, " +
				"page-confirmed X-GM-MSGID/X-GM-THRID SEARCH key forms (X-GM-EXT-1-msgid-4/thrid-4) which " +
				"do have worked examples. Graded MAY: permissive availability of a search-key form.",
		},
		{
			id: "X-GM-EXT-1-labels-9",
			source: "X-GM-EXT-1",
			section: "labels",
			title: "X-GM-LABELS valid only under the X-GM-EXT-1 capability",
			text:
				"The support of extensions in this document are indicated by the presence of " +
				"`X-GM-EXT-1` in the list of supported capabilities.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableRationale:
				"Same reasoning as X-GM-EXT-1-msgid-5/thrid-5, restated for X-GM-LABELS: whether the " +
				"client internally consulted CAPABILITY before using the X-GM-LABELS FETCH/STORE/SEARCH " +
				"forms has no wire signature distinct from a client that simply happens to use it " +
				"correctly against a real Gmail server; only server-side acceptance is observable, and " +
				"that is not this client's duty to score.",
			untestableTheme: "internal-decision",
			notes:
				"Vendor doc (source: X-GM-EXT-1). Same underlying quote as X-GM-EXT-1-cap-2, restated " +
				"under the labels section so this feature family documents its own capability precondition.",
		},
		{
			id: "X-GM-EXT-1-raw-1",
			source: "X-GM-EXT-1",
			section: "raw",
			title: "X-GM-RAW provides full Gmail search syntax passthrough",
			text: "To provide access to the full Gmail search syntax, Gmail provides the `X-GM-RAW` search attribute.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Vendor doc (source: X-GM-EXT-1), from 'Extension of the SEARCH command: X-GM-RAW'. " +
				"Quote confirmed verbatim across two independent targeted WebFetch passes as fetched on " +
				"2026-07-04. Graded MUST: pins the literal search-key attribute name (`X-GM-RAW`) a " +
				"compliant server recognizes; a client wishing to pass Gmail search syntax through IMAP " +
				"SEARCH must use exactly this token. Applicability conditional on the X-GM-EXT-1 capability " +
				"gate and the client choosing to use Gmail-syntax search.",
		},
		{
			id: "X-GM-EXT-1-raw-2",
			source: "X-GM-EXT-1",
			section: "raw",
			title: "X-GM-RAW arguments interpreted as Gmail web-interface search syntax",
			text:
				"Arguments passed along with the `X-GM-RAW` attribute when executing the `SEARCH` or " +
				"`UID SEARCH` commands will be interpreted in the same manner as in the Gmail web " +
				"interface.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Vendor doc (source: X-GM-EXT-1). Quote confirmed verbatim across two independent " +
				"targeted WebFetch passes as fetched on 2026-07-04. Worked example cross-checked in a " +
				'third independent pass: `a005 SEARCH X-GM-RAW "has:attachment in:unread"` — establishing ' +
				"the wire form as `X-GM-RAW` followed by a single IMAP string (quoted-string/literal, per " +
				"ASTRING/string grammar) containing the entire Gmail query as one opaque argument, not a " +
				"parenthesized list or multiple separate tokens. Graded MUST as a wire-format contract for " +
				"the argument shape (one quoted-string search-query argument) a client emitting this " +
				"search key must follow for the server to interpret it as intended.",
		},
	],
};

export default xgmext1;
