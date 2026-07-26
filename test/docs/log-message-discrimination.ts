// Compile-only proof that `IMAPLogMessage` (src/types.ts, re-exported from
// the package root) is a genuinely discriminating union on `level` (M20
// fix). Every `level` value must map to exactly ONE arm, so narrowing on
// `level` gives compile-time access to that arm's own field (`detail` or
// `error`) and rejects the OTHER arm's field -- accessing the wrong one is
// asserted as a compile error below via `@ts-expect-error`.
//
// Before the fix, `"warn"` appeared in BOTH arms, so narrowing on
// `level === "warn"` couldn't pick a single arm: `msg.detail` failed to
// type-check (not every union member had it) and this file failed to
// compile. `npm run typecheck` (test/docs/tsconfig.json, wired into the
// root "typecheck" script) is what exercises this.
//
// Nothing here is executed; these functions are never called.
//
// Imports come from the package root ("../../src/index"), the same surface
// `import type { IMAPLogMessage } from "@lovely-inbox/imap"` resolves to.

import type { IMAPLogMessage } from "../../src/index";

// A no-op sink so "access this property" reads as a real use (proving it
// type-checks) without tripping unused-expression/unused-variable lint
// rules.
function use(..._values: unknown[]): void {}

export function detailArmNarrowsCorrectly(msg: IMAPLogMessage): void {
	if (msg.level === "warn") {
		// Narrowed to the non-error arm: `detail` must be accessible...
		use(msg.detail);
		// ...and `error` must NOT be -- that field only exists on the
		// "error" arm, which `level === "warn"` can no longer be.
		// @ts-expect-error -- `error` only exists on the "error"-level arm
		use(msg.error);
	}
}

export function everyNonErrorLevelNarrowsToTheDetailArm(
	msg: IMAPLogMessage,
): void {
	if (
		msg.level === "info" ||
		msg.level === "verbose" ||
		msg.level === "debug" ||
		msg.level === "silly"
	) {
		use(msg.detail);
		// @ts-expect-error -- `error` only exists on the "error"-level arm
		use(msg.error);
	}
}

export function errorArmNarrowsCorrectly(msg: IMAPLogMessage): void {
	if (msg.level === "error") {
		// Narrowed to the error arm: `error` must be accessible...
		use(msg.error);
		// ...and `detail` must NOT be -- that field only exists on the
		// other arm.
		// @ts-expect-error -- `detail` only exists on the non-error arm
		use(msg.detail);
	}
}
