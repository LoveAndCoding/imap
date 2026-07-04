/**
 * Registry-coverage checklist (design spec §"Registry-coverage checklist").
 *
 * A committed artifact mapping every IANA "IMAP Capabilities" registry entry to
 * a coverage status, so "all supported capabilities" is auditable and no registry
 * entry is silently dropped. Registry:
 *   https://www.iana.org/assignments/imap-capabilities/imap-capabilities.xhtml
 *
 * Seeds every capability whose defining RFC is ALREADY cataloged — the
 * Phase 0/1/2 core (IMAP4rev1, IMAP4rev2, ID), the Phase 3 connection &
 * security family, the Phase 4 mailbox/listing/metadata + message-ops
 * family, and the Phase 5 search/sort/sync/events family. Phase 6 registry
 * entries remain a PENDING block comment below, to be promoted when that
 * catalog lands (Phase 6 also performs the live IANA cross-check).
 *
 * The `source` on each `cataloged` entry MUST name a module present in
 * `allCatalogModules` (enforced by specs/meta/registry-coverage.test.ts). The
 * live IANA cross-check (that every registry entry appears here) is deferred to
 * the Phase 6 completion task; today the meta-test asserts internal consistency
 * only — see that test's header for the documented rationale.
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
		note: "FILTER search key + METADATA-stored definitions; [UNDEFINED-FILTER] kind accepted but its bare argument is dropped (measured violation).",
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
		capability: "UIDONLY",
		status: "out-of-scope",
		note:
			"BORDERLINE JUDGMENT: RFC 9586 defines a genuine client-requested mode shift (ENABLE " +
			"UIDONLY; thereafter the client MUST NOT use sequence numbers at all, and servers " +
			"return UIDFETCH/VANISHED instead of FETCH/EXPUNGE) — real client-binding duties exist. " +
			"Not among the Phase 6 plan's five named reconciliation-delta candidates (APPENDLIMIT/" +
			"STATUS=SIZE/LIST-MYRIGHTS/PREVIEW/INPROGRESS); per the plan's instruction to default " +
			"borderline tokens to a documented status rather than expand the bounded delta round, " +
			"deferred rather than cataloged now. Strong candidate for a future phase's extraction.",
	},
	{
		capability: "UNSELECT",
		status: "out-of-scope",
		note:
			"BORDERLINE JUDGMENT: RFC 3691 defines a small, genuinely client-issuable UNSELECT " +
			"command (close the selected mailbox without expunging \\Deleted messages) — real but " +
			"narrow client-binding duties. Not among the plan's five named delta candidates; " +
			"deferred per the same conservative default as UIDONLY rather than expanding this " +
			"phase's bounded delta round. Straightforward candidate for a future phase.",
	},
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

	// ---- PENDING — Phase 6 scope-table tokens (promoted to `cataloged` at the
	// wrap, once each module carries requirements and a spec file cites them —
	// same has-requirements rule as prior phases; skeletons already registered
	// in catalog/index.ts) ----------------------------------------------------
	// UTF8=ONLY (RFC 9755, which obsoletes RFC 6855 — client duties already
	//   live in ext/rfc6855.ts from Phase 3; RFC 9755 also removes APPEND's
	//   UTF8 data item and relaxes BODYSTRUCTURE message/global handling
	//   relative to RFC 6855 — a future phase should re-verify rfc6855.ts's
	//   quotes against RFC 9755's current text; registry-entry-only for now
	//   per this task's instructions, no new catalog),
	// LANGUAGE / I18NLEVEL=1 / I18NLEVEL=2 (RFC 5255),
	// CONVERT (RFC 5259),
	// URLAUTH (RFC 4467), URLAUTH=BINARY (RFC 5524),
	// CHILDREN (RFC 3348),
	// AUTH=SCRAM-SHA-1 (RFC 5802), AUTH=SCRAM-SHA-256 (RFC 7677),
	// AUTH=ANONYMOUS (RFC 4505), AUTH=EXTERNAL (extends ext/rfc4422.ts),
	// LOGIN-REFERRALS (RFC 2221), MAILBOX-REFERRALS (RFC 2193),
	// X-GM-EXT-1 (Gmail vendor extensions; not an IANA registry token — no
	//   snapshot entry expected, catalogued via the design's Vendor family).
	//
	// ---- Phase 6 reconciliation-delta sources (bounded round; genuine
	// client-binding duties confirmed via RFC-abstract review) — skeletons
	// registered in catalog/index.ts, JOIN the Task 4 extraction alongside the
	// scope-table tokens above ---------------------------------------------
	// APPENDLIMIT (RFC 7889) — client SHOULD parse mailbox/global APPENDLIMIT
	//   and avoid oversized APPEND/non-synchronizing-literal use.
	// STATUS=SIZE (RFC 8438) — client requests STATUS SIZE, MUST accept 63-bit
	//   values.
	// LIST-MYRIGHTS (RFC 8440) — client requests LIST RETURN (MYRIGHTS), parses
	//   the untagged MYRIGHTS response and its ordering/absence rules.
	// PREVIEW (RFC 8970) — client requests FETCH (PREVIEW [LAZY]), parses the
	//   string/empty-string/NIL response forms.
	// INPROGRESS (RFC 9585) — client accepts/guards the untagged INPROGRESS
	//   response code during long-running commands.
];
