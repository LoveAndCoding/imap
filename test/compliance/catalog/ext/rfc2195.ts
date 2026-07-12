import type { CatalogModule } from "../types";

const rfc2195: CatalogModule = {
	source: "RFC2195",
	extractionNote:
		"RFC 2195 (CRAM-MD5) has a single normative section, §2 (\"Challenge-Response " +
		"Authentication Mechanism (CRAM)\"), fully reviewed for client-binding requirements " +
		"(entries 2-1 through 2-4). Skipped within §2: the mechanism-name sentence " +
		"('The authentication type associated with CRAM is \"CRAM-MD5\"') is a naming " +
		"fact, not a duty; the challenge-syntax sentence ('The syntax of the unencoded " +
		"form must correspond to that of an RFC 822 msg-id') binds the server's challenge " +
		"generation, not the client; the server-verification paragraph ('When the server " +
		"receives this client response, it verifies the digest...') binds the server; " +
		"'This shared secret is a string known only to the client and server' is " +
		"descriptive scene-setting, not a duty; 'CRAM does not support a protection " +
		"mechanism' is a capability disclaimer with no client action to test. §1 " +
		"(Introduction) is motivational prose with no normative content. §3 (References), " +
		"§5 (Acknowledgements), and §6 (Authors' Addresses) contain no normative text. " +
		"§4 (Security Considerations) binds only the server ('a server that implements " +
		"both a cleartext password command and this authentication type should not allow " +
		"both methods'; 'servers that store the secrets or contexts must both be " +
		"protected') and offers general risk commentary with no client-actionable MUST/" +
		"SHOULD text — no client-binding entries extracted from §4. Cross-references: " +
		"RFC 4422 (SASL) defines the mechanism-negotiation and AUTHENTICATE-exchange " +
		"framework CRAM-MD5 plugs into; RFC 3501 §6.2.2 (AUTHENTICATE command) is the " +
		"IMAP-specific carrier that base64-encodes the CRAM challenge/response octets — " +
		"RFC 2195 §2's own Example paragraph disclaims that base64 framing as belonging " +
		"to AUTHENTICATE, not to CRAM itself (captured in RFC2195-2-4).",
	requirements: [
		{
			id: "RFC2195-2-1",
			source: "RFC2195",
			section: "2",
			title: "Client response is 'username SP digest'",
			text:
				"The client makes note of the data and then responds with a string consisting " +
				"of the user name, a space, and a 'digest'.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"No explicit RFC 2119 keyword ('responds with'); RFC 2195 predates RFC 8174. " +
				"Judgment: implicit MUST, following the RFC3501-catalog convention for " +
				"exclusive-format sentences (cf. RFC3501-6.2.2-2) — this is the sole defined " +
				"response format for the CRAM-MD5 SASL mechanism, and a client that sends " +
				"anything else is not performing CRAM-MD5. Applicability is conditional on the " +
				"client having selected/negotiated AUTH=CRAM-MD5. Observable in the AUTHENTICATE " +
				"exchange as the base64-decoded client continuation line; the client has no " +
				"CRAM-MD5 implementation today (self-actualizing: currently unimplemented, but " +
				"the duty is testable once implemented). Cross-reference: RFC 4422 §5 defines " +
				"the generic SASL client-response framing this specializes; RFC 3501 §6.2.2 is " +
				"the IMAP AUTHENTICATE carrier for the base64-encoded line.",
		},
		{
			id: "RFC2195-2-2",
			source: "RFC2195",
			section: "2",
			title: "Digest is keyed-MD5(shared secret, timestamp-with-angle-brackets)",
			text:
				"The latter is computed by applying the keyed MD5 algorithm from [KEYED-MD5] " +
				"where the key is a shared secret and the digested text is the timestamp " +
				"(including angle-brackets).",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"No explicit RFC 2119 keyword ('is computed by'); RFC 2195 predates RFC 8174. " +
				"Judgment: implicit MUST — this sentence defines the sole algorithm for " +
				"producing the 'digest' half of the mandatory response format in RFC2195-2-1, " +
				"so an implementation using any other computation is not performing CRAM-MD5. " +
				"'[KEYED-MD5]' is HMAC per RFC 2104 (cited in RFC 2195 §3 references). The " +
				"digested text is the server's challenge string verbatim, including its angle " +
				"brackets (e.g. '<1896.697170952@postoffice.reston.mci.net>'), not a stripped " +
				"or reformatted form. Testable: given a fixed shared secret and a scripted " +
				"server challenge, the resulting digest is deterministic and can be checked " +
				"against a reference HMAC-MD5 computation in the client's AUTHENTICATE " +
				"continuation line. Applicability conditional on AUTH=CRAM-MD5 use. " +
				"Cross-reference: RFC 4422 §5 (mechanism-specific response computation).",
		},
		{
			id: "RFC2195-2-3",
			source: "RFC2195",
			section: "2",
			title: "Digest is a 16-octet value sent as lower-case hex",
			text:
				"The `digest' parameter itself is a 16-octet value which is sent in " +
				"hexadecimal format, using lower-case ASCII characters.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"No explicit RFC 2119 keyword ('is sent in'); RFC 2195 predates RFC 8174. " +
				"Judgment: implicit MUST — this fixes the wire encoding of the digest half of " +
				"the RFC2195-2-1 response (32 lower-case hex characters representing the " +
				"16-octet HMAC-MD5 output); upper-case hex or another encoding would not match " +
				"this format. Testable: the client continuation line's digest substring can be " +
				"pattern-matched against /^[0-9a-f]{32}$/ once decoded from base64. Applicability " +
				"conditional on AUTH=CRAM-MD5 use.",
		},
		{
			id: "RFC2195-2-4",
			source: "RFC2195",
			section: "2",
			title: "Base64 framing of CRAM challenge/response belongs to AUTHENTICATE, not CRAM",
			text:
				"The base64 encoding of the challenges and responses is part of the IMAP4 " +
				"AUTHENTICATE command, not part of the CRAM specification itself.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Descriptive scope-clarifying sentence from the Example subsection, not a " +
				"free-standing 2119 sentence; RFC 2195 predates RFC 8174. Judgment: implicit " +
				"MUST by pointer — RFC 2195 explicitly disclaims owning the base64 duty and " +
				"assigns it to the IMAP4 AUTHENTICATE command (RFC 3501 §6.2.2), whose base64 " +
				"framing of SASL client-response octets is itself a MUST. Recorded here (rather " +
				"than only in RFC3501's catalog) so the CRAM-MD5 extraction is self-contained " +
				"about where the 'username SP digest' string in RFC2195-2-1 gets base64-encoded " +
				"before transmission. Testable: the client's continuation line for AUTHENTICATE " +
				"CRAM-MD5 must be valid base64 that decodes to the RFC2195-2-1 string. " +
				"Applicability conditional on AUTH=CRAM-MD5 use via the IMAP4 AUTHENTICATE " +
				"command. Cross-reference: RFC 3501 §6.2.2 (AUTHENTICATE base64 framing); " +
				"RFC 4422 §3.1 (SASL profile requirement to specify how the mechanism's octets " +
				"are carried by the application protocol).",
		},
	],
};

export default rfc2195;
