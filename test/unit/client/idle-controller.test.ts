import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { IdleCommand } from "../../../src/commands/idle";
import { IdleController } from "../../../src/client/idle-controller";
import type { IdleControllerDriver } from "../../../src/client/idle-controller";

/**
 * `IdleController` (spec §3.7, M4.1) unit tests — a fake `IdleControllerDriver`
 * stands in for the real queue/connection so these tests can pin the
 * controller's OWN scheduling logic (renewal, the queued-behind-isolated
 * hook, `done()`'s idempotence across a renewal boundary) without a real
 * socket/server underneath. The end-to-end wire-level behavior (the actual
 * DONE bytes only reaching the wire once the server's "+idling" continuation
 * arrives) is covered separately by `test/unit/client/mailbox-idle.test.ts`
 * (real `ScriptedServer`) and `test/unit/client/idle-ordering.test.ts` (M4.2's
 * ordering-race tests).
 */

/** A controllable fake round: `run` is a manually-resolved/rejected promise,
 *  standing in for `driver.run()`'s real "resolves once the tagged OK
 *  settles" contract. */
function makeFakeDriver() {
	const runCalls: IdleCommand[] = [];
	const pendingResolvers: Array<{ resolve: () => void; reject: (err: unknown) => void }> = [];
	let hookCb: (() => void) | undefined;
	let unsubscribeCalls = 0;
	let idleRenewMs = 28 * 60_000;

	const driver: IdleControllerDriver = {
		run: (command) => {
			runCalls.push(command);
			return new Promise<void>((resolve, reject) => {
				pendingResolvers.push({ resolve, reject });
			});
		},
		onQueuedBehindIsolated: (cb) => {
			hookCb = cb;
			return () => {
				unsubscribeCalls++;
				if (hookCb === cb) {
					hookCb = undefined;
				}
			};
		},
		idleRenewMs: () => idleRenewMs,
	};

	return {
		driver,
		runCalls,
		resolveRound: (index: number) => pendingResolvers[index]?.resolve(),
		rejectRound: (index: number, err: unknown) => pendingResolvers[index]?.reject(err),
		fireQueuedBehindIsolated: () => hookCb?.(),
		get unsubscribeCalls() {
			return unsubscribeCalls;
		},
		get hookIsSubscribed() {
			return hookCb !== undefined;
		},
		setIdleRenewMs: (ms: number) => {
			idleRenewMs = ms;
		},
	};
}

const flush = () => Promise.resolve().then(() => Promise.resolve());

describe("IdleController (spec §3.7, M4.1)", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("start() submits exactly one round through driver.run()", async () => {
		const fake = makeFakeDriver();
		const controller = new IdleController(fake.driver);

		await controller.start();

		expect(fake.runCalls).toHaveLength(1);
	});

	test("done() resolves once the current round's driver.run() promise settles", async () => {
		const fake = makeFakeDriver();
		const controller = new IdleController(fake.driver);
		await controller.start();

		let settled = false;
		const donePromise = controller.done().then(() => {
			settled = true;
		});

		await flush();
		expect(settled).toBe(false); // still waiting on the round's tagged OK

		fake.resolveRound(0);
		await donePromise;
		expect(settled).toBe(true);
	});

	test("done() is idempotent: calling it twice resolves both with the same outcome", async () => {
		const fake = makeFakeDriver();
		const controller = new IdleController(fake.driver);
		await controller.start();

		const first = controller.done();
		const second = controller.done();
		fake.resolveRound(0);

		await expect(first).resolves.toBeUndefined();
		await expect(second).resolves.toBeUndefined();
		// No second round was started by the redundant done() call.
		expect(fake.runCalls).toHaveLength(1);
	});

	test("a rejected round rejects done() with the same error, without an unhandled rejection", async () => {
		const fake = makeFakeDriver();
		const controller = new IdleController(fake.driver);
		await controller.start();

		const err = new Error("tagged NO");
		fake.rejectRound(0, err);
		await flush();

		await expect(controller.done()).rejects.toBe(err);
	});

	test("renewal: after idleRenewMs elapses, the round doesn't re-enter until the CURRENT round's tagged OK actually arrives", async () => {
		const fake = makeFakeDriver();
		fake.setIdleRenewMs(1000);
		const controller = new IdleController(fake.driver);
		await controller.start();
		expect(fake.runCalls).toHaveLength(1);

		// Renewal timer fires -- this only resolves the round's internal
		// "done" signal; the round itself doesn't end until driver.run()'s
		// promise (standing in for the tagged OK) actually settles.
		await vi.advanceTimersByTimeAsync(1000);
		await flush();
		expect(fake.runCalls).toHaveLength(1);

		// NOW the tagged OK arrives -- renewal is invisible to any handle:
		// the controller re-enters on its own, no caller involvement.
		fake.resolveRound(0);
		await flush();
		expect(fake.runCalls).toHaveLength(2);
	});

	test("renewal is invisible to done(): calling done() mid-renewal still waits for the NEXT round to end", async () => {
		const fake = makeFakeDriver();
		fake.setIdleRenewMs(1000);
		const controller = new IdleController(fake.driver);
		await controller.start();

		await vi.advanceTimersByTimeAsync(1000);
		fake.resolveRound(0); // round 1 ends, round 2 begins (renewal, invisible)
		await flush();
		expect(fake.runCalls).toHaveLength(2);

		let settled = false;
		const donePromise = controller.done().then(() => {
			settled = true;
		});
		await flush();
		// done() must NOT resolve against round 1 (already gone) -- only
		// round 2 (the current, live one) ending settles it.
		expect(settled).toBe(false);

		fake.resolveRound(1);
		await donePromise;
		expect(settled).toBe(true);
		// No further (third) round was started -- done() suppressed re-entry.
		expect(fake.runCalls).toHaveLength(2);
	});

	test("queued-behind-isolated hook ends the session without re-entry (explicit mode)", async () => {
		const fake = makeFakeDriver();
		const controller = new IdleController(fake.driver);
		await controller.start();
		expect(fake.hookIsSubscribed).toBe(true);

		fake.fireQueuedBehindIsolated();
		fake.resolveRound(0);
		await flush();

		// No re-entry: the explicit surface auto-DONEs for a queued command
		// but does NOT re-enter IDLE afterward (spec §3.7 -- only the
		// renewal timer re-enters).
		expect(fake.runCalls).toHaveLength(1);
		await expect(controller.done()).resolves.toBeUndefined();
	});

	test("the hook is unsubscribed once its round settles (no leak across rounds)", async () => {
		const fake = makeFakeDriver();
		fake.setIdleRenewMs(1000);
		const controller = new IdleController(fake.driver);
		await controller.start();

		await vi.advanceTimersByTimeAsync(1000);
		fake.resolveRound(0);
		await flush();
		expect(fake.runCalls).toHaveLength(2); // round 2 (renewal) started
		expect(fake.unsubscribeCalls).toBe(1); // round 1's hook was torn down
		expect(fake.hookIsSubscribed).toBe(true); // round 2 subscribed its own

		fake.resolveRound(1);
		await flush();
		expect(fake.unsubscribeCalls).toBe(2);
	});
});
