import type { SpecRequirement } from "../types";

export const note =
	"§7: sections 7.1.1, 7.1.4, and 7.1.5 partially extracted (Phase 0 seed). " +
	"Full extraction of §7 in Phase 1.";

export const requirements: SpecRequirement[] = [
	{
		id: "RFC3501-7.1.1-1",
		source: "RFC3501",
		section: "7.1.1",
		title: "Client accepts the untagged OK greeting",
		text:
			"The untagged form indicates an information-only message; the nature of the information MAY be indicated by a response code. The untagged form is also used as one of three possible greetings at connection startup.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"Implicit client obligation: accept all valid forms of the OK greeting " +
			"(with or without response codes) and proceed.",
	},
	{
		id: "RFC3501-7.1.4-1",
		source: "RFC3501",
		section: "7.1.4",
		title: "Client treats PREAUTH greeting as already authenticated",
		text:
			"The PREAUTH response is always untagged, and is one of three possible greetings at connection startup. It indicates that the connection has already been authenticated by external means; thus no LOGIN command is needed.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev1"],
		testability: "testable",
		notes: "Imperative prose; client must enter authenticated state.",
	},
	{
		id: "RFC3501-7.1.5-1",
		source: "RFC3501",
		section: "7.1.5",
		title: "Client recognizes BYE greeting as connection rejection",
		text:
			"The BYE response is always untagged, and indicates that the server is about to close the connection. The human-readable text MAY be displayed to the user in a status report by the client. The BYE response is sent under one of four conditions: ... 4) as one of three possible greetings at connection startup, indicating that the server is not willing to accept a connection from this client. The server closes the connection immediately.",
		level: "MUST",
		applicability: "always",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"Elision ('...') covers conditions 1)-3) (logout, panic shutdown, " +
			"autologout); condition 4) is the connection-greeting rejection case. " +
			"All retained sentences are verbatim; the previously omitted middle " +
			"sentence ('The human-readable text MAY be displayed...') is now included.",
	},
];
