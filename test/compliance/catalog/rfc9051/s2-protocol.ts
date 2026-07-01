import type { SpecRequirement } from "../types";

export const note =
	"§2.1: no client-binding requirements (TCP port 143/993 listening is a server-side binding). " +
	"§2.2: extracted 1 client requirement (CRLF line framing; rev2 counterpart of RFC3501-2.2-1). " +
	"§2.2.1: extracted 3 client requirements (tag generation now explicit SHOULD-unique + server-MUST-accept-reuse, " +
	"strict syntax, complete-command-before-new). " +
	"§2.2.2: extracted 4 client requirements (response parsing by first token, accept-any-response, SHOULD remember " +
	"server data, MUST remember certain server data). " +
	"§2.3.1.1: extracted 1 client requirement by judgment (UIDVALIDITY-based cache-invalidation duty) — see notes " +
	"on RFC9051-2.3.1.1-1 for the reasoning; this is the RFC 9051 addition RFC 3501 lacked (RFC 3501 §2.3.1.1 has " +
	"no direct client-binding requirements per its own extractionNote). The inference-only Note sentence ('A client " +
	"can only assume...') was again considered and excluded as a non-duty, consistent with the RFC3501 treatment. " +
	"§2.3.1.2: no client-binding requirements (message sequence number semantics are server-defined). " +
	"§2.3.2: extracted 2 client requirements ($Junk/$NotJunk mutual-exclusivity handling and the $Forwarded " +
	"SHOULD-NOT-clear-once-set duty — both new in rev2 with the $-keyword registry; \\Recent is deprecated in " +
	"rev2 so the RFC3501 \\Recent client prohibitions have no rev2 counterpart and are not carried forward). " +
	"The $Phishing display-warning sentence ('If both the $Phishing flag and the $Junk flag are set, the user " +
	"agent should display an additional warning message to the user', lowercase 'should') was considered and " +
	"excluded: it directs the user agent's UI, not the protocol library. The logger notification mechanism " +
	"(taxonomy mechanism (a)) was considered for it, but unlike ALERT's unconditional present-to-user MUST " +
	"(RFC3501-7.1-1's flip precedent), this duty is explicitly display-conditional guidance addressed to user " +
	"agents, so no catalog entry is extracted. " +
	"§2.3.3: no client-binding requirements (internal date is a server attribute). " +
	"§2.3.4: no client-binding requirements (RFC822.SIZE is server-defined). " +
	"§2.3.5: no client-binding requirements (envelope is a server-provided parsed structure). " +
	"§2.3.6: no client-binding requirements (body structure is a server-provided parsed structure). " +
	"§2.4: no client-binding requirements (describes server capability to fetch message parts). " +
	"§3 preamble: extracted 1 client requirement (protocol error to attempt a command in an inappropriate state — " +
	"judgment MUST NOT; rev2 counterpart of RFC3501-3-1, identical wording). " +
	"§3.1: extracted 1 client requirement (must supply credentials in Not Authenticated state; rev2 counterpart of " +
	"RFC3501-3.1-1, identical wording). " +
	"§3.2: extracted 1 client requirement (MUST select a mailbox before commands that affect messages will be " +
	"permitted; rev2 counterpart of RFC3501-3.2-1, identical wording). " +
	"§3.3: no client-binding requirements (describes state entry conditions). " +
	"§3.4: extracted 2 client requirements (read tagged OK after LOGOUT before closing, SHOULD NOT unilaterally " +
	"close/SHOULD issue LOGOUT instead; rev2 counterparts of RFC3501-3.4-1 and RFC3501-3.4-2, split into a " +
	"compound SHOULD NOT + SHOULD in rev2's own sentence).";

