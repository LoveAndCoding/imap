import type { SpecRequirement } from "../types";

export const note =
	"§6.1: section 6.1.2 partially extracted (Phase 0 seed). " +
	"§6.2: section 6.2.1 partially extracted (Phase 0 seed). " +
	"Full extraction of §6.1–6.2 in Phase 1.";

export const requirements: SpecRequirement[] = [
	{
		id: "RFC3501-6.1.2-1",
		source: "RFC3501",
		section: "6.1.2",
		title: "NOOP usable as a periodic poll",
		text:
			"Since any command can return a status update as untagged data, the NOOP command can be used as a periodic poll for new messages or message status updates during a period of inactivity (this is the preferred method to do this).",
		level: "MAY",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"Capability statement; tested as 'client offers a way to issue NOOP'. " +
			"Currently expected to fail as unimplemented (no public NOOP surface).",
	},
	{
		id: "RFC3501-6.2.1-1",
		source: "RFC3501",
		section: "6.2.1",
		title: "Client discards cached capabilities after STARTTLS",
		text:
			"Once [TLS] has been started, the client MUST discard cached information about server capabilities and SHOULD re-issue the CAPABILITY command.",
		level: "MUST",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes: "MUST half of the sentence (discard cached capabilities).",
	},
	{
		id: "RFC3501-6.2.1-2",
		source: "RFC3501",
		section: "6.2.1",
		title: "Client re-issues CAPABILITY after STARTTLS",
		text:
			"Once [TLS] has been started, the client MUST discard cached information about server capabilities and SHOULD re-issue the CAPABILITY command.",
		level: "SHOULD",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes: "SHOULD half of the sentence (re-issue CAPABILITY).",
	},
	{
		id: "RFC3501-6.2.1-3",
		source: "RFC3501",
		section: "6.2.1",
		title: "Client MUST NOT send further commands until TLS negotiation is complete",
		text:
			"A [TLS] negotiation begins immediately after the CRLF at the end of the tagged OK response from the server.  Once a client issues a STARTTLS command, it MUST NOT issue further commands until a server response is seen and the [TLS] negotiation is complete.",
		level: "MUST NOT",
		applicability: "conditional",
		profiles: ["rev1"],
		testability: "testable",
		notes:
			"Two contiguous sentences from §6.2.1. The first establishes when TLS " +
			"begins; the second is the explicit MUST NOT keyword binding the client. " +
			"Level updated from MUST to MUST NOT to reflect the actual 2119 keyword " +
			"present in the text.",
	},
];
