import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { Reporter, SerializedError, TestModule, TestRunEndReason } from "vitest/node";

import { allCatalogModules } from "../catalog";
import { aggregate, type TestRecord } from "./aggregate";
import { renderConsole, renderMarkdown } from "./render";

const here = path.dirname(fileURLToPath(import.meta.url));

export default class ComplianceReporter implements Reporter {
	private readonly outDir: string;

	constructor(opts: { outDir?: string } = {}) {
		this.outDir = opts.outDir ?? path.join(here, "..", "reports");
	}

	/**
	 * Every spec test file that must have run for the aggregated report to be
	 * meaningful. aggregate() marks any catalog requirement without a record
	 * "untested", so writing the report after a filtered/partial run would
	 * clobber the real "source of truth" with mostly-untested data.
	 */
	private listSpecTestFiles(): string[] {
		const specsDir = path.join(here, "..", "specs");
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

	onTestRunEnd(
		testModules: ReadonlyArray<TestModule>,
		_unhandledErrors: ReadonlyArray<SerializedError>,
		reason: TestRunEndReason,
	): void {
		const records: TestRecord[] = [];
		for (const mod of testModules) {
			for (const tc of mod.children.allTests()) {
				const result = tc.result();
				const state =
					result.state === "passed"
						? "passed"
						: result.state === "failed"
							? "failed"
							: "skipped";
				const meta = tc.meta() as { compliance?: TestRecord["meta"] };
				records.push({
					name: tc.fullName,
					state,
					meta: meta.compliance,
				});
			}
		}
		// Guard 1 (partial run): only a run that executed every spec test file
		// may rewrite the report files. A filtered `vitest run <file>` (or an
		// interrupted run) would otherwise overwrite compliance.json/COMPLIANCE.md
		// with almost-everything-untested data.
		const ranFiles = new Set(testModules.map((m) => path.resolve(m.moduleId)));
		const missing = this.listSpecTestFiles().filter((f) => !ranFiles.has(f));
		if (reason === "interrupted" || missing.length > 0) {
			// eslint-disable-next-line no-console
			console.error(
				`compliance-reporter: partial run detected (${
					reason === "interrupted" ? "interrupted; " : ""
				}${missing.length} spec test file(s) did not run) — ` +
					`${this.outDir} was NOT rewritten. Run the full suite (yarn test:compliance) to regenerate reports.`,
			);
			return;
		}

		// Guard 2 (all-untested smoke check): a complete run must produce at
		// least one compliance-annotated record; zero means the meta plumbing
		// broke, and writing would report every requirement as untested.
		if (!records.some((r) => r.meta)) {
			// eslint-disable-next-line no-console
			console.error(
				`compliance-reporter: full run produced no compliance-annotated test records — ` +
					`this indicates broken suite machinery; ${this.outDir} was NOT rewritten.`,
			);
			return;
		}

		const data = aggregate(allCatalogModules, records);

		// Guard 3 (headline invariant): on a complete run every testable
		// requirement must have been scored — an untested-testable cell means a
		// catalog author forgot to write (or wire up) the test. Surface each as
		// an explicit problem instead of trusting authors to remember.
		for (const rr of data.requirements) {
			if (rr.req.testability !== "testable") continue;
			for (const [profile, pr] of Object.entries(rr.byProfile)) {
				if (pr?.status === "untested") {
					data.problems.push(
						`untested-testable: ${rr.req.id} (${profile}) was not scored by any test in a full run`,
					);
				}
			}
		}
		data.problems.sort();

		// Fix 5: print console summary FIRST so results are visible even if file writes fail.
		// eslint-disable-next-line no-console
		console.log(renderConsole(data));

		// Fix 5: wrap file writes in try/catch to log a clear one-line error on failure.
		try {
			fs.mkdirSync(this.outDir, { recursive: true });
			fs.writeFileSync(
				path.join(this.outDir, "compliance.json"),
				JSON.stringify(data, null, "\t"),
			);
			fs.writeFileSync(path.join(this.outDir, "COMPLIANCE.md"), renderMarkdown(data));
		} catch (err) {
			// eslint-disable-next-line no-console
			console.error(
				`compliance-reporter: failed to write reports to ${this.outDir}: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}
}
