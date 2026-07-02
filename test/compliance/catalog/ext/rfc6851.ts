import type { CatalogModule } from "../types";

const rfc6851: CatalogModule = {
	source: "RFC6851",
	extractionNote:
		"RFC 6851 (IMAP MOVE Extension — MOVE and UID MOVE) fully reviewed for client-binding " +
		"requirements. §1 Introduction: motivates the extension (the COPY/STORE/EXPUNGE workaround " +
		"is non-atomic and can over-expunge) and states 'The MOVE extension is present in any IMAP " +
		"implementation that returns \"MOVE\" as one of the supported capabilities to the CAPABILITY " +
		"command' — a capability-gating statement (it makes every MOVE duty applicability:'conditional' " +
		"on the client seeing the MOVE capability) rather than a distinct client duty, so no §1 entry " +
		"is synthesized. §2 Conventions: RFC 2119 / ABNF / example-notation boilerplate, no normative " +
		"content. §3 (MOVE and UID MOVE) is the substantive section: §3.1 gives the MOVE command " +
		"syntax (sequence set + mailbox name) → entry 3.3-1; §3.2 extends the UID command with MOVE " +
		"→ entry 3.3-2 (its own ABNF and semantics are folded into §3.3, so both command-form entries " +
		"are numbered under 3.3 where the shared semantics prose lives); §3.3 (Semantics) contributes " +
		"3.3-1..3.3-7. §4 (Interaction with Other Extensions): §4.3 UIDPLUS → entry 4.3-1 " +
		"(untagged-OK COPYUID handling); §4.4 QRESYNC → entry 4.4-1 (handle VANISHED and EXPUNGE). " +
		"§5 (Formal Syntax) → entry 5-1 (case-insensitive acceptance) plus the ABNF productions " +
		"(grammar, quoted in entries 3.3-1/3.3-2 as the command form, not separately cataloged). " +
		"§6 Security Considerations, §7 IANA, §8 Acknowledgments, §9 References, Authors' Addresses: " +
		"no client-binding normative language (§6 is advisory prose about quota-suspension and " +
		"security-scanning interactions that binds implementations' internal policy, not the client's " +
		"wire behavior). Total: 10 client-binding entries. " +
		"CLIENT/SERVER SPLIT — the following §3.3/§4 duties are SERVER-ONLY and deliberately EXCLUDED " +
		"(flagged, not cataloged as client entries): (a) 'response codes for a STORE MUST NOT be " +
		"generated and the \\DELETED flag MUST NOT be set for any message' — server response-" +
		"generation MUST NOTs (the client-side residue, that a compliant MOVE reply carries COPY and " +
		"EXPUNGE codes but no STORE code and sets no \\Deleted, is captured as the derived handling " +
		"duty 3.3-3); (b) the atomicity trio 'each individual message SHOULD either be moved or " +
		"unaffected', 'The server MUST leave each message in a state where it is in at least one of " +
		"the source or target mailboxes', 'The server SHOULD NOT leave any message in both mailboxes' " +
		"— all bind the server's move implementation (the client-side residue, that a tagged NO does " +
		"not imply nothing was moved, is captured as 3.3-7); (c) §4.1 QUOTA and §4.2 ACL prose " +
		"(server quota-checking / rights computation); (d) §4.3 'Servers supporting UIDPLUS SHOULD " +
		"send COPYUID in response to a UID MOVE command' and 'Servers implementing UIDPLUS are also " +
		"advised to send the COPYUID response code in an untagged OK before sending EXPUNGE or moved " +
		"responses' — server-directed SHOULD / advisory (the derived client duty to PARSE that " +
		"untagged-OK COPYUID is 4.3-1); (e) §4.4 QRESYNC's mod-sequence bookkeeping ('MUST increment " +
		"the per-mailbox mod-sequence', 'MUST remember the incremented mod-sequence', 'MUST send the " +
		"updated per-mailbox modification sequence using the HIGHESTMODSEQ response code', 'MUST " +
		"generate and assign new modification sequence numbers') — all server MUSTs; (f) §4.5 Sieve " +
		"imap.cause behavior (server event engine). Server EXPUNGE-emission latitude ('the server may " +
		"send unrelated EXPUNGE responses', 'the server may send EXPUNGE (or VANISHED) responses " +
		"before the tagged response') is quoted only as the antecedent of client duties 3.3-4/3.3-7, " +
		"not cataloged as its own entry. " +
		"REV2-CORE ADJUDICATION (RFC 9051 §6.4.8 absorbed MOVE/UID MOVE) — each duty checked against " +
		"catalog/rfc9051.ts and decided explicitly: " +
		"• 3.3-4 (no message-sequence-number commands while the server is processing MOVE) is the " +
		"same duty as RFC9051-6.4.8-2, which quotes the near-identical sentence (9051 drops this " +
		"document's '(or VANISHED)' parenthetical) → tagged profiles:[\"rev1\"] and cross-referenced " +
		"to RFC9051-6.4.8-2 so a rev2 client scores it once, via core. " +
		"• 3.3-5 (the pipelining elaboration of the same hazard: unsafe to pipeline seq-number " +
		"commands after MOVE / MOVE cannot be pipelined with a renumbering command) is folded into " +
		"RFC9051-6.4.8-2 as well — that entry's own notes cite this document's closing paragraph as " +
		"part of the identical duty → also profiles:[\"rev1\"], cross-referenced to RFC9051-6.4.8-2. " +
		"• 4.3-1 (parse a COPYUID response code delivered in an untagged OK before the EXPUNGEs during " +
		"MOVE) is the same derived client duty as RFC9051-6.4.8-1 (9051 promotes this document's " +
		"'advised' phrasing to a REQUIRED server duty and states it as 'Servers are also REQUIRED to " +
		"send the COPYUID response code in an untagged OK before sending EXPUNGE or similar responses') " +
		"→ profiles:[\"rev1\"], cross-referenced to RFC9051-6.4.8-1. " +
		"• 3.3-1 / 3.3-2 (the MOVE and UID MOVE command forms): RFC 9051 §6.4.8 folds MOVE into the " +
		"rev2 base command set, so the command-syntax obligation for a rev2 client is a core duty, not " +
		"an extension duty → both tagged profiles:[\"rev1\"] (the extension is the binding source only " +
		"for a rev1 client that adds MOVE; a rev2 client's MOVE command form is scored via 9051 core), " +
		"with a note recording the adjudication. " +
		"• 4.4-1 (QRESYNC client handles both VANISHED and EXPUNGE for UID MOVE), 3.3-3 (accept COPY+" +
		"EXPUNGE codes with no STORE code / no \\Deleted), 3.3-6 (moving to the selected mailbox is " +
		"allowed when copying is), and 3.3-7 (a tagged NO does not imply nothing moved) have no " +
		"restating counterpart in RFC 9051 §6.4.8 (9051 folds in the command mechanics but not these " +
		"ancillary handling/permission duties) → kept profiles:[\"rev1\",\"rev2\"], source-of-truth " +
		"via this document for both profiles. " +
		"• 5-1 (case-insensitive acceptance of the MOVE strings) is kept profiles:[\"rev1\",\"rev2\"]: " +
		"it is the RFC-6851-specific ABNF-token acceptance duty; RFC 9051 has a general case-" +
		"insensitivity rule for command atoms but no MOVE-token-specific entry that this would double-" +
		"score against, following the RFC4978-5-1 precedent for extension case-insensitivity entries. " +
		"Untestable entries (3): 3.3-5 (internal-decision — a pipelining-avoidance scheduling choice), " +
		"3.3-6 (user-intent-policy — a permission, no wire pass/fail), 3.3-7 (internal-state — the " +
		"client's post-NO state reconciliation is not forced by any single observable exchange). " +
		"NOTE ON CURRENT CLIENT STATE: the compliance driver's move()/uidMove() both throw " +
		"NotImplementedError, so the client has no MOVE surface at all — every testable entry here is " +
		"self-actualizing (the absence of the command path is recorded as a failure for the entry).",
	requirements: [
		// ── §3.1/§3.2/§3.3 The MOVE and UID MOVE Commands ────────────────────────

		{
			id: "RFC6851-3.3-1",
			source: "RFC6851",
			section: "3.3",
			title: "MOVE command form: MOVE SP sequence-set SP mailbox",
			text: 'move           = "MOVE" SP sequence-set SP mailbox',
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "testable",
			notes:
				"The MOVE command's wire form, from the §5 ABNF ('command-select =/ move'). A client " +
				"that issues MOVE MUST emit exactly this form: the atom MOVE, a space, a sequence-set, " +
				"a space, and a mailbox name. §3.1 gives the argument list (sequence set, mailbox " +
				"name) and results (OK move completed / NO move error / BAD). Judgment level: the ABNF " +
				"production itself carries no RFC 2119 keyword, but emitting a syntactically valid " +
				"command is an implicit MUST for any client that uses the command (an ill-formed MOVE " +
				"is a protocol error). REV2-CORE ADJUDICATION: RFC 9051 §6.4.8 folds MOVE into the " +
				"rev2 base command set, so for a rev2 client the MOVE command-form obligation is a " +
				"core duty; tagged profiles:['rev1'] here to avoid double-scoring — this extension is " +
				"the binding source only for a rev1 client that adds MOVE. Applicability 'conditional' " +
				"— binds only when the client uses MOVE. Currently self-actualizing fail: " +
				"driver.move() throws NotImplementedError, so the client cannot emit this form at all.",
		},
		{
			id: "RFC6851-3.3-2",
			source: "RFC6851",
			section: "3.3",
			title: "UID MOVE command form: UID SP MOVE ...",
			text: 'uid            = "UID" SP (copy / fetch / search / store / move)',
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "testable",
			notes:
				"§3.2 extends the first form of the UID command to accept MOVE as a valid argument " +
				"('This extends the first form of the UID command (see [RFC3501], Section 6.4.8) to " +
				"add the MOVE command defined above as a valid argument'); the §5 ABNF adds 'move' to " +
				"the uid alternation. A client issuing UID MOVE MUST emit 'UID' SP 'MOVE' SP " +
				"sequence-set SP mailbox, where the sequence-set is interpreted as UIDs. Judgment " +
				"level (ABNF production, no explicit RFC 2119 keyword; implicit MUST for a client that " +
				"uses the command). REV2-CORE ADJUDICATION: same as 3.3-1 — RFC 9051 §6.4.8 folds UID " +
				"MOVE into rev2 core, so tagged profiles:['rev1'] to avoid double-scoring the command " +
				"form for a rev2 client. Applicability 'conditional' — binds only when the client uses " +
				"UID MOVE. Currently self-actualizing fail: driver.uidMove() throws " +
				"NotImplementedError.",
		},
		{
			id: "RFC6851-3.3-3",
			source: "RFC6851",
			section: "3.3",
			title: "Client accepts COPY and EXPUNGE codes for a MOVE, with no STORE code and no \\Deleted",
			text:
				"In particular, though the COPY and EXPUNGE response codes will be returned, response " +
				"codes for a STORE MUST NOT be generated and the \\DELETED flag MUST NOT be set for " +
				"any message.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"The quoted sentence's two MUST NOTs bind the SERVER's response generation (excluded " +
				"as server-only; see extractionNote). The client-binding residue cataloged here is " +
				"the derived handling duty: a compliant MOVE reply carries the COPY-related response " +
				"code(s) and EXPUNGE responses but no STORE response code, and marks no message " +
				"\\Deleted — so a client MUST accept exactly that shape as a successful MOVE (it must " +
				"not wait for, require, or be confused by a STORE response code or a \\Deleted flag " +
				"change that the workaround sequence would have produced). Judgment level (an implicit " +
				"client-handling MUST derived from the server's MUST-NOT-generate rule, not an " +
				"explicit client-directed keyword). No RFC 9051 §6.4.8 restatement of this handling " +
				"residue, so profiles:['rev1','rev2'] — source-of-truth via this document for both. " +
				"Testable in principle by scripting a MOVE OK with COPY/EXPUNGE and no STORE code and " +
				"confirming the client completes it; currently self-actualizing fail (no MOVE surface).",
		},
		{
			id: "RFC6851-3.3-4",
			source: "RFC6851",
			section: "3.3",
			title: "No message-sequence-number commands while the server is processing MOVE",
			text:
				"The server may send EXPUNGE (or VANISHED) responses before the tagged response, so " +
				"the client cannot safely send more commands with message sequence number arguments " +
				"while the server is processing MOVE or UID MOVE.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "testable",
			notes:
				"Judgment call: keyword-less ('cannot safely') — treated as MUST NOT because sending a " +
				"sequence-number-argument command mid-MOVE risks operating on messages the server has " +
				"already renumbered via EXPUNGE, i.e. data loss. The server-latitude clause ('the " +
				"server may send EXPUNGE (or VANISHED) responses before the tagged response') is " +
				"quoted only as the antecedent, not as a separate server entry. REV2-CORE " +
				"ADJUDICATION: this is the same duty as RFC9051-6.4.8-2, which quotes the near-" +
				"identical sentence (RFC 9051 omits this document's '(or VANISHED)' parenthetical). " +
				"Tagged profiles:['rev1'] and cross-referenced to RFC9051-6.4.8-2 so a rev2 client " +
				"scores this hazard once, via core. Applicability 'conditional' — binds only when the " +
				"client uses MOVE. Testable: request a sequence-number-based operation through the API " +
				"while a scripted MOVE is still in flight and verify the client does not emit it before " +
				"the MOVE's tagged response; currently self-actualizing fail (no MOVE surface).",
		},
		{
			id: "RFC6851-3.3-5",
			source: "RFC6851",
			section: "3.3",
			title: "Do not pipeline sequence-number commands (or renumbering commands) around a MOVE",
			text:
				"The renumbering of other messages in the source mailbox following any EXPUNGE " +
				"response can be surprising and makes it unsafe to pipeline any command that relies " +
				"on message sequence numbers after a MOVE or UID MOVE. Similarly, MOVE cannot be " +
				"pipelined with a command that might cause message renumbering.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"The pipelining elaboration of the 3.3-4 hazard: it forbids a client's command-" +
				"scheduling choice (pipelining a sequence-number-dependent command after a MOVE, or " +
				"pipelining MOVE behind a command that might renumber). Whether the client 'pipelined' " +
				"is a decision about when it flushes bytes relative to responses it has not yet read; " +
				"a black-box test cannot force a compliant client to reveal that it WOULD have " +
				"pipelined but chose not to, and a client that simply serializes every command (never " +
				"pipelining anything) satisfies this duty vacuously and is wire-indistinguishable from " +
				"one that reasons about renumbering safety. There is no observable pass/fail boundary " +
				"for the avoidance itself distinct from the already-cataloged 'do not send " +
				"sequence-number commands mid-MOVE' duty (3.3-4), which captures the observable half.",
			notes:
				"Full context: 'Both MOVE and UID MOVE can be pipelined with other commands, but care " +
				"has to be taken.' — the sentence permits pipelining in general, then this text " +
				"carves out the unsafe cases; §3.3 closes by pointing to [RFC3501], Section 5.5 for " +
				"the formal ambiguity-handling requirements for both clients and servers. Judgment " +
				"level (keyword-less 'unsafe' / 'cannot'). REV2-CORE ADJUDICATION: folded into " +
				"RFC9051-6.4.8-2, whose own notes cite this document's closing pipelining paragraph as " +
				"part of the identical hazard; tagged profiles:['rev1'] and cross-referenced to " +
				"RFC9051-6.4.8-2 to avoid double-scoring. Applicability 'conditional' — binds only when " +
				"the client uses MOVE.",
		},
		{
			id: "RFC6851-3.3-6",
			source: "RFC6851",
			section: "3.3",
			title: "Moving to the currently selected mailbox is allowed when copying to it is allowed",
			text:
				"Note that moving a message to the currently selected mailbox (that is, where the " +
				"source and target mailboxes are the same) is allowed when copying the message to the " +
				"currently selected mailbox is allowed.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "user-intent-policy",
			untestableRationale:
				"A permission statement: it grants that a MOVE whose target equals the selected " +
				"(source) mailbox is legal exactly when the corresponding COPY-to-self is legal. It " +
				"imposes no client duty — a client that never moves a message to the currently " +
				"selected mailbox is fully compliant, and a client that does so is exercising a " +
				"permitted (but optional) capability whose acceptability is governed by the server's " +
				"copy-to-self policy, not by any wire-observable client obligation. Whether the client " +
				"ever chooses to issue a self-target MOVE is an application/user policy decision with " +
				"no pass/fail boundary to assert against.",
			notes:
				"Level MAY (permission, not obligation). No RFC 9051 §6.4.8 restatement of this " +
				"permission, so profiles:['rev1','rev2'] — a rev2 client using MOVE is bound (well, " +
				"permitted) by this document alone here. Applicability 'conditional' — relevant only " +
				"when the client uses MOVE.",
		},
		{
			id: "RFC6851-3.3-7",
			source: "RFC6851",
			section: "3.3",
			title: "A tagged NO to MOVE does not imply nothing was moved",
			text: "This is true even if the server returns a tagged NO response to the command.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-state",
			untestableRationale:
				"The 'This' refers to the atomicity guarantee that each message ends up in at least " +
				"one mailbox (and should not be in both) — the sentence extends that guarantee to the " +
				"tagged-NO case. The client-binding residue is a state-reconciliation duty: a MOVE " +
				"that completes with a tagged NO may still have moved (and expunged) some messages, so " +
				"the client MUST NOT treat NO as 'nothing happened' and MUST fold in whatever EXPUNGE " +
				"/ COPYUID responses it received when updating its local mailbox state. Whether the " +
				"client's INTERNAL model correctly reflects the partial move is not forced by any " +
				"single observable exchange: two clients that received the same EXPUNGE/NO sequence " +
				"can hold divergent internal state while emitting identical subsequent wire traffic, " +
				"and the RFC prescribes no follow-up command that would externalize the reconciled " +
				"state for a black-box observer. Judgment level (implicit client-handling MUST derived " +
				"from a server-directed atomicity sentence).",
			notes:
				"The antecedent atomicity sentences ('each individual message SHOULD either be moved " +
				"or unaffected', 'The server MUST leave each message ... in at least one of the source " +
				"or target mailboxes', 'The server SHOULD NOT leave any message in both mailboxes') " +
				"are server-only and excluded (see extractionNote); this entry captures only the " +
				"client-side consequence of the tagged-NO extension. No RFC 9051 §6.4.8 restatement, " +
				"so profiles:['rev1','rev2']. Applicability 'conditional' — binds only when the client " +
				"uses MOVE.",
		},

		// ── §4.3 Interaction with RFC 4315 (UIDPLUS) ─────────────────────────────

		{
			id: "RFC6851-4.3-1",
			source: "RFC6851",
			section: "4.3",
			title: "Client parses a COPYUID delivered in an untagged OK before the EXPUNGEs",
			text:
				"Servers implementing UIDPLUS are also advised to send the COPYUID response code in " +
				"an untagged OK before sending EXPUNGE or moved responses.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "testable",
			notes:
				"The quoted sentence is server-directed and advisory ('are also advised to send'); it " +
				"is treated at SHOULD level for the server (excluded as a server duty). The client-" +
				"binding residue cataloged here is the derived handling duty: because a UIDPLUS server " +
				"MAY place the COPYUID for a UID MOVE in an *untagged* OK that arrives BEFORE the " +
				"EXPUNGE responses (unlike COPY, where COPYUID rides the tagged OK), a client that " +
				"uses MOVE with UIDPLUS must parse and correlate an untagged '* OK [COPYUID ...]' so " +
				"the new UIDs are known before the subsequent EXPUNGEs renumber the source mailbox. " +
				"The §3.3 example illustrates the ordering: 'C: a UID MOVE 42:69 foo' / 'S: * OK " +
				"[COPYUID 432432 42:69 1202:1229]' / 'S: * 22 EXPUNGE' / 'S: a OK Done'. The " +
				"parenthetical rationale in §4.3 ('Sending COPYUID in the tagged OK ... means that " +
				"clients first receive an EXPUNGE for a message and afterwards COPYUID for the same " +
				"message. It can be unnecessarily difficult to process that sequence usefully.') " +
				"motivates the untagged placement. REV2-CORE ADJUDICATION: this is the same derived " +
				"client duty as RFC9051-6.4.8-1, where RFC 9051 promotes this document's 'advised' " +
				"phrasing to a REQUIRED server duty ('Servers are also REQUIRED to send the COPYUID " +
				"response code in an untagged OK before sending EXPUNGE or similar responses'). Tagged " +
				"profiles:['rev1'] and cross-referenced to RFC9051-6.4.8-1 so a rev2 client scores it " +
				"once, via core. Applicability 'conditional' — binds only when the client uses MOVE " +
				"with a UIDPLUS server. Testable: script '* OK [COPYUID ...]' then EXPUNGE responses " +
				"then the tagged OK and verify the client exposes the UID mapping; currently self-" +
				"actualizing fail (no MOVE surface).",
		},

		// ── §4.4 Interaction with RFC 5162 (QRESYNC) ─────────────────────────────

		{
			id: "RFC6851-4.4-1",
			source: "RFC6851",
			section: "4.4",
			title: "QRESYNC-enabled client handles both VANISHED and EXPUNGE for UID MOVE",
			text:
				"The same requirement applies to MOVE, and a QRESYNC-enabled client needs to handle " +
				"both VANISHED and EXPUNGE responses to a UID MOVE command.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment call: keyword-less ('needs to handle'), treated as MUST because a QRESYNC-" +
				"enabled client that fails to process a VANISHED (or EXPUNGE) response to UID MOVE " +
				"would mis-track which messages were removed. 'The same requirement' refers back to " +
				"the QRESYNC rule that the server SHOULD send VANISHED rather than EXPUNGE for UID " +
				"EXPUNGE, which §4.4 extends to MOVE — the server-side mod-sequence MUSTs later in " +
				"§4.4 are excluded as server-only (see extractionNote). No RFC 9051 §6.4.8 restatement " +
				"of this QRESYNC-specific client handling duty (QRESYNC is a separate extension in " +
				"rev2 too), so profiles:['rev1','rev2'] — source-of-truth via this document for both " +
				"profiles. Applicability 'conditional' — binds only when the client has enabled " +
				"QRESYNC and uses UID MOVE. Testable: for a QRESYNC-enabled session, answer a scripted " +
				"UID MOVE with VANISHED responses and verify the client processes them (and separately " +
				"with EXPUNGE responses); currently self-actualizing fail (no MOVE surface).",
		},

		// ── §5 Formal Syntax ─────────────────────────────────────────────────────

		{
			id: "RFC6851-5-1",
			source: "RFC6851",
			section: "5",
			title: "Case-insensitive acceptance of the MOVE strings",
			text: "Implementations MUST accept these strings in a case-insensitive fashion.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"'These strings' refers to the token strings this extension's §5 ABNF defines — the " +
				"MOVE command atom (capability =/ \"MOVE\"; move = \"MOVE\" SP sequence-set SP " +
				"mailbox) — which §5 states are case-insensitive: 'The use of upper or lower case " +
				"characters to define token strings is for editorial clarity only.' For the client " +
				"side this binds acceptance of a server-advertised MOVE capability atom in any case " +
				"(e.g. a CAPABILITY line listing 'move' or 'Move'), which the client must recognize as " +
				"the MOVE capability. REV2-CORE ADJUDICATION: kept profiles:['rev1','rev2'] — this is " +
				"the RFC-6851-specific ABNF-token acceptance duty; RFC 9051 carries a general case-" +
				"insensitivity rule for command atoms but no MOVE-token-specific entry that this would " +
				"double-score against, matching the RFC4978-5-1 precedent for extension case-" +
				"insensitivity entries. Applicability 'conditional' — relevant when the client uses " +
				"the MOVE extension. Testable: advertise 'MOVE' in non-canonical case in a CAPABILITY " +
				"response and confirm the client recognizes the capability.",
		},
	],
};

export default rfc6851;
