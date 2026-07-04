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
