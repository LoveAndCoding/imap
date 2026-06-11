import type { Profile } from "../catalog/types";

export type FailureKind = "violation" | "unimplemented";

export interface ComplianceMeta {
	reqs: string[];
	profile: Profile;
	failureKind?: FailureKind;
}

declare module "vitest" {
	interface TaskMeta {
		compliance?: ComplianceMeta;
	}
}
