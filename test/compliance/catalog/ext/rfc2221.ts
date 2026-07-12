import type { CatalogModule } from "../types";

const rfc2221: CatalogModule = {
	source: "RFC2221",
	extractionNote:
		"Full document reviewed (Abstract, §1 Abstract, §2 Conventions used in this document, " +
		"§3 Introduction and Overview, §4 Home Server Referrals [§4.1 LOGIN and AUTHENTICATE " +
		"Referrals, §4.2 BYE at connection startup referral], §5 Formal Syntax, §6 Security " +
		"Considerations, §7 References, §8 Acknowledgments, §9 Author's Address, §10 Full " +
		"Copyright Statement). 8 client-binding entries extracted from §3/§4.1/§4.2/§5/§6, the " +
		"only sections carrying client-directed duties: (1) MUST NOT follow more than 10 levels " +
		"of referral without consulting the user (testable loop-bound, though the 'consulting the " +
		"user' escape hatch is itself a UI/policy matter — the numeric ceiling is the testable " +
		"residue); (2) implicit MUST accept/parse a LOGIN-REFERRALS response code carrying a valid " +
		"IMAP server URL argument on tagged NO/OK/untagged BYE (testable — REAL candidate per the " +
		"AtomTextCode fallback, see below); (3) implicit MUST NOT treat a tagged NO carrying " +
		"[REFERRAL ...] as a bare command failure divorced from its referral semantics — i.e. the " +
		"client must be able to recover the URL, not merely notice the command failed (testable, " +
		"same REAL probe surface); (4) implicit MUST NOT treat a tagged OK carrying [REFERRAL ...] " +
		"as an ordinary unqualified success (testable — the client must be able to observe that " +
		"personal mailboxes are elsewhere even though the command 'succeeded'); (5) implicit MUST " +
		"treat an untagged BYE carrying [REFERRAL ...] as a connection-startup redirection rather " +
		"than an unqualified connection refusal/drop (testable — same resp-code parse surface, " +
		"different context: pre-authentication connection teardown); (6) implicit MUST NOT assume a " +
		"home server referral is permanent (untestable — internal-decision: the client has no wire " +
		"signal at all to distinguish a permanent from a temporary move, so 'not assuming' is a " +
		"purely internal abstention with no observable consequence); (7) implicit duty that a " +
		"client following a referral connect to the URL's host and use its embedded userid/AUTH " +
		"parameter for the subsequent login (untestable — out-of-band: exercising this requires a " +
		"live second TCP connection and a second authentication exchange to a different host, which " +
		"is a full multi-connection integration behavior outside this suite's single-session probe " +
		"harness, per the same out-of-band bucket used for 'client opens a new connection' duties in " +
		"prior phases); (8) implicit MUST NOT reveal/imply the referral mechanism in a way that " +
		"defeats the anti-anonymous-fallback purpose of user;AUTH=* — i.e. the client must carry the " +
		"authentication-mechanism-restriction segment of the URL forward into its follow-up LOGIN/" +
		"AUTHENTICATE rather than silently falling back to anonymous (untestable — out-of-band, same " +
		"multi-connection reason as (7); the client has no implemented referral-following surface to " +
		"probe at all today). Excluded as server-only: 'IMAP4 servers that support this extension " +
		"MUST list the keyword LOGIN-REFERRALS in their CAPABILITY response' (server's own capability-" +
		"advertisement duty; the client's corresponding capability-GATE duty — only rely on referral " +
		"handling if the server actually advertised LOGIN-REFERRALS — is untestable, internal-" +
		"decision, and is in any case implicit: no sentence states it as a client obligation, it " +
		"follows only from general extension-gating practice already covered by the base CAPABILITY " +
		"catalog), the SHOULD NOT chained-referral restriction ('a LOGIN-REFERRALS capable IMAP4 " +
		"server SHOULD NOT return a referral to a server that will return a referral' — binds server " +
		"referral-issuing behavior, not client handling), 'A server MUST NOT give a login referral if " +
		"authentication for that user fails' (server-side anti-oracle duty, no client action), and " +
		"the closing security-considerations paragraph about rogue password-catching servers (pure " +
		"threat-model prose, no imperative). §2 Conventions defines terminology only. §7-§10 are " +
		"references/acknowledgments/address/copyright boilerplate with no normative content. " +
		"REAL-SIGNAL NOTE (per the Phase 5 NOUPDATE/UNDEFINED-FILTER precedent in ext/rfc5466.ts): " +
		"'REFERRAL' is not one of the named text-code kinds the parser special-cases in " +
		"src/parser/structure/text.code.ts (APPENDUID/BADCHARSET/CAPABILITIES/COPYUID/MODIFIED/" +
		"PERMANENTFLAGS/HIGHESTMODSEQ/UIDNEXT/UIDVALIDITY/UNSEEN) — it falls through to the `default: " +
		"code = new AtomTextCode(kind, contents)` branch. AtomTextCode.contents is populated by " +
		"splitSpaceSeparatedList(tokens) with the default '(' start-token; a bare (unparenthesized) " +
		"argument — which is exactly what '[REFERRAL imap://user;AUTH=*@SERVER2/]' carries, per §5's " +
		"'resp_text_code =/ \"REFERRAL\" SPACE <imapurl>' with no surrounding parens — never enters " +
		"the list, so code.contents comes back [] even though code.kind correctly surfaces as " +
		"'REFERRAL'. Expected honest outcome once specs are written: the acceptance/kind-surfacing leg " +
		"(entries 2-5, the 'kind === REFERRAL and the stream survives' half) is a genuine REAL PASS; " +
		"the URL-argument-exposure half of those same entries is a genuine REAL VIOLATION (contents " +
		"dropped), mirroring RFC5466-3.1-2's split exactly. Entries (1) and (6)-(8) have no " +
		"implemented referral-following surface (no driver verb issues AUTHENTICATE/LOGIN-then-follow-" +
		"URL logic), so they remain self-actualizing/out-of-band rather than REAL. " +
		"PROFILES NOTE: RFC 9051 (rev2) contains no 'REFERRAL' text-code, no LOGIN-REFERRALS mention, " +
		"and no restatement of this document anywhere in its body (grepped the full rfc9051.txt: zero " +
		"matches for REFERRAL/LOGIN-REFERRALS). Rev2 does not fold LOGIN-REFERRALS into core, obsolete " +
		"it, or mention it at all — it is simply silent, meaning a rev2 server MAY still advertise and " +
		"a rev2 client MAY still encounter this 1997 extension unchanged. Per the plan's instruction, " +
		"these entries stay dual profiles: [\"rev1\",\"rev2\"] as an extension-only duty layered atop " +
		"either base revision, not a rev2-core restatement (there is no RFC9051 counterpart to cross-" +
		"reference or dedupe against, unlike the RFC5161/RFC9051-6.3.1 ENABLE precedent). Total: 8 " +
		"client-binding entries (RFC2221-3-1, RFC2221-4.1-1..3, RFC2221-4.2-1, RFC2221-4-1, " +
		"RFC2221-4-2, RFC2221-6-1). Untestable: 3 (RFC2221-4-1 internal-decision; RFC2221-4-2 and " +
		"RFC2221-6-1 out-of-band).",
	requirements: [
		// ── §3 Introduction and Overview ────────────────────────────────────────

		{
			id: "RFC2221-3-1",
			source: "RFC2221",
			section: "3",
			title: "Client MUST NOT follow more than 10 levels of referral without consulting the user",
			text: "A client MUST NOT follow\nmore than 10 levels of referral without consulting the user.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Conditional on the client implementing referral-following at all. The 'without " +
				"consulting the user' clause is a UI/policy escape valid at any depth once the user " +
				"is asked; the numeric ceiling on UNCONSULTED auto-following is the testable residue " +
				"of this sentence. No driver surface exists today that follows a referral chain at " +
				"all (LOGIN/AUTHENTICATE always throw NotImplementedError, and there is no follow-up-" +
				"connection verb), so this is currently self-actualizing/out-of-band rather than a " +
				"REAL probe: exercising it would require scripting 11 chained servers and a second-" +
				"connection-per-hop client capability the harness does not have.",
		},

		// ── §4.1 LOGIN and AUTHENTICATE Referrals ───────────────────────────────

		{
			id: "RFC2221-4.1-1",
			source: "RFC2221",
			section: "4.1",
			title: "Client (implicit) MUST parse/accept a LOGIN-REFERRALS response code on a tagged NO to a LOGIN/AUTHENTICATE",
			text:
				"An IMAP4 server MAY respond to a LOGIN or AUTHENTICATE command with a\n" +
				"home server referral if it wishes to direct the user to another IMAP4\n" +
				"server.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit MUST inferred from a server-permission MAY sentence plus " +
				"§3's 'A home server referral consists of either a tagged NO or OK, or an untagged " +
				"BYE response that contains a LOGIN-REFERRALS response code'): a compliant client " +
				"cannot ignore the possibility of a referral-bearing NO to its own LOGIN/AUTHENTICATE " +
				"command, since the RFC defines this as a normal, anticipated response shape rather " +
				"than an implementation-optional corner case. REAL-SIGNAL CANDIDATE: 'REFERRAL' falls " +
				"through to the AtomTextCode default branch in src/parser/structure/text.code.ts (no " +
				"dedicated REFERRAL text-code class exists); kind should surface intact on the tagged " +
				"NO's status.text.code, giving a genuine parse-level PASS for the acceptance half of " +
				"this duty — see this module's extractionNote for the full REAL-SIGNAL analysis " +
				"(mirrors the RFC5466-3.1-2/UNDEFINED-FILTER precedent).",
		},
		{
			id: "RFC2221-4.1-2",
			source: "RFC2221",
			section: "4.1",
			title: "Client (implicit) MUST recover the referral URL from a tagged NO, not just notice the command failed",
			text: "A001 NO [REFERRAL IMAP://MIKE@SERVER2/] Specified user\nis invalid on this server. Try SERVER2.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit MUST drawn from the worked example combined with §3's " +
				"'A LOGIN-REFERRALS response code MUST contain as an argument a valid IMAP server " +
				"URL' — a client that discards the URL argument cannot act on the referral at all, " +
				"defeating the extension's entire purpose). PROBED MECHANISM (not yet run against a " +
				"live spec/test, but derivable from the parser source per this module's " +
				"extractionNote): AtomTextCode.contents uses splitSpaceSeparatedList's default '(' " +
				"start-token, which drops bare (unparenthesized) arguments — 'imap://user;AUTH=*@" +
				"SERVER2/' is exactly such a bare argument per §5's ABNF ('REFERRAL' SPACE <imapurl>, " +
				"no parens) — so the expected honest outcome is a genuine VIOLATION for the URL-" +
				"exposure half of this duty, paired with a genuine PASS for the kind === 'REFERRAL' " +
				"acceptance half (RFC2221-4.1-1). Same split as RFC5466-3.1-2/UNDEFINED-FILTER.",
		},
		{
			id: "RFC2221-4.1-3",
			source: "RFC2221",
			section: "4.1",
			title: "Client (implicit) MUST NOT treat a tagged OK carrying [REFERRAL ...] as an unqualified plain success",
			text:
				"A001 OK [REFERRAL IMAP://MATTHEW@SERVER2/] Specified\n" +
				"user's personal mailboxes located on Server2, but\n" +
				"public mailboxes are available.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit MUST from the worked OK example plus §4's 'If a server " +
				"returns a home server referral in a tagged OK response, it indicates that the " +
				"user's personal mailboxes are elsewhere, but the server contains public mailboxes " +
				"which are readable by the user'). The client must be able to observe this qualified-" +
				"success shape (OK + REFERRAL code together) distinctly from a bare OK, even though " +
				"the LOGIN/AUTHENTICATE command itself completed successfully. Same REAL-signal " +
				"parse surface as RFC2221-4.1-1/-2 (AtomTextCode fallback on the tagged OK's resp-" +
				"text-code); same expected kind-survives/URL-dropped split.",
		},

		// ── §4.2 BYE at connection startup referral ─────────────────────────────

		{
			id: "RFC2221-4.2-1",
			source: "RFC2221",
			section: "4.2",
			title: "Client (implicit) MUST treat an untagged BYE carrying [REFERRAL ...] as a startup redirection, not a bare refusal",
			text:
				"An IMAP4 server MAY respond with an untagged BYE and a REFERRAL\n" +
				"response code that contains an IMAP URL to a home server if it is not\n" +
				"willing to accept connections and wishes to direct the client to\n" +
				"another IMAP4 server.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit MUST from the server-permission MAY sentence and the " +
				"worked example 'S: * BYE [REFERRAL IMAP://user;AUTH=*@SERVER2/] Server not " +
				"accepting connections. Try SERVER2'). A pre-authentication untagged BYE is not, by " +
				"itself, distinguishable from an ordinary connection refusal unless the client " +
				"inspects the resp-code; the RFC anticipates this as the mechanism by which a server " +
				"redirects a client before authentication rather than merely dropping it. Same REAL-" +
				"signal parse surface (untagged BYE's status.text.code via the AtomTextCode fallback); " +
				"same expected kind-survives/URL-dropped split as the tagged-response entries above.",
		},

		// ── §4 Home Server Referrals (general) ──────────────────────────────────

		{
			id: "RFC2221-4-1",
			source: "RFC2221",
			section: "4",
			title: "Client (implicit) MUST NOT assume a home server referral is permanent or temporary",
			text:
				"After receiving a home server referral, the\n" +
				"client can not make any assumptions as to whether this was a\n" +
				"permanent or temporary move of the user.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"There is no wire signal at all — the referral URL and its surrounding text carry no " +
				"permanent-vs-temporary flag — so 'not assuming' is a purely internal abstention with " +
				"zero observable protocol consequence. A client that (incorrectly) caches the referral " +
				"as permanent and one that treats every referral as freshly re-checked on each " +
				"connection are wire-indistinguishable in any single scripted exchange; divergence " +
				"would only surface as a client-side caching-policy choice across sessions, which is " +
				"exactly the cross-session/internal-decision territory this suite's single-session " +
				"harness cannot observe.",
			notes:
				"Judgment level: phrased as a factual statement ('the client can not make any " +
				"assumptions'), not an RFC 2119 keyword sentence, but functions as a normative " +
				"constraint on client behavior in context.",
		},
		{
			id: "RFC2221-4-2",
			source: "RFC2221",
			section: "4",
			title: "Client (implicit) MUST connect to the referral URL's host and use its embedded auth parameter when following a referral",
			text: "user;AUTH=* is specified as required by [IMAP-URL] to avoid a\nclient falling back to anonymous login.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "out-of-band",
			untestableRationale:
				"Exercising this duty requires the client to actually open a second TCP connection to " +
				"the referred host and carry the URL's userid/AUTH-mechanism-restriction segment into " +
				"a follow-up AUTHENTICATE/LOGIN exchange there — a full two-connection, two-handshake " +
				"integration flow. The suite's harness scripts a single connection per test; no driver " +
				"verb exists that follows a parsed referral URL into a new connection at all today, so " +
				"there is nothing to probe short of building an out-of-band multi-server integration " +
				"harness outside this suite's black-box single-session design.",
			notes:
				"Judgment level (implicit MUST derived from the NOTE's stated purpose — avoiding an " +
				"anonymous-login fallback — rather than a direct RFC 2119 sentence addressed to the " +
				"client). Same NOTE text and rationale recur verbatim in RFC2193 (MAILBOX-REFERRALS); " +
				"see RFC2193-3-4 for the mailbox-referral counterpart of this same client duty.",
		},

		// ── §6 Security Considerations ───────────────────────────────────────────

		{
			id: "RFC2221-6-1",
			source: "RFC2221",
			section: "6",
			title: "Client (implicit) MUST carry the URL's AUTH-mechanism restriction forward rather than silently falling back to anonymous login",
			text:
				"With the LOGIN-REFERRALS capability, it is potentially easier to\n" +
				"write a rogue 'password catching' server that collects login data and\n" +
				"then refers the client to their actual IMAP4 server.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "out-of-band",
			untestableRationale:
				"Same out-of-band reasoning as RFC2221-4-2: detecting whether a client silently " +
				"degrades to anonymous login on a followed referral requires actually following the " +
				"referral to a second connection and observing the authentication mechanism it " +
				"chooses there — a two-connection integration scenario the single-session harness " +
				"does not support, and for which no driver verb exists.",
			notes:
				"Judgment level (implicit MUST inferred from the threat-model prose about rogue " +
				"password-catching servers, read together with §3's user;AUTH=* NOTE). This entry " +
				"targets the anti-fallback duty specifically as a security property rather than as " +
				"the general URL-following mechanics already covered by RFC2221-4-2; kept as a " +
				"distinct entry because the RFC motivates it from a different section (Security " +
				"Considerations) with a distinct rationale (rogue-server detection), not merely " +
				"repeated URL-parsing mechanics.",
		},
	],
};

export default rfc2221;