export const requirements: SpecRequirement[] = [
	// §2.2 ─────────────────────────────────────────────────────────────────────
	{
		id: "RFC9051-2.2-1",
		source: "RFC9051",
		section: "2.2",
		title: "Client sends CRLF-terminated lines; reads lines or octet-counted sequences",
		text:
			"All interactions transmitted by client and server are in the form of lines, that is, strings that end with a CRLF. The protocol receiver of an IMAP4rev2 client or server is reading either a line or a sequence of octets with a known count followed by a line.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"No 2119 keyword; imperative architectural definition binding both sides. " +
			"Treated as MUST: a client that does not terminate commands with CRLF violates the protocol framing. " +
			"rev2 counterpart of RFC3501-2.2-1 (wording essentially unchanged: 'is either reading' becomes " +
			"'is reading either').",
	},

	// §2.2.1 ──────────────────────────────────────────────────────────────────
	{
		id: "RFC9051-2.2.1-1",
		source: "RFC9051",
		section: "2.2.1",
		title: "Client generates a unique tag per command (server MUST accept reuse)",
		text:
			'Each client command is prefixed with an identifier (typically a short alphanumeric string, e.g., A0001, A0002, etc.) called a "tag". ... the client SHOULD generate a unique tag for every command, but a server MUST accept tag reuse.',
		level: "SHOULD",
		applicability: "always",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"rev2 counterpart of RFC3501-2.2.1-1, but the level changed: RFC 3501 stated 'A different tag is " +
			"generated by the client for each command' as an unqualified imperative (treated as MUST by the " +
			"RFC3501 catalog). RFC 9051 adds an explicit 'More formally' clause that downgrades this to an " +
			"explicit SHOULD ('the client SHOULD generate a unique tag for every command') while simultaneously " +
			"placing a MUST on the server to tolerate reuse. The elided middle sentence ('A different tag is " +
			"generated by the client for each command.') restates the same SHOULD-level duty informally and is " +
			"omitted for verbatim economy; the 'More formally' sentence is the operative normative text. Level " +
			"assigned as SHOULD per the explicit keyword, a deliberate weakening from the RFC 3501 MUST judgment " +
			"call. The server-MUST clause is retained for verbatim completeness but does not bind the client.",
	},
	{
		id: "RFC9051-2.2.1-2",
		source: "RFC9051",
		section: "2.2.1",
		title: "Client follows command syntax strictly",
		text:
			"Clients MUST follow the syntax outlined in this specification strictly. It is a syntax error to send a command with missing or extraneous spaces or arguments.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev2"],
		testability: "testable",
		notes: "rev2 counterpart of RFC3501-2.2.1-2; wording unchanged.",
	},
	{
		id: "RFC9051-2.2.1-3",
		source: "RFC9051",
		section: "2.2.1",
		title: "Client completes a command (all continuations) before initiating a new one",
		text:
			"In all cases, the client MUST send a complete command (including receiving all command continuation request responses and sending command continuations for the command) before initiating a new command.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"rev2 counterpart of RFC3501-2.2.1-3; near-identical wording ('sending command " +
			"continuations' vs RFC 3501's 'command continuations for the command', a trivial rephrase with no " +
			"normative change).",
	},

	// §2.2.2 ──────────────────────────────────────────────────────────────────
	//
	// RFC text order within §2.2.2:
	//   (A) "The protocol receiver … reads a response line … first token …"
	//   (B) "A client MUST be prepared to accept any server response …"
	//   (C) "Server data SHOULD be remembered (cached) …"
	//   (D) "In the case of certain server data, the data MUST be remembered …"
	{
		id: "RFC9051-2.2.2-1",
		source: "RFC9051",
		section: "2.2.2",
		title: "Client dispatches responses by first token (tag, *, or +)",
		text:
			'The protocol receiver of an IMAP4rev2 client reads a response line from the server. It then takes action on the response based upon the first token of the response, which can be a tag, a "*", or a "+".',
		level: "MUST",
		applicability: "always",
		profiles: ["rev2"],
		testability: "untestable",
		untestableTheme: "internal-decision",
		untestableRationale:
			"This describes internal client dispatch logic. The correctness of how the client routes " +
			"a response to the right handler is not directly observable at the protocol layer from a " +
			"black-box perspective; only downstream effects (e.g., incorrect command completion " +
			"handling) are observable.",
		notes:
			"Imperative prose without a 2119 keyword; treated as MUST because correct first-token " +
			"dispatch is a structural prerequisite for all other client-side response processing. " +
			"rev2 counterpart of RFC3501-2.2.2-2 (wording essentially unchanged).",
	},
	{
		id: "RFC9051-2.2.2-2",
		source: "RFC9051",
		section: "2.2.2",
		title: "Client accepts any server response at all times",
		text:
			"A client MUST be prepared to accept any server response at all times. This includes server data that was not requested.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev2"],
		testability: "testable",
		notes: "rev2 counterpart of RFC3501-2.2.2-1; wording unchanged.",
	},
	{
		id: "RFC9051-2.2.2-3",
		source: "RFC9051",
		section: "2.2.2",
		title: "Client SHOULD remember (cache) server data to avoid redundant requests",
		text:
			"Server data SHOULD be remembered (cached), so that the client can reference its remembered copy rather than sending a command to the server to request the data.",
		level: "SHOULD",
		applicability: "always",
		profiles: ["rev2"],
		testability: "untestable",
		untestableTheme: "internal-state",
		untestableRationale:
			"Whether the client caches server data internally and avoids redundant re-fetch commands " +
			"is an implementation quality matter. A black-box test could observe whether the client " +
			"issues unnecessary commands, but the RFC permits such commands and does not make their " +
			"absence a MUST, so there is no definitive pass/fail boundary at the protocol layer.",
		notes:
			"rev2 counterpart of RFC3501-2.2.2-3. Wording changed from RFC 3501's 'recorded' to rev2's " +
			"'remembered (cached)', a terminology clarification with no normative change; same SHOULD level " +
			"and same untestability analysis (internal-state, no pass/fail boundary since redundant requests " +
			"remain RFC-legal).",
	},
	{
		id: "RFC9051-2.2.2-4",
		source: "RFC9051",
		section: "2.2.2",
		title: "Client MUST remember certain categories of server data",
		text: "In the case of certain server data, the data MUST be remembered, as specified elsewhere in this document.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev2"],
		testability: "untestable",
		untestableTheme: "internal-state",
		untestableRationale:
			"The RFC does not enumerate in §2.2.2 which specific server data items are subject to " +
			"this MUST; those are identified in the Server Responses section. This entry captures " +
			"the general obligation. Whether the client has correctly recorded a specific data item " +
			"can sometimes be inferred from subsequent client behavior (e.g., it does not re-fetch " +
			"when it should not need to), but the general requirement is not directly verifiable at " +
			"the black-box protocol layer without exercising every applicable data type.",
		notes:
			"rev2 counterpart of RFC3501-2.2.2-4. Wording changed from 'recorded' to 'remembered' and rev2 adds " +
			"an explicit forward-reference clause ('as specified elsewhere in this document'); no normative " +
			"change to the general obligation captured here.",
	},

	// §2.3.1.1 ────────────────────────────────────────────────────────────────
	{
		id: "RFC9051-2.3.1.1-1",
		source: "RFC9051",
		section: "2.3.1.1",
		title: "Client relies on UIDVALIDITY to detect UID discontinuity and invalidate its UID cache",
		text:
			"Any change of unique identifiers between sessions MUST be detectable using the UIDVALIDITY mechanism discussed below. ... Note that this situation can be very disruptive to client message caching.",
		level: "SHOULD",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "untestable",
		untestableTheme: "cross-session",
		untestableRationale:
			"The RFC does not phrase this as a direct client imperative ('the client MUST discard its UID " +
			"cache'); it states that a UID discontinuity 'MUST be detectable' (a server-side guarantee about " +
			"the UIDVALIDITY mechanism's sufficiency) and separately warns that a UIDVALIDITY change 'can be " +
			"very disruptive to client message caching'. The client-facing duty here is only inferable: a " +
			"client that caches messages by UID is expected to key that cache on (mailbox name, UIDVALIDITY, " +
			"UID) and to invalidate/discard cached UID-keyed state when it observes a new UIDVALIDITY value at " +
			"SELECT/EXAMINE time. This is a cross-session cache-management duty with no required wire behavior: " +
			"a client that (incorrectly) keeps stale UID-keyed data after a UIDVALIDITY change produces no " +
			"distinguishing protocol trace by itself — only if it then issues commands against UIDs that no " +
			"longer denote the same message would a divergence become observable, and that divergence is " +
			"already covered by testable, command-specific catalog entries (e.g., UID-based FETCH/STORE " +
			"argument validity) rather than by this general caching duty. Mechanism (b) of the untestability " +
			"taxonomy (sequential multi-connection arm()) was evaluated explicitly and rebutted: two scripted " +
			"sessions can present a changed UIDVALIDITY value across sessions, but the harness can only show " +
			"the value changing — it cannot observe whether the client discarded its cache, because UID " +
			"caching is consumer-delegated in this headless library (the library itself keeps no cross-session " +
			"UID cache), so no wire trace in the second session distinguishes compliance from violation.",
		notes:
			"Extracted per the mandatory instruction to carefully extract the RFC 9051 addition to §2.3.1.1 " +
			"that RFC 3501 lacked (see RFC3501-2.3.1.1's extractionNote, which records that RFC 3501 contains " +
			"no client UIDVALIDITY-cache duties in this section). Textually, RFC 9051 §2.3.1.1 differs from " +
			"RFC 3501 §2.3.1.1 in two places relevant here: (a) item 2 of the persistence-guidance list gains " +
			"the sentence 'Note that this situation can be very disruptive to client message caching.' " +
			"(entirely new in rev2), and (b) item 4 gains a trailing sentence, 'When a message is expunged, " +
			"its UID MUST NOT be reused under the same UIDVALIDITY value.' (also new in rev2; a server-side " +
			"non-reuse guarantee that binds the server, not the client, and is therefore not catalogued as a " +
			"client entry anywhere in this module). The first MUST clause quoted here ('MUST be detectable " +
			"using the UIDVALIDITY " +
			"mechanism') is present verbatim in both RFC 3501 and RFC 9051 and is not itself new; it is " +
			"included in this entry because it is the textual anchor that, combined with the new rev2 " +
			"caching-disruption note, most directly supports a client-facing cache-invalidation reading. " +
			"No 2119 keyword binds the client by name in this sentence pair; level assigned as SHOULD by " +
			"judgment — the inferred cache-invalidation duty has no client-facing MUST anywhere in RFC 9051, " +
			"and SHOULD matches the strength of the surrounding UID-persistence guidance in the same paragraph " +
			"('The unique identifier of a message ... SHOULD NOT change between sessions'); a client that " +
			"ignores UIDVALIDITY changes and continues to trust stale UID-keyed cache entries defeats the " +
			"mechanism's purpose, but the RFC never states that duty as a client MUST. Applicability is 'conditional' " +
			"because the duty only fires for a client that maintains a persistent, UID-keyed local cache " +
			"across sessions (e.g., disconnected/offline clients per [IMAP-DISC]); a client with no such " +
			"cache has nothing to invalidate. This is the RFC 9051 addition referenced by the mandatory " +
			"verification protocol; flagged here as a judgment call per the extraction rules.",
	},

	// §2.3.2 ──────────────────────────────────────────────────────────────────
	{
		id: "RFC9051-2.3.2-1",
		source: "RFC9051",
		section: "2.3.2",
		title: "Client treats mutually-set $Junk/$NotJunk as unset and SHOULD clear both on the server",
		text:
			"$Junk and $NotJunk are mutually exclusive. If more than one of these is set for a message, the client MUST treat it as if none are set, and it SHOULD unset both of them on the IMAP server.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"New in rev2: the $Junk/$NotJunk keywords and their registry are introduced in RFC 9051 §2.3.2 and " +
			"have no RFC 3501 counterpart (RFC 3501 predates the $-keyword conventions; \\Recent, RFC 3501's " +
			"only §2.3.2 client-binding flag, is deprecated in rev2 per the flag table in this same section and " +
			"therefore has no rev2 counterpart entry here). Compound obligation: a MUST (local interpretation " +
			"of the flags as unset) and a SHOULD (proactively clearing both on the server); level assigned as " +
			"the stronger MUST per catalog convention (see RFC3501-3.4-2 for the analogous MUST-NOT/SHOULD " +
			"pairing precedent). Applicability is 'conditional' because the duty only fires for a client that " +
			"supports/uses the $Junk and $NotJunk keywords at all. Testable: script a FETCH response exposing " +
			"both keywords set simultaneously and verify the client's exposed flag state treats the message as " +
			"having neither set (and, for the SHOULD half, that it issues a STORE removing both).",
	},
	{
		id: "RFC9051-2.3.2-2",
		source: "RFC9051",
		section: "2.3.2",
		title: "Client SHOULD NOT clear the $Forwarded keyword once set",
		text:
			"$Forwarded Message has been forwarded to another email address by being embedded within, or " +
			"attached to a new message. An email client sets this keyword when it successfully forwards the " +
			"message to another email address. ... Once set, the flag SHOULD NOT be cleared.",
		level: "SHOULD NOT",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"From the $Forwarded keyword definition block in §2.3.2 (new in rev2; RFC 3501 predates the " +
			"$-keyword conventions — see RFC9051-2.3.2-1's notes for the registry background). The operative " +
			"sentence is the bare 'Once set, the flag SHOULD NOT be cleared.'; because that sentence names no " +
			"keyword, the two preceding contiguous sentences of the same definition block are quoted (with the " +
			"intervening 'Typical usage ... icon' sentence honestly elided as '...') so the quote itself " +
			"identifies $Forwarded as the flag in question. Applicability is 'conditional': the duty binds " +
			"only a client that supports/uses the $Forwarded keyword. Testable: after the client sets (or " +
			"observes) $Forwarded on a message, assert it never emits a STORE removing $Forwarded (e.g., " +
			"'-FLAGS ($Forwarded)' or a replacement 'FLAGS (...)' list omitting it).",
	},

	// §3 preamble ─────────────────────────────────────────────────────────────
	{
		id: "RFC9051-3-1",
		source: "RFC9051",
		section: "3",
		title: "Client must not attempt a command while the connection is in an inappropriate state",
		text:
			"It is a protocol error for the client to attempt a command while the connection is in an inappropriate state, and the server will respond with a BAD or NO (depending upon server implementation) command completion result.",
		level: "MUST NOT",
		applicability: "always",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"§3 preamble (before §3.1). No RFC 2119 keyword; 'It is a protocol error' is a plain-English " +
			"prohibition on the client. Level assigned as MUST NOT by judgment: attempting a command in an " +
			"inappropriate state is declared a protocol error, which a conforming client must never commit. " +
			"The second clause ('the server will respond with a BAD or NO...') describes the server's " +
			"reaction and is retained for verbatim completeness. Testable: verify the client never issues " +
			"state-restricted commands (e.g., SELECT before authentication, FETCH with no mailbox selected) " +
			"in an inappropriate state. rev2 counterpart of RFC3501-3-1; wording unchanged.",
	},

	// §3.1 ────────────────────────────────────────────────────────────────────
	{
		id: "RFC9051-3.1-1",
		source: "RFC9051",
		section: "3.1",
		title: "Client must supply authentication credentials in Not Authenticated state",
		text:
			"In the not authenticated state, the client MUST supply authentication credentials before most commands will be permitted.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev2"],
		testability: "testable",
		notes: "rev2 counterpart of RFC3501-3.1-1; wording unchanged.",
	},

	// §3.2 ────────────────────────────────────────────────────────────────────
	{
		id: "RFC9051-3.2-1",
		source: "RFC9051",
		section: "3.2",
		title: "Client must select a mailbox before commands that affect messages will be permitted",
		text:
			"In the authenticated state, the client is authenticated and MUST select a mailbox to access before commands that affect messages will be permitted.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"Explicit MUST in §3.2. The client-binding duty is to enter the Selected state (via SELECT or " +
			"EXAMINE) before issuing message-affecting commands (FETCH, STORE, SEARCH, COPY, etc.). " +
			"Testable: verify the client never issues Selected-state commands while in the Authenticated " +
			"state without a successfully selected mailbox. rev2 counterpart of RFC3501-3.2-1; wording " +
			"unchanged.",
	},

	// §3.4 ────────────────────────────────────────────────────────────────────
	{
		id: "RFC9051-3.4-1",
		source: "RFC9051",
		section: "3.4",
		title: "Client reads tagged OK before closing after LOGOUT",
		text:
			"If the client requests the logout state, the server MUST send an untagged BYE response and a tagged OK response to the LOGOUT command before the server closes the connection; and the client MUST read the tagged OK response to the LOGOUT command before the client closes the connection.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"Applicability is 'conditional' because the obligation fires only when the client " +
			"initiates the logout (i.e., sends LOGOUT). The first clause ('the server MUST send...') " +
			"is a server obligation included here for verbatim completeness; the client-binding " +
			"clause is 'the client MUST read the tagged OK response ... before the client closes " +
			"the connection.' rev2 counterpart of RFC3501-3.4-1; wording unchanged.",
	},
	{
		id: "RFC9051-3.4-2",
		source: "RFC9051",
		section: "3.4",
		title: "Client SHOULD NOT unilaterally close the connection",
		text: "A client SHOULD NOT unilaterally close the connection; instead, it SHOULD issue a LOGOUT command.",
		level: "SHOULD NOT",
		applicability: "always",
		profiles: ["rev2"],
		testability: "testable",
		notes:
			"Contains both SHOULD NOT (do not close unilaterally) and SHOULD (issue LOGOUT instead). " +
			"Level is set to SHOULD NOT as the stronger prohibition; the affirmative SHOULD is " +
			"captured in the same entry because the two clauses are a single compound obligation. " +
			"rev2 counterpart of RFC3501-3.4-2. The RFC 3501 counterpart is likewise ONE sentence — 'A client " +
			"SHOULD NOT unilaterally close the connection, and instead SHOULD issue a LOGOUT command.' — joining " +
			"the clauses with ', and instead SHOULD', whereas RFC 9051 joins them with '; instead, it SHOULD'; " +
			"a punctuation/phrasing-only change with no normative difference.",
	},
];
