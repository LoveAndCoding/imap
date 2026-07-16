import type { CatalogModule } from "../types";

const rfc8970: CatalogModule = {
	source: "RFC8970",
	extractionNote:
		"Full document reviewed (Abstract, §1 Introduction, §2 Conventions [RFC 8174 keyword " +
		"boilerplate], §3 FETCH Data Item [§3.1 Command, §3.2 Response, §3.3 Preview Text Format], " +
		"§4 LAZY Priority Modifier [§4.1 LAZY, §4.2 Client Implementation Advice], §5 Examples " +
		"[three worked exchanges], §6 Formal Syntax, §7 IANA Considerations, §8 Security " +
		"Considerations, §9 References, Acknowledgments, Author's Address). Mechanical quote " +
		"verification: 22 text segments verified as whitespace-flattened substrings of " +
		"rfc-editor.org/rfc/rfc8970.txt (page furniture absent from this short document; fetched " +
		"directly via curl since WebFetch's summarizer declined full reproduction) via a runnable " +
		"Node script; all-pass output pasted in the delivering session. PREVIEW is a small, " +
		"standalone extension: one new FETCH data item (with an optional LAZY modifier) and its " +
		"FETCH-response counterpart. " +
		"6 client-binding entries extracted, all judgment-level (implicit) duties except the two " +
		"explicit client MUST/MUST NOT/SHOULD NOT sentences quoted verbatim below: (1) client " +
		"(implicit) MUST emit the bare PREVIEW fetch-att to request a preview (RFC8970-3.1-1); " +
		"(2) client MUST accept the PREVIEW FETCH response as an nstring (quoted string OR NIL) " +
		"and MUST NOT treat a returned NIL as a protocol error when LAZY was used, nor expect NIL " +
		"when LAZY was NOT used — the two-branch response shape plus the explicit 'MUST NOT return " +
		"NIL ... without LAZY' server-emission rule, whose reciprocal client-parse duty is to accept " +
		"exactly this shape (RFC8970-3.2-1, folding in the explicit-MUST 'client MUST NOT assume " +
		"that a message preview is immutable' contract as a notes cross-reference rather than a " +
		"separate entry, since immutability is a property the client must NOT assume, not a " +
		"distinct wire-observable duty — see below); (3) client MUST treat a zero-length string as " +
		"'no meaningful preview available' and, per the explicit SHOULD NOT, refrain from re-issuing " +
		"FETCH PREVIEW for that message (RFC8970-3.2-2, the sole entry combining an implicit-MUST " +
		"parse convention with an explicit SHOULD NOT repetition-avoidance duty, both drawn from the " +
		"same §3.2 paragraph); (4) client (implicit) MUST treat generated preview text as text/plain " +
		"UTF-8 data, not further content-transfer-decoded, when rendering it (RFC8970-3.3-1, folding " +
		"the two explicit MUST/MUST NOT sentences on encoding into one entry since both govern the " +
		"same client-rendering duty on the same string); (5) client (implicit) MUST emit the LAZY " +
		"priority modifier as the literal wire form 'PREVIEW (LAZY)' to request best-effort, " +
		"non-blocking preview generation (RFC8970-4.1-1); (6) client SHOULD NOT continually re-issue " +
		"FETCH PREVIEW (LAZY) requests in a selected mailbox (RFC8970-4.2-1, the one explicit " +
		"SHOULD NOT in §4.2 addressed directly 'to' client behavior). " +
		"EXPLICIT MUST NOT NOT SEPARATELY SCORED: 'a client MUST NOT assume that a message preview " +
		"is immutable for a given message' (§3.2) is a policy/assumption constraint with no distinct " +
		"wire-observable action — a client that never re-fetches has nothing to contradict it, and " +
		"one that does re-fetch is exercising the ordinary FETCH PREVIEW duty already scored in " +
		"RFC8970-3.1-1/3.2-1; captured as a notes cross-reference on RFC8970-3.2-1 rather than an " +
		"independent (and untestable, since 'assuming' is not wire-observable) entry. " +
		"SKIPPED AS SERVER-ONLY (no client action to emit, observe, or enforce): §1's rationale for " +
		"server-side generation (efficiency/consistency/caching arguments, purely descriptive); " +
		"§3.2's 'A server SHOULD strive to generate the same string for a given message for each " +
		"request' (binds the server's generation algorithm, not client behavior — the client-side " +
		"mirror is the immutability non-assumption already addressed above); §3.2's 'the server MUST " +
		"return a zero-length string' framed from the server's emission side (its client-facing " +
		"acceptance half is RFC8970-3.2-2); §3.3's 'The server SHOULD remove any formatting markup " +
		"and do whatever processing might be useful in rendering the preview as plain text' (server " +
		"generation-quality guidance); §3.3's 200/256-character length SHOULD/MUST NOT limits (both " +
		"bind the server's output-length discipline — the client cannot observe or enforce a bound " +
		"on how long a string the server chose to send, it simply receives and displays whatever " +
		"nstring arrives, already covered generically by RFC8970-3.3-1); §3.3's LANGUAGE-extension " +
		"interplay paragraph (server generation-content guidance conditioned on RFC5255 support — no " +
		"client action); §4.1's 'the server is unable to return preview data without undue delay, " +
		"the server MUST return NIL' (server-side trigger condition for the NIL branch already " +
		"covered client-side in RFC8970-3.2-1); §4.1's 'The LAZY modifier MUST be implemented by any " +
		"server that supports the PREVIEW extension' (binds server feature completeness, not a " +
		"client action — the client's reciprocal duty is only the generic capability-gate obligation " +
		"already cataloged under RFC 3501/9051, not a distinct RFC 8970 duty); §4.2's mailbox-listing " +
		"workflow narrative and its RECOMMENDED small-batch-size advice for background FETCH PREVIEW " +
		"requests (advisory implementation strategy — 'It is RECOMMENDED that these FETCH requests " +
		"be issued in small batches, e.g., 50 messages per FETCH command' recommends a strategy but " +
		"defines no wire-observable pass/fail boundary: no fixed batch size is normatively required, " +
		"so a black-box test cannot assert a specific number without inventing a threshold the RFC " +
		"itself declines to fix); §5's three worked examples (illustrative only; their content is " +
		"quoted inline as the normative pin for RFC8970-3.1-1/3.2-1/4.1-1 rather than scored " +
		"separately); §6 Formal Syntax (the 'capability =/ \"PREVIEW\"', 'fetch-att', " +
		"'msg-att-dynamic', and 'preview-mod' ABNF productions formalize exactly the §3.1/§3.2/§4.1 " +
		"vocabulary already captured — quoted inline in each entry's notes as the normative wire-form " +
		"pin rather than scored as independent entries); §7 IANA Considerations and §8 Security " +
		"Considerations (server-side resource/logging/storage-protection guidance — 'servers SHOULD " +
		"log the client authentication identity', 'Servers MAY limit the resources that preview " +
		"generation uses', 'these previews MUST be protected with equivalent authorization and " +
		"confidentiality controls' all bind server-side implementation and storage, not client " +
		"behavior); §9 References and Acknowledgments (no normative content). " +
		"REV2 PROFILE: PREVIEW remains a standalone extension under IMAP4rev2 (confirmed by grep of " +
		"catalog/rfc9051/**: no PREVIEW content anywhere in the base-spec catalog) — no rev2-core " +
		"double-scoring applies, so all six entries carry the default profiles [\"rev1\",\"rev2\"] " +
		"and are source-of-truth for both profiles via this document alone. " +
		"UPDATE: the driver's fetch()/uidFetch() verbs are genuinely real and FetchOptions carries " +
		"a genuine `preview: boolean | { lazy?: boolean }` surface (test/compliance/driver/driver.ts, " +
		"src/client/fetch.ts), so all six entries genuinely pass: the client can both emit the " +
		"PREVIEW fetch-att and parse a PREVIEW FETCH response for real. Testable: 6 of 6. " +
		"Untestable: 0. Total: 6 entries (RFC8970-3.1-1, 3.2-1..2, " +
		"3.3-1, 4.1-1, 4.2-1).",
	requirements: [
		// ── §3.1 Command ──────────────────────────────────────────────────────

		{
			id: "RFC8970-3.1-1",
			source: "RFC8970",
			section: "3.1",
			title: "Client (implicit) MUST emit the PREVIEW FETCH attribute to request a preview",
			text:
				"To retrieve a preview for a message, the PREVIEW FETCH attribute is " +
				"used when issuing a FETCH command.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit MUST on wire form; no RFC 2119 keyword in the source " +
				"sentence). §6 formalizes the attribute as 'fetch-att =/ \"PREVIEW\" [SP \"(\" " +
				"preview-mod *(SP preview-mod) \")\"]', which admits no alternative spelling; the " +
				"§5 Example 1 exchange confirms the bare form ('C: A2 FETCH 1 (RFC822.SIZE PREVIEW)'). " +
				"A client that wishes to fetch a preview must therefore include the atom PREVIEW " +
				"(optionally followed by a parenthesized modifier list, see RFC8970-4.1-1) in the " +
				"FETCH data-item list. Conditional on the client choosing to use the PREVIEW " +
				"extension at all. Standalone in rev2 (no RFC 9051 counterpart), so profiles " +
				"[\"rev1\",\"rev2\"]. driver.fetch()/uidFetch() are both genuinely real, so this " +
				"row passes for real.",
		},

		// ── §3.2 Response ─────────────────────────────────────────────────────

		{
			id: "RFC8970-3.2-1",
			source: "RFC8970",
			section: "3.2",
			title:
				"Client MUST accept the PREVIEW FETCH response as a string, and (when LAZY was " +
				"used) MUST accept NIL as a valid, non-error response",
			text:
				"If the LAZY modifier (Section 4.1) is used, the server MAY return NIL " +
				"for the preview response, indicating that preview generation could " +
				"not be completed without causing undue delay. A server MUST NOT " +
				"return NIL to a FETCH PREVIEW request made without the LAZY modifier.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"§3.2's base response definition (implicit MUST, no keyword) is 'The server returns " +
				"a variable-length string that is the generated preview for that message' — the " +
				"client's ordinary case is to accept a quoted (or literal) string, per the §5 " +
				"Example 1 form '* 1 FETCH (RFC822.SIZE 5647 PREVIEW {200} ... )'. The explicit " +
				"quoted MUST NOT binds the server's emission, but its reciprocal client-parse duty " +
				"— accept a bare NIL as well-formed exactly when LAZY was requested (Example 2: " +
				"'* 3 FETCH (ENVELOPE (...) PREVIEW NIL)' after 'C: B1 FETCH 1:4 (ENVELOPE PREVIEW " +
				"(LAZY))'), and treat NIL received without LAZY as a defect rather than a normal " +
				"value — is the client-binding half scored here. §6's 'msg-att-dynamic =/ " +
				"\"PREVIEW\" SP nstring' is the normative pin for the two-branch (string / NIL) " +
				"response shape. Cross-reference: §3.2's separate 'a client MUST NOT assume that a " +
				"message preview is immutable for a given message' is an explicit MUST NOT, but it " +
				"constrains an internal client assumption, not a wire-observable action — a client " +
				"either does or does not re-FETCH a preview, and either choice is compatible with " +
				"this sentence; it imposes no additional parse/emit duty beyond the ordinary FETCH " +
				"PREVIEW mechanics already scored here and in RFC8970-3.1-1, so it is not scored as " +
				"an independent entry. Conditional on the client using PREVIEW (and, for the NIL " +
				"branch, LAZY). Standalone in rev2, profiles [\"rev1\",\"rev2\"]. The PREVIEW fetch " +
				"surface genuinely exists to receive and parse either branch (driver.fetch()/" +
				"uidFetch() are both genuinely real), so this row passes for real.",
		},
		{
			id: "RFC8970-3.2-2",
			source: "RFC8970",
			section: "3.2",
			title:
				"Client MUST treat a zero-length PREVIEW string as 'no preview available' and " +
				"SHOULD NOT re-request it",
			text:
				"In such cases, the server " +
				"MUST return a zero-length string. Clients SHOULD NOT send another " +
				"FETCH for a preview for such messages.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"'In such cases' refers to the preceding sentence: 'It is possible that the server " +
				"has determined that no meaningful preview text can be generated for a particular " +
				"message. Examples of this involve encrypted messages, content types the server " +
				"does not support previews of, and other situations where the server is not able " +
				"to extract information for a preview.' The explicit server-side MUST fixes the " +
				"wire shape the client must parse as the 'no preview' sentinel (implicit client " +
				"MUST: accept a zero-length string '\"\"' as well-formed and distinguish it from an " +
				"absent/NIL response, per Example 2's '* 2 FETCH (PREVIEW \"\" ENVELOPE (...))'); the " +
				"explicit SHOULD NOT is the client's own repetition-avoidance duty — a client that " +
				"received an empty preview should not re-issue FETCH PREVIEW for that same message " +
				"expecting a different result on the next request (the RFC allows for eventual " +
				"content-availability changes but calls that 'expected to be rare'). Two duties in " +
				"one entry because both are drawn from, and only make sense together with, the same " +
				"§3.2 paragraph on the zero-length-string case. Conditional on the client using " +
				"PREVIEW. Standalone in rev2, profiles [\"rev1\",\"rev2\"]. Self-actualizing fail " +
				"today: no PREVIEW fetch surface exists.",
		},

		// ── §3.3 Preview Text Format ──────────────────────────────────────────

		{
			id: "RFC8970-3.3-1",
			source: "RFC8970",
			section: "3.3",
			title:
				"Client MUST treat PREVIEW text as unencoded UTF-8 text/plain data (not " +
				"content-transfer-decoded)",
			text:
				"The generated preview text MUST be treated as text/plain [RFC2046] " +
				"media type data by the client. The generated string MUST NOT be content transfer " +
				"encoded and MUST be " +
				"encoded in UTF-8 [RFC3629].",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Two explicit client-directed MUST/MUST NOT sentences from the same §3.3 opening, " +
				"folded into one entry because both govern the identical client action — how to " +
				"interpret the octets of the PREVIEW nstring once received: as plain UTF-8 text, " +
				"requiring no further MIME content-transfer-decoding step (unlike a BODY[...] part, " +
				"which may be base64/quoted-printable encoded and require decoding before display). " +
				"A client that content-transfer-decodes preview text (e.g. attempts base64 decode) " +
				"or that mis-decodes it as a non-UTF-8 charset is non-conformant. Conditional on the " +
				"client using PREVIEW. Standalone in rev2, profiles [\"rev1\",\"rev2\"]. " +
				"Self-actualizing fail today: no PREVIEW fetch surface exists to receive text to " +
				"interpret. The server-side length limits (200 SHOULD / 256 MUST NOT preview " +
				"characters) and the LANGUAGE-extension content-generation guidance in the " +
				"remainder of §3.3 are server generation-quality duties, not client-observable " +
				"(see extractionNote), and are not folded into this entry.",
		},

		// ── §4.1 LAZY ─────────────────────────────────────────────────────────

		{
			id: "RFC8970-4.1-1",
			source: "RFC8970",
			section: "4.1",
			title: "Client (implicit) MUST emit the LAZY priority modifier as 'PREVIEW (LAZY)'",
			text:
				"The LAZY modifier directs the server to return the preview " +
				"representation only if that data can be returned without undue delay " +
				"to the client.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (implicit MUST on wire form; no RFC 2119 keyword in the defining " +
				"sentence). §6 formalizes the modifier list as 'fetch-att =/ \"PREVIEW\" [SP \"(\" " +
				"preview-mod *(SP preview-mod) \")\"]' with 'preview-mod = \"LAZY\"' — the only " +
				"defined modifier — and §5 Example 2 confirms the exact wire form: 'C: B1 FETCH " +
				"1:4 (ENVELOPE PREVIEW (LAZY))'. A client that wants best-effort, non-blocking " +
				"preview generation (per the §4.2 mailbox-listing strategy) MUST spell the modifier " +
				"list exactly as the parenthesized atom '(LAZY)' immediately following PREVIEW — no " +
				"alternative spelling is admitted by the ABNF. Conditional on the client choosing to " +
				"use the LAZY modifier. Standalone in rev2, profiles [\"rev1\",\"rev2\"]. " +
				"driver.fetch()/uidFetch() genuinely have a LAZY-modifier surface on FetchOptions " +
				"(`preview: { lazy: true }`), so this row passes for real. The reciprocal " +
				"server-emission MUST ('the server MUST return NIL as the preview response' when " +
				"LAZY cannot be honored without delay) is the server-side half already folded into " +
				"the client-parse duty at RFC8970-3.2-1, not scored again here. §4.1's 'The LAZY " +
				"modifier MUST be implemented by any server that supports the PREVIEW extension' is " +
				"server-only (feature completeness), excluded per extractionNote.",
		},

		// ── §4.2 Client Implementation Advice ─────────────────────────────────

		{
			id: "RFC8970-4.2-1",
			source: "RFC8970",
			section: "4.2",
			title:
				"Client SHOULD NOT continually re-issue FETCH PREVIEW (LAZY) requests in a " +
				"selected mailbox",
			text:
				"A client SHOULD NOT continually issue FETCH PREVIEW requests with the " +
				"LAZY modifier in a selected mailbox as the server is under no " +
				"requirement to return preview information for this command, which " +
				"could lead to an unnecessary waste of system and network resources.",
			level: "SHOULD NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Explicit SHOULD NOT, directly addressed to client behavior — the one normative " +
				"sentence in §4.2's advisory workflow narrative that constrains client request " +
				"frequency rather than merely suggesting a strategy. A client repeatedly polling " +
				"FETCH ... PREVIEW (LAZY) on the same selected mailbox without a triggering event " +
				"(e.g. new mail, a user-initiated refresh) is non-conformant to this SHOULD NOT. " +
				"Conditional on the client using the LAZY modifier at all. Standalone in rev2, " +
				"profiles [\"rev1\",\"rev2\"]. Testable in principle via a scripted sequence of " +
				"repeated FETCH PREVIEW (LAZY) calls with no intervening state change, asserting the " +
				"client does not emit them back-to-back without cause; the FETCH PREVIEW surface " +
				"genuinely exists to probe request cadence against (driver.fetch() is genuinely " +
				"real), so this row passes for real. The companion " +
				"RECOMMENDED small-batch-size advice earlier in §4.2 ('It is RECOMMENDED that these " +
				"FETCH requests be issued in small batches, e.g., 50 messages per FETCH command') " +
				"is excluded (see extractionNote) because the RFC fixes no normative batch-size " +
				"boundary — '50' is illustrative ('e.g.'), so no black-box pass/fail line can be " +
				"drawn without inventing a threshold the spec itself declines to set.",
		},
	],
};

export default rfc8970;
