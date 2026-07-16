import type { CatalogModule } from "../types";

const rfc7162: CatalogModule = {
	source: "RFC7162",
	extractionNote:
		"RFC 7162 (IMAP Extensions: Quick Flag Changes Resynchronization (CONDSTORE) and Quick " +
		"Mailbox Resynchronization (QRESYNC)) fully reviewed: Abstract, §1 Introduction, §2 " +
		"Requirements Notation, §3 IMAP Protocol Changes [§3.1 CONDSTORE (§3.1.1 Advertising, " +
		"§3.1.2 New OK Untagged Responses (§3.1.2.1 HIGHESTMODSEQ, §3.1.2.2 NOMODSEQ), §3.1.3 " +
		"STORE/UID STORE, §3.1.4 FETCH/UID FETCH (§3.1.4.1 CHANGEDSINCE, §3.1.4.2 MODSEQ data " +
		"item), §3.1.5 MODSEQ Search Criterion, §3.1.6 Modified SEARCH Response, §3.1.7 " +
		"HIGHESTMODSEQ Status Data Item, §3.1.8 CONDSTORE Select Parameter, §3.1.9 SORT/THREAD " +
		"Interaction, §3.1.10 ESORT/ESEARCH Interaction, §3.1.11 Quality-of-Implementation, " +
		"§3.1.12 CONDSTORE Server Implementation Considerations), §3.2 QRESYNC (§3.2.1 Impact on " +
		"CONDSTORE-only Clients, §3.2.2 Advertising, §3.2.3 Use of ENABLE, §3.2.4 Additional " +
		"Server Requirements, §3.2.5 QRESYNC Select Parameter (§3.2.5.1, §3.2.5.2), §3.2.6 " +
		"VANISHED UID FETCH Modifier, §3.2.7 EXPUNGE, §3.2.8 CLOSE, §3.2.9 UID EXPUNGE, §3.2.10 " +
		"VANISHED Response (§3.2.10.1, §3.2.10.2), §3.2.11 CLOSED Response Code)], §4 Long Command " +
		"Lines (Update to RFC 2683), §5 QRESYNC Server Implementation Considerations, §6 Updated " +
		"Synchronization Sequence, §7 Formal Syntax, §8 Security Considerations, §9 IANA, §10 " +
		"References, Appendices A-C.\n\n" +
		"OBSOLETION: RFC 7162 obsoletes RFC 4551 (CONDSTORE) and RFC 5162 (QRESYNC) and updates " +
		"RFC 2683; it is cataloged as the sole normative source for both capabilities. " +
		"Client-visible behavioral deltas recorded in Appendices A/B: mod-sequences are unsigned " +
		"63-bit (RFC 4551/5162 said 64-bit) — see RFC7162-7-1; HIGHESTMODSEQ/NOMODSEQ on " +
		"SELECT/EXAMINE is only required once a CONDSTORE enabling command has been issued (a " +
		"client cannot rely on it before that — see RFC7162-3.1.2-1 notes); the " +
		"VANISHED-instead-of-EXPUNGE requirement was upgraded from SHOULD (RFC 5162) to MUST " +
		"except for NOMODSEQ mailboxes (RFC7162-3.2.10.2-1); QRESYNC is only in effect once the " +
		"server has positively responded with ENABLED QRESYNC (errata 1365, folded into " +
		"RFC7162-3.2.3-2); unsolicited FETCH responses must include UID data once a CONDSTORE " +
		"enabling command was issued under QRESYNC (errata 1807, §3.2.4 — server duty, client " +
		"acceptance folded into RFC7162-3.2.5.1-1 notes); HIGHESTMODSEQ response code must not be " +
		"returned for CLOSE (errata 1808 — server duty, §3.2.8).\n\n" +
		"CLIENT/SERVER SPLIT. CONDSTORE/QRESYNC is server-heavy; excluded as server-only: §3.1's " +
		"mod-sequence assignment/uniqueness/monotonicity MUSTs, the flag-change " +
		"MUST-update-mod-sequence and set-a-set-flag SHOULD NOT, the per-metadata-item storage " +
		"MAY; §3.1.2/3.1.2.1/3.1.2.2's HIGHESTMODSEQ/NOMODSEQ emission MUSTs (client reciprocal " +
		"acceptance IS cataloged, 3.1.2-1) and the NOMODSEQ-mailbox MUST-reject-with-BAD " +
		"enforcement (client reciprocal prohibition cataloged, 3.1.2.2-1); §3.1.3's conditional-" +
		"STORE evaluation algorithm, mod-sequence update MUSTs, MODIFIED-list construction, the " +
		"duplicate-message-in-set MUST NOT, the unconditional-STORE mod-sequence REQUIRED, and " +
		"the server SHOULD-avoid-spurious-MODIFIED / RECOMMENDED-unsolicited-FETCH advice; " +
		"§3.1.5/3.1.6's server MUST-append-mod-sequence and MUST-use-biggest-of-priv/shared and " +
		"MUST-ignore-entry-name rules (client acceptance of the extended response cataloged, " +
		"3.1.6-1); §3.1.7's MUST-return-0 (client acceptance cataloged, 3.1.7-1); §3.1.9/3.1.10 " +
		"server MUST-append/MUST-return-ESEARCH-MODSEQ duties (see rev2/cross-source notes " +
		"below); §3.1.12 in full (server implementation strategy); §3.2's per-mailbox " +
		"mod-sequence increment MUSTs on expunge/SETMETADATA and the no-lost-changes untagged-" +
		"event MUST; §3.2.2's SHOULD-also-advertise-CONDSTORE; §3.2.3's server ENABLE support " +
		"REQUIRED and MUST-start-sending-VANISHED; §3.2.4 in full (UID+MODSEQ in unsolicited " +
		"FETCH — server emission); §3.2.5/3.2.5.1's argument-verification, MUST-send-all-untagged-" +
		"responses, MUST-ignore-remaining-parameters rules; §3.2.6's three server MUST-BAD " +
		"enforcement halves (client prohibitions cataloged) and the <minmodseq> MUST; " +
		"§3.2.7/3.2.9's mod-sequence increment/remember MUSTs; §3.2.8's CLOSE MUST NOT " +
		"HIGHESTMODSEQ; §3.2.10's servers-MUST-NOT-combine-forms, §3.2.10.2's MUST-refer-only-to-" +
		"visible-messages / MUST-NOT-send-when-no-command-in-progress framing rules (server " +
		"emission constraints; the client-side handling duties ARE cataloged at " +
		"3.2.10.1-1/-2 and 3.2.10.2-1/-2); §3.2.11's MUST-return-CLOSED (client acceptance " +
		"cataloged, 3.2.11-1); §5 in full; §8 (no client duty). Where a duty is phrased " +
		"server-side but implies a client parse/accept or prohibition counterpart, the " +
		"reciprocal duty is cataloged with disclosure in notes (established precedent, e.g. " +
		"RFC5464-4.2.1-1).\n\n" +
		"REV2 ADJUDICATION: CONDSTORE and QRESYNC are NOT folded into IMAP4rev2 — grep of " +
		"catalog/rfc9051* finds no scored CONDSTORE/QRESYNC/MODSEQ/VANISHED duty (only an " +
		"illustrative CONDSTORE mention in s6-auth-a.ts's worked example and the Appendix F " +
		"recommendation note in sA-appendices.ts). Both remain standalone extensions in rev2, so " +
		"entries default profiles: [\"rev1\",\"rev2\"], with TWO exceptions: (a) RFC7162-3.1.6-1 " +
		"(extended untagged SEARCH response acceptance) is tagged [\"rev1\"] because IMAP4rev2 " +
		"removed the legacy untagged SEARCH response entirely and RFC9051-6.4.4-1 requires " +
		"rev2-only clients to IGNORE '* SEARCH' responses — the 7162 acceptance duty cannot bind " +
		"a rev2 session (a rev2 CONDSTORE server answers SEARCH MODSEQ with the ESEARCH MODSEQ " +
		"pair instead); (b) RFC7162-3.2.11-1 (CLOSED response code boundary) is tagged " +
		"[\"rev1\"] because the CLOSED response code is folded into rev2 core and the identical " +
		"client duty is already scored as RFC9051-7.1-9. CROSS-SOURCE (not double-scored): " +
		"§3.1.10's ESEARCH-MODSEQ-return-data acceptance is already scored as RFC4731-3.2-1, " +
		"whose extractionNote explicitly instructs this extractor to cross-ref rather than " +
		"re-catalog; the extended-SORT half of §3.1.10 falls to the RFC 5267 (ESORT/CONTEXT) " +
		"extraction. §3.1.9's plain-SORT interaction IS cataloged here (3.1.9-1) because the " +
		"'* SORT ... (MODSEQ n)' grammar extension is defined by THIS document (sort-data in §7), " +
		"not by RFC 5256.\n\n" +
		"REAL PARSE SURFACE (probed in src/): the client ALREADY parses (1) the MODSEQ FETCH " +
		"data item 'MODSEQ (n)' incl. bigint values — src/parser/structure/fetch/modseq.ts; " +
		"(2) the HIGHESTMODSEQ resp-code as a 64-bit-capable NumberTextCode and the MODIFIED " +
		"resp-code as ModifiedTextCode carrying a UIDSet — src/parser/structure/text.code.ts " +
		"(NOMODSEQ and CLOSED fall through to the tolerant AtomTextCode default, so they are " +
		"accepted without error rather than specifically modeled); (3) STATUS HIGHESTMODSEQ — " +
		"src/parser/structure/mailbox/status.ts; (4) the RFC 7162 extended untagged SEARCH " +
		"response — src/parser/structure/mailbox/search.ts SearchResponse explicitly slices a " +
		"trailing '(MODSEQ n)' group off the result list (number|bigint) per this document's " +
		"grammar. Entries whose observable core is one of these are marked testable with a REAL " +
		"parse path. UPDATE (post-M4.6): '* VANISHED [(EARLIER)] uids' now has a REAL parse path " +
		"too — src/parser/structure/vanished.ts — so the acceptance duties (3.2.5.1-1, 3.2.7-2, " +
		"3.2.10.1-1, 3.2.10.2-1) genuinely pass; '* SORT ... (MODSEQ n)' is also REAL — " +
		"src/parser/structure/sort.ts now tolerates/captures the trailing MODSEQ group instead of " +
		"throwing ParsingError, so 3.1.9-1 genuinely passes as well; the untagged ENABLED response " +
		"is modeled too — src/parser/structure/enabled.ts. Command-emission duties (CONDSTORE/" +
		"QRESYNC select params, CHANGEDSINCE/VANISHED fetch modifiers, UNCHANGEDSINCE store " +
		"modifier, SEARCH MODSEQ, ENABLE QRESYNC) are all genuinely real too, as of M4.5 " +
		"(CONDSTORE half) / M4.6 (QRESYNC half) -- see each row's own notes above.\n\n" +
		"RFC 8174 discipline: RFC 7162 cites RFC 2119 only (§2), so lowercase keywords are " +
		"non-normative; every entry rests on an UPPERCASE keyword in its quoted sentence except " +
		"the judgment-call entries flagged in notes (reciprocal-parse duties derived from " +
		"server-worded MUSTs; command-form definitions with no keyword, leveled MAY as optional " +
		"mechanisms; RFC7162-4-1's lowercase 'should'; RFC7162-7-1's grammar-derived range " +
		"acceptance). NO-REQUIREMENT SECTIONS: §1 (overview), §2 (conventions), §3.1.1 " +
		"(capability advertisement fact — the implicit don't-use-unless-advertised counterpart " +
		"cataloged as 3.1.1-1), §3.1.12, §3.2.1 (advisory: CONDSTORE-only clients incur an extra " +
		"round trip; 'strongly encouraged' to support QRESYNC — no RFC 2119 keyword, not " +
		"extracted), §3.2.2 (server advertisement; the §3.2.3 sentence 'the presence of the " +
		"\"QRESYNC\" capability implies support for the CONDSTORE IMAP extension even if the " +
		"\"CONDSTORE\" capability isn't advertised' is a capability-interpretation fact a client " +
		"MAY rely on — noted here, not separately scored), §3.2.4 (server emission), §3.2.8 " +
		"(CLOSE: 'No untagged EXPUNGE (or VANISHED) responses are sent' — descriptive; server " +
		"MUST NOT HIGHESTMODSEQ), §3.2.9 (UID EXPUNGE reporting/HIGHESTMODSEQ sentences are " +
		"verbatim-identical to §3.2.7's and are cataloged once at 3.2.7-1/-2 with the UID " +
		"EXPUNGE applicability recorded in notes), §5, §8, §9, §10, Appendices. §7 ABNF: only " +
		"the 63-bit mod-sequence-value range is extracted (7-1); the ABNF-preamble " +
		"case-insensitivity boilerplate ('Implementations MUST accept these strings in a " +
		"case-insensitive fashion') is excluded per the RFC5161/RFC5464/RFC4731 precedent " +
		"(disclosed: RFC4978-5-1 extracted its instance — divided precedent, exclusion follows " +
		"the more recent practice); the attr-flag-extension comment 'Client implementations " +
		"MUST accept flag-extension flags' is inherited verbatim from RFC 3501's flag grammar " +
		"and has an ambiguous referent inside entry-flag-name (a client-EMITTED production), so " +
		"it is not scored as a distinct 7162 duty. QUOTE NOTE: RFC7162-3.2.5.1-1's " +
		"'mod-sequence- value' spacing preserves the RFC's own line wrap of the example command " +
		"(whitespace-flattened verbatim).\n\n" +
		"UNTESTABLE (12 of 43): cross-session ×4 (3.1.2.1-1 delete cached HIGHESTMODSEQ, 6-2 " +
		"cache/update HIGHESTMODSEQ, 6-4 empty cache on UIDVALIDITY change, 6-5 remove cached " +
		"value on NOMODSEQ) — each rebuts taxonomy mechanism (b) (sequential multi-connection " +
		"scripts) explicitly: the library keeps no cross-session sync cache and the QRESYNC/" +
		"CHANGEDSINCE/UNCHANGEDSINCE values it emits are caller-supplied, so a second scripted " +
		"session cannot attribute the emitted value to the client's own cache discipline; " +
		"internal-decision ×3 (3.1.2.1-2 resync-strategy choice, 3.1.3-4 be-prepared-for-" +
		"spurious-MODIFIED, 3.1.11-1 don't-rely-on-server-SHOULD); internal-state ×3 " +
		"(3.2.10.1-2 no-seq-decrement on EARLIER, 3.2.10.2-2 seq/count bookkeeping + MUST " +
		"record, 6-3 HIGHESTMODSEQ recalculation discipline); performance-expectation ×1 (4-1 " +
		"~8192-octet line-length recommendation); user-intent-policy ×1 (6-1 SHOULD-use-QRESYNC " +
		"adoption). Total: 43 client-binding entries.",
	requirements: [
		// ── §3.1 CONDSTORE Extension ─────────────────────────────────────────────

		{
			id: "RFC7162-3.1-1",
			source: "RFC7162",
			section: "3.1",
			title: "CONDSTORE-aware client MUST accept mod-sequence data in all subsequent untagged FETCH responses",
			text:
				"Once a client issues a CONDSTORE enabling command, it has announced itself as a " +
				"\"CONDSTORE-aware client\". The server MUST then include mod-sequence data in all " +
				"subsequent untagged FETCH responses (until the connection is closed), whether they " +
				"were caused by a regular STORE, a STORE with an UNCHANGEDSINCE modifier, or an " +
				"external agent.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"The MUST is worded on the server (include mod-sequence data); the extracted client " +
				"duty is the reciprocal ACCEPTANCE obligation a CONDSTORE enabling command commits the " +
				"client to: every subsequent untagged FETCH response — including unsolicited ones for " +
				"commands that never asked for MODSEQ — may now carry 'MODSEQ (n)', and the client " +
				"must parse it without error (judgment call, disclosed per the reciprocal-parse " +
				"precedent). The enabling-command list (SELECT/EXAMINE (CONDSTORE), STATUS " +
				"(HIGHESTMODSEQ), FETCH/SEARCH with MODSEQ, FETCH CHANGEDSINCE, STORE UNCHANGEDSINCE, " +
				"ENABLE CONDSTORE) is definitional prose in the same section. Testable REAL: " +
				"src/parser/structure/fetch/modseq.ts parses the MODSEQ fetch data item (number|" +
				"bigint), so a genuine pass/violation test exists (unsolicited '* n FETCH (MODSEQ " +
				"(...))' via connectLow/waitForUntagged). Conditional on the client using CONDSTORE; " +
				"standalone in rev2, so [\"rev1\",\"rev2\"].",
		},

		// ── §3.1.1 Advertising Support for CONDSTORE ─────────────────────────────

		{
			id: "RFC7162-3.1.1-1",
			source: "RFC7162",
			section: "3.1.1",
			title: "Client (implicit) MUST NOT use CONDSTORE protocol changes unless CONDSTORE is advertised",
			text:
				"The Conditional STORE extension is present in any IMAP4 implementation that returns " +
				"\"CONDSTORE\" as one of the supported capabilities in the CAPABILITY command response.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment call: no RFC 2119 keyword — the sentence is the capability-advertisement " +
				"fact, and the implicit client counterpart (do not send UNCHANGEDSINCE/CHANGEDSINCE/" +
				"MODSEQ/SELECT (CONDSTORE) to a server that has not advertised CONDSTORE) follows the " +
				"general IMAP extension discipline (RFC 3501 §6.5 / RFC 4466 select-param and " +
				"fetch-modifier gating). QRESYNC nuance from §3.2.3: 'the presence of the \"QRESYNC\" " +
				"capability implies support for the CONDSTORE IMAP extension even if the " +
				"\"CONDSTORE\" capability isn't advertised', so the gate is CONDSTORE-or-QRESYNC. " +
				"Testable black-box: a capability-less scripted session must never see CONDSTORE " +
				"parameters from a compliant client (self-actualizing, and genuinely so as of " +
				"M4.5 — SelectOrExamineCommand's constructor throws CapabilityError client-side " +
				"when `condstore` is requested without the capability). Conditional; standalone " +
				"in rev2, so [\"rev1\",\"rev2\"].",
		},

		// ── §3.1.2 New OK Untagged Responses for SELECT and EXAMINE ─────────────

		{
			id: "RFC7162-3.1.2-1",
			source: "RFC7162",
			section: "3.1.2",
			title: "Client MUST accept HIGHESTMODSEQ or NOMODSEQ on post-enabling SELECT/EXAMINE",
			text:
				"This document adds two new response codes: HIGHESTMODSEQ and NOMODSEQ. One of these " +
				"two response codes MUST be returned in an OK untagged response for any successful " +
				"SELECT/EXAMINE command issued after a CONDSTORE enabling command.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"The MUST binds the server's emission; the extracted client duty is the reciprocal " +
				"PARSE obligation — a CONDSTORE-using client must accept both '* OK [HIGHESTMODSEQ " +
				"<mod-sequence-value>]' and '* OK [NOMODSEQ]' among the SELECT/EXAMINE untagged " +
				"responses and complete the selection (judgment call, reciprocal-parse precedent). " +
				"Appendix A delta: the response codes are only guaranteed after a CONDSTORE enabling " +
				"command ('a client wishing to receive HIGHESTMODSEQ/NOMODSEQ information must first " +
				"send a CONDSTORE enabling command', §3.1.2.1/§3.1.2.2 — lowercase 'must', folded " +
				"here as context rather than scored separately). Testable REAL: text.code.ts parses " +
				"HIGHESTMODSEQ as a 64-bit-capable NumberTextCode; NOMODSEQ is accepted via the " +
				"tolerant AtomTextCode fallback. Conditional; standalone in rev2, so " +
				"[\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC7162-3.1.2.1-1",
			source: "RFC7162",
			section: "3.1.2.1",
			title: "Client MUST delete its cached HIGHESTMODSEQ when UIDVALIDITY changes",
			text:
				"A disconnected client can use the value of HIGHESTMODSEQ to check if it has to " +
				"refetch metadata from the server. If the UIDVALIDITY value has changed for the " +
				"selected mailbox, the client MUST delete the cached value of HIGHESTMODSEQ.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "cross-session",
			untestableRationale:
				"An explicit client MUST, but its object is a cross-session cache entry, not a wire " +
				"action: deleting (or failing to delete) the cached HIGHESTMODSEQ produces no " +
				"protocol trace in the session where the UIDVALIDITY change is observed. Taxonomy " +
				"mechanism (b) (sequential multi-connection scripts) was evaluated and rebutted: a " +
				"second scripted session could in principle reveal a stale cached value if the " +
				"client emitted it in a QRESYNC parameter or CHANGEDSINCE argument, but this " +
				"headless library keeps no cross-session synchronization cache — the modseq values " +
				"it emits are supplied by the caller per command — so no second-session wire trace " +
				"can attribute a stale value to the client's own (non-existent) cache discipline " +
				"rather than to harness input. Same rebuttal pattern as RFC9051-2.3.1.1-1.",
			notes:
				"Explicit client MUST. The companion sentence in the same paragraph (cache-compare " +
				"to decide whether to refetch) is descriptive; the two MAY mechanisms it leads into " +
				"are RFC7162-3.1.2.1-2. Conditional (binds a client that caches HIGHESTMODSEQ); " +
				"standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC7162-3.1.2.1-2",
			source: "RFC7162",
			section: "3.1.2.1",
			title: "Client MAY use SEARCH MODSEQ or FETCH CHANGEDSINCE to update its cache",
			text:
				"If UIDVALIDITY for the mailbox is the same, and if the HIGHESTMODSEQ value stored " +
				"in the client's cache is less than the value returned by the server, then some " +
				"metadata items on the server have changed since the last synchronization, and the " +
				"client needs to update its cache. The client MAY use SEARCH MODSEQ (Section 3.1.5) " +
				"to find out exactly which metadata items have changed. Alternatively, the client " +
				"MAY issue FETCH with the CHANGEDSINCE modifier (Section 3.1.4.1) in order to fetch " +
				"data for all messages that have metadata items changed since some known " +
				"modification sequence.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"A pure permission pair: both clauses grant alternative, equally compliant " +
				"resynchronization strategies (SEARCH MODSEQ vs. FETCH CHANGEDSINCE), and a client " +
				"may equally well use neither (e.g. refetch everything). Which mechanism a client " +
				"picks — or whether it resynchronizes at all — is an internal strategy decision with " +
				"no pass/fail wire boundary: any of the three observable behaviors is compliant, so " +
				"no black-box exchange can falsify the duty. The command FORMS the permissions point " +
				"at are separately scored as testable entries (RFC7162-3.1.5-1, RFC7162-3.1.4.1-1).",
			notes:
				"Both MAYs are explicit RFC 2119 keywords bound to the client. Conditional; " +
				"standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC7162-3.1.2.2-1",
			source: "RFC7162",
			section: "3.1.2.2",
			title: "Client (implicit) MUST NOT use CONDSTORE modifiers on a NOMODSEQ mailbox",
			text:
				"A server that returned the NOMODSEQ response code for a mailbox MUST reject (with a " +
				"tagged BAD response) any of the following commands while the mailbox remains " +
				"selected: o a FETCH command with the CHANGEDSINCE modifier, o a FETCH or SEARCH " +
				"command that includes the MODSEQ message data item, or o a STORE command with the " +
				"UNCHANGEDSINCE modifier.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment call: the MUST binds the server's rejection; the reciprocal client duty — " +
				"after seeing '* OK [NOMODSEQ]' for the selected mailbox, do not issue FETCH " +
				"CHANGEDSINCE, FETCH/SEARCH MODSEQ, or STORE UNCHANGEDSINCE while it remains " +
				"selected (each is guaranteed to draw a BAD) — is implicit but load-bearing for " +
				"interoperation (disclosed per the reciprocal-duty precedent). Testable black-box: " +
				"select a mailbox whose scripted SELECT stream carries NOMODSEQ, then drive metadata " +
				"synchronization and assert no CONDSTORE modifier is emitted (self-actualizing, and " +
				"genuinely so as of M4.5 — MailboxSession.assertModSeqUsable() throws " +
				"CapabilityError client-side on a NOMODSEQ mailbox). Conditional; standalone in " +
				"rev2, so [\"rev1\",\"rev2\"].",
		},

		// ── §3.1.3 STORE and UID STORE Commands ──────────────────────────────────

		{
			id: "RFC7162-3.1.3-1",
			source: "RFC7162",
			section: "3.1.3",
			title: "UNCHANGEDSINCE STORE modifier form",
			text:
				"This document defines the following STORE modifier (see Section 2.5 of [RFC4466]): " +
				"UNCHANGEDSINCE <mod-sequence> ... If the mod-sequence of every metadata item of the " +
				"message affected by the STORE/UID STORE is equal to or less than the specified " +
				"UNCHANGEDSINCE value, then the requested operation (as described by the message data " +
				"item) is performed.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: the modifier definition carries no client-directed RFC 2119 keyword " +
				"— using UNCHANGEDSINCE is a mechanism the client MAY invoke; when it does, the wire " +
				"form is 'STORE <set> (UNCHANGEDSINCE <mod-sequence>) <data-item> <value>' per §7 " +
				"store-modifier ABNF, whose comment adds the emission constraint 'Only a single " +
				"\"UNCHANGEDSINCE\" may be specified in a STORE operation.' The elision skips the " +
				"blank line between the definition header and the semantics paragraph. Testable " +
				"black-box (emission form; genuinely real as of M4.5 — driver.store()/uidStore() " +
				"emit the UNCHANGEDSINCE modifier for real). Conditional; standalone in rev2, so " +
				"[\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC7162-3.1.3-2",
			source: "RFC7162",
			section: "3.1.3",
			title: "Client MUST accept the untagged FETCH with MODSEQ even for .SILENT stores",
			text:
				"If the operation is successful, the server MUST update the mod-sequence attribute " +
				"of the message. An untagged FETCH response MUST be sent, even if the .SILENT suffix " +
				"is specified, and the response MUST include the MODSEQ message data item. This is " +
				"required to update the client's cache with the correct mod-sequence values.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"The MUSTs bind the server's emission; the extracted client duty is the reciprocal " +
				"ACCEPTANCE obligation (judgment call, disclosed): a client issuing STORE ... " +
				"(UNCHANGEDSINCE n) +FLAGS.SILENT must tolerate untagged FETCH responses carrying " +
				"MODSEQ arriving despite the .SILENT suffix — a client that treats .SILENT as a " +
				"guarantee of no FETCH traffic mis-handles the exchange. Testable REAL: fetch/" +
				"modseq.ts parses 'MODSEQ (n)'; script Example 3's exchange and assert the client " +
				"consumes the '* 1 FETCH (UID 4 MODSEQ (12121231000))' responses and completes the " +
				"tagged OK. Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC7162-3.1.3-3",
			source: "RFC7162",
			section: "3.1.3",
			title: "Client MUST accept the [MODIFIED set] response code on tagged OK (and NO)",
			text:
				"When the server finishes performing the operation on all the messages in the " +
				"message set, it checks for a non-empty list of messages that failed the " +
				"UNCHANGEDSINCE test. If this list is non-empty, the server MUST return in the " +
				"tagged response a MODIFIED response code. The MODIFIED response code includes the " +
				"message set (for STORE) or set of UIDs (for UID STORE) of all messages that failed " +
				"the UNCHANGEDSINCE test. ... the MODIFIED response code MAY also be returned in the " +
				"tagged NO response.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Server-worded MUST; extracted client duty is the reciprocal PARSE obligation " +
				"(judgment call, disclosed): a client issuing a conditional STORE must accept a " +
				"tagged OK carrying '[MODIFIED <set>]' as a well-formed completion, interpret the " +
				"set as message numbers for STORE and UIDs for UID STORE, and equally accept the " +
				"tagged-NO variant (elided sentence from the Example 11 lead-in, §7 ABNF " +
				"resp-text-code =/ \"MODIFIED\" SP sequence-set). Testable REAL: text.code.ts parses " +
				"MODIFIED into ModifiedTextCode with a UIDSet — genuine pass/violation test via a " +
				"scripted 'd105 OK [MODIFIED 7,9] Conditional STORE failed'. Conditional; standalone " +
				"in rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC7162-3.1.3-4",
			source: "RFC7162",
			section: "3.1.3",
			title: "Client MUST be prepared for MODIFIED when the watched item hasn't changed",
			text:
				"Note: A client trying to make an atomic change to the state of a particular " +
				"metadata item (or a set of metadata items) MUST be prepared to deal with the case " +
				"when the server returns the MODIFIED response code if the state of the metadata " +
				"item being watched hasn't changed (but the state of some other metadata item has). " +
				"This is necessary because some servers don't store separate mod-sequences for " +
				"different metadata items.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"'MUST be prepared to deal with' binds the client's internal conflict-resolution " +
				"logic (its atomic-change algorithm must not assume MODIFIED implies the watched " +
				"item changed), not a specific wire action. The wire-observable half — accepting the " +
				"MODIFIED response code at all — is already scored as RFC7162-3.1.3-3, and the " +
				"observable recovery steps the RFC recommends are separately scored as " +
				"RFC7162-3.1.3-5/-6 (SHOULD probe, SHOULD retry). What remains of THIS sentence is " +
				"the client's readiness assumption: a client whose logic correctly tolerates " +
				"spurious MODIFIED and one that would deadlock or corrupt its model both emit " +
				"identical traffic in any single scripted exchange, because 'dealing with' the case " +
				"is an internal-design property that only manifests through the already-scored " +
				"recovery behaviors — scoring it separately as testable would double-count -5/-6's " +
				"observables.",
			notes:
				"Explicit client MUST ('MUST be prepared'). The neighboring server SHOULD (avoid " +
				"generating spurious MODIFIED for +FLAGS/-FLAGS) is server-only and excluded. " +
				"Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC7162-3.1.3-5",
			source: "RFC7162",
			section: "3.1.3",
			title: "On MODIFIED without explanatory FETCH, client SHOULD probe via FETCH or NOOP",
			text:
				"Unless the server has included an unsolicited FETCH to update the client's " +
				"knowledge about messages that have failed the UNCHANGEDSINCE test, upon receipt of " +
				"the MODIFIED response code, the client SHOULD try to figure out if the required " +
				"metadata items have indeed changed by issuing the FETCH or NOOP command.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Explicit client SHOULD. Testable in a driven scenario (RFC5464-4.4-3 precedent): " +
				"script a conditional STORE answered with '[MODIFIED n]' and NO explanatory " +
				"unsolicited FETCH, drive the client's conflict-recovery path, and assert the next " +
				"command is a FETCH (naming the modified messages' flags/modseq) or NOOP rather than " +
				"a blind re-STORE or nothing. Examples 9/10 illustrate both server styles. " +
				"Conditional (binds a client using UNCHANGEDSINCE for atomic changes); standalone in " +
				"rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC7162-3.1.3-6",
			source: "RFC7162",
			section: "3.1.3",
			title: "Client SHOULD retry with the new mod-sequence; allow at least 2 retries",
			text:
				"If the required metadata items haven't changed, the client SHOULD retry the command " +
				"with the new mod-sequence. The client needs to allow for a reasonable number of " +
				"retries (at least 2).",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Explicit client SHOULD; the second sentence ('needs to allow ... at least 2') is " +
				"keyword-less quantification of the same duty, folded here rather than scored " +
				"separately. Testable in a driven scenario: after a MODIFIED whose follow-up " +
				"FETCH/NOOP shows the watched item unchanged (Example 9's b107/b108 flow), assert " +
				"the client re-issues the STORE with the UPDATED UNCHANGEDSINCE value taken from the " +
				"newly learned mod-sequence — a retry with the stale value or an immediate give-up " +
				"on the first conflict violates. Conditional; standalone in rev2, so " +
				"[\"rev1\",\"rev2\"].",
		},

		// ── §3.1.4 FETCH and UID FETCH Commands ──────────────────────────────────

		{
			id: "RFC7162-3.1.4.1-1",
			source: "RFC7162",
			section: "3.1.4.1",
			title: "CHANGEDSINCE FETCH modifier form; implicitly adds the MODSEQ data item",
			text:
				"CHANGEDSINCE <mod-sequence>: The CHANGEDSINCE FETCH modifier allows the client to " +
				"further subset the list of messages described by the sequence set. The information " +
				"described by message data items is only returned for messages that have a " +
				"mod-sequence bigger than <mod-sequence>. When the CHANGEDSINCE FETCH modifier is " +
				"specified, it implicitly adds the MODSEQ FETCH message data item (Section 3.1.4.2).",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: modifier definition without a client-directed keyword — a mechanism " +
				"the client MAY invoke; when used, the form is 'FETCH <set> <items> (CHANGEDSINCE " +
				"<mod-sequence>)' per §7 chgsince-fetch-mod, and the client must expect MODSEQ data " +
				"items in the responses even though it didn't list MODSEQ (the implicit-add " +
				"sentence). Testable: emission form genuinely real as of M4.5 (driver fetch " +
				"options emit CHANGEDSINCE for real); the implied-MODSEQ acceptance side is also " +
				"REAL (fetch/modseq.ts). Example 12 shows the canonical exchange. Conditional; " +
				"standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC7162-3.1.4.2-1",
			source: "RFC7162",
			section: "3.1.4.2",
			title: "MODSEQ message data item in the FETCH command",
			text:
				"CONDSTORE adds a MODSEQ message data item to the FETCH command. The MODSEQ message " +
				"data item allows clients to retrieve mod-sequence values for a range of messages in " +
				"the currently selected mailbox.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: data-item definition, no client-directed keyword — a retrieval " +
				"mechanism the client MAY invoke; when used, the emitted item is the bare atom " +
				"MODSEQ inside the FETCH item list ('C: a FETCH 1:3 (MODSEQ)', Example 13; §7 " +
				"fetch-att =/ fetch-mod-sequence). Note this is also a CONDSTORE enabling command " +
				"(§3.1), committing the client to RFC7162-3.1-1's acceptance duty. Testable " +
				"(emission form; self-actualizing today). Conditional; standalone in rev2, so " +
				"[\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC7162-3.1.4.2-2",
			source: "RFC7162",
			section: "3.1.4.2",
			title: "Client MUST accept the MODSEQ (n) FETCH response data item",
			text:
				"Syntax: MODSEQ ( <permsg-modsequence> ) MODSEQ response data items contain " +
				"per-message mod-sequences. The MODSEQ response data item is returned if the client " +
				"issued FETCH with the MODSEQ message data item. It also allows the server to notify " +
				"the client about mod-sequence changes caused by conditional STOREs (Section 3.1.3) " +
				"and/or changes caused by external sources.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment call: the response-item definition carries no keyword, but accepting it is " +
				"the non-optional counterpart of every CONDSTORE enabling command (reciprocal-parse " +
				"precedent; the general acceptance duty across ALL untagged FETCH responses is " +
				"RFC7162-3.1-1 — this entry scores the data item's specific 'MODSEQ (n)' shape, " +
				"solicited or unsolicited, per §7 fetch-mod-resp = \"MODSEQ\" SP \"(\" " +
				"permsg-modsequence \")\"). Testable REAL: src/parser/structure/fetch/modseq.ts " +
				"matches exactly this shape (number|bigint inside the parens). Conditional; " +
				"standalone in rev2, so [\"rev1\",\"rev2\"].",
		},

		// ── §3.1.5 MODSEQ Search Criterion in SEARCH ─────────────────────────────

		{
			id: "RFC7162-3.1.5-1",
			source: "RFC7162",
			section: "3.1.5",
			title: "MODSEQ search criterion form, incl. quoted entry-name escaping",
			text:
				"Syntax: MODSEQ [<entry-name> <entry-type-req>] <mod-sequence-valzer> Messages that " +
				"have modification values that are equal to or greater than <mod-sequence-valzer>. " +
				"... For a flag <flagname>, the corresponding <entry-name> has the form " +
				"\"/flags/<flagname>\". Note that the leading \"\\\" character that denotes a system " +
				"flag has to be escaped as per Section 4.3 of [RFC3501], as <entry-name> uses the " +
				"syntax for quoted strings (see the examples below).",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: search-key definition, no client-directed keyword — a criterion the " +
				"client MAY use; when used, the form binds: optional '<entry-name> <entry-type-req>' " +
				"pair before the value, <entry-type-req> one of shared/priv/all, entry-name a quoted " +
				"string '/flags/<flagname>' with the system-flag backslash escaped ('SEARCH MODSEQ " +
				"\"/flags/\\\\draft\" all 620162338', Example 15; §7 search-modsequence ABNF). The " +
				"elision skips the intra-definition prose about server-side entry-type handling " +
				"(server duties). Applies to SEARCH and UID SEARCH (and per §7 'this change applies " +
				"to ... SEARCH, SORT, and THREAD'). Note MODSEQ search is a CONDSTORE enabling " +
				"command. Testable (emission form; self-actualizing today). Conditional; standalone " +
				"in rev2, so [\"rev1\",\"rev2\"].",
		},

		// ── §3.1.6 Modified SEARCH Untagged Response ─────────────────────────────

		{
			id: "RFC7162-3.1.6-1",
			source: "RFC7162",
			section: "3.1.6",
			title: "Client MUST accept the extended untagged SEARCH response with (MODSEQ n)",
			text:
				"This document extends the syntax of the untagged SEARCH response to include the " +
				"highest mod-sequence for all messages being returned. If a client specifies a " +
				"MODSEQ criterion in a SEARCH (or UID SEARCH) command and the server returns a " +
				"non-empty SEARCH result, the server MUST also append (to the end of the untagged " +
				"SEARCH response) the highest mod-sequence for all messages being returned.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "testable",
			notes:
				"Server-worded MUST; extracted client duty is the reciprocal PARSE obligation " +
				"(judgment call, disclosed): a client that searched with MODSEQ must accept " +
				"'* SEARCH 2 5 6 7 11 12 18 19 20 23 (MODSEQ 917162500)' (Example 15; §7 " +
				"mailbox-data =/ \"SEARCH\" [1*(SP nz-number) SP search-sort-mod-seq]) — a parser " +
				"expecting only bare numbers breaks. ESEARCH override noted in the section: RFC 4731 " +
				"result options replace this with the ESEARCH MODSEQ pair (scored as RFC4731-3.2-1, " +
				"cross-source). Testable REAL: src/parser/structure/mailbox/search.ts SearchResponse " +
				"explicitly slices a trailing '(MODSEQ n)' group (number|bigint) per this grammar. " +
				"REV2 ADJUDICATION — [\"rev1\"] only: IMAP4rev2 removed the legacy untagged SEARCH " +
				"response and RFC9051-6.4.4-1 requires rev2-only clients to IGNORE '* SEARCH' " +
				"responses, so this acceptance duty cannot bind a rev2 session (a rev2 server " +
				"answers SEARCH MODSEQ with an ESEARCH response instead); this is a " +
				"removed-in-rev2 adjudication, not a 9051-double-score.",
		},

		// ── §3.1.7 HIGHESTMODSEQ Status Data Item ────────────────────────────────

		{
			id: "RFC7162-3.1.7-1",
			source: "RFC7162",
			section: "3.1.7",
			title: "HIGHESTMODSEQ status data item: request form and value acceptance (incl. 0)",
			text:
				"HIGHESTMODSEQ: The highest mod-sequence value of all messages in the mailbox. This " +
				"is the same value that is returned by the server in the HIGHESTMODSEQ response code " +
				"in an OK untagged response (see Section 3.1.2.1). If the server doesn't support the " +
				"persistent storage of mod-sequences for the mailbox (see Section 3.1.2.2), the " +
				"server MUST return 0 as the value of the HIGHESTMODSEQ status data item.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Two client-binding halves in one status-item definition (judgment call on the " +
				"reciprocal side, disclosed): (a) the request form — the client emits HIGHESTMODSEQ " +
				"in the STATUS attribute list ('A042 STATUS blurdybloop (UIDNEXT MESSAGES " +
				"HIGHESTMODSEQ)', Example 17; §7 status-att =/ \"HIGHESTMODSEQ\") — note STATUS " +
				"(HIGHESTMODSEQ) is itself a CONDSTORE enabling command (§3.1); (b) the acceptance " +
				"duty — parse 'HIGHESTMODSEQ <mod-sequence-valzer>' in the '* STATUS' reply, " +
				"including the value 0, which per the server-worded MUST means the mailbox does not " +
				"support persistent mod-sequences (§7 status-att-val comment: 'Value 0 denotes that " +
				"the mailbox doesn't support persistent mod-sequences'). Testable REAL: src/parser/" +
				"structure/mailbox/status.ts parses the HIGHESTMODSEQ status item (64-bit-capable). " +
				"Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},

		// ── §3.1.8 CONDSTORE Parameter to SELECT and EXAMINE ─────────────────────

		{
			id: "RFC7162-3.1.8-1",
			source: "RFC7162",
			section: "3.1.8",
			title: "CONDSTORE select parameter form",
			text:
				"The CONDSTORE extension defines a single optional select parameter, \"CONDSTORE\", " +
				"which tells the server that it MUST include the MODSEQ FETCH response data items in " +
				"all subsequent unsolicited FETCH responses.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: 'optional select parameter' — a mechanism the client MAY use (the " +
				"embedded MUST binds the server's subsequent emission, whose client acceptance side " +
				"is RFC7162-3.1-1); when used, the form is 'SELECT INBOX (CONDSTORE)' / 'EXAMINE ... " +
				"(CONDSTORE)' per §7 condstore-param under the RFC 4466 select-param grammar " +
				"(Example 18). The section's race-condition rationale (enabling at selection time " +
				"avoids missing updates between HIGHESTMODSEQ and a later enabling command) is " +
				"descriptive. Testable (emission form; genuinely real as of M4.5 — driver.select() " +
				"with condstore emits the parameter for real). Conditional; standalone in rev2, so " +
				"[\"rev1\",\"rev2\"].",
		},

		// ── §3.1.9 Interaction with IMAP SORT and THREAD Extensions ──────────────

		{
			id: "RFC7162-3.1.9-1",
			source: "RFC7162",
			section: "3.1.9",
			title: "Client MUST accept the extended untagged SORT response with (MODSEQ n)",
			text:
				"This document extends the syntax of the untagged SORT response to include the " +
				"highest mod-sequence for all messages being returned. If a client specifies a " +
				"MODSEQ criterion in a SORT (or UID SORT) command and the server returns a non-empty " +
				"SORT result, the server MUST also append (to the end of the untagged SORT response) " +
				"the highest mod-sequence for all messages being returned.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Server-worded MUST; extracted client duty is the reciprocal PARSE obligation " +
				"(judgment call, disclosed): a client combining SORT [RFC5256] with the MODSEQ " +
				"criterion must accept '* SORT <numbers> (MODSEQ <n>)' (§7 sort-data ABNF, defined " +
				"by THIS document — 'Updates the SORT response from RFC 5256'). THREAD is unchanged " +
				"('THREAD responses are unchanged by the CONDSTORE extension') — no THREAD entry. " +
				"The ESORT variant (§3.1.10) is out of scope here (see extractionNote). Doubly " +
				"conditional: binds only a client using both SORT and MODSEQ. PROBE RESULT: " +
				"src/parser/structure/sort.ts now tolerates/captures the trailing '(MODSEQ n)' " +
				"group (fixed after this note's original probe found it threw ParsingError there); " +
				"this row genuinely passes. Profiles [\"rev1\",\"rev2\"]: SORT remains a standalone " +
				"extension in rev2 and its legacy '* SORT' response (unlike the rev2-removed " +
				"'* SEARCH') still exists, so the duty binds in both profiles.",
		},

		// ── §3.1.11 Additional Quality-of-Implementation Issues ──────────────────

		{
			id: "RFC7162-3.1.11-1",
			source: "RFC7162",
			section: "3.1.11",
			title: "Client MUST NOT rely on servers suppressing no-op flag-change mod-sequence bumps",
			text:
				"However, note that client implementers MUST NOT rely on this server behavior. A " +
				"client can't distinguish between the case when a server has violated the SHOULD " +
				"mentioned above and when one or more clients set and unset (or unset and set) the " +
				"flag in another session.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"'MUST NOT rely on' forbids a design assumption (that adding an already-present flag " +
				"or removing an absent one never changes the mod-sequence — the server SHOULD in the " +
				"same section), not any wire behavior. A client whose synchronization logic wrongly " +
				"bakes in that assumption and one that correctly treats every mod-sequence bump as a " +
				"potential real change issue identical commands; the divergence lives in how the " +
				"client's internal cache-update logic classifies an observed bump, and the RFC " +
				"itself supplies the reason no observer can adjudicate it: the two candidate causes " +
				"(server SHOULD-violation vs. a genuine set-then-unset in another session) are " +
				"declared indistinguishable on the wire even to the client. No black-box exchange " +
				"can therefore construct a pass/fail boundary for 'relying'.",
			notes:
				"Explicit client MUST NOT. The preceding quality-of-implementation rule ('Adding the " +
				"flag when it is already present ... SHOULD NOT change the mod-sequence') binds " +
				"servers and is excluded. Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},

		// ── §4 Long Command Lines (Update to RFC 2683) ───────────────────────────

		{
			id: "RFC7162-4-1",
			source: "RFC7162",
			section: "4",
			title: "Client should keep command lines to ~8192 octets; split or use literals",
			text:
				"The updated recommendation is as follows: a client should limit the length of the " +
				"command lines it generates to approximately 8192 octets (including all quoted " +
				"strings but not including literals). If the client is unable to group things into " +
				"ranges so that the command line is within that length, it should split the request " +
				"into multiple commands. The client should use literals instead of long quoted " +
				"strings in order to keep the command length down.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "performance-expectation",
			untestableRationale:
				"A quality/efficiency recommendation with no crisp compliance boundary: the limit is " +
				"'approximately 8192 octets', so no matcher can draw a defensible pass/fail line " +
				"(8193? 9000? 12000?) without inventing a threshold the RFC deliberately left fuzzy. " +
				"The grouping/splitting duty also operates on data the client does not originate in " +
				"this harness: the UID sets that would blow past the limit are supplied verbatim by " +
				"the caller (the library performs no set compaction or request splitting of its " +
				"own), so an over-long line would attribute to harness input, not to the client's " +
				"range-grouping discipline. Like the taxonomy's defining member, the sentence " +
				"encodes an expectation about resource-conscious behavior rather than a bounded " +
				"protocol obligation.",
			notes:
				"Judgment level: lowercase 'should' ×3 (RFC 7162 cites RFC 2119 only, so lowercase " +
				"is non-normative) — leveled SHOULD because the section is an explicit standards-" +
				"action update to RFC 2683 §3.2.1.5's recommendation and is this document's stated " +
				"purpose ('This document updates recommended line-length limits'). Conditional: the " +
				"trigger is CONDSTORE/QRESYNC clients sending long UID sequence sets (the section's " +
				"own motivation). Standalone in rev2, so [\"rev1\",\"rev2\"].",
		},

		// ── §3.2.3 Use of ENABLE ─────────────────────────────────────────────────

		{
			id: "RFC7162-3.2.3-1",
			source: "RFC7162",
			section: "3.2.3",
			title: "Client making use of QRESYNC MUST issue ENABLE QRESYNC once authenticated",
			text:
				"A client making use of QRESYNC MUST issue \"ENABLE QRESYNC\" once it is " +
				"authenticated.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Explicit client MUST. Per the same section, 'ENABLE QRESYNC' and 'ENABLE QRESYNC " +
				"CONDSTORE' are equivalent CONDSTORE enabling commands and parameter order is not " +
				"significant — but plain 'ENABLE CONDSTORE' does NOT enable QRESYNC ('there is no " +
				"requirement for a compliant server to support \"ENABLE CONDSTORE\" by itself'). " +
				"Testable black-box: a client driven to use any QRESYNC feature must emit ENABLE " +
				"with QRESYNC among its arguments after authentication and before the feature use " +
				"(self-actualizing, and genuinely so as of M4.6 — driver.select() with qresync " +
				"emits the parameter for real, gated on a positive ENABLE QRESYNC). Conditional on " +
				"using QRESYNC; standalone in rev2 (rev2 servers still require ENABLE QRESYNC for " +
				"QRESYNC), so " +
				"[\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC7162-3.2.3-2",
			source: "RFC7162",
			section: "3.2.3",
			title: "Client (implicit) MUST NOT use QRESYNC param or VANISHED modifier without ENABLED QRESYNC",
			text:
				"A server MUST respond with a tagged BAD response if the QRESYNC parameter to the " +
				"SELECT/EXAMINE command or the VANISHED UID FETCH modifier is specified and the " +
				"client hasn't issued \"ENABLE QRESYNC\", or the server has not positively responded " +
				"(in the current connection) to that command with the untagged ENABLED response " +
				"containing QRESYNC.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment call: the MUST binds the server's BAD enforcement; the reciprocal client " +
				"prohibition — do not send SELECT/EXAMINE (QRESYNC ...) or UID FETCH ... VANISHED " +
				"until ENABLE QRESYNC has been issued AND positively answered with '* ENABLED " +
				"QRESYNC' in the current connection — is the client-side duty (disclosed per the " +
				"reciprocal-duty precedent; the ENABLED-response condition incorporates RFC 5162 " +
				"errata 1365, Appendix B). Distinct from RFC7162-3.2.3-1: -1 requires issuing " +
				"ENABLE; this entry forbids using the features before the positive ENABLED " +
				"confirmation arrives (a pipelining-shaped ordering duty). §3.2.5's first paragraph " +
				"restates the SELECT half verbatim-adjacent; cataloged once here. Testable " +
				"black-box: an ENABLE-less (or negatively-answered) session must never see the " +
				"QRESYNC parameter or VANISHED modifier. Conditional; standalone in rev2, so " +
				"[\"rev1\",\"rev2\"].",
		},

		// ── §3.2.5 QRESYNC Parameter to SELECT/EXAMINE ───────────────────────────

		{
			id: "RFC7162-3.2.5-1",
			source: "RFC7162",
			section: "3.2.5",
			title: "QRESYNC select parameter form: uidvalidity, modseq, optional known-uids, optional seq-match-data",
			text:
				"The Quick Resynchronization parameter to SELECT/EXAMINE commands has four " +
				"arguments: o the last known UIDVALIDITY, o the last known modification sequence, o " +
				"the optional set of known UIDs, and o an optional parenthesized list of known " +
				"sequence ranges and their corresponding UIDs.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: parameter definition, no client-directed keyword — a mechanism the " +
				"client MAY use; when used, the form binds per §7: select-param =/ \"QRESYNC\" SP " +
				"\"(\" uidvalidity SP mod-sequence-value [SP known-uids] [SP seq-match-data] \")\", " +
				"with known-uids a sequence-set where per the ABNF comment '\"*\" is not allowed' " +
				"(e.g. 'A03 SELECT INBOX (QRESYNC (67890007 90060115194045000 41:211,214:541))'). " +
				"The section's server-side argument-verification/UIDVALIDITY-mismatch rules are " +
				"server duties (excluded; the client's mismatch reaction is scored at RFC7162-6-4). " +
				"Testable (emission form; genuinely real as of M4.6 — driver.select() with qresync " +
				"emits the parameter for real). Conditional on QRESYNC use (and gated by " +
				"RFC7162-3.2.3-2); standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC7162-3.2.5.1-1",
			source: "RFC7162",
			section: "3.2.5.1",
			title: "Client MUST accept the QRESYNC resync stream: UID-bearing FETCH plus expunge reports",
			text:
				"The server sends the client any pending flag changes (using FETCH responses that " +
				"MUST contain UIDs) and expunges those that have occurred in this mailbox since the " +
				"provided modification sequence. ... Without the message sequence number matching " +
				"information, the result of this step is semantically equivalent to the client " +
				"issuing: tag1 UID FETCH \"known-uids\" (FLAGS) (CHANGEDSINCE \"mod-sequence- " +
				"value\" VANISHED)",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Server-worded (emission) sentences; extracted client duty is the reciprocal " +
				"ACCEPTANCE obligation (judgment call, disclosed): a client selecting with the " +
				"QRESYNC parameter must consume, inside the SELECT/EXAMINE response stream, untagged " +
				"FETCH responses carrying UID+FLAGS+MODSEQ for pending flag changes AND the expunge " +
				"report ('* VANISHED (EARLIER) 41,43:116,...' per the §3.2.5.1 example) before the " +
				"tagged OK — and per the semantic-equivalence sentence, all §3.2.6 requirements " +
				"apply. The 'mod-sequence- value' spacing preserves the RFC's own line wrap " +
				"(whitespace-flattened verbatim). §3.2.4's UID-inclusion rule for later unsolicited " +
				"FETCHes is the same acceptance surface (server emission, not separately scored). " +
				"Testable, split parse surface: the UID/FLAGS/MODSEQ FETCH items are REAL (fetch " +
				"parsers incl. modseq.ts); VANISHED has NO parse path in src/ (zero grep hits) — " +
				"the spec batch measures the honest outcome on the VANISHED half. Conditional; " +
				"standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC7162-3.2.5.2-1",
			source: "RFC7162",
			section: "3.2.5.2",
			title: "seq-match-data MAY be provided; both sets MUST be in ascending order",
			text:
				"A client MAY provide a parenthesized list of a message sequence set and the " +
				"corresponding UID sets. Both MUST be provided in ascending order. The server uses " +
				"this data to restrict the range for which it provides expunged message information.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Two explicit keywords: the MAY grants the fourth QRESYNC argument (seq-match-data = " +
				"\"(\" known-sequence-set SP known-uid-set \")\" per §7, both sequence-sets with '*' " +
				"disallowed and pairwise-corresponding in ascending order); the MUST binds the " +
				"client's construction of it — the entry is leveled at the binding MUST since the " +
				"permission half alone would be vacuous. Testable black-box: whenever the client " +
				"emits seq-match-data, assert both member sets ascend and align pairwise " +
				"(self-actualizing, and genuinely so as of M4.6 — driver.select() with qresync " +
				"emits seq-match-data for real). Conditional (binds only when the client uses the " +
				"optional argument); standalone in rev2, so [\"rev1\",\"rev2\"].",
		},

		// ── §3.2.6 VANISHED UID FETCH Modifier ───────────────────────────────────

		{
			id: "RFC7162-3.2.6-1",
			source: "RFC7162",
			section: "3.2.6",
			title: "Client (implicit) MUST NOT use the VANISHED modifier with plain FETCH",
			text:
				"Note that the VANISHED UID FETCH modifier is NOT allowed with a FETCH command. The " +
				"server MUST return a tagged BAD response if this response is specified as a " +
				"modifier to the FETCH command.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment call: 'is NOT allowed' (capitalized NOT, not an RFC 2119 compound) plus " +
				"the server's MUST-BAD enforcement — the reciprocal client prohibition is that " +
				"VANISHED may only ever modify UID FETCH, never sequence-number FETCH (disclosed per " +
				"the reciprocal-duty precedent; §7 rexpunges-fetch-mod comment: 'It is only allowed " +
				"in the UID FETCH command.'). Testable black-box: a compliant client driven to " +
				"resynchronize by message number must not emit 'FETCH ... (... VANISHED)' " +
				"(self-actualizing, and genuinely so as of M4.6 — MailboxSession.runFetch()'s own " +
				"RangeError gate refuses a bare-FETCH `vanished` caller client-side). Conditional; " +
				"standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC7162-3.2.6-2",
			source: "RFC7162",
			section: "3.2.6",
			title: "VANISHED modifier MUST only be specified together with CHANGEDSINCE",
			text:
				"The VANISHED UID FETCH modifier MUST only be specified together with the " +
				"CHANGEDSINCE UID FETCH modifier. If the VANISHED UID FETCH modifier is used without " +
				"the CHANGEDSINCE UID FETCH modifier, the server MUST respond with a tagged BAD " +
				"response.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"The first MUST directly binds the command's construction (the client is the party " +
				"specifying modifiers), making this the rare explicitly-keyworded emission duty; the " +
				"second sentence is the server's enforcement counterpart. A compliant client's " +
				"VANISHED always rides with CHANGEDSINCE: 'UID FETCH 300:500 (FLAGS) (CHANGEDSINCE " +
				"12345 VANISHED)'. Testable black-box: assert any emitted VANISHED modifier is " +
				"accompanied by CHANGEDSINCE in the same modifier list (self-actualizing today). " +
				"Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC7162-3.2.6-3",
			source: "RFC7162",
			section: "3.2.6",
			title: "UID FETCH (CHANGEDSINCE n VANISHED) form and its VANISHED (EARLIER) reply",
			text:
				"The VANISHED UID FETCH modifier instructs the server to report those messages from " +
				"the UID set parameter that have been expunged and whose associated mod-sequence is " +
				"larger than the specified mod-sequence. That is, the client requests to be informed " +
				"of messages from the specified set that were expunged since the specified " +
				"mod-sequence. ... The expunged messages are reported using the VANISHED (EARLIER) " +
				"response as described in Section 3.2.10.1. Any VANISHED (EARLIER) responses MUST be " +
				"returned before any FETCH responses, otherwise the client might get confused about " +
				"how message numbers map to UIDs.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: modifier semantics definition — a mechanism the client MAY invoke " +
				"(its two construction constraints are separately scored at RFC7162-3.2.6-1/-2). " +
				"The client-binding content when used: emit 'UID FETCH <known-uids> <items> " +
				"(CHANGEDSINCE <modseq> VANISHED)' and consume the reply shape — VANISHED (EARLIER) " +
				"listing expunged UIDs arriving BEFORE the FETCH responses (the trailing MUST binds " +
				"server ordering; the client must tolerate that ordering rather than expect FETCH " +
				"data first). Elision skips the mod-sequence-update cross-reference sentence and the " +
				"<minmodseq> server rule. Testable: emission self-actualizing today; the reply-" +
				"acceptance half shares RFC7162-3.2.10.1-1's honest VANISHED probe result (no parse " +
				"path in src/). Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},

		// ── §3.2.7 EXPUNGE Command (and §3.2.9 UID EXPUNGE) ──────────────────────

		{
			id: "RFC7162-3.2.7-1",
			source: "RFC7162",
			section: "3.2.7",
			title: "Client MUST accept [HIGHESTMODSEQ n] on the tagged OK of (UID) EXPUNGE",
			text:
				"If at least one message got expunged and QRESYNC was enabled, the server MUST send " +
				"the updated per-mailbox modification sequence using the HIGHESTMODSEQ response code " +
				"(see Section 3.1.2.1) in the tagged OK response.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Server-worded MUST; extracted client duty is the reciprocal PARSE obligation " +
				"(judgment call, disclosed): a QRESYNC-enabled client must accept a tagged 'OK " +
				"[HIGHESTMODSEQ <n>]' completion for EXPUNGE — and the verbatim-identical sentence " +
				"in §3.2.9 extends the same duty to UID EXPUNGE (cataloged once here; §3.2.9 adds no " +
				"distinct client-binding text). The §3.2.7/§3.2.9 example notes record that without " +
				"QRESYNC enabled the response code's presence is optional and absent for NOMODSEQ " +
				"mailboxes — the client must tolerate both presence and absence. Testable REAL: " +
				"text.code.ts parses HIGHESTMODSEQ (64-bit-capable NumberTextCode) on tagged " +
				"responses. Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC7162-3.2.7-2",
			source: "RFC7162",
			section: "3.2.7",
			title: "Client MUST accept expunge results reported as VANISHED or EXPUNGE responses",
			text:
				"The EXPUNGE command permanently removes all messages that have the \\Deleted flag " +
				"set from the currently selected mailbox. Before returning an OK to the client, " +
				"those messages that are removed are reported using a VANISHED response or EXPUNGE " +
				"responses.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment call: the updated command definition ('Responses: untagged responses: " +
				"EXPUNGE or VANISHED') is keyword-less, but it redefines what a client issuing " +
				"EXPUNGE (or UID EXPUNGE, §3.2.9 — same updated definition) must be prepared to " +
				"consume before the tagged OK: EXPUNGE responses when QRESYNC is not enabled, a " +
				"VANISHED response ('* VANISHED 405,407,410,425', §3.2.7 example) when it is. The " +
				"general in-lieu-of-EXPUNGE rule is scored at RFC7162-3.2.10.2-1; this entry scores " +
				"the (UID) EXPUNGE command's own reporting acceptance (a distinct scripted " +
				"observable: EXPUNGE answered with VANISHED). PROBE: VANISHED has no parse path in " +
				"src/ (expunge.ts matches only 'n EXPUNGE') — the spec batch measures the honest " +
				"outcome. Conditional (QRESYNC enabled + client expunges); standalone in rev2, so " +
				"[\"rev1\",\"rev2\"].",
		},

		// ── §3.2.10 VANISHED Response ────────────────────────────────────────────

		{
			id: "RFC7162-3.2.10.1-1",
			source: "RFC7162",
			section: "3.2.10.1",
			title: "Client MUST accept the VANISHED (EARLIER) response to UID FETCH (VANISHED) / SELECT (QRESYNC)",
			text:
				"The VANISHED (EARLIER) response is caused by a UID FETCH (VANISHED) or a " +
				"SELECT/EXAMINE (QRESYNC) command. This response is sent if the UID set parameter to " +
				"the UID FETCH (VANISHED) command includes UIDs of messages that are no longer in " +
				"the mailbox.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment call: response definition without a client-directed keyword, but " +
				"acceptance is the non-optional counterpart of the two commands that provoke it " +
				"(reciprocal-parse precedent): a client that used UID FETCH ... (CHANGEDSINCE n " +
				"VANISHED) or SELECT ... (QRESYNC ...) must parse '* VANISHED (EARLIER) " +
				"<known-uids>' (§7 expunged-resp = \"VANISHED\" [SP \"(EARLIER)\"] SP known-uids) — " +
				"a UID list, possibly a large set like '41,43:116,118,120:211,214:540', NOT a " +
				"message number like EXPUNGE. What the client must NOT do with it (decrement " +
				"sequence numbers) is RFC7162-3.2.10.1-2. PROBE: VANISHED has zero hits in src/ — " +
				"no parse path exists; testable regardless (the spec batch scripts the response via " +
				"connectLow and measures the honest violation/unimplemented outcome). Conditional; " +
				"standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC7162-3.2.10.1-2",
			source: "RFC7162",
			section: "3.2.10.1",
			title: "Client MUST NOT decrement message sequence numbers on VANISHED (EARLIER)",
			text:
				"When the client sees a VANISHED EARLIER response, it MUST NOT decrement message " +
				"sequence numbers for each successive message in the mailbox.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-state",
			untestableRationale:
				"The prohibition governs the client's internal message-number model: on VANISHED " +
				"(EARLIER) — unlike EXPUNGE or a plain VANISHED — the client must leave its " +
				"sequence-number-to-message mapping untouched, because the reported UIDs were never " +
				"part of the current session's numbering. The client emits nothing in response, so a " +
				"compliant and a non-compliant bookkeeper produce byte-identical traffic at the " +
				"moment of receipt. The divergence could only ever surface through a LATER command " +
				"that depends on the client's own sequence-number arithmetic, and in this headless " +
				"library no such arithmetic exists to observe: sequence numbers in subsequent " +
				"commands are chosen by the caller and passed through verbatim (the library " +
				"maintains no seq-to-UID map), so no black-box exchange can attribute a shifted " +
				"model to the client. Same consumer-delegation rebuttal as RFC9051-2.3.1.1-1.",
			notes:
				"Explicit client MUST NOT (note the RFC drops the parens here: 'a VANISHED EARLIER " +
				"response'). The complementary positive duty for the tag-less form (DO adjust " +
				"numbering) is RFC7162-3.2.10.2-2. Conditional; standalone in rev2, so " +
				"[\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC7162-3.2.10.2-1",
			source: "RFC7162",
			section: "3.2.10.2",
			title: "After ENABLED QRESYNC, client MUST accept VANISHED in lieu of EXPUNGE for the whole connection",
			text:
				"Once a client has issued \"ENABLE QRESYNC\" (and the server has positively " +
				"responded to that command with the untagged ENABLED response containing QRESYNC), " +
				"the server MUST use the VANISHED response without the EARLIER tag instead of the " +
				"EXPUNGE response for all mailboxes that don't return NOMODSEQ when selected. The " +
				"server continues using VANISHED in lieu of EXPUNGE for the duration of the " +
				"connection.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Server-worded MUST; extracted client duty is the reciprocal ACCEPTANCE obligation " +
				"(judgment call, disclosed): by enabling QRESYNC the client commits to receiving " +
				"'* VANISHED <uids>' (no EARLIER tag) wherever RFC 3501 would have sent '* n " +
				"EXPUNGE' — for EXPUNGE, UID EXPUNGE, and expunges from other connections — for the " +
				"rest of the connection, on every non-NOMODSEQ mailbox. Appendix B delta: upgraded " +
				"from SHOULD (RFC 5162) to MUST. The same paragraph's 'Such a VANISHED response MUST " +
				"NOT contain the EARLIER tag' and §3.2.10's servers-MUST-NOT-combine-forms are " +
				"server emission constraints (excluded). PROBE: no VANISHED parse path in src/ — " +
				"testable with the honest outcome measured by the spec batch (this is the headline " +
				"expected violation/unimplemented finding for QRESYNC). Conditional; standalone in " +
				"rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC7162-3.2.10.2-2",
			source: "RFC7162",
			section: "3.2.10.2",
			title: "Client decrements message count / adjusts numbering per VANISHED and MUST record the update",
			text:
				"Unlike VANISHED (EARLIER), this response also decrements the number of messages in " +
				"the mailbox and adjusts the message sequence numbers for the messages remaining in " +
				"the mailbox to account for the expunged messages. ... This means that each UID " +
				"listed in a VANISHED response results in the client decrementing the message count " +
				"by one. ... The update from the VANISHED response MUST be recorded by the client.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-state",
			untestableRationale:
				"All three quoted sentences govern the client's internal mailbox model after a " +
				"tag-less VANISHED: shrink the message count by one per listed UID, renumber the " +
				"remaining messages EXPUNGE-style, and record the update. None of that produces a " +
				"wire artifact at the time it happens — the client sends nothing in response " +
				"(§3.2.10.2 even notes the server need not send EXISTS 'because of this " +
				"housekeeping', removing the one exchange that could have echoed the client's " +
				"count). As with RFC7162-3.2.10.1-2, the divergence could only surface through " +
				"later sequence-number-dependent commands, and this headless library maintains no " +
				"sequence-number model of its own — message numbers in later commands are " +
				"caller-supplied and passed through — so no black-box exchange can attribute a " +
				"wrong count or stale numbering to the client's bookkeeping.",
			notes:
				"First two sentences are keyword-less authoritative semantics (leveled MUST by " +
				"judgment, matching the entry's third sentence — an explicit 'MUST be recorded'); " +
				"the elisions skip the server-side visible-messages framing rules between them " +
				"(servers MUST NOT send UIDs for previously expunged / unannounced messages; " +
				"VANISHED MUST NOT be sent with no command in progress or during FETCH/STORE/SEARCH " +
				"— all server emission constraints, excluded). Conditional; standalone in rev2, so " +
				"[\"rev1\",\"rev2\"].",
		},

		// ── §3.2.11 CLOSED Response Code ─────────────────────────────────────────

		{
			id: "RFC7162-3.2.11-1",
			source: "RFC7162",
			section: "3.2.11",
			title: "Client MUST accept [CLOSED] and treat it as the old/new mailbox response boundary",
			text:
				"A server implementing the extension defined in this document MUST return the CLOSED " +
				"response code when the currently selected mailbox is closed implicitly using the " +
				"SELECT/EXAMINE command on another mailbox. The CLOSED response code serves as a " +
				"boundary between responses for the previously opened mailbox (which was closed) and " +
				"the newly selected mailbox; all responses before the CLOSED response code relate to " +
				"the mailbox that was closed, and all subsequent responses relate to the newly " +
				"opened mailbox.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "testable",
			notes:
				"Server-worded MUST; the client duty is the reciprocal one — accept '* OK [CLOSED]' " +
				"during a mailbox switch and attribute untagged responses before it to the old " +
				"mailbox and after it to the new (judgment call, disclosed). Applies 'whether or not " +
				"a CONDSTORE enabling command was issued' whenever the server advertises QRESYNC or " +
				"CONDSTORE (§3.2.11's closing paragraph), and is never sent for CLOSE/UNSELECT. " +
				"Acceptance is REAL (text.code.ts AtomTextCode fallback tolerates the parameterless " +
				"code). REV2 ADJUDICATION — [\"rev1\"] only: the CLOSED response code is folded into " +
				"IMAP4rev2 core and the identical client duty (boundary semantics, same sentence) " +
				"is already scored as RFC9051-7.1-9; per the rev2-core double-scoring rule this " +
				"entry is tagged rev1-only with that cross-reference.",
		},

		// ── §6 Updated Synchronization Sequence ──────────────────────────────────

		{
			id: "RFC7162-6-1",
			source: "RFC7162",
			section: "6",
			title: "Disconnected client SHOULD use QRESYNC when supported, else CONDSTORE",
			text:
				"An advanced disconnected mail client SHOULD use the QRESYNC extension when it is " +
				"supported by the server and SHOULD use CONDSTORE if it is supported and QRESYNC is " +
				"not.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "user-intent-policy",
			untestableRationale:
				"A feature-adoption preference between compliant alternatives: a client that " +
				"synchronizes without either extension is fully protocol-compliant (both are " +
				"OPTIONAL capabilities), so no black-box exchange can construct a failing " +
				"observation — the absence of QRESYNC/CONDSTORE traffic is also the compliant " +
				"behavior of a client whose deployment or product policy chose not to be an " +
				"'advanced disconnected mail client' at all. Whether the implementation is in the " +
				"duty's addressed class is a product-policy fact with no wire signature, the same " +
				"structure as RFC4978-1-1 (MAY use COMPRESS, RECOMMENDED prefer TLS compression — " +
				"user-intent-policy).",
			notes:
				"Explicit SHOULD ×2, bound to a qualified subject ('advanced disconnected mail " +
				"client'). §3.2.1's 'it is strongly encouraged that clients that support " +
				"[CONDSTORE] also support QRESYNC' is the same advice without an RFC 2119 keyword " +
				"(not separately extracted). Conditional; standalone in rev2, so " +
				"[\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC7162-6-2",
			source: "RFC7162",
			section: "6",
			title: "Client MUST cache HIGHESTMODSEQ after sync and update it on later response codes",
			text:
				"The client uses the value from the HIGHESTMODSEQ OK response code received on the " +
				"mailbox opening to determine if it needs to resynchronize. Once the synchronization " +
				"is complete, it MUST cache the received value (unless the mailbox UIDVALIDITY value " +
				"has changed; see below). The client MUST update its copy of the HIGHESTMODSEQ value " +
				"whenever the server sends a subsequent HIGHESTMODSEQ OK response code.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "cross-session",
			untestableRationale:
				"Both MUSTs govern the client's synchronization cache, whose only purpose — and " +
				"only potential observable — is the value the client presents in a FUTURE session's " +
				"QRESYNC parameter or CHANGEDSINCE argument. Within the session where the caching " +
				"duty fires, compliant and non-compliant clients emit identical traffic. Taxonomy " +
				"mechanism (b) (sequential multi-connection scripts) evaluated and rebutted: a " +
				"second scripted connection could observe the re-presented value only if the client " +
				"itself sourced it from its cache, but this headless library keeps no cross-session " +
				"synchronization state — every modseq the driver emits is caller-supplied per " +
				"command — so a second-session value attributes to harness input, not to the " +
				"client's caching discipline (RFC9051-2.3.1.1-1 rebuttal pattern).",
			notes:
				"Two explicit client MUSTs (the first sentence is descriptive context). The " +
				"UIDVALIDITY carve-out cross-references RFC7162-6-4; the delete-on-UIDVALIDITY-" +
				"change twin from §3.1.2.1 is RFC7162-3.1.2.1-1. Conditional (binds a client " +
				"maintaining a disconnected-sync cache); standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC7162-6-3",
			source: "RFC7162",
			section: "6",
			title: "HIGHESTMODSEQ recalculation discipline at each tagged response",
			text:
				"After completing a full synchronization, the client MUST also take note of any " +
				"unsolicited MODSEQ FETCH data items and HIGHESTMODSEQ response codes received from " +
				"the server. Whenever the client receives a tagged response to a command, it checks " +
				"the received unsolicited responses to calculate the new HIGHESTMODSEQ value. If the " +
				"HIGHESTMODSEQ response code is received, the client MUST use it even if it has seen " +
				"higher mod-sequences. Otherwise, the client calculates the highest value among all " +
				"MODSEQ FETCH data items received since the last tagged response. If this value is " +
				"bigger than the client's copy of the HIGHESTMODSEQ value, then the client MUST use " +
				"this value as its new HIGHESTMODSEQ value.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-state",
			untestableRationale:
				"An arithmetic discipline over the client's internal copy of HIGHESTMODSEQ " +
				"(response-code-wins over observed MODSEQ items, batch recalculation at each tagged " +
				"response, monotonic take-if-bigger). The computation consumes wire inputs but " +
				"produces no wire output in the session where it runs: a client that follows the " +
				"algorithm and one that, say, eagerly adopts every MODSEQ item as it arrives (the " +
				"exact mistake §6's safety note warns against, because servers may deliver MODSEQ " +
				"items out of order and delay EXPUNGE/VANISHED with smaller mod-sequences) send " +
				"identical bytes. The stored result only matters as input to a future session's " +
				"resynchronization, and — per the cross-session rebuttal on RFC7162-6-2 — this " +
				"library keeps no such state for a second scripted session to expose; the " +
				"within-session bookkeeping itself is classic internal-state with no pass/fail wire " +
				"boundary.",
			notes:
				"Three explicit client MUSTs plus keyword-less connective steps quoted contiguously " +
				"(no elision). The section's trailing caution ('It is not safe to update the " +
				"client's copy ... as soon as it is received because servers are not required to " +
				"send MODSEQ FETCH data items in increasing mod-sequence order') is the rationale " +
				"for this discipline, folded here. Conditional; standalone in rev2, so " +
				"[\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC7162-6-4",
			source: "RFC7162",
			section: "6",
			title: "On UIDVALIDITY change, client MUST empty its cache, forget HIGHESTMODSEQ, drop pending UID actions",
			text:
				"If the UIDVALIDITY value returned by the server differs, the client MUST: * empty " +
				"the local cache of that mailbox; * \"forget\" the cached HIGHESTMODSEQ value for " +
				"the mailbox; and * remove any pending \"actions\" that refer to UIDs in that " +
				"mailbox.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "cross-session",
			untestableRationale:
				"A three-part purge of cross-session state (message cache, cached HIGHESTMODSEQ, " +
				"queued offline actions) triggered by a UIDVALIDITY mismatch after SELECT/EXAMINE " +
				"(QRESYNC). None of the three purges emits anything: a client that purges and one " +
				"that keeps stale state complete the SELECT identically. Mechanism (b) rebuttal as " +
				"on RFC7162-6-2: a later session could betray un-forgotten state only if the client " +
				"re-presented cached values or replayed stale UID actions of its own accord, but " +
				"this library neither persists a message cache nor queues offline actions — both " +
				"are consumer-delegated — so no sequential-connection script can attribute stale " +
				"emissions to the client's purge discipline. The trailing note ('this doesn't " +
				"affect actions performed on client-generated fake UIDs') further conditions the " +
				"duty on [IMAP-DISC] machinery the library does not implement.",
			notes:
				"Explicit client MUST with a three-item bullet list (bullets '*' preserved by " +
				"whitespace-flattening). This is the §6 amendment of [IMAP-DISC] step d-1 and the " +
				"QRESYNC-context twin of RFC7162-3.1.2.1-1 (same trigger, wider purge). " +
				"Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC7162-6-5",
			source: "RFC7162",
			section: "6",
			title: "On NOMODSEQ after SELECT (QRESYNC), client MUST drop its cached HIGHESTMODSEQ",
			text:
				"If upon a successful SELECT/EXAMINE (QRESYNC) command the client receives a " +
				"NOMODSEQ OK untagged response (instead of the HIGHESTMODSEQ response code), it MUST " +
				"remove the last known HIGHESTMODSEQ value from its cache and follow the more " +
				"general instructions in Section 3 of the [IMAP-DISC].",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "cross-session",
			untestableRationale:
				"The removal of a cached HIGHESTMODSEQ (plus a fallback to [IMAP-DISC]'s generic " +
				"resynchronization procedure) is cache maintenance whose effect is only meaningful " +
				"for a future session's sync decision; in the session where NOMODSEQ arrives the " +
				"client's next commands are the generic resync either way, and whether the stale " +
				"value was actually deleted has no wire signature. Mechanism (b) rebuttal as on " +
				"RFC7162-6-2/-6-4: the library holds no cross-session HIGHESTMODSEQ cache — the " +
				"QRESYNC modseq argument is caller-supplied — so a second scripted session cannot " +
				"attribute a re-presented stale value to the client's own cache. The wire-facing " +
				"half (accepting the NOMODSEQ response code at all) is separately scored and " +
				"testable as RFC7162-3.1.2-1.",
			notes:
				"Explicit client MUST. Conditional (binds a QRESYNC client caching HIGHESTMODSEQ); " +
				"standalone in rev2, so [\"rev1\",\"rev2\"].",
		},

		// ── §7 Formal Syntax ─────────────────────────────────────────────────────

		{
			id: "RFC7162-7-1",
			source: "RFC7162",
			section: "7",
			title: "Client MUST accept full-range unsigned 63-bit mod-sequence values",
			text:
				"mod-sequence-value = 1*DIGIT ;; Positive unsigned 63-bit integer ;; (mod-sequence) " +
				";; (1 <= n <= 9,223,372,036,854,775,807).",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment call: grammar-derived acceptance duty, no prose keyword — every place a " +
				"client consumes a mod-sequence (MODSEQ fetch items, HIGHESTMODSEQ response code " +
				"and status item, SEARCH/SORT (MODSEQ n) suffixes) the value may be any integer up " +
				"to 2^63-1, far beyond JavaScript's Number.MAX_SAFE_INTEGER (2^53-1), so a client " +
				"that truncates or rejects large values mis-handles compliant servers. §3.1's note " +
				"records the delta from RFC 4551/5162: 'this version of the document redefines them " +
				"as unsigned 63-bit values' (previously 64-bit) — the obsoleting document's range " +
				"governs. Testable REAL: the lexer produces bigint tokens and fetch/modseq.ts, " +
				"text.code.ts (HIGHESTMODSEQ with allow64BitNumber), status.ts, and search.ts all " +
				"accept number|bigint — a genuine pass test with e.g. MODSEQ (9223372036854775807). " +
				"Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
	],
};

export default rfc7162;
