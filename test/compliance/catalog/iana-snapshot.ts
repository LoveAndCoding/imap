/**
 * IANA "IMAP Capabilities" registry snapshot.
 *
 * Fetched: 2026-07-04, from:
 *   https://www.iana.org/assignments/imap-capabilities/imap-capabilities-1.csv
 * (cross-checked against the human-readable registry page,
 *   https://www.iana.org/assignments/imap-capabilities/imap-capabilities.xhtml
 * — same 78 rows, same references, as of the fetch date above.)
 *
 * This is a DATED, COMMITTED SNAPSHOT — not a live query. `token` is the
 * verbatim "Capability Name" column (including any "(OBSOLETE)" suffix the
 * registry itself carries); `reference` is the verbatim "Reference" column
 * (joined with "; " when the registry lists more than one reference for a
 * single token, e.g. multiple RFCs or an RFC Errata).
 *
 * Refreshing this snapshot (re-fetching and diffing against
 * `registry-coverage.ts`) is a maintenance task — see that file's header.
 * The IMAP Quota Resource Types sub-registry (STORAGE/MESSAGE/MAILBOX/
 * ANNOTATION-STORAGE) on the same IANA page is a DIFFERENT registry (quota
 * resource names, not capability tokens) and is intentionally out of scope
 * for this snapshot.
 */

export interface IanaImapCapability {
	/** Verbatim "Capability Name" column, including any "(OBSOLETE)" suffix. */
	token: string;
	/** Verbatim "Reference" column; multiple references joined with "; ". */
	reference: string;
}

export const ianaImapCapabilities: IanaImapCapability[] = [
	{ token: "ACL", reference: "RFC4314" },
	{ token: "ANNOTATE-EXPERIMENT-1", reference: "RFC5257" },
	{ token: "APPENDLIMIT", reference: "RFC7889" },
	{ token: "AUTH=", reference: "RFC3501; RFC9051" },
	{ token: "BINARY", reference: "RFC3516" },
	{ token: "CATENATE", reference: "RFC4469" },
	{ token: "CHILDREN", reference: "RFC3348" },
	{ token: "COMPRESS=DEFLATE", reference: "RFC4978" },
	{ token: "CONDSTORE", reference: "RFC7162" },
	{ token: "CONTEXT=SEARCH", reference: "RFC5267" },
	{ token: "CONTEXT=SORT", reference: "RFC5267" },
	{ token: "CONVERT", reference: "RFC5259" },
	{ token: "CREATE-SPECIAL-USE", reference: "RFC6154" },
	{ token: "ENABLE", reference: "RFC5161" },
	{ token: "ESEARCH", reference: "RFC4731" },
	{ token: "ESORT", reference: "RFC5267" },
	{ token: "FILTERS", reference: "RFC5466" },
	{ token: "I18NLEVEL=1", reference: "RFC5255" },
	{ token: "I18NLEVEL=2", reference: "RFC5255" },
	{ token: "ID", reference: "RFC2971" },
	{ token: "IDLE", reference: "RFC2177" },
	{ token: "IMAP4REV1", reference: "RFC3501" },
	{ token: "IMAP4REV2", reference: "RFC9051" },
	{ token: "IMAPSIEVE=", reference: "RFC6785" },
	{ token: "INPROGRESS", reference: "RFC9585" },
	{ token: "JMAPACCESS", reference: "RFC9698" },
	{ token: "LANGUAGE", reference: "RFC5255" },
	{ token: "LIST-EXTENDED", reference: "RFC5258" },
	{ token: "LIST-METADATA", reference: "RFC9590" },
	{ token: "LIST-MYRIGHTS", reference: "RFC8440" },
	{ token: "LIST-STATUS", reference: "RFC5819" },
	{ token: "LITERAL+", reference: "RFC7888" },
	{ token: "LITERAL-", reference: "RFC7888" },
	{ token: "LOGIN-REFERRALS", reference: "RFC2221" },
	{ token: "LOGINDISABLED", reference: "RFC3501; RFC9051" },
	{ token: "MAILBOX-REFERRALS", reference: "RFC2193" },
	{ token: "MESSAGELIMIT=", reference: "RFC9738" },
	{ token: "METADATA", reference: "RFC5464" },
	{ token: "METADATA-SERVER", reference: "RFC5464" },
	{ token: "MOVE", reference: "RFC6851" },
	{ token: "MULTIAPPEND", reference: "RFC3502" },
	{ token: "MULTISEARCH", reference: "RFC7377" },
	{ token: "NAMESPACE", reference: "RFC2342" },
	{ token: "NOTIFY", reference: "RFC5465" },
	{ token: "OBJECTID", reference: "RFC8474" },
	{ token: "PARTIAL", reference: "RFC9394" },
	{ token: "PREVIEW", reference: "RFC8970" },
	{ token: "QRESYNC", reference: "RFC7162" },
	{ token: "QUOTA", reference: "RFC9208" },
	{ token: "QUOTA=", reference: "RFC9208" },
	{ token: "QUOTASET", reference: "RFC9208" },
	{ token: "REPLACE", reference: "RFC8508" },
	{ token: "RIGHTS=", reference: "RFC4314" },
	{ token: "SASL-IR", reference: "RFC4959" },
	{ token: "SAVEDATE", reference: "RFC8514" },
	{ token: "SAVELIMIT=", reference: "RFC9738" },
	{ token: "SEARCH=FUZZY", reference: "RFC6203" },
	{ token: "SEARCHRES", reference: "RFC5182" },
	{ token: "SORT", reference: "RFC5256" },
	{ token: "SORT=DISPLAY", reference: "RFC5957" },
	{ token: "SPECIAL-USE", reference: "RFC6154" },
	{ token: "STARTTLS", reference: "RFC3501; RFC9051" },
	{ token: "STATUS=SIZE", reference: "RFC8438" },
	{ token: "THREAD", reference: "RFC5256" },
	{ token: "UIDBATCHES", reference: "RFC-ietf-mailmaint-imap-uidbatches-22" },
	{ token: "UIDONLY", reference: "RFC9586" },
	{ token: "UIDPLUS", reference: "RFC4315" },
	{ token: "UNAUTHENTICATE", reference: "RFC8437" },
	{ token: "UNSELECT", reference: "RFC3691" },
	{ token: "URL-PARTIAL", reference: "RFC5550" },
	{ token: "URLAUTH", reference: "RFC4467" },
	{ token: "URLAUTH=BINARY", reference: "RFC5524; RFC Errata 6214" },
	{ token: "UTF8=ACCEPT", reference: "RFC9755" },
	{ token: "UTF8=ALL (OBSOLETE)", reference: "RFC5738; RFC9755" },
	{ token: "UTF8=APPEND (OBSOLETE)", reference: "RFC5738; RFC9755" },
	{ token: "UTF8=ONLY", reference: "RFC9755" },
	{ token: "UTF8=USER (OBSOLETE)", reference: "RFC5738; RFC9755" },
	{ token: "WITHIN", reference: "RFC5032" },
];
