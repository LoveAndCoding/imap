import type { CatalogModule } from "./types";

const rfc2971: CatalogModule = {
	source: "RFC2971",
	extractionNote:
		"PHASE 0 SEED: section 3.3 (defined field values) fully extracted for " +
		"client-binding requirements (entries 3.3-1 through 3.3-4). Sections 1-3.2 " +
		"cover protocol framing and server obligations (no additional client-binding " +
		"MUST/MUST NOT text); sections 4-8 cover security, IANA, and references " +
		"(no client-binding normative requirements). Ids are stable.",
	requirements: [
		{
			id: "RFC2971-3.3-1",
			source: "RFC2971",
			section: "3.3",
			title: "At most 30 field-value pairs in ID",
			text: "Implementations MUST NOT send more than 30 field-value pairs.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
		},
		{
			id: "RFC2971-3.3-2",
			source: "RFC2971",
			section: "3.3",
			title: "ID field/value length limits",
			text:
				"Field strings MUST NOT be longer than 30 octets. Value strings MUST NOT be longer than 1024 octets.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
		},
		{
			id: "RFC2971-3.3-3",
			source: "RFC2971",
			section: "3.3",
			title: "No duplicate field names in ID",
			text: "Implementations MUST NOT send the same field name more than once.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Observable at the protocol layer: a sent ID command can be inspected " +
				"for repeated field names in the parameter list.",
		},
		{
			id: "RFC2971-3.3-4",
			source: "RFC2971",
			section: "3.3",
			title: "MUST NOT use contact information for automatic bug reports",
			text:
				"Implementations MUST NOT use contact information to submit automatic bug reports.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableRationale:
				"This requirement constrains out-of-band client behavior (whether the " +
				"client software silently submits bug reports using contact details from " +
				"the server ID response). No protocol-layer observation can confirm or " +
				"deny compliance; it requires code audit or vendor attestation.",
		},
	],
};

export default rfc2971;
