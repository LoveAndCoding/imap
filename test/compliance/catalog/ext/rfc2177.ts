import type { CatalogModule } from "../types";

const rfc2177: CatalogModule = {
	source: "RFC2177",
	extractionNote:
		"RFC 2177 (IMAP4 IDLE command, capability 'IDLE') fully reviewed for client-binding " +
		"requirements across every section: §1 Abstract, §2 Conventions, §3 Specification (all " +
		"normative prose lives here), §4 Formal Syntax, §5 References, §6 Security Considerations " +
		"('There are no known security issues with this extension.'), §7 Author's Address. 7 " +
		"client-binding entries extracted, all from §3 (RFC2177-3-1..7, ordered by textual " +
		"appearance). KEYWORD PROVENANCE: §2 says the key words 'are to be interpreted as described " +
		"in RFC 2060 [IMAP4]' — RFC 2177 (June 1997) cites RFC 2060's keyword conventions rather " +
		"than RFC 2119/8174 directly; the suite's RFC 8174 discipline is applied unchanged " +
		"(UPPERCASE keywords normative; imperative-but-unkeyworded prose → judgment level + notes). " +
		"REV2-CORE ADJUDICATION (rule 4 — THE decision for this source; RFC 9051 §6.3.13 folds IDLE " +
		"into rev2 CORE as a base command, reproducing RFC 2177 §3's normative paragraphs nearly " +
		"verbatim, and catalog/rfc9051/s6-auth-b.ts SCORES exactly three IDLE entries: " +
		"RFC9051-6.3.13-1 (MUST NOT send a command while server awaits DONE), RFC9051-6.3.13-2 " +
		"(29-minute terminate-and-reissue advice, untestable performance-expectation), and " +
		"RFC9051-6.3.13-3 (DONE termination mechanism, implicit MUST). Decision map, entry by " +
		"entry, verified against both RFC texts and the rfc9051 catalog: " +
		"(i) rev1-only + cross-ref (duty identical to a SCORED rfc9051 entry, so a rev2 client " +
		"scores it ONCE via core): RFC2177-3-5 ↔ RFC9051-6.3.13-3 (DONE termination — sentence " +
		"verbatim IDENTICAL in both RFCs); RFC2177-3-6 ↔ RFC9051-6.3.13-1 (no-command-while-idling " +
		"MUST NOT — verbatim IDENTICAL); RFC2177-3-7 ↔ RFC9051-6.3.13-2 (29-minute advice — " +
		"editorially identical, 2177 'terminate the IDLE and re-issue it' vs 9051 'terminate IDLE " +
		"and reissue it'; same duty, same untestable treatment mirrored); and RFC2177-3-2 ↔ " +
		"RFC9051-7-1 (accept-unsolicited-responses — 2177's sentence explicitly defers 'as " +
		"specified in the base IMAP specification', and rev2 core SCORES that base duty as " +
		"RFC9051-7-1 'The client MUST be prepared to accept any response at all times', so a rev2 " +
		"client scores acceptance via core; the rev1 base counterpart RFC3501-7-1 exists too, but " +
		"per-source scoring keeps this entry binding for a rev1 client's IDLE-extension score). " +
		"(ii) dual-profile + gap-compensation note (duty present in RFC 9051 §6.3.13's TEXT but " +
		"scored by NO rfc9051 catalog entry — RFC5258-3.1-2 precedent: tagging rev1-only would " +
		"leave a rev2 client accountable to no source): RFC2177-3-3 (the IDLE→'+' command flow — " +
		"9051 restates it near-verbatim, dropping only the word 'mailbox', but rfc9051 scores no " +
		"command-emission/flow entry) and RFC2177-3-4 (accepting untagged responses arriving while " +
		"IDLE is active — 9051 restates the sentence adding FETCH and 'responses' for 'messages', " +
		"unscored; the generic RFC9051-7-1 subsumes raw acceptance but not the IDLE-specific " +
		"active-window duty). " +
		"(iii) dual-profile, 2177-only wording (no rev2 counterpart in RFC 9051's text at all): " +
		"RFC2177-3-1 (the capability gate — rev2 has NO IDLE capability token because IDLE is a " +
		"base rev2 command; the gate still binds a rev2-capable client whenever it faces a server " +
		"that has not advertised IDLE availability via either the IDLE token or IMAP4rev2 itself). " +
		"DECISION SUMMARY: rev1-only (4): RFC2177-3-2, RFC2177-3-5, RFC2177-3-6, RFC2177-3-7; " +
		"dual+gap-note (2): RFC2177-3-3, RFC2177-3-4; dual/2177-only (1): RFC2177-3-1. " +
		"SKIPPED as SERVER-ONLY (no client action to observe or enforce): §3 'the server MAY send " +
		"any remaining queued untagged responses and then MUST immediately send the tagged response " +
		"to the IDLE command and prepare to process other commands' (server response-sequencing " +
		"duties after DONE; the client's mirror duty — accepting queued untagged responses between " +
		"its DONE and the tagged completion — is folded into RFC2177-3-4's notes rather than " +
		"duplicated); §3 'The server MAY consider a client inactive if it has an IDLE command " +
		"running, and if such a server has an inactivity timeout it MAY log the client off " +
		"implicitly at the end of its timeout period' (server permission — quoted context for " +
		"RFC2177-3-7's 'Because of that'); the §3 Result block (OK/NO/BAD outcomes are " +
		"definitional; tolerating a tagged NO/BAD is the base spec's generic duty). §1 Abstract is " +
		"motivation ('a client can't expect this behaviour and must poll' describes the base " +
		"protocol, not a duty of this extension); §4 Formal Syntax is grammar — the idle ::= " +
		"\"IDLE\" CRLF \"DONE\" production (note: DONE is a BARE line, no tag) underpins the " +
		"command form cataloged from §3 prose in RFC2177-3-3/-3-5; §5/§6/§7 add no client duty. " +
		"UNTESTABLE (1): RFC2177-3-7 (performance-expectation — the 29-minute timescale defeats " +
		"any test window and no shorter wire rule proxies for it, mirroring RFC9051-6.3.13-2's " +
		"rationale verbatim in substance). Mechanical quote verification: all 7 text segments " +
		"substring-verified against the flattened rfc-editor RFC 2177 text, plus the 6 RFC 9051 " +
		"counterpart/gap sentences against RFC 9051, before writing (all-pass).",
	requirements: [
		// ── §3 Specification ─────────────────────────────────────────────────────

		{
			id: "RFC2177-3-1",
			source: "RFC2177",
			section: "3",
			title: "Client MUST NOT use IDLE unless the server advertises the IDLE capability",
			text:
				"If the server does not advertise the IDLE capability, the client MUST NOT use the IDLE " +
				"command and must poll for mailbox updates.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"§3 first paragraph — the capability gate. Explicit MUST NOT. The trailing lowercase " +
				"'must poll for mailbox updates' is the operational complement (how the client obtains " +
				"updates without IDLE) and is not scored separately: whether/how often an application " +
				"polls is application-level policy, and the polling client's actual protocol duty is " +
				"RFC2177-3-2's acceptance requirement, which the very next RFC sentence supplies. " +
				"Conditional — binds only a client that would use IDLE. REV2 ADJUDICATION: kept " +
				"profiles:[\"rev1\",\"rev2\"] as 2177-ONLY WORDING — RFC 9051 §6.3.13 has NO capability " +
				"gate in its text (IDLE is a base rev2 command; no 'IDLE' capability token is required " +
				"of a rev2 server), so no core entry exists or could exist to score this duty for a " +
				"rev2 client. The gate remains meaningful for a rev2-capable client speaking to a " +
				"server that advertises neither IDLE nor IMAP4rev2 (IMAP4rev2 advertisement itself " +
				"conveys IDLE availability). Testable: script a capability response WITHOUT the IDLE " +
				"token and verify the client never emits an IDLE command; guard against a vacuous pass " +
				"(driver.idle() currently throws NotImplementedError, so the client can never emit " +
				"IDLE — the spec test must pair the prohibition with the positive-capability case " +
				"rather than passing on inability alone).",
		},
		{
			id: "RFC2177-3-2",
			source: "RFC2177",
			section: "3",
			title: "Client MUST continue to accept unsolicited untagged responses to ANY command",
			text:
				"In particular, the client MUST continue to be able to accept unsolicited untagged " +
				"responses to ANY command, as specified in the base IMAP specification.",
			level: "MUST",
			applicability: "always",
			profiles: ["rev1"],
			testability: "testable",
			notes:
				"§3 first paragraph, immediately after the capability gate: even a client that cannot " +
				"IDLE (and therefore polls) must keep accepting unsolicited untagged responses on any " +
				"command, per the base spec. Explicit MUST; applicability 'always' — this robustness " +
				"duty binds regardless of whether the client ever issues IDLE. REV2 ADJUDICATION: " +
				"tagged profiles:[\"rev1\"] and cross-referenced to the SCORED rev2-core entry " +
				"RFC9051-7-1 ('The client MUST be prepared to accept any response at all times') — the " +
				"2177 sentence is itself only a pointer to the base-spec duty ('as specified in the " +
				"base IMAP specification'), and rev2 core scores that duty directly, so a rev2 client " +
				"scores it once, via core. The rev1 base counterpart is RFC3501-7-1 (same sentence); " +
				"this entry keeps the duty on RFC 2177's own scoreboard for a rev1 client using (or " +
				"declining) the IDLE extension. Testable REAL: the parse surface exists — deliver an " +
				"unsolicited untagged response (e.g. EXISTS/EXPUNGE) during an arbitrary command via " +
				"the scripted server and verify the client processes the connection normally " +
				"(RFC3501-7-1/RFC9051-7-1 test pattern).",
		},
		{
			id: "RFC2177-3-3",
			source: "RFC2177",
			section: "3",
			title: "Client MAY send IDLE and awaits the server's '+' continuation before continuing",
			text:
				"The IDLE command is sent from the client to the server when the client is ready to " +
				"accept unsolicited mailbox update messages. The server requests a response to the IDLE " +
				"command using the continuation (\"+\") response.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"§3 second paragraph — the command flow: 'IDLE' CRLF, then the server's '+' " +
				"continuation, then (later) the DONE continuation data (RFC2177-3-5). No RFC 2119 " +
				"keyword in these definitional sentences; level assigned MAY by judgment — using IDLE " +
				"is an optional client facility (same adjudication as RFC3516-4.2-1's keyword-less " +
				"command-item definition), but when used the flow is mandatory: the §3 Responses block " +
				"('continuation data will be requested; the client sends the continuation data \"DONE\" " +
				"to end the command') plus base-spec continuation semantics mean the client MUST wait " +
				"for the '+' before sending any continuation data — DONE sent before the '+' arrives " +
				"answers a continuation request that has not been issued and desynchronizes the " +
				"exchange (the server may instead have replied tagged NO/BAD, per the Result block). " +
				"Conditional — binds only when the client uses IDLE. REV2 ADJUDICATION: kept " +
				"profiles:[\"rev1\",\"rev2\"] with a GAP-COMPENSATION note (RFC5258-3.1-2 precedent): " +
				"RFC 9051 §6.3.13 CONTAINS this flow text near-verbatim (identical but for dropping " +
				"'mailbox' — 'ready to accept unsolicited update messages'; verified against the RFC " +
				"9051 source), but catalog/rfc9051 scores NO command-flow/emission entry for IDLE " +
				"(its three entries are the mid-idle prohibition, the 29-minute advice, and the DONE " +
				"termination). Tagging rev1-only would leave a rev2 client accountable to no source " +
				"for the IDLE→'+' flow; keeping dual does not double-score. If rfc9051 later adds a " +
				"flow entry, re-tag rev1-only and cross-reference it. Testable: script " +
				"[expectLine(command(\"IDLE\")), send(\"+ idling\"), expectLine(bare DONE), reply OK] " +
				"and assert the client emits IDLE with no arguments and nothing further until the '+' " +
				"arrives; currently self-actualizing (driver.idle() throws NotImplementedError, so the " +
				"exchange cannot complete).",
		},
		{
			id: "RFC2177-3-4",
			source: "RFC2177",
			section: "3",
			title: "Client must accept untagged responses arriving at any time while IDLE is active",
			text:
				"The IDLE command remains active until the client responds to the continuation, and as " +
				"long as an IDLE command is active, the server is now free to send untagged EXISTS, " +
				"EXPUNGE, and other messages at any time.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"§3 second paragraph. The sentence grants the SERVER freedom; the client-binding " +
				"content is the mirror acceptance duty (same extraction pattern as RFC3516-4.3-1's " +
				"either-literal-form acceptance): a client whose IDLE is active must parse and process " +
				"untagged EXISTS, EXPUNGE, and other responses arriving at ANY point in the idle " +
				"window — that is the entire purpose of the extension, and a client that chokes on or " +
				"drops mid-idle updates breaks it. No RFC 2119 keyword; level assigned MUST by " +
				"judgment. Also folded here (not a separate entry): after the client's DONE, 'the " +
				"server MAY send any remaining queued untagged responses and then MUST immediately " +
				"send the tagged response' — those keywords bind the SERVER (see extractionNote), and " +
				"the client's mirror half is simply that the same acceptance duty extends to queued " +
				"untagged responses delivered between DONE and the tagged IDLE completion. Conditional " +
				"— binds only while the client has an IDLE active. REV2 ADJUDICATION: kept " +
				"profiles:[\"rev1\",\"rev2\"] with a GAP-COMPENSATION note (RFC5258-3.1-2 precedent): " +
				"RFC 9051 §6.3.13 CONTAINS this sentence near-verbatim (rev2 adds FETCH to the list " +
				"and says 'responses' for 'messages'; verified against the RFC 9051 source) but " +
				"catalog/rfc9051 scores no IDLE-specific acceptance entry — the generic RFC9051-7-1 " +
				"subsumes accept-anything-anytime, but not the IDLE-active-window specifics (updates " +
				"between '+' and DONE, and queued responses between DONE and the tagged completion), " +
				"so rev1-only would leave the IDLE-specific duty unscored for rev2. Testable: script " +
				"an idle window in which the server emits '* n EXISTS' / '* n EXPUNGE' after the '+' " +
				"and assert the client surfaces the updates and completes the exchange; currently " +
				"self-actualizing (driver.idle() throws, so no idle window can be opened), though the " +
				"raw untagged-response parse surface itself exists (driver.connectLow + " +
				"waitForUntagged).",
		},
		{
			id: "RFC2177-3-5",
			source: "RFC2177",
			section: "3",
			title: "Client terminates IDLE by sending the DONE continuation",
			text:
				"The IDLE command is terminated by the receipt of a \"DONE\" continuation from the " +
				"client; such response satisfies the server's continuation request.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "testable",
			notes:
				"§3 third paragraph. No RFC 2119 keyword; definitional but it specifies the SOLE " +
				"defined mechanism for ending an IDLE — level assigned MUST by judgment, mirroring the " +
				"identical adjudication recorded on the rev2-core counterpart (RFC9051-6.3.13-3 treats " +
				"it as implicit MUST for consistency with RFC9051-6.2.2-2's keyword-less AUTHENTICATE " +
				"'*' cancellation precedent: the exclusive protocol mechanism for an action binds as a " +
				"MUST). Per §4's formal syntax (idle ::= \"IDLE\" CRLF \"DONE\") the DONE is a BARE " +
				"line — continuation data, no tag — matching the Task-1 bare-DONE harness matcher. " +
				"Conditional — binds only when the client uses IDLE. REV2 ADJUDICATION: tagged " +
				"profiles:[\"rev1\"] and cross-referenced to RFC9051-6.3.13-3, whose text is verbatim " +
				"IDENTICAL to this sentence (mechanically verified against both RFC sources); rev2 " +
				"folded IDLE into core and SCORES this duty there, so a rev2 client scores it once, " +
				"via core. Testable: drive the client to end an idle period and assert the literal " +
				"untagged 'DONE' line (and nothing else) is emitted before the tagged IDLE completion; " +
				"currently self-actualizing (driver.idle() throws).",
		},
		{
			id: "RFC2177-3-6",
			source: "RFC2177",
			section: "3",
			title: "Client MUST NOT send a command while the server is waiting for the DONE",
			text:
				"The client MUST NOT send a command while the server is waiting for the DONE, since " +
				"the server will not be able to distinguish a command from a continuation.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "testable",
			notes:
				"§3 third paragraph — the hard protocol-framing prohibition: between the server's '+' " +
				"and the client's DONE, the client's only permitted output is the DONE line itself; " +
				"any queued application command must be deferred until after DONE and the tagged IDLE " +
				"completion. Explicit MUST NOT. Conditional — binds only while an IDLE is in " +
				"progress. REV2 ADJUDICATION: tagged profiles:[\"rev1\"] and cross-referenced to " +
				"RFC9051-6.3.13-1, whose text is verbatim IDENTICAL to this sentence (mechanically " +
				"verified against both RFC sources); rev2 core scores the prohibition, so a rev2 " +
				"client scores it once, via core. Testable: open an idle window, induce " +
				"application-level work that would queue a command, and assert nothing but DONE is " +
				"sent on the connection until the tagged completion arrives; currently " +
				"self-actualizing (driver.idle() throws, so no idle window can be opened).",
		},
		{
			id: "RFC2177-3-7",
			source: "RFC2177",
			section: "3",
			title: "Clients using IDLE are advised to terminate and re-issue it at least every 29 minutes",
			text:
				"Because of that, clients using IDLE are advised to terminate the IDLE and re-issue it " +
				"at least every 29 minutes to avoid being logged off.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "untestable",
			untestableTheme: "performance-expectation",
			untestableRationale:
				"Mirrors RFC9051-6.3.13-2's rationale: the terminate-and-reissue duty IS wire behavior " +
				"in principle (a DONE followed by a fresh IDLE inside the window would be observable), " +
				"but (a) no harness can realistically hold a connection idling for the tens of minutes " +
				"per assertion needed to observe the 29-minute boundary, and (b) no enforced wire rule " +
				"at shorter timescales proxies for it — 29 minutes is a safety margin under a " +
				"hypothetical 30-minute inactivity timeout that the RFC itself declines to standardize " +
				"('if such a server has an inactivity timeout it MAY log the client off implicitly'), " +
				"so a client that never re-issues within any shorter, testable window violates no " +
				"wire-level rule; it only risks an implementation-specific server-side logoff.",
			notes:
				"§3 fourth paragraph. 'Advised' (lowercase, no RFC 2119 keyword) — judgment call: read " +
				"as SHOULD, the same adjudication recorded on RFC9051-6.3.13-2 ('advised to X... to " +
				"avoid Y' is materially a SHOULD in surrounding IMAP RFC prose). The preceding " +
				"sentence ('The server MAY consider a client inactive... it MAY log the client off " +
				"implicitly at the end of its timeout period') is server-side permission — it is the " +
				"'that' in 'Because of that' — and is excluded as server-only (see extractionNote). " +
				"Conditional — binds only clients using IDLE. REV2 ADJUDICATION: tagged " +
				"profiles:[\"rev1\"] and cross-referenced to RFC9051-6.3.13-2, which restates this " +
				"advice editorially identically (2177 'terminate the IDLE and re-issue it' vs 9051 " +
				"'terminate IDLE and reissue it' — same duty, trivially reworded) and is itself " +
				"scored untestable/performance-expectation; this entry mirrors that treatment exactly, " +
				"per the plan's Task-9 guidance ('cross-ref RFC9051-6.3.13-2 profile handling'). A " +
				"rev2 client scores the advice once, via core.",
		},
	],
};

export default rfc2177;
