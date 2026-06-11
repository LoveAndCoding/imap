import { test } from "vitest";

import type { Profile } from "../catalog/types";
import { classifyFailure } from "./meta";

export interface AcceptanceRowBase {
	req: string;
	variant: string;
}

export interface AcceptanceTable<R extends AcceptanceRowBase> {
	name: string;
	profiles: Profile[];
	rows: R[];
	timeout?: number;
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
					tctx.task.meta.compliance = { reqs: [row.req], profile };
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
