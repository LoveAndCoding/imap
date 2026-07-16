import type { CatalogModule } from "../types";

/**
 * RFC 6855 (IMAP Support for UTF-8): defines the "UTF8=ACCEPT" and
 * "UTF8=ONLY" capabilities. All client-binding duties here are conditional
 * on the client choosing to use "UTF8=ACCEPT" (or connecting to a server
 * that mandates it via "UTF8=ONLY").
 *
 * rev2 relationship (RFC 9051 §4.3.1, §5.1): IMAP4rev2 makes UTF-8 support
 * CORE protocol behavior rather than an opt-in extension — a rev2 server
 * MUST accept UTF-8 in quoted-strings unconditionally (RFC9051-4.3.1-2,
 * cf. RFC9051-4.3-4) and mailbox names are Net-Unicode/UTF-8 by default
 * with no ENABLE gate (RFC9051-5.1-1). RFC 9051 Appendix A additionally
 * requires "ENABLE IMAP4rev2" (not "ENABLE UTF8=ACCEPT") when both
 * revisions are advertised (RFC9051-A-1) — a different capability string
 * for a related but distinct purpose. Consequently every entry below is
 * tagged `profiles: ["rev1"]` only: under rev2 the "UTF8=ACCEPT" capability
 * and its ENABLE gate are largely subsumed by core-protocol UTF-8 support,
 * so these RFC 6855 duties bind a client that is speaking IMAP4rev1 and
 * chooses to layer the RFC 6855 extension on top of it. A rev2 client that
 * has issued "ENABLE IMAP4rev2" is out of RFC 6855's scope for that
 * session (see per-entry notes for the specific rev2 cross-references).
 */
