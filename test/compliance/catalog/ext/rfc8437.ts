import type { CatalogModule } from "../types";

const rfc8437: CatalogModule = {
	source: "RFC8437",
	extractionNote:
		"§1 (Introduction): motivation/scoping prose only (administrative-client connection " +
		"reuse rationale), no RFC 2119 keywords directed at the client — reviewed, no " +
		"client-binding requirements. §2 (Conventions): standard BCP 14/RFC 8174 boilerplate — " +
		"reviewed, no independent requirements. §3 (UNAUTHENTICATE Command): the document's " +
		"primary client-binding section — fully extracted (entries RFC8437-3-1 through " +
		"RFC8437-3-7). Nearly every RFC 2119 keyword in this document binds the *server* " +
		"('Servers MAY...', 'the server terminates...', 'server implementations of this " +
		"extension MUST provide a way to disable it'); client-binding material here is mostly " +
		"carried in declarative present-tense prose describing what the client does or is " +
		"permitted to do, not capitalized keywords — each such sentence is flagged with an " +
		"RFC 8174 judgment note. One sentence — 'the interaction between IMAP ID and the " +
		"UNAUTHENTICATE command is defined by the implementation' — explicitly disclaims any " +
		"normative requirement and was reviewed but not catalogued as a requirement entry. §4 " +
		"(Interactions) heading: pointer only, no content. §4.1 (Stateful Extensions): almost " +
		"entirely server-side state-reset MUSTs (ACL cache reset, CONDSTORE-as-if-unissued, " +
		"ENABLE-state clearing, SEARCHRES/LANGUAGE reset) that bind whichever server implements " +
		"the named extension, not the IMAP client — reviewed, out of scope, except the COMPRESS " +
		"bullet's client-directed sentence, extracted as RFC8437-4.1-1 (the one clause in this " +
		"subsection that describes client, not server, conduct). §4.2 (Client Certificates, " +
		"SASL EXTERNAL, and imaps): extracted (RFC8437-4.2-1, RFC8437-4.2-2) — describes the " +
		"client-facing consequence of UNAUTHENTICATE on TLS-credential binding and the " +
		"PREAUTH re-authentication pattern it enables; both sentences are descriptive rather " +
		"than RFC 2119-keyworded, flagged accordingly. §5 (Revised State Machine): the ABNF-" +
		"adjacent state diagram and transition list are informative restatements of §3's " +
		"'placed in not authenticated state' outcome (already catalogued as RFC8437-3-2) and " +
		"introduce no new client duty — reviewed, no additional client-binding requirements. " +
		"§6 (Formal Syntax): pure ABNF grammar additions (capability/command-auth/command-select " +
		"productions) — no prose requirement, reviewed, no additional entries (the underlying " +
		"duty to use the command only in authenticated/selected state is already captured by " +
		"RFC8437-3-1). §7 (IANA Considerations): registry housekeeping, skipped. §8 (Security " +
		"Considerations): server-implementer guidance on state-reset completeness and the " +
		"MUST-provide-a-disable-switch requirement, both server-side — reviewed, out of scope " +
		"for the IMAP client. §9 (Privacy Considerations): informative discussion of traffic-" +
		"analysis benefits, no requirements — reviewed, out of scope. §10 (References): " +
		"bibliographic, skipped. Appendix A (Design Considerations): informative rationale for " +
		"the design choice of a separate command, no new normative text — reviewed, no " +
		"additional requirements. Acknowledgements/Author's Address: administrative, skipped. " +
		"Testability: at catalog-authoring time this client library had no public UNAUTHENTICATE " +
		"verb — `ComplianceDriver.unauthenticate()` (test/compliance/driver/driver.ts) threw " +
		"NotImplementedError — so every duty whose observable core is 'what the client sends " +
		"or does when it issues UNAUTHENTICATE' was scripted as a self-actualizing exchange and " +
		"marked testable rather than untestable; only duties with no wire-observable core at all " +
		"(the server-side state-machine bookkeeping consequence of transition 7, and internal " +
		"credential-binding bookkeeping) are marked untestable, per the extraction brief. " +
		"UPDATE: `unauthenticate()` has since shipped (driver.unauthenticate() now delegates to " +
		"the real `ImapClient.unauthenticate()`) and every one of those self-actualizing rows " +
		"genuinely passes today.",
	requirements: [
		// ── §3 UNAUTHENTICATE Command ────────────────────────────────────────────
		{
			id: "RFC8437-3-1",
			source: "RFC8437",
			section: "3",
			title: "Client must issue UNAUTHENTICATE only when advertised and in a valid state",
			text:
				"Note that a BAD response only occurs if UNAUTHENTICATE is issued in an invalid " +
				"state, is not advertised by the server, or does not follow the command syntax in " +
				"the specification.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"No RFC 2119 keyword in this sentence; it is phrased as a description of when the " +
				"*server* returns BAD, but it establishes the client's implicit precondition duty " +
				"— by elimination, a compliant client only issues UNAUTHENTICATE (a) after the " +
				"server has advertised the UNAUTHENTICATE capability and (b) while in " +
				"authenticated or selected state (per §6's `command-auth =/ \"UNAUTHENTICATE\"` " +
				"and `command-select =/ \"UNAUTHENTICATE\"` grammar, which excludes not-" +
				"authenticated state) — issuing it otherwise is a client protocol violation the " +
				"server is entitled to reject with BAD. Recorded as MUST (the strongest keyword " +
				"consistent with 'only occurs if' as an exhaustive precondition list) per RFC " +
				"8174 judgment. Scripted as a self-actualizing exchange: arm a session " +
				"advertising UNAUTHENTICATE, reach authenticated state, invoke the verb, and " +
				"assert the client sends the command only from that state. At catalog-authoring " +
				"time no public API surface issued UNAUTHENTICATE " +
				"(`ComplianceDriver.unauthenticate()` threw NotImplementedError); the verb has " +
				"since shipped and this row genuinely passes.",
		},
		{
			id: "RFC8437-3-2",
			source: "RFC8437",
			section: "3",
			title: "UNAUTHENTICATE returns the connection to not authenticated state",
			text:
				"This command directs the server to reset all connection state except for the " +
				"state of the TLS [RFC8446] layer. Upon completion, the server connection is " +
				"placed in not authenticated state. This represents Transition 7 in the State " +
				"Machine Diagram (Section 5).",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-state",
			untestableRationale:
				"This sentence is descriptive ('directs the server to reset', 'is placed in') and " +
				"binds the server's own state bookkeeping, not a client action — the reset itself " +
				"is server-internal connection state (mailbox selection, cached identity, enabled " +
				"extensions, etc., itemized in §4.1) that has no single client-observable wire " +
				"signature beyond the tagged OK completion the client already receives. The " +
				"client's *consequence* of this transition — that it must treat itself as not-" +
				"authenticated afterward and may not issue authenticated/selected-state commands " +
				"until it re-authenticates — is the client-facing half of this duty, and that half " +
				"is realized as the re-authenticate entry RFC8437-3-5 (freedom/need to issue a new " +
				"AUTHENTICATE or LOGIN) and via the general state-machine command-availability " +
				"tests already exercised elsewhere in the catalog (RFC3501/RFC9051 §3 entries). No " +
				"additional client wire behavior is uniquely attributable to 'not authenticated " +
				"state was reached' beyond what a tagged OK plus subsequent command legality " +
				"already shows.",
		},
		{
			id: "RFC8437-3-3",
			source: "RFC8437",
			section: "3",
			title: "Selected mailbox ceases to be selected without an expunge event",
			text: "If a mailbox was selected, the mailbox ceases to be selected, but no expunge event is generated.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"No RFC 2119 keyword; descriptive present tense, judged MUST per RFC 8174 since it " +
				"states an invariant outcome of a successful UNAUTHENTICATE from selected state, " +
				"not an optional behavior. The client-facing half of this duty is the negative " +
				"assertion: the client must not expect (and a conformant client's state tracking " +
				"must not require) an untagged EXPUNGE/VANISHED-style event to learn that its " +
				"selected mailbox is gone — the tagged UNAUTHENTICATE OK itself is the only signal. " +
				"Scripted as a self-actualizing exchange: select a mailbox, issue UNAUTHENTICATE, " +
				"assert no untagged EXPUNGE arrives before the tagged OK and that the client's " +
				"post-command state no longer reports a selected mailbox. At catalog-authoring " +
				"time no public API surface reached selected state or issued UNAUTHENTICATE " +
				"(`driver.select()` and `driver.unauthenticate()` both threw NotImplementedError); " +
				"both have since shipped and this row genuinely passes.",
		},
		{
			id: "RFC8437-3-4",
			source: "RFC8437",
			section: "3",
			title: "Client's outgoing SASL security layer terminates after the UNAUTHENTICATE CRLF",
			text:
				"If a Simple Authentication and Security Layer (SASL) [RFC4422] was active, the " +
				"server terminates its outgoing security layer immediately after sending the CRLF " +
				"following the OK response. The client's outgoing security layer terminates " +
				"immediately after the CRLF following the UNAUTHENTICATE command.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"The second sentence is the direct client-binding half (server-side termination " +
				"timing is out of scope); no RFC 2119 keyword, present-tense descriptive, judged " +
				"MUST per RFC 8174 — this is a cache/security-layer discard duty: once the client " +
				"has sent the UNAUTHENTICATE command line, it MUST NOT continue to wrap subsequent " +
				"octets in the (now-stale) SASL security layer. Conditional on a SASL layer having " +
				"been active in the first place. Scripted as a self-actualizing exchange: " +
				"negotiate a SASL security layer, issue UNAUTHENTICATE, and assert the bytes " +
				"following the command's terminating CRLF are sent unwrapped. At catalog-authoring " +
				"time no public API surface exposed SASL security-layer state or issued " +
				"UNAUTHENTICATE (`driver.authenticate()` and `driver.unauthenticate()` both threw " +
				"NotImplementedError); both have since shipped and this row genuinely passes.",
		},
		{
			id: "RFC8437-3-5",
			source: "RFC8437",
			section: "3",
			title: "Client is free to re-authenticate with a new AUTHENTICATE or LOGIN after UNAUTHENTICATE",
			text:
				"After sending this command, the client is free to issue a new AUTHENTICATE or " +
				"LOGIN command as permitted based on the server's capabilities.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"'Free to issue' is a permission grant (MAY-equivalent), not a mandate to re-" +
				"authenticate — judged MAY per RFC 8174. This is the re-authentication duty called " +
				"out in the extraction scope: after UNAUTHENTICATE, the client's path back to " +
				"authenticated state is an ordinary AUTHENTICATE or LOGIN, gated by whatever the " +
				"server's (possibly changed) capability list permits post-UNAUTHENTICATE, exactly " +
				"as it would be on a fresh connection. Scripted as a self-actualizing exchange: " +
				"issue UNAUTHENTICATE, then issue AUTHENTICATE or LOGIN, and assert the server " +
				"accepts the new authentication attempt on the same connection. At " +
				"catalog-authoring time no public API surface issued UNAUTHENTICATE followed by " +
				"AUTHENTICATE/LOGIN (all three threw NotImplementedError); all three have since " +
				"shipped and this row genuinely passes.",
		},
		{
			id: "RFC8437-3-6",
			source: "RFC8437",
			section: "3",
			title: "Client may pipeline UNAUTHENTICATE with a subsequent AUTHENTICATE when no SASL layer is active",
			text:
				"If no SASL security layer was active, the client is permitted to pipeline the " +
				"UNAUTHENTICATE command with a subsequent AUTHENTICATE command. If the IMAP server " +
				"also advertises SASL-IR [RFC4959], this permits an administrative client to re-" +
				"authenticate in one round trip.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"'Is permitted to pipeline' is a MAY-equivalent optimization grant, judged MAY per " +
				"RFC 8174. Conditional twice over: only applicable when the client chooses to " +
				"pipeline, and only available when no SASL security layer was active (a security-" +
				"layer-terminated connection cannot safely pipeline past the boundary, per " +
				"RFC8437-3-4). The SASL-IR cross-reference is informative context, not an " +
				"independent duty. Scripted as a self-actualizing exchange: with no SASL layer " +
				"active, write UNAUTHENTICATE and AUTHENTICATE on the wire without waiting for the " +
				"intervening tagged OK, and assert the server processes both. At catalog-authoring " +
				"time no public API surface exposed command pipelining or issued " +
				"UNAUTHENTICATE/AUTHENTICATE (both threw NotImplementedError); both have since " +
				"shipped and this row genuinely passes.",
		},
		{
			id: "RFC8437-3-7",
			source: "RFC8437",
			section: "3",
			title: "Client may need to issue CAPABILITY after authentication to learn UNAUTHENTICATE availability",
			text:
				"Servers MAY choose to advertise the UNAUTHENTICATE capability only after " +
				"authentication has completed. As a result, clients may need to issue an IMAP " +
				"CAPABILITY command after authentication in order to determine the availability of " +
				"UNAUTHENTICATE.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Lowercase 'may need to' — judged SHOULD per RFC 8174: this is the concrete " +
				"expression of the 'only when advertised' duty from RFC8437-3-1 for the specific " +
				"case where the server withholds the capability pre-authentication. A client that " +
				"cached only the pre-authentication capability list and never re-checked would be " +
				"unable to reliably determine UNAUTHENTICATE's availability before attempting it, " +
				"so a conforming client SHOULD re-issue CAPABILITY (or consult a post-authentication " +
				"CAPABILITY response code) after authenticating and before relying on " +
				"UNAUTHENTICATE. Scripted as a self-actualizing exchange: authenticate against a " +
				"server that advertises UNAUTHENTICATE only post-auth, and assert the client " +
				"re-issues CAPABILITY (or consults the post-auth capability list) before issuing " +
				"UNAUTHENTICATE. At catalog-authoring time no public API surface issued CAPABILITY " +
				"post-authentication or UNAUTHENTICATE (both threw NotImplementedError); both have " +
				"since shipped and this row genuinely passes.",
		},
		// ── §4.1 Stateful Extensions ──────────────────────────────────────────────
		{
			id: "RFC8437-4.1-1",
			source: "RFC8437",
			section: "4.1",
			title: "Client's outgoing COMPRESS layer terminates after the UNAUTHENTICATE CRLF",
			text:
				"If IMAP COMPRESS [RFC4978] is active, the server terminates its outgoing " +
				"compression layer after it sends the CRLF following the OK response. The client " +
				"terminates its outgoing compression layer after the CRLF following the " +
				"UNAUTHENTICATE command. When it matters, the compression layer terminates before " +
				"a SASL layer terminates.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"The second and third sentences are the client-binding half (the first sentence " +
				"binds server timing, out of scope); no RFC 2119 keyword, present-tense " +
				"descriptive, judged MUST per RFC 8174 — the sibling cache/layer-discard duty to " +
				"RFC8437-3-4, for the COMPRESS=DEFLATE layer instead of the SASL layer, with an " +
				"explicit ordering rule (compression terminates before SASL when both are active). " +
				"Conditional on IMAP COMPRESS having been negotiated. Scripted as a self-" +
				"actualizing exchange: negotiate COMPRESS=DEFLATE, issue UNAUTHENTICATE, and assert " +
				"the bytes following the command's terminating CRLF are sent unwrapped by the " +
				"compression layer (and, if a SASL layer was also active, that compression " +
				"unwrapping precedes SASL unwrapping). At catalog-authoring time no public API " +
				"surface exposed a COMPRESS layer or issued UNAUTHENTICATE (`driver.compress()` " +
				"and `driver.unauthenticate()` both threw NotImplementedError); both have since " +
				"shipped and this row genuinely passes. Cross-reference: sibling duty to " +
				"RFC8437-3-4 (SASL layer termination) and RFC4978 (COMPRESS extension, catalogued " +
				"separately).",
		},
		// ── §4.2 Client Certificates, SASL EXTERNAL, and imaps ───────────────────
		{
			id: "RFC8437-4.2-1",
			source: "RFC8437",
			section: "4.2",
			title: "UNAUTHENTICATE breaks the application-level TLS-credential binding without discarding the credentials",
			text:
				"The UNAUTHENTICATE command breaks any application-level binding of the TLS " +
				"client credentials but does not discard the client credentials.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-state",
			untestableRationale:
				"Descriptive present tense ('breaks', 'does not discard'), no RFC 2119 keyword; " +
				"judged as a MUST-level invariant per RFC 8174 since it states a mandatory outcome, " +
				"not an option. This binds internal application-layer bookkeeping: whether the " +
				"client retains its TLS client certificate/key material after UNAUTHENTICATE (it " +
				"must) while no longer treating the prior authenticated identity as bound to that " +
				"certificate at the IMAP application layer (it must not). The TLS layer itself is " +
				"explicitly unaffected (per §3, 'except for the state of the TLS layer'), so " +
				"nothing about the TLS connection changes on the wire; the only observable " +
				"consequence is the client's subsequent ability to issue AUTHENTICATE EXTERNAL " +
				"again using the same still-held credentials (RFC8437-4.2-2 captures that " +
				"observable half). This entry's specific claim — that the *application-level " +
				"binding* record, not the credential material, is what changes — is internal " +
				"client state with no independent wire signature of its own.",
		},
		{
			id: "RFC8437-4.2-2",
			source: "RFC8437",
			section: "4.2",
			title: "Administrative client may answer a PREAUTH greeting with UNAUTHENTICATE then AUTHENTICATE EXTERNAL",
			text:
				"As a result, TLS client certificates cannot be used for administrative proxy " +
				"authentication with the imaps port unless the UNAUTHENTICATE command is also " +
				"advertised. In that case, an administrative client can respond to the PREAUTH " +
				"greeting with an UNAUTHENTICATE command and then issue an AUTHENTICATE EXTERNAL " +
				"command.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"'Can respond ... and then issue' is a MAY-equivalent capability description, " +
				"judged MAY per RFC 8174. This is the re-authenticate duty for the PREAUTH-specific " +
				"case named in the extraction scope: a server that authenticates the client purely " +
				"from its TLS client certificate (PREAUTH greeting, State Machine Transition 2) " +
				"leaves an administrative client stuck as that one identity unless UNAUTHENTICATE " +
				"is advertised, in which case the client returns to not-authenticated state and " +
				"re-authenticates via SASL EXTERNAL to act as a different identity on the same " +
				"connection. Scripted as a self-actualizing exchange: connect to a server that " +
				"sends a PREAUTH greeting and advertises UNAUTHENTICATE, issue UNAUTHENTICATE, " +
				"then issue AUTHENTICATE EXTERNAL, and assert the server accepts the new identity. " +
				"At catalog-authoring time no public API surface handled a PREAUTH greeting or " +
				"issued UNAUTHENTICATE/AUTHENTICATE EXTERNAL (all threw NotImplementedError or had " +
				"no PREAUTH handling); all have since shipped and this row genuinely passes.",
		},
	],
};

export default rfc8437;
