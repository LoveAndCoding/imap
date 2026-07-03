import type { CatalogModule } from "../types";

const rfc5465: CatalogModule = {
	source: "RFC5465",
	extractionNote:
		"RFC 5465 (The IMAP NOTIFY Extension). Full document reviewed: Abstract, §1 Overview and " +
		"Rationale, §2 Conventions, §3 The NOTIFY Extension [§3.1 The NOTIFY Command], §4 Interaction " +
		"with the IDLE Command, §5 Event Types [§5.1 FlagChange and AnnotationChange, §5.2 MessageNew, " +
		"§5.3 MessageExpunge, §5.4 MailboxName, §5.5 SubscriptionChange, §5.6 MailboxMetadataChange, " +
		"§5.7 ServerMetadataChange, §5.8 Notification Overflow, §5.9 ACL Changes], §6 Mailbox " +
		"Specification [§6.1 (+ §6.1.1/§6.1.2), §6.2 Personal, §6.3 Inboxes, §6.4 Subscribed, §6.5 " +
		"Subtree, §6.6 Mailboxes], §7 Extension to SEARCH and SORT Commands, §8 Formal Syntax, §9 " +
		"Security Considerations, §10 IANA Considerations, §11 Acknowledgements, §12/§13 References.\n\n" +
		"CLIENT/SERVER SPLIT — the crux of this extraction. NOTIFY is overwhelmingly a SERVER " +
		"extension: most of its normative sentences are event-GENERATION duties (which untagged " +
		"response the server sends for which mailstore event, with which data items, in which order). " +
		"The client's binding surface is (a) the NOTIFY SET/NONE command grammar and its composition " +
		"rules, (b) ACCEPTANCE duties for the unsolicited responses NOTIFY unleashes between commands " +
		"(untagged FETCH/EXISTS/EXPUNGE/VANISHED/STATUS/LIST arriving outside any command in " +
		"progress), (c) resp-code handling ([NOTIFICATIONOVERFLOW] tagged-NO refusal and untagged-OK " +
		"disable, [BADEVENT]), and (d) the MSN/'*' prohibitions that follow from requesting " +
		"message events on the selected mailbox.\n\n" +
		"Excluded as SERVER-ONLY (event-generation / enforcement duties): §3.1 the pre-first-NOTIFY " +
		"default-notification behavior; the STATUS-content MUSTs ('the STATUS response MUST contain " +
		"MESSAGES, UIDNEXT, and UIDVALIDITY' / 'MESSAGES' / 'UIDVALIDITY and HIGHESTMODSEQ' — server " +
		"emission, client counterpart is the RFC5465-3.1-4 acceptance duty); the mailbox-access " +
		"verification MUSTs ('the server MUST ignore it' x2); 'The server SHOULD return the tagged OK " +
		"... MAY return the tagged NO' (response-choice); §4 'the server MUST send exactly the same " +
		"events as instructed ... using the NOTIFY command' while processing IDLE (server duty; " +
		"client acceptance is covered by the per-event entries, which apply equally inside IDLE); §5 " +
		"intro 'The server SHOULD omit notifying the client if the event is caused by this client', " +
		"the 'l'/'r'-rights requirement (server access model), and the two 'the server MUST respond " +
		"with the tagged BAD response' enforcement halves (quoted inside RFC5465-5-1/-5-2 as context " +
		"for the client MUSTs they enforce); §5.1 the ESEARCH ADDTO/REMOVEFROM generation + " +
		"FETCH-precedes-ESEARCH ordering MUSTs (server; search-context duties belong to the RFC 5267 " +
		"family), 'the server MUST notify the client about mailbox UIDVALIDITY changes', and the MAY " +
		"FLAGS/[PERMANENTFLAGS] responses; §5.2 the SHOULD-NOT-FETCH-for-own-APPEND/COPY, MAY RECENT, " +
		"single-EXISTS batching note, EXISTS/ESEARCH/FETCH ordering MUSTs, and " +
		"SHOULD-combine-into-single-FETCH; §5.3 the HIGHESTMODSEQ-in-STATUS MUST (server emission, " +
		"folded into RFC5465-5.2-2's acceptance); §5.4 the \\Nonexistent-flag MUST and " +
		"\\Subscribed-on-autosubscribe MUST (server emission — client counterpart is parsing, " +
		"RFC5465-5.4-1), the rights-grant-equals-create rule, and SHOULD \\HasChildren/\\HasNoChildren; " +
		"§5.5 'all mailbox attributes MUST be accurately computed' (server); §5.6/§5.7 the " +
		"OPTIONAL-unless-METADATA-then-REQUIRED support rules (server capability), the " +
		"changed-items-only SHOULDs and deleted-item MUSTs (server emission — the client's acceptance " +
		"of unsolicited value-less METADATA responses is already cataloged as RFC5464-4.4-1/-4.4-2; " +
		"the 'doesn't have to issue ENABLE METADATA' sentences are permissions, not duties); §5.9 the " +
		"stop/restart-monitoring MUSTs and \\NoAccess LIST SHOULDs (server); §6.3 " +
		"'inboxes'-equals-'personal' fallback MUST (server); §6.4 subscription-list reevaluation MUST " +
		"(server); §6.6 'The server MUST NOT do a wildcard expansion' (server parsing rule — '*'/'%' " +
		"are legal mailbox-name octets, so no client prohibition follows); §7 the " +
		"EXISTS-precedes-FETCH-precedes-ESEARCH ordering MUSTs and the " +
		"no-FETCH-on-flag-change-membership SHOULD (server generation); §8 'Implementations MUST " +
		"accept these strings in a case-insensitive fashion' (shared ABNF-preamble boilerplate — same " +
		"exclusion as RFC5464/RFC5161); §9 the client self-denial-of-service warning (no RFC 2119 " +
		"keyword; its client-facing content is already RFC5465-3.1-5).\n\n" +
		"CLIENT-BINDING extracted (26 entries): §3.1 the NOTIFY SET/NONE command forms (grammar per " +
		"§8 ABNF: notify = 'NOTIFY' SP (notify-set / notify-none); notify-set = 'SET' " +
		"[status-indicator] SP event-groups), the implicit-NOOP acceptance after NOTIFY SET, the " +
		"omitted-SELECTED-means-SELECTED-NONE semantics, acceptance of pre-tagged-OK STATUS responses " +
		"under NOTIFY SET STATUS, the limit-mailboxes advisory, \\NoAccess extended-LIST acceptance, " +
		"tagged NO [NOTIFICATIONOVERFLOW] refusal acceptance, and [BADEVENT] NO-response handling; §5 " +
		"the two event-composition MUSTs binding the client's command (FlagChange/AnnotationChange " +
		"require MessageNew+MessageExpunge; MessageNew/MessageExpunge always together) and the NONE " +
		"suppression mechanism; §5.1-§5.5 acceptance duties for each unsolicited response the " +
		"requested events unleash (FETCH with UID+FLAGS; EXISTS+FETCH; STATUS for non-selected " +
		"mailboxes; EXPUNGE/VANISHED; LIST incl. \\Nonexistent, OLDNAME, \\Subscribed) plus the " +
		"client-binding SHOULD NOT on MessageNew fetch-atts and the two MSN/'*' prohibitions; §5.8 " +
		"untagged 'OK [NOTIFICATIONOVERFLOW]' acceptance and the implicit " +
		"treat-as-NOTIFY-NONE/resynchronize duty; §6.1 the two SELECTED-specifier composition rules; " +
		"§7 the extended UPDATE-with-fetch-atts return option (client command form defined by this " +
		"document even though CONTEXT itself is RFC 5267's).\n\n" +
		"REV2 CROSS-REFERENCE: NOTIFY is NOT folded into IMAP4rev2 (RFC 9051) — verified by grepping " +
		"catalog/rfc9051/ for NOTIFY/5465 (only hit is an unrelated lowercase 'notify the client' in " +
		"an EXISTS duty). It remains a standalone extension in rev2, so every entry defaults " +
		"profiles: [\"rev1\",\"rev2\"] and no rev2-core double-scoring adjudication arises. All " +
		"entries are applicability: conditional (bind only when the client uses NOTIFY; RFC5465-7-1 " +
		"additionally requires CONTEXT=SEARCH/SORT).\n\n" +
		"RFC 8174 discipline: RFC 5465 predates RFC 8174 and cites only RFC 2119 (§2), so lowercase " +
		"keywords are not normative. Entries resting on an UPPERCASE keyword that directly binds the " +
		"client: RFC5465-5-1 ('MUST also be specified by the client'), RFC5465-5-2, RFC5465-5.2-3 " +
		"('The client SHOULD NOT use ...'). Reciprocal-parse entries keep the server sentence's " +
		"keyword with a judgment note (RFC5465-3.1-2/-3.1-4/-3.1-6/-3.1-7/-3.1-8, RFC5465-5.1-1, " +
		"RFC5465-5.2-2 second sentence, RFC5465-5.4-1, RFC5465-5.8-1). Pure judgment calls (no " +
		"keyword): RFC5465-3.1-1 (command grammar), RFC5465-3.1-3 (omission semantics), " +
		"RFC5465-3.1-5 ('advised'), RFC5465-5-3 ('can'), RFC5465-5.2-1/-5.3-1/-5.4-2/-5.5-1 " +
		"(descriptive 'notifies the client by sending' — parse duties), RFC5465-5.2-4/-5.3-2 " +
		"('cannot' prohibitions), RFC5465-5.8-2 (implicit), RFC5465-6.1-1/-6.1-2 ('can be " +
		"specified' / 'It is an error'), RFC5465-7-1 ('can request').\n\n" +
		"Untestable: 3 entries — RFC5465-3.1-3 (omitted-SELECTED semantics, internal-decision), " +
		"RFC5465-3.1-5 (limit-mailboxes advisory, performance-expectation), RFC5465-5.8-2 " +
		"(post-overflow state model, internal-state). Total: 26 client-binding entries " +
		"(RFC5465-3.1-1..8, RFC5465-5-1..3, RFC5465-5.1-1, RFC5465-5.2-1..4, RFC5465-5.3-1..2, " +
		"RFC5465-5.4-1..2, RFC5465-5.5-1, RFC5465-5.8-1..2, RFC5465-6.1-1..2, RFC5465-7-1).",
	requirements: [
		// ── §3.1 The NOTIFY Command ──────────────────────────────────────────────

		{
			id: "RFC5465-3.1-1",
			source: "RFC5465",
			section: "3.1",
			title: "Client emits NOTIFY in one of its two forms: NOTIFY SET or NOTIFY NONE",
			text:
				"The NOTIFY command has two forms.  NOTIFY NONE specifies that the client is not " +
				"interested in any kind of event happening on the server.  NOTIFY SET replaces the " +
				"current list of interesting events with a new list of events.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: descriptive sentence, but together with the §8 ABNF it fixes the " +
				"grammar the client must emit — notify = \"NOTIFY\" SP (notify-set / notify-none); " +
				"notify-set = \"SET\" [status-indicator] SP event-groups (the optional STATUS " +
				"indicator yields the NOTIFY SET STATUS form); notify-none = \"NONE\"; event-group = " +
				"\"(\" filter-mailboxes SP events \")\" with filter-mailboxes drawn from " +
				"selected/selected-delayed/inboxes/personal/subscribed/subtree/mailboxes and events " +
				"either a parenthesized event list or NONE. Testable black-box: every NOTIFY the " +
				"client emits matches this grammar (SET with at least one event-group, or bare NONE). " +
				"Conditional on the client using NOTIFY; standalone in rev2 (NOTIFY absent from RFC " +
				"9051), so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5465-3.1-2",
			source: "RFC5465",
			section: "3.1",
			title: "Client MUST accept implicit-NOOP accumulated changes in NOTIFY SET's response stream",
			text:
				"A successful NOTIFY SET command MUST cause the server to immediately return any " +
				"accumulated changes to the currently selected mailbox (if any), such as flag changes " +
				"and new or expunged messages.  Thus, a successful NOTIFY SET command implies an " +
				"implicit NOOP command.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"The MUST is worded on the server; the extracted client duty is the reciprocal " +
				"ACCEPTANCE obligation: a client issuing NOTIFY SET while a mailbox is selected must " +
				"tolerate untagged FETCH/EXISTS/EXPUNGE responses interleaved before NOTIFY's tagged " +
				"OK, exactly as it would for a NOOP. Testable black-box: script accumulated-change " +
				"responses before the tagged OK and assert the client completes the NOTIFY command " +
				"without error. Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5465-3.1-3",
			source: "RFC5465",
			section: "3.1",
			title: "Client omitting SELECTED/SELECTED-DELAYED gets no message events for the selected mailbox",
			text:
				"If the SELECTED/SELECTED-DELAYED mailbox selector is not specified in the NOTIFY SET " +
				"command, this means that the client doesn't want to receive any <message-event>s for " +
				"the currently selected mailbox.  This is the same as specifying SELECTED NONE.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"The client-binding content is that a client which WANTS message events for the " +
				"currently selected mailbox must say so with a SELECTED/SELECTED-DELAYED event-group " +
				"— omission is a binding declaration of disinterest. But whether the client wanted " +
				"those events is an internal decision with no wire artifact: a NOTIFY SET without a " +
				"SELECTED group is fully compliant on its face, and a client that omitted the group " +
				"by mistake versus by choice emits byte-identical commands. Divergence would surface " +
				"only as the client's internal model wrongly expecting unsolicited message events " +
				"that (compliantly) never arrive, which a black-box observer cannot distinguish from " +
				"contented disinterest.",
			notes:
				"Judgment level: no RFC 2119 keyword; MAY reflects that this is default semantics " +
				"the client may rely on rather than an imperative. Conditional; standalone in rev2, " +
				"so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5465-3.1-4",
			source: "RFC5465",
			section: "3.1",
			title: "Client MUST accept STATUS responses before the tagged OK when using NOTIFY SET STATUS",
			text:
				"If the NOTIFY command enables MessageNew, MessageExpunge, AnnotationChange, or " +
				"FlagChange notifications for a mailbox other than the currently selected mailbox, " +
				"and the client has specified the STATUS indicator parameter, then the server MUST " +
				"send a STATUS response for that mailbox before NOTIFY's tagged OK.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"The MUST is worded on the server; the extracted client duty is the reciprocal PARSE " +
				"obligation: a client that sends NOTIFY SET STATUS must accept one untagged STATUS " +
				"response per watched non-selected mailbox arriving before the tagged OK — i.e. " +
				"STATUS responses for mailboxes the client never named in a STATUS command. The " +
				"follow-on server MUSTs fixing the STATUS items (MESSAGES/UIDNEXT/UIDVALIDITY, and " +
				"UIDVALIDITY+HIGHESTMODSEQ under CONDSTORE/QRESYNC) are server-emission duties " +
				"excluded per the extractionNote; the client just parses whatever items arrive. " +
				"Testable black-box: script the STATUS burst and assert the client completes NOTIFY " +
				"SET STATUS without error. Conditional on the client using the STATUS indicator; " +
				"standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5465-3.1-5",
			source: "RFC5465",
			section: "3.1",
			title: "Client SHOULD limit the number of mailboxes watched with NOTIFY",
			text:
				"Clients are advised to limit the number of mailboxes used with NOTIFY.  " +
				"Particularly, if a client asks for events for all accessible mailboxes, the server " +
				"may swamp the client with updates about shared mailboxes.  This may reduce the " +
				"client's battery life.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "performance-expectation",
			untestableRationale:
				"'Limit the number of mailboxes' names no threshold: there is no wire-observable " +
				"line between a prudent watch list and an excessive one. Whether a given NOTIFY SET " +
				"is 'too broad' depends on the deployment's mailbox count, update rate, network, and " +
				"battery constraints — a resource/performance judgment outside the protocol's " +
				"observable surface. Any NOTIFY SET the client emits, however broad, is " +
				"syntactically and semantically legal (the server's [NOTIFICATIONOVERFLOW] escape " +
				"hatch exists precisely because clients may legally over-ask), so no black-box " +
				"assertion can fail a client for watching 'too many' mailboxes.",
			notes:
				"Judgment level: 'advised to' mapped to SHOULD (pre-8174 advisory prose, no RFC 2119 " +
				"keyword). §9's self-denial-of-service warning restates the same concern without a " +
				"keyword and is not separately extracted. Conditional; standalone in rev2, so " +
				"[\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5465-3.1-6",
			source: "RFC5465",
			section: "3.1",
			title: "Client MUST accept the untagged extended LIST response with \\NoAccess",
			text:
				"If the name refers to a mailbox that the client can LIST (e.g., it has the 'l' " +
				"right from [RFC4314]), but the client doesn't have another right required for " +
				"processing of the specified event(s), then the server MUST respond with an untagged " +
				"extended LIST response containing the \\NoAccess name attribute.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"The MUST is worded on the server; the extracted client duty is the reciprocal PARSE " +
				"obligation: a client issuing NOTIFY must accept an untagged LIST response carrying " +
				"the non-RFC3501 \\NoAccess name attribute (§8: mbx-list-oflag =/ \"\\NoAccess\") in " +
				"NOTIFY's response stream. §3 notes a NOTIFY-compliant server 'must be able to " +
				"return extended LIST responses' per RFC 5258 even without advertising " +
				"LIST-EXTENDED, so the client must tolerate the extended LIST shape too (see " +
				"RFC5465-5.4-2 for the OLDNAME instance). Testable black-box: script '* LIST " +
				"(\\NoAccess) ...' before the tagged OK and assert the client completes without " +
				"error. Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5465-3.1-7",
			source: "RFC5465",
			section: "3.1",
			title: "Client MUST accept a tagged NO [NOTIFICATIONOVERFLOW] refusal of NOTIFY",
			text:
				"If the notification would be prohibitively expensive for the server (e.g., \"notify " +
				"me of all flag changes in all mailboxes\"), the server MAY refuse the command with a " +
				"tagged NO [NOTIFICATIONOVERFLOW] response.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Level records the source keyword (the server MAY refuse); the extracted client duty " +
				"is the reciprocal ACCEPTANCE obligation — a client issuing NOTIFY SET must treat a " +
				"tagged NO carrying the NOTIFICATIONOVERFLOW response code (§8: resp-text-code =/ " +
				"\"NOTIFICATIONOVERFLOW\") as a well-formed command refusal (notifications not " +
				"registered), not a protocol error. Distinct from the §5.8 UNTAGGED 'OK " +
				"[NOTIFICATIONOVERFLOW]' later-disable form (RFC5465-5.8-1). Testable black-box: " +
				"scripted tagged NO+resp-code, assert the client surfaces a clean failure. " +
				"Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5465-3.1-8",
			source: "RFC5465",
			section: "3.1",
			title: "Client MUST handle a tagged NO with [BADEVENT (...)] for unsupported event types",
			text:
				"If the client requests information for events of an unsupported type, the server " +
				"MUST refuse the command with a tagged NO response (not a BAD).  This response " +
				"SHOULD contain the BADEVENT response code, which MUST list names of all events " +
				"supported by the server.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"The MUSTs/SHOULD are worded on the server; the extracted client duty is the " +
				"reciprocal PARSE obligation: a client issuing NOTIFY SET must accept a tagged NO " +
				"whose resp-text-code is BADEVENT followed by a parenthesized list of supported " +
				"event names (§8: unsupported-events-code = \"BADEVENT\" SP \"(\" event-name *(SP " +
				"event-name) \")\") as a well-formed refusal — and must not treat the NO-not-BAD " +
				"outcome as a syntax failure. Testable black-box: scripted 'NO [BADEVENT " +
				"(MessageNew MessageExpunge)] ...' completion, assert clean failure surfacing. " +
				"Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},

		// ── §5 Event Types (composition rules binding the client's command) ─────

		{
			id: "RFC5465-5-1",
			source: "RFC5465",
			section: "5",
			title: "Client specifying FlagChange/AnnotationChange MUST also specify MessageNew and MessageExpunge",
			text:
				"If the FlagChange and/or AnnotationChange events are specified, MessageNew and " +
				"MessageExpunge MUST also be specified by the client.  Otherwise, the server MUST " +
				"respond with the tagged BAD response.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Direct UPPERCASE client MUST ('MUST also be specified by the client') — one of the " +
				"few in this server-heavy document. The second sentence is the server-enforcement " +
				"counterpart (quoted for context, not a separate client duty). Echoed by the §8 ABNF " +
				"comment ('If FlagChange is specified, then MessageNew and MessageExpunge MUST be " +
				"specified as well'). Testable black-box: any client-emitted event list containing " +
				"FlagChange or AnnotationChange also contains both MessageNew and MessageExpunge. " +
				"Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5465-5-2",
			source: "RFC5465",
			section: "5",
			title: "Client MUST specify MessageNew and MessageExpunge together",
			text:
				"If one of MessageNew or MessageExpunge is specified, then both events MUST be " +
				"specified.  Otherwise, the server MUST respond with the tagged BAD response.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Direct UPPERCASE MUST binding the client's event-list composition. Second sentence " +
				"is the server-enforcement counterpart (context only). Echoed by the §8 ABNF comment " +
				"('MessageNew and MessageExpunge MUST always be specified together'). Testable " +
				"black-box: no client-emitted event list contains exactly one of " +
				"MessageNew/MessageExpunge. Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5465-5-3",
			source: "RFC5465",
			section: "5",
			title: "Client suppresses events via omission, the NONE event specifier, or NOTIFY NONE",
			text:
				"The client can instruct the server not to send an event by omitting the necessary " +
				"event from the list of events specified in NOTIFY SET, by using the NONE event " +
				"specifier in the NOTIFY SET, or by using NOTIFY NONE.  In particular, NOTIFY SET " +
				"... NONE can be used as a snapshot facility by clients.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: 'can instruct' — a permission/mechanism, no RFC 2119 keyword; MAY. " +
				"The '...' in 'NOTIFY SET ... NONE' is the RFC's own literal text (a placeholder for " +
				"the mailbox specifier), not an elision by this catalog. The client-binding content " +
				"is the ENCODING of suppression intent: exactly these three forms (omit the event; " +
				"'(<filter-mailboxes> NONE)' per §8 events =/ \"NONE\"; bare NOTIFY NONE). Testable " +
				"black-box where a client is driven to cancel notifications: the cancellation is one " +
				"of these three wire forms. Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},

		// ── §5.1 FlagChange and AnnotationChange ─────────────────────────────────

		{
			id: "RFC5465-5.1-1",
			source: "RFC5465",
			section: "5.1",
			title: "Client MUST accept unsolicited FETCH (UID + FLAGS/ANNOTATION) between commands",
			text:
				"If the flag and/or message annotation change happens in the selected mailbox, the " +
				"server MUST notify the client by sending an unsolicited FETCH response, which MUST " +
				"include UID and FLAGS/ANNOTATION FETCH data items.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"The MUSTs are worded on the server; the extracted client duty is the reciprocal " +
				"ACCEPTANCE obligation: a client that requested FlagChange for the selected mailbox " +
				"must parse an untagged FETCH response arriving OUTSIDE any command in progress " +
				"(NOTIFY's defining behavior — 'the client listens for event notifications all the " +
				"time (even when no command is in progress)'), carrying UID and FLAGS (and/or " +
				"ANNOTATION) items, e.g. '* 99 FETCH (UID 9999 FLAGS ($Junk))'. The MAY " +
				"FLAGS/[PERMANENTFLAGS] follow-ups and the other-mailbox STATUS branch are covered by " +
				"the extractionNote exclusions and RFC5465-5.2-2 respectively. Testable black-box: " +
				"inject the unsolicited FETCH between commands and assert the client does not error " +
				"or misattribute it to a pending command. Conditional; standalone in rev2, so " +
				"[\"rev1\",\"rev2\"].",
		},

		// ── §5.2 MessageNew ──────────────────────────────────────────────────────

		{
			id: "RFC5465-5.2-1",
			source: "RFC5465",
			section: "5.2",
			title: "Client MUST accept unsolicited EXISTS followed by FETCH for MessageNew",
			text:
				"If the new/appended message is in the selected mailbox, the server notifies the " +
				"client by sending an unsolicited EXISTS response, followed by an unsolicited FETCH " +
				"response containing the information requested by the client.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: descriptive sentence (no RFC 2119 keyword) that establishes the " +
				"parse obligation — a client that requested MessageNew (with fetch-atts) for the " +
				"selected mailbox must accept an untagged EXISTS and a following untagged FETCH " +
				"carrying the requested attributes (possibly including literals, as in the §3.1 " +
				"example's BODY[HEADER.FIELDS ...] {75}), arriving between commands. Testable " +
				"black-box: inject '* 444 EXISTS' + '* 444 FETCH (UID 9999)' between commands and " +
				"assert clean parsing. Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5465-5.2-2",
			source: "RFC5465",
			section: "5.2",
			title: "Client MUST accept unsolicited STATUS responses for non-selected mailboxes",
			text:
				"If the new/appended message is in another mailbox, the server sends an unsolicited " +
				"STATUS (UIDNEXT MESSAGES) response for the relevant mailbox.  If the CONDSTORE " +
				"extension [RFC4551] and/or the QRESYNC extension [RFC5162] is enabled, the " +
				"HIGHESTMODSEQ status data item MUST be included in the STATUS response.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level on the first (descriptive) sentence; the second sentence's MUST is a " +
				"server-emission duty. The extracted client duty is the reciprocal ACCEPTANCE " +
				"obligation: a client watching non-selected mailboxes must parse untagged STATUS " +
				"responses arriving unsolicited between commands — for mailboxes it never named in a " +
				"STATUS command — including a HIGHESTMODSEQ item when CONDSTORE/QRESYNC is enabled. " +
				"This one entry covers the parallel other-mailbox STATUS branches of §5.1 (FlagChange " +
				"— 'at least HIGHESTMODSEQ and UIDVALIDITY') and §5.3 (MessageExpunge — 'STATUS " +
				"(UIDNEXT MESSAGES)' + HIGHESTMODSEQ under QRESYNC): the wire shape the client must " +
				"tolerate is identical, so a single acceptance duty is scored at its §5.2 statement. " +
				"Testable black-box: inject '* STATUS Lists/Lemonade (UIDNEXT 10002 MESSAGES 503)' " +
				"between commands and assert clean parsing. Conditional; standalone in rev2, so " +
				"[\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5465-5.2-3",
			source: "RFC5465",
			section: "5.2",
			title: "Client SHOULD NOT request fetch-atts that set \\Seen or presuppose a bodypart",
			text:
				"The client SHOULD NOT use FETCH attributes that implicitly set the \\seen flag, or " +
				"that presuppose the existence of a given bodypart.  UID, MODSEQ, FLAGS, ENVELOPE, " +
				"BODY.PEEK[HEADER.FIELDS... and BODY/BODYSTRUCTURE may be the most useful attributes.",
			level: "SHOULD NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Direct UPPERCASE client SHOULD NOT binding the fetch-att list the client embeds in " +
				"a MessageNew event (and in the §7 extended UPDATE option). The " +
				"'BODY.PEEK[HEADER.FIELDS...' truncation is the RFC's own literal text, not a " +
				"catalog elision. Testable black-box: inspect the emitted MessageNew fetch-att list " +
				"— no unpeeked BODY[...] section (which implicitly sets \\Seen) and no numbered " +
				"part-specifier like BODY.PEEK[2] (which presupposes a bodypart's existence). " +
				"Conditional on the client requesting MessageNew fetch-atts; standalone in rev2, so " +
				"[\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5465-5.2-4",
			source: "RFC5465",
			section: "5.2",
			title: "Client with SELECTED MessageNew cannot reference messages via '*'",
			text:
				"Note that if a client asks to be notified of MessageNew events with the SELECTED " +
				"mailbox specifier, the number of messages can increase at any time, and therefore " +
				"the client cannot refer to a specific message using the MSN/UID '*'.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: 'cannot refer' carries no RFC 2119 keyword but states a hard " +
				"prohibition — once MessageNew is active for the selected mailbox via SELECTED, '*' " +
				"no longer denotes a stable message, so a compliant client must not use '*' (or " +
				"'n:*') expecting a specific message. Mapped to MUST NOT as the operative " +
				"prohibition. Companion to RFC5465-5.3-2 (the MSN prohibition from MessageExpunge); " +
				"§4 notes SELECTED-DELAYED as the escape hatch for clients that keep using MSNs/'*'. " +
				"Testable black-box: after NOTIFY SET (SELECTED (MessageNew ... MessageExpunge)), " +
				"the client's message references avoid '*'. Conditional; standalone in rev2, so " +
				"[\"rev1\",\"rev2\"].",
		},

		// ── §5.3 MessageExpunge ──────────────────────────────────────────────────

		{
			id: "RFC5465-5.3-1",
			source: "RFC5465",
			section: "5.3",
			title: "Client MUST accept unsolicited EXPUNGE (or VANISHED) between commands",
			text:
				"If the expunged message or messages are in the selected mailbox, the server " +
				"notifies the client using EXPUNGE (or VANISHED, if [RFC5162] is supported by the " +
				"server and enabled by the client).",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: descriptive sentence establishing the parse obligation — a client " +
				"that requested MessageExpunge for the selected mailbox must accept untagged EXPUNGE " +
				"responses (or VANISHED, only if the client itself enabled QRESYNC) arriving OUTSIDE " +
				"any command in progress, and must apply the consequent MSN renumbering. This is the " +
				"acceptance duty that makes the RFC5465-5.3-2 MSN prohibition necessary. Testable " +
				"black-box: inject '* 444 EXPUNGE' between commands and assert the client parses it " +
				"and stays in sync. Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5465-5.3-2",
			source: "RFC5465",
			section: "5.3",
			title: "Client with SELECTED MessageExpunge cannot use MSNs; must use UID commands",
			text:
				"Note that if a client requests MessageExpunge with the SELECTED mailbox specifier, " +
				"the meaning of an MSN can change at any time, so the client cannot use MSNs in " +
				"commands anymore.  For example, such a client cannot use FETCH, but has to use UID " +
				"FETCH.  The meaning of '*' can also change when messages are added or expunged.  A " +
				"client wishing to keep using MSNs can either use the SELECTED-DELAYED mailbox " +
				"specifier or can avoid using the MessageExpunge event entirely.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: 'cannot use MSNs in commands anymore' / 'has to use UID FETCH' — no " +
				"RFC 2119 keyword, but an operative prohibition: with immediate expunge " +
				"notifications, MSNs may be invalidated between the client composing and the server " +
				"parsing a command, so a compliant client uses only UID-based commands. The last " +
				"sentence records the two compliant alternatives (SELECTED-DELAYED, per §4 and " +
				"§6.1.2, or forgoing MessageExpunge — though per RFC5465-5-2 that also forgoes " +
				"MessageNew). Testable black-box: after NOTIFY SET (SELECTED (MessageNew " +
				"MessageExpunge)), every message-addressed command the client emits is a UID " +
				"command. Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},

		// ── §5.4 MailboxName ─────────────────────────────────────────────────────

		{
			id: "RFC5465-5.4-1",
			source: "RFC5465",
			section: "5.4",
			title: "Client MUST accept unsolicited LIST responses (incl. \\Nonexistent) for MailboxName events",
			text:
				"The server notifies the client by sending an unsolicited LIST response for each " +
				"affected mailbox name.  If, after the event, the mailbox name does not refer to a " +
				"mailbox accessible to the client, the \\Nonexistent flag MUST be included.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level on the first (descriptive) sentence; the \\Nonexistent MUST is a " +
				"server-emission duty. The extracted client duty is the reciprocal ACCEPTANCE " +
				"obligation: a client that requested MailboxName must parse untagged LIST responses " +
				"arriving unsolicited between commands — outside any LIST command — including the " +
				"non-RFC3501 \\Nonexistent name attribute (e.g. '* LIST (\\NonExistent) \".\" " +
				"\"INBOX.DeletedMailbox\"'). Testable black-box: inject the unsolicited LIST forms " +
				"between commands and assert clean parsing. Conditional; standalone in rev2, so " +
				"[\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5465-5.4-2",
			source: "RFC5465",
			section: "5.4",
			title: "Client MUST accept the extended LIST response with the OLDNAME data item on rename",
			text:
				"For each LISTable mailbox renamed, the server sends an extended LIST response " +
				"[RFC5258] for the new mailbox name, containing the OLDNAME extended data item with " +
				"the old mailbox name.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: descriptive sentence establishing the parse obligation — a client " +
				"that requested MailboxName must accept the RFC 5258 extended-LIST shape carrying " +
				"OLDNAME (§8: oldname-extended-item = \"OLDNAME\" SP \"(\" mailbox \")\"; the OLDNAME " +
				"tag may arrive quoted or unquoted), e.g. '* LIST () \"/\" \"NewMailbox\" " +
				"(\"OLDNAME\" (\"OldMailbox\"))'. §3 makes this unconditional on LIST-EXTENDED: a " +
				"NOTIFY server need not advertise RFC 5258 yet 'must be able to return extended LIST " +
				"responses', so a NOTIFY client cannot gate its extended-LIST parsing on the " +
				"LIST-EXTENDED capability. Testable black-box: inject the OLDNAME response between " +
				"commands and assert clean parsing. Conditional; standalone in rev2, so " +
				"[\"rev1\",\"rev2\"].",
		},

		// ── §5.5 SubscriptionChange ──────────────────────────────────────────────

		{
			id: "RFC5465-5.5-1",
			source: "RFC5465",
			section: "5.5",
			title: "Client MUST accept unsolicited LIST with \\Subscribed for SubscriptionChange events",
			text:
				"The server notifies the client by sending an unsolicited LIST response for each " +
				"affected mailbox name.  If and only if the mailbox is subscribed after the event, " +
				"the \\Subscribed attribute (see [RFC5258]) is included.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: descriptive sentences establishing the parse obligation — a client " +
				"that requested SubscriptionChange must accept untagged LIST responses (not LSUB) " +
				"between commands, reading subscription state from the presence/absence of the RFC " +
				"5258 \\Subscribed attribute, e.g. '* LIST (\\Subscribed) \"/\" " +
				"\"SubscribedMailbox\"'. First sentence is verbatim-identical to RFC5465-5.4-1's " +
				"first sentence but states a distinct duty for a distinct event type in a distinct " +
				"section, so it carries its own id (RFC5464-4.3-1 precedent). The accurate-attributes " +
				"MUST that follows is a server-computation duty (excluded). Testable black-box: " +
				"inject the LIST between commands and assert clean parsing. Conditional; standalone " +
				"in rev2, so [\"rev1\",\"rev2\"].",
		},

		// ── §5.8 Notification Overflow ───────────────────────────────────────────

		{
			id: "RFC5465-5.8-1",
			source: "RFC5465",
			section: "5.8",
			title: "Client MUST accept the untagged OK [NOTIFICATIONOVERFLOW] response",
			text:
				"It MUST notify these clients by sending an untagged \"OK [NOTIFICATIONOVERFLOW]\" " +
				"response and behave as if a NOTIFY NONE command had just been received.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"The MUST is worded on the server ('It' = the server, from the preceding sentence " +
				"quoted in RFC5465-5.8-2); the extracted client duty is the reciprocal PARSE " +
				"obligation: a client with active NOTIFY registrations must accept an untagged '* OK " +
				"[NOTIFICATIONOVERFLOW] ...' arriving at any time — including between commands — as " +
				"a well-formed response. Distinct from the §3.1 TAGGED-NO refusal form " +
				"(RFC5465-3.1-7): this one arrives after a previously successful NOTIFY SET. " +
				"Testable black-box: inject the untagged OK+resp-code between commands and assert " +
				"the client does not error. Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5465-5.8-2",
			source: "RFC5465",
			section: "5.8",
			title: "Client (implicit) must treat notifications as cancelled after NOTIFICATIONOVERFLOW",
			text:
				"If the server is unable or unwilling to deliver as many notifications as it is " +
				"being asked to, it may disable notifications for some or all clients.  It MUST " +
				"notify these clients by sending an untagged \"OK [NOTIFICATIONOVERFLOW]\" response " +
				"and behave as if a NOTIFY NONE command had just been received.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-state",
			untestableRationale:
				"The implicit client duty — after 'behave as if a NOTIFY NONE command had just been " +
				"received', the client's model of its notification registrations must flip to NONE, " +
				"since continuing to rely on push updates would silently desynchronize it — governs " +
				"the client's internal state, not a mandated wire action. The RFC prescribes no " +
				"recovery: a compliant client may re-issue a narrower NOTIFY SET, fall back to " +
				"polling with NOOP/STATUS, re-SELECT to resynchronize the selected mailbox, or do " +
				"nothing at all if the user no longer needs the data — and 'no visible reaction' is " +
				"therefore indistinguishable on the wire from the non-compliant client that failed " +
				"to update its model and still believes notifications flow. The divergence (a stale " +
				"internal belief) surfaces only as absent expectations, which a black-box observer " +
				"cannot detect.",
			notes:
				"Judgment call: implicit client duty derived from the server-worded MUST; no RFC " +
				"2119 keyword binds the client directly (level records the source sentence's MUST). " +
				"The wire-facing half of this paragraph — accepting the untagged OK resp-code — is " +
				"the testable RFC5465-5.8-1. Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},

		// ── §6.1 Mailbox Specifiers Affecting the Currently Selected Mailbox ────

		{
			id: "RFC5465-6.1-1",
			source: "RFC5465",
			section: "6.1",
			title: "Client MUST NOT specify both SELECTED and SELECTED-DELAYED in one NOTIFY command",
			text:
				"Only one of the mailbox specifiers affecting the currently selected mailbox can be " +
				"specified in any NOTIFY command.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: 'Only one ... can be specified' carries no RFC 2119 keyword but is " +
				"a hard composition restriction on the client's command, reinforced by the §8 ABNF " +
				"comment on filter-mailboxes-selected ('Only one of them can be specified in a " +
				"NOTIFY command'). Mapped to MUST NOT (the client must not emit event-groups naming " +
				"both SELECTED and SELECTED-DELAYED). Testable black-box: inspect the emitted NOTIFY " +
				"SET for at most one selected-family specifier. Conditional; standalone in rev2, so " +
				"[\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5465-6.1-2",
			source: "RFC5465",
			section: "6.1",
			title: "Client MUST NOT pair non-message events with SELECTED/SELECTED-DELAYED",
			text:
				"The mailbox specifiers only apply to <message-event>s.  It is an error to specify " +
				"other types of events with either the SELECTED or the SELECTED-DELAYED selector.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: 'It is an error' carries no RFC 2119 keyword but states a hard " +
				"prohibition on the client's event-group composition, reinforced by the §8 ABNF " +
				"comment on event-group ('Only <message-event>s are allowed in <events> when " +
				"<filter-mailboxes-selected> is used'). Mapped to MUST NOT: a SELECTED/" +
				"SELECTED-DELAYED event-group may contain only MessageNew/MessageExpunge/FlagChange/" +
				"AnnotationChange (or NONE), never MailboxName, SubscriptionChange, " +
				"MailboxMetadataChange, or ServerMetadataChange. Testable black-box: inspect the " +
				"emitted event lists in selected-family groups. Conditional; standalone in rev2, so " +
				"[\"rev1\",\"rev2\"].",
		},

		// ── §7 Extension to SEARCH and SORT Commands ─────────────────────────────

		{
			id: "RFC5465-7-1",
			source: "RFC5465",
			section: "7",
			title: "Client MAY request fetch-atts via the extended UPDATE return option",
			text:
				"If the server that supports the NOTIFY extension also supports CONTEXT=SEARCH " +
				"and/or CONTEXT=SORT as defined in [RFC5267], the UPDATE return option is extended " +
				"so that a client can request that FETCH attributes be returned when a new message " +
				"is added to the context result set.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: 'can request' — a permission, no RFC 2119 keyword; MAY. The " +
				"client-binding content is the COMMAND FORM this document adds to RFC 5267's UPDATE " +
				"return option (§8: modifier-update = \"UPDATE\" [ \"(\" fetch-att *(SP fetch-att) " +
				"\")\" ]), e.g. 'SEARCH RETURN (COUNT UPDATE (UID BODY[HEADER.FIELDS (TO FROM " +
				"SUBJECT)])) FROM \"boss\"'. Doubly conditional: requires both NOTIFY and " +
				"CONTEXT=SEARCH/CONTEXT=SORT support (base UPDATE/CONTEXT duties live in the RFC " +
				"5267 catalog file; only the fetch-att parenthesis defined here is scored here). The " +
				"§7 EXISTS/FETCH/ESEARCH ordering MUSTs and the no-FETCH-on-flag-change SHOULD are " +
				"server-generation duties (excluded; see extractionNote). The RFC5465-5.2-3 " +
				"fetch-att SHOULD NOT applies to this list too. Testable black-box: a client-emitted " +
				"UPDATE option with fetch-atts matches the modifier-update grammar. Conditional; " +
				"standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
	],
};

export default rfc5465;
