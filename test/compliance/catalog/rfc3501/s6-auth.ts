import type { SpecRequirement } from "../types";

export const note =
	"§6.3.1 SELECT: 2 client-binding entries extracted (SHOULD implement defaults for missing untagged data; " +
	"state-machine rule that a failed SELECT leaves no mailbox selected — implicit MUST derived from protocol " +
	"state-machine prose). " +
	"§6.3.2 EXAMINE: 1 entry (tagged OK response MUST begin with [READ-ONLY]). " +
	"The EXAMINE MUST NOT cause \\Recent loss is a server obligation; the [READ-ONLY] response code is the " +
	"client-observable manifestation. " +
	"§6.3.3 CREATE: 0 client-binding normative statements — all obligations in this section are server-side " +
	"(server SHOULD create superior hierarchy; new UID values MUST be greater than prior incarnation). " +
	"§6.3.4 DELETE: 0 client-binding normative statements — all obligations are server-side " +
	"(MUST NOT remove inferior hierarchical names; MUST preserve highest-used UID). " +
	"§6.3.5 RENAME: 0 direct client-binding normative statements — rename of INBOX and inferior-hierarchy " +
	"behavior are server duties; no RFC 2119 keyword sentence binds the client in this section. " +
	"§6.3.6 SUBSCRIBE: 0 client-binding normative statements — the MAY-validate clause is a server option, " +
	"not a client obligation. " +
	"§6.3.7 UNSUBSCRIBE: 0 client-binding normative statements. " +
	"§6.3.8 LIST: 2 entries extracted (client SHOULD NOT use non-standard reference argument; hierarchical " +
	"browser MUST NOT assume server interpretation of reference). " +
	"§6.3.9 LSUB: 1 entry extracted (when LSUB flags differ from LIST flags, client MUST treat LIST flags as " +
	"more authoritative — the MAY-differ sentence imposes an interpretation rule on the client). " +
	"§6.3.10 STATUS: 3 entries extracted (SHOULD NOT on currently selected mailbox; MUST NOT as new-message check; " +
	"SHOULD NOT expect reasonable performance from many consecutive STATUS commands). " +
	"§6.3.11 APPEND: 2 entries extracted (literal argument SHOULD be in RFC-2822 format; MAY issue NOOP/CHECK after " +
	"APPEND when the server sends no untagged EXISTS).";

