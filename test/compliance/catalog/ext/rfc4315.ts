import type { CatalogModule } from "../types";

const rfc4315: CatalogModule = {
	source: "RFC4315",
	extractionNote:
		"RFC 4315 (Internet Message Access Protocol (IMAP) - UIDPLUS extension; obsoletes " +
		"RFC 2359) fully reviewed for client-binding requirements. " +
		"SECTIONS REVIEWED: Abstract, §1 Introduction and Overview (incl. §1.1 Conventions), " +
		"§2 Additional Commands (§2.1 UID EXPUNGE Command), §3 Additional Response Codes " +
		"(APPENDUID, COPYUID, UIDNOTSTICKY definitions), §4 Formal Syntax, §5 Security " +
		"Considerations, §6 IANA Considerations, §7/§8 References, §9 Changes from RFC 2359, " +
		"Author's Address, and the boilerplate (Copyright, IP). " +
		"CLIENT/SERVER SPLIT: UIDPLUS is a small extension whose normative weight is mostly " +
		"on the SERVER. Server-only duties excluded from this catalog: (a) §1's SHOULD that " +
		"servers return the new response codes 'regardless of whether or not the UIDPLUS " +
		"extension is implemented' ('this document recommends new status response codes in " +
		"IMAP that SHOULD be returned by all server implementations, regardless of whether or " +
		"not the UIDPLUS extension is implemented.'); (b) §3's SHOULD that 'server " +
		"implementations that advertise the UIDPLUS extension SHOULD return these response " +
		"codes.'; (c) §3's SHOULD NOT that in a COPY/APPEND-but-not-SELECT/EXAMINE mailbox " +
		"'the server SHOULD NOT send an APPENDUID or COPYUID response code as it would " +
		"disclose information about the mailbox.'; (d) §3's MAY that in a UIDNOTSTICKY mailbox " +
		"'the server MAY omit the APPENDUID or COPYUID response code as it is not " +
		"meaningful.'; (e) §3's APPENDUID single-message MUST NOT ('the UID set form of the " +
		"APPENDUID response code MUST NOT be used if only a single message was appended.' plus " +
		"'a server MUST NOT send a range such as 123:123') — server response-generation " +
		"invariants; (f) §3's UIDNOTSTICKY 'Note: servers SHOULD NOT have any UIDNOTSTICKY " +
		"mail stores.' (server storage-architecture guidance, cross-referenced by " +
		"RFC9051-7.1-7); (g) §5's Security SHOULD NOT ('these response codes SHOULD NOT be " +
		"issued if the client does not have access to SELECT or EXAMINE the mailbox.') — a " +
		"restatement of (c) binding the server. §4 Formal Syntax is pure ABNF (uid-expunge, " +
		"resp-code-apnd/-copy, uid-set, uid-range, the UIDPLUS/APPENDUID/COPYUID/UIDNOTSTICKY " +
		"tokens) — grammar, not prose duties, and not separately cataloged; unlike several " +
		"sibling extensions RFC 4315 has NO 'implementations MUST accept these strings case-" +
		"insensitively' sentence in §4, so no §4 case-insensitivity entry exists. §6 IANA, " +
		"§9 Changes-from-2359, and the boilerplate contain no client-binding normative " +
		"language. §1's 'The added facilities of the features in UIDPLUS are optimizations; " +
		"clients can provide equivalent functionality, albeit less efficiently, by using " +
		"facilities in the base protocol.' is descriptive (keyword-less 'can'), imposing no " +
		"duty, and is not cataloged. " +
		"CLIENT-BINDING ENTRIES (7): the UID EXPUNGE command the client may emit and the " +
		"\\Deleted-only-within-the-UID-set semantic contract it relies on (2.1-1, testable — " +
		"self-actualizing fail, driver.uidExpunge throws NotImplementedError); the two server-" +
		"unsupported fallback strategies — STORE-toggle-then-EXPUNGE (2.1-2) and plain-EXPUNGE " +
		"(2.1-3) — both keyword-less-imperative prose (lowercase 'should'/'may'), untestable " +
		"internal-decision fallback-policy choices; the discover-via-SELECT/FETCH/SEARCH " +
		"fallback when the resp codes are absent (3-1, keyword-less 'can', untestable internal-" +
		"decision); the client's implicit duty to accept and interpret the APPENDUID (3-2) and " +
		"COPYUID (3-3) response codes in the tagged OK to APPEND/COPY; and the client's " +
		"implicit duty to accept the UIDNOTSTICKY response code in an untagged NO to SELECT " +
		"(3-4). Entries 3-2/3-3/3-4 are judgment-level implicit client duties (the RFC's " +
		"response-code definitions are phrased descriptively — 'indicates that...', 'is " +
		"returned in...' — with no RFC 2119 keyword binding the CLIENT to accept them; the " +
		"duty is inferred from the base-protocol MUST that a client accept any response and " +
		"remember critical data, RFC3501-7-*/RFC9051-7-1/7-2). Testable: 2.1-1, 3-2, 3-3, 3-4 " +
		"(all self-actualizing or driveable via scripted resp-codes; 3-2/3-3/3-4 verify the " +
		"client does not error on a well-formed APPENDUID/COPYUID/UIDNOTSTICKY). Untestable: " +
		"2.1-2, 2.1-3, 3-1 (three internal-decision fallback-policy entries). " +
		"REV2-CORE ADJUDICATION (RFC 9051 double-scoring discipline): RFC 9051 did NOT fold " +
		"the UIDPLUS client duties into rev2 core in a way that creates identical catalogued " +
		"duties, so every entry here keeps profiles: [\"rev1\",\"rev2\"]. Per duty: (1) UID " +
		"EXPUNGE (2.1-1) — RFC 9051 §6.4.9 DOES fully define UID EXPUNGE as absorbed rev2-base " +
		"(the second form of the UID command, absorbed from RFC 4315, with the identical " +
		"\\Deleted-only-within-the-UID-set semantics). BUT the rfc9051 catalog (catalog/rfc9051/" +
		"s6-selected.ts §6.4.9 note) deliberately declines to catalogue any client-binding UID " +
		"EXPUNGE duty: its use for disconnected resynchronization is stated with 'can ensure' " +
		"(advisory) and carries no client 2119 keyword, so the rfc9051 catalog scores no " +
		"UID EXPUNGE client duty. There is thus no rev2-core counterpart to double-score against, " +
		"so UID EXPUNGE stays dual-profile — a rev2 client that uses UID EXPUNGE is held to it " +
		"only through this document; kept [\"rev1\",\"rev2\"]. (2)/(3) " +
		"APPENDUID/COPYUID acceptance (3-2/3-3) — RFC 9051 §7.1 DEFINES the APPENDUID and " +
		"COPYUID response codes but its catalog (RFC9051-7.1 note in s7-responses-a.ts) " +
		"records them as carrying NO client-binding MUST/SHOULD (server-side only); the only " +
		"catalogued rev2 COPYUID *client* duty, RFC9051-6.4.8-1, is the DISTINCT MOVE-specific " +
		"duty to parse COPYUID from an *untagged* OK before EXPUNGEs — not the UIDPLUS tagged-" +
		"OK-after-APPEND/COPY acceptance duty. There is thus no identical catalogued rev2-core " +
		"duty for the UIDPLUS APPENDUID/COPYUID acceptance, so 3-2/3-3 stay [\"rev1\",\"rev2\"] " +
		"(cross-referencing RFC9051-6.4.8-1 as related-but-distinct). (4) UIDNOTSTICKY (3-4) " +
		"— RFC9051-7.1-7 covers the UIDNOTSTICKY 'servers SHOULD NOT have such mail stores' " +
		"note as an untestable SERVER-focused entry; it does not restate the UIDPLUS client " +
		"duty to accept UIDNOTSTICKY in the untagged NO to SELECT, so 3-4 stays " +
		"[\"rev1\",\"rev2\"] (cross-referencing RFC9051-7.1-7). The fallback entries (2.1-2/" +
		"2.1-3/3-1) have no RFC 9051 counterpart at all. NO entry is tagged rev1-only, because " +
		"no UIDPLUS client duty is identical to an already-catalogued RFC 9051 rev2-core " +
		"client-binding entry. " +
		"Total: 7 client-binding entries (RFC4315-2.1-1..3, RFC4315-3-1..4). Untestable: 3 " +
		"(RFC4315-2.1-2, RFC4315-2.1-3, RFC4315-3-1; all theme internal-decision).",
	requirements: [
		// ── §2.1 UID EXPUNGE Command ─────────────────────────────────────────────

		{
			id: "RFC4315-2.1-1",
			source: "RFC4315",
			section: "2.1",
			title: "UID EXPUNGE only expunges \\Deleted messages within the given UID set",
			text:
				"The UID EXPUNGE command permanently removes all messages that both have the " +
				"\\Deleted flag set and have a UID that is included in the specified sequence set " +
				"from the currently selected mailbox. If a message either does not have the " +
				"\\Deleted flag set or has a UID that is not included in the specified sequence " +
				"set, it is not affected.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"§2.1 UID EXPUNGE Command, definition paragraph. Verbatim (two consecutive " +
				"sentences). The paragraph is phrased as a command-behavior definition rather than " +
				"an RFC-2119-keyworded sentence; graded MUST as an implicit command-semantics " +
				"obligation — the command's defining contract that a client using UID EXPUNGE " +
				"relies on (only \\Deleted messages whose UID is in the set are removed; all others " +
				"are untouched). The client-binding surface is the command syntax the client emits " +
				"('UID' SP 'EXPUNGE' SP sequence-set, §4 ABNF uid-expunge) and this semantic " +
				"guarantee it depends on. Conditional: binds only when the client uses the UIDPLUS " +
				"UID EXPUNGE command. REV2: kept [\"rev1\",\"rev2\"] — RFC 9051 §6.4.9 DOES fully " +
				"define UID EXPUNGE as absorbed rev2-base (identical \\Deleted-only-within-the-UID-" +
				"set semantics), but the rfc9051 catalog (s6-selected.ts §6.4.9 note) scores NO " +
				"client-binding UID EXPUNGE duty (its resync use is advisory 'can ensure', no client " +
				"2119 keyword), so there is no rev2-core counterpart to double-score against — hence " +
				"the dual-profile tag stands in for a GAP in the rfc9051 catalog (RFC 9051 has the " +
				"command in its text but the catalog omits a scored client entry). IF rfc9051 later " +
				"gains a scored UID EXPUNGE client entry, this should be re-tagged rev1-only with a " +
				"cross-ref to that id. driver.uidExpunge() is genuinely real, so this row passes " +
				"for real. Testable by scripting a " +
				"UID EXPUNGE exchange and asserting the exact command atoms and sequence-set " +
				"argument; a plausible wrong implementation that emits plain EXPUNGE or an " +
				"ill-formed argument must be rejected.",
		},
		{
			id: "RFC4315-2.1-2",
			source: "RFC4315",
			section: "2.1",
			title: "Fallback when server lacks UIDPLUS: STORE-toggle \\Deleted around EXPUNGE",
			text:
				"If the server does not support the UIDPLUS capability, the client should fall " +
				"back to using the STORE command to temporarily remove the \\Deleted flag from " +
				"messages it does not want to remove, then issuing the EXPUNGE command. Finally, " +
				"the client should use the STORE command to restore the \\Deleted flag on the " +
				"messages in which it was temporarily removed.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"This is a keyword-less recommendation (lowercase 'should', graded SHOULD by " +
				"judgment) describing an internal fallback strategy the client may adopt when the " +
				"server does not advertise UIDPLUS. Which resynchronization strategy a client " +
				"chooses — this STORE-toggle-then-EXPUNGE dance, the plain-EXPUNGE shortcut of " +
				"2.1-3, or some other application-level approach — is an internal implementation " +
				"decision with no single mandated wire form: a client that never marks messages " +
				"\\Deleted in the first place, or that manages deletion entirely differently, is " +
				"equally compliant and would emit none of these commands. No black-box exchange " +
				"can distinguish 'chose not to run the STORE-toggle fallback because it uses a " +
				"different deletion model' from 'failed to implement the recommended fallback', so " +
				"there is no distinguishable pass/fail boundary. Conditional on the server lacking " +
				"UIDPLUS and on the client wanting selective expunge behavior at all.",
			notes:
				"§2.1, paragraph following the command definition. Verbatim (two sentences). " +
				"Judgment level: no RFC 2119 keyword; the two lowercase 'should's are graded " +
				"SHOULD per RFC 8174 (only UPPERCASE keywords are normative — this is imperative-" +
				"but-unkeyworded prose). REV2: kept [\"rev1\",\"rev2\"]; no RFC 9051 counterpart " +
				"(rev2 does not restate UIDPLUS fallback guidance).",
		},
		{
			id: "RFC4315-2.1-3",
			source: "RFC4315",
			section: "2.1",
			title: "Alternative fallback: plain EXPUNGE, risking unintended removals",
			text:
				"Alternatively, the client may fall back to using just the EXPUNGE command, " +
				"risking the unintended removal of some messages.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"A keyword-less permission (lowercase 'may', graded MAY by judgment) offering an " +
				"alternative fallback to 2.1-2: when the server lacks UIDPLUS, the client may just " +
				"issue a plain EXPUNGE and accept that other clients' \\Deleted-marked messages " +
				"could be removed. Being pure permission with an accepted risk, it imposes no " +
				"observable duty — a client that takes this shortcut, one that takes the safer " +
				"2.1-2 route, and one that uses neither are all compliant, and their choice is an " +
				"internal policy decision the wire cannot attribute (a plain EXPUNGE is " +
				"indistinguishable from an EXPUNGE issued for any other reason). No pass/fail " +
				"boundary exists. Conditional on the server lacking UIDPLUS.",
			notes:
				"§2.1, final paragraph of the section. Verbatim single sentence. Judgment level: " +
				"lowercase 'may' graded MAY per RFC 8174. REV2: kept [\"rev1\",\"rev2\"]; no RFC " +
				"9051 counterpart.",
		},

		// ── §3 Additional Response Codes ─────────────────────────────────────────

		{
			id: "RFC4315-3-1",
			source: "RFC4315",
			section: "3",
			title: "Discover copy/append destinations via SELECT/FETCH/SEARCH when resp codes absent",
			text:
				"If the server does not return the APPENDUID or COPYUID response codes, the client " +
				"can discover this information by selecting the destination mailbox. The location " +
				"of messages placed in the destination mailbox by COPY or APPEND can be determined " +
				"by using FETCH and/or SEARCH commands (e.g., for Message-ID or some unique marker " +
				"placed in the message in an APPEND).",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"A keyword-less capability statement (lowercase 'can', graded MAY by judgment) " +
				"telling the client how it MAY recover the destination UIDs when the server omits " +
				"APPENDUID/COPYUID: select the destination and use FETCH/SEARCH (e.g. on " +
				"Message-ID). Whether a client performs this recovery, and how it correlates " +
				"messages, is an internal application-level decision with no mandated wire form — " +
				"a client that does not need the UIDs, or that tracks them by other means, is " +
				"equally compliant and would issue none of these follow-up commands. No black-box " +
				"exchange distinguishes 'chose not to recover UIDs because it did not need them' " +
				"from 'failed to implement the recovery path', so there is no pass/fail boundary. " +
				"Conditional on the server omitting the APPENDUID/COPYUID response codes.",
			notes:
				"§3, paragraph preceding the APPENDUID definition. Verbatim (two sentences). " +
				"Judgment level: no RFC 2119 keyword; 'can discover'/'can be determined' is " +
				"keyword-less capability prose graded MAY per RFC 8174. REV2: kept " +
				"[\"rev1\",\"rev2\"]; no RFC 9051 counterpart.",
		},
		{
			id: "RFC4315-3-2",
			source: "RFC4315",
			section: "3",
			title: "Client (implicit) MUST accept the APPENDUID response code in the tagged OK to APPEND",
			text:
				"Followed by the UIDVALIDITY of the destination mailbox and the UID assigned to " +
				"the appended message in the destination mailbox, indicates that the message has " +
				"been appended to the destination mailbox with that UID. ... This response code is " +
				"returned in a tagged OK response to the APPEND command.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"§3, APPENDUID response-code definition (first sentence + closing delivery " +
				"sentence; the intervening MULTIAPPEND-uid-set and ascending-order paragraphs are " +
				"elided with '...'). Judgment level (implicit client-handling MUST): the RFC " +
				"defines APPENDUID descriptively ('indicates that...', 'is returned in...') with " +
				"no RFC 2119 keyword binding the CLIENT; the acceptance duty is inferred from the " +
				"base-protocol requirement that a client be prepared to accept any response and " +
				"remember critical data (RFC3501-7-1/7-2, RFC9051-7-1/7-2). A compliant client " +
				"must accept a tagged OK carrying '[APPENDUID <uidvalidity> <uid>]' as a normal " +
				"successful APPEND completion (not an error) and be able to expose the assigned " +
				"UID. REV2 ADJUDICATION: kept [\"rev1\",\"rev2\"]. RFC 9051 §7.1 defines the " +
				"APPENDUID response code but its catalog records the §7.1 definition as carrying " +
				"no client-binding MUST/SHOULD (server-side); the only catalogued rev2 COPYUID/" +
				"APPENDUID *client* duty, RFC9051-6.4.8-1, is the DISTINCT MOVE-specific parse-" +
				"COPYUID-from-untagged-OK duty, not this UIDPLUS tagged-OK-after-APPEND acceptance " +
				"— so this is not an identical catalogued rev2-core duty and is not double-scored. " +
				"Conditional on the client using APPEND against a UIDPLUS server. Testable: script " +
				"an APPEND whose tagged OK carries a well-formed [APPENDUID ...] and assert the " +
				"client completes successfully and surfaces the UID; a client that rejects or " +
				"mishandles the resp-code fails.",
		},
		{
			id: "RFC4315-3-3",
			source: "RFC4315",
			section: "3",
			title: "Client (implicit) MUST accept the COPYUID response code in the tagged OK to COPY",
			text:
				"Followed by the UIDVALIDITY of the destination mailbox, a UID set containing the " +
				"UIDs of the message(s) in the source mailbox that were copied to the destination " +
				"mailbox and containing the UIDs assigned to the copied message(s) in the " +
				"destination mailbox, indicates that the message(s) have been copied to the " +
				"destination mailbox with the stated UID(s). ... This response code is returned in " +
				"a tagged OK response to the COPY command.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"§3, COPYUID response-code definition (first sentence + closing delivery sentence; " +
				"the intervening source/destination-order and ascending-order paragraphs are " +
				"elided with '...'). Judgment level (implicit client-handling MUST), same basis as " +
				"3-2: descriptive definition with no RFC 2119 keyword on the client; acceptance " +
				"inferred from RFC3501-7-1/7-2 / RFC9051-7-1/7-2. A compliant client must accept a " +
				"tagged OK carrying '[COPYUID <uidvalidity> <src-uid-set> <dst-uid-set>]' as a " +
				"normal successful COPY completion and be able to expose the source->destination " +
				"UID mapping. REV2 ADJUDICATION: kept [\"rev1\",\"rev2\"]. RFC 9051 §7.1 defines " +
				"COPYUID but catalogs its §7.1 definition as server-side (no client MUST/SHOULD); " +
				"RFC9051-6.4.8-1 covers only the DISTINCT MOVE case (COPYUID in an *untagged* OK), " +
				"not this UIDPLUS tagged-OK-after-COPY acceptance — so not identical, not double-" +
				"scored. Cross-reference: RFC9051-6.4.8-1 (related MOVE COPYUID duty). Conditional " +
				"on the client using COPY against a UIDPLUS server. Testable: script a COPY whose " +
				"tagged OK carries a well-formed [COPYUID ...] and assert the client completes and " +
				"surfaces the UID mapping.",
		},
		{
			id: "RFC4315-3-4",
			source: "RFC4315",
			section: "3",
			title: "Client (implicit) MUST accept the UIDNOTSTICKY response code in the untagged NO to SELECT",
			text:
				"The selected mailbox is supported by a mail store that does not support " +
				"persistent UIDs; that is, UIDVALIDITY will be different each time the mailbox is " +
				"selected. Consequently, APPEND or COPY to this mailbox will not return an " +
				"APPENDUID or COPYUID response code. ... This response code is returned in an " +
				"untagged NO response to the SELECT command.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"§3, UIDNOTSTICKY response-code definition (semantics sentence(s) + closing " +
				"delivery sentence; the server-facing 'Note: servers SHOULD NOT have any " +
				"UIDNOTSTICKY mail stores...' paragraph is elided with '...' and excluded as " +
				"server-only). Judgment level (implicit client-handling MUST), same basis as " +
				"3-2/3-3: descriptive definition with no RFC 2119 keyword on the client; " +
				"acceptance inferred from RFC3501-7-1/7-2 / RFC9051-7-1/7-2 (accept any response, " +
				"remember critical data — here, that the selected mailbox has non-persistent UIDs " +
				"and will not yield APPENDUID/COPYUID). A compliant client must accept a '* NO " +
				"[UIDNOTSTICKY] ...' untagged response during SELECT as a well-formed status " +
				"signal, not a fatal SELECT failure (the SELECT still completes with a tagged OK). " +
				"REV2 ADJUDICATION: kept [\"rev1\",\"rev2\"]. RFC9051-7.1-7 covers the " +
				"UIDNOTSTICKY 'servers SHOULD NOT have such mail stores' Note as an untestable " +
				"SERVER-focused entry (server storage guidance), NOT this client duty to accept " +
				"the code in the untagged NO to SELECT — so not an identical catalogued rev2-core " +
				"client duty, not double-scored. Cross-reference: RFC9051-7.1-7. UIDNOTSTICKY is " +
				"otherwise standalone. Conditional on the client selecting a UIDNOTSTICKY mailbox. " +
				"Testable: script a SELECT whose responses include '* NO [UIDNOTSTICKY] ...' " +
				"before the tagged OK and assert the client treats the SELECT as successful and " +
				"does not subsequently rely on APPENDUID/COPYUID for that mailbox.",
		},
	],
};

export default rfc4315;
