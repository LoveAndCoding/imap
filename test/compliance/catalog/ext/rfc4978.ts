import type { CatalogModule } from "../types";

const rfc4978: CatalogModule = {
	source: "RFC4978",
	extractionNote:
		"RFC 4978 (The IMAP COMPRESS Extension, COMPRESS=DEFLATE) fully reviewed for " +
		"client-binding requirements. Section 1 (Introduction and Overview) contributes " +
		"one client-binding entry (1-1: MAY use either COMPRESS or TLS compression, " +
		"RECOMMENDED choose TLS when both are supported) — the sibling sentence " +
		"'IMAP servers that advertise this extension SHOULD also advertise TLS DEFLATE' " +
		"binds servers, not clients, and is out of scope. Section 2 (Conventions) is " +
		"boilerplate (RFC 2119 pointer, ABNF pointer, example-notation legend) with no " +
		"normative content of its own. Section 3 (The COMPRESS Command) is the substantive " +
		"section and contributes entries 3-1 through 3-5: the no-further-commands-until-result " +
		"pipelining duty (3-1, testable), the MUST-compress-after-OK stream switch (3-2, " +
		"untestable — harness has no DEFLATE codec), the MUST-NOT-turn-on-compression-after-" +
		"BAD-or-NO duty (3-3, testable — observable as continued plaintext traffic), and the " +
		"COMPRESS/SASL/TLS layering-order duties for the send direction (3-4) and the reversed " +
		"receive direction (3-5), both untestable for the same codec-gap reason. The 'BAD ... " +
		"or COMPRESS already active' result-code definition documents a server-side detection " +
		"outcome, not a separately phrased client MUST-NOT-send-COMPRESS-twice obligation; no " +
		"such sentence exists verbatim in the RFC, so no entry is synthesized for it beyond " +
		"3-1's general one-outstanding-COMPRESS pipelining duty, which already covers the " +
		"observable consequence (a second COMPRESS sent before the first's tagged response is " +
		"itself a 3-1 violation, and a second COMPRESS sent after a successful first would " +
		"be sent compressed, landing back in the untestable stream-framing territory of 3-2). " +
		"The two worked examples in section 3 are illustrative wire traces, not independently " +
		"quotable normative text. Section 4 (Compression Efficiency) is explicitly informative, " +
		"not normative ('This section is informative, not normative.'), and contains only MAY/" +
		"advisory implementation-tuning prose (zlib parameters, flush hints, base-64 caveats); " +
		"no RFC 2119 client MUST/SHOULD/MUST NOT duties. Section 5 (Formal Syntax) contributes " +
		"one client-binding entry (5-1: MUST accept the COMPRESS/algorithm/resp-text-code " +
		"strings case-insensitively) alongside pure ABNF productions, which are grammar, not " +
		"prose duties, and are not separately cataloged. Sections 6-9 (Security Considerations, " +
		"IANA Considerations, Acknowledgements, References, Author's Address) contain no " +
		"client-binding normative requirements — section 6 only cross-references RFC 3749's " +
		"security considerations by pointer. " +
		"HARNESS LIMITATION: the compliance driver has no DEFLATE/zlib codec on either its " +
		"client-facing or server-scripting side, so once a COMPRESS exchange completes " +
		"successfully neither side can encode or decode the compressed octet stream that " +
		"follows. Every duty whose observable core is 'what bytes appear on the wire after " +
		"the tagged OK' (starting to compress, layering compression under SASL/TLS in a " +
		"specific order, reversing that order on receipt) is therefore untestable today — not " +
		"because the duty lacks a wire signature in principle (a real DEFLATE-aware driver " +
		"could inflate the stream and assert on the plaintext it recovers), but because this " +
		"harness's instrumentation stops at the codec boundary. This is an instrumental gap, " +
		"not an intrinsic one. NEW THEME PROPOSED (not yet registered — schema is out of " +
		"scope for this extraction): 'compressed-framing-opacity', for 'the duty's observable " +
		"core is wire content that only exists once a required codec is applied, and the " +
		"harness lacks that codec.' No existing theme in " +
		"docs/superpowers/specs/2026-06-12-untestability-themes.md captures this precisely — " +
		"'environment-limit' was considered and rejected as the fit: that theme is INTRINSIC " +
		"under environment (the runtime/OS genuinely cannot negotiate a mandated mechanism, " +
		"e.g. RC4/3DES removed from OpenSSL), whereas here a DEFLATE codec is readily " +
		"available (Node's built-in zlib) and could be wired into the driver — the gap is a " +
		"driver capability gap, not an environment ceiling; mislabeling it 'environment-limit' " +
		"would misdiagnose an instrumental gap as intrinsic, the exact error the taxonomy " +
		"doc's Phase 1/Phase 2 analyses are careful to avoid. 'internal-decision' was also " +
		"rejected: that theme is about implementation choices with NO wire signature at all, " +
		"whereas compressed framing has a wire signature, just one the current driver cannot " +
		"decode. 'out-of-band' was rejected: that theme is about conduct outside the protocol " +
		"entirely, whereas this is squarely in-protocol. Pending the taxonomy update, entries " +
		"3-2, 3-4, and 3-5 below are tagged with the closest VALID existing theme, " +
		"'environment-limit', purely so the catalog schema validates today; each entry's own " +
		"untestableRationale states plainly that this is a placeholder and that the entry is " +
		"the first re-evaluation candidate once 'compressed-framing-opacity' (or an equivalent) " +
		"is added to the taxonomy.",
	requirements: [
		{
			id: "RFC4978-1-1",
			source: "RFC4978",
			section: "1",
			title: "Client MAY use COMPRESS or TLS compression; SHOULD prefer TLS if both available",
			text:
				"IMAP clients MAY use either COMPRESS or TLS compression, however, if the " +
				"client and server support both, it is RECOMMENDED that the client choose " +
				"TLS compression.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "user-intent-policy",
			untestableRationale:
				"This is a compound permission-plus-preference sentence: the MAY clause " +
				"grants pure permission (using COMPRESS at all is optional and any choice " +
				"is compliant), and the RECOMMENDED (SHOULD-level) clause binds a policy " +
				"choice between two compliant mechanisms (COMPRESS vs. TLS compression) " +
				"that depends on what the deployment/operator has configured and prefers, " +
				"not on any wire-observable pass/fail boundary — a client that chooses " +
				"COMPRESS when both are available is still a fully compliant client engaging " +
				"a fully specified extension. No black-box exchange can distinguish 'chose " +
				"COMPRESS because TLS compression was unavailable' from 'chose COMPRESS " +
				"despite TLS compression being available', and TLS compression itself is " +
				"deprecated/disabled in modern stacks (RFC 7457/9325 discourage or forbid it), " +
				"so the preference is largely moot in this environment regardless.",
			notes:
				"RECOMMENDED is treated as SHOULD-level per RFC 2119/8174. The neighboring " +
				"sentence in the same paragraph ('IMAP servers that advertise this extension " +
				"SHOULD also advertise the TLS DEFLATE compression mechanism') binds servers, " +
				"not clients, and is out of scope for this catalog.",
		},
		{
			id: "RFC4978-3-1",
			source: "RFC4978",
			section: "3",
			title: "No further commands until the COMPRESS result is seen",
			text: "The client MUST NOT send any further commands until it has seen the result of COMPRESS.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Observable at the protocol layer as a pipelining constraint: a compliant " +
				"client issuing COMPRESS DEFLATE must not have any further command bytes on " +
				"the wire until the tagged OK/NO/BAD for COMPRESS has been read. This also " +
				"forecloses sending a second COMPRESS before the first's result arrives, " +
				"which is the observable half of the 'no second COMPRESS' concern — RFC 4978 " +
				"has no separate verbatim sentence phrasing a client MUST-NOT-issue-COMPRESS-" +
				"twice duty beyond this general one-outstanding-command rule plus the BAD " +
				"result's 'COMPRESS already active' server-detection text.",
		},
		{
			id: "RFC4978-3-2",
			source: "RFC4978",
			section: "3",
			title: "Client MUST compress starting with the first command after a COMPRESS OK",
			text: "If the response was OK, the client MUST compress starting with the first command after COMPRESS.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "environment-limit",
			untestableRationale:
				"PLACEHOLDER THEME (see module extractionNote): the honest theme for this " +
				"entry is a proposed-but-unregistered 'compressed-framing-opacity' (harness " +
				"lacks a required wire-format codec); 'environment-limit' is used only " +
				"because it is the closest theme that validates against today's schema. The " +
				"observable core of this duty is the byte-level content of the client's " +
				"first command after the tagged COMPRESS OK: a compliant client's bytes are " +
				"DEFLATE-compressed octets, a non-compliant client's bytes are plaintext IMAP. " +
				"The compliance driver has no DEFLATE/zlib codec on its server-scripting side, " +
				"so it cannot inflate what it receives to verify a compressed frame arrived, " +
				"nor can it distinguish a compressed frame from noise. This is an instrumental " +
				"gap (a DEFLATE-aware driver could observe this directly, unlike a genuine " +
				"'environment-limit' entry) documented as a harness limitation, not an " +
				"intrinsic property of the duty or the environment. First re-evaluation " +
				"candidate once the driver gains a DEFLATE codec or the taxonomy gains the " +
				"proposed theme.",
		},
		{
			id: "RFC4978-3-3",
			source: "RFC4978",
			section: "3",
			title: "Client MUST NOT turn on compression after a BAD or NO COMPRESS result",
			text: "If the server response was BAD or NO, the client MUST NOT turn on compression.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Observable as the negative-space counterpart of 3-2: after a scripted " +
				"BAD or NO response to COMPRESS DEFLATE, the harness can assert that the " +
				"client's subsequent command (e.g. a NOOP used to probe liveness) arrives as " +
				"plain, parseable IMAP rather than opaque bytes — no DEFLATE codec is needed " +
				"to confirm the absence of compression, only to confirm compression's " +
				"presence (3-2's untestable direction).",
		},
		{
			id: "RFC4978-3-4",
			source: "RFC4978",
			section: "3",
			title: "Send-side layering order: compress, then SASL-sign/encrypt, then TLS-encrypt",
			text:
				"When COMPRESS is combined with TLS (see [RFC4346]) or SASL (see [RFC4422]) " +
				"security layers, the sending order of the three extensions MUST be first " +
				"COMPRESS, then SASL, and finally TLS. That is, before data is transmitted " +
				"it is first compressed. Second, if a SASL security layer has been " +
				"negotiated, the compressed data is then signed and/or encrypted accordingly. " +
				"Third, if a TLS security layer has been negotiated, the data from the " +
				"previous step is signed and/or encrypted accordingly.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "environment-limit",
			untestableRationale:
				"PLACEHOLDER THEME (see module extractionNote): the honest theme is the " +
				"proposed 'compressed-framing-opacity'; 'environment-limit' stands in only " +
				"because it validates against today's schema. Verifying this layering order " +
				"requires decoding the outermost (TLS and/or SASL security layer) wrapper and " +
				"then inflating the DEFLATE payload beneath it to confirm compression happened " +
				"before signing/encryption rather than after. The harness has no DEFLATE " +
				"codec, so even where it can terminate TLS or a SASL security layer it cannot " +
				"verify what lies beneath is a compressed stream in the mandated position. " +
				"Instrumental gap, not intrinsic — a DEFLATE-aware driver with access to the " +
				"negotiated layer secrets could peel each layer in order and assert on the " +
				"recovered plaintext. First re-evaluation candidate once the driver gains a " +
				"DEFLATE codec or the taxonomy gains the proposed theme.",
		},
		{
			id: "RFC4978-3-5",
			source: "RFC4978",
			section: "3",
			title: "Receive-side processing order MUST be the reverse of the send-side order",
			text: "When receiving data, the processing order MUST be reversed.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "environment-limit",
			untestableRationale:
				"PLACEHOLDER THEME (see module extractionNote): the honest theme is the " +
				"proposed 'compressed-framing-opacity'; 'environment-limit' stands in only " +
				"because it validates against today's schema. The receive-side counterpart of " +
				"3-4: the client must undo TLS, then SASL, then DEFLATE, in that order, when " +
				"processing server data. Confirming this requires the harness to construct a " +
				"correctly-layered compressed-then-signed-then-encrypted server response and " +
				"observe that the client successfully decodes it, which in turn requires a " +
				"DEFLATE codec the harness does not have. Instrumental gap, same as 3-4. " +
				"First re-evaluation candidate once the driver gains a DEFLATE codec or the " +
				"taxonomy gains the proposed theme.",
		},
		{
			id: "RFC4978-5-1",
			source: "RFC4978",
			section: "5",
			title: "Case-insensitive acceptance of COMPRESS/algorithm/resp-text-code strings",
			text: "Implementations MUST accept these strings in a case-insensitive fashion.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"'These strings' refers back to the COMPRESS command name, the DEFLATE " +
				"algorithm token, and the COMPRESSIONACTIVE resp-text-code defined by this " +
				"extension's ABNF (command-auth =/ compress; capability =/ 'COMPRESS=' " +
				"algorithm; resp-text-code =/ 'COMPRESSIONACTIVE'). For the client side this " +
				"binds acceptance of a server capability such as 'compress=deflate' (any " +
				"case) and of a lowercase/mixed-case 'CompressionActive' resp-text-code; both " +
				"are observable by scripting a non-canonical-case CAPABILITY response or " +
				"COMPRESS result and confirming the client still recognizes and acts on them.",
		},
	],
};

export default rfc4978;
