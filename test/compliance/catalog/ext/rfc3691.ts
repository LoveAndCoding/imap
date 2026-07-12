import type { CatalogModule } from "../types";

const rfc3691: CatalogModule = {
	source: "RFC3691",
	extractionNote:
		"RFC 3691 (IMAP UNSELECT command): full extraction, added by M2.12 (the modern-API M2 " +
		"mailbox-management milestone's suite-growth task — this source was previously carried in " +
		"registry-coverage.ts as a documented out-of-scope borderline judgment from Phase 6, now " +
		"promoted to cataloged). Every quote was mechanically verified as a whitespace-flattened " +
		"verbatim substring of the RFC text (page furniture stripped) per the suite's standing " +
		"extraction rule. Sections reviewed: Abstract (restates §1, no independent normative " +
		"content). §1 Introduction: motivation prose (the SELECT-nonexistent-mailbox / re-EXAMINE " +
		"workarounds, the CLOSE contrast '[IMAP4] defines the CLOSE command that closes the selected " +
		"mailbox as well as permanently removes all messages with the \\Deleted flag set.', and " +
		"'However [IMAP4] lacks a command that simply closes the mailbox without expunging it. This " +
		"document defines the UNSELECT command for this purpose.') plus two normative-bearing " +
		"sentences: the capability-advertisement sentence, extracted as the derived client gate " +
		"RFC3691-1-1, and the RFC 2119 [KEYWORDS] boilerplate (interpretation rule, not cataloged). " +
		"§2 UNSELECT Command: the document's substantive section — 2 entries. The Arguments/" +
		"Responses/Result header block ('Arguments: none', 'Responses: no specific responses for " +
		"this command', and the OK/BAD Result lines) yields the command-form/valid-state duty " +
		"RFC3691-2-1; the semantics paragraph ('frees server's resources... same actions as CLOSE, " +
		"except that no messages are permanently removed') is RFC3691-2-2. The worked example " +
		"('C: A341 UNSELECT' / 'S: A341 OK Unselect completed') corroborates the bare-command form, " +
		"no independent requirement. §3 Security Considerations: 'It is believed that this extension " +
		"doesn't raise any additional security concerns not already discussed in [IMAP4].' — no " +
		"requirements. §4 Formal Syntax: 1 entry (RFC3691-4-1, the explicit case-insensitive-" +
		"acceptance MUST); the ABNF production `command-select /= \"UNSELECT\"` corroborates " +
		"RFC3691-2-1's selected-state-only placement (command-select is the selected-state command " +
		"production) and adds no separate prose requirement, per the RFC8437 §6 treatment of the " +
		"identical construction. §5 IANA Considerations: registry action ('This document defines the " +
		"UNSELECT IMAP capabilities. IANA has added this capability to the registry.'), no client " +
		"duty. §6 Acknowledgments, §7 Normative References, §8 Author's Address, §9 Full Copyright " +
		"Statement / Intellectual Property / Acknowledgement: administrative, no requirements. " +
		"PROFILE TREATMENT (adjudicated per entry, following the ENABLE/RFC 5161 and SASL-IR/RFC " +
		"4959 precedents for extensions absorbed into rev2 core — UNSELECT is an extension under " +
		"rev1 and a BASE command under IMAP4rev2, absorbed as RFC 9051 §6.4.2): RFC3691-2-2's duty " +
		"is restated near-word-for-word by rev2 core as RFC9051-6.4.2-1 ('frees a session's " +
		"resources' vs this document's 'frees server's resources'), so it is tagged profiles: " +
		"[\"rev1\"] to avoid double-scoring the identical rev2 obligation (the rev2 baseline is " +
		"scored via RFC9051-6.4.2-1). RFC3691-1-1 (issue only when the UNSELECT capability is " +
		"advertised) has NO rev2 counterpart at all — under rev2 the command is base protocol, " +
		"available without any capability gate, exactly the RFC4959-3-3 pattern of an extension-" +
		"gating duty that genuinely does not exist under rev2 — so it is rev1-only with no rev2 " +
		"entry carrying an equivalent score. RFC3691-2-1 (bare argument-less form, selected state " +
		"only) and RFC3691-4-1 (case-insensitive token acceptance) have no cataloged RFC 9051 " +
		"restatement (the rfc9051 catalog's §6.4.2 extraction carries only the semantics entry, and " +
		"9051's general atom case-insensitivity has no UNSELECT-token-specific entry — the " +
		"RFC6851-5-1/RFC4978-5-1 precedent), so both remain source-of-truth for both profiles: " +
		"[\"rev1\",\"rev2\"]. APPLICABILITY: every entry is 'conditional' — the duties bind only " +
		"when the client uses UNSELECT (per the settled scoring model an unimplemented conditional " +
		"duty still counts against this source's own score). TESTABILITY: all 4 entries are " +
		"testable; none is untestable (no untestableTheme needed). The client has no UNSELECT " +
		"surface today — driver.unselect() (test/compliance/driver/driver.ts) throws " +
		"NotImplementedError, as does driver.select(), so the command-driving entries are scripted " +
		"as self-actualizing exchanges failing 'unimplemented' until M2.13 lands the verb; " +
		"RFC3691-4-1 is real signal today via the capability-registry path (hasCapability), and " +
		"RFC3691-1-1's prohibition half is observable today via the transcript guard.",
	requirements: [
		// ── §1 Introduction ──────────────────────────────────────────────────────
		{
			id: "RFC3691-1-1",
			source: "RFC3691",
			section: "1",
			title: "Client issues UNSELECT only when the server has advertised the UNSELECT capability",
			text:
				"A server which supports this extension indicates this with a capability name of " +
				'"UNSELECT".',
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "testable",
			notes:
				"No RFC 2119 keyword; the sentence states how support is indicated, and the derived " +
				"client duty (judgment call, implicit MUST per RFC 8174 practice) is the gate: a " +
				"client MUST NOT issue UNSELECT to a server that has not indicated support via the " +
				"UNSELECT capability, since the command is otherwise not part of the server's " +
				"accepted grammar and invites a BAD. This is the same by-elimination gating pattern " +
				"as RFC8437-3-1 (UNAUTHENTICATE only when advertised), except RFC 3691 carries the " +
				"advertisement fact in §1 rather than in the BAD-condition list. PROFILES: rev1-only, " +
				"per the RFC4959-3-3 precedent — under IMAP4rev2 UNSELECT is a BASE command (RFC 9051 " +
				"§6.4.2), available with no capability gate, so this extension-gating duty genuinely " +
				"does not exist under rev2 and there is no rev2 entry that carries an equivalent " +
				"score. Conditional: binds only a client that uses UNSELECT at all. Testable both " +
				"ways: negatively (no UNSELECT bytes on a session whose CAPABILITY omitted it — " +
				"observable today via the transcript) and positively (the M2.13 implementation gate: " +
				"unselect() rejects with zero bytes written when unadvertised). driver.unselect() " +
				"throws NotImplementedError today.",
		},

		// ── §2 UNSELECT Command ──────────────────────────────────────────────────
		{
			id: "RFC3691-2-1",
			source: "RFC3691",
			section: "2",
			title: "UNSELECT takes no arguments and is issued only while a mailbox is selected",
			text:
				"Result: OK - unselect completed, now in authenticated state BAD - no mailbox " +
				"selected, or argument supplied but none permitted",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Quoted from the §2 command header block (whitespace-flattened per the suite's " +
				"mechanical-verification convention); the same block also states 'Arguments: none' " +
				"and 'Responses: no specific responses for this command'. No RFC 2119 keyword — the " +
				"BAD line is phrased as the server's result, but by elimination (the RFC8437-3-1 " +
				"precedent: an exhaustive BAD-condition list establishes the client's implicit " +
				"precondition duty, judged MUST per RFC 8174) a compliant client issues UNSELECT " +
				"(a) as the bare atom with no argument of any kind and (b) only while a mailbox is " +
				"selected — issuing it otherwise is a client protocol violation the server is " +
				"entitled to reject with BAD. The §4 ABNF corroborates both halves: `command-select " +
				"/= \"UNSELECT\"` places the command in the selected-state production with no " +
				"argument slot, and the §2 example shows the bare form ('C: A341 UNSELECT' / " +
				"'S: A341 OK Unselect completed'). PROFILES: both — the rfc9051 catalog's §6.4.2 " +
				"extraction (RFC9051-6.4.2-1) carries only the deselect-without-expunge semantics, " +
				"not this arguments/valid-state duty, so there is no rev2-core entry to double-score " +
				"against and this document remains source-of-truth for both profiles (the " +
				"RFC5161-3.1-3/RFC5161-3.2-1 pattern). Conditional: binds only when the client uses " +
				"UNSELECT. Self-actualizing fail today: driver.unselect() (and driver.select()) throw " +
				"NotImplementedError, so the client cannot emit the form at all.",
		},
		{
			id: "RFC3691-2-2",
			source: "RFC3691",
			section: "2",
			title: "UNSELECT deselects like CLOSE but without permanently removing messages",
			text:
				"The UNSELECT command frees server's resources associated with the selected mailbox " +
				"and returns the server to the authenticated state. This command performs the same " +
				"actions as CLOSE, except that no messages are permanently removed from the " +
				"currently selected mailbox.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "testable",
			notes:
				"§2 contains no RFC 2119 keywords; judgment call on level, following the " +
				"RFC9051-6.4.2-1 precedent (which catalogs rev2's near-identical restatement of this " +
				"very paragraph) for definitional alternatives treated as architectural invariants: " +
				"UNSELECT is the only command that leaves the selected state without either expunging " +
				"(CLOSE) or selecting/examining another mailbox, so a client that deselects while " +
				"preserving \\Deleted messages MUST use UNSELECT rather than CLOSE, and after the " +
				"tagged OK MUST treat the session as back in the authenticated state (the OK Result " +
				"line: 'OK - unselect completed, now in authenticated state') with no expunge having " +
				"occurred and no untagged expunge-style responses expected ('Responses: no specific " +
				"responses for this command'). PROFILES: rev1-only — RFC 9051 §6.4.2 absorbs UNSELECT " +
				"into the rev2 base spec and RFC9051-6.4.2-1 quotes the same duty near-word-for-word " +
				"(9051 substitutes 'a session's resources' for this document's 'server's resources'), " +
				"so scoring it under rev2 here as well would double-count the identical rev2 " +
				"obligation; per the ENABLE/RFC 5161 precedent this entry is scoped to the rev1/" +
				"extension framing and RFC9051-6.4.2-1 carries the rev2 score. Conditional: binds " +
				"when the client deselects intending not to expunge. Testable: drive the deselect-" +
				"without-expunge path and assert UNSELECT (not CLOSE) is emitted, no EXPUNGE " +
				"accompanies the tagged OK, and the client treats itself as deselected; currently " +
				"self-actualizing fail (driver.unselect()/driver.select() throw NotImplementedError).",
		},

		// ── §4 Formal Syntax ─────────────────────────────────────────────────────
		{
			id: "RFC3691-4-1",
			source: "RFC3691",
			section: "4",
			title: "Case-insensitive acceptance of the UNSELECT strings",
			text: "Implementations MUST accept these strings in a case-insensitive fashion.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"'These strings' are the token strings this document's §4 ABNF defines — the " +
				"UNSELECT atom (`command-select /= \"UNSELECT\"`) and, by the same rule, the " +
				"UNSELECT capability name; §4's preceding sentence gives the context: 'The use of " +
				"upper or lower case characters to define token strings is for editorial clarity " +
				"only.' For the client side this binds acceptance of a server-advertised UNSELECT " +
				"capability atom in any case (e.g. a CAPABILITY line listing 'unselect' or " +
				"'Unselect'), which the client must recognize as the UNSELECT capability. PROFILES: " +
				"kept [\"rev1\",\"rev2\"] per the RFC6851-5-1/RFC4978-5-1 precedent for extension " +
				"case-insensitivity entries — RFC 9051 carries a general case-insensitivity rule for " +
				"command atoms but no UNSELECT-token-specific entry this would double-score against, " +
				"and rev2 servers may still advertise the UNSELECT token for rev1 compatibility. " +
				"Conditional: relevant when the client uses the UNSELECT extension. Testable as REAL " +
				"signal today: advertise 'unselect' in non-canonical case in a CAPABILITY response " +
				"and confirm the client recognizes the capability (the capability registry is " +
				"queried case-insensitively via the public hasCapability path).",
		},
	],
};

export default rfc3691;
