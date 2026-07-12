import type { Profile } from "../catalog/types";
import type { FailureKind } from "./meta";
import { registerCompliance, type ComplianceContext } from "./register";

export interface ComplianceTestInfo {
	reqs: string[];
	profiles: Profile[];
	title: string;
	/**
	 * Documentation-only hint used by spec authors when a test is known to
	 * fail for a stated reason today; it does not change behavior.
	 */
	expectFailure?: FailureKind;
	/** Per-test timeout in milliseconds passed directly to vitest. */
	timeout?: number;
}

export type { ComplianceContext };

export function complianceTest(
	info: ComplianceTestInfo,
	fn: (ctx: ComplianceContext) => Promise<void>,
): void {
	for (const profile of info.profiles) {
		registerCompliance(
			{
				reqs: info.reqs,
				profile,
				title: info.title,
				expectFailure: info.expectFailure,
				timeout: info.timeout,
			},
			fn,
		);
	}
}
