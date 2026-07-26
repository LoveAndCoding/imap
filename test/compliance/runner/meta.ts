import type { Profile } from "../catalog/types";
import { NotImplementedError } from "../driver/errors";
// M4.13 (RFC 5465): the real library's OWN `NotImplementedError`
// (`src/errors.ts`, e.g. `SortCommand`'s PARTIAL-on-SORT refusal,
// `MailboxSession`'s RFC5465-5.3-2 MSN-prohibition refusal) is a DIFFERENT
// class from the driver's own synthetic one above (different module,
// `instanceof` doesn't cross that boundary) -- yet it carries the exact
// same "missing public API surface, honest not-built-yet" signal the
// reporter's own doc comment describes. Recognizing both classes here
// (rather than only the driver's) is a genuine reporter fix, not new
// leniency: it can only ever RECLASSIFY an existing 'violation' into
// 'unimplemented' for a test that already throws a real, documented
// "not implemented" refusal straight from the library -- it can never turn
// a passing test into a failure, nor a driver-stub 'unimplemented' into
// something else.
import { NotImplementedError as LibraryNotImplementedError } from "../../../src/errors";

export type FailureKind = "violation" | "unimplemented";

/**
 * Classifies a compliance-test failure for the reporter: a missing public
 * API surface is 'unimplemented'; everything else is a 'violation'.
 */
export function classifyFailure(err: unknown): FailureKind {
	return err instanceof NotImplementedError || err instanceof LibraryNotImplementedError
		? "unimplemented"
		: "violation";
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
