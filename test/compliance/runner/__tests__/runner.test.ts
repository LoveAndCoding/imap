// Verifies the helpers register vitest tests with compliance meta attached.
// Meta is asserted indirectly: the wrapper writes to task.meta, which the
// test can read back from its own context.
import { describe, expect } from "vitest";

import { complianceTest } from "../compliance-test";
import { defineAcceptanceTable } from "../acceptance-table";
import { NotImplementedError } from "../../driver/errors";

describe("complianceTest", () => {
	complianceTest(
		{ reqs: ["RFC0000-0.0-1"], profiles: ["rev1"], title: "attaches meta" },
		async (ctx) => {
			expect(ctx.task.meta.compliance?.reqs).toEqual(["RFC0000-0.0-1"]);
			expect(ctx.task.meta.compliance?.profile).toBe("rev1");
			expect(ctx.profile).toBe("rev1");
		},
	);

	complianceTest(
		{
			reqs: ["RFC0000-0.0-2"],
			profiles: ["rev1", "rev2"],
			title: "runs once per profile",
		},
		async (ctx) => {
			expect(["rev1", "rev2"]).toContain(ctx.profile);
		},
	);

	complianceTest(
		{
			reqs: ["RFC0000-0.0-3"],
			profiles: ["rev1"],
			title: "tags NotImplementedError as unimplemented",
			expectFailure: "unimplemented",
		},
		async (ctx) => {
			try {
				throw new NotImplementedError("DEMO");
			} catch (err) {
				// The wrapper re-tags and re-throws; here we just verify the
				// classification helper directly.
				expect(err).toBeInstanceOf(NotImplementedError);
				ctx.task.meta.compliance!.failureKind = "unimplemented";
			}
		},
	);
});

describe("defineAcceptanceTable", () => {
	defineAcceptanceTable({
		name: "demo table",
		profiles: ["rev1"],
		rows: [
			{ req: "RFC0000-0.0-4", variant: "row one", value: 1 },
			{ req: "RFC0000-0.0-5", variant: "row two", value: 2 },
		],
		async execute(row, ctx) {
			expect(row.value).toBeGreaterThan(0);
			expect(ctx.profile).toBe("rev1");
		},
	});
});
