import type { CatalogModule } from "../types";

const rfc6154: CatalogModule = {
	source: "RFC6154",
	extractionNote:
		"RFC 6154 (IMAP LIST Extension for Special-Use Mailboxes) — covers BOTH the SPECIAL-USE " +
		"capability (special-use name-attributes + the SPECIAL-USE LIST selection/return options) AND " +
		"the CREATE-SPECIAL-USE capability (the CREATE '(USE (...))' parameter + the [USEATTR] response " +
		"code). Full document reviewed: Abstract, §1 Introduction, §1.1 Conventions, §2 New Mailbox " +
		"Attributes Identifying Special-Use Mailboxes, §3 Extension to IMAP CREATE Command to Set " +
		"Special-Use Attributes, §4 IMAP METADATA Entry for Special-Use Attributes, §5 Examples " +
		"(§5.1–§5.4), §6 Formal Syntax, §7 Security Considerations, §8 IANA Considerations (§8.1–§8.6), " +
		"§9 References, Authors' Addresses. " +
		"CLIENT/SERVER SPLIT: RFC 6154 is predominantly server-binding — the normative sentences in §2 " +
		"('An IMAP server ... MAY include ...', the three 'the LIST command MUST return ...' sentences), " +
		"§3 (the CREATE-refusal MUST NOT create / MUST respond NO / SHOULD include USEATTR trio, plus " +
		"'a server MAY allow ...'), and §4 (the entire /private/specialuse METADATA machinery: server " +
		"SHOULD tie attributes to the entry, MAY allow setting, MUST check validity, MUST NOT blindly " +
		"accept) all bind the SERVER's LIST/CREATE/METADATA processing and are excluded from this " +
		"client catalog. The client-binding surface extracted here is: (a) the seven special-use " +
		"name-attributes the client must accept when a server returns them in LIST responses (§6 ABNF " +
		"'use-attr', with the definitional support in §2); (b) the explicit 'Clients MUST ignore list " +
		"attributes they do not understand' robustness duty (§6 ABNF 'use-attr-ext' comment); (c) the " +
		"SPECIAL-USE selection and return options the client MAY emit on an extended LIST (§2); (d) the " +
		"explicit 'Clients MUST NOT use the \"USE\" parameter unless the server advertises the " +
		"[CREATE-SPECIAL-USE] capability' gate (§3); (e) the CREATE '(USE (...))' command form the " +
		"client MAY emit (§3 + §6 ABNF 'create-param'); (f) the client-side handling of a tagged NO " +
		"carrying the [USEATTR] response code on CREATE refusal (§3, the client counterpart of the " +
		"server's SHOULD-include-USEATTR duty). 7 client-binding entries: RFC6154-2-1, RFC6154-2-2, " +
		"RFC6154-3-1, RFC6154-3-2, RFC6154-3-3, RFC6154-6-1, RFC6154-6-2. Untestable: 0. " +
		"AT-MOST-ONE-OF-EACH / PROHIBITIONS: §2's at-most-one-mailbox-per-attribute text ('In most " +
		"cases, there will likely be at most one mailbox with a given attribute ... but ... it might be " +
		"possible for multiple mailboxes to have the same special-use attribute') and the " +
		"all-OPTIONAL / any-combination text are descriptive guidance imposing no client duty (they " +
		"explicitly permit both the one-and-multiple cases and impose no imperative on the client), so " +
		"they are recorded here as excluded rather than as requirements; a client MUST therefore be " +
		"prepared for zero, one, or several mailboxes bearing the same attribute, which is subsumed by " +
		"the accept-the-attributes duty RFC6154-6-1. The §6 'Server implementations MUST NOT generate " +
		"extension attributes except as defined by future Standards-Track ...' comment binds the " +
		"server and is excluded. " +
		"REV2-CORE ADJUDICATION (rule 4): RFC 9051 (IMAP4rev2) did NOT absorb RFC 6154's special-use " +
		"surface into core, contrary to the initial task hint. The RFC 9051 catalog's §6.3.4 CREATE " +
		"note records 'CREATE — 0 client-binding normative statements' and lists no USE parameter; the " +
		"§7.3.1 LIST-response attribute entries (RFC9051-7.3.1-1..4) cover only " +
		"\\HasChildren/\\HasNoChildren/\\NoInferiors/\\NonExistent/\\Subscribed, not the special-use " +
		"names; and no RFC9051 entry defines the SPECIAL-USE selection/return option, the \\Sent " +
		"\\Drafts \\Junk \\Trash \\Archive \\Flagged \\All attributes, the CREATE (USE (...)) parameter, " +
		"or the [USEATTR] response code. RFC 6154 remains a standalone extension under rev2 (matching " +
		"the Phase 4 plan's own classification: 'SPECIAL-USE ... remain standalone extensions in " +
		"rev2'). Therefore ALL 7 entries keep profiles: [\"rev1\",\"rev2\"] — a rev2 client using " +
		"special-use is bound by these duties only through this document. The one genuine rev2-core " +
		"neighbor is the GENERAL LIST-option gate RFC9051-6.3.9-5 ('a client MUST NOT send an option " +
		"for which the server has not advertised support', whose own testability note names SPECIAL-USE " +
		"as an example target); that is RFC 5258/9051's generic extended-LIST duty, distinct in text " +
		"and scope from RFC 6154's own CREATE-side gate (RFC6154-3-1, which binds the CREATE USE " +
		"parameter to the CREATE-SPECIAL-USE capability, a different command and a different capability " +
		"string). RFC6154-3-1 is cross-referenced to RFC9051-6.3.9-5 in its notes but NOT tagged " +
		"rev1-only, because it is not a restatement of the same sentence: RFC 9051 has no CREATE-side " +
		"USE-parameter gate at all. No entry is tagged rev1-only.",
	requirements: [
		// ── §2 New Mailbox Attributes / SPECIAL-USE LIST options ─────────────────

		{
			id: "RFC6154-2-1",
			source: "RFC6154",
			section: "2",
			title: "Client MAY request only special-use mailboxes via the SPECIAL-USE selection option",
			text:
				"For the extended list command [RFC5258], this extension adds a new capability string, a " +
				"new selection option, and a new return option, all called \"SPECIAL-USE\". ... If the " +
				"client specifies the \"SPECIAL-USE\" selection option, the LIST command MUST return only " +
				"those mailboxes that have a special-use attribute set.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Client-side duty is the command-emission form: a client MAY include the SPECIAL-USE " +
				"selection option on an extended LIST ('C: t3 LIST (SPECIAL-USE) \"\" \"*\"', §5.2) to " +
				"restrict the listing to special-use mailboxes. The quoted 'the LIST command MUST return " +
				"only those mailboxes ...' sentence binds the SERVER's response generation and is quoted " +
				"here only to fix the meaning of the client-emitted option (elision '...' drops the two " +
				"intervening return-option/attribute-definition sentences). Level MAY: emitting the " +
				"option is optional client behavior, but when emitted it MUST take the exact atom form " +
				"'SPECIAL-USE' inside the parenthesized selection-option list. rev2 keeps this standalone " +
				"(see extractionNote rev2-core adjudication). Conditional: binds only when the client " +
				"chooses to use the SPECIAL-USE extension. Testable self-actualizing: driver.list widened " +
				"to carry selectOptions but the verb throws NotImplementedError, so the client cannot yet " +
				"emit 'LIST (SPECIAL-USE) \"\" \"*\"'; a spec scripts the exact wire form and records the " +
				"gap. The matcher must reject a plausible-wrong emission (e.g. a bare 'LIST \"\" \"*\"' " +
				"with no selection option, or the option outside the parenthesized list).",
		},
		{
			id: "RFC6154-2-2",
			source: "RFC6154",
			section: "2",
			title: "Client MAY request special-use attributes be returned via the SPECIAL-USE return option",
			text:
				"If the client specifies the \"SPECIAL-USE\" return option, the LIST command MUST return the " +
				"new special-use attributes on those mailboxes that have them set. The \"SPECIAL-USE\" " +
				"return option is implied by the \"SPECIAL-USE\" selection option. The extended LIST " +
				"command MAY return SPECIAL-USE attributes even if the client does not specify the return " +
				"option.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Client-side duty is the command-emission form: a client MAY include SPECIAL-USE in the " +
				"RETURN option list of an extended LIST ('C: t2 LIST \"\" \"%\" RETURN (SPECIAL-USE)', " +
				"§5.2) to ask the server to include special-use attributes on matched mailboxes. The " +
				"'MUST return' sentence binds the SERVER; it is quoted to fix the option's meaning. The " +
				"third sentence ('MAY return ... even if the client does not specify the return option') " +
				"is the client-facing consequence that a client MUST be prepared to receive special-use " +
				"attributes on an extended LIST it did NOT tag with the return option — that acceptance " +
				"duty is captured by the general attribute-acceptance entry RFC6154-6-1 and the " +
				"ignore-unknown entry RFC6154-6-2; here the entry scores the client's ability to emit the " +
				"RETURN (SPECIAL-USE) request form. Level MAY (optional to emit; when emitted the atom " +
				"'SPECIAL-USE' MUST appear inside the RETURN parenthesized list). rev2 standalone. " +
				"Conditional on using the extension. Testable self-actualizing (driver.list carries " +
				"returnOptions but throws NotImplementedError). The matcher must reject a wrong emission " +
				"(missing RETURN keyword, or SPECIAL-USE outside the parentheses).",
		},

		// ── §3 Extension to IMAP CREATE Command (CREATE-SPECIAL-USE) ──────────────

		{
			id: "RFC6154-3-1",
			source: "RFC6154",
			section: "3",
			title: "Client MUST NOT use the USE parameter unless CREATE-SPECIAL-USE is advertised",
			text: "Clients MUST NOT use the \"USE\" parameter unless the server advertises the capability.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"The flagship explicit client prohibition of the CREATE-SPECIAL-USE half of RFC 6154. " +
				"Full context: 'An IMAP server that supports this OPTIONAL feature will advertise the " +
				"\"CREATE-SPECIAL-USE\" capability string. Clients MUST NOT use the \"USE\" parameter " +
				"unless the server advertises the capability. Note that this capability string is " +
				"different from the \"SPECIAL-USE\" string defined above, and a server that supports both " +
				"functions MUST advertise both capability strings.' — the trailing sentences fix which " +
				"capability gates the parameter (CREATE-SPECIAL-USE, distinct from the LIST-side " +
				"SPECIAL-USE capability). rev2-core cross-reference: the GENERAL extended-LIST option " +
				"gate RFC9051-6.3.9-5 ('a client MUST NOT send an option for which the server has not " +
				"advertised support', whose testability note names SPECIAL-USE) is a related but DISTINCT " +
				"duty — it gates LIST selection/return options against their capabilities, whereas this " +
				"entry gates the CREATE '(USE (...))' parameter against the separate CREATE-SPECIAL-USE " +
				"capability; RFC 9051 defines no CREATE USE parameter and no such CREATE-side gate, so " +
				"this entry is NOT a restatement of RFC9051-6.3.9-5 and keeps [\"rev1\",\"rev2\"] rather " +
				"than being tagged rev1-only. Conditional on the client using CREATE-SPECIAL-USE. " +
				"Testable: arm a server whose CAPABILITY omits CREATE-SPECIAL-USE and assert the client " +
				"never emits a CREATE carrying a '(USE (...))' parameter (currently self-actualizing — " +
				"driver.create with useAttributes throws NotImplementedError, so the client has no USE " +
				"surface to misuse).",
		},
		{
			id: "RFC6154-3-2",
			source: "RFC6154",
			section: "3",
			title: "Client CREATE with special use MAY carry the USE parameter (parenthesized attribute list)",
			text:
				"This extension defines the \"USE\" parameter to the IMAP CREATE command for that purpose " +
				"(using the syntax defined in RFC 4466 section 2.2 [RFC4466]). The new OPTIONAL \"USE\" " +
				"parameter is followed by a parenthesized list of zero or more special-use attributes, as " +
				"defined above.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"The CREATE-SPECIAL-USE command form: a client MAY designate special uses at creation via " +
				"'CREATE <mailbox> (USE (<attrs>))' (example §5.3: 'C: t2 CREATE MySpecial (USE (\\Drafts " +
				"\\Sent))'). ABNF (§6): 'create-param =/ \"USE\" SP \"(\" [use-attr *(SP use-attr)] \")\"'. " +
				"Level MAY: the parameter is OPTIONAL, but when emitted it MUST take exactly this form — " +
				"the literal atom 'USE', a space, then a parenthesized space-separated list of use-attr " +
				"tokens (possibly empty). rev2 standalone (RFC 9051 §6.3.4 CREATE defines no USE " +
				"parameter). Conditional on the client using CREATE-SPECIAL-USE (and, per RFC6154-3-1, " +
				"only when the capability is advertised). Testable self-actualizing: driver.create is " +
				"widened to accept useAttributes but throws NotImplementedError; a spec scripts the exact " +
				"'CREATE MySpecial (USE (\\Drafts \\Sent))' wire form. The matcher must reject a " +
				"plausible-wrong emission (attributes not parenthesized, 'USE' omitted, or attributes " +
				"passed as a flag list rather than inside the USE parameter).",
		},
		{
			id: "RFC6154-3-3",
			source: "RFC6154",
			section: "3",
			title: "Client MUST handle a tagged NO carrying the [USEATTR] response code on CREATE refusal",
			text:
				"If the reason for the failure is related to the special-use attribute (the specified " +
				"special use is not supported or cannot be assigned to the specified mailbox), the server " +
				"SHOULD include the new \"USEATTR\" response code in the tagged response",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit client-handling MUST inferred from a server-side SHOULD; no RFC " +
				"2119 keyword binds the client directly). The quoted sentence binds the SERVER to include " +
				"[USEATTR] when it refuses a special-use CREATE; the client-binding counterpart — the " +
				"reason this is catalogued on the client side — is that a client which emitted a CREATE " +
				"(USE (...)) MUST accept a tagged 'NO [USEATTR] ...' as a well-formed, per-spec refusal " +
				"of that request (example §5.3: 'C: t3 CREATE Everything (USE (\\All))' / 'S: t3 NO " +
				"[USEATTR] \\All not supported'), i.e. it must surface the CREATE as failed and MUST NOT " +
				"treat the [USEATTR] resp-text-code as a protocol/parse error. Same implicit-client-MUST " +
				"pattern as RFC5161-3.2-1 (empty ENABLED is not an error). ABNF (§6): 'resp-text-code =/ " +
				"\"USEATTR\"'. rev2 standalone (RFC 9051 defines no USEATTR code). Conditional on the " +
				"client using CREATE-SPECIAL-USE. Testable: script a CREATE (USE (...)) followed by 'NO " +
				"[USEATTR] ...' and assert the client reports a failed create (not a crash or hang) — " +
				"currently self-actualizing, as driver.create with useAttributes throws " +
				"NotImplementedError and never emits the CREATE that would elicit the [USEATTR] NO.",
		},

		// ── §6 Formal Syntax — special-use attributes the client must accept ──────

		{
			id: "RFC6154-6-1",
			source: "RFC6154",
			section: "6",
			title: "Client MUST accept the seven special-use name-attributes in LIST responses",
			text:
				"use-attr = \"\\All\" / \"\\Archive\" / \"\\Drafts\" / \"\\Flagged\" / \"\\Junk\" / " +
				"\"\\Sent\" / \"\\Trash\" / use-attr-ext",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (definitional ABNF, no RFC 2119 keyword on this production). This is the " +
				"core client-acceptance duty of the SPECIAL-USE half of RFC 6154: the seven name-" +
				"attributes \\All \\Archive \\Drafts \\Flagged \\Junk \\Sent \\Trash extend " +
				"'mbx-list-oflag =/ use-attr' (§6), so a client parsing LIST responses MUST accept any of " +
				"them wherever a mailbox-list flag may appear — in BOTH the non-extended LIST ('S: * " +
				"LIST (\\Sent \\HasNoChildren) \"/\" SentMail', §5.1) and the extended LIST ('S: * LIST " +
				"(\\Trash) \"/\" Trash', §5.2), interleaved with existing flags such as \\Marked and " +
				"\\HasNoChildren. Supporting text (§2): 'An IMAP server that supports this extension MAY " +
				"include any or all of the following attributes in responses to the non-extended IMAP " +
				"LIST command. The new attributes are included along with existing attributes ... A given " +
				"mailbox may have none, one, or more than one of these attributes.' — establishing the " +
				"client must tolerate zero/one/many special-use flags per mailbox, and (per §2 and " +
				"§5.4's manipulation example) the same attribute on several mailboxes. Whitespace in the " +
				"ABNF is flattened to single spaces in the quoted text (the source aligns the " +
				"alternatives across two lines). rev2 standalone: RFC 9051 §7.3.1 defines the " +
				"\\HasChildren/\\NonExistent/\\Subscribed family but NOT these special-use names (see " +
				"extractionNote). Conditional on the client using the SPECIAL-USE extension / consuming " +
				"these attributes. Testable: script a LIST response carrying a special-use attribute and " +
				"confirm the client parses the mailbox line without error and preserves the attribute.",
		},
		{
			id: "RFC6154-6-2",
			source: "RFC6154",
			section: "6",
			title: "Client MUST ignore list attributes it does not understand",
			text:
				"use-attr-ext = \"\\\" atom ; Reserved for future extensions. Clients ; MUST ignore list " +
				"attributes they do not understand",
			level: "MUST",
			applicability: "always",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Explicit MUST. The duty appears as a comment on the 'use-attr-ext = \"\\\" atom' ABNF " +
				"production in §6 Formal Syntax; the quoted text preserves the ABNF comment ';' " +
				"delimiters exactly as they appear once page furniture is stripped and whitespace " +
				"flattened (the sentence 'Clients MUST ignore list attributes they do not understand' is " +
				"split by a line break with a leading ';' on the continuation line — hence the interior " +
				"' ; ' — and this is verbatim, not an editorial insertion). The companion comment on the " +
				"same production (a server-binding rule that server implementations must not generate " +
				"extension attributes except as defined by future Standards-Track revisions of or " +
				"extensions to this specification, itself broken across several ';'-prefixed ABNF comment " +
				"lines) binds the server and is excluded. This " +
				"forward-compatibility duty means a client MUST NOT choke on an unrecognized " +
				"'\\'-prefixed atom (e.g. a future '\\Foo' special use, or any other extension mailbox " +
				"flag) in a LIST response — it parses the base response and skips the unknown attribute. " +
				"Same shape and testability treatment as RFC9051-7.3.1-3 ('The client MUST ignore all " +
				"extended fields it doesn't recognize'), which this catalog marks testable. rev2 " +
				"standalone (the RFC 9051 counterpart RFC9051-7.3.1-3 governs unrecognized LIST extended " +
				"fields, a related but textually distinct duty; this entry remains source-of-truth for " +
				"unrecognized list ATTRIBUTES via RFC 6154). applicability 'always': ignoring unknown " +
				"attributes is a baseline robustness duty for any client that parses LIST responses, not " +
				"gated on adopting special-use itself. Testable: send a LIST response with an " +
				"unrecognized '\\Xyzzy' attribute alongside a known one and confirm the client parses the " +
				"line and does not reject or mishandle the mailbox.",
		},
	],
};

export default rfc6154;
