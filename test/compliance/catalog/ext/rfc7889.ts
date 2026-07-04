import type { CatalogModule } from "../types";

const rfc7889: CatalogModule = {
	source: "RFC7889",
	extractionNote:
		"Full document reviewed (Abstract, §1 Introduction, §1.1 Conventions, §2 APPENDLIMIT " +
		"Extension, §3 Mailbox-Specific APPENDLIMIT [§3.1 STATUS Response to the STATUS Command, " +
		"§3.2 STATUS Response to the LIST Command, §3.3 APPENDLIMIT Behavior], §4 APPEND Response, " +
		"§5 Formal Syntax, §6 Security Considerations, §7 IANA Considerations, §8 References, " +
		"Acknowledgements, Authors' Addresses). RFC 7889 is a small reconciliation-delta source " +
		"(Phase 6 Task 3): APPENDLIMIT lets a server advertise a maximum message-upload size, " +
		"either globally (bare capability form, per-mailbox discovery via STATUS/LIST) or fixed " +
		"(APPENDLIMIT=<number> form), so the client can avoid sending an APPEND doomed to fail. " +
		"6 client-binding entries extracted, all judgment-level (the document uses zero UPPERCASE " +
		"2119 keywords in its own normative prose about client behavior — its two UPPERCASE " +
		"keywords, 'MUST recognize'/'MUST accept' in §3.2/§5, bind the SERVER; the client-directed " +
		"sentences are all lowercase 'should'/descriptive 'can', consistent with this RFC's overall " +
		"light normative touch on the client side): " +
		"(1) RFC7889-2-1 — client MUST parse the bare-vs-valued CAPABILITY forms (APPENDLIMIT vs " +
		"APPENDLIMIT=<number>) and know which one implies per-mailbox discovery is needed; " +
		"(2) RFC7889-3.1-1 — client (implicit) MUST use the atom APPENDLIMIT as a STATUS item to " +
		"query the mailbox-specific limit; " +
		"(3) RFC7889-3.2-1 — client (implicit) MUST use the LIST ... RETURN (STATUS (APPENDLIMIT)) " +
		"form when LIST-STATUS is advertised, to batch-query mailbox limits; " +
		"(4) RFC7889-3.2-2 — client SHOULD fall back to the plain STATUS command when the server " +
		"does not support the STATUS return option on LIST; " +
		"(5) RFC7889-4-1 — client MUST accept a tagged NO carrying the TOOBIG response code as the " +
		"well-formed rejection of an oversized APPEND, per §4's 'the server SHALL reject the APPEND " +
		"command with a tagged TOOBIG response code' (server-generation half skipped; the client's " +
		"reciprocal accept/parse duty is what is catalogued — cross-referenced against the " +
		"identically-named TOOBIG entry already in ext/rfc4469.ts §4.2, RFC4469-4.2-1, which covers " +
		"the CATENATE-specific 4-GB-overflow trigger for the SAME resp-code atom; this entry is kept " +
		"separate because it is triggered by a distinct condition — exceeding the advertised " +
		"APPENDLIMIT value on an ordinary APPEND, not the fixed 4-GB IMAP message ceiling on a " +
		"CATENATE append — and RFC 7889 is the source of a client's obligation not to exceed the " +
		"limit in the first place, see RFC7889-4-2); " +
		"(6) RFC7889-4-2 — client SHOULD avoid non-synchronizing literals (RFC 7888 LITERAL+/" +
		"LITERAL-) when the maximum upload size is unknown, to avoid the resource waste (battery, " +
		"mobile data, unnecessary bytes-on-the-wire) that motivates this whole extension per §1. " +
		"SKIPPED AS SERVER-ONLY (no client action to emit, observe, or enforce): §2's two server " +
		"capability-advertisement rules ('a server may also advertise this extension before the " +
		"user has logged in'; 'If this capability is omitted, no information is conveyed about the " +
		"server's fixed maximum size') describe what the server's CAPABILITY response means, not a " +
		"client action beyond the generic capability-negotiation duty already cataloged under RFC " +
		"3501/9051; §3's 'An IMAP server can have mailbox-specific APPENDLIMIT values that will not " +
		"be advertised as part of the CAPABILITY response' and the NIL-for-no-limit publication " +
		"rule (server data-modeling, mirrored on the client side only as ordinary NIL-vs-number " +
		"response parsing, not a distinct duty); §3.2's 'The IMAP server MUST recognize the " +
		"APPENDLIMIT attribute and include an appropriate STATUS response for each matching " +
		"mailbox' (server LIST-STATUS response-generation MUST, the mirror image of the client's " +
		"emit duty in RFC7889-3.2-1); §3.3's 'Computing the APPENDLIMIT should be fast and should " +
		"not take Access Control Lists (ACLs), quotas, or other such information into account' and " +
		"'an APPEND command can still fail due to issues related to ACLs and quotas, even if the " +
		"message being appended is smaller than the APPENDLIMIT' (server-side computation policy " +
		"and a disclosed corollary that APPENDLIMIT is only ONE part of the append-acceptance " +
		"policy — informs the client that respecting APPENDLIMIT does not guarantee success, but " +
		"imposes no additional client action beyond already-cataloged general APPEND-failure " +
		"handling); §4's 'Refer to Section 4 of [RFC4469] for various APPEND response codes and " +
		"their handling' (a cross-reference, not an independent normative statement) and the " +
		"server's defensive-limit framing implicit in 'SHALL reject' (server enforcement side, " +
		"client accept side is RFC7889-4-1); §6 Security Considerations (explicitly 'does not " +
		"introduce new security concerns'; the note that this extension 'does not address abusive " +
		"clients' and servers 'will still have to take action to disconnect ... clients that " +
		"exhibit abusive behavior' binds the server's anti-abuse posture, not a client duty); §7 " +
		"IANA Considerations and §5's remaining ABNF ('status-att =/ \"APPENDLIMIT\"' — the bare " +
		"status-att nonterminal formalizes the same STATUS item already quoted/scored under " +
		"RFC7889-3.1-1, not scored again) contain no distinct client-directed normative language. " +
		"REV2 PROFILE: APPENDLIMIT remains a standalone extension under IMAP4rev2 — confirmed by " +
		"grep of catalog/rfc9051: no APPENDLIMIT content anywhere in the rev2 core catalog (STATUS " +
		"and APPEND are both rev2-core commands, RFC9051-6.3.11/-6.3.12, but neither carries an " +
		"APPENDLIMIT status item or capability). No rev2-core double-scoring applies; all entries " +
		"carry the default profiles [\"rev1\",\"rev2\"]. " +
		"Total: 6 client-binding entries (RFC7889-2-1, RFC7889-3.1-1, RFC7889-3.2-1..2, " +
		"RFC7889-4-1..2). Untestable: 0 — all six are testable black-box: the driver's " +
		"status()/list()/append() verbs throw NotImplementedError, so every entry is currently a " +
		"self-actualizing failure (the client has no APPENDLIMIT-aware surface at all).",
	requirements: [
		// ── §2 APPENDLIMIT Extension (capability form parsing) ───────────────────

		{
			id: "RFC7889-2-1",
			source: "RFC7889",
			section: "2",
			title:
				"Client MUST distinguish the bare APPENDLIMIT capability form from the valued APPENDLIMIT=<number> form",
			text:
				"An IMAP server can publish the APPENDLIMIT capability in two formats. (a) " +
				"APPENDLIMIT=<number> This indicates that the IMAP server has the same upload limit " +
				"for all mailboxes. ... (b) APPENDLIMIT The APPENDLIMIT capability without any value " +
				"indicates that the IMAP server supports this extension, and that the client will need " +
				"to discover upload limits for each mailbox, as they might differ from mailbox to " +
				"mailbox.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit MUST on capability-parsing correctness; no RFC 2119 keyword " +
				"in the source prose, but the two forms are semantically distinct and a client that " +
				"conflates them either fails to learn the global limit (misreading (a) as (b)) or " +
				"wrongly assumes a global limit exists (misreading (b) as (a))). §5's ABNF pins the " +
				"grammar: 'capability =/ \"APPENDLIMIT\" [\"=\" number]' — the optional '=number' suffix " +
				"is the sole distinguishing token. Conditional on the server advertising APPENDLIMIT " +
				"at all. Standalone in rev2 (no RFC 9051 counterpart), so profiles [\"rev1\",\"rev2\"]. " +
				"Currently self-actualizing fail: the driver has no capability-parsing surface exposed " +
				"for APPENDLIMIT specifically (generic CAPABILITY parsing exists, but nothing in the " +
				"compliance harness observes the client branching on the bare-vs-valued distinction), " +
				"so this is recorded as a failure for RFC7889.",
		},

		// ── §3.1 STATUS Response to the STATUS Command ───────────────────────────

		{
			id: "RFC7889-3.1-1",
			source: "RFC7889",
			section: "3.1",
			title: "Client (implicit) MUST emit the APPENDLIMIT STATUS item to query a mailbox's upload limit",
			text:
				"A new attribute APPENDLIMIT is added to get the limit set by the server for a mailbox " +
				"as part of a STATUS command. An IMAP client should issue a STATUS command with an " +
				"APPENDLIMIT item to get the mailbox-specific upload value.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (lowercase 'should' plus descriptive 'is added'; read as an implicit " +
				"MUST on wire form because §5's ABNF admits no alternative spelling: 'status-att =/ " +
				"\"APPENDLIMIT\"'). A client that wants the mailbox-specific limit (as opposed to " +
				"relying solely on a global APPENDLIMIT=<number> capability value) must include the " +
				"bare atom APPENDLIMIT in the STATUS command's item list, per the example 'C: t1 " +
				"STATUS INBOX (APPENDLIMIT)' / 'S: * STATUS INBOX (APPENDLIMIT 257890)'. The response " +
				"side (accepting a number or NIL) is the corresponding parse duty, folded into this " +
				"entry rather than split out, since §5's 'status-att-val =/ \"APPENDLIMIT\" SP (number " +
				"/ nil)' fixes both directions of the same wire vocabulary. Conditional on the client " +
				"needing a mailbox-specific limit under the bare-APPENDLIMIT capability form " +
				"(RFC7889-2-1). Standalone in rev2, profiles [\"rev1\",\"rev2\"]. Self-actualizing " +
				"fail: driver.status() throws NotImplementedError, so no APPENDLIMIT STATUS item can " +
				"be driven.",
		},

		// ── §3.2 STATUS Response to the LIST Command ─────────────────────────────

		{
			id: "RFC7889-3.2-1",
			source: "RFC7889",
			section: "3.2",
			title: "Client (implicit) MUST emit LIST ... RETURN (STATUS (APPENDLIMIT)) to batch-query mailbox limits",
			text:
				"If the server advertises the LIST-STATUS capability [RFC5819], the client can issue a " +
				"LIST command in combination with the STATUS return option to get the mailbox-specific " +
				"upload value.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (descriptive 'can issue', read as an implicit MUST on wire form: the " +
				"only way to get the batched value is exactly this composed command). Per the example " +
				"'C: t1 LIST \"\" % RETURN (STATUS (APPENDLIMIT))', the client nests APPENDLIMIT inside " +
				"the LIST-STATUS STATUS return option (RFC 5819) rather than issuing separate STATUS " +
				"commands per mailbox. Conditional on BOTH the server advertising LIST-STATUS (RFC " +
				"5819) AND the client choosing to batch-query APPENDLIMIT across mailboxes; when " +
				"LIST-STATUS is unavailable the client's fallback duty is RFC7889-3.2-2. Standalone in " +
				"rev2, profiles [\"rev1\",\"rev2\"]. Self-actualizing fail: driver.list()'s " +
				"returnOptions surface exists but the verb itself throws NotImplementedError, so no " +
				"STATUS(APPENDLIMIT) return option can be driven to completion.",
		},
		{
			id: "RFC7889-3.2-2",
			source: "RFC7889",
			section: "3.2",
			title: "Client SHOULD fall back to plain STATUS when the server lacks the LIST STATUS return option",
			text:
				"If the server does not support the STATUS return option on the LIST command, then the " +
				"client should use the STATUS command instead.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Lowercase 'should', read as a judgment-call SHOULD (an explicit fallback instruction, " +
				"not merely descriptive prose). Complements RFC7889-3.2-1: when LIST-STATUS is not " +
				"advertised, or its STATUS return option is otherwise unusable, the client should fall " +
				"back to per-mailbox STATUS (APPENDLIMIT) queries (RFC7889-3.1-1) rather than, e.g., " +
				"failing to discover mailbox-specific limits at all. Testable black-box: script a " +
				"CAPABILITY response advertising APPENDLIMIT (bare form) but NOT LIST-STATUS, and " +
				"assert the client issues STATUS (APPENDLIMIT) per mailbox rather than attempting the " +
				"LIST RETURN (STATUS (...)) form. Standalone in rev2, profiles [\"rev1\",\"rev2\"]. " +
				"Self-actualizing fail: both driver.list() and driver.status() throw " +
				"NotImplementedError, so no fallback behavior can be observed.",
		},

		// ── §4 APPEND Response ────────────────────────────────────────────────────

		{
			id: "RFC7889-4-1",
			source: "RFC7889",
			section: "4",
			title: "Client MUST accept a tagged NO [TOOBIG] as the well-formed rejection of an over-limit APPEND",
			text:
				"If a client uploads a message that exceeds the maximum upload size set for that " +
				"mailbox, then the server SHALL reject the APPEND command with a tagged TOOBIG " +
				"response code.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"The quoted sentence is literally the SERVER's rejection duty ('the server SHALL " +
				"reject'); the client-binding corollary recorded here (implicit MUST, no independent " +
				"client-directed keyword) is that a conformant client accepts a tagged NO carrying the " +
				"TOOBIG resp-code as a well-formed, expected APPEND-failure outcome rather than an " +
				"unrecognized/malformed response — mirroring this catalog's treatment of the identical " +
				"resp-code atom in RFC4469-4.2-1 (CATENATE's 4-GB TOOBIG). Distinct trigger condition " +
				"from RFC4469-4.2-1: here TOOBIG fires when the appended message exceeds the " +
				"server-advertised, possibly mailbox-specific APPENDLIMIT value (which may be far " +
				"smaller than 4 GB), not the fixed 4-GB IMAP message ceiling. Cross-referenced rather " +
				"than duplicated in substance: both entries score the client's acceptance of the same " +
				"'TOOBIG' atom (§5 here has no separate ABNF production for it — RFC 7889 does not " +
				"itself formalize toobig-response-code, instead deferring via 'Refer to Section 4 of " +
				"[RFC4469]', so the wire shape is governed by RFC4469's grammar); kept as a separate " +
				"entry because the triggering condition and the source RFC differ. Testable black-box: " +
				"script an APPEND exceeding a previously-advertised APPENDLIMIT and assert the client " +
				"surfaces NO [TOOBIG] as a normal failure outcome, not a parse error. Conditional on " +
				"the client using APPEND under an APPENDLIMIT-advertising server. Standalone in rev2, " +
				"profiles [\"rev1\",\"rev2\"]. Self-actualizing fail: driver.append() throws " +
				"NotImplementedError, so no TOOBIG acceptance path can be driven.",
		},
		{
			id: "RFC7889-4-2",
			source: "RFC7889",
			section: "4",
			title: "Client SHOULD avoid non-synchronizing literals when the maximum upload size is unknown",
			text:
				"A client SHOULD avoid use of non-synchronizing literals [RFC7888] when the maximum " +
				"upload size supported by the IMAP server is unknown.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Explicit client-directed SHOULD (uppercase, unambiguous). When the client has not " +
				"learned an APPENDLIMIT value (neither the global APPENDLIMIT=<number> capability form " +
				"nor a mailbox-specific STATUS/LIST query), it should not use RFC 7888 " +
				"LITERAL+/LITERAL- non-synchronizing literals for the APPEND message data, because " +
				"doing so risks sending the full oversized message body before the server can reject " +
				"it with TOOBIG — precisely the wasted-upload scenario this RFC's §1 Introduction " +
				"motivates ('the client has already sent the message data anyway ... unnecessary " +
				"resource usage ... battery ... mobile data'). Testable black-box: script a server " +
				"that has NOT advertised any APPENDLIMIT value and assert the client's APPEND literal " +
				"is a synchronizing literal (or otherwise avoids LITERAL+/LITERAL- framing) rather than " +
				"a non-synchronizing one. Conditional on the client both supporting RFC 7888 and facing " +
				"an unknown upload limit. Standalone in rev2, profiles [\"rev1\",\"rev2\"]. " +
				"Self-actualizing fail: driver.append() throws NotImplementedError, so the client's " +
				"literal-framing choice cannot be observed at all.",
		},
	],
};

export default rfc7889;
