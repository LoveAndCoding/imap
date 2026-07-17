import { describe, expect, test, vi } from "vitest";

import { performAuthSelection } from "../../../src/client/auth";
import type { AuthSelectionDeps } from "../../../src/client/auth";
import type { CapabilityView } from "../../../src/client/capabilities";
import type { ImapAuthConfig } from "../../../src/client/config";
import { AuthenticateCommand } from "../../../src/commands/authenticate";
import type { Command } from "../../../src/commands/base";
import { LoginCommand } from "../../../src/commands/login";
import { AuthError } from "../../../src/errors";

/**
 * A minimal, hand-rolled `CapabilityView` -- no server round trip involved,
 * `performAuthSelection` (`src/client/auth.ts`) is exercised directly against
 * a fake `AuthSelectionDeps`, exactly like this module's own doc comment
 * ("Kept free of any direct `ImapClient` dependency ... so it's testable
 * against a fake host") intends.
 */
function fakeCapabilities(caps: string[]): CapabilityView {
	const upper = new Set(caps.map((c) => c.toUpperCase()));
	return {
		has: (cap: string) => upper.has(cap.toUpperCase()),
		authMechanisms: () =>
			caps
				.filter((c) => c.toUpperCase().startsWith("AUTH="))
				.map((c) => c.slice("AUTH=".length).toUpperCase()),
		all: () => upper,
		epoch: 0,
	};
}

function fakeDeps(overrides: Partial<AuthSelectionDeps> = {}): AuthSelectionDeps & {
	runCalls: Array<Command<unknown>>;
} {
	const runCalls: Array<Command<unknown>> = [];
	const deps: AuthSelectionDeps & { runCalls: Array<Command<unknown>> } = {
		capabilities: fakeCapabilities([]),
		isSecure: true,
		allowInsecureAuth: false,
		host: "imap.example.com",
		port: 993,
		run: vi.fn(async (command: Command<unknown>) => {
			runCalls.push(command);
			return undefined as never;
		}),
		refreshCapabilities: vi.fn(async () => undefined),
		runCalls,
		...overrides,
	};
	return deps;
}

