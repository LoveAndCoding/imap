import type { Profile } from "../catalog/types";
import type { FailureKind } from "./meta";
import { registerCompliance } from "./register";

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
			registerCompliance(
				{
					reqs: [row.req],
					profile,
					title: `${table.name}: ${row.variant}`,
					expectFailure: table.expectFailure,
					timeout: table.timeout,
				},
				() => table.execute(row, { profile }),
			);
		}
	}
}