export const requirements: SpecRequirement[] = [

	// ── §6.3.1 SELECT ─────────────────────────────────────────────────────────

	{
		id: "RFC3501-6.3.1-1",
		source: "RFC3501",
		section: "6.3.1",
		title: "Client SHOULD implement defaults for missing SELECT untagged data",
		text:
			"Note that earlier versions of this protocol only required the FLAGS, EXISTS, and RECENT " +
			"untagged data; consequently, client implementations SHOULD implement default behavior for " +
			"missing data as discussed with the individual item.",
		level: "SHOULD",
		applicability: "always",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"The 'individual item' defaults are: if UNSEEN is absent the client cannot assume any " +
			"particular message is the first unseen; if PERMANENTFLAGS is absent the client SHOULD " +
			"assume all defined flags are permanent; if UIDNEXT is absent the client cannot predict " +
			"the next UID; if UIDVALIDITY is absent UID operations are unsupported. " +
			"Testable: a conforming client must not fail or error when any of these four optional " +
			"OK responses is omitted by the server.",
	},
	{
		id: "RFC3501-6.3.1-2",
		source: "RFC3501",
		section: "6.3.1",
		title: "Client must track that a failed SELECT leaves no mailbox selected",
		text:
			"The SELECT command automatically deselects any currently selected mailbox before " +
			"attempting the new selection. Consequently, if a mailbox is selected and a SELECT " +
			"command that fails is attempted, no mailbox is selected.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"No RFC 2119 keyword in the text, but the sentence describes a mandatory protocol " +
			"state-machine invariant: after a failed SELECT (tagged NO) the client is in Authenticated " +
			"state with no selected mailbox. A client that treats a failed SELECT as leaving the " +
			"previous mailbox selected would issue subsequent Selected-state commands against a " +
			"mailbox it is no longer in, violating the protocol state machine. Judgment: implicit MUST. " +
			"Testable: send SELECT for a non-existent mailbox when a mailbox is already selected; " +
			"observe that the client does not issue Selected-state commands (e.g., FETCH, STORE) " +
			"after the tagged NO.",
	},

	// ── §6.3.2 EXAMINE ────────────────────────────────────────────────────────

	{
		id: "RFC3501-6.3.2-1",
		source: "RFC3501",
		section: "6.3.2",
		title: "Client must recognise [READ-ONLY] in tagged OK response to EXAMINE",
		text:
			"The text of the tagged OK response to the EXAMINE command MUST begin with the " +
			"\"[READ-ONLY]\" response code.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"The MUST keyword here binds the server to send [READ-ONLY]; the client-binding " +
			"implication is that a conforming client MUST parse and respect this response code " +
			"to know it is in a read-only Selected state. Testable: after EXAMINE the server " +
			"response MUST carry [READ-ONLY]; a client that ignores this and attempts write " +
			"operations (e.g., STORE \\Deleted) violates the protocol constraint. " +
			"The companion rule — EXAMINE MUST NOT cause messages to lose \\Recent — is a " +
			"server-side obligation and produces no distinct client-binding statement.",
	},

	// ── §6.3.3 CREATE ─────────────────────────────────────────────────────────
	// No client-binding normative statements. All RFC 2119 keywords bind the server.

	// ── §6.3.4 DELETE ─────────────────────────────────────────────────────────
	// No client-binding normative statements. All RFC 2119 keywords bind the server.

	// ── §6.3.5 RENAME ─────────────────────────────────────────────────────────
	// No direct client-binding normative statements. INBOX special behavior and
	// inferior-hierarchy rename obligations are server duties. The client must
	// expect these semantics but no RFC 2119 sentence directly binds the client.

	// ── §6.3.6 SUBSCRIBE ──────────────────────────────────────────────────────
	// No client-binding normative statements.

	// ── §6.3.7 UNSUBSCRIBE ────────────────────────────────────────────────────
	// No client-binding normative statements.

	// ── §6.3.8 LIST ───────────────────────────────────────────────────────────

	{
		id: "RFC3501-6.3.8-1",
		source: "RFC3501",
		section: "6.3.8",
		title: "Client SHOULD NOT use non-standard reference argument except at user request",
		text:
			"A client SHOULD NOT use such a reference argument except at the explicit request of the user.",
		level: "SHOULD NOT",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "untestable",
		untestableTheme: "user-intent-policy",
		untestableRationale:
			"'At the explicit request of the user' is a behavioral/UI policy that cannot be observed " +
			"over the wire. A black-box test cannot determine whether a reference argument was sent " +
			"in response to a user request or autonomously by the client.",
		notes:
			"'Such a reference argument' refers to a reference that is not a level of mailbox hierarchy " +
			"or does not end with the hierarchy delimiter. The sentence appears in the context of the " +
			"LIST command reference argument interpretation paragraph. Applies when the client chooses " +
			"to send a non-empty reference argument.",
	},
	{
		id: "RFC3501-6.3.8-2",
		source: "RFC3501",
		section: "6.3.8",
		title: "Hierarchical browser MUST NOT assume server reference interpretation",
		text:
			"A hierarchical browser MUST NOT make any assumptions about server interpretation of the " +
			"reference unless the reference is a level of mailbox hierarchy AND ends with the hierarchy delimiter.",
		level: "MUST NOT",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "untestable",
		untestableTheme: "internal-decision",
		untestableRationale:
			"'Making assumptions' is an internal client implementation decision that is not directly " +
			"observable on the wire. A test can verify that the client sends syntactically correct " +
			"LIST commands but cannot observe whether it is making assumptions about how the server " +
			"interprets the reference component.",
		notes:
			"Applies when the client implementation is a hierarchical browser (mailbox tree navigator). " +
			"The condition under which assumptions ARE permitted is: reference is a hierarchy level AND " +
			"ends with the hierarchy delimiter. Any other reference form MUST be treated as opaque.",
	},

	// ── §6.3.9 LSUB ───────────────────────────────────────────────────────────

	{
		id: "RFC3501-6.3.9-1",
		source: "RFC3501",
		section: "6.3.9",
		title: "Client must treat LIST flags as more authoritative than LSUB flags when they differ",
		text:
			"The returned untagged LSUB response MAY contain different mailbox flags from a LIST " +
			"untagged response. If this should happen, the flags in the untagged LIST are considered " +
			"more authoritative.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"The text uses 'MAY' for the server permission to return differing flags, and 'are " +
			"considered more authoritative' as the client interpretation rule. The interpretation " +
			"rule is a normative client obligation with no RFC 2119 keyword; judgment: implicit MUST " +
			"because 'are considered' in RFC text establishes the canonical interpretation a client " +
			"must follow. Applies when the client has performed both LSUB and LIST for the same " +
			"mailbox and receives differing flag sets.",
	},

	// ── §6.3.10 STATUS ────────────────────────────────────────────────────────

	{
		id: "RFC3501-6.3.10-1",
		source: "RFC3501",
		section: "6.3.10",
		title: "Client SHOULD NOT use STATUS on the currently selected mailbox",
		text:
			"Because the STATUS command can cause the mailbox to be opened internally, and because " +
			"this information is available by other means on the selected mailbox, the STATUS command " +
			"SHOULD NOT be used on the currently selected mailbox.",
		level: "SHOULD NOT",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"Applies when the client has a mailbox in the Selected state. The alternative is to use " +
			"untagged EXISTS/RECENT/EXPUNGE responses and the SEARCH command. Testable: observe " +
			"whether the client issues STATUS against the currently selected mailbox name during a " +
			"session.",
	},
	{
		id: "RFC3501-6.3.10-2",
		source: "RFC3501",
		section: "6.3.10",
		title: "Client MUST NOT use STATUS as a check for new messages in the selected mailbox",
		text:
			"The STATUS command MUST NOT be used as a \"check for new messages in the selected " +
			"mailbox\" operation (refer to sections 7, 7.3.1, and 7.3.2 for more information about " +
			"the proper method for new message checking).",
		level: "MUST NOT",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"A stronger prohibition than RFC3501-6.3.10-1 targeting the specific anti-pattern of " +
			"polling the selected mailbox via STATUS. The full sentence is quoted, including the " +
			"trailing parenthetical cross-reference. The correct mechanism for detecting new messages " +
			"in the selected mailbox is the unsolicited EXISTS/RECENT untagged response or the NOOP " +
			"command. Applies whenever a mailbox is in the Selected state.",
	},
	{
		id: "RFC3501-6.3.10-3",
		source: "RFC3501",
		section: "6.3.10",
		title: "Client SHOULD NOT expect reasonable performance from many consecutive STATUS commands",
		text:
			"Because the STATUS command is not guaranteed to be fast in its results, clients SHOULD " +
			"NOT expect to be able to issue many consecutive STATUS commands and obtain reasonable " +
			"performance.",
		level: "SHOULD NOT",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "untestable",
		untestableTheme: "performance-expectation",
		untestableRationale:
			"This binds the client's performance expectations, not its wire behavior. A client that " +
			"issues many consecutive STATUS commands is not violating the sentence — only a client " +
			"that *expects* reasonable performance from doing so is, and an expectation is an internal " +
			"design assumption that is not observable at the protocol layer.",
		notes:
			"Explicit SHOULD NOT in the §6.3.10 Note. Applies when the client uses the STATUS command. " +
			"Practical guidance: clients should avoid architectures that depend on bulk STATUS polling " +
			"(e.g., issuing STATUS for every mailbox at startup) for acceptable responsiveness.",
	},

	// ── §6.3.11 APPEND ────────────────────────────────────────────────────────

	{
		id: "RFC3501-6.3.11-1",
		source: "RFC3501",
		section: "6.3.11",
		title: "APPEND literal argument SHOULD be in RFC-2822 message format",
		text:
			"The APPEND command appends the literal argument as a new message to the end of the " +
			"specified destination mailbox. This argument SHOULD be in the format of an [RFC-2822] " +
			"message.",
		level: "SHOULD",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"The first sentence establishes what the command does; the second sentence carries the " +
			"client-binding SHOULD. Applies whenever the client uses the APPEND command. Testable: " +
			"the literal body sent by the client should conform to RFC 2822 message format (headers " +
			"followed by body). Note: the spec permits 8-bit characters in the message literal, and " +
			"a server that does not support 8-bit text MUST encode it before storing (server obligation).",
	},
	{
		id: "RFC3501-6.3.11-2",
		source: "RFC3501",
		section: "6.3.11",
		title: "Client MAY issue NOOP (or CHECK) after APPEND if server sends no untagged EXISTS",
		text:
			"Specifically, the server SHOULD notify the client immediately via an untagged EXISTS " +
			"response. If the server does not do so, the client MAY issue a NOOP command (or failing " +
			"that, a CHECK command) after one or more APPEND commands.",
		level: "MAY",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"Explicit MAY in the second sentence; the preceding sentence (a server SHOULD) is included " +
			"verbatim because 'does not do so' refers to it. The client-binding permission is the MAY: " +
			"after APPENDing to the currently selected mailbox, if no untagged EXISTS arrives, the " +
			"client may solicit it with NOOP (or, failing that, CHECK). Applies only when the client " +
			"APPENDs to the currently selected mailbox and the server omits the EXISTS notification. " +
			"Observable: a client issuing NOOP/CHECK after APPEND is exercising this permission.",
	},
];
