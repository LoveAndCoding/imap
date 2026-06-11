import type {
	CatalogModule,
	Profile,
	Rfc2119Level,
	SpecRequirement,
} from "../catalog/types";
import type { ComplianceMeta, FailureKind } from "../runner/meta";

export interface TestRecord {
	name: string;
	state: "passed" | "failed" | "skipped";
	meta?: ComplianceMeta;
}

export type ReqStatus = "pass" | "fail" | "untested" | "untestable";

export interface ProfileResult {
	status: ReqStatus;
	failureKind?: FailureKind;
	tests: string[];
}

export interface RequirementResult {
	req: SpecRequirement;
	byProfile: Partial<Record<Profile, ProfileResult>>;
}

export interface SummaryCounts {
	pass: number;
	violation: number;
	unimplemented: number;
	untested: number;
	untestable: number;
}

export interface SourceSummary {
	source: string;
	profile: Profile;
	level: Rfc2119Level;
	counts: SummaryCounts;
	/** pass / (pass + fail + untested); null when the denominator is 0. */
	score: number | null;
}

export interface ComplianceReportData {
	requirements: RequirementResult[];
	summary: SourceSummary[];
	problems: string[];
}

const ALL_LEVELS: Rfc2119Level[] = ["MUST", "MUST NOT", "SHOULD", "SHOULD NOT", "MAY"];

export function aggregate(
	catalog: CatalogModule[],
	tests: TestRecord[],
): ComplianceReportData {
	const problems: string[] = [];
	const knownIds = new Set<string>();
	const allReqs: SpecRequirement[] = [];
	for (const mod of catalog) {
		for (const req of mod.requirements) {
			knownIds.add(req.id);
			allReqs.push(req);
		}
	}

	// Index compliance test results by (reqId, profile).
	// Only flag unknown requirement IDs when the catalog is non-empty: with an
	// empty catalog every ID would be "unknown", producing noise before any
	// catalog modules have been seeded (Phase 0 state).
	const catalogPopulated = allReqs.length > 0;
	const byReqProfile = new Map<string, TestRecord[]>();
	for (const t of tests) {
		if (!t.meta) continue; // machinery self-test — not a compliance test
		for (const reqId of t.meta.reqs) {
			if (!knownIds.has(reqId)) {
				if (catalogPopulated) {
					problems.push(`test '${t.name}' cites unknown requirement id ${reqId}`);
				}
				continue;
			}
			const key = `${reqId} ${t.meta.profile}`;
			const list = byReqProfile.get(key) ?? [];
			list.push(t);
			byReqProfile.set(key, list);
		}
	}

	const requirements: RequirementResult[] = allReqs.map((req) => {
		const byProfile: Partial<Record<Profile, ProfileResult>> = {};
		for (const profile of req.profiles) {
			if (req.testability === "untestable") {
				byProfile[profile] = { status: "untestable", tests: [] };
				continue;
			}
			const records = byReqProfile.get(`${req.id} ${profile}`) ?? [];
			const considered = records.filter((r) => r.state !== "skipped");
			if (!considered.length) {
				byProfile[profile] = { status: "untested", tests: [] };
				continue;
			}
			const failures = considered.filter((r) => r.state === "failed");
			if (!failures.length) {
				byProfile[profile] = {
					status: "pass",
					tests: considered.map((r) => r.name),
				};
			} else {
				const kind: FailureKind = failures.some(
					(f) => f.meta?.failureKind === "violation",
				)
					? "violation"
					: "unimplemented";
				byProfile[profile] = {
					status: "fail",
					failureKind: kind,
					tests: considered.map((r) => r.name),
				};
			}
		}
		return { req, byProfile };
	});

	const summary: SourceSummary[] = [];
	const sources = [...new Set(allReqs.map((r) => r.source))];
	for (const source of sources) {
		for (const profile of ["rev1", "rev2"] as Profile[]) {
			for (const level of ALL_LEVELS) {
				const counts: SummaryCounts = {
					pass: 0,
					violation: 0,
					unimplemented: 0,
					untested: 0,
					untestable: 0,
				};
				for (const rr of requirements) {
					if (rr.req.source !== source) continue;
					if (rr.req.level !== level) continue;
					const pr = rr.byProfile[profile];
					if (!pr) continue;
					if (pr.status === "pass") counts.pass++;
					else if (pr.status === "untested") counts.untested++;
					else if (pr.status === "untestable") counts.untestable++;
					else if (pr.failureKind === "violation") counts.violation++;
					else counts.unimplemented++;
				}
				const denom =
					counts.pass + counts.violation + counts.unimplemented + counts.untested;
				const any = denom + counts.untestable;
				if (any === 0) continue; // nothing cataloged at this source×profile×level
				summary.push({
					source,
					profile,
					level,
					counts,
					score: denom === 0 ? null : counts.pass / denom,
				});
			}
		}
	}

	return { requirements, summary, problems };
}
