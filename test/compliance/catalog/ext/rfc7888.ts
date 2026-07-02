import type { CatalogModule } from "../types";

const rfc7888: CatalogModule = {
	source: "RFC7888",
	extractionNote:
		"§1 (Introduction): abstract/motivation restatement, no independent normative text beyond " +
		"what §3/§5 state formally — reviewed, no separately catalogued requirement. §2 (Conventions): " +
		"RFC 2119 boilerplate, skipped. §3 (Specification): fully reviewed; extracted 2 client-binding " +
		"entries (RFC7888-3-1, RFC7888-3-2). The section's other normative sentences bind the server, " +
		"not the client, and are excluded per scope: 'The non-synchronizing literal form MUST NOT be " +
		"sent from server to client' (server emission rule); 'The protocol receiver of an IMAP server " +
		"MUST check...' and '...the server MUST treat the specified number of following octets...' " +
		"(server parsing duty); 'A server MAY still process commands...' (server processing latitude). " +
		"§4 (Considerations on When to Use and Not to Use Synchronizing Literals): entirely descriptive " +
		"guidance/rationale for implementers with no RFC 2119 keyword directed at the client ('might be " +
		"more difficult to handle on the server side', discussion of server-side rejection strategies, " +
		"a pointer to the informative APPENDLIMIT extension) — reviewed, no client-binding requirement. " +
		"§5 (LITERAL- Capability): fully reviewed; extracted 3 client-binding entries (RFC7888-5-1, " +
		"RFC7888-5-2, RFC7888-5-3). The section's remaining normative sentences bind the server: 'A " +
		"server that is compliant with LITERAL- and encounters a non-synchronizing literal larger than " +
		"4096 bytes proceeds as described in Section 4' plus its TOOBIG-response-code MUST/SHOULD " +
		"(server response-construction duty), and 'IMAP servers MUST NOT advertise both of these " +
		"capabilities at the same time' (server capability-advertisement rule) — excluded per scope. " +
		"§6 (Interaction with BINARY Extension): informative cross-reference restating that literal8 " +
		"(RFC 4466/RFC 3516) may be used when both BINARY and LITERAL- are supported by the server; no " +
		"independent client MUST/MUST NOT beyond the already-catalogued §3/§5 gating duties (whether a " +
		"non-sync form is available at all is governed by RFC7888-3-1, and the size cap by RFC7888-5-1 " +
		"once LITERAL- is in play) — reviewed, no additional client-binding requirement. §7 (Interaction " +
		"with MULTIAPPEND Extension): same treatment — informative, restates that LITERAL- composes " +
		"with MULTIAPPEND the same way LITERAL+ does, no new duty — reviewed, no client-binding " +
		"requirement. §8 (Formal Syntax): ABNF grammar restating the '{n[+]}CRLF' literal production " +
		"already captured prose-wise by RFC7888-3-1/-3-2/-5-1/-5-2; not independently extracted as a " +
		"requirement (it is the syntax, not a new duty). §9 (Security Considerations): discussion of " +
		"resource-exhaustion risk from non-synchronizing literals, framed as a server-side concern " +
		"('can consume extra resources ... on IMAP servers'); no RFC 2119 keyword directed at the " +
		"client — reviewed, no client-binding requirement. §10 (IANA Considerations): registry " +
		"administrivia, skipped. §11 (References), Appendix A (Changes since RFC 2088), " +
		"Acknowledgments, Author's Address: bibliographic/administrative, skipped. " +
		"Total entries: 5. Untestable: 0. " +
		"Profiles/rev2-core decision: LITERAL- is folded into the IMAP4rev2 base grammar as a mandatory " +
		"baseline capability (RFC 9051 §4.3 states the non-synchronizing literal MUST NOT exceed 4096 " +
		"octets and that oversized literals MUST use the synchronizing form, with no CAPABILITY-gating " +
		"language — it is simply how rev2 literals work). RFC9051-4.3-2 ('Non-synchronizing literal MUST " +
		"NOT exceed 4096 octets unless an extension says otherwise') and RFC9051-4.3-3 ('Literal larger " +
		"than 4096 bytes MUST be sent as a synchronizing literal') are the rev2-native restatements of " +
		"this document's RFC7888-5-1/RFC7888-5-2 and are treated as primary for rev2 — the rev2 s4-data " +
		"catalog module's own extraction note records that RFC 9051 built these sentences on top of the " +
		"RFC 7888 LITERAL- baseline. All five entries below are nonetheless tagged profiles: ['rev1', " +
		"'rev2'] rather than rev1-only, because: (a) RFC 7888 (LITERAL+/LITERAL-) is a freestanding " +
		"extension a rev1 (RFC 3501) server can advertise and a rev1 client can use exactly as written " +
		"here, independent of rev2; and (b) for rev2, this module's entries remain the historically " +
		"correct, byte-for-byte source text and are cross-referenced (not deleted or superseded) against " +
		"their RFC9051-4.3-2/-3 counterparts, mirroring how RFC7817-3-1 remains catalogued alongside its " +
		"RFC3501-11.1-3 counterpart rather than being dropped once superseded. LITERAL+ (the unlimited, " +
		"uncapped sibling capability) has no rev2-core counterpart at all — RFC 9051 only folded in the " +
		"capped LITERAL- behavior — so LITERAL+ remains a pure extension in both profiles, as does the " +
		"capability-gating duty (RFC7888-3-1) governing whether either form may be used at all.",
	requirements: [
		// ── §3 Specification ─────────────────────────────────────────────────────
		{
			id: "RFC7888-3-1",
			source: "RFC7888",
			section: "3",
			title: "Non-synchronizing literals usable only when LITERAL+ or LITERAL- is advertised; otherwise synchronizing form only",
			text:
				'Non-synchronizing literals may be used with any IMAP server implementation that ' +
				'returns "LITERAL+" or "LITERAL-" as one of the supported capabilities to the ' +
				"CAPABILITY command. If the server does not advertise either of the above " +
				"capabilities, the client can only use synchronizing literals.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"No explicit RFC 2119 keyword on the second sentence ('the client can only use ...'), " +
				"but the meaning is unambiguous and load-bearing: the non-synchronizing '{n+}' literal " +
				"form is gated on the server having advertised LITERAL+ or LITERAL- in its CAPABILITY " +
				"response, and absent that advertisement the client is restricted to the synchronizing " +
				"'{n}' form defined in RFC 3501/RFC 9051. Level assigned as MUST by judgment ('can only " +
				"use' expresses the same restrictive force as MUST NOT use any other form). " +
				"Applicability is 'conditional': this duty binds only when the client considers sending " +
				"a literal at all (e.g., LOGIN, APPEND, or any command argument long enough to require " +
				"literal syntax) and only shapes which literal *form* is legal, not whether one is used. " +
				"Observable at the protocol layer: the harness's scripted server controls which " +
				"capabilities (if any) it advertises, and the driver's command-line capture records " +
				"each emitted literal's octet count and whether it carried the '+' (via " +
				"ScriptedImapServer's per-line 'nonSync' flags, exercised today by the RFC9051-4.3-2/-3 " +
				"compliance tests) — a conformant client must never emit a '{n+}' marker on a connection " +
				"where neither LITERAL+ nor LITERAL- was advertised. This duty is unimplemented in the " +
				"client today (no non-synchronizing literal support exists in src/), so it is " +
				"self-actualizing: a compliance test exercising it starts from an honest 'not yet " +
				"observed' baseline rather than a false pass.",
		},
		{
			id: "RFC7888-3-2",
			source: "RFC7888",
			section: "3",
			title: "Client is not required to wait for a continuation request before sending non-synchronizing literal octets",
			text: "clients are not required to wait before sending the octets of a non-synchronizing literal.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"No explicit RFC 2119 keyword; 'are not required to' is a plain-language grant of " +
				"permission, so this is recorded as MAY by judgment — the mirror image of the " +
				"synchronizing-literal wait duty (RFC3501-4.3-1/RFC9051-4.3-1's MUST wait for a command " +
				"continuation request). Applicability is 'conditional': binds only when the client has " +
				"chosen the non-synchronizing form (itself gated by RFC7888-3-1). Because this is a MAY " +
				"granting permission rather than imposing an obligation, there is no non-compliant " +
				"behavior to catch on the not-waiting side; the entry is nonetheless 'testable' because " +
				"the harness can observe the affirmative case directly — a scripted server that never " +
				"emits a '+ ' continuation response can still successfully complete a command whose " +
				"literal(s) all carried the '+' marker, proving the client did not block waiting for a " +
				"continuation it was never sent. This is the structural complement to the RFC9051-4.3-1 " +
				"wait test, which drives an oversized (>4096 octet) literal specifically to force the " +
				"synchronizing form and make the wait-duty non-vacuous; here the companion assertion is " +
				"that a small, '+'-marked literal completes without any continuation round trip at all.",
		},
		// ── §5 LITERAL- Capability ───────────────────────────────────────────────
		{
			id: "RFC7888-5-1",
			source: "RFC7888",
			section: "5",
			title: "Under LITERAL-, non-synchronizing literals MUST NOT exceed 4096 bytes",
			text:
				"when LITERAL- is advertised, non-synchronizing literals used in any command MUST NOT " +
				"be larger than 4096 bytes.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Explicit MUST NOT. Applicability is 'conditional': binds only when the server has " +
				"advertised LITERAL- specifically (not LITERAL+, under which no such cap applies — see " +
				"RFC7888-5-2's notes on the LITERAL+ unlimited case) and the client elects to send a " +
				"non-synchronizing literal. Observable exactly as the harness already exercises for the " +
				"rev2-core restatement of this duty: a conformant client never emits a '{n+}' prefix " +
				"with n > 4096 on a LITERAL- connection. " +
				"rev2-core cross-reference: this is the RFC 7888 LITERAL- source text; RFC 9051 folds " +
				"the identical duty into the IMAP4rev2 base grammar without capability-gating language " +
				"as RFC9051-4.3-2 ('Unless otherwise specified in an IMAP extension, non-synchronizing " +
				"literals MUST NOT be larger than 4096 octets'), which is primary for rev2 compliance " +
				"testing (test id in test/compliance/specs/rfc9051/4-data-formats.test.ts, reqs " +
				"['RFC9051-4.3-2','RFC9051-4.3-3']). This entry remains catalogued for rev2 because it " +
				"is the original, byte-for-byte LITERAL- source text and the extension remains " +
				"separately negotiable/advertisable on a rev1 (RFC 3501) server, where RFC9051-4.3-2 " +
				"does not apply at all.",
		},
		{
			id: "RFC7888-5-2",
			source: "RFC7888",
			section: "5",
			title: "Under LITERAL-, a literal larger than 4096 bytes MUST be sent as a synchronizing literal",
			text:
				"Any literal larger than 4096 bytes MUST be sent as a synchronizing literal as " +
				"specified in RFC 3501.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Explicit MUST, paired with RFC7888-5-1: together they mean a client that would " +
				"otherwise use the non-synchronizing form for a large payload (e.g., an APPEND body) " +
				"must fall back to the synchronizing '{n}CRLF' wait-for-continuation form once the " +
				"payload exceeds 4096 octets, when the connection is operating under LITERAL- (as " +
				"opposed to LITERAL+, which imposes no size cap and so never forces this fallback — the " +
				"'LITERAL+ unlimited case': under LITERAL+ alone, a client may legally send a " +
				"non-synchronizing literal of any size, and this MUST does not apply). Applicability is " +
				"'conditional': binds only when the server advertised LITERAL- and the client is " +
				"sending a literal larger than 4096 bytes. Observable at the protocol layer: a " +
				"conformant client on a LITERAL- connection never emits a '{n+}' prefix for n > 4096; " +
				"it uses '{n}' and waits for the continuation request instead. " +
				"rev2-core cross-reference: RFC 9051 restates this identical duty, without " +
				"capability-gating, as RFC9051-4.3-3 ('Any literal larger than 4096 bytes MUST be sent " +
				"as a synchronizing literal'), which is primary for rev2 compliance testing (same test " +
				"id/reqs as noted on RFC7888-5-1). Retained here for rev2 for the same byte-for-byte-" +
				"source-text and rev1-applicability reasons given on RFC7888-5-1.",
		},
		{
			id: "RFC7888-5-3",
			source: "RFC7888",
			section: "5",
			title: "Non-synchronizing literal syntax is unchanged under LITERAL- (still uses '+'); forms are not otherwise mixed",
			text:
				"Note that the form of the non-synchronizing literal does not change: it still uses " +
				'the "+" in the literal itself, even if the applicable extension is LITERAL-.',
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"No explicit RFC 2119 keyword ('does not change' is descriptive), recorded as MUST by " +
				"judgment: this is the document's explicit statement that LITERAL- introduces no second, " +
				"distinct non-synchronizing wire syntax — a client operating under LITERAL- must emit " +
				"the identical '{n+}' marker used under LITERAL+ (never, say, a different sigil or an " +
				"unmarked form) for any non-synchronizing literal it sends, and by construction never " +
				"emits '{n+}' for n > 4096 once RFC7888-5-1 is honored. This is the clarifying anchor " +
				"for 'any duties about mixing forms' in this document's scope: RFC 7888 defines exactly " +
				"one non-synchronizing wire form ('{n+}') and one synchronizing wire form ('{n}', per " +
				"RFC 3501/RFC 9051); a client never has more than these two literal syntaxes to choose " +
				"between, and choosing between them is governed entirely by RFC7888-3-1 (capability " +
				"gate) and RFC7888-5-1/RFC7888-5-2 (the LITERAL- size threshold) — there is no third " +
				"form or hybrid marker a compliant client could produce. Applicability is 'conditional': " +
				"binds only when the client sends a non-synchronizing literal at all. Observable at the " +
				"protocol layer: every literal marker the client emits parses as either bare '{n}' or " +
				"'{n+}' with no other punctuation between the octet count and the closing brace — the " +
				"same literal-marker regex the RFC9051-4.3-2/-3 tests already apply " +
				"(test/compliance/specs/rfc9051/4-data-formats.test.ts) is sufficient to falsify a " +
				"hypothetical third form.",
		},
	],
};

export default rfc7888;
