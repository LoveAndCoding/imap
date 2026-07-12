import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { TestModule } from "vitest/node";

import ComplianceReporter from "../compliance-reporter";

const here = path.dirname(fileURLToPath(import.meta.url));
const specsDir = path.join(here, "..", "..", "specs");

/** Mirror of the reporter's spec-file walk, for building "complete run" fixtures. */
function listSpecTestFiles(): string[] {
	const out: string[] = [];
	const walk = (dir: string): void => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) walk(full);
			else if (entry.name.endsWith(".test.ts")) out.push(path.resolve(full));
		}
	};
	walk(specsDir);
	return out;
}

interface FakeTest {
	fullName: string;
	state: "passed" | "failed";
	compliance?: unknown;
}

function fakeModule(moduleId: string, tests: FakeTest[] = []): TestModule {
	return {
		moduleId,
		children: {
			allTests: () =>
				tests.map((t) => ({
					fullName: t.fullName,
					result: () => ({ state: t.state }),
					meta: () => (t.compliance ? { compliance: t.compliance } : {}),
				})),
		},
	} as unknown as TestModule;
}

// A compliance meta record in the suite's reserved self-test namespace, so it
// counts as an annotated record without perturbing real catalog aggregation.
const selfTestMeta = {
	reqs: ["RFC0000-1.1-1"],
	profile: "rev1",
};

const tmpDirs: string[] = [];
function makeOutDir(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "compliance-reporter-test-"));
	tmpDirs.push(dir);
	return dir;
}

beforeEach(() => {
	// The reporter prints the full console summary / guard diagnostics; keep
	// the meta-test output clean.
	vi.spyOn(console, "log").mockImplementation(() => undefined);
	vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
	vi.restoreAllMocks();
	for (const dir of tmpDirs.splice(0)) {
		fs.rmdirSync(dir, { recursive: true });
	}
});

describe("ComplianceReporter run-completeness guards", () => {
	test("a filtered (partial) run does not write report files", () => {
		const outDir = makeOutDir();
		const reporter = new ComplianceReporter({ outDir });
		const [oneSpecFile] = listSpecTestFiles();

		reporter.onTestRunEnd(
			[
				fakeModule(oneSpecFile, [
					{ fullName: "t", state: "passed", compliance: selfTestMeta },
				]),
			],
			[],
			"passed",
		);

		expect(fs.existsSync(path.join(outDir, "compliance.json"))).toBe(false);
		expect(fs.existsSync(path.join(outDir, "COMPLIANCE.md"))).toBe(false);
	});

	test("an interrupted run does not write report files", () => {
		const outDir = makeOutDir();
		const reporter = new ComplianceReporter({ outDir });
		const modules = listSpecTestFiles().map((f) =>
			fakeModule(f, [{ fullName: "t", state: "passed", compliance: selfTestMeta }]),
		);

		reporter.onTestRunEnd(modules, [], "interrupted");

		expect(fs.existsSync(path.join(outDir, "compliance.json"))).toBe(false);
	});

	test("a complete run with zero compliance-annotated records does not write report files", () => {
		const outDir = makeOutDir();
		const reporter = new ComplianceReporter({ outDir });
		// All spec files ran, but no test produced compliance meta — broken machinery.
		const modules = listSpecTestFiles().map((f) =>
			fakeModule(f, [{ fullName: "t", state: "passed" }]),
		);

		reporter.onTestRunEnd(modules, [], "passed");

		expect(fs.existsSync(path.join(outDir, "compliance.json"))).toBe(false);
	});

	test("a complete run with compliance records writes both report files", () => {
		const outDir = makeOutDir();
		const reporter = new ComplianceReporter({ outDir });
		const modules = listSpecTestFiles().map((f) =>
			fakeModule(f, [{ fullName: "t", state: "passed", compliance: selfTestMeta }]),
		);

		reporter.onTestRunEnd(modules, [], "passed");

		expect(fs.existsSync(path.join(outDir, "compliance.json"))).toBe(true);
		expect(fs.existsSync(path.join(outDir, "COMPLIANCE.md"))).toBe(true);
	});
});
