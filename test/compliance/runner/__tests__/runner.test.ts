// Verifies the helpers register vitest tests with compliance meta attached.
// Meta is asserted indirectly: the wrapper writes to task.meta, which the
// test can read back from its own context.
import { describe, expect, test } from "vitest";

import { complianceTest } from "../compliance-test";
import { defineAcceptanceTable } from "../acceptance-table";
import { classifyFailure, type ComplianceMeta } from "../meta";
import { runComplianceBody } from "../register";
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

describe("runComplianceBody (classification wiring)", () => {
	// The shared try/catch → classifyFailure → tag → rethrow path both
	// wrappers register through. Previously only classifyFailure (the pure
	// function) was tested; the wiring itself was never exercised.
	test("a NotImplementedError is tagged 'unimplemented' and rethrown", async () => {
		const meta: ComplianceMeta = { reqs: ["RFC0000-0.0-6"], profile: "rev1" };
		const boom = new NotImplementedError("DEMO");
		await expect(
			runComplianceBody(meta, async () => {
				throw boom;
			}),
		).rejects.toBe(boom);
		expect(meta.failureKind).toBe("unimplemented");
	});

	test("any other throw is tagged 'violation' and rethrown", async () => {
		const meta: ComplianceMeta = { reqs: ["RFC0000-0.0-7"], profile: "rev2" };
		await expect(
			runComplianceBody(meta, async () => {
				throw new Error("assertion failed");
			}),
		).rejects.toThrow("assertion failed");
		expect(meta.failureKind).toBe("violation");
	});

	test("a passing body leaves failureKind unset", async () => {
		const meta: ComplianceMeta = { reqs: ["RFC0000-0.0-8"], profile: "rev1" };
		await runComplianceBody(meta, async () => undefined);
		expect(meta.failureKind).toBeUndefined();
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
