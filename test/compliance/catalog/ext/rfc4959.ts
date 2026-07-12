import type { CatalogModule } from "../types";

const rfc4959: CatalogModule = {
	source: "RFC4959",
	extractionNote:
		"RFC 4959 (IMAP Extension for SASL Initial Client Response / SASL-IR): full extraction. " +
		"Sections reviewed: §1 Introduction (framing only — defines the extension as present when the " +
		"server advertises \"SASL-IR\" in CAPABILITY; not itself a client duty, folded into the " +
		"applicability rationale below rather than a synthetic entry), §2 Conventions (RFC 2119 " +
		"boilerplate, no requirements), §3 IMAP Changes to the IMAP AUTHENTICATE Command: 3 entries — " +
		"the optional second-argument definition, the base64/pad-character encoding MUSTs, and the " +
		"MUST-NOT-send-unless-advertised + MUST-fall-back pair. One sentence in §3 ('decoding errors MUST " +
		"be treated as IMAP [RFC3501] would handle them...') and one in §4 ('MUST be supported by the " +
		"server') and all three MUSTs in §6 Security Considerations bind the server, not the client, and " +
		"are out of scope for this client-binding catalog. §4 Examples: illustrative only (no independent " +
		"normative content beyond what §3 already states; the wire traces corroborate the base64/'=' " +
		"encoding entry). §5 IANA Considerations: registry action, no client duty. §7 Formal Syntax: ABNF " +
		"only, no prose MUST — the grammar (`authenticate = \"AUTHENTICATE\" SP auth-type [SP (base64 / " +
		"\"=\")] *(CRLF base64)`) corroborates the §3 entries but adds no separate requirement. §8-9: " +
		"acknowledgments/references, no requirements. Coverage: every client-binding normative sentence " +
		"in RFC 4959 is captured across 3 entries; all server-binding MUSTs are deliberately excluded per " +
		"this catalog's client-binding scope.",
	requirements: [
		// ── §3 ────────────────────────────────────────────────────────────────
		{
			id: "RFC4959-3-1",
			source: "RFC4959",
			section: "3",
			title: "AUTHENTICATE accepts an optional initial-response second argument",
			text:
				'This extension adds an optional second argument to the AUTHENTICATE command that is defined in Section 6.2.2 of [RFC3501]. If this second argument is present, it represents the contents of the "initial client response" defined in Section 5.1 of [RFC4422].',
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "testable",
			notes:
				"No explicit RFC 2119 keyword; this is the definitional sentence establishing the client-" +
				"facing capability the rest of §3 regulates. Judgment: MAY, because the argument is explicitly " +
				"'optional' — sending it is a client choice, not an obligation. Applicability is conditional " +
				"because this argument only has meaning (and is only permitted, per RFC4959-3-3 below) when " +
				"the server has advertised the SASL-IR capability; RFC 4959 §1 states the extension 'is " +
				"present in any IMAP [RFC3501] server implementation which returns \"SASL-IR\" as one of the " +
				"supported capabilities in its CAPABILITY response' — that framing sentence is server-focused " +
				"scope-setting rather than an independent client duty, so it is not extracted as its own " +
				"entry; its substance is folded into this entry's conditional applicability. Testable: the " +
				"AUTHENTICATE line with a second argument (or its absence) is directly observable on the " +
				"wire. Cross-reference: RFC 9051 §6.2.2 folds this optional-second-argument grammar directly " +
				"into the core AUTHENTICATE command text (see RFC9051-6.2.2-3) rather than keeping it as a " +
				"separate SASL-IR extension — under rev2 this is core protocol, not an extension. Profiles: " +
				"rev1 only. The optional-second-argument grammar is folded into rev2 core AUTHENTICATE " +
				"(RFC9051-6.2.2-3), which is the rev2-core entry that scores this duty; scoring it under " +
				"rev2 here as well would double-count the same rev2 obligation against RFC9051-6.2.2-3 " +
				"(the same ENABLE/5161-precedent reasoning applied to the sibling entries), so this entry " +
				"is scoped rev1-only and rev2 servers that still advertise SASL-IR for backward " +
				"compatibility exercise the behavior via the rev2-core entry. Also see RFC 4422 §5.1 " +
				"(initial response definition) and RFC 4616 (PLAIN mechanism, used in this RFC's own " +
				"examples) — both still pending extraction in their own catalog files.",
		},
		{
			id: "RFC4959-3-2",
			source: "RFC4959",
			section: "3",
			title: "Client MUST base64-encode the initial response and use a pad character for zero-length responses",
			text:
				'As with any other client response, this initial client response MUST be encoded as defined in Section 4 of [RFC4648]. It also MUST be transmitted outside of a quoted string or literal. To send a zero-length initial response, the client MUST send a single pad character ("="). This indicates that the response is present, but is a zero-length string.',
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "testable",
			notes:
				"Four contiguous sentences extracted as one entry because they form a single cohesive " +
				"encoding rule for the same wire object (the initial-response argument): base64 encoding, " +
				"the outside-quoted-string-or-literal transmission form, the '=' pad-character convention " +
				"for a present-but-empty response, and the explanatory gloss on what '=' signifies. Applies " +
				"only when the client sends an initial response as part of AUTHENTICATE (the argument itself " +
				"is optional per RFC4959-3-1), hence 'conditional' — but whenever a client does send one, " +
				"these rules bind unconditionally. Testable: both the base64 payload and the literal '=' " +
				"pad-character case (§4's EXTERNAL example: 'C: A01 AUTHENTICATE EXTERNAL =') are directly " +
				"observable in the AUTHENTICATE line. Cross-reference: verbatim-equivalent to RFC9051-6.2.2-3 " +
				"('As with any other client response, the initial response MUST be encoded as base64. It " +
				"also MUST be transmitted outside of a quoted string or literal. To send a zero-length " +
				"initial response, the client MUST send a single pad character (\"=\").') — RFC 9051 §6.2.2 " +
				"folds this SASL-IR encoding rule into core AUTHENTICATE text; RFC9051-6.2.2-3's own notes " +
				"identify RFC 4959 as the rev1 source of this rule being generalized into rev2 core. Under " +
				"rev2 this is therefore not extension behavior but core protocol. Profiles: rev1 only — " +
				"the rev2 base64/'=' -pad encoding duty is scored via RFC9051-6.2.2-3 (rev2-core), so " +
				"scoring it under rev2 here as well would double-count the identical rev2 obligation " +
				"against RFC9051-6.2.2-3 (following the ENABLE/RFC 5161 precedent of scoping an " +
				"extension entry to rev1 when its duty is restated in rev2 core). This entry remains " +
				"scoped to the rev1/SASL-IR-extension framing; RFC9051-6.2.2-3 is the rev2-CORE " +
				"counterpart that carries the rev2 score.",
		},
		{
			id: "RFC4959-3-3",
			source: "RFC4959",
			section: "3",
			title: "Client MUST NOT send an initial response unless the server advertised SASL-IR, and MUST fall back to the standard exchange otherwise",
			text:
				"clients that implement this extension MUST NOT send an initial client response to servers that do not advertise the SASL-IR capability. In such a situation, clients MUST fall back to an IMAP [RFC3501] compatible mode.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "testable",
			notes:
				"Two contiguous sentences extracted as one entry: the prohibition and its mandated remedy " +
				"are two halves of the same client-side gating rule and are meaningless read apart from each " +
				"other. Mixed level (MUST NOT for the prohibition, MUST for the fallback) — recorded under " +
				"'MUST NOT' as the primary/first-stated obligation; the fallback MUST is inseparable from it " +
				"and is not a distinct testable behavior beyond 'omit the initial response and use the " +
				"standard challenge/response exchange', i.e. simply not violating the prohibition. " +
				"Applicability is conditional on the client implementing the SASL-IR extension at all (a " +
				"client that never sends initial responses trivially complies) and, within that, on whether " +
				"the server's CAPABILITY response advertised SASL-IR. Testable: whether the client sends a " +
				"second AUTHENTICATE argument is observable per-connection against a CAPABILITY response " +
				"that does or does not include SASL-IR — this is a self-actualizing, unimplemented-today " +
				"assertion the compliance suite can drive by controlling the server's advertised capability " +
				"list. Cross-reference: this is the client-binding duty that has no direct rev2-CORE " +
				"restatement in RFC 9051 §6.2.2 (RFC9051-6.2.2-3's notes describe the initial response as " +
				"remaining OPTIONAL per the Arguments listing but do not restate a MUST-NOT-if-unadvertised " +
				"gate, since in rev2 core AUTHENTICATE always accepts the optional argument regardless of " +
				"any SASL-IR capability advertisement) — under rev2 this MUST NOT is specific to rev1/SASL-IR " +
				"deployments and does not carry forward as a rev2 CORE obligation, which is exactly the " +
				"'folded into core, no longer a separate extension gate' point noted in RFC9051-6.2.2-3. " +
				"Profiles: rev1 only. Unlike RFC4959-3-1/-3-2 (whose duties ARE restated in rev2 core at " +
				"RFC9051-6.2.2-3 and so are scoped rev1-only to avoid double-scoring that rev2-core entry), " +
				"this MUST-NOT-unless-advertised gate has NO rev2-core restatement at all: rev2 core " +
				"AUTHENTICATE accepts the optional initial response unconditionally, with no " +
				"advertise-SASL-IR precondition, so this is a rev1/SASL-IR-extension-only duty that " +
				"genuinely does not exist under rev2 — hence rev1-only, and there is no rev2 entry that " +
				"carries an equivalent score. " +
				"Also see RFC 4422 (SASL framework this extension layers on) and RFC 4616 (PLAIN mechanism " +
				"used in this RFC's own worked examples), both still pending extraction in their own catalog " +
				"files.",
		},
	],
};

export default rfc4959;
