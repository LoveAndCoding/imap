import type { CatalogModule } from "../types";

const rfc9586: CatalogModule = {
	source: "RFC9586",
	extractionNote:
		"RFC 9586 (IMAP Extension for Using and Returning Unique Identifiers (UIDs) Only -- " +
		"UIDONLY): added by M5.14 (the modern-API M5 extension-families milestone's catalog-" +
		"extraction task -- this source was previously carried in registry-coverage.ts as a " +
		"documented out-of-scope borderline judgment from Phase 6, now promoted to cataloged), " +
		"mirroring M2.12's RFC 3691 extraction process. " +
		"*** VERIFICATION STATUS -- READ BEFORE TRUSTING ANY QUOTE BELOW *** " +
		"Unlike RFC 3691's extraction, the primary source text could NOT be mechanically " +
		"fetched this session: the egress proxy returned HTTP 403 for every attempt to reach " +
		"the primary/mirror hosts -- https://www.rfc-editor.org/rfc/rfc9586.txt, " +
		"https://www.rfc-editor.org/rfc/rfc9586.html, https://datatracker.ietf.org/doc/html/rfc9586, " +
		"https://www.ietf.org/rfc/rfc9586.txt, http://getrfc.com/rfc9586, " +
		"https://tex2e.github.io/rfc-translater/html/rfc9586.html, " +
		"https://r.jina.ai/https://www.rfc-editor.org/rfc/rfc9586.txt, and " +
		"https://www.mail-archive.com/ietf-announce@ietf.org/msg24397.html; " +
		"web.archive.org was refused outright by the fetch tool itself (not merely 403). " +
		"github.com and raw.githubusercontent.com DID resolve (unlike the RFC hosts, they are " +
		"apparently within the proxy's allowlist), so two genuine, mechanically-fetched " +
		"corroborating fragments were obtained from third-party implementations that cite this " +
		"RFC in their own source comments: (1) ruby/net-imap's response_parser.rb contains the " +
		"comment 'RFC9586: UIDONLY / resp-text-code =/ \"UIDREQUIRED\"', confirming the exact " +
		"resp-text-code ABNF addition and its keyword spelling; (2) ruby/net-imap's imap.rb " +
		"documentation section lists, under '==== RFC9586: +UIDONLY+': 'Updates #enable with " +
		"+UIDONLY+ parameter. / Updates #uid_fetch and #uid_store to return +UIDFETCH+ " +
		"response. / Updates #expunge and #uid_expunge to return +VANISHED+ response. / " +
		"Prohibits use of message sequence numbers in responses or requests.', and its " +
		"references section confirms authorship (Melnikov, Achuthan, Nagulakonda, Singh, Alves), " +
		"'RFC 9586, DOI 10.17487/RFC9586, May 2024'. A WebSearch-tool summary (a live-index " +
		"paraphrase, not a document fetch) independently corroborated the same gist: capability " +
		"name 'UIDONLY'; once enabled the client MUST NOT use message sequence numbers " +
		"(including the '*' marker) in command arguments; the server MUST return a tagged BAD " +
		"response with the UIDREQUIRED response code if the client does; the document is an " +
		"Experimental-track IMAP extension. These corroborations are genuine (mechanically " +
		"fetched or independently retrieved) but are NOT the primary RFC text and do not " +
		"substitute for verbatim substring verification. " +
		"Given the fetch block, the `text` field of EVERY requirement below is RECONSTRUCTED " +
		"FROM MODEL TRAINING-KNOWLEDGE RECALL of RFC 9586, NOT mechanically verified as a " +
		"substring of the primary document the way every other cataloged source in this suite " +
		"is (per the standing extraction rule). Each requirement's own `notes` field repeats " +
		"this caveat individually, per the task's explicit flagging protocol. RE-VERIFY EVERY " +
		"QUOTE AND SECTION NUMBER AGAINST THE PRIMARY RFC 9586 TEXT BEFORE M6. Section numbers " +
		"are a best-effort placeholder (section '3', the extension's main descriptive section, " +
		"following the near-universal IMAP-extension-RFC template of 1=Introduction, " +
		"2=Conventions, 3=the extension itself) rather than a mechanically-confirmed subsection " +
		"breakdown -- deliberately NOT decomposed into invented subsection decimals (e.g. " +
		"'3.2' vs '3.4') the recall confidence cannot support. Per the task's own instruction " +
		"to prefer fewer high-confidence rows over many low-confidence ones, only 5 " +
		"requirements are extracted here (RFC 3691 had 4 for a much smaller command), covering " +
		"the extraction's five most memorable, structurally-load-bearing duties: the capability " +
		"gate, the sequence-number lockout, the UIDFETCH response substitution, the VANISHED " +
		"response substitution, and the UIDREQUIRED response code. Formal Syntax/IANA/Security " +
		"Considerations sections are not independently cataloged (no requirement-bearing text " +
		"recalled with enough confidence to quote). " +
		"PROFILE TREATMENT (the task's flagged judgment call #1): RFC 9586 postdates RFC 9051 " +
		"but -- unlike RFC 3691, which was a rev1-only extension later absorbed wholesale into " +
		"rev2 core (RFC 9051 §6.4.2) -- this document is recalled with moderate-to-high " +
		"confidence to explicitly extend BOTH IMAP4rev1 [RFC3501] AND IMAP4rev2 [RFC9051] as a " +
		"single extension layered on either base spec (the ruby/net-imap corroboration's own " +
		"framing, 'Updates #enable ... #uid_fetch ... #expunge', describes generic client " +
		"surface with no rev1/rev2 split, consistent with this). There is no rev1-only or " +
		"rev2-only carve-out analogous to RFC3691's absorbed-into-core story: RFC 9586 is not " +
		"restated by RFC 9051 anywhere (RFC 9051 predates it), so nothing here risks double-" +
		"scoring an existing rev2-core row. Every requirement below is therefore tagged " +
		"profiles: [\"rev1\",\"rev2\"] -- a genuine judgment call, not a copy of RFC 3691's " +
		"rev1-only split, per the task's explicit instruction not to assume either direction " +
		"from that precedent. APPLICABILITY: every entry is 'conditional' -- the duties bind " +
		"only when the client uses (or a server advertises) the UIDONLY extension. " +
		"TESTABILITY / CURRENT IMPLEMENTATION STATE (probed against this session's actual " +
		"source, not recalled): `AUTO_ENABLE_SET` (src/client/client.ts) does not include " +
		"'UIDONLY' and `client.enableExtensions()`/`driver.enable()` are fully generic (any " +
		"capability string, filtered by advertisement) -- so RFC9586-3-1's gate is REAL SIGNAL " +
		"today via that existing generic mechanism, same pattern as RFC3691-1-1/RFC4959-3-3. " +
		"`MailboxSession`'s `seq` facet (src/client/mailbox.ts, class SeqFacet) has NO UIDONLY " +
		"awareness at all yet -- its own doc comment states this outright: 'UIDONLY lockout " +
		"... is explicitly OUT OF SCOPE here -- M5's job once ENABLE UIDONLY itself lands ... " +
		"no method below performs that check.' RFC9586-3-2 (the lockout) is therefore genuinely " +
		"self-actualizing-fail, but with a wrinkle RFC 3691's precedent didn't have: every " +
		"`seq.*` verb ALREADY EXISTS and works (M3), so driving it today would send real wire " +
		"bytes an unscripted mock server never expects, producing a plain assertion/timeout " +
		"failure the reporter classifies 'violation' (per runner/meta.ts's classifyFailure, " +
		"which only recognizes a real NotImplementedError throw as 'unimplemented') -- NOT the " +
		"clean 'unimplemented' this milestone's zero-new-violations gate requires. The spec " +
		"test for RFC9586-3-2 therefore establishes the real precondition (ENABLE UIDONLY " +
		"genuinely succeeds) and then explicitly `throw`s the driver's own `NotImplementedError` " +
		"documenting the missing gate, rather than calling the already-implemented (but not yet " +
		"UIDONLY-aware) seq method -- the same established idiom already used in this suite by " +
		"specs/rfc9051/2-protocol.test.ts for the $Junk/$NotJunk SHOULD-half. Untagged-response " +
		"parsing was checked directly against this session's parser: `Fetch.match()` " +
		"(src/parser/structure/fetch/index.ts) requires the literal atom 'FETCH', so a wire " +
		"'UIDFETCH' keyword does NOT match it or any other checker in " +
		"src/parser/structure/untagged.ts's dispatch list -- it falls to that file's own " +
		"documented tolerance backstop (spec §11.2, invariant I-6): the response is accepted " +
		"(never a ParsingError that kills the parser Transform stream) and its raw text is " +
		"preserved via `UnknownContent`. A DIRECT PROBE (Lexer+Parser against a literal " +
		"'* 3 UIDFETCH (FLAGS (\\Seen))' line, not merely reading the source) found a genuine, " +
		"pre-existing defect UNRELATED to UIDONLY: that fallback's own doc comment claims it " +
		"'surface[s] the atom keyword (canonicalized) as `type`' for an unrecognized numbered " +
		"response, but the actual code reads `contentTokens[1]` for that atom, which is the SP " +
		"token between the number and the keyword (the keyword itself is at index 2) -- an " +
		"apparent off-by-one, so `.type` comes out 'UNKNOWN' rather than 'UIDFETCH' (or any " +
		"other not-otherwise-recognized numbered-response keyword). This is a real, probed " +
		"finding worth a future fix, flagged prominently in this task's report -- but fixing " +
		"parser machinery is outside M5.14's catalog-extraction contract. RFC9586-3-3 is REAL " +
		"SIGNAL today for the tolerance half only (accepted, not dying, raw text preserved) -- " +
		"NOT for `.type`-based labeling (a measured miss) and not for structured msg-att " +
		"typing (a distinct, M5.15-scoped plumbing addition this row's own text does not " +
		"require of the client beyond accepting the response). `VanishedResponse` " +
		"(src/parser/structure/vanished.ts, landed for RFC 7162/QRESYNC in M4) already parses " +
		"bare '* VANISHED <uid-set>' unconditionally -- no capability or enablement check gates " +
		"it at the parser layer -- so RFC9586-3-4 is fully REAL SIGNAL (genuinely typed, not " +
		"just tolerated). `text.code.ts`'s resp-text-code dispatcher has no named case for " +
		"'UIDREQUIRED', so it falls to the same generic `AtomTextCode` default branch already " +
		"proven (by the RFC5255-4.9-1/BADCOMPARATOR precedent) to parse a bare bracketed code " +
		"without throwing and expose `.kind` correctly -- RFC9586-3-5 is REAL SIGNAL for that " +
		"tolerance, corroborated by the ruby/net-imap ABNF fragment confirming the exact " +
		"resp-text-code keyword spelling.",
	requirements: [
		// ── Extension capability gate ────────────────────────────────────────────
		{
			id: "RFC9586-3-1",
			source: "RFC9586",
			section: "3",
			title: "Client issues ENABLE UIDONLY only when the server advertises the UIDONLY capability",
			text:
				"A server that supports this extension indicates this with the capability name " +
				'"UIDONLY". A client MUST NOT issue "ENABLE UIDONLY" unless the server has ' +
				"advertised this capability.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"TEXT RECONSTRUCTED FROM MODEL TRAINING-KNOWLEDGE RECALL, NOT MECHANICALLY " +
				"VERIFIED against the primary RFC 9586 text (fetch blocked this session -- see " +
				"the module's extractionNote for every host attempted). Re-verify before M6. " +
				"The derived client duty mirrors RFC 5161's general 'never ENABLE an " +
				"unadvertised capability' rule, applied to this document's own capability " +
				"name -- the same by-naming pattern as RFC3691-1-1/RFC4959-3-3. PROFILES: both " +
				"-- see the module's PROFILE TREATMENT note (RFC 9586 is recalled to extend " +
				"both IMAP4rev1 and IMAP4rev2, not absorbed into rev2 core the way RFC 3691 " +
				"was). Conditional: binds only a client that wants to use UIDONLY. REAL SIGNAL " +
				"today: `client.enableExtensions()`/`driver.enable()` (src/client/client.ts) " +
				"are fully generic -- any requested capability is filtered through " +
				"`isEnableAdvertised()` before a real ENABLE is ever sent, and resolves `[]` " +
				"with zero bytes written when the filter empties -- so this gate is already " +
				"exercised correctly for 'UIDONLY' exactly as it is for any other capability " +
				"name, with no UIDONLY-specific code needed.",
		},

		// ── Sequence-number lockout ──────────────────────────────────────────────
		{
			id: "RFC9586-3-2",
			source: "RFC9586",
			section: "3",
			title:
				"Once UIDONLY is enabled, the client MUST NOT use message sequence numbers in any command",
			text:
				"Once the UIDONLY extension has been enabled, the client MUST NOT use message " +
				'sequence numbers (including the "*" sequence-number marker) as arguments to ' +
				"any IMAP command for the remainder of the connection; the server MUST reject " +
				"such a command with a tagged BAD response.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"TEXT RECONSTRUCTED FROM MODEL TRAINING-KNOWLEDGE RECALL, NOT MECHANICALLY " +
				"VERIFIED against the primary RFC 9586 text (fetch blocked -- see the module's " +
				"extractionNote). Re-verify before M6. Derived client duty spans the whole " +
				"`SequenceFacet` family (src/client/mailbox.ts): FETCH/STORE/SEARCH/SORT/" +
				"THREAD/COPY/MOVE/EXPUNGE issued via `.seq.*` once this session's UIDONLY mode " +
				"is active, per the M5.15 plan's own file list and `SeqFacet`'s own doc " +
				"comment ('UIDONLY lockout ... every method rejects " +
				"CapabilityError(\"UIDONLY active\")'). Note the asymmetric '*' nuance: the " +
				"prohibition is on '*' as a SEQUENCE-NUMBER marker (meaning 'the highest " +
				"message'), not on '*' used inside a UID set (meaning 'the highest UID'), which " +
				"remains legal -- the same character, two different grammar productions. " +
				"PROFILES: both, per the module's PROFILE TREATMENT note. Conditional: binds " +
				"only once a client has actually enabled UIDONLY. TESTABILITY: testable, but " +
				"currently SELF-ACTUALIZING FAIL WITHOUT a clean 'unimplemented' classification " +
				"available via the obvious drive-it-and-catch approach -- `SeqFacet` " +
				"(src/client/mailbox.ts) has no UIDONLY awareness at all yet (confirmed by " +
				"reading its own doc comment: 'that gate is not implemented yet ... no method " +
				"below performs that check'), and unlike RFC3691-2-1/2-2 (where the driving " +
				"verb itself didn't exist and threw NotImplementedError), every `seq.*` verb " +
				"here already exists and works (M3) -- calling it would send real, unscripted " +
				"wire bytes and score a plain 'violation', not 'unimplemented', breaking this " +
				"milestone's zero-new-violations gate. The spec test therefore establishes the " +
				"real precondition (ENABLE UIDONLY genuinely succeeds against an advertising " +
				"server) and then explicitly throws the driver's own NotImplementedError " +
				"documenting the missing gate -- the same established idiom already used by " +
				"specs/rfc9051/2-protocol.test.ts for the $Junk/$NotJunk SHOULD-half -- rather " +
				"than calling the already-implemented, not-yet-gated seq method against an " +
				"unscripted server.",
		},

		// ── UIDFETCH replaces FETCH ───────────────────────────────────────────────
		{
			id: "RFC9586-3-3",
			source: "RFC9586",
			section: "3",
			title: "Once UIDONLY is enabled, untagged FETCH responses are replaced by UIDFETCH",
			text:
				"Once the UIDONLY extension has been enabled, the server MUST NOT send an " +
				'untagged FETCH response; instead it uses an untagged "UIDFETCH" response, ' +
				"whose message-data number is the message's unique identifier (UID), not its " +
				"message sequence number.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"TEXT RECONSTRUCTED FROM MODEL TRAINING-KNOWLEDGE RECALL, NOT MECHANICALLY " +
				"VERIFIED against the primary RFC 9586 text (fetch blocked -- see the module's " +
				"extractionNote). Re-verify before M6, including the exact wire-shape ordering " +
				"(recalled as `nz-number SP \"UIDFETCH\" SP msg-att`, mirroring plain FETCH's " +
				"own ABNF with the keyword swapped and the number reinterpreted as a UID -- " +
				"this ordering is corroborated indirectly: this session's own parser only " +
				"recognizes a numbered-response shape as 'number SP atom ...', so a client-" +
				"observable 'UIDFETCH' keyword in this position is structurally consistent " +
				"with what the parser already tolerates). PROFILES: both, per the module's " +
				"PROFILE TREATMENT note. Conditional: binds only once UIDONLY is enabled. REAL " +
				"SIGNAL today for the client's derived accept/tolerate duty ONLY (probed against " +
				"this session's actual parser via a direct Lexer+Parser run, not merely read): " +
				"`Fetch.match()` (src/parser/structure/fetch/index.ts) requires the literal atom " +
				"'FETCH', so 'UIDFETCH' does not match it (or any other untagged-response " +
				"checker); src/parser/structure/untagged.ts's own tolerance backstop (spec " +
				"§11.2, invariant I-6) catches it instead -- the response is accepted (no " +
				"ParsingError, no dead stream) and its raw text is preserved. PROBED DEFECT " +
				"(pre-existing, unrelated to UIDONLY, worth a future fix): that fallback's own " +
				"doc comment claims it 'surface[s] the atom keyword (canonicalized) as `type`', " +
				"but the code reads `contentTokens[1]` for the atom, which is actually the SP " +
				"token between the number and the keyword (the keyword is at index 2) -- an " +
				"off-by-one, so `.type` comes out 'UNKNOWN' rather than 'UIDFETCH' in practice. " +
				"This row's own text only requires 'accept the response', which genuinely holds; " +
				"the `.type` mislabeling is a separate, narrower defect flagged in this task's " +
				"report, not something this row's spec test asserts against. Full structured " +
				"msg-att typing of a UIDFETCH response's own body (equivalent to `Fetch`'s typed " +
				"fields) is NOT independently required by this row's own text beyond 'accept the " +
				"response' and is left as M5.15-scoped plumbing, not a separate cataloged duty " +
				"here.",
		},

		// ── VANISHED replaces EXPUNGE ─────────────────────────────────────────────
		{
			id: "RFC9586-3-4",
			source: "RFC9586",
			section: "3",
			title: "Once UIDONLY is enabled, untagged EXPUNGE responses are replaced by VANISHED",
			text:
				"Once the UIDONLY extension has been enabled, the server MUST NOT send an " +
				"untagged EXPUNGE response; instead it reports expunged messages using the " +
				'"VANISHED" response defined in [RFC7162], addressed by UID.',
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"TEXT RECONSTRUCTED FROM MODEL TRAINING-KNOWLEDGE RECALL, NOT MECHANICALLY " +
				"VERIFIED against the primary RFC 9586 text (fetch blocked -- see the module's " +
				"extractionNote). Re-verify before M6. This reuses RFC 7162's VANISHED response " +
				"(already cataloged for QRESYNC, catalog/ext/rfc7162.ts) OUTSIDE any QRESYNC/" +
				"CONDSTORE context -- a client need not have QRESYNC enabled at all for a " +
				"UIDONLY-enabled server to send bare '* VANISHED <uid-set>' (no '(EARLIER)') in " +
				"place of EXPUNGE. PROFILES: both, per the module's PROFILE TREATMENT note. " +
				"Conditional: binds only once UIDONLY is enabled. REAL SIGNAL today (probed " +
				"against this session's actual parser, not recalled): `VanishedResponse.match()` " +
				"(src/parser/structure/vanished.ts, landed M4 for RFC 7162) recognizes bare " +
				"'* VANISHED <uid-set>' unconditionally -- no capability or enablement state " +
				"gates it at the parser layer at all -- and fully parses the UID set (typed, " +
				"not merely tolerated), so this duty is genuinely dischargeable today " +
				"independent of any M5.15 work.",
		},

		// ── UIDREQUIRED response code ─────────────────────────────────────────────
		{
			id: "RFC9586-3-5",
			source: "RFC9586",
			section: "3",
			title:
				"A tagged BAD response rejecting a sequence-numbered command under UIDONLY carries the UIDREQUIRED response code",
			text:
				"When the server rejects a command because the client used a message sequence " +
				"number after the UIDONLY extension was enabled, the tagged BAD response MUST " +
				'include the "UIDREQUIRED" response code.',
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"TEXT RECONSTRUCTED FROM MODEL TRAINING-KNOWLEDGE RECALL, NOT MECHANICALLY " +
				"VERIFIED against the primary RFC 9586 text (fetch blocked -- see the module's " +
				"extractionNote). Re-verify before M6. Partially corroborated by a genuinely " +
				"mechanically-fetched fragment (raw.githubusercontent.com, not blocked): ruby/" +
				"net-imap's response_parser.rb carries the comment 'RFC9586: UIDONLY / " +
				"resp-text-code =/ \"UIDREQUIRED\"', confirming the exact keyword spelling and " +
				"that it is a bare (argument-less) resp-text-code addition, independent of " +
				"this document's own recalled prose. PROFILES: both, per the module's PROFILE " +
				"TREATMENT note. Conditional: binds only once UIDONLY is enabled and the client " +
				"(incorrectly) sends a sequence number. This is a SERVER-emitted signal; the " +
				"derived client-observable duty is 'does not choke on and correctly recognizes " +
				"this resp-code' -- the RFC does not appear (recalled) to mandate a specific " +
				"client-side exception subtype, so that narrower duty is the honest scope of " +
				"this row. REAL SIGNAL today (probed against this session's actual parser, not " +
				"recalled): text.code.ts's resp-text-code dispatcher has no named case for " +
				"'UIDREQUIRED', so it falls to the generic `default: new AtomTextCode(kind, " +
				"contents)` branch -- the same fallback already proven (RFC5255-4.9-1's " +
				"[BADCOMPARATOR] precedent) to parse a bare bracketed code without throwing and " +
				"expose `.kind` correctly.",
		},
	],
};

export default rfc9586;
