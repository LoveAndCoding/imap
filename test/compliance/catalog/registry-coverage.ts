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
 * security family, and the Phase 4 mailbox/listing/metadata + message-ops
 * family. Phase 5/6 registry entries remain PENDING block comments below,
 * to be promoted incrementally as their catalogs land.
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

	// ---- PENDING — Phase 5 (search/sort/sync/events) ------------------------
	// Itemized capability → source → surface map (17 tokens, 12 sources).
	// COMMENTS until the Phase 5 wrap promotes them to live `cataloged` entries
	// (promotion requires each module to carry requirements and at least one
	// spec file to cite its testable ids — same pattern as the Phase 4 wrap).
	//
	// CONDSTORE             → RFC7162 — SELECT/EXAMINE ... (CONDSTORE); FETCH ... (CHANGEDSINCE n);
	//                                   STORE ... (UNCHANGEDSINCE n); SEARCH MODSEQ; MODSEQ fetch item;
	//                                   HIGHESTMODSEQ/NOMODSEQ/MODIFIED resp-codes; STATUS HIGHESTMODSEQ.
	//                                   (RFC 7162 obsoletes RFC 4551.)
	// QRESYNC               → RFC7162 — SELECT ... (QRESYNC (uidvalidity modseq [known-uids]));
	//                                   VANISHED / VANISHED (EARLIER) responses; UID FETCH ... (VANISHED).
	//                                   (RFC 7162 obsoletes RFC 5162.)
	// SORT                  → RFC5256 — SORT (crit...) charset keys; UID SORT; * SORT response.
	// SORT=DISPLAY          → RFC5957 — DISPLAYFROM/DISPLAYTO sort criteria.
	// THREAD=ORDEREDSUBJECT → RFC5256 — THREAD ORDEREDSUBJECT charset keys; * THREAD response.
	// THREAD=REFERENCES     → RFC5256 — THREAD REFERENCES charset keys; * THREAD response.
	// ESEARCH               → RFC4731 — SEARCH RETURN (MIN MAX ALL COUNT); * ESEARCH response
	//                                   (rev2-core overlap: RFC 9051 uses the ESEARCH result format
	//                                   for core SEARCH — extraction adjudicates rev1-only tags).
	// ESORT                 → RFC5267 — SORT RETURN (...).
	// CONTEXT=SEARCH        → RFC5267 — SEARCH RETURN (UPDATE/CONTEXT); * ESEARCH ADDTO/REMOVEFROM.
	// CONTEXT=SORT          → RFC5267 — SORT RETURN (UPDATE/CONTEXT); * ESEARCH ADDTO/REMOVEFROM.
	// SEARCHRES             → RFC5182 — SEARCH RETURN (SAVE); '$' marker in seq-set args
	//                                   (rev2-core overlap: RFC 9051 core has SAVE + '$').
	// SEARCH=FUZZY          → RFC6203 — SEARCH FUZZY <key>; RELEVANCY sort/return.
	// PARTIAL               → RFC9394 — SEARCH RETURN (PARTIAL m:n); FETCH ... (PARTIAL m:n) context;
	//                                   * ESEARCH ... PARTIAL acceptance.
	// IDLE                  → RFC2177 — IDLE → + → bare DONE flow
	//                                   (rev2-core overlap: RFC 9051 §6.3.13 folds IDLE into core).
	// NOTIFY                → RFC5465 — NOTIFY SET/NONE (events); unsolicited event streams;
	//                                   * OK [NOTIFICATIONOVERFLOW].
	// FILTERS               → RFC5466 — filter definitions used within NOTIFY/SEARCH.
	// WITHIN                → RFC5032 — SEARCH OLDER n / YOUNGER n
	//                                   (standalone: RFC 9051 did NOT absorb OLDER/YOUNGER —
	//                                   early rev2 drafts had them, dropped before publication;
	//                                   zero occurrences in the published RFC 9051).
	//
	// ---- PENDING — Phase 6 (i18n + misc + vendor + registry completion) ----
	// UTF8=ONLY (RFC 6855), LANGUAGE (RFC 5255), I18NLEVEL=1 / I18NLEVEL=2 (RFC 5255),
	// SMTPUTF8-related, CONVERT (RFC 5259), URLAUTH (RFC 4467),
	// URLAUTH=BINARY (RFC 5524), CATENATE (if not Phase 4), CHILDREN (RFC 3348),
	// CCC / logout policy misc, CREATE-* misc, CONTEXT misc,
	// AUTH=SCRAM-* (RFC 5802/7677), AUTH=EXTERNAL (RFC 4422),
	// AUTH=GSSAPI / AUTH=DIGEST-MD5 (obsoleted — status obsoleted-by),
	// AUTH=ANONYMOUS (RFC 4505), X-GM-EXT-1 (Gmail vendor),
	// LOGIN-REFERRALS (RFC 2221), MAILBOX-REFERRALS (RFC 2193),
	// plus any remaining IANA entries — the Phase 6 task performs the live
	// IANA cross-check and reconciles every outstanding token to a status.
];
