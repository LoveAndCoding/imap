import type { CatalogModule } from "../types";

const rfc3516: CatalogModule = {
	source: "RFC3516",
	extractionNote:
		"RFC 3516 (IMAP4 Binary Content Extension, capability 'BINARY') fully reviewed for " +
		"client-binding requirements across every section: Abstract, §1 Conventions, §2 " +
		"Introduction, §3 Content-Transfer-Encoding Considerations, §4 Framework (§4.1 CAPABILITY " +
		"Identification, §4.2 FETCH Command Extensions, §4.3 FETCH Response Extensions, §4.4 APPEND " +
		"Command Extensions), §5 MIME Encoded Headers, §6 Implementation Considerations, §7 Formal " +
		"Protocol Syntax, §8/§9 References + Security, §10-12 IPR/Author/Copyright. " +
		"7 client-binding entries extracted (§4.2×3, §4.3×2, §4.4×1, §6×1). " +
		"CLIENT vs SERVER SPLIT: RFC 3516 is overwhelmingly a SERVER-directed extension — the server " +
		"performs the CTE decoding, computes decoded sizes, and chooses the response literal form. The " +
		"catalog captures only what binds the CLIENT: (a) the command-item syntax the client emits " +
		"(BINARY / BINARY.PEEK / BINARY.SIZE FETCH data items, §4.2); (b) the FETCH-response elements " +
		"the client must parse/accept (a BINARY[...] value delivered as either <nstring> or <literal8>, " +
		"and a BINARY.SIZE number, §4.3); (c) the client's use of the <literal8> (~{n}) syntax to APPEND " +
		"NUL-containing data (§4.4); (d) the client's own-CTE-decoding readiness SHOULD (§6); and the " +
		"client-facing duty to accept/handle a 'NO [UNKNOWN-CTE]' tagged failure (folded into the §4.3 " +
		"response-parsing entry, see below). " +
		"SKIPPED as SERVER-ONLY (no client action to observe or enforce, so not catalogued): " +
		"§4.1 'IMAP4 servers that support this extension MUST include \"BINARY\" in the response list to " +
		"the CAPABILITY command' (a client consumes but never emits CAPABILITY data — server duty); " +
		"§4.3/§4.4 'the server MUST fail the request and issue a \"NO\" response that contains the " +
		"\"UNKNOWN-CTE\" extended response code' (both the FETCH-decode-failure and the APPEND-" +
		"unsupported-mailbox forms are SERVER response-generation MUSTs; the client's mirror duty is to " +
		"tolerate the resulting tagged NO with the UNKNOWN-CTE code, cataloged as the client half of " +
		"RFC3516-4.3-2 rather than as a duplicate entry); §4.3 'the server SHOULD return the data in a " +
		"<string> instead of a <literal8>' when the 8bit domain contains no NUL (a SERVER literal-form " +
		"choice — its client-facing consequence, that the client must accept EITHER form, is the binding " +
		"content of RFC3516-4.3-1); §4.3 'The value returned MUST match the size of the <nstring> or " +
		"<literal8> ...' for BINARY.SIZE (a SERVER computation-correctness MUST; the client merely reads " +
		"the number); §4.4 'The server MAY modify the CTE of the appended data, however any such " +
		"transformation MUST NOT result in a loss of data' (SERVER transformation duty); §5 'A server " +
		"MUST NOT perform any conversion of [MIME-MHE] encoded header text ...' (SERVER prohibition); §6 " +
		"'servers MUST ensure that textual line-oriented sections are always transmitted using the IMAP4 " +
		"CRLF line termination syntax ...' (SERVER framing MUST); §6 'this should only be done when it " +
		"is absolutely necessary. Gratuitous encoding changes ...' (SERVER advice, lowercase 'should', " +
		"re-states the §4.4 server transformation caution); §6 'the server MUST issue BODYSTRUCTURE " +
		"responses that describe the message as though the binary-encoded sections are encoded in a CTE " +
		"acceptable to the IMAP4 base specification' and 'the results of a FETCH BODY MUST return ...' " +
		"(SERVER response-generation MUSTs). §3 is explanatory (server two-step FETCH BINARY " +
		"processing), §7 is pure ABNF grammar (the literal8 / fetch-att / msg-att-static / " +
		"resp-text-code / section-binary productions are grammar, not prose duties — the client-binding " +
		"consequences of the literal8 and BINARY productions are cataloged from their §4 prose), and " +
		"§8/§9 References + Security add no client duty ('no known additional security issues ... beyond " +
		"[IMAP4rev1]'). " +
		"REV2-CORE ADJUDICATION (rule 4 — split recorded per the DELIVERED plan guidance, then " +
		"RECONCILED against the authoritative catalog/rfc9051.ts). The Phase-4 plan framed the split as " +
		"'literal8 (~{n}) transmission is in rev2 core → rev1-only+cross-ref; the BINARY FETCH items are " +
		"a standalone extension in rev2 → [\"rev1\",\"rev2\"]'. VERIFYING that framing against " +
		"catalog/rfc9051.ts REFUTES the second half: RFC 9051 did NOT leave BINARY FETCH standalone — it " +
		"ABSORBED the full RFC 3516 surface into rev2 CORE. Appendix B of RFC 9051 (cataloged narratively " +
		"in rfc9051/sA-appendices.ts) speaks of 'IMAP4rev2 implementations that support full [RFC3516] " +
		"functionality', and the core already carries: BINARY[<section-binary>] / BINARY.PEEK / " +
		"BINARY.SIZE as new CORE FETCH data items with the leaf-body-part constraint (RFC9051-6.4.5-2) " +
		"and the BINARY.SIZE expense caution VERBATIM (RFC9051-6.4.5-4); the <literal8> mechanism and the " +
		"unencoded-binary carve-out for BINARY/BINARY.PEEK FETCH responses (RFC9051-4.3.1-3, " +
		"RFC9051-4.3.1-4); the client MUST-decode-transfer-encoded-binary content duty " +
		"(RFC9051-7.5.2-2); and the UNKNOWN-CTE response code in §7.1 (listed there with zero " +
		"client-binding content — server-side). Because the catalog is the source of truth and rule 4 " +
		"directs 'read catalog/rfc9051.ts ... record the decision', the split is applied as follows: " +
		"(i) EVERY RFC 3516 client duty that RFC 9051 restates as a rev2-core client duty is tagged " +
		"profiles:[\"rev1\"] here + cross-referenced, so a rev2 client scores that duty ONCE, via core " +
		"— this covers the BINARY.SIZE caution (RFC3516-4.2-3 ↔ RFC9051-6.4.5-4, verbatim), the " +
		"literal8/BINARY-response parsing (RFC3516-4.3-1 ↔ RFC9051-4.3.1-3/-4 + the literal8 production), " +
		"the literal8 APPEND transmission (RFC3516-4.4-1 ↔ RFC9051-4.3.1-3/-4 literal8 mechanism, exactly " +
		"the plan's 'literal8 in rev2 core' case), and the own-CTE-decoding readiness " +
		"(RFC3516-6-1 ↔ RFC9051-7.5.2-2). (ii) The BINARY / BINARY.PEEK / BINARY.SIZE FETCH COMMAND-ITEM " +
		"definitions (RFC3516-4.2-1, RFC3516-4.2-2) are the ONE place where rev2 core has the data items " +
		"but does NOT restate RFC 3516's per-item DEFINITION sentences verbatim as separate client " +
		"entries (rfc9051 §6.4.5 defines BODY/BINARY behavior via the leaf-part + PEEK-\\Seen entries, " +
		"not via RFC3516's 'Requests that the specified section be transmitted after performing " +
		"CTE-related decoding' wording); these remain the standalone SOURCE-OF-TRUTH definition text for " +
		"the command items, so they keep profiles:[\"rev1\",\"rev2\"] — this is the residue of the plan's " +
		"'BINARY FETCH items standalone in rev2' intent, narrowed to just the command-item definitions " +
		"that rev2 core does not itself spell out. DECISION SUMMARY: rev1-only (5): RFC3516-4.2-3, " +
		"RFC3516-4.3-1, RFC3516-4.4-1, RFC3516-6-1 [and RFC3516-4.3-2's UNKNOWN-CTE client-handling half " +
		"folds under 4.3-1]; both-profiles (2): RFC3516-4.2-1, RFC3516-4.2-2. NUL-in-literal8: the whole " +
		"raison d'être of literal8 (append/return data containing NUL octets) is captured in " +
		"RFC3516-4.3-1 and RFC3516-4.4-1. " +
		"UNTESTABLE (2): RFC3516-4.2-3 (performance-expectation — 'needlessly issuing' has no wire " +
		"signature, mirrors RFC9051-6.4.5-4) and RFC3516-6-1 (content-processing — whether the client " +
		"internally performs its own CTE decoding is a rendering-layer duty a black-box library may " +
		"delegate to the consuming application, mirrors RFC9051-7.5.2-2). Total: 7 client-binding " +
		"entries (RFC3516-4.2-1..3, RFC3516-4.3-1..2, RFC3516-4.4-1, RFC3516-6-1).",
	requirements: [
		// ── §4.2 FETCH Command Extensions ───────────────────────────────────────

		{
			id: "RFC3516-4.2-1",
			source: "RFC3516",
			section: "4.2",
			title: "Client MAY request a section decoded via the BINARY / BINARY.PEEK FETCH data item",
			text:
				"Requests that the specified section be transmitted after performing CTE-related decoding.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"§4.2, defining the BINARY<section-binary>[<partial>] FETCH data item (with BINARY.PEEK as " +
				"'An alternate form of FETCH BINARY that does not implicitly set the \\Seen flag'). No RFC " +
				"2119 keyword in the definition sentence itself; level assigned MAY by judgment — using the " +
				"BINARY item is an optional client facility that, when used, must be emitted in this exact " +
				"form. Applicability 'conditional' — binds only when the client uses the BINARY extension. " +
				"REV2 SPLIT: kept profiles:[\"rev1\",\"rev2\"]. RFC 9051 absorbed BINARY/BINARY.PEEK/" +
				"BINARY.SIZE into rev2 CORE FETCH data items but does NOT restate RFC 3516's per-item " +
				"definition sentence verbatim (rev2's §6.4.5 client entries are the leaf-body-part " +
				"constraint RFC9051-6.4.5-2 and the \\Seen/PEEK dichotomy RFC9051-6.4.5-3, not this " +
				"'transmitted after performing CTE-related decoding' wording), so this definition text " +
				"remains source-of-truth for both profiles — the narrow residue of the plan's 'BINARY FETCH " +
				"items standalone in rev2' framing. See module extractionNote for the full adjudication. " +
				"Testable: script a client-driven BINARY / BINARY.PEEK FETCH and verify the emitted data " +
				"item and section-binary syntax; currently self-actualizing (driver has no BINARY fetch " +
				"surface, so the exchange cannot complete).",
		},
		{
			id: "RFC3516-4.2-2",
			source: "RFC3516",
			section: "4.2",
			title: "Partial FETCH BINARY <partial> arguments refer to the DECODED section data",
			text:
				"The <partial> argument, if present, requests that a subset of the data be returned. The " +
				"semantics of a partial FETCH BINARY command are the same as for a partial FETCH BODY " +
				"command, with the exception that the <partial> arguments refer to the DECODED section data.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"§4.2. No explicit RFC 2119 keyword; level assigned MUST by judgment — 'the <partial> " +
				"arguments refer to the DECODED section data' is a hard construction/interpretation rule (a " +
				"client that computes a partial offset against the still-ENCODED octet count would request " +
				"or interpret the wrong bytes). Applicability 'conditional' — only when the client issues a " +
				"partial BINARY FETCH. REV2 SPLIT: kept profiles:[\"rev1\",\"rev2\"] for the same reason as " +
				"RFC3516-4.2-1 — rev2 core carries the BINARY data item but not this partial-semantics " +
				"definition sentence verbatim, so it remains source-of-truth for both profiles. Testable: " +
				"verify a client issuing BINARY[...]<n.m> treats offset/length against decoded-data " +
				"coordinates (and reconciles with BINARY.SIZE); currently self-actualizing (no BINARY " +
				"fetch surface).",
		},
		{
			id: "RFC3516-4.2-3",
			source: "RFC3516",
			section: "4.2",
			title: "Client SHOULD NOT needlessly issue BINARY.SIZE (potentially expensive server operation)",
			text:
				"Note: client authors are cautioned that this might be an expensive operation for some " +
				"server implementations. Needlessly issuing this request could result in degraded " +
				"performance due to servers having to calculate the value every time the request is issued.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "untestable",
			untestableTheme: "performance-expectation",
			untestableRationale:
				"'Needlessly issuing this request' binds the client's operational judgment about when the " +
				"decoded size is actually needed, not a discrete wire action: any individual BINARY.SIZE " +
				"request is syntactically legal and RFC-permitted, so a client that issues them freely " +
				"produces the same compliant wire trace as one that issues them sparingly out of genuine " +
				"need — whether a given request was 'needless' has no wire signature. Identical reasoning " +
				"to the rev2-core counterpart RFC9051-6.4.5-4 (and to RFC9051-6.3.11-3, the STATUS SIZE " +
				"caution).",
			notes:
				"§4.2, BINARY.SIZE<section-binary> data item. Judgment level: no RFC 2119 keyword — " +
				"'client authors are cautioned' + 'Needlessly issuing ... could result in degraded " +
				"performance' is read as a SHOULD-level avoid-needless-use recommendation. REV2 SPLIT: " +
				"tagged profiles:[\"rev1\"] and cross-referenced to RFC9051-6.4.5-4, which restates this " +
				"caution WORD-FOR-WORD as rev2's own core BINARY.SIZE duty (BINARY.SIZE was absorbed into " +
				"the rev2 base spec). A rev2 client scores this once, via core; it remains binding here for " +
				"a rev1 client using the BINARY extension.",
		},

		// ── §4.3 FETCH Response Extensions ──────────────────────────────────────

		{
			id: "RFC3516-4.3-1",
			source: "RFC3516",
			section: "4.3",
			title: "Client MUST accept a BINARY[...] value as either an <nstring> or a <literal8> (NUL-permitting)",
			text:
				"An <nstring> or <literal8> expressing the content of the specified section after removing " +
				"any CTE-related encoding. If <number> is present it refers to the offset within the " +
				"DECODED section data.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "testable",
			notes:
				"§4.3, the BINARY<section-binary>[<<number>>] FETCH response data item. No explicit RFC " +
				"2119 keyword in the item definition; level assigned MUST by judgment — a client that " +
				"requested BINARY[...] must be able to parse BOTH delivered literal forms: a normal " +
				"<nstring> (used, per the adjacent server SHOULD, when the 8bit data contains no NUL) AND a " +
				"<literal8> ('~{n}' framing) carrying raw octets that may include NUL. Rejecting or " +
				"mis-parsing the literal8 form breaks the extension. This entry also carries the client " +
				"HALF of the UNKNOWN-CTE duty: §4.3 says 'If the server does not know how to decode the " +
				"section's CTE, it MUST fail the request and issue a \"NO\" response that contains the " +
				"\"UNKNOWN-CTE\" extended response code' — that MUST binds the SERVER (response " +
				"generation); the client's mirror duty is simply to accept/tolerate the resulting tagged " +
				"NO carrying the UNKNOWN-CTE resp-text-code as an ordinary command failure (per RFC 3501 / " +
				"RFC 9051 'ignore/tolerate unrecognized response codes'), not cataloged as a separate " +
				"entry. Applicability 'conditional' — only when the client uses BINARY FETCH. REV2 SPLIT: " +
				"tagged profiles:[\"rev1\"] and cross-referenced to RFC9051-4.3.1-3 / RFC9051-4.3.1-4 " +
				"(rev2 core folds in the <literal8> mechanism and the explicit unencoded-binary carve-out " +
				"for BINARY/BINARY.PEEK FETCH responses) and to the rev2 core literal8 production; a rev2 " +
				"client scores the literal8-acceptance duty via core. This is the plan's 'literal8 (~{n}) " +
				"in responses → rev1+cross-ref' case. Testable: script a FETCH BINARY response delivering " +
				"the section once as an <nstring> and once as a <literal8> containing an embedded NUL and " +
				"verify the client parses both; currently self-actualizing (no BINARY fetch surface).",
		},
		{
			id: "RFC3516-4.3-2",
			source: "RFC3516",
			section: "4.3",
			title: "Client MUST read the BINARY.SIZE response as the decoded octet count",
			text:
				"Requests the decoded size of the section (i.e., the size to expect in response to the " +
				"corresponding FETCH BINARY request).",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"§4.2/§4.3, the BINARY.SIZE<section-binary> data item and its response form 'BINARY.SIZE" +
				"<section-binary> SP number' (§7 msg-att-static). No explicit RFC 2119 keyword; level " +
				"assigned MUST by judgment — a client that emits BINARY.SIZE must interpret the returned " +
				"number as the DECODED size, i.e. the octet count to expect from the corresponding FETCH " +
				"BINARY (the server-side 'The value returned MUST match the size of the <nstring> or " +
				"<literal8> ...' guarantees this correspondence; that MUST binds the server's computation, " +
				"while the client's duty is to read the value against decoded-data coordinates, e.g. when " +
				"pre-sizing a partial fetch). Applicability 'conditional' — only when the client uses " +
				"BINARY.SIZE. REV2 SPLIT: kept profiles:[\"rev1\",\"rev2\"] alongside RFC3516-4.2-1/-2 — " +
				"rev2 core carries the BINARY.SIZE data item and its expense caution (RFC9051-6.4.5-4) but " +
				"does NOT restate this decoded-size-interpretation definition sentence verbatim, so it " +
				"remains source-of-truth for both profiles. Testable: script a BINARY.SIZE response and " +
				"verify the client uses the number as the decoded length; currently self-actualizing (no " +
				"BINARY.SIZE surface).",
		},

		// ── §4.4 APPEND Command Extensions ──────────────────────────────────────

		{
			id: "RFC3516-4.4-1",
			source: "RFC3516",
			section: "4.4",
			title: "Client MAY APPEND NUL-containing data using the <literal8> (~{n}) syntax",
			text:
				"The APPEND command is extended to allow the client to append data containing NULs by using " +
				"the <literal8> syntax.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "testable",
			notes:
				"§4.4. The client-binding half of the APPEND extension: the client MAY use the <literal8> " +
				"('~{n}' CRLF *OCTET, §7) framing to transmit APPEND message data that contains NUL octets " +
				"(binary content that ordinary {n} literals cannot carry in the IMAP data model). Level MAY " +
				"— optional facility; when used, the ~{n} literal8 framing is mandatory for the NUL-bearing " +
				"payload. The trailing sentence of the same paragraph ('The server MAY modify the CTE ... " +
				"MUST NOT result in a loss of data') binds the SERVER and is excluded (see extractionNote). " +
				"The §4.4 UNKNOWN-CTE failure ('If the destination mailbox does not support the storage of " +
				"binary content, the server MUST fail the request ...') is likewise a SERVER MUST; the " +
				"client merely tolerates the tagged NO [UNKNOWN-CTE]. Applicability 'conditional' — only " +
				"when the client appends binary content. REV2 SPLIT: tagged profiles:[\"rev1\"] and " +
				"cross-referenced to RFC9051-4.3.1-3 / RFC9051-4.3.1-4 and the rev2 core literal8 " +
				"production — RFC 9051 folds the <literal8> transmission mechanism into rev2 CORE, so a " +
				"rev2 client's literal8-append duty is scored via core. This is EXACTLY the plan's " +
				"'literal8 (~{n}) transmission is in rev2 core → rev1-only + cross-ref' case. Testable: " +
				"drive an APPEND carrying a ~{n} literal8 with an embedded NUL and assert the emitted wire " +
				"framing (uses the Task-1 literal8 harness capability); currently self-actualizing (the " +
				"driver's append has no binary/literal8 surface).",
		},

		// ── §6 Implementation Considerations ────────────────────────────────────

		{
			id: "RFC3516-6-1",
			source: "RFC3516",
			section: "6",
			title: "Client supporting BINARY SHOULD be prepared to perform its own CTE decoding",
			text:
				"It does not absolve clients from providing basic functionality (content transfer decoding) " +
				"that should be available in all messaging clients. Clients supporting this extension " +
				"SHOULD be prepared to perform their own CTE decoding operations.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "untestable",
			untestableTheme: "content-processing",
			untestableRationale:
				"Whether a client is 'prepared to perform its own CTE decoding' is an internal " +
				"content-processing capability, not a wire-observable action: the BINARY extension is an " +
				"optimization that lets the SERVER pre-decode, so a compliant client that has BINARY " +
				"available may never need to exercise its own decoder on the wire, and one that lacks the " +
				"decoder is indistinguishable at the protocol level until it actually encounters " +
				"CTE-encoded content via a non-BINARY FETCH BODY — at which point the decoding happens " +
				"inside the client (or, for a protocol library, is legitimately delegated to the consuming " +
				"application by handing over the raw transfer-encoded string). No black-box exchange has a " +
				"mandated pass/fail boundary for this readiness. Same reasoning as the rev2-core " +
				"counterpart RFC9051-7.5.2-2 (client MUST decode transfer-encoded binary).",
			notes:
				"§6 Implementation Considerations. Explicit client SHOULD ('Clients supporting this " +
				"extension SHOULD be prepared to perform their own CTE decoding operations'); the leading " +
				"sentence is quoted for context (the lowercase 'should be available in all messaging " +
				"clients' is descriptive, the binding force is the capitalized SHOULD). Applicability " +
				"'conditional' — binds clients that support the BINARY extension. REV2 SPLIT: tagged " +
				"profiles:[\"rev1\"] and cross-referenced to RFC9051-7.5.2-2, where rev2 core states the " +
				"same content-processing duty as a MUST ('To derive the original binary data, the client " +
				"MUST decode the transfer-encoded string'); a rev2 client scores the decode duty via core. " +
				"The two preceding §6 paragraphs (CRLF line-termination and BODYSTRUCTURE/FETCH BODY " +
				"consistency) are SERVER MUSTs, excluded per extractionNote.",
		},
	],
};

export default rfc3516;
