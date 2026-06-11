import { test, type TestContext } from "vitest";

import type { Profile } from "../catalog/types";
import { classifyFailure, type FailureKind } from "./meta";

export interface ComplianceTestInfo {
	reqs: string[];
	profiles: Profile[];
	title: string;
	/**
	 * Documentation-only hint used by spec authors when a test is known to
	 * fail for a stated reason today; it does not change behavior.
	 */
	expectFailure?: FailureKind;
}

export type ComplianceContext = TestContext & { profile: Profile };

export function complianceTest(
	info: ComplianceTestInfo,
	fn: (ctx: ComplianceContext) => Promise<void>,
): void {
	for (const profile of info.profiles) {
		test(`[${info.reqs.join(" ")}] [${profile}] ${info.title}`, async (tctx) => {
			tctx.task.meta.compliance = { reqs: [...info.reqs], profile };
			try {
				await fn(Object.assign(tctx, { profile }) as ComplianceContext);
			} catch (err) {
				tctx.task.meta.compliance.failureKind = classifyFailure(err);
				throw err;
			}
		});
	}
}