const rfc6855: CatalogModule = {
	source: "RFC6855",
	extractionNote:
		"RFC 6855 has 11 numbered sections plus 2 appendices; reviewed in full. " +
		"§1 (Introduction) is motivational/scene-setting prose with no RFC 2119 keyword " +
		"(describes the specification's purpose and assumes a 'fully internationalized " +
		"environment') — no entries. §2 (Conventions) is the standard RFC 2119 boilerplate " +
		"— no entries. " +
		"§3 ('UTF8=ACCEPT' capability and UTF-8 in quoted-strings): 4 client-binding entries " +
		"extracted (RFC6855-3-1 ENABLE UTF8=ACCEPT MUST-before-use; RFC6855-3-2 " +
		"authenticated-state-only scoping; RFC6855-3-3 MAY-use-extended-quoting-once-enabled; " +
		"RFC6855-3-4 MUST NOT SEARCH-with-CHARSET after enabling). Excluded as non-normative: " +
		"the capability-semantics paragraph (what UTF8=ACCEPT 'indicates' the server supports — " +
		"describes server behavior, no keyword), the UTF8=ONLY-implies-UTF8=ACCEPT sentence " +
		"(capability-registry fact, covered functionally by RFC6855-6-1/6-2), the 8-bit-forbidden/" +
		"literal-only paragraph (describes the RFC 3501 base-spec constraint motivating this " +
		"extension, no keyword directed at the client), the formal ABNF block (grammar, not a " +
		"duty), the server-MUST-reject-malformed-UTF-8 sentence (binds the server), the server-" +
		"MUST-NOT-send-UTF-8-unless-enabled sentence (binds the server as sender), the " +
		"inappropriate-placement caveat ('the results would be the same as if other syntactically " +
		"valid but semantically invalid characters were used' — descriptive consequence, not an " +
		"instruction), and the mailbox-name UTF-8 acceptance/conversion paragraph (server-SHOULD/" +
		"MUST bind the server as mailbox-name interpreter, not the client as name originator). " +
		"§4 (APPEND UTF8 data extension): 2 client-binding entries extracted (RFC6855-4-1 MUST " +
		"send UTF8 literal8 for UTF-8 headers; RFC6855-4-2 MAY reuse for CATENATE). Excluded: the " +
		"server-accepts-UTF-8-headers preamble sentence (server behavior), the ABNF block " +
		"(grammar), and the server-MUST-reject-unenabled-8-bit-APPEND sentence (binds the server). " +
		"§5 (LOGIN and UTF-8): 2 client-binding entries extracted (RFC6855-5-1 LOGIN not extended " +
		"— MUST use AUTHENTICATE instead for UTF-8 credentials; RFC6855-5-2 restated as the " +
		"positive MUST). The second paragraph ('there is no guarantee that the user provisioning " +
		"system... will allow such identities... implementation decision') is server/deployment-" +
		"side commentary with no client keyword — excluded. " +
		"§6 (UTF8=ONLY capability): 3 client-binding entries extracted (RFC6855-6-1 MUST ENABLE " +
		"UTF8=ACCEPT before using a UTF8=ONLY server; RFC6855-6-2 client always sends 'ENABLE " +
		"UTF8=ACCEPT', never 'ENABLE UTF8=ONLY'; RFC6855-6-3 clients that find UTF8=ONLY support " +
		"problematic are encouraged to detect it and inform the user). Excluded: the capability-" +
		"semantics preamble ('indicates that the server supports... requires support... will send " +
		"UTF-8... will not accept... modified UTF-7' — describes server behavior/requirements, no " +
		"client keyword), and the server-rejects-with-NO-CANNOT sentence (binds the server as " +
		"responder). " +
		"§7 (Dealing with Legacy Clients): 2 client-binding entries extracted (RFC6855-7-1 MUST " +
		"discard message cache on upgrade from non-UTF8=ACCEPT-aware to aware, due to a possible " +
		"UIDVALIDITY collision across the upgrade boundary; RFC6855-7-2 SHOULD use a standardized " +
		"downgrade algorithm, framed here as binding a client-side downgrade implementation since " +
		"the paragraph is phrased implementation-agnostically). The bulk of §7 (server operator " +
		"decision-making about hiding/surrogating messages for non-upgraded clients, the digital-" +
		"signature and UIDVALIDITY discussion, the 'best/least-bad approach depends on local " +
		"conditions' closing paragraph) is server-operator and deployment guidance with no client-" +
		"directed keyword — excluded. " +
		"§8 (Issues with UTF-8 Header Mailstore): entirely server-responsibility prose ('it is the " +
		"responsibility of the server to comply with...') — no client-binding entries. " +
		"§9 (IANA Considerations): registry bookkeeping, no normative client text — no entries. " +
		"§10 (Security Considerations): points at RFC 3629/RFC 4013's security considerations and " +
		"cross-references §7; no new independently-quotable client duty — no entries. " +
		"§11 (References): bibliographic, no entries. " +
		"Appendix A (Design Rationale): explicitly non-normative ('this non-normative section " +
		"discusses the reasons behind some of the design choices') — no entries. Appendix B " +
		"(Acknowledgments): no normative content — no entries. " +
		"rev2 cross-reference: RFC 9051 makes UTF-8 quoted-string acceptance and Net-Unicode " +
		"mailbox naming CORE IMAP4rev2 behavior (RFC9051-4.3.1-2, RFC9051-4.3-4, RFC9051-5.1-1) " +
		"with no ENABLE gate, and separately requires 'ENABLE IMAP4rev2' (not 'ENABLE UTF8=ACCEPT') " +
		"when both revisions are advertised (RFC9051-A-1). Every entry in this module is therefore " +
		"tagged profiles: ['rev1'] only — these are the duties of an IMAP4rev1 client layering the " +
		"RFC 6855 extension on top of rev1, not duties that persist once a client has moved to " +
		"IMAP4rev2 core behavior. Per-entry notes record the specific rev2 successor/cross-reference " +
		"where one exists.",
	requirements: [
		// ── §3 "UTF8=ACCEPT" capability and UTF-8 in quoted-strings ─────────────
		{
			id: "RFC6855-3-1",
			source: "RFC6855",
			section: "3",
			title: "Client MUST ENABLE UTF8=ACCEPT before using UTF-8 in quoted-strings",
			text:
				'A client MUST use the "ENABLE" command [RFC5161] with the "UTF8=ACCEPT" ' +
				'option (defined in Section 4 below) to indicate to the server that the ' +
				'client accepts UTF-8 in quoted-strings and supports the "UTF8=ACCEPT" ' +
				"extension.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "testable",
			notes:
				"Conditional: binds only a client that intends to use the UTF8=ACCEPT extension " +
				"(send/receive UTF-8 in quoted-strings, use the APPEND UTF8 data extension, etc.) " +
				"against a server that advertises UTF8=ACCEPT or UTF8=ONLY. 'Section 4 below' is " +
				"this same RFC's own §4 numbering for the ENABLE option name, not a cross-RFC " +
				"pointer. Testable via the ENABLE command form: script a server advertising " +
				"UTF8=ACCEPT and verify the client sends 'ENABLE UTF8=ACCEPT' before any command " +
				"that relies on the extension. The client driver's enable() " +
				"verb (test/compliance/driver/driver.ts) is genuinely real and ENABLE is genuinely " +
				"wired end to end, so this row passes for real. rev2 " +
				"cross-reference: the rev2 analog is RFC9051-A-1 ('ENABLE IMAP4rev2' MUST precede " +
				"reliance on IMAP4rev2 behavior when both revisions are advertised) — a different " +
				"capability string serving a related but distinct purpose (revision selection, not " +
				"UTF-8-in-quoted-strings opt-in); rev2's UTF-8 quoted-string acceptance itself has " +
				"no ENABLE gate at all (RFC9051-4.3.1-2).",
		},
		{
			id: "RFC6855-3-2",
			source: "RFC6855",
			section: "3",
			title: "ENABLE UTF8=ACCEPT is only valid in the authenticated state",
			text: 'The "ENABLE UTF8=ACCEPT" command is only valid in the authenticated state.',
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "testable",
			notes:
				"No explicit RFC 2119 keyword ('is only valid'); RFC 6855 predates RFC 8174. " +
				"Judgment: implicit MUST — this scopes RFC6855-3-1's ENABLE duty to a specific " +
				"connection state, mirroring how RFC9051-6.3.1-2 ('Clients MUST NOT issue ENABLE " +
				"once they SELECT/EXAMINE a mailbox') treats the identical state-scoping fact as a " +
				"client-binding MUST NOT for the generic ENABLE command; a client that issues " +
				"'ENABLE UTF8=ACCEPT' before authentication or after SELECT/EXAMINE is not following " +
				"a state the server is obliged to honor. Conditional on the client using ENABLE " +
				"UTF8=ACCEPT at all. Testable: script a session and verify the client never sends " +
				"'ENABLE UTF8=ACCEPT' outside the authenticated (pre-SELECT/EXAMINE) state. " +
				"ENABLE is genuinely real per RFC6855-3-1's updated notes, so this row passes for " +
				"real.",
		},
		{
			id: "RFC6855-3-3",
			source: "RFC6855",
			section: "3",
			title: "Client MAY use extended UTF-8 quoted syntax once UTF8=ACCEPT is enabled",
			text:
				'If the server supports "UTF8=ACCEPT", the client MAY use extended quoted ' +
				"syntax with any IMAP argument that permits a string (including astring and " +
				"nstring).",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "testable",
			notes:
				"Permissive MAY: once the server supports UTF8=ACCEPT (and, per RFC6855-3-1, the " +
				"client has ENABLEd it), the client is permitted — not required — to send UTF-8 " +
				"octets inside quoted-strings for any string-typed argument. Testable in the sense " +
				"that a MAY still has an observable envelope: any UTF-8 the client does send in a " +
				"quoted-string context must conform to the uQUOTED-CHAR grammar (valid UTF-8 per RFC " +
				"3629, no NUL/CR/LF) rather than being sent as a literal or rejected as invalid; a " +
				"client that never exercises the permission is equally compliant. Both ENABLE " +
				"support (RFC6855-3-1) and the public API surface for supplying non-ASCII string " +
				"arguments are genuinely real, so this row passes for real. rev2 cross-" +
				"reference: RFC9051-4.3-4 makes UTF-8-in-quoted-strings acceptance a server-side MUST " +
				"unconditionally (no client ENABLE gate), so this MAY's rev1 opt-in framing has no " +
				"direct rev2 counterpart on the client side.",
		},
		{
			id: "RFC6855-3-4",
			source: "RFC6855",
			section: "3",
			title: "Client MUST NOT send SEARCH with a CHARSET specification after enabling UTF8=ACCEPT",
			text:
				'Once an IMAP client has enabled UTF-8 support with the "ENABLE ' +
				'UTF8=ACCEPT" command, it MUST NOT issue a "SEARCH" command that contains ' +
				"a charset specification.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "testable",
			notes:
				"Conditional on the client having sent ENABLE UTF8=ACCEPT in the session. " +
				"Testable: script a session where the client has ENABLEd UTF8=ACCEPT and verify " +
				"any subsequent SEARCH command it issues omits a CHARSET specifier (the RFC's stated " +
				"reason is avoiding conflicting charset labels, since UTF-8 is now implied). " +
				"Both ENABLE support (RFC6855-3-1) and SEARCH support are genuinely real, so this " +
				"row passes for real. rev2 cross-reference: RFC9051-6.4.4's SEARCH entries (s6-selected.ts) " +
				"establish 'Clients SHOULD use UTF-8' and that omitting CHARSET implies UTF-8 as core " +
				"rev2 SEARCH behavior — the same directional intent (prefer UTF-8, treat explicit " +
				"CHARSET as redundant/conflicting) persists into rev2 without the ENABLE precondition.",
		},

		// ── §4 IMAP UTF8 "APPEND" Data Extension ─────────────────────────────────
		{
			id: "RFC6855-4-1",
			source: "RFC6855",
			section: "4",
			title: "Client MUST use the UTF8 APPEND data extension to send UTF-8 message headers",
			text:
				"A client that sends a message with UTF-8 headers to the server MUST " +
				'send them using the "UTF8" data extension to the "APPEND" command.',
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "testable",
			notes:
				"Conditional: binds only a client that sends a message containing UTF-8 header " +
				"octets via APPEND. The wire form is 'UTF8 (' literal8 ')' per the ABNF (utf8-literal " +
				"= \"UTF8\" SP \"(\" literal8 \")\"). Testable: script an APPEND of a message with " +
				"UTF-8 header bytes and verify the client wraps the message literal in the UTF8(...) " +
				"data-extension syntax rather than sending a bare literal. driver.ts's append() is " +
				"genuinely real, so this row passes for real. rev2 cross-reference: " +
				"IMAP4rev2 core APPEND has no UTF8() wrapper requirement of its own in the reviewed " +
				"rev9051 catalog sections — UTF-8 header content is core rev2 text handling " +
				"(RFC9051-4.3.1-2's UTF-8-by-default framing) rather than an opt-in data extension, " +
				"so a rev2 client using core APPEND would not need this wrapper; this entry binds a " +
				"rev1 client explicitly using the RFC 6855 extension.",
		},
		{
			id: "RFC6855-4-2",
			source: "RFC6855",
			section: "4",
			title: "Client MAY reuse the UTF8 data extension inside a CATENATE part",
			text:
				'If the server also advertises the "CATENATE" capability [RFC4469], the ' +
				"client can use the same data extension to include such a message in a " +
				"catenated message part.",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "testable",
			notes:
				"No explicit RFC 2119 keyword ('can use'); RFC 6855 predates RFC 8174. Judgment: " +
				"graded MAY — 'can use' describes an available option contingent on a second " +
				"capability (CATENATE) being advertised, not a mandatory action. Conditional on the " +
				"client using both UTF8=ACCEPT and CATENATE. Testable in the sense of the wire form: " +
				"the 'cat-part =/ utf8-literal' ABNF production means any UTF8(...) reuse inside a " +
				"CATENATE URL/literal part list must match the same utf8-literal grammar as " +
				"RFC6855-4-1's plain-APPEND form. Both APPEND (RFC6855-4-1) and CATENATE are " +
				"genuinely real, so this row passes for real.",
		},

		// ── §5 "LOGIN" Command and UTF-8 ─────────────────────────────────────────
		{
			id: "RFC6855-5-1",
			source: "RFC6855",
			section: "5",
			title: "LOGIN is not extended for UTF-8 usernames/passwords",
			text:
				'This specification does not extend the IMAP "LOGIN" command [RFC3501] ' +
				"to support UTF-8 usernames and passwords.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "testable",
			notes:
				"No explicit RFC 2119 keyword ('does not extend'); RFC 6855 predates RFC 8174. " +
				"Judgment: graded as an implicit MUST NOT on the client — read together with " +
				"RFC6855-5-2's explicit MUST (use AUTHENTICATE instead), this sentence's operative " +
				"content is that a client MUST NOT rely on LOGIN carrying UTF-8 credentials; the two " +
				"entries are two faces of the same duty and are kept separate because each quotes a " +
				"distinct sentence. Conditional on the client needing to authenticate with a UTF-8 " +
				"username or password. Testable: script a session where credentials require UTF-8 " +
				"octets and verify the client does not attempt them via a plain LOGIN command. " +
				"Both driver.ts's login() and authenticate() are genuinely real, so this row " +
				"passes for real.",
		},
		{
			id: "RFC6855-5-2",
			source: "RFC6855",
			section: "5",
			title: "Client MUST use AUTHENTICATE for UTF-8 usernames/passwords",
			text:
				"Whenever a client needs to use UTF-8 usernames or passwords, it MUST " +
				'use the IMAP "AUTHENTICATE" command, which is already capable of ' +
				"passing UTF-8 usernames and credentials.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "testable",
			notes:
				"Conditional on the client needing UTF-8 credentials. Testable: script a session " +
				"requiring UTF-8 credentials and verify the client authenticates via AUTHENTICATE " +
				"(some SASL mechanism) rather than LOGIN. driver.ts's authenticate() is genuinely " +
				"real and multiple SASL mechanisms are wired up in src/, so this row passes for " +
				"real. This entry is independent of the UTF8=ACCEPT capability " +
				"itself — it is not gated on ENABLE, since LOGIN's credential-format limitation is " +
				"unconditional, only the need for UTF-8 credentials is conditional.",
		},

		// ── §6 "UTF8=ONLY" Capability ─────────────────────────────────────────────
		{
			id: "RFC6855-6-1",
			source: "RFC6855",
			section: "6",
			title: "Client MUST ENABLE UTF8=ACCEPT before using a UTF8=ONLY server",
			text: 'clients MUST use the "ENABLE UTF8=ACCEPT" command before using this server.',
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "testable",
			notes:
				"Full sentence context: 'Because these are incompatible changes to IMAP, explicit " +
				"server announcement and client confirmation is necessary: clients MUST use the " +
				"\"ENABLE UTF8=ACCEPT\" command before using this server.' 'This server' refers to " +
				"any server advertising UTF8=ONLY. Conditional: binds a client connecting to a server " +
				"that advertises UTF8=ONLY (a stricter precondition than RFC6855-3-1's general " +
				"'client intends to use the extension' framing — here it is mandatory for the session " +
				"to proceed at all, since a UTF8=ONLY server rejects unenabled commands with 'NO " +
				"[CANNOT]'). Testable: script a server advertising UTF8=ONLY and verify the client " +
				"sends 'ENABLE UTF8=ACCEPT' before any command beyond CAPABILITY/NOOP/LOGOUT/" +
				"AUTHENTICATE-class commands that don't require UTF-8 support. ENABLE is " +
				"genuinely real per RFC6855-3-1's updated notes, so this row passes for real.",
		},
		{
			id: "RFC6855-6-2",
			source: "RFC6855",
			section: "6",
			title: "Client always sends ENABLE UTF8=ACCEPT, never ENABLE UTF8=ONLY",
			text:
				'For the client, "ENABLE UTF8=ACCEPT" is always used -- never "ENABLE ' +
				'UTF8=ONLY".',
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "testable",
			notes:
				"No explicit RFC 2119 keyword ('is always used -- never'); RFC 6855 predates RFC " +
				"8174. Judgment: graded MUST NOT on the negative clause ('never \"ENABLE " +
				"UTF8=ONLY\"') — the sentence's own emphatic phrasing ('always ... never') is as " +
				"strong as an explicit MUST/MUST NOT pair and the preceding paragraph explains why: " +
				"UTF8=ONLY implies UTF8=ACCEPT and a server never advertises both, so the client's " +
				"ENABLE argument is always the UTF8=ACCEPT token regardless of which capability the " +
				"server advertised. Conditional on the client using ENABLE for UTF-8 support at all. " +
				"Testable: across any scripted session (server advertising either UTF8=ACCEPT or " +
				"UTF8=ONLY), verify the client's ENABLE argument list never contains the literal " +
				"token 'UTF8=ONLY'. ENABLE is genuinely real per RFC6855-3-1's updated notes, so " +
				"this row passes for real.",
		},
		{
			id: "RFC6855-6-3",
			source: "RFC6855",
			section: "6",
			title: "Clients are encouraged to detect UTF8=ONLY and inform the user if unsupported",
			text:
				'IMAP clients that find support for a server that announces "UTF8=ONLY" ' +
				"problematic are encouraged to at least detect the announcement and " +
				"provide an informative error message to the end-user.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "untestable",
			untestableTheme: "ui-presentation",
			untestableRationale:
				"'Encouraged to... provide an informative error message to the end-user' is a " +
				"user-facing presentation duty conditioned on the client's own internal judgment of " +
				"whether UTF8=ONLY support is 'problematic' for it — a client that fully implements " +
				"UTF8=ONLY has nothing to report and is equally compliant. Even for a client that " +
				"does find it problematic, 'informative error message' has no wire signature: this " +
				"headless library's only user-facing notification channels are the public logger " +
				"callback and public events (per the taxonomy's ui-presentation mechanism), and no " +
				"wire-observable action distinguishes 'silently declined to proceed' from 'declined " +
				"and informed the user via some out-of-protocol UI the harness cannot see'. Even with " +
				"logger capture, 'informative' has no crisp pass/fail content-quality boundary the " +
				"way the ALERT-text-presence duty (RFC3501-7.1-1) does. Graded SHOULD, not MUST " +
				"('are encouraged to' + lowercase intent, softer than even a SHOULD keyword — RFC " +
				"6855 predates RFC 8174; judgment call rounding this advisory encouragement up to the " +
				"nearest keyword tier), which further weakens any pass/fail envelope.",
			notes:
				"Conditional on the client choosing not to (fully) support UTF8=ONLY servers. This " +
				"is squarely an encouragement/recommendation rather than a hard requirement even by " +
				"the RFC's own wording ('encouraged to at least detect'), reinforcing the SHOULD " +
				"grading. No rev2 counterpart reviewed in the rev9051 catalog sections to date.",
		},

		// ── §7 Dealing with Legacy Clients ───────────────────────────────────────
		{
			id: "RFC6855-7-1",
			source: "RFC6855",
			section: "7",
			title: "Client upgrading UTF8=ACCEPT-awareness MUST discard its message cache",
			text:
				"a client upgraded from being non-\"UTF8=ACCEPT\"-aware MUST discard its " +
				"cache of messages downloaded from the server.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "untestable",
			untestableTheme: "internal-state",
			untestableRationale:
				"Full sentence context: 'in order to cope with the case when a server compliant " +
				"with this extension returns the same UIDVALIDITY to both legacy and " +
				"\"UTF8=ACCEPT\"-aware clients, a client upgraded from being non-\"UTF8=ACCEPT\"-" +
				"aware MUST discard its cache of messages downloaded from the server.' This binds " +
				"whether a (hypothetical, consumer-side) local message cache is discarded across a " +
				"software-version upgrade boundary — the same defining property as the taxonomy's " +
				"internal-state theme (cf. RFC3501-2.2.2-3/-4, RFC9051-2.3.1.1-1's cross-session " +
				"discussion): this headless library keeps no cross-session message cache of its own " +
				"(caching, if any, belongs to the consuming application per the content-processing " +
				"theme's API-boundary delegation argument), and the trigger condition ('upgraded from " +
				"being non-aware') is a fact about client software versioning across time, not a " +
				"single-session wire behavior. No two-session scripted scenario can distinguish a " +
				"compliant discard from a stale-cache retention purely on the wire, because the " +
				"library itself has no cache to inspect; the only wire-observable downstream effect " +
				"(issuing a UID command against a since-invalidated UID) is already covered by " +
				"testable, command-specific UID entries elsewhere in the catalog, not by this general " +
				"caching duty.",
			notes:
				"Conditional on the client (or its consuming application) maintaining a local message " +
				"cache and being upgraded across the UTF8=ACCEPT-awareness boundary. No rev2 " +
				"counterpart reviewed to date; the underlying UIDVALIDITY-collision concern is " +
				"general to any client-cache-invalidation scenario, not specific to rev1 vs rev2.",
		},
		{
			id: "RFC6855-7-2",
			source: "RFC6855",
			section: "7",
			title: "Downgrading implementations SHOULD use a standardized algorithm (RFC 6857 or RFC 6858)",
			text:
				"Implementations that choose to perform downgrading SHOULD use one of " +
				"the standardized algorithms provided in RFC 6857 or RFC 6858.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "untestable",
			untestableTheme: "out-of-band",
			untestableRationale:
				"'Downgrading' in §7 is the server-side (or gateway-side) act of constructing a " +
				"surrogate/simplified message representation for a client that has not enabled UTF-8 " +
				"support — the surrounding paragraphs frame this entirely as an implementer/operator " +
				"choice about server or mail-store behavior ('choices available to the server " +
				"include...'). This IMAP client library does not perform message downgrading at all " +
				"(it consumes whatever the server sends); the sentence's 'implementations' scope is " +
				"most naturally the server/gateway side, not this client. Recorded as conditionally " +
				"client-binding only in the narrow, unlikely case that some future consumer built on " +
				"this library implements its own client-side downgrade/surrogate-construction logic " +
				"for locally cached messages — which RFC 6857/6858 conformance is then an out-of-band " +
				"algorithm-choice fact about that consumer's code, not observable on the wire between " +
				"this client and an IMAP server. No black-box protocol observation can establish which " +
				"(if any) downgrade algorithm a piece of software implements internally.",
			notes:
				"Included for completeness of §7's client-adjacent text despite the primary reading " +
				"being server/gateway-scoped; judgment call to catalog rather than silently drop, " +
				"given the RFC's own 'implementations' wording does not explicitly exclude clients. " +
				"No rev2 counterpart reviewed to date.",
		},
	],
};

export default rfc6855;
