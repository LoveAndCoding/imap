import type { CatalogModule } from "./types";

const rfc9525: CatalogModule = {
	source: "RFC9525",
	extractionNote:
		"PHASE 0 SEED: the core identity-verification outcome requirement (section " +
		"6.6) only, to prove TLS machinery. Full extraction (with RFC 8314) happens " +
		"in Phase 3.",
	requirements: [
		{
			id: "RFC9525-6.6-1",
			source: "RFC9525",
			section: "6.6",
			title: "Client rejects certificates that fail identity verification",
			text:
				"If the client does not find a presented identifier matching any of the reference identifiers, then the client MUST proceed as follows. If the client is an automated application, then it SHOULD terminate the communication attempt with a bad certificate error and log the error appropriately. The application MAY provide a configuration setting to disable this behavior, but it MUST NOT disable this security control by default.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Composite requirement: on identity mismatch an automated client SHOULD " +
				"terminate with a bad certificate error, and MUST NOT disable that " +
				"security control by default. Tested as: with default options, a " +
				"certificate whose presented identifiers do not match the reference " +
				"identifiers causes connection failure. Applicability is conditional: " +
				"this requirement applies only when TLS is in use. The client supports " +
				"plaintext connections (no TLS), so certificate identity verification " +
				"binds only when the caller opts into a TLS-secured connection.",
		},
	],
};

export default rfc9525;
