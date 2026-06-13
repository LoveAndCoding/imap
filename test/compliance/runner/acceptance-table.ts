import { test } from "vitest";

import type { Profile } from "../catalog/types";
import { classifyFailure, type FailureKind } from "./meta";

export interface AcceptanceRowBase {
	req: string;
	variant: string;
}

export interface AcceptanceTable<R extends AcceptanceRowBase> {
	name: string;
	profiles: Profile[];
	rows: R[];
	timeout?: number;
	/**
	 * Documentation-only hint used by spec authors when a table is known to
	 * fail for a stated reason today; propagated into meta for stale-hint
	 * detection by the reporter.
	 */
	expectFailure?: FailureKind;
	execute(row: R, ctx: { profile: Profile }): Promise<void>;
}

export function defineAcceptanceTable<R extends AcceptanceRowBase>(
	table: AcceptanceTable<R>,
): void {
	for (const row of table.rows) {
		for (const profile of table.profiles) {
			test(
				`[${row.req}] [${profile}] ${table.name}: ${row.variant}`,
				async (tctx) => {
					tctx.task.meta.compliance = {
						reqs: [row.req],
						profile,
						...(table.expectFailure !== undefined ? { expectFailure: table.expectFailure } : {}),
					};
					try {
						await table.execute(row, { profile });
					} catch (err) {
						tctx.task.meta.compliance.failureKind = classifyFailure(err);
						throw err;
					}
				},
				table.timeout,
			);
		}
	}
}
