/**
 * Registry-coverage checklist (design spec §"Registry-coverage checklist").
 *
 * A committed artifact mapping every IANA "IMAP Capabilities" registry entry to
 * a coverage status, so "all supported capabilities" is auditable and no registry
 * entry is silently dropped. Registry:
 *   https://www.iana.org/assignments/imap-capabilities/imap-capabilities.xhtml
 *
 * COMPLETE as of the Phase 6 wrap: every token in the committed IANA snapshot
 * (catalog/iana-snapshot.ts) has an entry here with an auditable status —
 * `cataloged` (Phases 0–6 families, each backed by a module with requirements
 * and ≥1 spec file), `no-client-requirements`, `obsoleted-by`, or
 * `out-of-scope` (each with an explanatory note). specs/meta/registry-coverage.test.ts
 * runs the LIVE cross-check: it asserts every snapshot token is covered here,
 * every `cataloged` source resolves to a populated module, and every
 * non-cataloged entry carries a note.
 *
 * MAINTENANCE: refreshing iana-snapshot.ts (re-fetch + diff) is a periodic task;
 * a new IANA token would fail the cross-check until reconciled here. X-GM-EXT-1
 * (Gmail vendor) is cataloged but is NOT an IANA token, so it is not expected in
 * the snapshot. Note the registry now references RFC 9755 (obsoletes RFC 6855)
 * for the UTF8 tokens — see the UTF8=ONLY entry.
 */

export interface RegistryEntry {
	/** IANA capability token, e.g. "STARTTLS", "AUTH=PLAIN", "UIDPLUS". */
	capability: string;
	status: "cataloged" | "no-client-requirements" | "obsoleted-by" | "out-of-scope";
	/** Catalog module source id backing a `cataloged` entry, e.g. "RFC3501". */
	source?: string;
	note?: string;
}

