import type { CatalogModule } from "../types";

const rfc5182: CatalogModule = {
	source: "RFC5182",
	extractionNote:
		"RFC 5182 (IMAP Extension for Referencing the Last SEARCH Result, capability 'SEARCHRES') " +
		"fully reviewed for client-binding requirements across every section: Abstract, §1 " +
		"Introduction (+§1.1 Conventions), §2 Overview (§2.1 Normative Description, §2.2 Examples, " +
		"§2.3 Multiple Commands in Progress, §2.4 Interaction with ESEARCH Extension, §2.5 Refusing " +
		"to Save Search Results), §3 Formal Syntax, §4 Security Considerations, §5 IANA " +
		"Considerations, §6 Acknowledgments, §7 References, boilerplate. Every text quote " +
		"mechanically verified as a whitespace-flattened substring of rfc-editor.org/rfc/rfc5182.txt " +
		"(page furniture stripped) before writing. 7 client-binding entries extracted (§1×2, §2.1×3, " +
		"§2.3×1, §2.5×1). " +
		"CLIENT vs SERVER SPLIT: SEARCHRES is largely a SERVER-state extension — the server owns the " +
		"search result variable and performs every '$' substitution. The catalog captures the " +
		"client's facilities and mirrors: the SEARCH/UID SEARCH RETURN (SAVE) command form plus " +
		"'$'-in-sequence-set usage (RFC5182-1-1), the suppressed-response completion duty " +
		"(RFC5182-1-2), the implicit capability gate (RFC5182-2.1-1), the '$'-lifetime invalidation " +
		"awareness (RFC5182-2.1-2), the empty-'$' valid-but-non-matching acceptance (RFC5182-2.1-3), " +
		"the pipelining permission (RFC5182-2.3-1), and NO [NOTSAVED] acceptance (RFC5182-2.5-1). " +
		"SKIPPED as SERVER-ONLY (no separate entry): §2.1 'Any such server MUST also implement the " +
		"[ESEARCH] extension' (server dependency duty); §2.1 'Any of the following SEARCH commands " +
		"MUST NOT change the search result variable: ...' (BAD-response / no-SAVE-NO / successful-" +
		"no-SAVE list — server variable maintenance; the client-facing lifetime consequence is " +
		"folded into RFC5182-2.1-2's notes); §2.1 'it MUST automatically adjust them when notifying " +
		"the client about expunged messages' (server message-number bookkeeping on EXPUNGE); §2.3 " +
		"'a server MUST execute the two commands in the order they were received' (server execution-" +
		"order duty, the counterpart of the client MAY cataloged as RFC5182-2.3-1); ALL of §2.4 — " +
		"'Servers that implement the extension defined in this document MUST implement [ESEARCH] " +
		"and conform to additional requirements listed in this section' plus the SAVE+MIN/MAX/ALL/" +
		"COUNT '$'-content rules and their summary table, which the RFC itself labels 'the " +
		"additional requirement on ESEARCH server implementations' (the client-facing consequence — " +
		"'$' may denote only the MIN/MAX message(s) when SAVE was combined with only MIN/MAX — is " +
		"noted in RFC5182-1-1); §4 'server implementations MAY limit the number of saved searches " +
		"... and return the tagged NO response containing the NOTSAVED response code' (server " +
		"resource policy; the client half is RFC5182-2.5-1). EXCLUDED as non-binding: §1's " +
		"advantages list (bandwidth/pipelining/optimization rationale); §1.1/§2.2 examples " +
		"('Explanatory comments in examples start with // and are not part of the protocol'); §2.1 " +
		"'Implementation note: server implementors should note that \"$\" can reference IMAP " +
		"message sequences or UID sequences, depending on the context where it is used' (addressed " +
		"to server implementors; its client-facing content — SEARCH (SAVE) then UID FETCH $ and " +
		"vice versa are legal — rides in RFC5182-1-1's notes); §3's 'Implementations MUST accept " +
		"these strings in a case-insensitive fashion' (ABNF-preamble boilerplate, same exclusion " +
		"RFC4731 §4 and RFC5161 §4 applied); §3's ABNF productions themselves (capability =/ " +
		"\"SEARCHRES\", sequence-set =/ seq-last-command, seq-last-command = \"$\", " +
		"search-return-opt = \"SAVE\", resp-text-code =/ \"NOTSAVED\" — grammar, not prose duties, " +
		"per the RFC3516 §7 precedent; their client-binding consequences are cataloged from the " +
		"§1/§2 prose); §5/§6/§7 add no client duty. NOTE: RFC 5182 nowhere states an explicit " +
		"client 'MUST NOT use unless advertised' sentence — the gate entry RFC5182-2.1-1 is the " +
		"implicit-gate construction used for RFC4731-1-1 (see that entry's notes). " +
		"REV2-CORE ADJUDICATION (rule 4 — RFC 9051 absorbed the FULL RFC 5182 surface into rev2 " +
		"CORE: the SAVE result option lives in core §6.4.4, the search result variable and '$' in " +
		"§6.4.4.1, pipelining in §6.4.4.2, NOTSAVED refusal in §6.4.4.3, and the core grammar " +
		"carries seq-last-command '$'; every duty checked against catalog/rfc9051/s6-selected.ts " +
		"and the rfc9051 extraction notes). FULL DECISION MAP: " +
		"(1) RFC5182-1-1 (SAVE result option + '$' marker command facility) → DUAL + " +
		"gap-compensation: RFC 9051 §6.4.4/§6.4.4.1 TEXT carries the same facility (SAVE result " +
		"option definition; '$' usable where sequence-set is expected) but the rfc9051 catalog " +
		"scores NO SAVE-emission or '$'-usage client entry — its §6.4.4 entries cover legacy-" +
		"SEARCH-ignore, no-match ESEARCH, ALL-order, SAVE-suppression, CHARSET only, and its " +
		"§6.4.4.1 block is explicitly declared 'no client-binding entries' — so per the " +
		"RFC5258-3.1-2 precedent this stays [\"rev1\",\"rev2\"] as the scoring text for both " +
		"profiles. " +
		"(2) RFC5182-1-2 (SAVE alone suppresses the search response) → rev1-only, cross-ref " +
		"RFC9051-6.4.4-4: identical scored rev2 duty ('In absence of any other SEARCH result " +
		"option, the SAVE result option also suppresses any ESEARCH response ...' — wording delta " +
		"SEARCH→ESEARCH reflects rev2's response model, the client completion duty is the same); a " +
		"rev2 client scores it once, via core. " +
		"(3) RFC5182-2.1-1 (capability gate) → rev1-only, NO cross-ref id: under rev2 SAVE and '$' " +
		"are base-spec §6.4.4 syntax needing no capability gate (there is no SEARCHRES capability " +
		"in the rev2 core model), so absorption ELIMINATES the duty rather than restating it — " +
		"same decision class as RFC4731-1-1 (that module's decision (1)). " +
		"(4) RFC5182-2.1-2 ('$'-lifetime invalidation awareness) → DUAL + gap-compensation: RFC " +
		"9051 §6.4.4.1 TEXT carries the same reset rules (SELECT/EXAMINE/reconnect reset, " +
		"NO-with-SAVE reset, UIDVALIDITY-change reset) but the rfc9051 catalog scores no entry — " +
		"s6-selected.ts records '§6.4.4.1 SAVE result variable: no client-binding entries — every " +
		"normative statement governs the server's maintenance of the search result variable " +
		"(resets, non-changes, EXPUNGE adjustment, empty-sequence handling)'; the CLIENT-side " +
		"mirror (do not rely on a stale '$') is scored here for both profiles per the " +
		"RFC5258-3.1-2 precedent. " +
		"(5) RFC5182-2.1-3 (empty '$' is valid-but-non-matching; accept the empty outcome) → DUAL " +
		"+ gap-compensation: RFC 9051 §6.4.4.1 TEXT has the same empty-'$' rule but the rfc9051 " +
		"catalog excluded it as server-side ('treating an empty \"$\" as a valid but non-matching " +
		"list' listed under the server-maintenance exclusions) and scores no client acceptance " +
		"entry — RFC5258-3.1-2 precedent. " +
		"(6) RFC5182-2.3-1 (MAY pipeline SAVE with '$'-using commands) → rev1-only, cross-ref " +
		"RFC9051-6.4.4.2-1: identical scored rev2 MAY, near-verbatim ('A client MAY pipeline a " +
		"SEARCH RETURN (SAVE) command with one or more commands using the \"$\" marker ...'); a " +
		"rev2 client scores it once, via core. " +
		"(7) RFC5182-2.5-1 (accept NO [NOTSAVED]; '$' empty afterwards) → rev1-only, cross-ref " +
		"RFC9051-6.4.4.3-1: identical scored rev2 duty, near-verbatim (9051 says 'as described in " +
		"Section 6.4.4.1' where 5182 says 'Section 2.1'); a rev2 client scores it once, via core. " +
		"SUMMARY: rev1-only (3): RFC5182-1-2, RFC5182-2.3-1, RFC5182-2.5-1, plus the eliminated-" +
		"gate rev1-only RFC5182-2.1-1 (4 total tagged [\"rev1\"]); dual (3): RFC5182-1-1 (gap), " +
		"RFC5182-2.1-2 (gap), RFC5182-2.1-3 (gap). " +
		"REAL PARSE SURFACE: the client parses resp-text-codes via src/parser/structure/" +
		"text.code.ts, whose AtomTextCode fallback tolerates unknown codes — a 'NO [NOTSAVED] ...' " +
		"tagged response lands as a generic atom code (same REAL acceptance path as BADURL/TOOBIG " +
		"in Phase 4), so RFC5182-2.5-1's acceptance half is genuinely probeable. Command-emission " +
		"duties are currently self-actualizing: driver.search()/uidSearch() with a return-options " +
		"payload throw NotImplementedError, and whether the client's fetch/store/copy/search " +
		"surfaces pass a literal '$' sequence-set argument through unmodified is a spec-batch " +
		"probe point (E2, searchres-5182.test.ts). " +
		"UNTESTABLE (1): RFC5182-2.1-2 (internal-state — stale-'$' beliefs have no wire " +
		"signature; see entry). Total: 7 client-binding entries (RFC5182-1-1, RFC5182-1-2, " +
		"RFC5182-2.1-1..3, RFC5182-2.3-1, RFC5182-2.5-1).",
	requirements: [
		// ── §1 Introduction ─────────────────────────────────────────────────────

		{
			id: "RFC5182-1-1",
			source: "RFC5182",
			section: "1",
			title: "Client MAY save a search with RETURN (SAVE) and reference it with '$' in place of a sequence set",
			text:
				"The SEARCH result reference extension defines a new SEARCH result option [IMAPABNF] " +
				"\"SAVE\" that tells the server to remember the result of the SEARCH or UID SEARCH " +
				"command (as well as any command based on SEARCH, e.g., SORT and THREAD [SORT]) and " +
				"store it in an internal variable that we will reference as the \"search result " +
				"variable\". The client can use the \"$\" marker to reference the content of this " +
				"internal variable. The \"$\" marker can be used instead of message sequence or UID " +
				"sequence in order to indicate that the server should substitute it with the list of " +
				"messages from the search result variable.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"§1 definitional core of the extension. No RFC 2119 keyword ('can be used'); level MAY " +
				"by judgment — an optional client facility that, when used, must be emitted in these " +
				"exact forms: the SAVE result option inside the RFC 4466 RETURN (...) list (§2.2 " +
				"Example 1: 'A282 SEARCH RETURN (SAVE) FLAGGED SINCE 1-Feb-1994 NOT FROM \"Smith\"') " +
				"and the bare '$' where a sequence-set argument is expected (§3: sequence-set =/ " +
				"seq-last-command; seq-last-command = \"$\"; Example 1: 'A283 FETCH $ (UID " +
				"INTERNALDATE FLAGS RFC822.HEADER)'). '$' is context-polymorphic — §2.1's " +
				"implementation note (addressed to server implementors, folded here) makes SEARCH " +
				"(SAVE) → UID FETCH $ and UID SEARCH (SAVE) → FETCH $ both legal, the server mapping " +
				"between sequence numbers and UIDs. Interpretation rider from the server-only §2.4 " +
				"rules: when the client combines SAVE with only MIN and/or MAX, '$' denotes just the " +
				"MIN/MAX message(s), not the full match set — a client reusing '$' after such a " +
				"combination must expect the reduced set. Applicability 'conditional' — binds only " +
				"when the client uses the SEARCHRES facility. REV2 ADJUDICATION: DUAL + " +
				"gap-compensation (RFC5258-3.1-2 precedent) — RFC 9051 absorbed SAVE and '$' into " +
				"rev2 core (§6.4.4/§6.4.4.1 + core seq-last-command grammar) but the rfc9051 catalog " +
				"scores no SAVE-emission or '$'-usage client entry (its §6.4.4.1 block is declared " +
				"server-only), so this remains the scoring text for both profiles; see extractionNote " +
				"decision (1). Testable: drive a search with a SAVE return option and assert the " +
				"'SEARCH RETURN (SAVE)' wire form, then a '$'-consuming command and assert the bare " +
				"'$' sequence-set argument; currently self-actualizing — driver.search(criteria, " +
				"{ return: [\"SAVE\"] }) throws NotImplementedError, and the '$'-pass-through of " +
				"fetch/store/copy is an E2 probe point.",
		},
		{
			id: "RFC5182-1-2",
			source: "RFC5182",
			section: "1",
			title: "Client using SAVE alone MUST accept completion without any search response",
			text:
				"In absence of any other SEARCH result option, the SAVE result option also suppresses " +
				"any SEARCH response that would have been otherwise returned by the SEARCH command.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "testable",
			notes:
				"§1, final paragraph. No RFC 2119 keyword; level MUST by judgment — definitional " +
				"protocol behavior whose derived client duty mirrors RFC9051-6.4.4-4's treatment: a " +
				"client that issued SEARCH RETURN (SAVE) with no other result option and then waits " +
				"for an untagged SEARCH (or, with [ESEARCH] also in play, ESEARCH) response will hang " +
				"or mis-frame the exchange — it must accept completion with only the tagged OK (§2.2 " +
				"Example 1: the SAVE-only search is answered by 'A282 OK SEARCH completed, result " +
				"saved' alone). Conversely §2.4 (server-only) keeps MIN/MAX/ALL/COUNT items flowing " +
				"when SAVE is combined with them, so the suppression duty is scoped to SAVE-alone. " +
				"Applicability 'conditional' — only when the client uses RETURN (SAVE) with no other " +
				"result option. REV2 ADJUDICATION: rev1-only, cross-ref RFC9051-6.4.4-4 — identical " +
				"scored rev2 duty, near-verbatim (rev2 says 'suppresses any ESEARCH response' because " +
				"ESEARCH is the core result format there; the client-side completion duty is the " +
				"same), so a rev2 client scores this once, via core; see extractionNote decision (2). " +
				"Testable: script SEARCH RETURN (SAVE) answered by a tagged OK only and verify the " +
				"client completes cleanly; currently self-actualizing (no RETURN surface in the " +
				"driver).",
		},

		// ── §2.1 Normative Description of the SEARCHRES Extension ──────────────

		{
			id: "RFC5182-2.1-1",
			source: "RFC5182",
			section: "2.1",
			title: "Client MUST NOT use SAVE or the '$' marker unless the server advertises SEARCHRES",
			text:
				"The SEARCH result reference extension described in this document is present in any " +
				"IMAP4 server implementation that returns \"SEARCHRES\" as one of the supported " +
				"capabilities in the CAPABILITY command response.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "testable",
			notes:
				"Judgment level (implicit MUST NOT; the quoted sentence carries no RFC 2119 keyword " +
				"binding the client). RFC 5182 nowhere states the gate explicitly — the duty is " +
				"derived from §2.1's framing (the extension 'is present' only in servers returning " +
				"SEARCHRES) combined with the base-spec capability discipline (RFC 3501 §6.1.1: a " +
				"client may only rely on extension functionality the server has advertised), the same " +
				"implicit-gate construction used for RFC4731-1-1. Sending RETURN (SAVE) or a '$' " +
				"sequence-set to a non-advertising server is emitting syntax outside the server's " +
				"grammar (expect BAD). The adjacent sentence 'Any such server MUST also implement the " +
				"[ESEARCH] extension' binds the SERVER (skipped; but it licenses a client seeing " +
				"SEARCHRES to rely on ESEARCH result options too). Applicability 'conditional' — " +
				"binds when the client would emit SAVE/'$' forms. REV2 ADJUDICATION: rev1-only, with " +
				"NO RFC9051 cross-ref id — under rev2, SAVE and '$' are base-spec syntax requiring no " +
				"capability gate (no SEARCHRES capability exists in the rev2 core model), so " +
				"absorption ELIMINATES this duty for rev2 rather than restating it; same decision " +
				"class as RFC4731-1-1; see extractionNote decision (3). Testable: connect against a " +
				"scripted server NOT advertising SEARCHRES and verify the client never emits RETURN " +
				"(SAVE) or a '$' sequence-set; currently self-actualizing on the emission side, and " +
				"reviewers should note the vacuous-pass hazard — a client with no SEARCHRES surface " +
				"satisfies the prohibition trivially.",
		},
		{
			id: "RFC5182-2.1-2",
			source: "RFC5182",
			section: "2.1",
			title: "Client MUST NOT rely on '$' surviving re-selection, a failed SAVE search, or a UIDVALIDITY change",
			text:
				"Upon successful completion of a SELECT or an EXAMINE command (after the tagged OK " +
				"response), the current search result variable is reset to the empty sequence. ... A " +
				"SEARCH command with the SAVE result option that caused the server to return the NO " +
				"tagged response sets the value of the search result variable to the empty sequence. " +
				"... If the server decides to send a new UIDVALIDITY value while the mailbox is " +
				"opened, this causes resetting of the search variable to the empty list.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-state",
			untestableRationale:
				"The quoted resets are performed by the SERVER, which owns the search result variable " +
				"and substitutes '$' correctly regardless of what the client believes; the client's " +
				"mirror duty is not to assume '$' still denotes the pre-reset match set — an " +
				"expectation with no wire signature. A subsequent command using '$' is byte-identical " +
				"whether the client holds a stale belief or a correct one, and both the stale-belief " +
				"client and the compliant client receive the same (empty-set) results, so no " +
				"black-box exchange has a mandated pass/fail boundary. For a protocol library the " +
				"'$'-lifetime bookkeeping is additionally delegable to the consuming application, " +
				"which supplies sequence-set arguments opaquely.",
			notes:
				"§2.1, three lifetime rules quoted with elisions (the intervening text is the " +
				"successful-SAVE definition and the server MUST-NOT-change list, both server-side — " +
				"see extractionNote). All three sentences are keyword-less server maintenance rules " +
				"(the third's neighbors: the EXPUNGE rule auto-removes expunged messages from the " +
				"list, with a server MUST for message-number adjustment — also skipped); level MUST " +
				"NOT by judgment for the derived CLIENT mirror: after re-selecting a mailbox (or any " +
				"SELECT/EXAMINE, including of the same mailbox), after a tagged NO to a SEARCH " +
				"RETURN (SAVE) (e.g. §2.2 Example 5's BADCHARSET NO — the example's comments spell " +
				"out that the client 'would have to reissue' the SAVE search), and after an " +
				"in-session UIDVALIDITY change, the client must treat '$' as empty and re-issue " +
				"RETURN (SAVE) before relying on it; acting on a stale '$' silently operates on the " +
				"wrong (empty) message set. Applicability 'conditional' — binds a client using " +
				"SEARCHRES across those events. REV2 ADJUDICATION: DUAL + gap-compensation " +
				"(RFC5258-3.1-2 precedent) — RFC 9051 §6.4.4.1 TEXT carries the same reset rules but " +
				"the rfc9051 catalog declared that whole subsection 'no client-binding entries' " +
				"(server variable maintenance) and scores nothing, so the client-side mirror is " +
				"scored here for both profiles; see extractionNote decision (4).",
		},
		{
			id: "RFC5182-2.1-3",
			source: "RFC5182",
			section: "2.1",
			title: "Client MUST treat an empty '$' as usable and accept the OK-with-no-data outcome",
			text:
				"Note that even if the \"$\" marker contains the empty list of messages, it must be " +
				"treated by all commands accepting message sets as parameters as a valid, but " +
				"non-matching list of messages. For example, the \"FETCH $\" command would return a " +
				"tagged OK response and no FETCH responses.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"§2.1 (the paragraph repeats itself in slightly different words immediately after — " +
				"the first, example-bearing form is quoted). Lowercase 'must' in a pre-8174 document; " +
				"level MUST by judgment. The treating-as-valid half binds the SERVER (commands accept " +
				"the empty '$'); the derived client duties are (a) the client MAY legally use '$' " +
				"even when it may be empty — §2.2 Example 6 pipelines COPY $ against a possibly-empty " +
				"save and gets 'E283 OK COPY completed, nothing copied' — and (b) the client must " +
				"accept the resulting tagged-OK-with-no-untagged-data exchange as successful " +
				"completion with an empty result, not a protocol error or a hang waiting for data. " +
				"Applicability 'conditional' — when the client uses '$'. REV2 ADJUDICATION: DUAL + " +
				"gap-compensation (RFC5258-3.1-2 precedent) — RFC 9051 §6.4.4.1 TEXT restates the " +
				"empty-'$' valid-but-non-matching rule but the rfc9051 catalog excluded it among the " +
				"server-maintenance statements and scores no client acceptance entry, so this remains " +
				"the scoring text for both profiles; see extractionNote decision (5). Testable: " +
				"script SEARCH RETURN (SAVE) with no matches, then a '$'-consuming FETCH answered by " +
				"a bare tagged OK, and verify the client reports an empty result without error; " +
				"currently self-actualizing (no RETURN surface in the driver; '$' pass-through is an " +
				"E2 probe point).",
		},

		// ── §2.3 Multiple Commands in Progress ──────────────────────────────────

		{
			id: "RFC5182-2.3-1",
			source: "RFC5182",
			section: "2.3",
			title: "Client MAY pipeline SEARCH RETURN (SAVE) with '$'-using commands absent ambiguity",
			text:
				"A client supporting this extension MAY pipeline a SEARCH RETURN (SAVE) command with " +
				"one or more command using the \"$\" marker, as long as this doesn't create an " +
				"ambiguity, as described in Section 5.5 of [IMAP4].",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "testable",
			notes:
				"§2.3 — the RFC's one explicit client-directed RFC 2119 keyword ('one or more " +
				"command' is the RFC's own wording, sic). Direct client permission with a " +
				"constraining envelope: pipelining is allowed only when it creates no RFC 3501 §5.5 " +
				"ambiguity. The preceding paragraph's 'a server MUST execute the two commands in the " +
				"order they were received' binds the SERVER (skipped — it is what makes the pipeline " +
				"safe); §2.2 Example 2 and §2.3 Example 7 show the pipelined forms (SAVE search " +
				"followed immediately by FETCH $/COPY $/STORE $ before any response). Applicability " +
				"'conditional' — only when the client uses SAVE and '$' and chooses to pipeline. " +
				"REV2 ADJUDICATION: rev1-only, cross-ref RFC9051-6.4.4.2-1 — identical scored rev2 " +
				"MAY, near-verbatim ('with one or more commands using the \"$\" marker, as long as " +
				"this doesn't create an ambiguity, as described in Section 5.5'), so a rev2 client " +
				"scores this once, via core; see extractionNote decision (6). Testable: pipeline " +
				"SEARCH RETURN (SAVE) with a '$'-consuming FETCH and verify correct correlation of " +
				"both completions; currently self-actualizing (no RETURN surface in the driver).",
		},

		// ── §2.5 Refusing to Save Search Results ────────────────────────────────

		{
			id: "RFC5182-2.5-1",
			source: "RFC5182",
			section: "2.5",
			title: "Refused SAVE arrives as tagged NO with NOTSAVED; '$' becomes empty",
			text:
				"In some cases, the server MAY refuse to save a SEARCH (SAVE) result, for example, if " +
				"an internal limit on the number of saved results is reached. In this case, the " +
				"server MUST return a tagged NO response containing the NOTSAVED response code and " +
				"set the search result variable to the empty sequence, as described in Section 2.1.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "testable",
			notes:
				"§2.5 (the two one-sentence paragraphs of the section, quoted contiguously). The " +
				"quoted MAY/MUST bind the SERVER; the derived client duty (judgment MUST) is twofold: " +
				"accept a tagged NO carrying the NOTSAVED resp-text-code (§3: resp-text-code =/ " +
				"\"NOTSAVED\") as the save-refused outcome of a SEARCH RETURN (SAVE) — a recoverable " +
				"command failure, not a protocol error — and treat '$' as the empty sequence " +
				"afterwards rather than a previously saved result (§4 notes servers may answer this " +
				"way under DoS-protection limits, so any SAVE can fail this way at any time). " +
				"Applicability 'conditional' — only when the client uses RETURN (SAVE). REV2 " +
				"ADJUDICATION: rev1-only, cross-ref RFC9051-6.4.4.3-1 — identical scored rev2 duty, " +
				"near-verbatim (9051 points at its §6.4.4.1 where 5182 points at §2.1), so a rev2 " +
				"client scores this once, via core; see extractionNote decision (7). Testable with a " +
				"REAL acceptance path: src/parser/structure/text.code.ts's AtomTextCode fallback " +
				"tolerates unknown resp-text-codes, so 'NO [NOTSAVED] ...' parses as a generic atom " +
				"code (same path as BADURL/TOOBIG) — genuine pass/violation test possible on the " +
				"resp-code acceptance; the stale-'$' half is emission-side and currently " +
				"self-actualizing.",
		},
	],
};

export default rfc5182;