describe("performAuthSelection LOGIN-fallback exclusion (PR #18 review fix, Medium)", () => {
	test("REVERT-VERIFY: an explicit `mechanisms` list without \"LOGIN\" excludes LOGIN entirely -- no LoginCommand run, typed AuthError instead", async () => {
		// Arrange: caller explicitly asked for SCRAM-SHA-256 only (SASL-only
		// intent), but the server advertises only LOGIN (no AUTH= entries at
		// all) -- SCRAM-SHA-256 is excluded as "not advertised" before it ever
		// reaches the wire, and (pre-fix) the selection algorithm would then
		// unconditionally fall through to step 4 and send the real password
		// via LoginCommand anyway, defeating the caller's SASL-only intent.
		const auth: ImapAuthConfig = {
			user: "u",
			pass: "p",
			mechanisms: ["SCRAM-SHA-256"],
		};
		const deps = fakeDeps({ capabilities: fakeCapabilities([]) });

		//Act & Assert
		await expect(performAuthSelection(auth, deps)).rejects.toThrow(AuthError);
		await expect(performAuthSelection(auth, deps)).rejects.toThrow(
			/excluded by an explicit `mechanisms` list/,
		);
		// The headline assertion: zero LoginCommand instances ever ran, i.e.
		// the real password never hit the wire via the fallback.
		expect(deps.runCalls.some((c) => c instanceof LoginCommand)).toBe(false);
		expect(deps.run).not.toHaveBeenCalled();
	});

	test('an explicit `mechanisms` list that DOES include "LOGIN" still permits the fallback', async () => {
		//Arrange: same unadvertised-SCRAM situation, but the caller explicitly
		// opted back into LOGIN by listing it.
		const auth: ImapAuthConfig = {
			user: "u",
			pass: "p",
			mechanisms: ["SCRAM-SHA-256", "LOGIN"],
		};
		const deps = fakeDeps({ capabilities: fakeCapabilities([]) });

		//Act
		await performAuthSelection(auth, deps);

		//Assert: LOGIN was actually attempted this time.
		expect(deps.runCalls).toHaveLength(1);
		expect(deps.runCalls[0]).toBeInstanceOf(LoginCommand);
	});

	test("REVERT-VERIFY companion: 'LOGIN' listed as a candidate is never looked up as a SASL mechanism (no 'unknown mechanism' misreport)", async () => {
		//Arrange: "LOGIN" appears BEFORE a real SASL candidate in the list --
		// it must be skipped as a SASL candidate entirely (handled solely by
		// the step-4 gate), never misreported as "unknown mechanism (not
		// registered)" or attempted as an AuthenticateCommand.
		const auth: ImapAuthConfig = {
			user: "u",
			pass: "p",
			mechanisms: ["LOGIN", "PLAIN"],
		};
		const deps = fakeDeps({ capabilities: fakeCapabilities(["AUTH=PLAIN"]) });

		//Act
		await performAuthSelection(auth, deps);

		//Assert: PLAIN succeeded via AUTHENTICATE -- LOGIN was never attempted
		// as a SASL candidate (no AuthenticateCommand named "LOGIN" ran), and
		// the loop didn't misfire on it.
		expect(deps.runCalls).toHaveLength(1);
		expect(deps.runCalls[0]).toBeInstanceOf(AuthenticateCommand);
	});

	test("default candidates (no explicit `mechanisms`): LOGIN fallback remains allowed, matching prior documented behavior", async () => {
		//Arrange: no `mechanisms` field at all -- the default candidate list
		// applies, and LOGIN must still be reachable exactly as before this
		// fix (this fix only changes behavior for an EXPLICIT list).
		const auth: ImapAuthConfig = { user: "u", pass: "p" };
		const deps = fakeDeps({ capabilities: fakeCapabilities([]) });

		//Act
		await performAuthSelection(auth, deps);

		//Assert
		expect(deps.runCalls).toHaveLength(1);
		expect(deps.runCalls[0]).toBeInstanceOf(LoginCommand);
	});

	test("LOGINDISABLED still forecloses LOGIN even when an explicit list includes it (existing behavior preserved)", async () => {
		//Arrange
		const auth: ImapAuthConfig = {
			user: "u",
			pass: "p",
			mechanisms: ["SCRAM-SHA-256", "LOGIN"],
		};
		const deps = fakeDeps({ capabilities: fakeCapabilities(["LOGINDISABLED"]) });

		//Act & Assert
		await expect(performAuthSelection(auth, deps)).rejects.toThrow(AuthError);
		await expect(performAuthSelection(auth, deps)).rejects.toThrow(/LOGINDISABLED/);
		expect(deps.run).not.toHaveBeenCalled();
	});

	test('REVERT-VERIFY companion: an explicit but EMPTY `mechanisms: []` still permits LOGIN (long-standing "SASL-free" idiom, must not regress)', async () => {
		//Arrange: `mechanisms: []` is a widely-used idiom throughout this
		// codebase's own test suite for "skip SASL entirely, go straight to
		// LOGIN" -- it names no SASL preference at all, so it must NOT be
		// treated as "SASL-only intent" the way a non-empty explicit list
		// (e.g. `["SCRAM-SHA-256"]`) is. This guards against an
		// over-broad fix that also excludes LOGIN here, which would break
		// every caller (test or real) relying on this existing pattern.
		const auth: ImapAuthConfig = { user: "u", pass: "p", mechanisms: [] };
		const deps = fakeDeps({ capabilities: fakeCapabilities([]) });

		//Act
		await performAuthSelection(auth, deps);

		//Assert
		expect(deps.runCalls).toHaveLength(1);
		expect(deps.runCalls[0]).toBeInstanceOf(LoginCommand);
	});
});
