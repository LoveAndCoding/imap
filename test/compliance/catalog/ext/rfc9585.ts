import type { CatalogModule } from "../types";

const rfc9585: CatalogModule = {
	source: "RFC9585",
	extractionNote:
		"Full document reviewed (Abstract, §1 Introduction, §2 Conventions Used in This Document " +
		"[RFC 8174 keyword boilerplate], §3 CAPABILITY Identification, §4 The 'INPROGRESS' " +
		"Response Code, §5 Formal Syntax, §6 Security Considerations, §7 IANA Considerations, " +
		"§8 Normative References, Author's Address). Mechanical quote verification: 24 text " +
		"segments verified as whitespace-flattened substrings of rfc-editor.org/rfc/rfc9585.txt " +
		"(fetched directly via curl since WebFetch's summarizer declined full reproduction) via a " +
		"runnable Node script; all-pass output pasted in the delivering session. INPROGRESS is a " +
		"small, standalone extension over RFC 9051: one new resp-text-code (embeddable only in an " +
		"untagged OK) plus its eponymous capability. " +
		"REAL PARSE SURFACE — PROBED BEFORE WRITING (the task's own hint borne out): unlike the " +
		"bare-argument NOUPDATE/UNDEFINED-FILTER/BADEVENT-name family, where " +
		"src/parser/structure/text.code.ts's AtomTextCode fallback DROPS an unparenthesized " +
		"resp-code argument (splitSpaceSeparatedList's default '(' start-token never triggers on " +
		"a bare arg), INPROGRESS's argument IS parenthesized per its own ABNF ('resp-text-code =/ " +
		"\"INPROGRESS\" [ SP \"(\" inprogress-tag SP inprogress-state \")\" ]'), which is exactly " +
		"the shape that DOES survive (the same mechanism that lets BADEVENT's parenthesized event " +
		"list through). Probed empirically via a scripted connectLow exchange against the live " +
		"parser (four forms armed: bare '[INPROGRESS]', '(NIL NIL NIL)', '(\"tag\" NIL NIL)', " +
		"'(\"tag\" 175 NIL)'): all four parse cleanly as a serverStatus event with " +
		"content.text.code.kind === 'INPROGRESS'; the bare form has no .contents key at all, and " +
		"each parenthesized form yields .contents as a 3-element string array with each element " +
		"the block's getOriginalInput() reconstruction — the quoted tag survives WITH its literal " +
		"quote characters (e.g. '\"A001\"'), NIL survives as the literal string 'NIL', and numbers " +
		"survive as their literal digit string (e.g. '454'). This is a genuine REAL-signal " +
		"acceptance path, not a self-actualizing placeholder — confirmed by a second probe arming " +
		"a realistic ('A001' 454 1000)-style triple, which produced the identical 3-element shape. " +
		"A further probe (non-monotonic PROGRESS going backward, a mid-stream GOAL change, and a " +
		"PROGRESS > GOAL 'bogus' notification) confirmed the response stream survives all three " +
		"and a trailing EXISTS still parses — but this survival is NOT evidence of spec-compliant " +
		"'graceful handling': the client today attaches no consumer logic whatsoever to a parsed " +
		"INPROGRESS code (it is inert parsed data sitting in an event), so nothing could throw " +
		"regardless of the values' internal consistency; asserting 'the client doesn't crash' " +
		"would be a vacuous/confounded pass indistinguishable between a compliant and a " +
		"non-compliant implementation (the exact anti-pattern the phase plan's known-defect-class " +
		"list warns against), so those duties are scored testability: untestable below rather than " +
		"claimed as cheap REAL passes. " +
		"6 client-binding entries extracted: (1) client MUST accept the INPROGRESS resp-text-code " +
		"in an untagged OK in ALL its ABNF-permitted forms — bare, and the three-element tuple " +
		"with each of tag/progress/goal independently NIL per §4's tag/state grammar " +
		"(RFC9585-4-1, the sole testable/REAL entry, all judgment-level implicit MUST on parse " +
		"acceptance since the response-code definition itself carries no client-directed keyword); " +
		"(2) client (implicit) MUST assume PROGRESS=0 and GOAL=unknown prior to the server's first " +
		"notification for a command (RFC9585-4-2, the one EXPLICIT client MUST in §4, untestable " +
		"per the reasoning above — no consumer logic exists to observe an assumed default against); " +
		"(3) client MUST be prepared to handle a server that cannot keep GOAL constant or PROGRESS " +
		"monotonically increasing (RFC9585-4-3, explicit MUST, untestable — confirmed via the " +
		"live probe that 'not crashing' is vacuous today); (4) client MUST NOT treat PROGRESS/GOAL " +
		"as authoritative for any purpose beyond progress evaluation, and (per §6) MUST disregard " +
		"a notification whose values could cause arithmetic exceptions (RFC9585-4-4, folding the " +
		"§4 and §6 MUST/MUST NOT sentences into one entry since both constrain the same internal " +
		"use-boundary of the same values; untestable — no consumer logic exists to observe " +
		"drawing, or refraining from drawing, an inference from these values); (5) client MAY " +
		"disregard progress notifications entirely, and where a UI is involved it is the client's " +
		"own decision how/whether to surface them (RFC9585-4-5, untestable — MAY-level permission " +
		"plus an explicit UI-policy delegation, vacuous even with logger capture since surfacing " +
		"and not-surfacing are both compliant); (6) client (implicit) MUST accept the case- " +
		"insensitive spelling of INPROGRESS and its embedded literals (RFC9585-5-1, judgment-level, " +
		"folded from §5's formal-syntax preamble). " +
		"SKIPPED AS SERVER-ONLY (no client action to emit, observe, or enforce): §3's 'IMAP " +
		"servers that support this extension MUST include \"INPROGRESS\" in the response list to " +
		"the CAPABILITY command' (binds server advertisement; the reciprocal client duty is the " +
		"generic RFC 3501/9051 capability-negotiation obligation already cataloged there, not a " +
		"distinct RFC 9585 duty — same adjudication as RFC8514's SAVEDATE precedent); §4's 'The " +
		"server MAY send the \"INPROGRESS\" response code to notify the client ... or simply to " +
		"prevent the client from timing out' and 'The notifications MAY be sent for any IMAP " +
		"command. If the server elects to send notifications, it is RECOMMENDED that these are " +
		"sent every 10-15 seconds' (server-side send-or-not/cadence policy — the client has no " +
		"corresponding duty beyond the parse-acceptance already scored in RFC9585-4-1); §4's " +
		"'The response code MUST NOT appear in a tagged response (the command has completed and " +
		"further progress notifications make no sense)' (binds what the server emits where; the " +
		"formal syntax confirms this by only extending resp-text-code, which is shared by both " +
		"tagged and untagged responses at the grammar level, but the client has no distinct " +
		"parse-refusal duty for a tagged occurrence — accepting resp-text-code generically wherever " +
		"the base grammar allows it is the ordinary RFC 3501/9051 duty, not a distinct INPROGRESS " +
		"one; if a server violated this MUST NOT, the client's ordinary tagged-response resp-code " +
		"acceptance would simply parse it the same way, which is not a distinguishable client " +
		"behavior to test for); §4's three degrees-of-completeness bare examples and the two full " +
		"worked SEARCH/COPY exchanges (illustrative; their content is quoted inline as the " +
		"normative pin for RFC9585-4-1 rather than scored separately); §4's 'PROGRESS and GOAL " +
		"SHOULD be counts of the kind of item being processed ... If that is not possible, the " +
		"counts SHOULD be percentages' and 'The server SHOULD NOT send a progress notification " +
		"where PROGRESS equals GOAL' (server-side content/timing choices about what to send, not " +
		"client behavior); §5's 'Elements not defined here can be found in the formal syntax of " +
		"the ABNF [RFC5234] and IMAP [RFC9051] specifications' (cross-reference, no independent " +
		"duty) and the four inprogress-tag/-state ABNF productions themselves (grammar; their " +
		"client-binding consequence — accepting all three tuple shapes — is scored via " +
		"RFC9585-4-1 with the productions quoted inline as the normative pin, per the RFC3516 §7 " +
		"precedent used throughout this catalog); §6's 'The details of the response code are not " +
		"expected to disclose any information that isn't currently available from the command " +
		"output' and 'The progress details could be obtained anyway by sending a series of " +
		"commands with different workloads' (descriptive threat-model commentary, no directive); " +
		"§7 IANA Considerations and §8 References (no client-directed normative language). " +
		"REV2 PROFILE: RFC 9585 is written directly against RFC 9051 (IMAP4rev2) throughout — its " +
		"own §1 states 'This document extends ... IMAP [RFC9051]' and every reference to the base " +
		"spec in this document is to RFC 9051, not RFC 3501. Despite that, INPROGRESS remains an " +
		"optional standalone extension (gated by its own capability, §3) rather than folded into " +
		"rev2 core — confirmed by grep of catalog/rfc9051/**: no INPROGRESS content anywhere in " +
		"the base-spec catalog. It is equally addressable by an IMAP4rev1 client that negotiates " +
		"the capability (the RFC places no rev1/rev2 restriction on which base clients may use it, " +
		"only on which resp-text-code grammar host document it formally extends), so no rev2-core " +
		"double-scoring applies and all six entries carry the default profiles [\"rev1\",\"rev2\"] " +
		"and are source-of-truth for both profiles via this document alone. " +
		"Testable: 1 of 6 (RFC9585-4-1, REAL). Untestable: 5 of 6 — RFC9585-4-2, 4-3, 4-4 " +
		"(internal-decision: no consumer logic exists to attach any of these duties to, so a " +
		"compliant and a non-compliant client are wire-indistinguishable today); RFC9585-4-5 " +
		"(user-intent-policy, folding in the UI-presentation half: MAY-level, vacuous even with " +
		"logger capture). Total: 6 entries (RFC9585-4-1..5, RFC9585-5-1).",
	requirements: [
		// ── §4 The "INPROGRESS" Response Code ────────────────────────────────

		{
			id: "RFC9585-4-1",
			source: "RFC9585",
			section: "4",
			title:
				"Client MUST accept the INPROGRESS resp-text-code in an untagged OK in every " +
				"ABNF-permitted form (bare, and the tag/progress/goal tuple with independent NILs)",
			text:
				"The response code MAY embed a list of details, which appear in the " +
				"following order: 1. CMD-TAG: the tag [RFC9051] that originated the long-running " +
				"command. If the tag is not available or if it contains the \"]\" " +
				"character, it MUST be set to NIL. This still produces a usable notification, " +
				"unless multiple commands are in flight simultaneously. A client can ensure " +
				"reception of notifications with tags by simply refraining from the use of the " +
				"character \"]\" in the originating command tags. 2. PROGRESS: a number indicating " +
				"the number of items processed so far. The number MUST be non-negative and SHOULD " +
				"be monotonically increasing. If the PROGRESS is not available, both PROGRESS and " +
				"GOAL MUST be set to NIL. 3. GOAL: a number indicating the total number of items " +
				"to be processed. The number MUST be positive, and it SHOULD NOT change " +
				"between successive notifications for the same command tag. This is the number " +
				"that PROGRESS is expected to reach after the completion of the command; " +
				"therefore, it MUST be greater than PROGRESS. If the GOAL is not known, it MUST be " +
				"set to NIL. If the response code does not embed a list of details, all details " +
				"are to be interpreted as NIL.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit client-parse MUST; the quoted MUSTs are worded from the " +
				"value-construction side, e.g. 'it MUST be set to NIL', binding what the SERVER " +
				"emits — the reciprocal client duty, scored here, is to accept every shape those " +
				"rules produce). §5 formalizes the exact grammar: 'inprogress-tag = quoted / nil', " +
				"'inprogress-state-unknown = nil SP nil', 'inprogress-state-counting = number SP " +
				"nil', 'inprogress-state-known-goal = number SP nz-number', and 'resp-text-code =/ " +
				"\"INPROGRESS\" [ SP \"(\" inprogress-tag SP inprogress-state \")\" ]' — the bare " +
				"code (no embedded list) and three non-bare shapes (all-NIL/'keepalive with an " +
				"indication of the command tag'/counting-with-unknown-goal/known-goal, per §4's " +
				"four worked degrees-of-completeness examples '* OK [INPROGRESS] Hang in there...', " +
				"'* OK [INPROGRESS (\"tag\" NIL NIL)] ...', '* OK [INPROGRESS (\"tag\" 175 NIL)] " +
				"...', '* OK [INPROGRESS (\"tag\" 175 1000)] ...'). REAL, PROBED: a scripted " +
				"connectLow exchange arming all four of these exact forms (plus the ABNF-legal but " +
				"unexampled '(NIL NIL NIL)') shows every one parses as a serverStatus event with " +
				"content.text.code.kind === 'INPROGRESS' — genuine acceptance, not a crash or a " +
				"dropped line. The bare form yields no .contents key (matching the AtomTextCode " +
				"constructor's guard 'if (tokens && tokens.length)'); each parenthesized form " +
				"yields .contents as a 3-element string array, e.g. ['\"A001\"', '454', '1000'] for " +
				"the tag+progress+goal-known form and ['NIL','NIL','NIL'] for the all-NIL form — " +
				"the parenthesized argument survives splitSpaceSeparatedList's default '(' " +
				"start-token exactly because INPROGRESS's own ABNF wraps its argument in " +
				"parentheses, unlike the bare (unparenthesized) NOUPDATE/UNDEFINED-FILTER-name " +
				"family elsewhere in this catalog, where the identical AtomTextCode fallback " +
				"silently drops a bare argument. Conditional on the client using/advertising the " +
				"INPROGRESS capability. Standalone in rev2 (confirmed: no INPROGRESS content in " +
				"catalog/rfc9051/**), so profiles [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC9585-4-2",
			source: "RFC9585",
			section: "4",
			title:
				"Client MUST assume PROGRESS = 0 and GOAL = unknown before the server's first " +
				"notification for a command",
			text:
				"If the command completes before the first server notification " +
				"deadline, there will be no notifications at all. The client MUST " +
				"assume PROGRESS to be 0 and GOAL to be unknown until the server " +
				"issues a notification for the command.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableRationale:
				"Explicit MUST, but it binds an internal default assumption the client holds " +
				"before any INPROGRESS notification has arrived for a given command — there is no " +
				"wire event to observe compliance against in that window, and the client today " +
				"attaches no consumer logic to INPROGRESS values at all (they are inert parsed " +
				"event data), so there is no internal 'assumed PROGRESS/GOAL' state to probe for " +
				"correctness even in principle at this library's current architecture. A compliant " +
				"and a non-compliant implementation (one that assumed something else, or nothing) " +
				"are wire-indistinguishable: nothing the client sends or how it behaves before the " +
				"first notification differs based on this internal assumption. Consistent with the " +
				"catalog's established `internal-decision` verdict for 'do not depend on'/'assume X' " +
				"duties with no separately-testable downstream wire effect (RFC3501-5.1.3-1 " +
				"precedent).",
			untestableTheme: "internal-decision",
			notes:
				"Conditional on the client using the INPROGRESS capability for a long-running " +
				"command. Standalone in rev2, profiles [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC9585-4-3",
			source: "RFC9585",
			section: "4",
			title:
				"Client MUST be prepared to handle a server that cannot keep GOAL constant or " +
				"PROGRESS monotonically increasing",
			text:
				"While the server SHOULD keep GOAL constant and PROGRESS monotonically " +
				"increasing, there are circumstances where this might not be possible. " +
				"The client MUST be prepared to handle cases where the server cannot " +
				"keep GOAL constant and/or PROGRESS monotonically increasing.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableRationale:
				"Explicit MUST, but 'be prepared to handle' has no wire-observable pass/fail " +
				"boundary at this library's current architecture: a live probe (scripted " +
				"connectLow exchange arming a PROGRESS regression, a mid-stream GOAL change, and a " +
				"PROGRESS > GOAL notification, followed by a trailing EXISTS sentinel) confirmed " +
				"the client's response stream survives all three without incident — but this is " +
				"not evidence of spec-compliant 'graceful handling'; it is because the client " +
				"attaches literally no consumer logic to a parsed INPROGRESS code today (it is " +
				"inert data on a serverStatus event, per RFC9585-4-1's parse-acceptance duty), so " +
				"nothing could throw or misbehave regardless of the values' internal consistency. " +
				"Asserting 'the client doesn't crash' here would be a vacuous/confounded pass — " +
				"identical between a hypothetical implementation that actually tracks progress and " +
				"reacts badly to regressions and one (like today's) that does nothing with the " +
				"values at all — which is exactly the known confounded-pass defect class this " +
				"phase's extraction rules flag for avoidance. Recorded `internal-decision`: only " +
				"once the client grows real progress-tracking/UI-update logic would this duty gain " +
				"an observable divergent behavior to test.",
			untestableTheme: "internal-decision",
			notes:
				"Conditional on the client using the INPROGRESS capability. Standalone in rev2, " +
				"profiles [\"rev1\",\"rev2\"]. Forward-looking: first re-evaluation candidate if the " +
				"client ever adds a public progress-tracking API that a scripted non-monotonic " +
				"sequence could be asserted against.",
		},
		{
			id: "RFC9585-4-4",
			source: "RFC9585",
			section: "4",
			title:
				"Client MUST NOT treat PROGRESS/GOAL as authoritative beyond progress evaluation, " +
				"and MUST disregard notifications with exception-inducing values",
			text:
				"Also, the client MUST NOT consider the values to be authoritative for " +
				"any other use than evaluating the progress of the commands. For " +
				"example, the client must not use the GOAL field in place of the " +
				"proper output of a SEARCH command to know the number of messages in a " +
				"folder.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableRationale:
				"Two explicit MUST/MUST NOT sentences (§4's use-boundary MUST NOT and §6's " +
				"disregard-on-exception-risk MUST) folded into one entry because both constrain " +
				"the same internal-use boundary of the same parsed values, with no separate " +
				"wire-observable half for either: 'not considering values authoritative for " +
				"another use' and 'disregarding a notification' are both internal decisions about " +
				"what the client does AFTER parsing a value that RFC9585-4-1 already scores as " +
				"accepted — the client has no consumer logic today that uses GOAL/PROGRESS for " +
				"anything (e.g. no code path derives a folder message count from GOAL, so there is " +
				"nothing to catch violating this duty), and 'disregarding' vs. 'acting on' a " +
				"pathological notification is not distinguishable on the wire either way when " +
				"nothing consumes the value. A compliant and a non-compliant implementation " +
				"produce identical wire traces (both simply continue processing the underlying " +
				"long-running command normally) unless the non-compliant one also corrupts some " +
				"separately-catalogued, testable behavior (e.g. reporting a wrong SEARCH result " +
				"count) — which would be scored against that duty, not this one. The security " +
				"consideration's own parenthetical confirms the boundary case (GOAL=0 etc.) is " +
				"'not possible within a correct implementation of the ABNF syntax above', i.e. this " +
				"is a defensive guard against a misbehaving/malicious server sending non-ABNF-" +
				"conforming octets — the client's disregard action itself has no wire footprint to " +
				"assert against black-box.",
			untestableTheme: "internal-decision",
			notes:
				"§6 Security Considerations restates and extends the same duty in its own words " +
				"(quoted here verbatim, non-contiguous with the §4 sentence in `text` above — the " +
				"intervening §5 Formal Syntax section separates them in the source, so they are " +
				"cited separately rather than spliced with an invented ellipsis): 'the client " +
				"should guard against values that can cause arithmetic exceptions, like GOAL = 0, " +
				"GOAL/VALUE < 0, GOAL/VALUE ≥ 2^32 (these are not possible within a correct " +
				"implementation of the ABNF syntax above), and VALUE > GOAL. In these cases, the " +
				"notification MUST be disregarded.' Conditional on the client using the " +
				"INPROGRESS capability. Standalone in rev2, profiles [\"rev1\",\"rev2\"]. " +
				"Forward-looking: testable if the client grows a public progress-notification " +
				"consumer API whose output could be probed for leaking GOAL/PROGRESS into an " +
				"unrelated result (e.g. message-count reporting).",
		},
		{
			id: "RFC9585-4-5",
			source: "RFC9585",
			section: "4",
			title:
				"Client MAY disregard progress notifications entirely; deciding UI treatment is " +
				"the client's own policy",
			text:
				"The client MAY disregard progress notifications entirely or process " +
				"them only in relation to specific commands. If a user interface is " +
				"involved, it is the client's duty to decide which of these " +
				"notifications should emerge to the user interface and/or modify the " +
				"user's ability to interact in their presence, since this may differ " +
				"based on implementation details.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableRationale:
				"MAY-level permission with an explicit UI-policy delegation ('it is the client's " +
				"duty to decide') — grants pure discretion with no constraining envelope, so " +
				"disregarding, surfacing to a UI, or ignoring entirely are all equally compliant. " +
				"This headless library has no UI of its own; even applying the catalog's " +
				"instrumental logger-capture mechanism (used elsewhere to flip MUST-level " +
				"'present to the user' duties, e.g. RFC3501-7.1-1's ALERT text) would not help " +
				"here, because there is no pass/fail boundary to observe even with a capture " +
				"channel — MAY-level 'the client decides' duties are vacuous by requirement level, " +
				"not by instrumentation, matching the established RFC3501-7.1.1-2/RFC9051-7.1.1-2 " +
				"no-flip precedent for MAY-level presentation permissions.",
			untestableTheme: "user-intent-policy",
			notes:
				"Conditional on the client receiving INPROGRESS notifications at all. Standalone " +
				"in rev2, profiles [\"rev1\",\"rev2\"].",
		},

		// ── §5 Formal Syntax ──────────────────────────────────────────────────

		{
			id: "RFC9585-5-1",
			source: "RFC9585",
			section: "5",
			title: "Client (implicit) MUST accept INPROGRESS and its embedded literals case-insensitively",
			text:
				"Except as noted otherwise, all alphabetic characters are case- " +
				"insensitive. The use of uppercase or lowercase characters to define " +
				"token strings are for editorial clarity only. Implementations MUST " +
				"accept these strings in a case-insensitive fashion.",
			level: "MUST",
			applicability: "always",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Explicit MUST, generic case-insensitivity boilerplate preceding the ABNF (shared " +
				"phrasing with RFC 9051's own formal-syntax preamble). Applies to 'INPROGRESS' " +
				"itself and its embedded 'NIL' literal in the inprogress-tag/-state productions — a " +
				"client parser must accept e.g. 'inprogress' or 'InProgress' as the resp-text-code " +
				"kind and 'nil'/'Nil' as the null literal, not only the fully-uppercase spelling " +
				"used editorially throughout the document. This is a generic base-grammar duty " +
				"restated for this extension's own tokens, not a distinct behavioral surface beyond " +
				"RFC9585-4-1's acceptance — kept as its own entry because it is a separately " +
				"quotable explicit MUST with its own §5 location, mirroring how other small-RFC " +
				"catalogs in this phase (e.g. RFC 8514) do not fold formal-syntax-adjacent duties " +
				"into the prose entries they formalize. Applicability 'always' rather than " +
				"'conditional': it governs how ANY INPROGRESS occurrence must be parsed once the " +
				"capability is in play, not a client choice to use a feature. Standalone in rev2, " +
				"profiles [\"rev1\",\"rev2\"]. Currently self-actualizing/untested in practice by a " +
				"dedicated case-variance test (the base lexer's case-folding of atoms is generic " +
				"and not INPROGRESS-specific), but the duty itself is testable in principle via a " +
				"scripted lowercase/mixed-case '* OK [inprogress (\"tag\" NIL NIL)] ...' exchange " +
				"asserting the same parsed shape as RFC9585-4-1's uppercase probe.",
		},
	],
};

export default rfc9585;
