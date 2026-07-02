/**
 * Registry-coverage checklist (design spec §"Registry-coverage checklist").
 *
 * A committed artifact mapping every IANA "IMAP Capabilities" registry entry to
 * a coverage status, so "all supported capabilities" is auditable and no registry
 * entry is silently dropped. Registry:
 *   https://www.iana.org/assignments/imap-capabilities/imap-capabilities.xhtml
 *
 * STUB (Phase 3): seeds only the capabilities whose defining RFC is ALREADY
 * cataloged — the Phase 0/1/2 core (IMAP4rev1, IMAP4rev2, ID) plus the Phase 3
 * connection & security family. Every other registry entry is left as a
 * PENDING block comment below, to be promoted incrementally in Phases 4–6.
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

	// ---- PENDING — Phase 4 (mailbox/listing/metadata + message ops) --------
	// UIDPLUS (RFC 4315), MOVE (RFC 6851), NAMESPACE (RFC 2342),
	// LIST-EXTENDED (RFC 5258), LIST-STATUS (RFC 5819), SPECIAL-USE (RFC 6154),
	// CREATE-SPECIAL-USE (RFC 6154), ACL (RFC 4314), QUOTA / QUOTA=* (RFC 9208/2087),
	// METADATA / METADATA-SERVER (RFC 5464), SAVEDATE (RFC 8514),
	// OBJECTID (RFC 8474), MULTIAPPEND (RFC 3502), CATENATE (RFC 4469),
	// BINARY (RFC 3516), REPLACE (RFC 8508).
	//
	// ---- PENDING — Phase 5 (search/sort/thread + change tracking) ----------
	// CONDSTORE (RFC 7162), QRESYNC (RFC 7162), SORT / SORT=DISPLAY (RFC 5256/5957),
	// THREAD (RFC 5256), ESEARCH (RFC 4731), ESORT (RFC 5267),
	// SEARCHRES (RFC 5182), CONTEXT=SEARCH / CONTEXT=SORT (RFC 5267),
	// FUZZY (RFC 6203), PARTIAL (RFC 9394), IDLE (RFC 2177),
	// NOTIFY (RFC 5465), FILTERS (RFC 5466), WITHIN (RFC 5032).
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
