import type { CatalogModule } from "../types";

const rfc8474: CatalogModule = {
	source: "RFC8474",
	extractionNote:
		"Full document reviewed (Abstract, §1 Introduction, §2 Conventions, §3 CAPABILITY " +
		"Identification, §4 MAILBOXID Object Identifier [§4.1 New Response Code for CREATE, §4.2 New " +
		"OK Untagged Response for SELECT and EXAMINE, §4.3 New Attribute for STATUS], §5 EMAILID " +
		"Object Identifier and THREADID Correlator [§5.1 EMAILID Identifier for Identical Messages, " +
		"§5.2 THREADID Identifier for Related Messages, §5.3 New Message Data Items in FETCH and UID " +
		"FETCH Commands], §6 New Filters on SEARCH Command, §7 Formal Syntax, §8 Implementation " +
		"Considerations [§8.1 Assigning Object Identifiers, §8.2 Interaction with Special Cases, §8.3 " +
		"Client Usage, §8.4 Advice to Client Implementers], §9 Future Considerations, §10 IANA " +
		"Considerations, §11 Security Considerations, §12 References, Appendix A, Acknowledgments, " +
		"Author's Address). 18 client-binding entries extracted. " +
		"CLIENT/SERVER SPLIT: RFC 8474 is overwhelmingly a server-behavior specification — nearly " +
		"every RFC 2119 keyword sentence binds the SERVER (allocation, immutability, and uniqueness " +
		"invariants of the identifiers), and those are excluded here. What binds the CLIENT is (a) " +
		"the wire SHAPES it must be able to PARSE and ACCEPT — the EMAILID/THREADID FETCH items and " +
		"their fetch-response data items, the MAILBOXID resp-code on CREATE and the untagged " +
		"`* OK [MAILBOXID (...)]` on SELECT/EXAMINE, THREADID's NIL value when threading is " +
		"unsupported, and the objectid token syntax — captured as judgment-level implicit client " +
		"parse duties (the quoted keyword binds the server's generation of the shape, but a client " +
		"claiming OBJECTID support must accept every such shape it may receive); and (b) the client's " +
		"own conduct duties in §8.3/§8.4 (cache/fetch strategy, inconsistency fallback, the MUST-NOT- " +
		"infinite-loop guard). " +
		"OPAQUE / CASE-SENSITIVE TREATMENT: §7 ('ObjectID values are case sensitive'; the objectid " +
		"ABNF `1*255(ALPHA / DIGIT / \"_\" / \"-\")`) and §8.1 (1–255 chars from the 64-codepoint " +
		"base64url set) together define the identifier as an OPAQUE, case-significant token. A client " +
		"MUST NOT assume internal structure and MUST compare case-sensitively; because a client that " +
		"treats an ObjectID as opaque and one that (wrongly) parses structure emit byte-identical " +
		"wire traffic — the divergence lives entirely in the client's internal caching/matching " +
		"logic — these opaque-treatment duties are UNTESTABLE by a black-box wire probe and are " +
		"tagged theme internal-decision. " +
		"EXCLUDED AS SERVER-ONLY: §3 (server MUST include \"OBJECTID\" in CAPABILITY); §4 core " +
		"MAILBOXID invariants (server MUST return the same MAILBOXID for same name+UIDVALIDITY; MUST " +
		"NOT report the same MAILBOXID for two mailboxes; MUST NOT reuse; MUST keep the same MAILBOXID " +
		"across a message-preserving RENAME); §4.3 STATUS MAILBOXID attribute (server MUST support — " +
		"the client-facing STATUS/LIST-STATUS parse surface for MAILBOXID is a STATUS-response concern " +
		"already governed by the base STATUS grammar, and this document adds only a server support " +
		"duty, so no distinct client entry is drawn from §4.3); §5.1 EMAILID immutability/COPYUID " +
		"pairing MUSTs and the APPEND-dedup MAY (all server generation duties); §5.2 server SHOULD " +
		"return same THREADID for related messages / MUST return same THREADID for same EMAILID / MUST " +
		"NOT change THREADID once reported / MUST NOT reuse an ObjectID value across the EMAILID and " +
		"THREADID spaces (all server-side allocation invariants — the last constrains the server's id " +
		"namespace, not any client action; a client treating ids as opaque never needs to enforce it); " +
		"§6 SEARCH filters EMAILID/THREADID (server search behavior — the client command form is " +
		"driven via the base SEARCH surface and this suite has no OBJECTID SEARCH driver verb; no " +
		"client-binding parse duty distinct from the opaque-token handling already captured); §8.2 " +
		"proxy MUST-NOT-advertise-OBJECTID-unless-unique (binds a proxy acting as a server); §8.1 " +
		"defensive-allocation SHOULD list and §11 Security Considerations (server id-generation " +
		"advice). EXCLUDED AS NON-NORMATIVE / NO CLIENT DUTY: §9 Future Considerations, §10 IANA, and " +
		"Appendix A (implementation ideas). " +
		"REV2-CORE CROSS-REFERENCE: OBJECTID is NOT folded into IMAP4rev2 (RFC 9051). RFC 9051 " +
		"references RFC 8474 only in Appendix F ('Other Recommended IMAP Extensions') via a lowercase, " +
		"non-normative 'recommended' — it restates none of these duties. OBJECTID therefore remains a " +
		"standalone extension in both profiles, so every entry is profiles: [\"rev1\",\"rev2\"] (no " +
		"rev1-only tagging, no double-scoring risk). applicability is 'conditional' throughout: these " +
		"duties bind only a client that uses the OBJECTID extension (advertised via the OBJECTID " +
		"capability); an unimplemented conditional duty still counts against RFC 8474's score. " +
		"Total: 18 client-binding entries. Untestable: 5 (RFC8474-7-1, RFC8474-7-2, RFC8474-8.1-1, " +
		"RFC8474-8.3-1, RFC8474-8.3-2; all theme internal-decision).",
	requirements: [
		// ── §1 Introduction ──────────────────────────────────────────────────────

		{
			id: "RFC8474-1-1",
			source: "RFC8474",
			section: "1",
			title: "Client MUST accept NIL for THREADID when the server lacks threading",
			text: "A server that does not implement threading will return NIL to all requests for THREADID.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit client MUST inferred from a descriptive 'will return' " +
				"sentence — no RFC 2119 keyword in the source). The document establishes that a " +
				"THREADID FETCH item may resolve to NIL rather than an `(objectid)`, so a client that " +
				"requests THREADID must accept a NIL value as a normal, well-formed response and not " +
				"treat it as a protocol error. Restated normatively in §5.2 (RFC8474-5.2-1) and " +
				"grammaticised in §5.3 (RFC8474-5.3-5); kept as a distinct entry because the " +
				"Introduction is where the NIL-when-unsupported contract is first and most plainly " +
				"stated for the client. Testable: a scripted server can return `THREADID NIL` and the " +
				"client must complete the FETCH successfully. No RFC 9051 restatement (OBJECTID is not " +
				"a rev2 core feature), so source-of-truth here for both profiles.",
		},

		// ── §4.1 New Response Code for CREATE ─────────────────────────────────────

		{
			id: "RFC8474-4.1-1",
			source: "RFC8474",
			section: "4.1",
			title: "Client MUST accept the MAILBOXID response code in a tagged OK for CREATE",
			text:
				"A server advertising the OBJECTID capability MUST include the MAILBOXID response code " +
				"in the tagged OK response to all successful CREATE commands.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level for the CLIENT: the quoted MUST binds the server's generation of the " +
				"response code, but the client-binding consequence (captured by this entry) is that a " +
				"client using OBJECTID must parse and accept a `MAILBOXID (objectid)` resp-text-code " +
				"in the tagged OK completing a CREATE — Syntax: \"MAILBOXID\" SP \"(\" objectid \")\" " +
				"(e.g. `A OK [MAILBOXID (Fabc-123)] Completed`). Testable: a scripted CREATE OK " +
				"carrying the code must not derail the client's command completion. The server-side " +
				"MUST-include duty itself is out of scope (server-only). No RFC 9051 counterpart.",
		},

		// ── §4.2 New OK Untagged Response for SELECT and EXAMINE ───────────────────

		{
			id: "RFC8474-4.2-1",
			source: "RFC8474",
			section: "4.2",
			title: "Client MUST accept the untagged * OK [MAILBOXID (...)] on SELECT/EXAMINE",
			text:
				"A server advertising the OBJECTID capability MUST return an untagged OK response with " +
				"the MAILBOXID response code on all successful SELECT and EXAMINE commands.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level for the CLIENT (the quoted MUST binds the server's emission). The " +
				"client-binding consequence: a client using OBJECTID must accept an untagged " +
				"`* OK [MAILBOXID (objectid)] text` interleaved among the SELECT/EXAMINE untagged " +
				"responses — Syntax: \"OK\" SP \"[\" \"MAILBOXID\" SP \"(\" objectid \")\" \"]\" SP " +
				"text — and complete the SELECT/EXAMINE normally. Testable: scripted mailbox open " +
				"emitting the untagged OK MAILBOXID line must not break selection. Server-side " +
				"emission duty is out of scope. No RFC 9051 counterpart.",
		},

		// ── §5.1 EMAILID Identifier for Identical Messages ─────────────────────────

		{
			id: "RFC8474-5.1-1",
			source: "RFC8474",
			section: "5.1",
			title: "Client MUST accept an EMAILID FETCH item as an opaque content identifier",
			text: "The EMAILID data item is an ObjectID that uniquely identifies the content of a single message.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (defining sentence, no RFC 2119 keyword). Establishes EMAILID as an " +
				"ObjectID a client may fetch and cache to recognise identical message content across " +
				"mailboxes; the client-binding duty is to accept the EMAILID FETCH data item (an " +
				"`(objectid)`) as a valid, opaque per-message identifier. The wire acceptance of the " +
				"item is testable (a scripted `* n FETCH (EMAILID (Mabc))` must parse); the derived " +
				"caching benefit is the client's own concern and not separately tested here. The " +
				"server's EMAILID immutability/COPYUID-pairing MUSTs in this section are server-only " +
				"and excluded. No RFC 9051 counterpart.",
		},

		// ── §5.2 THREADID Identifier for Related Messages ──────────────────────────

		{
			id: "RFC8474-5.2-1",
			source: "RFC8474",
			section: "5.2",
			title: "Client MUST accept THREADID as OPTIONAL and NIL-valued when unsupported",
			text:
				"THREADID is OPTIONAL; if the server doesn't support THREADID or is unable to " +
				"calculate relationships between messages, it MUST return NIL to all FETCH responses " +
				"for the THREADID data item, and a SEARCH for THREADID MUST NOT match any messages.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"The quoted MUST/MUST NOT bind the server, but the client-binding consequence is " +
				"first-class here: because THREADID is OPTIONAL and resolves to NIL whenever the " +
				"server cannot thread, a client that fetches THREADID MUST handle a NIL value (per the " +
				"fetch-threadid-resp ABNF `\"THREADID\" SP ( \"(\" objectid \")\" / nil )`) as a " +
				"normal outcome rather than a parse error. Testable via a scripted `THREADID NIL` " +
				"FETCH response. The SEARCH-side clause is server behavior (this suite drives no " +
				"OBJECTID SEARCH). Complements RFC8474-1-1 (Introduction statement) and RFC8474-5.3-5 " +
				"(grammar of the NIL response). No RFC 9051 counterpart.",
		},

		// ── §5.3 New Message Data Items in FETCH and UID FETCH Commands ────────────

		{
			id: "RFC8474-5.3-1",
			source: "RFC8474",
			section: "5.3",
			title: "Client MAY request the EMAILID FETCH message data item",
			text: "The EMAILID message data item causes the server to return EMAILID FETCH response data items.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (defining sentence; no keyword — the enabling MAY is inferred from the " +
				"fetch-att ABNF `fetch-att =/ \"EMAILID\" / \"THREADID\"`, which makes EMAILID an " +
				"optional client-selectable FETCH item). Client-binding: a client using OBJECTID may " +
				"emit `EMAILID` inside a FETCH item list (e.g. `FETCH 1:* (EMAILID)`); the atom must " +
				"be accepted by the server and the client must correlate the returned data item. " +
				"Testable as a command-emission/response-correlation form. No RFC 9051 counterpart.",
		},
		{
			id: "RFC8474-5.3-2",
			source: "RFC8474",
			section: "5.3",
			title: "Client MAY request the THREADID FETCH message data item",
			text: "The THREADID message data item causes the server to return THREADID FETCH response data items.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (defining sentence; enabling MAY inferred from `fetch-att =/ " +
				"\"EMAILID\" / \"THREADID\"`). Client-binding: a client using OBJECTID may emit " +
				"`THREADID` inside a FETCH item list and must correlate the returned data item " +
				"(which may be `(objectid)` or NIL — see RFC8474-5.2-1/-5.3-5). Testable as a " +
				"command-emission/response-correlation form. No RFC 9051 counterpart.",
		},
		{
			id: "RFC8474-5.3-3",
			source: "RFC8474",
			section: "5.3",
			title: "Client MUST parse the EMAILID FETCH response data item",
			text: "The EMAILID response data item contains the server-assigned ObjectID for each message.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level for the CLIENT (defining sentence; the client parse obligation is " +
				"implicit). A client that requested EMAILID must parse the fetch-emailid-resp " +
				"`\"EMAILID\" SP \"(\" objectid \")\"` (msg-att-static) as a static message attribute " +
				"and associate it with the message. Testable: scripted `* n FETCH (EMAILID (Mabc))` " +
				"must parse into the correct message. The server's assignment of the id is server-" +
				"only. No RFC 9051 counterpart.",
		},
		{
			id: "RFC8474-5.3-4",
			source: "RFC8474",
			section: "5.3",
			title: "Client MUST parse the THREADID FETCH response data item",
			text:
				"The THREADID response data item contains the server-assigned ObjectID for the set of " +
				"related messages to which this message belongs.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level for the CLIENT (defining sentence; implicit parse obligation). A " +
				"client that requested THREADID must parse the fetch-threadid-resp " +
				"`\"THREADID\" SP ( \"(\" objectid \")\" / nil )` (msg-att-static) as a static " +
				"attribute — accepting either an `(objectid)` grouping id or NIL (see RFC8474-5.3-5). " +
				"Testable: scripted `* n FETCH (THREADID (Tabc))` must parse. No RFC 9051 counterpart.",
		},
		{
			id: "RFC8474-5.3-5",
			source: "RFC8474",
			section: "5.3",
			title: "Client MUST accept NIL as the THREADID response data item value",
			text:
				"The NIL value is returned for the THREADID response data item when the server mailbox " +
				"does not support THREADID calculation.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level for the CLIENT (defining sentence; implicit parse obligation). Pins " +
				"the second alternative of fetch-threadid-resp: the client must accept a bare `NIL` " +
				"(not `(objectid)`) as the THREADID value in a FETCH response and treat it as 'no " +
				"thread grouping', not as an error. Testable via a scripted `* n FETCH (THREADID " +
				"NIL)`. Distinct from RFC8474-5.2-1 (the OPTIONAL/NIL contract) by pinning the " +
				"grammar of the response item itself. No RFC 9051 counterpart.",
		},

		// ── §7 Formal Syntax ──────────────────────────────────────────────────────

		{
			id: "RFC8474-7-1",
			source: "RFC8474",
			section: "7",
			title: "Client MUST treat ObjectID values as case-sensitive (opaque)",
			text: "Please note specifically that ObjectID values are case sensitive.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"The document carves ObjectID values out of IMAP's default case-insensitive atom " +
				"matching ('Except as noted otherwise, all alphabetic characters are case " +
				"insensitive ... Implementations MUST accept these strings in a case-insensitive " +
				"fashion. Please note specifically that ObjectID values are case sensitive.'), so a " +
				"compliant client must compare two ObjectIDs case-SENSITIVELY (treating 'Mabc' and " +
				"'MABC' as different messages/mailboxes). But whether the client compares case-" +
				"sensitively or case-insensitively is a decision made entirely inside its own " +
				"cache-matching logic and is never expressed on the wire: the client emits and " +
				"receives ObjectIDs as opaque byte strings either way, so a black-box probe cannot " +
				"distinguish a case-sensitive comparator from a case-insensitive one. Judgment level " +
				"(implicit client MUST derived from the case-sensitivity carve-out).",
			notes:
				"Read together with the objectid ABNF (RFC8474-7-2) and the charset/length rule " +
				"(RFC8474-8.1-1) this defines the identifier as an OPAQUE, case-significant token the " +
				"client MUST NOT reinterpret. No RFC 9051 counterpart.",
		},
		{
			id: "RFC8474-7-2",
			source: "RFC8474",
			section: "7",
			title: "Client MUST treat objectid as an opaque token per its ABNF (no assumed structure)",
			text: 'objectid = 1*255(ALPHA / DIGIT / "_" / "-")',
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"The objectid production (with its comment 'characters in object identifiers are " +
				"case significant') defines the identifier purely as a 1–255-character flat token " +
				"drawn from ALPHA/DIGIT/'_'/'-'. It carries NO internal structure, so a client MUST " +
				"treat it as opaque and MUST NOT parse, split, or infer meaning from its bytes " +
				"(e.g. the 'M'/'T' prefixes shown in examples are a server convention, not a " +
				"client-parseable field). Whether a client honors that opacity is invisible on the " +
				"wire — an opaque-treating client and a wrongly-structure-parsing client accept and " +
				"echo byte-identical ObjectIDs; the divergence only ever manifests in the client's " +
				"internal handling, never in observable protocol traffic. Judgment level (implicit " +
				"client MUST derived from the token grammar).",
			notes:
				"The wire ACCEPTANCE of any RFC-valid objectid (any 1–255-char base64url string) is " +
				"exercised indirectly by the FETCH/resp-code parse entries (RFC8474-4.1-1, -4.2-1, " +
				"-5.3-3, -5.3-4); this entry captures the separate, untestable duty to treat that " +
				"token as opaque. No RFC 9051 counterpart.",
		},

		// ── §8.1 Assigning Object Identifiers ──────────────────────────────────────

		{
			id: "RFC8474-8.1-1",
			source: "RFC8474",
			section: "8.1",
			title: "Client MUST accept any ObjectID within the 1–255-char base64url set",
			text:
				"An ObjectID is a string of 1 to 255 characters from the following set of 64 " +
				"codepoints: a-z, A-Z, 0-9, _, -.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"Restates the objectid value space (the base64url alphabet, length 1–255). The " +
				"client-binding duty is to accommodate ANY id in this space when allocating storage " +
				"and comparing — i.e. not to reject or truncate ids that use the full length or the " +
				"full alphabet, and not to assume a narrower shape (such as UUID formatting). That " +
				"accommodation is an internal storage/handling decision: a client that silently " +
				"mishandles a maximal-length or unusual-but-valid id produces no distinguishing wire " +
				"signal (it still echoes whatever bytes it received in subsequent commands), so a " +
				"black-box probe cannot confirm the client sized its buffers or comparisons to the " +
				"full value space. Judgment level (implicit client MUST derived from the value-space " +
				"definition). Paired with RFC8474-7-1/-7-2 as the opaque-treatment cluster.",
			notes:
				"§8.1's further defensive-allocation SHOULD list (avoid leading dash/digits, all-" +
				"digits, case-only differences, the 'NIL' sequence) binds the SERVER's id generation " +
				"and is excluded as server-only. No RFC 9051 counterpart.",
		},

		// ── §8.3 Client Usage ──────────────────────────────────────────────────────

		{
			id: "RFC8474-8.3-1",
			source: "RFC8474",
			section: "8.3",
			title: "Offline-caching client should fetch EMAILID of new messages",
			text:
				"Clients that cache data offline should fetch the EMAILID of all new messages to " +
				"avoid redownloading already-cached message details.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"Lowercase 'should' — non-normative per RFC 8174, carried at judgment level (a " +
				"caching recommendation, not an RFC 2119 SHOULD). Even taken as a soft duty it is " +
				"untestable: whether a client fetches EMAILID for caching purposes is a policy of its " +
				"offline-cache subsystem, indistinguishable on the wire from a client that fetches " +
				"EMAILID for any other reason or a non-caching client that never fetches it at all. " +
				"No black-box probe can attribute (or require) a FETCH EMAILID to a caching strategy.",
			notes:
				"Judgment level (lowercase 'should', per RFC 8174). Conditional on the client both " +
				"using OBJECTID and maintaining an offline cache. No RFC 9051 counterpart.",
		},
		{
			id: "RFC8474-8.3-2",
			source: "RFC8474",
			section: "8.3",
			title: "Client should fetch MAILBOXID before discarding a mailbox's cache",
			text:
				"Clients should fetch the MAILBOXID for any new mailboxes before discarding cache " +
				"data for any mailbox that is no longer present on the server so that they can detect " +
				"renames and avoid redownloading data.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"Lowercase 'should' — non-normative per RFC 8174, carried at judgment level. The " +
				"recommendation concerns the ORDER of internal cache operations (fetch MAILBOXID for " +
				"new mailboxes before evicting a vanished mailbox's cache, so a rename can be " +
				"detected). Cache eviction ordering is entirely internal to the client and produces " +
				"no wire-observable signature: a client that fetches MAILBOXID at the recommended " +
				"moment and one that fetches it (or never fetches it) at another are " +
				"indistinguishable to a black-box server.",
			notes:
				"Judgment level (lowercase 'should', per RFC 8174). Conditional on the client using " +
				"OBJECTID and maintaining a mailbox cache. No RFC 9051 counterpart.",
		},

		// ── §8.4 Advice to Client Implementers ─────────────────────────────────────

		{
			id: "RFC8474-8.4-1",
			source: "RFC8474",
			section: "8.4",
			title: "Client SHOULD fall back to RFC 3501 guarantees on inconsistent ObjectIDs",
			text:
				"In a case where a client detects inconsistent ObjectID responses from a server, it " +
				"SHOULD fall back to relying on the guarantees of RFC 3501.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Uppercase SHOULD (RFC 2119). Binds the client's error-recovery behavior: on " +
				"detecting a server that returns inconsistent ObjectIDs (e.g. identical ids for " +
				"distinct objects, or an id that changed where the spec says it MUST NOT — see the " +
				"surrounding §8.4 text: 'it is possible that a client will be sent invalid " +
				"information, e.g., identical ObjectIDs or ObjectIDs that have changed where they " +
				"MUST NOT change'), the client should stop trusting ObjectIDs and revert to the " +
				"name+UIDVALIDITY+UID guarantees of RFC 3501. Marked testable in principle (a " +
				"scripted server can emit inconsistent ids and the client's subsequent behavior " +
				"observed) though the observable divergence is coarse; the M4 spec author must judge " +
				"whether the current client exposes any OBJECTID surface to exercise it (likely a " +
				"self-actualizing unimplemented outcome — there is no OBJECTID fetch/cache surface in " +
				"the driver today). No RFC 9051 counterpart.",
		},
		{
			id: "RFC8474-8.4-2",
			source: "RFC8474",
			section: "8.4",
			title: "Client MAY discard its entire cache and resync instead of fine-grained fallback",
			text:
				"For simplicity, a client MAY instead choose to discard its entire cache and resync " +
				"all state from the server.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Uppercase MAY (RFC 2119). A permission, not an obligation: as an alternative to the " +
				"targeted RFC-3501 fallback of RFC8474-8.4-1, the client is permitted to respond to " +
				"detected inconsistency by discarding its whole cache and resyncing. Being a bare " +
				"permission it imposes no wire duty a client can violate; recorded for completeness " +
				"of the §8.4 client-conduct set. The related MUST-not-loop guard is RFC8474-8.4-3. No " +
				"RFC 9051 counterpart.",
		},
		{
			id: "RFC8474-8.4-3",
			source: "RFC8474",
			section: "8.4",
			title: "Client MUST NOT loop forever discarding cache and re-fetching the same data",
			text:
				"Client authors protecting against server misbehavior MUST ensure that their design " +
				"cannot get into an infinite loop of discarding cache and fetching the same data " +
				"repeatedly without user interaction.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Uppercase MUST (RFC 2119). Bounds the RFC8474-8.4-2 discard-and-resync response: a " +
				"client must not let a misbehaving server drive it into an unbounded discard/re-fetch " +
				"loop that never yields to the user. Phrased as a design MUST rather than a per-" +
				"message wire duty, so a black-box observation would require inducing the loop " +
				"condition (a server that keeps emitting inconsistent ObjectIDs) and confirming the " +
				"client eventually stops or defers to the user rather than re-fetching forever — " +
				"testable in principle but bounded by whether the client has any OBJECTID cache " +
				"surface to exercise (self-actualizing unimplemented today). No RFC 9051 counterpart.",
		},
	],
};

export default rfc8474;
