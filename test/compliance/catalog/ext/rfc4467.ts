import type { CatalogModule } from "../types";

const rfc4467: CatalogModule = {
	source: "RFC4467",
	extractionNote:
		"RFC 4467 (Internet Message Access Protocol (IMAP) - URLAUTH Extension). Full document " +
		"reviewed: Abstract, §1 Introduction [§1.1 Conventions], §2 Concepts [§2.1 URLAUTH, §2.2 " +
		"Mailbox Access Key, §2.3 Authorized Access Identifier, §2.4 Authorization Mechanism " +
		"(§2.4.1 INTERNAL Authorization Mechanism), §2.5 Authorization Token], §3 IMAP URL " +
		"Extensions, §4 Discussion of URLAUTH Authorization Issues, §5 Generation of " +
		"URLAUTH-Authorized URLs, §6 Validation of URLAUTH-authorized URLs, §7 Additional Commands " +
		"[BASE.6.3.RESETKEY, BASE.6.3.GENURLAUTH, BASE.6.3.URLFETCH], §8 Additional Responses " +
		"[BASE.7.1.URLMECH, BASE.7.4.GENURLAUTH, BASE.7.4.URLFETCH], §9 Formal Syntax, §10 Security " +
		"Considerations, §11 IANA Considerations, §12 Normative References, §13 Informative " +
		"References, Author's Address, Full Copyright Statement, Intellectual Property, " +
		"Acknowledgement.\n\n" +
		"CLIENT/SERVER SPLIT. This extension is heavily server-key-management and " +
		"server-validation-heavy; most normative sentences bind the SERVER's key store, token " +
		"generation, and URL-validation duties, and are excluded here. Excluded as server-only: " +
		"§2.2 the mailbox-access-key entropy/unpredictability MUSTs ('MUST be unpredictable'), " +
		"§2.4.1 the token-generation-algorithm SHOULDs (server implementation choice, 'Server " +
		"implementations SHOULD consider the possibility of changing the algorithm', 'the server " +
		"SHOULD incorporate some means of identifying the token generation algorithm'); §4 (pure " +
		"discussion, no client MUSTs); §5 the token-CALCULATION duties (the server computes the " +
		"authorization token from the rump URL and its secret — this is server-side generation, " +
		"not something a client constructs; a client only ever receives a complete, " +
		"already-authorized URL back from GENURLAUTH, per §8 BASE.7.4.GENURLAUTH — so the " +
		"'appending the mechanism name and hex token' step is a server duty, not a client " +
		"construction duty as the task's scope note anticipated); §6 (entirely server-side " +
		"validation: rump-URL derivation for VALIDATION, timing-attack mitigation, token " +
		"recalculation — none of this binds a client, which never validates a URLAUTH itself); §7 " +
		"BASE.6.3.RESETKEY 'Any current IMAP session ... will receive an untagged OK response with " +
		"the URLMECH status response code' (server push behavior; the client's counterpart parse " +
		"duty is captured via RFC4467-8-1); §7 BASE.6.3.GENURLAUTH the server's four-point " +
		"validation checklist ('The server MUST validate each supplied URL as follows ...', '(1) " +
		"The mailbox component ... MUST refer to an existing mailbox', '(2) The server component " +
		"... MUST contain a valid userid ...', 'the iserver rule of [IMAPURL] is modified so that " +
		"iuserauth is mandatory', '(4) The server MAY also verify ...') and its BAD/OK-with-a-" +
		"poisoned-key failure handling ('If any of the above checks fail, the server MUST return a " +
		"tagged BAD response ...', 'the server MAY issue a tagged OK response with a generated " +
		"mailbox key that always fails validation'), and 'If there is currently no mailbox access " +
		"key for the given mailbox ... one is automatically generated' (server key-table " +
		"maintenance); §7 BASE.6.3.URLFETCH 'The URLFETCH command effectively executes with the " +
		"access of the userid in the server component of the URL' (server authorization-resolution " +
		"semantics, not a client action), 'A NO response indicates a server internal failure', 'a " +
		"server SHOULD NOT issue a NO response', and 'The server MUST return NIL for any IMAP URL " +
		"that references an entire IMAP server, a list of mailboxes, an entire IMAP mailbox, or " +
		"IMAP search results' (server response-generation rule; the URLAUTH-not-applicable-to-" +
		"those-URL-forms client-facing counterpart is separately captured at RFC4467-3-2 since it " +
		"binds what a client may legally construct); §8 BASE.7.1.URLMECH 'A server implementation " +
		"MUST implement a configuration that will not return a URLMECH status response code unless " +
		"some mechanism is provided that protects the session from snooping' (server deployment-" +
		"configuration duty); §9 Formal Syntax entries already fully captured by their prose " +
		"counterparts are not double-extracted as separate ABNF entries, except where the ABNF is " +
		"the ONLY place a client-binding shape is pinned down precisely (RFC4467-9-1..3); §10 " +
		"almost entirely server security posture (mailbox-access-key entropy, token-generation-" +
		"algorithm agility, timing-attack countermeasures, progressive-delay throttling, URLMECH " +
		"disclosure gating, cross-server authorization diligence) — the two access-identifier " +
		"caution notes ('should be made with caution' / 'should be made with extreme caution') are " +
		"lowercase, non-2119, human-operator guidance about WHICH access identifier to choose when " +
		"generating a URL (a policy/judgment call, not a protocol action) and are excluded as " +
		"user-intent-policy: this document's design already routes GENURLAUTH access-identifier " +
		"choice into the untestable RFC4467-3-1 entry below rather than duplicating it here; §11 " +
		"IANA registration provisions (registry-maintenance policy, not a live client duty); §12/13 " +
		"references and boilerplate.\n\n" +
		"CAPABILITY GATE: §1 abstract/§11 establish the 'URLAUTH' capability string; §9 Formal " +
		"Syntax pins the ABNF 'capability =/ \"URLAUTH\"'. A client MUST NOT use GENURLAUTH, " +
		"URLFETCH, or RESETKEY (and MUST NOT construct URLAUTH-bearing URLs) unless the server has " +
		"advertised URLAUTH, per the standing capability-gating convention applied to every prior " +
		"extension in this suite (RFC2971-style, no distinct per-RFC citation needed beyond the " +
		"capability string itself) — captured as RFC4467-1-1.\n\n" +
		"CLIENT-BINDING extracted (16 entries): §1/§9 the URLAUTH capability gate; §3 the URLAUTH-" +
		"authorized-URL construction/placement duties a client observes when it builds " +
		"';URLAUTH=<access>:<mech>:<token>' onto a URL for CATENATE/BURL/submission use " +
		"(trailing-position " +
		"MUST, the URLAUTH-not-applicable-to-whole-server/mailbox-list/whole-mailbox/search-results " +
		"MUST NOT, the three access-identifier construction forms 'submit+<userid>', " +
		"'user+<userid>', 'authuser', 'anonymous', and the EXPIRE= construction); §7 the RESETKEY, " +
		"GENURLAUTH, and URLFETCH command forms (arguments, result codes); §8 the '* GENURLAUTH' " +
		"and '* URLFETCH' unsolicited/untagged response acceptance duties (including the nstring-" +
		"body / NIL-on-invalid semantics of the URLFETCH response) and the URLMECH status response " +
		"code parse duty; §9 the three ABNF shapes that pin down client-observable wire structure " +
		"beyond what the prose alone fixes (the RESETKEY argument grammar, the GENURLAUTH command's " +
		"repeatable url-rump/mechanism pairing, and the rump-URL-plus-mechanism-plus-token IURLAUTH " +
		"composition a client must reproduce when hand-assembling a full authorized URL it received " +
		"back, e.g. for logging or re-transmission).\n\n" +
		"Untestable: 1 entry — RFC4467-3-1 (choice of access identifier when generating a URL, " +
		"user-intent-policy: which of the four access-identifier forms a client selects when it " +
		"asks the server to GENURLAUTH a given URL is a policy decision about who should be able " +
		"to redeem it, not a protocol-observable correctness fact — any of the four forms is a " +
		"legal, well-formed request). Total: 16 client-binding entries (RFC4467-1-1, RFC4467-3-1..5, " +
		"RFC4467-7-1..3, RFC4467-8-1..4, RFC4467-9-1..3).\n\n" +
		"RFC 8174 discipline: RFC 4467 predates RFC 8174 and cites only RFC 2119 (§1.1 'The key " +
		"words \"MUST\", \"MUST NOT\", \"SHOULD\", \"SHOULD NOT\", and \"MAY\" in this document are " +
		"to be interpreted as defined in [KEYWORDS]'), so lowercase 'must'/'should' were never " +
		"normative here anyway; every extracted entry rests on an UPPERCASE RFC 2119 keyword in its " +
		"source sentence EXCEPT the command/response/ABNF structural entries (RFC4467-7-1..3, " +
		"RFC4467-8-1..4, RFC4467-9-1..3), which are judgment-level MUSTs derived from command-" +
		"definition-table and ABNF conventions (flagged in their notes, matching the RFC5464 " +
		"precedent for GETMETADATA/SETMETADATA/METADATA-response entries) and RFC4467-3-1, whose " +
		"MAY level is likewise a judgment call (the access identifier is an optional-but-mandatory-" +
		"if-URLAUTH-used choice among four named forms, not a bare RFC 2119 keyword sentence).\n\n" +
		"PROFILES: URLAUTH is not folded into IMAP4rev2 (RFC 9051) — verified by grepping " +
		"catalog/rfc9051.ts for URLAUTH/GENURLAUTH/RESETKEY/URLFETCH (zero hits). It remains a " +
		"standalone extension in rev2, so every entry defaults profiles: [\"rev1\",\"rev2\"] (a " +
		"rev2 client using URLAUTH is bound by this document alone; no double-scoring against a " +
		"9051 core duty is possible). All entries are applicability: conditional (bind only when " +
		"the client uses URLAUTH).",
	requirements: [
		// ── §1 / §9 Capability gate ──────────────────────────────────────────────

		{
			id: "RFC4467-1-1",
			source: "RFC4467",
			section: "1",
			title: "Client MUST NOT use URLAUTH commands/URL construction without the URLAUTH capability",
			text: 'An IMAP server that supports this extension indicates this with a\n   capability name of "URLAUTH".',
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: descriptive capability-advertisement sentence, no RFC 2119 keyword, " +
				"but establishes the standard capability-gating duty applied throughout this suite: a " +
				"compliant client MUST NOT issue GENURLAUTH, URLFETCH, or RESETKEY, nor construct a " +
				"URLAUTH-bearing URL for later use (e.g. via BURL), unless the server has advertised " +
				"'URLAUTH' in its CAPABILITY response (reinforced by §9 Formal Syntax 'capability =/ " +
				'"URLAUTH"\'). Testable black-box: a compliant client never emits these commands or ' +
				"URLAUTH= URL components against a server that omitted URLAUTH from CAPABILITY. " +
				"Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},

		// ── §3 IMAP URL Extensions (client URL-construction duties) ─────────────

		{
			id: "RFC4467-3-1",
			source: "RFC4467",
			section: "3",
			title: "Client selects one of four access-identifier forms when requesting a URLAUTH-authorized URL",
			text:
				'The "submit+" access identifier prefix, followed by a userid,\n   indicates that only a userid authorized as a message submission\n   entity on behalf of the specified userid is permitted to use this\n   URL.',
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "user-intent-policy",
			untestableRationale:
				"Which access identifier a client picks when it builds the ';URLAUTH=<access>' " +
				"component to hand to GENURLAUTH — 'submit+<userid>' (this entry), 'user+<userid>' " +
				"(RFC4467-3-3), 'authuser' (RFC4467-3-4), or 'anonymous' (RFC4467-3-5) — is a policy " +
				"decision about the intended audience/redeemer of the resulting URL (message-" +
				"submission-on-behalf-of, a specific user, any authenticated user, or anyone). All " +
				"four are equally well-formed GENURLAUTH requests; a black-box observer sees only " +
				"which literal string the client sent, not whether that choice matches the client's " +
				"actual intended-use policy for the URL it is generating (e.g. a BURL-forward " +
				"scenario legitimately wants 'submit+', while a public-export scenario legitimately " +
				"wants 'anonymous') — there is no protocol-observable 'correct' choice to check " +
				"against.",
			notes:
				"Judgment level: descriptive definition of the access-identifier form, no direct RFC " +
				"2119 keyword; level MAY reflects that using any particular access identifier is an " +
				"available option among four, none mandatory in isolation. Companion forms " +
				"RFC4467-3-3..5 are cataloged as testable CONSTRUCTION-FORM entries (the literal " +
				"syntax the client must emit for the form it picked); this entry captures only the " +
				"untestable CHOICE-of-which-form. Conditional; standalone in rev2, so " +
				'[\"rev1\",\"rev2\"].',
		},
		{
			id: "RFC4467-3-2",
			source: "RFC4467",
			section: "3",
			title: "Client MUST NOT construct a URLAUTH for a whole-server/mailbox-list/whole-mailbox/search-result URL",
			text:
				"URLAUTH does not apply to, and MUST NOT be used with, any IMAP URL\n   that refers to an entire IMAP server, a list of mailboxes, an entire\n   IMAP mailbox, or IMAP search results.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Explicit RFC 2119 MUST NOT binding whatever party constructs the URLAUTH-bearing " +
				"URL, most directly the client requesting GENURLAUTH for it. Testable black-box: a " +
				"compliant client's GENURLAUTH argument list never contains a URL of those four kinds " +
				"(server-root, mailbox-list, whole-mailbox, or IMAP SEARCH-result form) — only URLs " +
				"addressing a specific message or message part. The reciprocal server enforcement " +
				"('The server MUST return NIL for any IMAP URL that references' one of those forms, " +
				"§7 BASE.6.3.URLFETCH) is excluded as server-only. Conditional; standalone in rev2, " +
				'so [\"rev1\",\"rev2\"].',
		},
		{
			id: "RFC4467-3-3",
			source: "RFC4467",
			section: "3",
			title: "Client constructs the user+<userid> access identifier verbatim when limiting a URL to one user",
			text:
				'The "user+" access identifier prefix, followed by a userid, indicates\n   that use of this URL is limited to IMAP sessions that are logged in\n   as the specified userid (that is, have authorization identity as that\n   userid).',
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: descriptive definition, no direct RFC 2119 keyword; MAY as this is " +
				"one of the optional access-identifier forms a client may construct (see " +
				"RFC4467-3-1 for the untestable choice-of-form). Testable black-box CONSTRUCTION " +
				"shape: a client choosing this form emits exactly the literal prefix 'user+' " +
				"immediately followed by the target userid as the access identifier, e.g. " +
				'\'urlauth=user+fred\'. When a SASL mechanism providing both authorization and ' +
				"authentication identifiers is used, this entry's companion sentence ('the \"user+\" " +
				"access identifier MUST match the authorization identifier') binds the client to use " +
				"the SASL-negotiated authorization identifier, not an arbitrary userid, for that " +
				'prefix — folded into this entry as it governs the same construction act. ' +
				'Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].',
		},
		{
			id: "RFC4467-3-4",
			source: "RFC4467",
			section: "3",
			title: "Client constructs the authuser access identifier verbatim to permit any authorized user",
			text:
				'The "authuser" access identifier indicates that use of this URL is\n   limited to IMAP sessions that are logged in as an authorized user\n   (that is, have authorization identity as an authorized user) of that\n   IMAP server.',
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: descriptive definition, no direct RFC 2119 keyword; MAY as one of " +
				"the optional access-identifier forms. Testable black-box CONSTRUCTION shape: a " +
				"client choosing this form emits exactly the bare literal token 'authuser' (no " +
				"userid suffix) as the access identifier. Conditional; standalone in rev2, so " +
				'[\"rev1\",\"rev2\"].',
		},
		{
			id: "RFC4467-3-5",
			source: "RFC4467",
			section: "3",
			title: "Client constructs the anonymous access identifier verbatim to permit unrestricted use",
			text:
				'The "anonymous" access identifier indicates that use of this URL is\n   not restricted by session authorization identity; that is, any IMAP\n   session in authenticated or selected state (as defined in [IMAP]),\n   including anonymous sessions, may issue a URLFETCH using this URL.',
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: descriptive definition, no direct RFC 2119 keyword; MAY as one of " +
				"the optional access-identifier forms. Testable black-box CONSTRUCTION shape: a " +
				"client choosing this form emits exactly the bare literal token 'anonymous' (no " +
				"userid suffix) as the access identifier. Conditional; standalone in rev2, so " +
				'[\"rev1\",\"rev2\"].',
		},

		// ── §7 Additional Commands ───────────────────────────────────────────────

		{
			id: "RFC4467-7-1",
			source: "RFC4467",
			section: "7",
			title: "RESETKEY command form: optional mailbox name, optional mechanism name(s)",
			text: "Arguments:  optional mailbox name\n               optional mechanism name(s)",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: command-definition-table entry (BASE.6.3.RESETKEY), no direct RFC " +
				"2119 keyword, but pins the two legal command shapes a client may emit: 'RESETKEY' " +
				"alone (removes all keys), 'RESETKEY <mailbox>' (resets one mailbox's key, default " +
				"INTERNAL mechanism), or 'RESETKEY <mailbox> <mechanism> [<mechanism> ...]' (resets " +
				"and requests specific mechanisms) — confirmed by §9 ABNF 'resetkey = \"RESETKEY\" " +
				'[SP mailbox *(SP mechanism)]\' (RFC4467-9-1) and the worked examples (\'a31 ' +
				"RESETKEY', 'a32 RESETKEY INBOX', 'a33 RESETKEY INBOX XSAMPLE'). A compliant client " +
				"never emits a mechanism argument without a preceding mailbox argument (the grammar " +
				"has no such form). Testable black-box: script the three legal shapes and assert the " +
				"client emits only those. Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC4467-7-2",
			source: "RFC4467",
			section: "7",
			title: "GENURLAUTH command form: one or more URL/mechanism pairs",
			text: "Argument:   one or more URL/mechanism pairs",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: command-definition-table entry (BASE.6.3.GENURLAUTH), no direct RFC " +
				"2119 keyword, but pins the command shape: a client requests one or more URLs to be " +
				"authorized by supplying, for each, a URL followed by a mechanism name, e.g. " +
				"'GENURLAUTH \"imap://joe@example.com/INBOX/;uid=20;section=1.2;urlauth=submit+fred\" " +
				"INTERNAL'; confirmed by §9 ABNF 'genurlauth = \"GENURLAUTH\" 1*(SP url-rump SP " +
				"mechanism)' (RFC4467-9-2), which fixes that each URL argument MUST be immediately " +
				"paired with its own mechanism name (not one shared mechanism for a list of bare " +
				"URLs). Testable black-box: a compliant client's GENURLAUTH always alternates url / " +
				"mechanism tokens, never a bare URL without a following mechanism. Conditional; " +
				'standalone in rev2, so [\"rev1\",\"rev2\"].',
		},
		{
			id: "RFC4467-7-3",
			source: "RFC4467",
			section: "7",
			title: "URLFETCH command form: one or more URLs",
			text: "Argument:   one or more URLs",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: command-definition-table entry (BASE.6.3.URLFETCH), no direct RFC " +
				"2119 keyword, but pins the command shape: a client requests dereferencing of one or " +
				"more complete URLAUTH-authorized URLs in a single command, e.g. 'URLFETCH " +
				'"imap://joe@example.com/INBOX/;uid=20/;section=1.2;urlauth=submit+fred:internal:' +
				'91354a473744909de610943775f92038"\'; confirmed by §9 ABNF \'urlfetch = "URLFETCH" ' +
				'1*(SP url-full)\' (RFC4467-9-3, base form before the RFC 5524 BINARY/' +
				"BODYPARTSTRUCTURE extension parenthesized form). This command form does not require " +
				"a mailbox to be selected (§7: 'This command does not require that the URL refer to " +
				"the selected mailbox; nor does it require that any mailbox be selected'), so a " +
				"compliant client may issue URLFETCH in authenticated state without a prior SELECT. " +
				"Testable black-box: script a URLFETCH with 1+ url-full arguments and with no prior " +
				"SELECT and assert the client accepts the exchange. Conditional; standalone in rev2, " +
				'so [\"rev1\",\"rev2\"].',
		},

		// ── §8 Additional Responses ───────────────────────────────────────────────

		{
			id: "RFC4467-8-1",
			source: "RFC4467",
			section: "8",
			title: "Client MUST parse the URLMECH status response code on RESETKEY/SELECT/EXAMINE",
			text:
				"This status response code is returned in an untagged OK response in\n   response to a RESETKEY, SELECT, or EXAMINE command.  In the case of\n   the RESETKEY command, this status response code can be sent in the\n   tagged OK response instead of requiring a separate untagged OK\n   response.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: descriptive response-code placement rule (BASE.7.1.URLMECH), no " +
				"direct RFC 2119 keyword on the client, but the extracted client duty is the parse " +
				"obligation: a client using URLAUTH must accept '[URLMECH <mechanism> ...]' inside " +
				"an OK response — untagged OR tagged — to RESETKEY, and inside an untagged OK to " +
				"SELECT/EXAMINE, without erroring, per ABNF 'resp-text-code =/ \"URLMECH\" SP " +
				'"INTERNAL" *(SP mechanism [\"=\" base64])\'. Testable black-box: script each of the ' +
				"three command completions carrying the resp-code (e.g. 'a33 OK [URLMECH INTERNAL " +
				'XSAMPLE=P34OKhO7VEkCbsiYY8rGEg==] done\') and assert the client completes without ' +
				'error. Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].',
		},
		{
			id: "RFC4467-8-2",
			source: "RFC4467",
			section: "8",
			title: "Client MUST accept the untagged * GENURLAUTH response carrying the authorized URL(s)",
			text:
				"The GENURLAUTH response returns the URLAUTH-authorized URL(s)\n   requested by a GENURLAUTH command.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: descriptive response definition (BASE.7.4.GENURLAUTH), no direct " +
				"RFC 2119 keyword, but establishes the client's parse obligation for the untagged " +
				"'* GENURLAUTH <url-full> [<url-full> ...]' response, e.g. '* GENURLAUTH " +
				'"imap://joe@example.com/INBOX/;uid=20/;section=1.2;urlauth=submit+fred:internal:' +
				'91354a473744909de610943775f92038"\', confirmed by §9 ABNF \'genurlauth-data = "*" SP ' +
				'"GENURLAUTH" 1*(SP url-full)\' (RFC4467-9-2). A compliant client returns the full, ' +
				"now-authorized URL string(s) from this response rather than erroring or discarding " +
				"them. Testable black-box: script the untagged GENURLAUTH response before the tagged " +
				"OK and assert the client surfaces the returned URL(s). Conditional; standalone in " +
				'rev2, so [\"rev1\",\"rev2\"].',
		},
		{
			id: "RFC4467-8-3",
			source: "RFC4467",
			section: "8",
			title: "Client MUST accept the untagged * URLFETCH response with an nstring body per URL",
			text:
				"The returned data string is NIL if the URL is invalid for any reason\n   (including validation failure).",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: descriptive response-semantics sentence (BASE.7.4.URLFETCH), no " +
				"direct RFC 2119 keyword, but fixes the client's parse obligation for the untagged " +
				"'* URLFETCH <url-full> <nstring>' response (one url/nstring pair per requested " +
				'URL, confirmed by §9 ABNF \'urlfetch-data = "*" SP "URLFETCH" 1*(SP url-full SP ' +
				"nstring)', RFC4467-9-3): the data item is a normal nstring that MUST be accepted as " +
				"literal NIL when the URL was invalid/failed validation, per the worked example (a " +
				'valid URL returning \'{28}\\r\\nSi vis pacem, para bellum.\\r\\n\'). A client that ' +
				"assumes the fetched item is always a non-NIL string would mishandle the documented " +
				"invalid-URL case. Testable black-box: script both a successful URLFETCH (literal " +
				"body) and a NIL-body URLFETCH exchange and assert the client accepts both without " +
				'error. Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].',
		},
		{
			id: "RFC4467-8-4",
			source: "RFC4467",
			section: "8",
			title: "Client MUST NOT require a selected mailbox to accept a URLFETCH exchange",
			text:
				"Note: This command does not require that the URL refer to the\n      selected mailbox; nor does it require that any mailbox be\n      selected.  It also does not in any way interfere with any selected\n      mailbox.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: editorial Note (no RFC 2119 keyword), but states a hard behavioral " +
				"constraint equivalent to a client MUST NOT: URLFETCH must be usable, and its " +
				"untagged response accepted, with no mailbox selected and irrespective of which (if " +
				"any) mailbox is currently selected. This sentence is repeated verbatim under both " +
				"BASE.6.3.URLFETCH (§7) and BASE.7.4.URLFETCH (§8); cataloged once here under the " +
				"response section since the client-observable duty is accepting the exchange " +
				"regardless of selection state. Testable black-box: script a URLFETCH in " +
				"authenticated (not-selected) state, and again with an unrelated mailbox selected, " +
				"and assert the client accepts the untagged URLFETCH response identically in both " +
				'cases. Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].',
		},

		// ── §9 Formal Syntax (client-binding wire shapes not otherwise pinned) ──

		{
			id: "RFC4467-9-1",
			source: "RFC4467",
			section: "9",
			title: "RESETKEY ABNF: mailbox argument required before any mechanism argument(s)",
			text: 'resetkey        = "RESETKEY" [SP mailbox *(SP mechanism)]',
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"ABNF-only client-binding shape not fully pinned by the prose alone: the grammar " +
				"proves a mechanism token can never appear without a preceding mailbox token (there " +
				"is no '[SP mechanism]'-without-mailbox alternative). Companion to RFC4467-7-1's " +
				"prose-level command-shape entry. Judgment level MUST (grammar-fixed structure, no " +
				'inline 2119 keyword). Testable black-box. Conditional; standalone in rev2, so ' +
				'[\"rev1\",\"rev2\"].',
		},
		{
			id: "RFC4467-9-2",
			source: "RFC4467",
			section: "9",
			title: "GENURLAUTH ABNF: repeatable url-rump/mechanism pairs, at least one required",
			text: 'genurlauth      = "GENURLAUTH" 1*(SP url-rump SP mechanism)',
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"ABNF-only client-binding shape: '1*(SP url-rump SP mechanism)' proves (a) at least " +
				"one url/mechanism pair is required (GENURLAUTH takes no bare form), and (b) each " +
				"repetition is a strict pair — a client MUST NOT send an unpaired trailing URL or an " +
				"unpaired trailing mechanism. Note the argument is 'url-rump' (§9: 'contains " +
				"authimapurlrump as defined below' — i.e. the URL WITHOUT any ';URLAUTH=' suffix), " +
				"confirming a client requesting authorization sends the not-yet-authorized rump URL, " +
				"not a pre-existing authorized one. Companion to RFC4467-7-2's prose-level entry. " +
				"Judgment level MUST. Testable black-box. Conditional; standalone in rev2, so " +
				'[\"rev1\",\"rev2\"].',
		},
		{
			id: "RFC4467-9-3",
			source: "RFC4467",
			section: "9",
			title: "URLFETCH ABNF: repeatable url-full arguments, at least one required",
			text: 'urlfetch        = "URLFETCH" 1*(SP url-full)',
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"ABNF-only client-binding shape: '1*(SP url-full)' proves at least one URL is " +
				"required and each argument is a complete 'url-full' (§9: 'contains " +
				"authimapurlfull as defined below' — the full URL INCLUDING the ';URLAUTH=" +
				"<access>:<mech>:<token>' suffix), confirming URLFETCH's arguments are already-" +
				"authorized URLs (as received back from a prior GENURLAUTH), unlike GENURLAUTH's " +
				"own url-rump arguments (RFC4467-9-2). This base (unparenthesized) form is the one " +
				"this document defines; RFC 5524 extends it with an optional parenthesized " +
				"url-fetch-ext form carrying per-URL parameters (cross-referenced in rfc5524.ts, " +
				"not duplicated here). Companion to RFC4467-7-3's prose-level entry. Judgment level " +
				'MUST. Testable black-box. Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].',
		},
	],
};

export default rfc4467;
