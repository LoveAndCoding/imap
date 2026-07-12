import { test, type TestContext } from "vitest";

import type { Profile } from "../catalog/types";
import { classifyFailure, type ComplianceMeta, type FailureKind } from "./meta";

/**
 * Shared registration core for both compliance-test.ts and
 * acceptance-table.ts: title construction, meta.compliance assignment, and
 * the classify-and-rethrow failure path live HERE, once — previously each
 * wrapper re-implemented them and a fix to one could silently miss the other.
 */
export interface ComplianceRegistration {
	reqs: string[];
	profile: Profile;
	/** Title text after the `[reqs] [profile]` prefix. */
	title: string;
	expectFailure?: FailureKind;
	timeout?: number;
}

export type ComplianceContext = TestContext & { profile: Profile };

/**
 * Runs a compliance-test body against its meta record: a throw is classified
 * (NotImplementedError → 'unimplemented', anything else → 'violation'),
 * tagged onto the meta for the reporter, and rethrown so vitest still fails
 * the test. Exported separately so this wiring is unit-testable — it is the
 * exact code path every registered compliance test goes through.
 */
export async function runComplianceBody(
	meta: ComplianceMeta,
	body: () => Promise<void>,
): Promise<void> {
	try {
		await body();
	} catch (err) {
		meta.failureKind = classifyFailure(err);
		throw err;
	}
}

export function registerCompliance(
	reg: ComplianceRegistration,
	fn: (ctx: ComplianceContext) => Promise<void>,
): void {
	const title = `[${reg.reqs.join(" ")}] [${reg.profile}] ${reg.title}`;
	test(
		title,
		async (tctx) => {
			const meta: ComplianceMeta = {
				reqs: [...reg.reqs],
				profile: reg.profile,
				...(reg.expectFailure !== undefined
					? { expectFailure: reg.expectFailure }
					: {}),
			};
			tctx.task.meta.compliance = meta;
			await runComplianceBody(meta, () =>
				fn(Object.assign(tctx, { profile: reg.profile }) as ComplianceContext),
			);
		},
		reg.timeout,
	);
}
