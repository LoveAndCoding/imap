import type { CatalogModule } from "../types";

const rfc5255: CatalogModule = {
	source: "RFC5255",
	extractionNote:
		"RFC 5255 (Internet Message Access Protocol Internationalization — LANGUAGE, " +
		"I18NLEVEL=1, I18NLEVEL=2). Full document reviewed: §1 Introduction, §2 Conventions, " +
		"§3 LANGUAGE Extension [§3.1 LANGUAGE Extension Requirements, §3.2 LANGUAGE Command, " +
		"§3.3 LANGUAGE Response, §3.4 TRANSLATION Extension to the NAMESPACE Response, §3.5 " +
		"Formal Syntax], §4 I18NLEVEL=1 and I18NLEVEL=2 Extensions [§4.1 Introduction and " +
		"Overview, §4.2 Requirements Common to Both, §4.3 I18NLEVEL=1 Extension Requirements, " +
		"§4.4 I18NLEVEL=2 Extension Requirements, §4.5 Compatibility Notes, §4.6 Comparators " +
		"and Character Encodings, §4.7 COMPARATOR Command, §4.8 COMPARATOR Response, §4.9 " +
		"BADCOMPARATOR Response Code, §4.10 Formal Syntax], §5 Other IMAP Internationalization " +
		"Issues [§5.1-§5.3, all informative/non-normative], §6 IANA Considerations, §7 Security " +
		"Considerations, §8 Acknowledgements, §9 Relevant Sources (non-normative), §10-11 " +
		"References, Authors' Addresses, Full Copyright, Intellectual Property.\n\n" +
		"THREE-TOKEN COVERAGE. This single source catalogs all three capability tokens the " +
		"RFC defines, each with its own advertisement/activation gate: LANGUAGE (§3, a " +
		"freestanding command/response pair usable in any state, independent of the other two); " +
		"I18NLEVEL=1 (§4.3, the simpler comparator-selection level — server MUST implement " +
		"i;unicode-casemap for SEARCH/SORT/THREAD, no client-side comparator negotiation " +
		"exists at this level); I18NLEVEL=2 (§4.4, superset of I18NLEVEL=1 that additionally " +
		"exposes the COMPARATOR command/response and the [BADCOMPARATOR] resp-code so the " +
		"client can query/select the active comparator). §4.2's requirements (which SEARCH/" +
		"SORT/THREAD keys the active comparator governs) bind identically under either " +
		"I18NLEVEL, so those entries are tagged as applying whenever the client is talking to " +
		"a server advertising I18NLEVEL=1 OR I18NLEVEL=2, per requirement text.\n\n" +
		"CLIENT/SERVER SPLIT. This extension is heavily server-behavior-normative (what the " +
		"server MUST/SHOULD do when it advertises the extension, which comparator it " +
		"implements, how it performs collation). Excluded as server-only: §3.1 'IMAP servers " +
		"that support this extension MUST list the keyword LANGUAGE ...' and the greeting-" +
		"CAPABILITY half (server advertisement-generation duty; the client's reciprocal duty " +
		"is capability-gating its own LANGUAGE/COMPARATOR usage, captured generically via the " +
		"conditional applicability on every entry here rather than as a separate 'client must " +
		"check CAPABILITY first' entry, consistent with prior-phase capability-gate handling); " +
		"'A server that advertises this extension MUST use the language \"i-default\" ... as " +
		"its default language' and 'A server MUST include \"i-default\" as one of its " +
		"supported languages' (server default-language policy, no client action); 'IMAP " +
		"servers SHOULD NOT advertise the LANGUAGE extension if they discover that they only " +
		"support \"i-default\"' (server advertisement policy); §3.2 the LANGUAGE command's " +
		"'If the command fails, the server continues to return human-readable responses in " +
		"the language it was previously using' (describes server-side fallback state, not a " +
		"client action — the client's only duty is not erroring on continued responses in the " +
		"prior language, which is the general resp-text tolerance already covered elsewhere in " +
		"the suite, not a LANGUAGE-specific duty); 'The preferred language MAY vary based on " +
		"the currently active user' (server administrative policy); §3.4 'the server SHOULD " +
		"include these in the TRANSLATION extension to the NAMESPACE response' (server emits — " +
		"client's reciprocal parse/use duty is RFC5255-3.4-1); §4.2 'A server that advertises " +
		"I18NLEVEL=1 or I18NLEVEL=2 extension MUST implement the i;unicode-casemap comparator' " +
		"and 'MUST support UTF-8 as a SEARCH charset' (server implementation-completeness, not " +
		"client-observable as a distinct protocol action beyond the client's freedom to rely on " +
		"the capability advertisement, which is the standard capability-gate pattern); §4.3's " +
		"CAPABILITY-listing MUST and §4.4's CAPABILITY-listing MUST + 'MUST implement the " +
		"i;unicode-casemap comparator' + 'SHOULD use i;unicode-casemap as the default " +
		"comparator' + 'the default comparator MUST remain static for the remainder of that " +
		"connection' (all server implementation/advertisement duties — the client-observable " +
		"counterpart, that the client can rely on i;unicode-casemap being available under " +
		"I18NLEVEL=1/2 and on the default not changing mid-connection, is folded into the " +
		"§4.2 applicable-keys entries rather than duplicated as separate entries); §4.5 " +
		"Compatibility Notes is entirely descriptive/advisory prose about server deployment " +
		"history with no client MUST/SHOULD ('Legacy server implementations ... should be " +
		"updated to advertise I18NLEVEL=1' binds implementers of servers, not the runtime " +
		"client protocol); §4.6 Comparators and Character Encodings is a server-side collation " +
		"algorithm (MIME-decode, charset-convert, substring/ordering fallback to i;octet) that " +
		"a client never performs or can observe as a distinct wire action beyond the SEARCH/" +
		"SORT/THREAD results it already receives — fully server-internal; §4.7 'The argument " +
		"\"default\" refers to the server's default comparator' is descriptive of server " +
		"semantics but the client-facing encoding duty (client MAY send the literal token " +
		"\"default\") is captured in RFC5255-4.7-4; §6 IANA Considerations is a registry-" +
		"maintenance note, not a live duty; §7's first paragraph (server root-privilege / " +
		"buffer-overflow parsing care) binds server implementers, not the client.\n\n" +
		"CLIENT-BINDING extracted (21 entries): §3.1 the SHOULD-issue-before-authentication " +
		"timing advice and the MUST-re-issue-after-security-layer duty (also restated in §7, " +
		"cataloged once at §3.1 since it is the same normative obligation restated for " +
		"security-rationale purposes — see RFC5255-3.1-2's notes); the NAMESPACE-extension-" +
		"support co-requirement; §3.2 the LANGUAGE command's argument forms (language-range " +
		"list, no-args enumeration request, the \"default\" pseudo-range) and the client's MUST-" +
		"accept duty for the untagged LANGUAGE response that follows a successful command; §3.3 " +
		"the two LANGUAGE-response-shape parse duties (single-tag = active-language change, " +
		"multi-tag = enumeration with no change); §3.4 the client's responsibility to convert " +
		"between a namespace prefix and its TRANSLATION when presenting mailbox names to the " +
		"user; §4.2 the four applicable-comparator scoping duties (SEARCH keys, SORT keys, " +
		"ORDEREDSUBJECT threading, REFERENCES threading) that tell a client which comparator " +
		"governs which command under I18NLEVEL=1/2; §4.7 the COMPARATOR command's state " +
		"restriction, its dual purpose (query vs. change), the first-match-wins resolution " +
		"rule, and the \"default\" argument encoding; §4.8 the COMPARATOR response's two-part " +
		"content (active comparator, optional match list) the client must parse; §4.9 the " +
		"[BADCOMPARATOR] resp-code the client must parse on a COMPARATOR-command failure.\n\n" +
		"REV1/REV2 STANDALONE CONFIRMATION: grepped catalog/rfc9051/ for LANGUAGE, COMPARATOR, " +
		"and I18NLEVEL — zero hits. None of the three tokens is folded into IMAP4rev2 (RFC " +
		"9051); this remains a fully standalone extension under both profiles, so every entry " +
		"here defaults profiles: [\"rev1\",\"rev2\"] with no double-scoring risk against a 9051 " +
		"core duty. All entries are applicability: conditional (bind only when the client uses " +
		"LANGUAGE and/or I18NLEVEL=1/2 COMPARATOR).\n\n" +
		"RFC 8174 discipline: RFC 5255 predates RFC 8174 and cites only RFC 2119 (§2), so " +
		"lowercase 'must'/'should' were never normative here. Every extracted entry rests on an " +
		"UPPERCASE RFC 2119 keyword in its source sentence EXCEPT RFC5255-3.2-3 (LANGUAGE " +
		"response effective-immediately timing, descriptive prose), RFC5255-3.3-1/-2 (LANGUAGE " +
		"response shape, descriptive), RFC5255-3.4-1 (client conversion responsibility, " +
		"descriptive 'It is the responsibility of the client...'), RFC5255-4.7-2/-3 (COMPARATOR " +
		"command dual-purpose and first-match-wins, descriptive), and RFC5255-4.8-1/-2/-3 " +
		"(COMPARATOR response shape, descriptive) — each flagged as a judgment-level call in " +
		"its notes, following the RFC5464-style precedent for descriptive protocol-shape " +
		"sentences that impose a hard parse obligation without an RFC 2119 keyword.\n\n" +
		"Untestable: 1 entry — RFC5255-3.4-1 (client's internal presentation-layer conversion " +
		"between namespace prefix and TRANSLATION string, ui-presentation). Total: 21 client-" +
		"binding entries, 20 testable + 1 untestable (RFC5255-3.1-1..3, RFC5255-3.2-1..3, RFC5255-3.3-1..2, RFC5255-3.4-1, " +
		"RFC5255-4.2-1..4, RFC5255-4.7-1..4, RFC5255-4.8-1..3, RFC5255-4.9-1).",
	requirements: [
		// ── §3.1 LANGUAGE Extension Requirements ─────────────────────────────────

		{
			id: "RFC5255-3.1-1",
			source: "RFC5255",
			section: "3.1",
			title: "Client and server supporting LANGUAGE MUST also support NAMESPACE",
			text: "Clients and servers that support this extension MUST also support the NAMESPACE extension [RFC2342].",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Explicit client-and-server MUST co-requirement. Testable black-box as a capability-" +
				"inventory fact: a compliant client's own CAPABILITY handling/usage of LANGUAGE " +
				"presupposes NAMESPACE support (e.g. it must be prepared to receive the TRANSLATION-" +
				"extended NAMESPACE response of §3.4). Conditional on the client using the LANGUAGE " +
				"extension at all. Standalone in rev2 (grepped catalog/rfc9051/ for LANGUAGE — zero " +
				"hits), so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5255-3.1-2",
			source: "RFC5255",
			section: "3.1",
			title: "Client SHOULD issue LANGUAGE before authentication",
			text:
				"The LANGUAGE command is valid in all states. Clients SHOULD issue LANGUAGE before " +
				"authentication, since some servers send valuable user information as part of " +
				"authentication (e.g., \"password is correct, but expired\").",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Explicit SHOULD timing advice, paired with the state-validity fact ('valid in all " +
				"states') that makes the early issuance possible. Testable black-box: a client that " +
				"uses LANGUAGE at all is observed to send it (if at all pre-auth) before LOGIN/" +
				"AUTHENTICATE, so that any localized error text from the authentication attempt " +
				"itself is already in the negotiated language. Conditional; standalone in rev2, so " +
				"[\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5255-3.1-3",
			source: "RFC5255",
			section: "3.1",
			title: "Client MUST re-issue LANGUAGE after a security layer is subsequently negotiated",
			text:
				"If a security layer (such as SASL or TLS) is subsequently negotiated by the client, " +
				"it MUST re-issue the LANGUAGE command in order to make sure that no previous " +
				"active attack (if any) on LANGUAGE negotiation has effect on subsequent error " +
				"messages.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Explicit client MUST, quoted verbatim from §3.1 (unbroken 're-issue', no line-wrap " +
				"space in this section). Restated in §7 Security Considerations, where the source " +
				"text genuinely wraps at that location ('Clients MUST re- " +
				"issue the LANGUAGE command once a security layer is active, in order to prevent " +
				"this attack from impacting subsequent protocol operations.') — the same normative " +
				"obligation for the same security rationale (an active attacker could have " +
				"suppressed/modified an unprotected pre-TLS/pre-auth LANGUAGE negotiation), so it is " +
				"cataloged once here rather than as a duplicate entry; the §7 restatement (with its " +
				"own genuine line-wrap artifact) is a side observation only and is not the source of " +
				"this entry's `text`, which is drawn exclusively from §3.1. Testable black-box: script a " +
				"pre-LANGUAGE-then-STARTTLS (or SASL security-layer) sequence and assert the client " +
				"sends a fresh LANGUAGE command after the layer activates, if it issued one at all " +
				"before. Conditional on the client having issued LANGUAGE pre-security-layer and then " +
				"negotiating one; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},

		// ── §3.2 LANGUAGE Command ────────────────────────────────────────────────

		{
			id: "RFC5255-3.2-1",
			source: "RFC5255",
			section: "3.2",
			title: "LANGUAGE command requests localization to a language matching an RFC 4647 language range",
			text:
				"The LANGUAGE command requests that human-readable text emitted by the server be " +
				"localized to a language matching one of the language range argument as described " +
				"by Section 2 of [RFC4647].",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: descriptive command-semantics sentence, no RFC 2119 keyword, but it " +
				"is the hard encoding contract for the command's argument list — a client's LANGUAGE " +
				"arguments must be well-formed RFC 4647 language-range strings (ABNF lang-range-quoted " +
				"= astring, resolving to the language-range rule of RFC 4647). Testable black-box: " +
				"the emitted LANGUAGE argument tokens are syntactically valid language ranges (e.g. " +
				"'EN', 'DE-IT', 'FR-CA', or the wildcard-bearing forms RFC 4647 permits), never " +
				"arbitrary strings. Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5255-3.2-2",
			source: "RFC5255",
			section: "3.2",
			title: "Client MUST accept the LANGUAGE response and treat the new language as effective immediately after it",
			text:
				"The server MUST send a LANGUAGE response specifying the language used, and the " +
				"change takes effect immediately after the LANGUAGE response.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"The MUST is worded on the server (emits the response); the extracted client duty is " +
				"the reciprocal parse/timing obligation — a client issuing a successful LANGUAGE " +
				"command must accept the untagged LANGUAGE response and must expect ALL subsequent " +
				"human-readable text (including a same-exchange NAMESPACE response, per the worked " +
				"examples in §3.2/§3.4) to already be in the newly negotiated language, not the " +
				"language of the tagged OK's own text. Testable black-box: script a successful " +
				"LANGUAGE exchange followed by a further response carrying non-default-language text " +
				"and assert the client parses it without erroring on the encoding switch. Conditional; " +
				"standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5255-3.2-3",
			source: "RFC5255",
			section: "3.2",
			title: "\"default\" is a special language-range argument requesting the server administrator's preferred language",
			text:
				"The special \"default\" language range argument indicates a request to use a " +
				"language designated as preferred by the server administrator.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: descriptive sentence defining a reserved argument token, no RFC 2119 " +
				"keyword, but it is a hard encoding fact a client must honor when it wants the " +
				"'administrator preferred' behavior (illustrated by the worked example: 'C: D003 " +
				"LANGUAGE \"default\"'). Testable black-box: a client using this feature emits the " +
				"literal quoted string \"default\" as the language-range argument, not any other " +
				"token. Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},

		// ── §3.3 LANGUAGE Response ───────────────────────────────────────────────

		{
			id: "RFC5255-3.3-1",
			source: "RFC5255",
			section: "3.3",
			title: "Client MUST treat a single-tag LANGUAGE response as an active-language change",
			text:
				"A LANGUAGE response with a list containing a single language tag indicates that the " +
				"server is now using that language.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: descriptive response-semantics sentence, no RFC 2119 keyword, but it " +
				"is the client's hard parse/interpretation obligation for one of the two LANGUAGE-" +
				"response shapes (ABNF language-data = \"LANGUAGE\" SP \"(\" lang-tag-quoted *(SP " +
				"lang-tag-quoted) \")\" — here with exactly one lang-tag-quoted). Testable black-box: " +
				"script a '* LANGUAGE (DE)' response and assert the client accepts it and treats DE " +
				"as now active (does not, e.g., treat it as an enumeration list). Conditional; " +
				"standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5255-3.3-2",
			source: "RFC5255",
			section: "3.3",
			title: "Client MUST treat a multi-tag LANGUAGE response as an enumeration with no active-language change",
			text:
				"A LANGUAGE response with a list containing multiple language tags indicates the " +
				"server is communicating a list of available languages to the client, and no change " +
				"in the active language has been made.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: descriptive response-semantics sentence, no RFC 2119 keyword; the " +
				"complementary parse duty to RFC5255-3.3-1 for the multi-tag branch of the same ABNF " +
				"production. Testable black-box: script a '* LANGUAGE (EN DE IT i-default)' response " +
				"(the §3.2 worked example) following a no-argument LANGUAGE enumeration request and " +
				"assert the client accepts it as a supported-languages list, not as switching the " +
				"active language to the first-listed tag. Conditional; standalone in rev2, so " +
				"[\"rev1\",\"rev2\"].",
		},

		// ── §3.4 TRANSLATION Extension to the NAMESPACE Response ────────────────

		{
			id: "RFC5255-3.4-1",
			source: "RFC5255",
			section: "3.4",
			title: "Client is responsible for converting between a namespace prefix and its TRANSLATION when presenting to the user",
			text:
				"It is the responsibility of the client to convert between the namespace prefix and " +
				"the translation of the namespace prefix when presenting mailbox names to the user.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "ui-presentation",
			untestableRationale:
				"This duty governs what the client DISPLAYS to a human user (using the localized " +
				"TRANSLATION string in place of, or alongside, the raw modified-UTF-7 namespace " +
				"prefix when rendering mailbox names in a UI), not any wire-observable protocol " +
				"action. A client that dutifully substitutes the TRANSLATION string in its mailbox " +
				"list UI and one that ignores it and shows only the raw prefix both issue identical " +
				"LANGUAGE/NAMESPACE commands and consume an identical '* NAMESPACE (...) (...TRANSLATION " +
				"(...)) (...)' response; the divergence is entirely in client-side rendering that a " +
				"black-box protocol harness (which has no UI to inspect) cannot observe. This mirrors " +
				"the established ui-presentation theme (e.g. RFC3501-7.1-1 ALERT-text display).",
			notes:
				"Judgment level: descriptive responsibility statement, no RFC 2119 keyword, but it " +
				"is the only sentence defining what a client does with the TRANSLATION string once " +
				"parsed. The server's reciprocal duty ('the server SHOULD include these in the " +
				"TRANSLATION extension to the NAMESPACE response') is excluded as server-only. " +
				"Conditional on the client using both LANGUAGE and NAMESPACE with translated " +
				"prefixes present; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},

		// ── §4.2 Requirements Common to Both I18NLEVEL=1 and I18NLEVEL=2 ─────────

		{
			id: "RFC5255-4.2-1",
			source: "RFC5255",
			section: "4.2",
			title: "Active comparator (I18NLEVEL=1/2) applies to the BCC/BODY/CC/FROM/SUBJECT/TEXT/TO/HEADER SEARCH keys",
			text:
				"The active comparator applies to the following SEARCH keys: \"BCC\", \"BODY\", " +
				"\"CC\", \"FROM\", \"SUBJECT\", \"TEXT\", \"TO\", and \"HEADER\".",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: descriptive scoping sentence, no RFC 2119 keyword, but it is a hard " +
				"client-facing semantic fact under I18NLEVEL=1 or I18NLEVEL=2 — a client that has " +
				"negotiated (I18NLEVEL=1, implicitly) or selected (I18NLEVEL=2, via COMPARATOR) a " +
				"non-default comparator must interpret SEARCH results against these eight keys as " +
				"governed by THAT comparator's matching semantics, not the base RFC 3501 §6.4.4 " +
				"case-insensitive-substring rule. Testable black-box: under a server advertising " +
				"I18NLEVEL=1/2, script SEARCH results consistent with the active comparator's " +
				"semantics on these keys and assert the client's interpretation (e.g. which UIDs it " +
				"surfaces to the caller) matches. Conditional on the client using SEARCH under " +
				"I18NLEVEL=1/2; standalone in rev2 (I18NLEVEL is not folded into RFC 9051 — SEARCH's " +
				"base matching in rev2 is unchanged from rev1's §6.4.4), so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5255-4.2-2",
			source: "RFC5255",
			section: "4.2",
			title: "Active comparator (I18NLEVEL=1/2) applies to the CC/FROM/SUBJECT/TO SORT keys when SORT is advertised",
			text:
				"If the server also advertises the \"SORT\" extension, then the active comparator " +
				"applies to the following SORT keys: \"CC\", \"FROM\", \"SUBJECT\", and \"TO\".",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: descriptive scoping sentence, no RFC 2119 keyword; parallel to " +
				"RFC5255-4.2-1 but for SORT (RFC 5256) and conditioned on the server also advertising " +
				"SORT. Testable black-box: under a server advertising both I18NLEVEL=1/2 and SORT, " +
				"script SORT results ordered per the active comparator on these four keys and assert " +
				"the client's ordering interpretation matches. Conditional on the client using SORT " +
				"under I18NLEVEL=1/2 with a server that also advertises SORT; standalone in rev2, so " +
				"[\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5255-4.2-3",
			source: "RFC5255",
			section: "4.2",
			title: "Active comparator (I18NLEVEL=1/2) applies to the ORDEREDSUBJECT threading algorithm when advertised",
			text:
				"If the server advertises THREAD=ORDEREDSUBJECT, then the active comparator applies " +
				"to the ORDEREDSUBJECT threading algorithm.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: descriptive scoping sentence, no RFC 2119 keyword; parallel scoping " +
				"duty for THREAD=ORDEREDSUBJECT (RFC 5256). Testable black-box: under a server " +
				"advertising I18NLEVEL=1/2 and THREAD=ORDEREDSUBJECT, script THREAD results grouped " +
				"per the active comparator's subject comparison and assert the client's thread-tree " +
				"interpretation matches. Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5255-4.2-4",
			source: "RFC5255",
			section: "4.2",
			title: "Active comparator (I18NLEVEL=1/2) applies to REFERENCES threading's subject-field comparisons when advertised",
			text:
				"If the server advertises THREAD=REFERENCES, then the active comparator applies to " +
				"the subject field comparisons done by REFERENCES threading algorithm.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: descriptive scoping sentence, no RFC 2119 keyword; parallel scoping " +
				"duty for THREAD=REFERENCES (RFC 5256) subject-field comparisons specifically (not " +
				"the Message-ID/References-header linkage, which is comparator-independent). " +
				"Testable black-box: under a server advertising I18NLEVEL=1/2 and THREAD=REFERENCES, " +
				"script THREAD results whose subject-based grouping reflects the active comparator " +
				"and assert the client's interpretation matches. Conditional; standalone in rev2, so " +
				"[\"rev1\",\"rev2\"].",
		},

		// ── §4.7 COMPARATOR Command (I18NLEVEL=2) ────────────────────────────────

		{
			id: "RFC5255-4.7-1",
			source: "RFC5255",
			section: "4.7",
			title: "COMPARATOR command is valid only in authenticated and selected states",
			text: "The COMPARATOR command is valid in authenticated and selected states.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: state-restriction phrased without an UPPERCASE keyword (parallel to " +
				"the RFC5464 GETMETADATA/SETMETADATA precedent), but a hard availability constraint — " +
				"a compliant client never emits COMPARATOR outside authenticated or selected state. " +
				"Testable black-box: a client never sends COMPARATOR while not-authenticated. " +
				"Conditional on the client using I18NLEVEL=2's COMPARATOR command; standalone in " +
				"rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5255-4.7-2",
			source: "RFC5255",
			section: "4.7",
			title: "COMPARATOR with no arguments queries the active comparator; with arguments it changes it",
			text:
				"The COMPARATOR command is used to determine or change the active comparator. When " +
				"issued with no arguments, it results in a COMPARATOR response indicating the " +
				"currently active comparator. When issued with one or more comparator arguments, it " +
				"changes the active comparator as directed.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: descriptive dual-purpose command-semantics sentence, no RFC 2119 " +
				"keyword, but a hard client-facing contract for the argument-presence branch. " +
				"Testable black-box: a no-arg COMPARATOR is followed by acceptance of a COMPARATOR " +
				"response naming the current comparator (no change); a with-args COMPARATOR whose " +
				"tagged OK the client accepts is treated as having changed the active comparator for " +
				"subsequent SEARCH/SORT/THREAD. Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5255-4.7-3",
			source: "RFC5255",
			section: "4.7",
			title: "First-match-wins when a COMPARATOR argument matches more than one installed comparator",
			text:
				"(If more than one installed comparator is matched by an argument, the first argument " +
				"wins.)",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: descriptive resolution-order parenthetical, no RFC 2119 keyword, but " +
				"it is the client's interpretation contract for ambiguous multi-argument COMPARATOR " +
				"commands (e.g. the worked example 'A001 COMPARATOR \"cz;*\" i;basic' where the server " +
				"picks the first supported comparator among matches). A client relying on ordering " +
				"semantics (e.g. listing a preferred comparator before a fallback) must place its " +
				"preferred argument first. Testable black-box: script a COMPARATOR response reflecting " +
				"first-argument-priority resolution and assert the client's downstream comparator " +
				"assumption tracks the winning (first) argument, not a later one. Conditional; " +
				"standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5255-4.7-4",
			source: "RFC5255",
			section: "4.7",
			title: "\"default\" argument refers to the server's default comparator; other arguments are RFC 4790 collation specifications",
			text:
				"The argument \"default\" refers to the server's default comparator. Otherwise, each " +
				"argument is a collation specification as defined in the Internet Application " +
				"Protocol Comparator Registry [RFC4790].",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: descriptive argument-encoding sentence, no RFC 2119 keyword, but a " +
				"hard encoding constraint on what a client may emit as a COMPARATOR argument — either " +
				"the reserved literal \"default\" or a well-formed RFC 4790 collation specification " +
				"(comp-order-quoted = astring resolving to the collation-order rule). Testable " +
				"black-box: emitted COMPARATOR arguments are either the literal 'default' or " +
				"syntactically valid collation specifications, never arbitrary tokens. Conditional; " +
				"standalone in rev2, so [\"rev1\",\"rev2\"].",
		},

		// ── §4.8 COMPARATOR Response (I18NLEVEL=2) ───────────────────────────────

		{
			id: "RFC5255-4.8-1",
			source: "RFC5255",
			section: "4.8",
			title: "Client MUST accept the COMPARATOR response as a result of a COMPARATOR command",
			text: "The COMPARATOR response occurs as a result of a COMPARATOR command.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: descriptive sentence, no RFC 2119 keyword, but it establishes the " +
				"client's core parse obligation for the untagged '* COMPARATOR ...' response (ABNF " +
				"comparator-data = \"COMPARATOR\" SP comp-sel-quoted [SP \"(\" comp-id-quoted *(SP " +
				"comp-id-quoted) \")\"]) whenever the client issues COMPARATOR. Testable black-box: " +
				"script a '* COMPARATOR i;basic' response to a COMPARATOR command and assert the " +
				"client parses it without erroring. Conditional; standalone in rev2, so " +
				"[\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5255-4.8-2",
			source: "RFC5255",
			section: "4.8",
			title: "Client MUST parse the first COMPARATOR-response argument as the active comparator's name",
			text: "The first argument in the comparator response is the name of the active comparator.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: descriptive positional-parse sentence, no RFC 2119 keyword, but a " +
				"hard structural parse rule (comp-sel-quoted, the first ABNF field). Testable black-" +
				"box: script a COMPARATOR response and assert the client attributes the first token " +
				"as the now-active comparator (e.g. reflected in subsequent SEARCH/SORT/THREAD " +
				"comparator-dependent behavior). Conditional; standalone in rev2, so " +
				"[\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5255-4.8-3",
			source: "RFC5255",
			section: "4.8",
			title: "Client MUST accept an optional second COMPARATOR-response argument listing matched comparators",
			text:
				"The second argument is a list of comparators which matched any of the arguments to " +
				"the COMPARATOR command and is present only if more than one match is found.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: descriptive optional-field parse sentence, no RFC 2119 keyword, but " +
				"a hard structural parse rule — the client must accept both the two-field form " +
				"('* COMPARATOR i;basic (i;basic i;unicode-casemap)') and the one-field form " +
				"('* COMPARATOR i;basic') depending on whether more than one comparator matched, " +
				"per the ABNF's optional '[SP \"(\" comp-id-quoted *(SP comp-id-quoted) \")\"]' " +
				"clause. Testable black-box: script both response shapes and assert the client " +
				"parses each without erroring. Conditional; standalone in rev2, so " +
				"[\"rev1\",\"rev2\"].",
		},

		// ── §4.9 BADCOMPARATOR Response Code (I18NLEVEL=2) ───────────────────────

		{
			id: "RFC5255-4.9-1",
			source: "RFC5255",
			section: "4.9",
			title: "Client MUST accept the [BADCOMPARATOR] response code on a failed COMPARATOR command",
			text:
				"This response code SHOULD be returned as a result of server failing an IMAP command " +
				"(returning NO), when the server knows that none of the specified comparators match " +
				"the requested comparator(s).",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"The SHOULD is worded on the server (emits the resp-code); the extracted client duty " +
				"is the reciprocal PARSE obligation — a client issuing COMPARATOR with one or more " +
				"comparator arguments must accept a tagged NO carrying the '[BADCOMPARATOR]' resp-" +
				"text-code (ABNF resp-text-code =/ \"BADCOMPARATOR\") as a well-formed 'no matching " +
				"comparator' failure, per the command's own Result line ('NO - No matching comparator " +
				"found'). Testable black-box: script a tagged 'NO [BADCOMPARATOR] ...' completion to " +
				"a COMPARATOR command and assert the client surfaces it as a failure without " +
				"erroring on the unrecognized resp-text-code. Conditional; standalone in rev2, so " +
				"[\"rev1\",\"rev2\"].",
		},
	],
};

export default rfc5255;
