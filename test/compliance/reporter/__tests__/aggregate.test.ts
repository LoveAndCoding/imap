import { describe, expect, test } from "vitest";

import { aggregate, type TestRecord } from "../aggregate";
import type { CatalogModule } from "../../catalog/types";

const catalog: CatalogModule[] = [
	{
		source: "RFCTEST",
		extractionNote: "synthetic module for aggregate unit tests only",
		requirements: [
			{
				id: "RFCTEST-1.1-1",
				source: "RFCTEST",
				section: "1.1",
				title: "passing req",
				text: "The client MUST pass.",
				level: "MUST",
				applicability: "always",
				profiles: ["rev1"],
				testability: "testable",
			},
			{
				id: "RFCTEST-1.1-2",
				source: "RFCTEST",
				section: "1.1",
				title: "failing req",
				text: "The client MUST also do the thing.",
				level: "MUST",
				applicability: "always",
				profiles: ["rev1"],
				testability: "testable",
			},
			{
				id: "RFCTEST-1.2-1",
				source: "RFCTEST",
				section: "1.2",
				title: "untested req",
				text: "The client SHOULD do something untested.",
				level: "SHOULD",
				applicability: "always",
				profiles: ["rev1"],
				testability: "testable",
			},
			{
				id: "RFCTEST-1.3-1",
				source: "RFCTEST",
				section: "1.3",
				title: "untestable req",
				text: "The client MUST NOT do internal things.",
				level: "MUST NOT",
				applicability: "always",
				profiles: ["rev1"],
				testability: "untestable",
				untestableRationale: "not observable at the protocol layer",
			},
		],
	},
];

const tests: TestRecord[] = [
	{
		name: "t1",
		state: "passed",
		meta: { reqs: ["RFCTEST-1.1-1"], profile: "rev1" },
	},
	{
		name: "t2",
		state: "failed",
		meta: { reqs: ["RFCTEST-1.1-2"], profile: "rev1", failureKind: "unimplemented" },
	},
	{ name: "unrelated harness self-test", state: "passed" },
];

