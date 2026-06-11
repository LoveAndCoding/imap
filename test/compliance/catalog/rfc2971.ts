import type { CatalogModule } from "./types";

const rfc2971: CatalogModule = {
	source: "RFC2971",
	extractionNote:
		"PHASE 0 SEED: section 3.3 (defined field values) extracted; sections 1-3.2, " +
		"4-8 reviewed for client-binding text in Phase 0 only as far as the ID " +
		"command syntax; full extraction in a later phase. Ids are stable.",
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
	],
};

export default rfc2971;
