import type { CatalogModule } from "../types";

const rfc7677: CatalogModule = {
	source: "RFC7677",
	extractionNote:
		"Full pass over RFC 7677 (SCRAM-SHA-256 and SCRAM-SHA-256-PLUS) for CLIENT-binding " +
		"deltas over RFC 5802 ONLY, per this phase's explicit scope note ('the SHA-256 " +
		"deltas ONLY... cross-reference RFC5802 ids, do NOT duplicate the exchange " +
		"duties'). RFC 7677 §3 states its core substitution as 'defined in the same way ' " +
		"as SCRAM-SHA-1/-PLUS 'except that the hash function ... uses SHA-256 instead of " +
		"SHA-1' — every client-first-message/client-final-message shape, attribute-order, " +
		"gs2-header/channel-binding-flag selection, nonce-composition/verification, " +
		"username SASLprep/escaping, server-signature-verification, extension-handling, " +
		"and formal-syntax duty already catalogued in rfc5802.ts (RFC5802-5-*, -5.1-*, -6-*, " +
		"-6.1-*, -7-*, -3-*) therefore applies to SCRAM-SHA-256(-PLUS) unchanged and is " +
		"deliberately NOT re-extracted here; those ids are the authoritative source for " +
		"this mechanism too. §1 (Introduction) is motivational/scene-setting ('SHA-256 has " +
		"stronger security properties than SHA-1... greater predicted longevity'), no " +
		"independent client duty, skipped. §2 (Key Word Definitions) is the standard RFC " +
		"2119 boilerplate, skipped. §3 (SCRAM-SHA-256 and SCRAM-SHA-256-PLUS) contributes " +
		"the two genuine deltas: the hash-function substitution itself, which is not a " +
		"separately testable prose duty (it is a computation-selection fact realized " +
		"entirely through the already-catalogued RFC5802-5.1-12 ClientProof/RFC5802-5-3 " +
		"ServerSignature-verification duties, just with HMAC-SHA-256/SHA-256 substituted " +
		"for HMAC-SHA-1/SHA-1 — captured in entry 3-1's notes as a computation-parameter " +
		"delta, not a new obligation), and the iteration-count-minimum guidance (entry 3-1, " +
		"a server-directed SHOULD the client only consumes as an opaque 'i=' value with no " +
		"independent client-observable duty beyond what RFC5802-5.1-12's ClientProof " +
		"computation already covers — recorded here per the design's explicit scope-table " +
		"inclusion of 'iteration-count minimum 4096' as a named delta item, distinguishing " +
		"the SHOULD's textual existence from any new client behavior it would require). The " +
		"example authentication exchange (SCRAM-SHA-256, username 'user'/password 'pencil') " +
		"is illustrative, non-normative, skipped. §4 (Security Considerations) restates " +
		"'the security considerations from [RFC5802] still apply' (a pointer, not new " +
		"content, skipped) and contributes the -PLUS variant's genuine new client MUST: the " +
		"triple-secure-use condition — extended-master-secret/session-hash negotiation or " +
		"no session resumption — required for SCRAM-SHA-256-PLUS AND retroactively for the " +
		"original SCRAM-SHA-1-PLUS (entry 4-1, the '-PLUS variant note' the task scope calls " +
		"out by name). The remainder of §4 (rule-of-thumb iteration-count timing " +
		"commentary, mobile-performance caveat, ClientKey-caching-avoids-recomputation " +
		"observation) is exposition/rationale with no independent RFC 2119 keyword beyond " +
		"the SHOULD already captured in entry 3-1 and the already-catalogued RFC5802-5.1-7's " +
		"caching-MAY note in the parent module; not re-extracted. §5 (IANA Considerations) " +
		"and its sub-sections (registry-template updates, the new 'SASL SCRAM Family " +
		"Mechanisms' registry, minimum-iteration-count/OID field additions) are IANA-" +
		"registrant process text, not client behavior, skipped in full. §6 (References) and " +
		"the Acknowledgements/Author's Address are bibliographic/administrative, skipped. " +
		"Cross-references: RFC 5802 (the base mechanism this document updates per its own " +
		"'Updates: 5802' header — every exchange-shape, message-encoding, and channel-" +
		"binding duty from rfc5802.ts carries over verbatim to SCRAM-SHA-256(-PLUS), " +
		"substituting the hash function per entry 3-1); RFC 6234 (SHA-256 algorithm " +
		"definition, referenced but not itself a client-duty source — the client either " +
		"correctly implements the substituted hash function per entry 3-1 or it does not, " +
		"testable the same way as RFC5802-5.1-12's ClientProof entry); RFC 7627 (TLS session-" +
		"hash extension whose absence-of-negotiation is the condition entry 4-1's session-" +
		"resumption clause reacts to).",
	requirements: [
		// ── §3 SCRAM-SHA-256 and SCRAM-SHA-256-PLUS ─────────────────────────────
		{
			id: "RFC7677-3-1",
			source: "RFC7677",
			section: "3",
			title: "SCRAM-SHA-256(-PLUS) is SCRAM-SHA-1(-PLUS) with SHA-256 substituted for HMAC()/H(), servers SHOULD announce iteration-count >= 4096",
			text:
				"The SCRAM-SHA-256 and SCRAM-SHA-256-PLUS SASL mechanisms are defined in the " +
				"same way that SCRAM-SHA-1 and SCRAM-SHA-1-PLUS are defined in [RFC5802], " +
				"except that the hash function for HMAC() and H() uses SHA-256 instead of " +
				"SHA-1 [RFC6234]. ... For the SCRAM-SHA-256 and SCRAM-SHA-256-PLUS SASL " +
				"mechanisms, the hash iteration-count announced by a server SHOULD be at " +
				"least 4096.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Two sentences bundled as one entry: the first is the mechanism-definition-" +
				"by-reference sentence fixing the hash-function substitution (no explicit " +
				"keyword, judgment call to MUST — a client using any hash function other than " +
				"SHA-256 for HMAC()/H() when it has negotiated AUTH=SCRAM-SHA-256(-PLUS) is " +
				"not performing this mechanism, exactly mirroring the RFC5802-5.1-12/RFC5802-" +
				"3-1 computation duties this delta modifies); the second is the server-" +
				"directed iteration-count SHOULD, included per the task scope's explicit " +
				"'iteration-count minimum 4096' delta item even though it binds server " +
				"announcement behavior rather than an independent client action — the client's " +
				"own observable duty is unchanged from RFC5802-5.1-12 (compute ClientProof " +
				"using whatever 'i=' the server sent), so this entry's testable core is " +
				"specifically the hash-substitution half. Applicability conditional on the " +
				"client having negotiated AUTH=SCRAM-SHA-256 or AUTH=SCRAM-SHA-256-PLUS " +
				"(neither implemented today, per RFC5802.ts's SASL-family-unimplemented note). " +
				"Testable once SCRAM-SHA-256 is implemented: repeat the RFC5802-5.1-12 " +
				"ClientProof-derivation test with a reference SHA-256-based HMAC/PBKDF2-style " +
				"computation instead of SHA-1, and assert the client's 'p=' ClientProof value " +
				"matches; separately, given the RFC's own worked example (client-first-message " +
				"'n,,n=user,r=rOprNGfwEbeRWgbNEkqO', server-first-message 'r=" +
				"rOprNGfwEbeRWgbNEkqO%hvYDpWUa2RaTCAfuxFIlj)hNlF$k0,s=W22ZaJ0SNY7soEsUEjb6gQ==," +
				"i=4096', password 'pencil'), the derived 'p=' should equal " +
				"'dHzbZapWIk4jUhN+Ute9ytag9zjfMHgsqmmiz7AndVQ=' and the server's 'v=' should " +
				"verify as 'v=6rriTRBi23WpRR/wtup+mMhUZUn/dB5nLTJRsjl95G4=' per the RFC's own " +
				"example exchange, giving the harness a ready-made fixed-vector cross-check.",
		},

		// ── §4 Security Considerations ──────────────────────────────────────────
		{
			id: "RFC7677-4-1",
			source: "RFC7677",
			section: "4",
			title: "-PLUS variant MUST be used over a TLS channel with session-hash negotiated, or session resumption MUST NOT have been used",
			text:
				"To be secure, either SCRAM-SHA-256-PLUS and SCRAM-SHA-1-PLUS MUST be used " +
				"over a TLS channel that has had the session hash extension [RFC7627] " +
				"negotiated, or session resumption MUST NOT have been used.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"The '-PLUS variant note' the task scope calls out by name — a genuine new " +
				"client-binding duty introduced by this document, applying retroactively to " +
				"the original RFC 5802 SCRAM-SHA-1-PLUS mechanism as well as the newly-defined " +
				"SCRAM-SHA-256-PLUS (this document 'Updates: 5802', and this sentence is the " +
				"concrete update: RFC 5802 itself never mentions TLS session-hash/extended-" +
				"master-secret at all). Disjunctive MUST: either (a) the client confirms the " +
				"underlying TLS channel negotiated the RFC 7627 session-hash/extended-master-" +
				"secret extension before using a -PLUS channel-binding mechanism, or (b) the " +
				"client confirms the TLS session in use is NOT a resumed session (since " +
				"resumption without the extension is exactly the vulnerable configuration " +
				"[RFC7627] identifies). Applicability conditional on the client both " +
				"implementing TLS channel binding and selecting a -PLUS mechanism variant " +
				"(neither implemented today). Testable once channel binding and TLS-session-" +
				"introspection are implemented: script a TLS server/session that completed " +
				"session resumption without extended-master-secret negotiation, and assert " +
				"the client refuses to proceed with SCRAM-SHA-256-PLUS/SCRAM-SHA-1-PLUS over " +
				"that connection (e.g. falls back to the non-PLUS variant or aborts) rather " +
				"than trusting a channel-binding value derived from a TLS channel vulnerable " +
				"to the RFC 7627 triple-handshake-class attack.",
		},
	],
};

export default rfc7677;
