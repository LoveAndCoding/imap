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

	onTestRunEnd(
		testModules: ReadonlyArray<TestModule>,
		_unhandledErrors: ReadonlyArray<SerializedError>,
		_reason: TestRunEndReason,
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
		const data = aggregate(allCatalogModules, records);

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