describe("aggregate", () => {
	const report = aggregate(catalog, tests);

	test("statuses per requirement", () => {
		const byId = new Map(report.requirements.map((r) => [r.req.id, r]));
		expect(byId.get("RFCTEST-1.1-1")!.byProfile.rev1!.status).toBe("pass");
		expect(byId.get("RFCTEST-1.1-2")!.byProfile.rev1!.status).toBe("fail");
		expect(byId.get("RFCTEST-1.1-2")!.byProfile.rev1!.failureKind).toBe("unimplemented");
		expect(byId.get("RFCTEST-1.2-1")!.byProfile.rev1!.status).toBe("untested");
		expect(byId.get("RFCTEST-1.3-1")!.byProfile.rev1!.status).toBe("untestable");
	});

	test("scores exclude untestable, count untested as not-passed", () => {
		const must = report.summary.find(
			(s) => s.source === "RFCTEST" && s.profile === "rev1" && s.level === "MUST",
		)!;
		// MUST bucket: 1.1-1 pass, 1.1-2 fail → 1/2
		expect(must.counts).toEqual({
			pass: 1,
			violation: 0,
			unimplemented: 1,
			untested: 0,
			untestable: 0,
		});
		expect(must.score).toBeCloseTo(0.5);

		const should = report.summary.find(
			(s) => s.source === "RFCTEST" && s.profile === "rev1" && s.level === "SHOULD",
		)!;
		expect(should.counts.untested).toBe(1);
		expect(should.score).toBe(0);

		const mustNot = report.summary.find(
			(s) => s.source === "RFCTEST" && s.profile === "rev1" && s.level === "MUST NOT",
		)!;
		expect(mustNot.counts.untestable).toBe(1);
		// denominator empty → score reported as null
		expect(mustNot.score).toBeNull();
	});

	test("flags tests citing unknown requirement ids", () => {
		const bad = aggregate(catalog, [
			{ name: "tX", state: "passed", meta: { reqs: ["NOPE-1.1-1"], profile: "rev1" } },
		]);
		expect(bad.problems.some((p) => p.includes("NOPE-1.1-1"))).toBe(true);
	});

	test("reserved RFC0000 self-test namespace is ignored, even with an empty catalog", () => {
		const selfTest = {
			name: "runner self-test",
			state: "passed" as const,
			meta: { reqs: ["RFC0000-0.0-1"], profile: "rev1" as const },
		};
		expect(aggregate(catalog, [selfTest]).problems).toEqual([]);
		expect(aggregate([], [selfTest]).problems).toEqual([]);
	});

	test("a violation outranks an unimplemented annotation", () => {
		const mixed = aggregate(catalog, [
			{
				name: "tA",
				state: "failed",
				meta: { reqs: ["RFCTEST-1.1-1"], profile: "rev1", failureKind: "unimplemented" },
			},
			{
				name: "tB",
				state: "failed",
				meta: { reqs: ["RFCTEST-1.1-1"], profile: "rev1", failureKind: "violation" },
			},
		]);
		const r = mixed.requirements.find((x) => x.req.id === "RFCTEST-1.1-1")!;
		expect(r.byProfile.rev1!.failureKind).toBe("violation");
	});

	// Fix 1: deterministic output — two calls with the same records in different order must be deeply equal.
	test("deterministic output: different input orders produce deeply-equal results", () => {
		const recordsA: TestRecord[] = [
			{ name: "t1", state: "passed", meta: { reqs: ["RFCTEST-1.1-1"], profile: "rev1" } },
			{
				name: "t2",
				state: "failed",
				meta: { reqs: ["RFCTEST-1.1-2"], profile: "rev1", failureKind: "unimplemented" },
			},
		];
		const recordsB: TestRecord[] = [
			{
				name: "t2",
				state: "failed",
				meta: { reqs: ["RFCTEST-1.1-2"], profile: "rev1", failureKind: "unimplemented" },
			},
			{ name: "t1", state: "passed", meta: { reqs: ["RFCTEST-1.1-1"], profile: "rev1" } },
		];
		const a = aggregate(catalog, recordsA);
		const b = aggregate(catalog, recordsB);
		expect(JSON.stringify(a, null, "\t")).toBe(JSON.stringify(b, null, "\t"));
		expect(a).toEqual(b);
	});

	// Fix 3: a failed record with meta lacking failureKind yields status fail with failureKind "violation".
	test("failed test with no failureKind annotation defaults to 'violation'", () => {
		const result = aggregate(catalog, [
			{
				name: "tTimeout",
				state: "failed",
				meta: { reqs: ["RFCTEST-1.1-1"], profile: "rev1" }, // no failureKind
			},
		]);
		const r = result.requirements.find((x) => x.req.id === "RFCTEST-1.1-1")!;
		expect(r.byProfile.rev1!.status).toBe("fail");
		expect(r.byProfile.rev1!.failureKind).toBe("violation");
	});

	// Fix 4: cites a known requirement id under a profile NOT in that requirement's profiles list.
	test("flags test citing req under a profile it doesn't apply to", () => {
		// RFCTEST-1.1-1 only has profiles: ["rev1"]; citing under "rev2" should produce a problem.
		const result = aggregate(catalog, [
			{
				name: "tWrongProfile",
				state: "passed",
				meta: { reqs: ["RFCTEST-1.1-1"], profile: "rev2" },
			},
		]);
		expect(result.problems.some((p) =>
			p.includes("RFCTEST-1.1-1") && p.includes("rev2") && p.includes("rev1"),
		)).toBe(true);
	});

	test("flags a passing test that declared expectFailure (stale hint)", () => {
		const result = aggregate(catalog, [
			{
				name: "tStale",
				state: "passed",
				meta: { reqs: ["RFCTEST-1.1-1"], profile: "rev1", expectFailure: "unimplemented" },
			},
		]);
		expect(result.problems.some((p) => p.includes("stale expectFailure"))).toBe(true);
	});
});
