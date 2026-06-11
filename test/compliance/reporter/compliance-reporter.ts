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

		fs.mkdirSync(this.outDir, { recursive: true });
		fs.writeFileSync(
			path.join(this.outDir, "compliance.json"),
			JSON.stringify(data, null, "\t"),
		);
		fs.writeFileSync(path.join(this.outDir, "COMPLIANCE.md"), renderMarkdown(data));
		// eslint-disable-next-line no-console
		console.log(renderConsole(data));
	}
}
