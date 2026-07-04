import type { CatalogModule } from "../types";

const rfc5259: CatalogModule = {
	source: "RFC5259",
	extractionNote:
		"RFC 5259 (Internet Message Access Protocol - CONVERT Extension). Full document " +
		"reviewed: Abstract, §1 Introduction, §2 Conventions Used in This Document, §3 Relation " +
		"with Other IMAP Specifications [§3.1 CAPABILITY Response], §4 Scope of Conversions, §5 " +
		"Discovery of Available Conversions [§5.1 CONVERSIONS Command, §5.2 CONVERSION Response], " +
		"§6 CONVERT and UID CONVERT Commands, §7 CONVERT Conversion Parameters [§7.1 " +
		"Mandatory-to-Implement Conversions and Conversion Parameters, §7.2 Additional Features for " +
		"Mobile Usage (informative)], §8 Request/Response Data Items to CONVERT/UID CONVERT Commands " +
		"[§8.1 CONVERTED Untagged Response, §8.2 BODYPARTSTRUCTURE CONVERT Request and Response Item, " +
		"§8.3 BINARY.SIZE CONVERT Request and Response Item, §8.4 AVAILABLECONVERSIONS CONVERT " +
		"Request and Response Item, §8.5 Implementation Considerations], §9 Status Responses and " +
		"Response Code Extensions, §10 Formal Syntax, §11 Manageability Considerations, §12 IANA " +
		"Considerations [§12.1 Registration of unknown-character-replacement Media Type Parameter], " +
		"§13 Security Considerations, §14 Acknowledgments, §15 References, Authors' Addresses, Full " +
		"Copyright Statement, Intellectual Property.\n\n" +
		"DEPLOYMENT CONTEXT (not a scoping reason): CONVERT has essentially no deployed server or " +
		"client implementations in the wild — it was designed for OMA mobile-mail transcoding " +
		"scenarios that never saw broad uptake. This is background context only; the extraction " +
		"below covers the full client-binding surface regardless, per the design's promise to " +
		"catalog every capability family's client duties whether or not it is commonly deployed.\n\n" +
		"CLIENT/SERVER SPLIT: CONVERT is overwhelmingly a SERVER-transcoding extension — almost " +
		"every normative sentence binds what the SERVER must convert, cache, log, or refuse, not " +
		"what the client does. Excluded as server-only: §3.1 the CAPABILITY-advertisement MUST " +
		"itself (server emits the token; the client's reciprocal gate is captured as " +
		"RFC5259-3.1-1); §3 'A server claiming compliance ... MUST support the IMAP Binary " +
		"specification [RFC3516]' (server prerequisite); §4 'the original data in the message " +
		"store MUST NOT be altered' (server storage integrity, not client-observable); §5.1 the " +
		"CONVERSIONS command's BAD/OK/NO result semantics belong to the server's response-generation " +
		"contract (the client-facing counterpart — emitting the command and accepting the response " +
		"forms — is captured in RFC5259-5.1-1/-2); §6 nearly every MUST in the long descriptive " +
		"passage is server transcoding-strategy guidance ('the server MAY also remove any " +
		"unnecessary detail...', 'the server should convert...to the most standard...media type', " +
		"'Servers are REQUIRED to support default conversion requests', 'the server MUST respect the " +
		"target MIME type and conversion parameters', 'Servers that support such conversions MUST " +
		"return one or more CONVERSION responses', 'the server MUST decode any encoded words...and " +
		"return them re-encoded', 'it MUST leave them as is' (undecodable words), 'Servers SHOULD " +
		"also support decoding of...RFC 2231', 'the server MUST consolidate the parameter " +
		"fragments...keep the line length less than 78', 'the server MUST result in the UID data " +
		"item' (server response-construction; the client's parse counterpart is " +
		"RFC5259-8.1-2/RFC5259-6-6), 'An EXPUNGE response MUST NOT be sent while responding to a " +
		"CONVERT command' (server emission suppression; the client never needs to special-case this " +
		"since ordinary EXPUNGE-parsing already covers the UID CONVERT exception — not a distinct " +
		"client action) — all server transcoding/response-generation duties; §7.1 all four MUSTs " +
		"('MUST support charset conversions for text/plain', 'MUST list text/plain as an allowed " +
		"destination', 'MUST support recognition of the charset parameter', 'MUST support decoding " +
		"of RFC 2047 headers') plus the fail/BADPARAMETERS MUSTs are server transcoding-capability " +
		"floors and error-generation duties, and the SHOULD ('Servers SHOULD offer additional " +
		"character encoding conversions') is server-capability guidance — none is a client action; " +
		"§7.2 is explicitly informative ('This section is informative') and server-implementor " +
		"guidance, not a client duty; §8.2 the BODYPARTSTRUCTURE-matches-BINARY MUST, the " +
		"ordering MUSTs ('the server MUST return the BODYPARTSTRUCTURE data prior to...BINARY data', " +
		"'MUST be after the UID data item'), and the MIME-type-match guarantee are server response-" +
		"construction duties (the client's reciprocal is simply accepting whatever well-formed order " +
		"the server sends — already covered by the general CONVERTED-response acceptance in " +
		"RFC5259-8.1-1, so not double-cataloged); §8.3 'The returned value MUST be exact and MUST " +
		"NOT change during a duration of an IMAP session' and the expunge-fallback MAY are server " +
		"duties (client's reciprocal no-caching-across-sessions MUST is captured as RFC5259-8.3-2); " +
		"§8.4 the subset/omission/ERROR-preference MUSTs and SHOULD are server response-construction " +
		"duties (the AVAILABLECONVERSIONS client parse duty is RFC5259-8.4-1); §8.5 'Servers MAY " +
		"refuse...' and the two MAXCONVERT* emission MUSTs are server duties (client's resp-code " +
		"parse counterpart is RFC5259-9-4/-5), and the caching/DoS-mitigation SHOULDs are pure " +
		"server-implementor guidance; §9 the BAD/NO generation SHOULD, the ERROR-phrase generation " +
		"MUST/MAY, and the 'MUST return an OK response if at least one conversion succeeds' are all " +
		"server response-generation duties (client's parse counterpart of the resp-codes/ERROR " +
		"phrase is RFC5259-9-1..7); §11 manageability guidance is entirely server-operator tooling; " +
		"§12/§12.1 IANA registration process and the registered media-feature-tag boilerplate carry " +
		"no live client duty; §13 'Server SHOULD refuse to execute CPU-expensive conversions', " +
		"'servers should avoid dangerous conversions', 'servers should perform verification...before " +
		"returning', 'servers SHOULD log the client authentication identity', 'server implementors " +
		"SHOULD isolate the conversion function' are all server-side security duties (the client-" +
		"facing security SHOULDs are captured as RFC5259-13-1/-2).\n\n" +
		"CLIENT-BINDING extracted (26 entries): §3.1 the capability-gate MUST (client MUST NOT " +
		"issue CONVERT without seeing the capability); §5.1 the CONVERSIONS command form and its " +
		"accepted result codes; §6 the single-conversion-per-command constraint (and the MAY-" +
		"pipeline allowance), the default-conversion NIL marker, the SHOULD-avoid-default-" +
		"without-capability-signaling, the \\Seen-not-set fact (client must STORE separately), the " +
		"UID CONVERT UID-sequence-argument and mandatory-UID-response-item duties, the CHARSET-" +
		"REQUIRED construction duty for BODY[...HEADER]/[...MIME] conversions, the 'no " +
		"destination MIME type MUST be specified with BODY[HEADER]/[...HEADER]/[...MIME]' " +
		"construction constraint, and the graceful-handling-of-dropped-comments duty; §7 " +
		"conversion-parameter-name case-insensitivity; §8.1 the CONVERTED untagged response " +
		"acceptance and the TAG-correlator matching duty; §8.3 the no-cross-session-result-" +
		"stability-assumption duty and the concrete no-caching/no-reuse-across-connections " +
		"prohibition; §8.4 the AVAILABLECONVERSIONS response acceptance; §9 the " +
		"TEMPFAIL/MAXCONVERTMESSAGES/MAXCONVERTPARTS tagged-NO resp-code parse duties, the " +
		"ERROR-phrase framing plus its BADPARAMETERS/MISSINGPARAMETERS shape-parsing duties, the " +
		"MAY-retry-after-TEMPFAIL allowance, and the OK-means-at-least-one-succeeded interpretation " +
		"duty; §13 the two client-facing security SHOULDs (care around requesting/processing " +
		"conversions; mutual SASL/TLS).\n\n" +
		"REV1/REV2 STANDALONE STATUS: CONVERT is not folded into IMAP4rev2 (RFC 9051) — verified by " +
		"grepping catalog/rfc9051/ for the literal token 'CONVERT' (zero matches; the extension is " +
		"absent from rev2 core). It remains a standalone extension under both profiles, so every " +
		"entry here defaults profiles: [\"rev1\",\"rev2\"]. All entries are applicability: " +
		"conditional (bind only when the client uses the CONVERT extension).\n\n" +
		"RFC 8174 discipline: RFC 5259 predates RFC 8174 and cites only RFC 2119 (§2), so lowercase " +
		"'must'/'should' were never normative here anyway; most extracted entries rest on an " +
		"UPPERCASE RFC 2119 keyword in their source sentence. Judgment-level entries (no UPPERCASE " +
		"keyword directly on the client, or an implicit reciprocal duty derived from a server-worded " +
		"MUST) are flagged in their notes: RFC5259-3.1-1 (capability-gate, derived from a server " +
		"MUST), RFC5259-5.1-1/-2 (descriptive command/response contract sentences), RFC5259-6-1 " +
		"(single-conversion-type constraint, descriptive), RFC5259-6-4 (\\Seen not set, descriptive), " +
		"RFC5259-6-5 (UID CONVERT MUST worded on the outcome, reciprocal parse duty extracted), " +
		"RFC5259-7-1 (case-insensitivity, descriptive fact citing an external registry), " +
		"RFC5259-8.1-1/-2 (descriptive response-contract and purpose-clause sentences), " +
		"RFC5259-8.4-1 (descriptive data-item definition), RFC5259-9-2/-3 (MUST worded on the " +
		"server's refusal decision, reciprocal parse duty extracted), RFC5259-9-7 (MUST/MAY worded " +
		"on the server's response choice, reciprocal interpretation duty extracted), RFC5259-13-1 " +
		"(lowercase 'should', doubly non-normative-keyword-worded).\n\n" +
		"Untestable: 5 entries — RFC5259-6-3 (SHOULD avoid default conversion without capability " +
		"signaling, internal-decision), RFC5259-6-8 (MUST gracefully handle dropped comments, " +
		"content-processing), RFC5259-8.3-1 (MUST NOT assume cross-session result stability, " +
		"internal-state), RFC5259-13-1 (clients should be careful requesting/processing " +
		"conversions, user-intent-policy), RFC5259-13-2 (SHOULD use mutual SASL/TLS to trust " +
		"servers, out-of-band — connection-security posture, not observable via the CONVERT wire " +
		"exchange itself and already the general subject of the SASL/TLS catalogs). Total: 26 " +
		"client-binding entries (RFC5259-3.1-1, RFC5259-5.1-1..2, RFC5259-6-1..8, RFC5259-7-1, " +
		"RFC5259-8.1-1..2, RFC5259-8.3-1..2, RFC5259-8.4-1, RFC5259-9-1..7, RFC5259-13-1..2).",
	requirements: [
		// ── §3.1 CAPABILITY Response ─────────────────────────────────────────────

		{
			id: "RFC5259-3.1-1",
			source: "RFC5259",
			section: "3.1",
			title: "Client MUST NOT issue CONVERT without the CONVERT capability",
			text:
				"A server that supports the CONVERT extension MUST return \"CONVERT\" and \"BINARY\" " +
				"in the CAPABILITY response or response code.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"The MUST is worded on the server (it emits both tokens together when it supports the " +
				"extension); the extracted client-binding counterpart is the capability gate: a " +
				"compliant client only issues CONVERT/UID CONVERT/CONVERSIONS after observing " +
				"\"CONVERT\" in a CAPABILITY response or response code (and can rely on \"BINARY\" " +
				"[RFC 3516] being present alongside it, since the server is required to advertise both " +
				"together). Testable black-box: a compliant client never emits CONVERT/UID " +
				"CONVERT/CONVERSIONS on a connection whose advertised capabilities lack \"CONVERT\". " +
				"Judgment call: implicit client duty derived from a server-worded MUST, following the " +
				"standard capability-gate pattern used for every other conditional extension in this " +
				"suite. Conditional; standalone in rev2 (verified absent from rfc9051 catalog), so " +
				"[\"rev1\",\"rev2\"].",
		},

		// ── §5.1 CONVERSIONS Command ─────────────────────────────────────────────

		{
			id: "RFC5259-5.1-1",
			source: "RFC5259",
			section: "5.1",
			title: "CONVERSIONS command form: source and target MIME type, wildcardable",
			text:
				"The first parameter to the CONVERSIONS command is a source MIME type, the second " +
				"parameter is the target MIME type. Both parameters are partially (e.g., \"text/*\") " +
				"or completely (\"*\") wildcardable.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: descriptive command-argument specification (source MIME type SP " +
				"target MIME type), no UPPERCASE keyword in this sentence, but it is the binding " +
				"argument contract a client constructing a CONVERSIONS command must follow — per the " +
				"ABNF (§10) 'conversions-cmd = \"CONVERSIONS\" SP from-mime-type-req SP " +
				"to-mime-type-req' where each req is 'any-mime-type / (type-name \"/\" any-mime-type) " +
				"/ concrete-mime-type' (i.e. '*', 'type/*', or 'type/subtype'). Testable black-box: a " +
				"client's emitted CONVERSIONS command carries exactly two astring arguments in that " +
				"order, each legally either a full wildcard, a type-level wildcard, or a concrete " +
				"'type/subtype'. Conditional on the client using CONVERSIONS; standalone in rev2, so " +
				"[\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5259-5.1-2",
			source: "RFC5259",
			section: "5.1",
			title: "Client MUST accept the untagged CONVERSION response (zero-or-more) to CONVERSIONS",
			text:
				"Conversions matching the source/target pair and their associated conversion " +
				"parameters are returned in untagged CONVERSION responses. If source/target doesn't " +
				"match any conversion supported by the server, no CONVERSION response is returned.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: descriptive response-contract sentence (Responses: untagged " +
				"responses: CONVERSION, per the command synopsis), no UPPERCASE keyword, but it " +
				"establishes the client's parse obligation — a client issuing CONVERSIONS must accept " +
				"zero or more untagged CONVERSION responses (per ABNF 'conversion-data = \"CONVERSION\" " +
				"SP quoted-from-mime-type SP quoted-to-mime-type [SP \"(\" transcoding-param-name " +
				"*(SP transcoding-param-name) \")\"]') before the tagged OK, including the legal " +
				"zero-response case when nothing matches. Testable black-box: script a CONVERSIONS " +
				"exchange with zero, one, and multiple untagged CONVERSION responses and assert the " +
				"client parses each without erroring. Conditional; standalone in rev2, so " +
				"[\"rev1\",\"rev2\"].",
		},

		// ── §6 CONVERT and UID CONVERT Commands ──────────────────────────────────

		{
			id: "RFC5259-6-1",
			source: "RFC5259",
			section: "6",
			title: "A single CONVERT/UID CONVERT command performs only one type of conversion",
			text:
				"Note that a single CONVERT/ UID CONVERT command can only perform a single type of " +
				"conversion as defined by the conversion parameters. A client that needs to perform " +
				"multiple different conversions needs to issue multiple CONVERT/UID CONVERT commands. " +
				"Such a client MAY pipeline them.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: the binding constraint ('can only perform a single type of " +
				"conversion', 'needs to issue multiple...commands') is descriptive rather than an " +
				"UPPERCASE keyword, but it is a hard structural limit on what a client may request in " +
				"one command; level set to MAY because the only explicit RFC 2119 keyword in the " +
				"passage is the pipelining allowance. Testable black-box: a client wanting two " +
				"different target-MIME-type/parameter conversions of the same or different body parts " +
				"issues two separate CONVERT/UID CONVERT commands (optionally pipelined) rather than " +
				"folding both into one convert-params clause. Conditional; standalone in rev2, so " +
				"[\"rev1\",\"rev2\"]. Verbatim note: the source RFC text itself contains a stray " +
				"space in 'CONVERT/ UID CONVERT' (a line-wrap artifact at the page 6/7 boundary in " +
				"the original), reproduced here exactly as published.",
		},
		{
			id: "RFC5259-6-2",
			source: "RFC5259",
			section: "6",
			title: "Client MAY use NIL as a \"default conversion\" marker instead of a specific target MIME type",
			text:
				"Instead of specifying the exact target MIME media type the client wants to convert " +
				"to, the client MAY use a special marker NIL (also known as \"default conversion\") " +
				"to request the server to pick a suitable target media type.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Explicit client MAY. Testable black-box: a client requesting default conversion " +
				"emits the literal atom NIL in place of quoted-to-mime-type in convert-params (per " +
				"ABNF 'convert-params = \"(\" (quoted-to-mime-type / default-conversion) ... \")\"' " +
				"and 'default-conversion = \"NIL\"'), not an empty string or omitted argument. " +
				"Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5259-6-3",
			source: "RFC5259",
			section: "6",
			title: "Clients SHOULD avoid default conversion unless they signal capabilities to the server",
			text:
				"Clients SHOULD avoid using the default conversion unless they provided a way " +
				"(in-band or out-band) to signal their capabilities to the server, as there is no " +
				"guaranty that the server would guess their capability correctly.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"Whether a client 'provided a way (in-band or out-band) to signal capabilities' is " +
				"itself an open-ended, out-of-band fact (device-characteristics signaling can happen " +
				"entirely outside the IMAP session, e.g. via a separate provisioning channel — 'out-" +
				"of-scope for CONVERT' per §1). A black-box observer sees only whether a given CONVERT " +
				"used NIL or a concrete MIME type; it cannot determine whether the client's choice to " +
				"use (or avoid) NIL was preceded by adequate capability signaling through some " +
				"unobservable side channel, so a matcher cannot distinguish a compliant client that " +
				"signaled capabilities before using default conversion from a non-compliant one that " +
				"guessed. This is a client policy/judgment call about when to trust server guessing, " +
				"not a wire-observable protocol action.",
			notes:
				"Explicit client SHOULD. Complements RFC5259-6-2 (the NIL mechanism itself, which is " +
				"testable); this entry is the surrounding usage guidance, which is a policy judgment " +
				"rather than a protocol action. Conditional; standalone in rev2, so " +
				"[\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5259-6-4",
			source: "RFC5259",
			section: "6",
			title: "Client must issue a separate STORE to set \\Seen, since CONVERT does not set it",
			text:
				"Note that unlike the FETCH command, the CONVERT command never sets the \\Seen flag " +
				"on converted messages. A client wishing to mark a message with the \\Seen flag would " +
				"need to issue a STORE command (possibly pipelined with the CONVERT request) to do " +
				"that.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: no UPPERCASE keyword in this sentence, but it is a hard behavioral " +
				"fact a client depends on — CONVERT/UID CONVERT never implicitly sets \\Seen (unlike " +
				"plain-text FETCH BODY[...]), so a client wanting \\Seen semantics must issue its own " +
				"STORE. Testable black-box: after a CONVERT exchange with no accompanying STORE, a " +
				"compliant client does not treat the message as having been marked \\Seen by the " +
				"CONVERT alone; when \\Seen marking is desired, the client's command stream includes an " +
				"explicit STORE (+FLAGS \\Seen) referencing the same message, not reliance on CONVERT's " +
				"side effects. Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5259-6-5",
			source: "RFC5259",
			section: "6",
			title: "UID CONVERT takes a UID sequence set and MUST include the UID data item in its response",
			text:
				"UID CONVERT takes as a parameter a sequence of UIDs instead of a sequence of message " +
				"numbers. o  UID CONVERT command MUST result in the UID data item in a corresponding " +
				"CONVERTED response.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Two-part duty mirroring UID FETCH: (1) the client-construction fact that a UID " +
				"CONVERT's sequence-set argument denotes UIDs, not message sequence numbers; (2) the " +
				"MUST is worded on the outcome ('command MUST result in') rather than the server " +
				"directly, and the client's reciprocal duty is to expect and correctly parse the UID " +
				"data item as present in every CONVERTED response to a UID CONVERT it issued. Testable " +
				"black-box: a client's UID CONVERT sequence-set argument matches previously-observed " +
				"UIDs (not MSNs) for the target messages, and the client successfully parses the UID " +
				"data item out of the resulting CONVERTED response. Conditional; standalone in rev2, " +
				"so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5259-6-6",
			source: "RFC5259",
			section: "6",
			title: "CHARSET parameter is REQUIRED for BODY[...HEADER]/BODY[...MIME] encoded-word conversions",
			text:
				"BODY[...HEADER] encoded words in the requested headers are converted to the " +
				"specified charset. The CHARSET parameter is REQUIRED for this conversion.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"'REQUIRED' is an RFC 2119 keyword (interpreted per §2's RFC 2119 incorporation); this " +
				"is the client's construction duty for requesting header-encoded-word conversion — the " +
				"convert-params clause must carry a \"CHARSET\" transcoding-param when the CONVERT " +
				"data item is BODY[HEADER], BODY[section-part.HEADER], or BODY[section-part.MIME]. The " +
				"identical sentence and REQUIRED keyword repeats verbatim for BODY[...MIME] " +
				"immediately after in the source text, so both header-conversion forms are covered by " +
				"this single entry (they impose the identical CHARSET-REQUIRED construction duty). " +
				"Testable black-box: a client's CONVERT request for a BODY[HEADER]-family data item " +
				"always includes a CHARSET transcoding parameter. Conditional; standalone in rev2, so " +
				"[\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5259-6-7",
			source: "RFC5259",
			section: "6",
			title: "No destination MIME type may be specified with BODY[HEADER]/BODY[...HEADER]/BODY[...MIME]",
			text:
				"No destination MIME type MUST be specified with BODY[HEADER], BODY[section.HEADER], " +
				"or BODY[section.MIME]. That is, BODY[HEADER], BODY[section.HEADER], or " +
				"BODY[section.MIME] can only be used with the \"default conversion\".",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Awkward phrasing ('No ... MUST be specified') that reads as a MUST NOT: a client " +
				"requesting one of the three header/MIME-parameter conversion data items must use the " +
				"NIL default-conversion marker (RFC5259-6-2) in convert-params, never a concrete " +
				"quoted-to-mime-type. Testable black-box: a CONVERT request naming BODY[HEADER], " +
				"BODY[section.HEADER], or BODY[section.MIME] always pairs with a NIL convert-params " +
				"marker, never a quoted destination MIME type. Conditional; standalone in rev2, so " +
				"[\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5259-6-8",
			source: "RFC5259",
			section: "6",
			title: "Clients MUST gracefully handle comments removed during header-parameter conversion",
			text:
				"Comments embedded like this SHOULD be preserved during conversion, but clients MUST " +
				"gracefully handle the situation where comments are removed entirely.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "content-processing",
			untestableRationale:
				"'Gracefully handle' describes the client's internal parsing/error-tolerance behavior " +
				"when consuming a converted header whose RFC 2231 parameter comments were dropped by " +
				"the server — there is no distinguishing wire artifact between a client that " +
				"'gracefully handles' the comment-free header and one that mishandles it (e.g. crashes " +
				"or corrupts its internal model): both receive the identical BODY[...MIME]/[...HEADER] " +
				"response bytes. Grace of handling is an internal robustness property observable only " +
				"through the client's own downstream behavior (e.g. UI presentation, later requests " +
				"unaffected), not through any CONVERT protocol exchange a black-box harness can " +
				"script.",
			notes:
				"Explicit client MUST, contrasted with the preceding server-directed SHOULD ('Comments " +
				"embedded like this SHOULD be preserved during conversion' — server duty, excluded). " +
				"Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},

		// ── §7 CONVERT Conversion Parameters ─────────────────────────────────────

		{
			id: "RFC5259-7-1",
			source: "RFC5259",
			section: "7",
			title: "Conversion parameter names are case-insensitive",
			text: "According to [MEDIAFEAT-REG], conversion parameter names are case- insensitive.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: descriptive fact citing the external MEDIAFEAT-REG registry, no " +
				"UPPERCASE keyword in this sentence itself, but it is a binding encoding fact for a " +
				"client constructing transcoding-param-name arguments — a client may emit a registered " +
				"feature-tag name in any case combination and the server (per the cited registry rule) " +
				"must be understood to match it case-insensitively; conversely a client's own matching " +
				"of any parameter names it echoes back or compares (e.g. against a CONVERSIONS-" +
				"discovered list) must not be case-sensitive. Testable black-box: a client sending a " +
				"known conversion parameter (e.g. \"charset\", \"CHARSET\", \"ChArSeT\") is accepted " +
				"identically; a client comparing a discovered parameter name against one it intends to " +
				"send performs a case-insensitive match. Conditional; standalone in rev2, so " +
				"[\"rev1\",\"rev2\"]. Verbatim note: the source hyphenates 'case-' at a line wrap " +
				"before 'insensitive.', reproduced here exactly as published ('case- insensitive').",
		},

		// ── §8.1 CONVERTED Untagged Response ─────────────────────────────────────

		{
			id: "RFC5259-8.1-1",
			source: "RFC5259",
			section: "8.1",
			title: "Client MUST accept the untagged CONVERTED response (successful, partial, or failed)",
			text:
				"The CONVERTED response may be sent as a result of a successful, partially " +
				"successful, or unsuccessful CONVERT or UID CONVERT command specified in Section 6.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: descriptive response-contract sentence (Responses: untagged " +
				"responses: CONVERTED, per the §6 command synopsis), no UPPERCASE keyword, but it " +
				"establishes the client's core parse obligation — a client issuing CONVERT/UID CONVERT " +
				"must accept the untagged CONVERTED response in all three outcome shapes: fully " +
				"successful (all requested data items present), partially successful (some items carry " +
				"an ERROR phrase per §9), and wholly unsuccessful (all items carry ERROR phrases, " +
				"typically alongside a tagged NO). Testable black-box: script CONVERT exchanges " +
				"producing each of the three CONVERTED shapes and assert the client parses each without " +
				"erroring. Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5259-8.1-2",
			source: "RFC5259",
			section: "8.1",
			title: "Client uses the convert correlator TAG to match a CONVERTED response to its command",
			text:
				"The label is followed by a convert correlator, which contains the tag of the command " +
				"that caused the response to be returned. This can be used by a client to match a " +
				"CONVERTED response against a corresponding CONVERT/UID CONVERT command.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: 'can be used by a client to match' is a descriptive purpose clause, " +
				"no UPPERCASE keyword, but a client that issues pipelined/concurrent CONVERT commands " +
				"has no other way to associate an untagged CONVERTED with its originating command, " +
				"making correct use of the '(TAG \"...\")' correlator (ABNF 'convert-correlator = \"(\" " +
				"\"TAG\" SP tag-string \")\"') an effectively binding parse/matching duty. Testable " +
				"black-box: pipeline two CONVERT commands with distinct tags and assert the client " +
				"attributes each CONVERTED response to the correct command via its TAG correlator, not " +
				"via response arrival order alone. Conditional; standalone in rev2, so " +
				"[\"rev1\",\"rev2\"].",
		},

		// ── §8.3 BINARY.SIZE CONVERT Request and Response Item ──────────────────

		{
			id: "RFC5259-8.3-1",
			source: "RFC5259",
			section: "8.3",
			title: "Client MUST NOT assume repeated conversions across sessions yield identical results",
			text:
				"In order to allow for upgrade of server transcoding components, clients MUST NOT " +
				"assume that repeating a particular body part conversion in another IMAP \"session\" " +
				"would yield the same result as a previous conversion of the very same body part -- " +
				"any characteristics of the converted body part might be different (format, size, " +
				"etc.).",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-state",
			untestableRationale:
				"'MUST NOT assume' governs the client's internal belief/expectation about cross-" +
				"session result stability, not an action it performs on the wire. A client that " +
				"(wrongly) assumes stability and one that (rightly) treats each session's conversion " +
				"as independent both simply issue a fresh BINARY/BINARY.SIZE/BODYPARTSTRUCTURE request " +
				"in the new session and receive whatever the server currently returns; the forbidden " +
				"assumption would only matter if the client tried to skip re-requesting and reuse a " +
				"prior result, which is exactly the caching prohibition captured separately and " +
				"testably in RFC5259-8.3-2. This entry's own text targets the belief itself, which " +
				"has no independent wire signature beyond that caching duty.",
			notes:
				"Explicit client MUST NOT. Overlaps conceptually with RFC5259-8.3-2 (the concrete " +
				"caching/reuse prohibition, which IS testable); this entry is kept separate because it " +
				"is the broader internal-assumption duty from which the caching duty is derived, and " +
				"it carries its own distinct sentence and section position. Conditional; standalone in " +
				"rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5259-8.3-2",
			source: "RFC5259",
			section: "8.3",
			title: "Client MUST NOT cache converted sizes across sessions or reuse them on another connection",
			text:
				"In particular, clients MUST NOT cache sizes of converted messages/ body parts beyond " +
				"duration of any IMAP \"session\", or use sizes obtained in one connection in another " +
				"IMAP connection to the same server.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Explicit client MUST NOT, and — unlike RFC5259-8.3-1's belief-level framing — this " +
				"sentence names a concrete, wire-observable action: a client must re-issue " +
				"BINARY.SIZE[...] (or BINARY[...]/BODYPARTSTRUCTURE[...]) in each new IMAP session/" +
				"connection rather than reusing a value obtained in a prior session or a different " +
				"connection to the same server. Testable black-box: after reconnecting (a new IMAP " +
				"'session' per RFC 3501 §1.2), a compliant client re-requests BINARY.SIZE for a body " +
				"part it previously converted rather than relying on a value cached from the earlier " +
				"connection. Conditional; standalone in rev2, so [\"rev1\",\"rev2\"]. Verbatim note: " +
				"the source reads 'messages/ body parts' with a stray space after the slash (a line-" +
				"wrap artifact), reproduced here exactly as published.",
		},

		// ── §8.4 AVAILABLECONVERSIONS CONVERT Request and Response Item ─────────

		{
			id: "RFC5259-8.4-1",
			source: "RFC5259",
			section: "8.4",
			title: "Client MUST accept the AVAILABLECONVERSIONS response item (target-MIME-type list or ERROR)",
			text:
				"AVAILABLECONVERSIONS[section-part] allows the client to request the list of target " +
				"MIME types the specified body part of a message or the whole message can be " +
				"converted to. This data item is only useful when the default conversion (see Section " +
				"6) is requested.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level: descriptive data-item definition, no UPPERCASE keyword, but it " +
				"establishes the client's request-construction and parse duties for this data item — " +
				"a client requests it via 'AVAILABLECONVERSIONS[section-part]' (ABNF 'convert-att =/ " +
				"\"AVAILABLECONVERSIONS\" section-convert' via §10) and must accept the corresponding " +
				"response item as either a (possibly empty) mimetype-list or a converterror-phrase " +
				"(ABNF 'msg-att-semistat =/ (\"AVAILABLECONVERSIONS\" section-convert SP " +
				"(mimetype-list / converterror-phrase))'). It is intended for use with NIL/default " +
				"conversion (RFC5259-6-2), so a client typically pairs it with the NIL marker. " +
				"Testable black-box: script AVAILABLECONVERSIONS responses carrying an empty list, a " +
				"populated list, and an ERROR phrase, and assert the client parses each. Conditional; " +
				"standalone in rev2, so [\"rev1\",\"rev2\"].",
		},

		// ── §9 Status Responses and Response Code Extensions ─────────────────────

		{
			id: "RFC5259-9-1",
			source: "RFC5259",
			section: "9",
			title: "Client MUST parse the TEMPFAIL tagged-NO response code and MAY retry",
			text:
				"TEMPFAIL -  The transcoding request failed temporarily.  It might succeed later, so " +
				"the client MAY retry.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Combines the resp-text-code definition (ABNF §10 'resp-text-code =/ \"TEMPFAIL\" / " +
				"...') with the explicit client MAY-retry allowance. The client's binding parse duty is " +
				"accepting a tagged NO carrying '[TEMPFAIL]' as a well-formed, retryable failure " +
				"completion of CONVERT/UID CONVERT; retrying itself is an explicit MAY, not mandatory. " +
				"Testable black-box: script a tagged NO with the TEMPFAIL response code and assert the " +
				"client completes the command as a (retryable) failure rather than erroring on the " +
				"unrecognized code. Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5259-9-2",
			source: "RFC5259",
			section: "9",
			title: "Client MUST parse the MAXCONVERTMESSAGES <number> tagged-NO response code",
			text:
				"MAXCONVERTMESSAGES <number> -  The server is unable or unwilling to convert more " +
				"than <number> messages in any given CONVERT/UID CONVERT request.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"The MUST is on the server's decision to refuse/emit (§8.5: 'the server MUST return " +
				"the MAXCONVERTMESSAGES response code'); the extracted client duty is the reciprocal " +
				"PARSE obligation — a client accepts a tagged NO carrying '[MAXCONVERTMESSAGES n]' " +
				"(ABNF 'resp-text-code =/ ... / \"MAXCONVERTMESSAGES\" SP nz-number') as a well-formed " +
				"failure and can use n to size a retry with fewer messages per request. Testable " +
				"black-box: script a CONVERT over a large sequence set answered with a tagged NO + " +
				"MAXCONVERTMESSAGES code and assert the client completes as a failure, surfacing n. " +
				"Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5259-9-3",
			source: "RFC5259",
			section: "9",
			title: "Client MUST parse the MAXCONVERTPARTS <number> tagged-NO response code",
			text:
				"MAXCONVERTPARTS <number> -  The server is unable or unwilling to convert more than " +
				"<number> body parts of a message at once in any given CONVERT/UID CONVERT request.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"The MUST is on the server's emission (§8.5: 'the server MUST return the " +
				"MAXCONVERTPARTS response code'); the extracted client duty is the reciprocal PARSE " +
				"obligation — a client accepts a tagged NO carrying '[MAXCONVERTPARTS n]' (ABNF " +
				"'resp-text-code =/ ... / \"MAXCONVERTPARTS\" SP nz-number') as a well-formed failure " +
				"and can use n to size a retry requesting fewer body parts at once. Testable black-box: " +
				"script a CONVERT requesting many body parts answered with a tagged NO + " +
				"MAXCONVERTPARTS code and assert the client completes as a failure, surfacing n. " +
				"Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5259-9-4",
			source: "RFC5259",
			section: "9",
			title: "Client MUST parse the ERROR phrase and its convert-error-code (TEMPFAIL/BADPARAMETERS/MISSINGPARAMETERS)",
			text:
				"The word ERROR is always followed by an informal human-readable descriptive text, " +
				"which is followed by the convert-error-code. The convert-error-code MUST be one of " +
				"the following:",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Text is the verbatim framing sentence and lead-in to the enumeration; the source " +
				"then lists the three forms as separate labeled items immediately below it: " +
				"'TEMPFAIL mm - ...', 'BADPARAMETERS from-concrete-mime-type to-mime-type " +
				"\"(\" transcoding-params \")\" - ...', and 'MISSINGPARAMETERS from-concrete-mime-type " +
				"to-mime-type \"(\" transcoding-params \")\" - ...' (each quoted verbatim in its own " +
				"entry: RFC5259-9-1 covers TEMPFAIL, RFC5259-9-5 covers BADPARAMETERS, RFC5259-9-6 " +
				"covers MISSINGPARAMETERS — this entry deliberately stops at the colon rather than " +
				"paraphrasing the three-item list into running prose). Per the ABNF (§10) these are " +
				"'convert-error-code = \"TEMPFAIL\" [SP nz-number] / bad-params / missing-params', " +
				"each nested inside a 'converterror-phrase = \"(\" \"ERROR\" SP convert-err-descript SP " +
				"convert-error-code \")\"' that replaces a data item's value in a semi-static msg-att " +
				"when that item's conversion failed. The client's binding parse duty is recognizing " +
				"this ERROR-phrase shape as a substitute for a data item's normal value (per §9's " +
				"structured examples) and extracting the human-readable text plus whichever of the " +
				"three error codes is present. Testable black-box: script CONVERTED responses whose " +
				"data items carry each of the three ERROR-phrase shapes and assert the client parses " +
				"them as structured failures rather than choking on the unexpected nested list. " +
				"Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5259-9-5",
			source: "RFC5259",
			section: "9",
			title: "BADPARAMETERS ERROR carries the concrete source/destination MIME types and rejected parameters",
			text:
				"BADPARAMETERS  from-concrete-mime-type to-mime-type \"(\" transcoding-params \")\" - " +
				"The listed parameters were not understood, not valid for the source/destination MIME " +
				"type pair, had invalid values or could not be honored for another reason noted in the " +
				"human-readable text that was specified after the ERROR label.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Companion detail to RFC5259-9-4, specifically for the BADPARAMETERS branch (ABNF " +
				"'bad-params = \"BADPARAMETERS\" 1*(SP (quoted-from-mime-type / nil) SP " +
				"mimetype-and-params)'); level MUST because the ABNF makes this the required shape once " +
				"BADPARAMETERS is the chosen convert-error-code (no alternate framing exists). Notably " +
				"'the from-concrete-mime-type is NIL' when the specified body part doesn't exist, and " +
				"if the client requested default conversion the to-mime-type reflects the server's " +
				"chosen destination. Client's binding duty is parsing this fixed shape (source-type-" +
				"or-NIL, destination-type, rejected-parameter list) out of a BADPARAMETERS ERROR " +
				"phrase. Testable black-box: script a BADPARAMETERS ERROR phrase (including the NIL-" +
				"source variant for a nonexistent body part) and assert the client extracts all three " +
				"fields. Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5259-9-6",
			source: "RFC5259",
			section: "9",
			title: "MISSINGPARAMETERS ERROR carries the source/destination MIME types and required parameter names",
			text:
				"MISSINGPARAMETERS  from-concrete-mime-type to-mime-type \"(\" transcoding-params \")\" " +
				"- The listed parameters are required for conversion of the specified source MIME type " +
				"to the destination MIME type, but were not seen in the request.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Companion detail to RFC5259-9-4, specifically for the MISSINGPARAMETERS branch (ABNF " +
				"'missing-params = \"MISSINGPARAMETERS\" 1*(SP quoted-from-mime-type SP " +
				"mimetype-and-missing-params)', where 'mimetype-and-missing-params' carries only " +
				"parameter NAMES, not full name/value pairs — distinct from BADPARAMETERS' " +
				"transcoding-params which include values). Level MUST because the ABNF fixes this shape " +
				"once MISSINGPARAMETERS is the chosen convert-error-code. Client's binding duty is " +
				"parsing this shape and, for a client that wants the conversion to succeed, resubmitting " +
				"CONVERT with the named parameters supplied. Testable black-box: script a " +
				"MISSINGPARAMETERS ERROR phrase (e.g. requiring CHARSET) and assert the client extracts " +
				"the source/destination types and the missing parameter-name list. Conditional; " +
				"standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5259-9-7",
			source: "RFC5259",
			section: "9",
			title: "Client MUST treat an OK completion as meaning at least one requested conversion succeeded",
			text:
				"If at least one conversion succeeds, the server MUST return an OK response. If all " +
				"conversions fail, the server MAY return OK or NO.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"The MUST/MAY are worded on the server's response-generation choice; the extracted " +
				"client duty is the reciprocal interpretation rule a client must apply when it receives " +
				"the tagged completion — an OK guarantees at least one requested data item genuinely " +
				"converted (the client must still inspect each data item for an ERROR phrase to know " +
				"which ones failed, per RFC5259-8.1-1/-9-4), while a NO does not necessarily mean every " +
				"conversion failed 'all conversions fail' is only one of the NO-eligible cases, but per " +
				"the OK-guarantee's contrapositive a NO after CONVERT() means zero conversions in this " +
				"request succeeded. Testable black-box: script a CONVERTED response with one successful " +
				"data item and one ERROR-phrase data item followed by a tagged OK, and assert the " +
				"client treats the overall command as succeeded (not erroring merely because one item " +
				"failed). Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},

		// ── §13 Security Considerations ───────────────────────────────────────────

		{
			id: "RFC5259-13-1",
			source: "RFC5259",
			section: "13",
			title: "Clients should be careful when requesting conversions or processing transformed attachments",
			text:
				"Clients should be careful when requesting conversions or processing transformed " +
				"attachments.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "user-intent-policy",
			untestableRationale:
				"'Should be careful' is an open-ended security posture, not a specific protocol action " +
				"— it covers an unenumerated range of client-side precautions (e.g. sandboxing " +
				"conversion of untrusted attachments, being wary of converted executables per the " +
				"preceding threat-model sentence about 'converting a document to a damaging " +
				"executable'). There is no wire-observable difference between a 'careful' client and a " +
				"careless one issuing the identical CONVERT command and consuming the identical " +
				"CONVERTED response; the duty is discharged (or not) entirely in the client's internal " +
				"handling of the converted payload after receipt, which a black-box IMAP harness cannot " +
				"observe.",
			notes:
				"Lowercase 'should' (pre-8174 document; §2 cites only RFC 2119, but this instance isn't " +
				"even capitalized in the source, so it is doubly non-normative-keyword-worded) — " +
				"judgment level SHOULD reflecting the clear security-advisory intent of the surrounding " +
				"paragraph. Conditional; standalone in rev2, so [\"rev1\",\"rev2\"].",
		},
		{
			id: "RFC5259-13-2",
			source: "RFC5259",
			section: "13",
			title: "Clients SHOULD use mutual SASL authentication and the SASL/TLS integrity layer to trust servers",
			text:
				"Clients SHOULD use mutual Simple Authentication and Security Layer (SASL) " +
				"authentication and the SASL/ TLS integrity layer, to make sure they are talking to " +
				"trusted servers.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "out-of-band",
			untestableRationale:
				"Whether a client established the connection using mutual SASL authentication plus a " +
				"SASL/TLS integrity layer is a fact about connection-establishment and mechanism " +
				"selection that belongs to the general SASL/TLS security posture of the client, not to " +
				"the CONVERT extension's own wire exchange — it would be re-litigating the SASL " +
				"mechanism and STARTTLS/TLS catalogs already covered elsewhere in this suite (RFC 4422 " +
				"and the TLS-related catalogs), and CONVERT's own commands/responses look identical " +
				"regardless of which authentication/security layer preceded them in the session. No " +
				"CONVERT-specific wire artifact distinguishes a client that heeded this SHOULD from one " +
				"that didn't.",
			notes:
				"Explicit client SHOULD. Cross-references the general SASL/TLS trust model rather than " +
				"introducing a CONVERT-specific duty; kept here because it is textually part of this " +
				"RFC's Security Considerations and applies specifically 'to make sure they are talking " +
				"to trusted servers' before trusting server-side conversion output. Conditional; " +
				"standalone in rev2, so [\"rev1\",\"rev2\"]. Verbatim note: the source reads " +
				"'SASL/ TLS' with a stray space after the slash (a line-wrap artifact), reproduced " +
				"here exactly as published.",
		},
	],
};

export default rfc5259;
