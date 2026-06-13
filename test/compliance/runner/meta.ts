import type { Profile } from "../catalog/types";
import { NotImplementedError } from "../driver/errors";

export type FailureKind = "violation" | "unimplemented";

/**
 * Classifies a compliance-test failure for the reporter: a missing public
 * API surface is 'unimplemented'; everything else is a 'violation'.
 */
export function classifyFailure(err: unknown): FailureKind {
	return err instanceof NotImplementedError ? "unimplemented" : "violation";
}

export interface ComplianceMeta {
	reqs: string[];
	profile: Profile;
	failureKind?: FailureKind;
	/**
	 * Propagated from ComplianceTestInfo.expectFailure (or acceptance-table
	 * expectFailure) so the reporter can detect stale hints on passing tests.
	 */
	expectFailure?: FailureKind;
}

declare module "vitest" {
	interface TaskMeta {
		compliance?: ComplianceMeta;
	}
}
