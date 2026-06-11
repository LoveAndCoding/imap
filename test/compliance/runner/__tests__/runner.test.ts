// Verifies the helpers register vitest tests with compliance meta attached.
// Meta is asserted indirectly: the wrapper writes to task.meta, which the
// test can read back from its own context.
import { describe, expect, test } from "vitest";

import { complianceTest } from "../compliance-test";
import { defineAcceptanceTable } from "../acceptance-table";
import { classifyFailure } from "../meta";
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

});

describe("classifyFailure", () => {
	// Both wrappers delegate to this helper to tag failures for the reporter.
	test("NotImplementedError → unimplemented", () => {
		expect(classifyFailure(new NotImplementedError("DEMO"))).toBe("unimplemented");
	});

	test("any other error → violation", () => {
		expect(classifyFailure(new Error("assertion failed"))).toBe("violation");
		expect(classifyFailure("string throw")).toBe("violation");
	});
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