export const registryCoverage: RegistryEntry[] = [
	// ---- Core (Phases 0–2) -------------------------------------------------
	{ capability: "IMAP4rev1", status: "cataloged", source: "RFC3501" },
	{ capability: "IMAP4rev2", status: "cataloged", source: "RFC9051" },
	{ capability: "ID", status: "cataloged", source: "RFC2971" },

	// ---- Phase 3: connection & security family -----------------------------
	{
		capability: "STARTTLS",
		status: "cataloged",
		source: "RFC2595",
		note: "TLS-usage rules in RFC 2595 (and RFC 8314 implicit-TLS BCP); command framing cross-referenced in RFC3501 §6.2.1.",
	},
	{
		capability: "LOGINDISABLED",
		status: "cataloged",
		source: "RFC2595",
		note: "Advertised alongside STARTTLS to force TLS before plaintext AUTH.",
	},
	{ capability: "AUTH=PLAIN", status: "cataloged", source: "RFC4616" },
	{ capability: "AUTH=CRAM-MD5", status: "cataloged", source: "RFC2195" },
	{ capability: "AUTH=OAUTHBEARER", status: "cataloged", source: "RFC7628" },
	{
		capability: "AUTH=XOAUTH2",
		status: "cataloged",
		source: "XOAUTH2",
		note: "Google vendor mechanism (no RFC); SASL framework duties from RFC 4422.",
	},
	{ capability: "SASL-IR", status: "cataloged", source: "RFC4959" },
	{ capability: "ENABLE", status: "cataloged", source: "RFC5161" },
	{ capability: "COMPRESS=DEFLATE", status: "cataloged", source: "RFC4978" },
	{ capability: "UNAUTHENTICATE", status: "cataloged", source: "RFC8437" },
	{ capability: "LITERAL+", status: "cataloged", source: "RFC7888" },
	{ capability: "LITERAL-", status: "cataloged", source: "RFC7888" },
	{ capability: "UTF8=ACCEPT", status: "cataloged", source: "RFC6855" },

	// ---- Phase 4: mailbox/listing/metadata + message operations ------------
	// Promoted from PENDING at the Phase 4 wrap: each module now carries
	// requirements (catalog/ext/rfc*.ts) and at least one spec file cites its
	// testable ids.
	{
		capability: "UIDPLUS",
		status: "cataloged",
		source: "RFC4315",
		note: "UID EXPUNGE; APPENDUID/COPYUID/UIDNOTSTICKY resp-codes (resp-codes parse for real via text.code.ts).",
	},
	{ capability: "MOVE", status: "cataloged", source: "RFC6851", note: "MOVE, UID MOVE." },
	{
		capability: "NAMESPACE",
		status: "cataloged",
		source: "RFC2342",
		note: "NAMESPACE cmd + * NAMESPACE response (response parses for real via namespace.ts).",
	},
	{
		capability: "LIST-EXTENDED",
		status: "cataloged",
		source: "RFC5258",
		note: "LIST selection/return options, multiple patterns. Mostly rev1-only (rev2 core absorbed it).",
	},
	{
		capability: "LIST-STATUS",
		status: "cataloged",
		source: "RFC5819",
		note: "LIST ... RETURN (STATUS (...)).",
	},
	{
		capability: "SPECIAL-USE",
		status: "cataloged",
		source: "RFC6154",
		note: "Special-use attributes; LIST ... RETURN (SPECIAL-USE).",
	},
	{
		capability: "CREATE-SPECIAL-USE",
		status: "cataloged",
		source: "RFC6154",
		note: "CREATE ... (USE (...)); [USEATTR] refusal code.",
	},
	{
		capability: "ACL",
		status: "cataloged",
		source: "RFC4314",
		note: "SETACL/DELETEACL/GETACL/LISTRIGHTS/MYRIGHTS; ACL/MYRIGHTS/LISTRIGHTS responses.",
	},
	{
		capability: "QUOTA",
		status: "cataloged",
		source: "RFC9208",
		note: "GETQUOTA/GETQUOTAROOT/SETQUOTA; QUOTA/QUOTAROOT responses parse for real (quota.ts). Obsoletes RFC 2087.",
	},
	{
		capability: "QUOTA=RES-*",
		status: "cataloged",
		source: "RFC9208",
		note: "Per-resource capability tokens (STORAGE, MESSAGE, ...) defined by RFC 9208.",
	},
	{
		capability: "METADATA",
		status: "cataloged",
		source: "RFC5464",
		note: "GETMETADATA/SETMETADATA (mailbox annotations); METADATA response.",
	},
	{
		capability: "METADATA-SERVER",
		status: "cataloged",
		source: "RFC5464",
		note: "GETMETADATA/SETMETADATA server-entry variant.",
	},
	{
		capability: "SAVEDATE",
		status: "cataloged",
		source: "RFC8514",
		note: "FETCH SAVEDATE; SAVEDATE fetch item; SAVEDBEFORE/ON/SINCE + SAVEDATESUPPORTED search keys.",
	},
	{
		capability: "OBJECTID",
		status: "cataloged",
		source: "RFC8474",
		note: "FETCH EMAILID/THREADID; MAILBOXID resp-code (parses for real) + STATUS MAILBOXID.",
	},
	{
		capability: "MULTIAPPEND",
		status: "cataloged",
		source: "RFC3502",
		note: "APPEND with multiple message literals.",
	},
	{
		capability: "CATENATE",
		status: "cataloged",
		source: "RFC4469",
		note: 'APPEND ... CATENATE (TEXT {n} URL "..."); BADURL/TOOBIG resp-codes parse for real.',
	},
	{
		capability: "BINARY",
		status: "cataloged",
		source: "RFC3516",
		note: "FETCH BINARY[]/BINARY.SIZE[]; APPEND ~{n} literal8; UNKNOWN-CTE resp-code parses for real. literal8 duties rev1-only (rev2 core).",
	},
	{ capability: "REPLACE", status: "cataloged", source: "RFC8508", note: "REPLACE, UID REPLACE." },

	// ---- Phase 5: search/sort/sync/events -----------------------------------
	// Promoted from PENDING at the Phase 5 wrap: each module carries
	// requirements and at least one spec file cites its testable ids.
	{
		capability: "CONDSTORE",
		status: "cataloged",
		source: "RFC7162",
		note: "SELECT (CONDSTORE); FETCH (CHANGEDSINCE n); STORE (UNCHANGEDSINCE n); SEARCH MODSEQ. MODSEQ fetch item + HIGHESTMODSEQ/NOMODSEQ/MODIFIED codes + STATUS HIGHESTMODSEQ parse for real. Obsoletes RFC 4551.",
	},
	{
		capability: "QRESYNC",
		status: "cataloged",
		source: "RFC7162",
		note: "SELECT (QRESYNC (...)); VANISHED responses (client cannot accept them today — measured violations); UID FETCH (VANISHED). Obsoletes RFC 5162.",
	},
	{
		capability: "SORT",
		status: "cataloged",
		source: "RFC5256",
		note: "SORT (crit...) charset keys; UID SORT; * SORT response.",
	},
	{
		capability: "SORT=DISPLAY",
		status: "cataloged",
		source: "RFC5957",
		note: "DISPLAYFROM/DISPLAYTO sort criteria.",
	},
	{
		capability: "THREAD=ORDEREDSUBJECT",
		status: "cataloged",
		source: "RFC5256",
		note: "THREAD ORDEREDSUBJECT charset keys; * THREAD response.",
	},
	{
		capability: "THREAD=REFERENCES",
		status: "cataloged",
		source: "RFC5256",
		note: "THREAD REFERENCES charset keys; * THREAD response.",
	},
	{
		capability: "ESEARCH",
		status: "cataloged",
		source: "RFC4731",
		note: "SEARCH RETURN (MIN MAX ALL COUNT); * ESEARCH parses for real (mailbox/search.ts). rev2-core overlap: RFC 9051 uses the ESEARCH result format for core SEARCH — rev1-only tags adjudicated in-catalog.",
	},
	{ capability: "ESORT", status: "cataloged", source: "RFC5267", note: "SORT RETURN (...)." },
	{
		capability: "CONTEXT=SEARCH",
		status: "cataloged",
		source: "RFC5267",
		note: "SEARCH RETURN (UPDATE/CONTEXT); * ESEARCH ADDTO/REMOVEFROM (two-ADDTO Map-clobber measured as a violation).",
	},
	{
		capability: "CONTEXT=SORT",
		status: "cataloged",
		source: "RFC5267",
		note: "SORT RETURN (UPDATE/CONTEXT); * ESEARCH ADDTO/REMOVEFROM.",
	},
	{
		capability: "SEARCHRES",
		status: "cataloged",
		source: "RFC5182",
		note: "SEARCH RETURN (SAVE); '$' in seq-set args. rev2-core overlap: RFC 9051 core has SAVE + '$' — rev1-only tags adjudicated in-catalog.",
	},
	{
		capability: "SEARCH=FUZZY",
		status: "cataloged",
		source: "RFC6203",
		note: "SEARCH FUZZY <key>; RELEVANCY sort/return.",
	},
	{
		capability: "PARTIAL",
		status: "cataloged",
		source: "RFC9394",
		note: "SEARCH RETURN (PARTIAL m:n); * ESEARCH PARTIAL pair parses for real.",
	},
	{
		capability: "IDLE",
		status: "cataloged",
		source: "RFC2177",
		note: "IDLE / continuation / bare DONE flow. rev2-core overlap: RFC 9051 §6.3.13 folds IDLE into core — rev1-only tags adjudicated in-catalog.",
	},
	{
		capability: "NOTIFY",
		status: "cataloged",
		source: "RFC5465",
		note: "NOTIFY SET/NONE (events); unsolicited event streams parse for real; [NOTIFICATIONOVERFLOW]/[BADEVENT] accepted.",
	},
	{
		capability: "FILTERS",
		status: "cataloged",
		source: "RFC5466",
		note:
			"FILTER search key + METADATA-stored definitions; [UNDEFINED-FILTER] kind accepted and its " +
			"bare filter-name argument is preserved (AtomTextCode's bare-vs-parenthesized split, fixed " +
			"pre-M4.14, already covers this shape) -- M4.14 additionally gives it a dedicated typed " +
			"TypedResponseCode variant (response-codes.ts/collector.ts) instead of the generic {name, " +
			"args} fallback. SearchCriteria.filter (commands/search-criteria.ts, gated on FILTERS) and " +
			"filter creation/management via the real METADATA facet's setmetadata() (RFC 5464 SETMETADATA " +
			"under /private|/shared/filters/*) landed at M5.4 -- the option-(b) carry-forward from " +
			"M4.14, docs/compliance-adjudications.md, closing all four previously-unimplemented rows " +
			"(RFC5466-3.1-1, -3.2-1, -3.2-2, -4-1).",
	},
	{
		capability: "WITHIN",
		status: "cataloged",
		source: "RFC5032",
		note: "SEARCH OLDER n / YOUNGER n. Standalone: RFC 9051 did NOT absorb OLDER/YOUNGER (early rev2 drafts had them, dropped before publication; zero occurrences in the published RFC).",
	},

	// ---- Phase 6 reconciliation: registry-prefix/family rows -----------------
	// The live IANA registry lists these as bare family/prefix rows (ending in
	// "=") rather than per-mechanism/per-item tokens. This suite has always
	// cataloged the SPECIFIC mechanism/item (see AUTH=PLAIN et al. above,
	// QUOTA=RES-* above, THREAD=ORDEREDSUBJECT/REFERENCES above) rather than the
	// bare family row, since the specific tokens are what a server actually
	// advertises verbatim and what a client actually parses. Each bare row
	// below gets its own reconciliation entry (so the live cross-check has
	// something to find for every snapshot token) that cross-references its
	// already-cataloged children rather than re-scoring the same requirements.
	{
		capability: "AUTH=",
		status: "no-client-requirements",
		note:
			"Registry prefix-family row: RFC 3501/RFC 9051 define the AUTH= capability-prefix " +
			"construct itself (a capability namespace for advertising SASL mechanisms), not a " +
			"literal capability a server sends verbatim. Concrete mechanisms are cataloged " +
			"individually: AUTH=PLAIN, AUTH=CRAM-MD5, AUTH=OAUTHBEARER, AUTH=XOAUTH2 (Phase 3); " +
			"AUTH=SCRAM-SHA-1, AUTH=SCRAM-SHA-256, AUTH=ANONYMOUS, AUTH=EXTERNAL (Phase 6, see " +
			"PENDING block below); AUTH=GSSAPI/AUTH=DIGEST-MD5 (obsoleted, see entries below).",
	},
	{
		capability: "QUOTA=",
		status: "no-client-requirements",
		note:
			"Registry prefix-family row for the QUOTA=RES-* per-resource-type capability tokens " +
			"(RFC 9208 §4.3); the specific wildcard family is already cataloged above as " +
			"'QUOTA=RES-*' (source RFC9208). The bare 'QUOTA=' row itself names no additional " +
			"client-observable duty beyond what QUOTA and QUOTA=RES-* already cover.",
	},
	{
		capability: "RIGHTS=",
		status: "no-client-requirements",
		note:
			"Registry prefix-family row for RFC 4314's rights-vocabulary capability (advertises " +
			"which ACL right identifiers the server supports, e.g. RIGHTS=texk). Already covered " +
			"functionally by the ACL entry above (source RFC4314) — a client's handling of the " +
			"RIGHTS= argument is part of the same ACL/rights-string parsing duties cataloged there, " +
			"not a distinct requirement family.",
	},
	{
		capability: "THREAD",
		status: "cataloged",
		source: "RFC5256",
		note:
			"Registry row is the bare capability; per-algorithm client duties are already split " +
			"into the THREAD=ORDEREDSUBJECT and THREAD=REFERENCES entries above (same source " +
			"module, RFC5256) — no separate 'THREAD' requirements exist beyond those two.",
	},
	{
		capability: "QUOTASET",
		status: "cataloged",
		source: "RFC9208",
		note:
			"RFC 9208's SETQUOTA-availability gate capability; already covered by the QUOTA entry " +
			"above (source RFC9208, which extracts the QUOTASET-gated SETQUOTA/OVERQUOTA duties).",
	},
	{
		capability: "IMAPSIEVE=",
		status: "no-client-requirements",
		note:
			"RFC 6785 defines when SERVERS invoke Sieve filtering on APPEND/COPY/flag-change " +
			"events; per the RFC's own scope, it 'introduces no new IMAP commands or server " +
			"responses visible to clients' — the imapsieve capability string is advertised but " +
			"binds no client-observable IMAP wire behavior.",
	},

	// ---- Phase 6 reconciliation: no client-observable IMAP duty --------------
	{
		capability: "JMAPACCESS",
		status: "no-client-requirements",
		note:
			"RFC 9698 lets a client optionally issue GETJMAPACCESS to learn a JMAP session URL for " +
			"the same mailstore; per the RFC, this 'does not affect message lifetime' and imposes " +
			"'no mandatory client behavior... beyond recognizing the capability' — a client that " +
			"never issues GETJMAPACCESS remains fully IMAP-compliant. The bridged JMAP protocol " +
			"itself is out of this suite's IMAP scope regardless.",
	},

	// ---- Phase 6 reconciliation: obsoleted / deprecated -----------------------
	{
		capability: "AUTH=GSSAPI",
		status: "obsoleted-by",
		note:
			"Not a live IANA registry row (the modern registry only lists the generic AUTH= " +
			"family); named in the design's Phase 6 scope note as a legacy mechanism. GSSAPI " +
			"SASL binding is effectively superseded by TLS-based/modern mechanisms in current " +
			"deployment guidance; no catalog — obsoleted-by: prefer AUTH=EXTERNAL or " +
			"AUTH=SCRAM-* (RFC 5802/7677) over Kerberos/GSSAPI in new clients.",
	},
	{
		capability: "AUTH=DIGEST-MD5",
		status: "obsoleted-by",
		note:
			"Not a live IANA registry row. RFC 6331 formally moves DIGEST-MD5 SASL to Historic " +
			"status ('Moving DIGEST-MD5 to Historic') due to documented security weaknesses; " +
			"obsoleted-by: AUTH=SCRAM-SHA-1 / AUTH=SCRAM-SHA-256 (RFC 5802/7677).",
	},
	{
		capability: "UTF8=ALL (OBSOLETE)",
		status: "obsoleted-by",
		note:
			"Registry marks this OBSOLETE outright (from the experimental RFC 5738 draft). " +
			"obsoleted-by: UTF8=ACCEPT (RFC 9755, which itself obsoletes RFC 6855).",
	},
	{
		capability: "UTF8=APPEND (OBSOLETE)",
		status: "obsoleted-by",
		note:
			"Registry marks this OBSOLETE outright (experimental RFC 5738). RFC 9755 (the current " +
			"UTF8=ACCEPT/UTF8=ONLY document) explicitly removes APPEND's UTF8 data item entirely " +
			"('only one IMAP client used the feature, and it did so incorrectly'). obsoleted-by: " +
			"plain APPEND (no UTF8 data item) under RFC 9755/IMAP4rev2.",
	},
	{
		capability: "UTF8=USER (OBSOLETE)",
		status: "obsoleted-by",
		note:
			"Registry marks this OBSOLETE outright (experimental RFC 5738). obsoleted-by: " +
			"UTF8=ACCEPT (RFC 9755).",
	},

	// ---- Phase 6 reconciliation: out of scope ---------------------------------
	{
		capability: "ANNOTATE-EXPERIMENT-1",
		status: "out-of-scope",
		note:
			"RFC 5257 is Experimental status ('may change in an incompatible manner going to " +
			"Proposed Standard'); the 2026-06-11 design doc's spec-inventory prose named it for " +
			"'minimal catalog' treatment, but the Phase 6 implementation plan's authoritative scope " +
			"table (the task spec actually executed) does not include it among the 11 Phase 6 " +
			"catalog sources. Documented discrepancy: left out-of-scope for the suite rather than " +
			"silently adding an unplanned 12th source; a future phase could add it if desired.",
	},
	{
		capability: "UIDBATCHES",
		status: "out-of-scope",
		note:
			"Reference is an Internet-Draft (draft-ietf-mailmaint-imap-uidbatches-22), not a " +
			"published RFC — 'Submitted to IESG for Publication' / 'In Progress' at the RFC Editor " +
			"as of the snapshot date. Consistent with the suite's RFC-only scope; out-of-scope " +
			"until published (a dead-draft-shaped exclusion, same class as CONVERT-adjacent drafts " +
			"noted in the Phase 6 plan).",
	},

	// ---- Phase 6 reconciliation: borderline (documented judgment, no catalog) -
	{
		capability: "LIST-METADATA",
		status: "out-of-scope",
		note:
			"BORDERLINE JUDGMENT: RFC 9590 adds a METADATA return option to LIST (client requests " +
			"mailbox annotations inline with LIST, avoiding per-mailbox GETMETADATA) — real " +
			"client-binding duties in the same shape as the already-cataloged LIST-STATUS/" +
			"LIST-MYRIGHTS pattern. Not among the plan's five named delta candidates; deferred per " +
			"the conservative default rather than expanding this phase's bounded delta round.",
	},
	{
		capability: "MULTISEARCH",
		status: "out-of-scope",
		note:
			"BORDERLINE JUDGMENT: RFC 7377 defines a client-issuable cross-mailbox ESEARCH command " +
			"— real client-binding duties, but a larger extraction surface (MAILBOX/UIDVALIDITY/TAG " +
			"response fields, per-mailbox result correlation) than the plan's five named delta " +
			"candidates. Deferred per the conservative default rather than expanding the bounded " +
			"delta round; a future phase's extraction candidate.",
	},
	{
		capability: "MESSAGELIMIT=",
		status: "out-of-scope",
		note:
			"BORDERLINE JUDGMENT: RFC 9738 parallels APPENDLIMIT in spirit (advertises a per-command " +
			"message-count limit for FETCH/SEARCH/STORE/COPY/MOVE) but the RFC itself treats client " +
			"observance as explicitly optional/best-effort ('does not mandate this as a formal " +
			"requirement'), weaker than APPENDLIMIT's clearer client-checking duty. Not among the " +
			"plan's five named candidates; deferred per the conservative default.",
	},
	{
		capability: "SAVELIMIT=",
		status: "out-of-scope",
		note:
			"BORDERLINE JUDGMENT: RFC 9738 companion token to MESSAGELIMIT= (advertises a limit on " +
			"the number of messages a single APPEND/COPY/MOVE may create in the destination via " +
			"multi-message forms); same explicitly-optional client-observance framing as " +
			"MESSAGELIMIT=. Deferred for the same reason, not among the plan's five named candidates.",
	},
	{
		capability: "URL-PARTIAL",
		status: "out-of-scope",
		note:
			"BORDERLINE JUDGMENT: registry reference RFC 5550 is the broad 'Lemonade' mobile-mail " +
			"profile document (bundles submission-port policy, message-size declarations, URLAUTH/" +
			"BURL token handling, Sieve $Forwarded, Format=Flowed, etc.), not a focused single-" +
			"purpose extension RFC — extracting URL-PARTIAL cleanly would require scoping out one " +
			"narrow slice of a much larger profile document. Not among the plan's five named " +
			"candidates; deferred rather than opening a disproportionately large source for one " +
			"token.",
	},

	// ---- Phase 6: i18n + misc + vendor (promoted from PENDING at the wrap;
	// each module carries requirements and ≥1 spec file cites its testable ids) --
	{
		capability: "LANGUAGE",
		status: "cataloged",
		source: "RFC5255",
		note: "LANGUAGE command + * LANGUAGE response; localized text. * LANGUAGE untagged response has no parser handler (stream-death measured).",
	},
	{
		capability: "I18NLEVEL=1",
		status: "cataloged",
		source: "RFC5255",
		note: "i;unicode-casemap default comparator; no client negotiation surface (RFC 5255 §4.3).",
	},
	{
		capability: "I18NLEVEL=2",
		status: "cataloged",
		source: "RFC5255",
		note: "COMPARATOR command/response + [BADCOMPARATOR]; comparator scoping over SEARCH/SORT/THREAD.",
	},
	{
		capability: "CONVERT",
		status: "cataloged",
		source: "RFC5259",
		note: "CONVERT/UID CONVERT; * CONVERTED response (no parser handler — stream-death); TEMPFAIL/MAXCONVERT* resp-codes (bare-arg dropped).",
	},
	{
		capability: "URLAUTH",
		status: "cataloged",
		source: "RFC4467",
		note: "GENURLAUTH/URLFETCH/RESETKEY; URLMECH resp-code parses for real. M5.5: * GENURLAUTH/* URLFETCH untagged responses now have a real parser handler (src/parser/structure/urlauth.ts) -- no longer a stream-death.",
	},
	{
		capability: "URLAUTH=BINARY",
		status: "cataloged",
		source: "RFC5524",
		note: "Extended URLFETCH BINARY/BODYPARTSTRUCTURE/BODY parameters; literal8/nstring/NIL framing.",
	},
	{
		capability: "CHILDREN",
		status: "cataloged",
		source: "RFC3348",
		note: "\\HasChildren/\\HasNoChildren acceptance (parses for real). rev1-only: rev2 core (RFC 9051 §7.3.1) + RFC 5258 own the overlapping duties — adjudicated in-catalog.",
	},
	{
		capability: "AUTH=SCRAM-SHA-1",
		status: "cataloged",
		source: "RFC5802",
		note: "SCRAM client-first/final message encodings, ServerSignature verification, channel-binding gs2 flags. Self-actualizing (no AUTHENTICATE surface).",
	},
	{
		capability: "AUTH=SCRAM-SHA-256",
		status: "cataloged",
		source: "RFC7677",
		note: "SHA-256 + iteration-count deltas over RFC 5802; -PLUS session-hash rule. Cross-refs RFC5802 ids.",
	},
	{
		capability: "AUTH=ANONYMOUS",
		status: "cataloged",
		source: "RFC4505",
		note: "Single trace message (token/email, UTF-8, ≤255 chars, no NUL), base64.",
	},
	{
		capability: "AUTH=EXTERNAL",
		status: "cataloged",
		source: "RFC4422",
		note: "SASL EXTERNAL (RFC 4422 Appendix A): empty vs authzid-bearing initial response, single-message exchange.",
	},
	{
		capability: "LOGIN-REFERRALS",
		status: "cataloged",
		source: "RFC2221",
		note: "[REFERRAL imap://...] in tagged NO/OK + untagged BYE. Kind parses for real; bare URL argument dropped (AtomTextCode defect, measured violation).",
	},
	{
		capability: "MAILBOX-REFERRALS",
		status: "cataloged",
		source: "RFC2193",
		note: "[REFERRAL ...] on SELECT/etc.; RLIST/RLSUB command forms. Kind parses (incl. non-IMAP URL schemes); bare URL argument dropped (measured violation).",
	},
	{
		capability: "X-GM-EXT-1",
		status: "cataloged",
		source: "X-GM-EXT-1",
		note: "Gmail vendor extensions (no RFC; cataloged from the Google Developers page): X-GM-MSGID/THRID/LABELS fetch+STORE, X-GM-RAW search. NOT an IANA registry token — excluded from the live cross-check.",
	},
	{
		capability: "UTF8=ONLY",
		status: "cataloged",
		source: "RFC6855",
		note: "Client UTF-8 duties live in ext/rfc6855.ts (Phase 3). MAINTENANCE: the live registry now references RFC 9755 (obsoletes RFC 6855; removes APPEND's UTF8 data item, relaxes BODYSTRUCTURE handling) — a future pass should re-verify rfc6855.ts quotes against RFC 9755.",
	},

	// ---- Phase 6 reconciliation-delta sources (bounded round) -----------------
	{
		capability: "APPENDLIMIT",
		status: "cataloged",
		source: "RFC7889",
		note: "APPENDLIMIT / APPENDLIMIT=n capability parsing (bare vs valued forms distinguished for real via capability map); [TOOBIG] handling.",
	},
	{
		capability: "STATUS=SIZE",
		status: "cataloged",
		source: "RFC8438",
		note: "STATUS (SIZE) + * STATUS (SIZE n) 63-bit acceptance. Dual-profile: rev2 folds the SIZE caution (RFC9051-6.3.11-3) but not the wire vocabulary.",
	},
	{
		capability: "LIST-MYRIGHTS",
		status: "cataloged",
		source: "RFC8440",
		note: "LIST ... RETURN (MYRIGHTS) + interleaved * MYRIGHTS (cross-refs RFC4314's MYRIGHTS parsing).",
	},
	{
		capability: "PREVIEW",
		status: "cataloged",
		source: "RFC8970",
		note: "FETCH (PREVIEW [LAZY]) + * FETCH (PREVIEW ...) string/empty/NIL forms.",
	},
	{
		capability: "INPROGRESS",
		status: "cataloged",
		source: "RFC9585",
		note: "* OK [INPROGRESS (tag current goal)] acceptance — parenthesized arg parses for real; resp-code kind is NOT case-folded (measured violation).",
	},

	// ---- M2 (modern-API milestone 2) suite growth ------------------------------
	// Promoted from the Phase 6 out-of-scope borderline block above by M2.12.
	{
		capability: "UNSELECT",
		status: "cataloged",
		source: "RFC3691",
		note:
			"UNSELECT (deselect without expunging \\Deleted; contrast CLOSE). Promoted from this " +
			"list's Phase 6 out-of-scope borderline judgment by M2.12 (modern-API M2 mailbox-" +
			"management milestone): full extraction in catalog/ext/rfc3691.ts, spec coverage in " +
			"specs/ext/unselect-3691.test.ts. rev2-core overlap: RFC 9051 §6.4.2 absorbs UNSELECT " +
			"into the rev2 base spec — rev1-only tags adjudicated in-catalog.",
	},

	// ---- M5 (modern-API milestone 5) suite growth ------------------------------
	// Promoted from the Phase 6 out-of-scope borderline block above by M5.14.
	{
		capability: "UIDONLY",
		status: "cataloged",
		source: "RFC9586",
		note:
			"UIDONLY (client-requested mode: ENABLE UIDONLY, then message sequence numbers are " +
			"forbidden on the wire; UIDFETCH/VANISHED replace FETCH/EXPUNGE; BAD [UIDREQUIRED] " +
			"on a sequence-numbered command post-enable). Promoted from this list's Phase 6 " +
			"out-of-scope borderline judgment by M5.14 (modern-API M5 extension-families " +
			"milestone's catalog-extraction task): full extraction in catalog/ext/rfc9586.ts, " +
			"spec coverage in specs/ext/uidonly-9586.test.ts. Primary-source fetch was blocked " +
			"this session (see catalog/ext/rfc9586.ts's extractionNote) — every requirement's " +
			"quoted text is reconstructed from model training knowledge, NOT mechanically " +
			"verified, and flagged accordingly; re-verify before M6. Both profiles: unlike " +
			"UNSELECT/RFC 3691, this document is not absorbed into (and postdates) RFC 9051 " +
			"core, so no rev1/rev2 split is adjudicated in-catalog — every row applies to both.",
	},
];
