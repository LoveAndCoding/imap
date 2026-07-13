import { describe, expect, test, vi } from "vitest";

import { MailboxSession } from "../../../src/client/mailbox";
import type { MailboxSessionDriver } from "../../../src/client/mailbox";
import type { SelectResult } from "../../../src/commands/select";
import type { Command } from "../../../src/commands/base";
import type { ClientState } from "../../../src/client/state";
import { CapabilityError, StateError } from "../../../src/errors";

function baseSnapshot(overrides: Partial<SelectResult> = {}): SelectResult {
	return {
		flags: new Set(["\\Answered", "\\Seen"]),
		permanentFlags: new Set(["\\Seen", "\\*"]),
		exists: 3,
		recent: 1,
		uidValidity: 42,
		uidNext: 4,
		readOnly: false,
		highestModSeq: null,
		noModSeq: false,
		uidNotSticky: false,
		mailboxId: null,
		resync: [],
		...overrides,
	};
}

/**
 * A minimal, inspectable `MailboxSessionDriver` fake (see
 * src/client/mailbox.ts's own doc comment on the interface): `run` resolves
 * every command with `undefined` by default (overridable per test to reject,
 * simulating a tagged NO/BAD, or to observe which command was submitted via
 * `onRun`), `hasCapability` defaults to reporting every capability
 * advertised (overridable to exercise the gate), `deselect` is spied so
 * tests can assert the client-side choreography `close()`/`unselect()` are
 * supposed to drive.
 */
function fakeDriver(
	overrides: Partial<{
		run: MailboxSessionDriver["run"];
		onRun: (command: Command<unknown>) => void;
		hasCapability: (cap: string) => boolean;
		state: ClientState;
	}> = {},
): MailboxSessionDriver & { deselectCalls: MailboxSession[] } {
	const deselectCalls: MailboxSession[] = [];
	const state = overrides.state ?? "selected";
	const defaultRun = (async (command: Command<unknown>) => {
		overrides.onRun?.(command);
		return undefined;
	}) as MailboxSessionDriver["run"];
	return {
		run: overrides.run ?? defaultRun,
		currentState: () => state,
		hasCapability: overrides.hasCapability ?? (() => true),
		maxInlineSize: () => 8192,
		deselect: (session) => {
			deselectCalls.push(session);
		},
		onQueuedBehindIsolated: () => () => {},
		idleRenewMs: () => 28 * 60_000,
		// M4.13 (RFC 5465): no test in this file exercises an active NOTIFY
		// registration, so both default to `false` (the pre-M4.13 behavior
		// for every seq-grain call here).
		hasActiveNotifySelectedMessageNew: () => false,
		hasActiveNotifySelectedMessageExpunge: () => false,
		deselectCalls,
	};
}

function makeSession(
	overrides: Partial<SelectResult> = {},
	driver: MailboxSessionDriver = fakeDriver(),
): MailboxSession {
	return new MailboxSession("INBOX", baseSnapshot(overrides), driver);
}

describe("MailboxSession (spec §5b, M2.2 skeleton)", () => {
	test("constructs a live snapshot from a SelectResult", () => {
		const session = makeSession();
		expect(session.name).toBe("INBOX");
		expect(session.readOnly).toBe(false);
		expect(session.closed).toBe(false);
		expect(session.exists).toBe(3);
		expect(session.recent).toBe(1);
		expect([...session.flags].sort()).toEqual(["\\Answered", "\\Seen"]);
		expect(session.uidValidity).toBe(42);
		expect(session.uidNext).toBe(4);
		expect(session.uidNotSticky).toBe(false);
		expect(session.highestModSeq).toBeNull();
		expect(session.mailboxId).toBeNull();
	});

	test("canCreateKeywords: true only when permanentFlags contains \\* (present set)", () => {
		const withWildcard = makeSession();
		expect(withWildcard.canCreateKeywords).toBe(true);

		const withoutWildcard = makeSession({
			permanentFlags: new Set(["\\Seen", "\\Deleted"]),
		});
		expect(withoutWildcard.canCreateKeywords).toBe(false);
	});

	test("PERMANENTFLAGS omitted -> permanentFlags null AND canCreateKeywords false (documented split)", () => {
		const session = makeSession({ permanentFlags: null });
		expect(session.permanentFlags).toBeNull();
		// The RFC's "assume all flags are settable" omission-default is about the
		// FLAGS already listed, not about the separate \* create-new-keywords
		// capability -- nothing licenses assuming \* when it was never announced.
		expect(session.canCreateKeywords).toBe(false);
	});

	test("noModSeq collapses highestModSeq to null even if a value was also parsed", () => {
		const session = makeSession({ noModSeq: true, highestModSeq: 12345n });
		expect(session.highestModSeq).toBeNull();
	});

	describe("internal driver surface (ImapClient's state-tracker lane)", () => {
		test("markClosed emits 'closed' with the given reason exactly once", () => {
			const session = makeSession();
			const handler = vi.fn();
			session.on("closed", handler);

			MailboxSession.markClosed(session, "reselected");
			expect(session.closed).toBe(true);
			expect(handler).toHaveBeenCalledExactlyOnceWith("reselected");

			// Idempotent: a second call is a silent no-op (never double-fires).
			MailboxSession.markClosed(session, "closed");
			expect(handler).toHaveBeenCalledTimes(1);
		});

		test("applyExists mutates exists and emits (count, prev); no-op when unchanged", () => {
			const session = makeSession({ exists: 3 });
			const handler = vi.fn();
			session.on("exists", handler);

			MailboxSession.applyExists(session, 5);
			expect(session.exists).toBe(5);
			expect(handler).toHaveBeenCalledExactlyOnceWith(5, 3);

			MailboxSession.applyExists(session, 5);
			expect(handler).toHaveBeenCalledTimes(1);
		});

		test("applyExpunge decrements exists (floored at 0) and emits the seq", () => {
			const session = makeSession({ exists: 1 });
			const handler = vi.fn();
			session.on("expunge", handler);

			MailboxSession.applyExpunge(session, 1);
			expect(session.exists).toBe(0);
			expect(handler).toHaveBeenCalledExactlyOnceWith(1);

			// Never goes negative even on a pathological duplicate EXPUNGE.
			MailboxSession.applyExpunge(session, 1);
			expect(session.exists).toBe(0);
		});

		test("applyFlagsUpdate emits the raw update object (per-message flag change)", () => {
			const session = makeSession();
			const handler = vi.fn();
			session.on("flags", handler);

			const update = { seq: 2, uid: 9, flags: new Set(["\\Seen"]), modSeq: 7n };
			MailboxSession.applyFlagsUpdate(session, update);
			expect(handler).toHaveBeenCalledExactlyOnceWith(update);
		});

		describe("applyVanished (RFC 7162 §3.2.10, M4.6)", () => {
			test("earlier: true does NOT decrement exists (informational only) but still emits", () => {
				const session = makeSession({ exists: 10 });
				const handler = vi.fn();
				session.on("vanished", handler);

				MailboxSession.applyVanished(session, [1, 2, 3], true);
				expect(session.exists).toBe(10);
				expect(handler).toHaveBeenCalledExactlyOnceWith([1, 2, 3], true);
			});

			test("earlier: false decrements exists by the UID count (floored at 0) and emits", () => {
				const session = makeSession({ exists: 5 });
				const handler = vi.fn();
				session.on("vanished", handler);

				MailboxSession.applyVanished(session, [1, 2], false);
				expect(session.exists).toBe(3);
				expect(handler).toHaveBeenCalledExactlyOnceWith([1, 2], false);

				// Never goes negative even against a pathological over-report.
				MailboxSession.applyVanished(session, [3, 4, 5, 6, 7, 8], false);
				expect(session.exists).toBe(0);
			});
		});

		test("applyUidValidity emits (next, prev) only when it actually changes", () => {
			const session = makeSession({ uidValidity: 1 });
			const handler = vi.fn();
			session.on("uidValidityChanged", handler);

			MailboxSession.applyUidValidity(session, 1);
			expect(handler).not.toHaveBeenCalled();

			MailboxSession.applyUidValidity(session, 2);
			expect(session.uidValidity).toBe(2);
			expect(handler).toHaveBeenCalledExactlyOnceWith(2, 1);
		});

		test("every apply* is a no-op once the session is closed", () => {
			const session = makeSession({ exists: 3 });
			MailboxSession.markClosed(session, "closed");

			const existsHandler = vi.fn();
			const expungeHandler = vi.fn();
			const vanishedHandler = vi.fn();
			session.on("exists", existsHandler);
			session.on("expunge", expungeHandler);
			session.on("vanished", vanishedHandler);

			MailboxSession.applyExists(session, 99);
			MailboxSession.applyExpunge(session, 1);
			MailboxSession.applyRecent(session, 5);
			MailboxSession.applyUidValidity(session, 999);
			MailboxSession.applyVanished(session, [1, 2, 3], false);

			expect(session.exists).toBe(3);
			expect(session.uidValidity).toBe(42);
			expect(existsHandler).not.toHaveBeenCalled();
			expect(expungeHandler).not.toHaveBeenCalled();
			expect(vanishedHandler).not.toHaveBeenCalled();
		});
	});

	describe("QRESYNC resync-buffering guarantee (spec §5b, M4.6)", () => {
		function resyncSnapshot() {
			return {
				resync: [
					{
						kind: "vanished" as const,
						uids: [41, 43, 44, 45, 50],
						earlier: true,
					},
					{
						kind: "flags" as const,
						seq: 49,
						uid: 117,
						flags: new Set(["\\Seen"]),
						modSeq: 12111230047n,
					},
				],
			};
		}

		test("a listener attached synchronously right after construction receives the buffered events (via the deferred microtask flush)", async () => {
			const session = makeSession(resyncSnapshot());
			const vanishedEvents: unknown[] = [];
			const flagsEvents: unknown[] = [];
			session.on("vanished", (uids, earlier) => vanishedEvents.push({ uids, earlier }));
			session.on("flags", (update) => flagsEvents.push(update));

			// Not yet flushed synchronously -- the flush is deliberately deferred
			// by one microtask turn (see `maybeTriggerResyncFlush()`'s own doc
			// comment) so that BOTH same-tick listeners above are registered
			// before either one is emitted to.
			expect(vanishedEvents).toEqual([]);
			expect(flagsEvents).toEqual([]);

			await new Promise((r) => setImmediate(r));

			expect(vanishedEvents).toEqual([{ uids: [41, 43, 44, 45, 50], earlier: true }]);
			expect(flagsEvents).toEqual([
				{ seq: 49, uid: 117, flags: new Set(["\\Seen"]), modSeq: 12111230047n },
			]);
			// EARLIER never touches exists.
			expect(session.exists).toBe(3);
		});

		test("once() also triggers the buffered flush (not just on())", async () => {
			const session = makeSession(resyncSnapshot());
			const handler = vi.fn();
			session.once("vanished", handler);
			await new Promise((r) => setImmediate(r));
			expect(handler).toHaveBeenCalledExactlyOnceWith([41, 43, 44, 45, 50], true);
		});

		test("addListener() also triggers the buffered flush", async () => {
			const session = makeSession(resyncSnapshot());
			const handler = vi.fn();
			session.addListener("flags", handler);
			await new Promise((r) => setImmediate(r));
			expect(handler).toHaveBeenCalledTimes(1);
		});

		test("no listener attached at all: the setImmediate fallback still flushes (bookkeeping applied), but a listener attached only AFTER that fallback misses the (already-drained) events", async () => {
			const session = makeSession(resyncSnapshot());
			// Let the construction-time setImmediate fallback run with nobody
			// listening yet.
			await new Promise((r) => setImmediate(r));
			await new Promise((r) => setImmediate(r));

			const lateHandler = vi.fn();
			session.on("vanished", lateHandler);
			await new Promise((r) => setImmediate(r));
			expect(lateHandler).not.toHaveBeenCalled();
		});

		test("a session with no resync data never schedules a flush (no observable behavior difference from before M4.6)", async () => {
			const session = makeSession();
			const handler = vi.fn();
			session.on("vanished", handler);
			await new Promise((r) => setImmediate(r));
			expect(handler).not.toHaveBeenCalled();
		});
	});

	describe("close()/unselect() (spec §5b, M2.13)", () => {
		test("close(): runs CloseCommand, deselects through the driver, then marks closed('closed')", async () => {
			const seenVerbs: string[] = [];
			const driver = fakeDriver({ onRun: (cmd) => seenVerbs.push(cmd.verb) });
			const session = makeSession({}, driver);
			const handler = vi.fn();
			session.on("closed", handler);

			await session.close();

			expect(seenVerbs).toEqual(["CLOSE"]);
			expect(driver.deselectCalls).toEqual([session]);
			expect(session.closed).toBe(true);
			expect(handler).toHaveBeenCalledExactlyOnceWith("closed");
		});

		test("unselect(): runs UnselectCommand, deselects through the driver, then marks closed('unselected')", async () => {
			const seenVerbs: string[] = [];
			const driver = fakeDriver({ onRun: (cmd) => seenVerbs.push(cmd.verb) });
			const session = makeSession({}, driver);
			const handler = vi.fn();
			session.on("closed", handler);

			await session.unselect();

			expect(seenVerbs).toEqual(["UNSELECT"]);
			expect(driver.deselectCalls).toEqual([session]);
			expect(session.closed).toBe(true);
			expect(handler).toHaveBeenCalledExactlyOnceWith("unselected");
		});

		test("unselect(): CapabilityError, zero-run, when neither UNSELECT nor IMAP4rev2 is advertised (I-9)", async () => {
			const seenVerbs: string[] = [];
			const driver = fakeDriver({
				onRun: (cmd) => seenVerbs.push(cmd.verb),
				hasCapability: () => false,
			});
			const session = makeSession({}, driver);

			await expect(session.unselect()).rejects.toBeInstanceOf(CapabilityError);
			expect(seenVerbs).toEqual([]);
			expect(driver.deselectCalls).toEqual([]);
			expect(session.closed).toBe(false);
		});

		test("unselect(): IMAP4rev2 alone satisfies the OR-capability gate (no UNSELECT token needed)", async () => {
			const driver = fakeDriver({
				hasCapability: (cap) => cap === "IMAP4rev2",
			});
			const session = makeSession({}, driver);

			await expect(session.unselect()).resolves.toBeUndefined();
			expect(session.closed).toBe(true);
		});

		test("a tagged NO/BAD (run() rejects) leaves the session open -- no deselect, no closed event", async () => {
			const driver = fakeDriver({
				run: (async () => {
					throw new Error("simulated ServerNoError");
				}) as MailboxSessionDriver["run"],
			});
			const session = makeSession({}, driver);
			const handler = vi.fn();
			session.on("closed", handler);

			await expect(session.close()).rejects.toThrow("simulated ServerNoError");
			expect(driver.deselectCalls).toEqual([]);
			expect(session.closed).toBe(false);
			expect(handler).not.toHaveBeenCalled();
		});

		test("close()/unselect() on an already-closed session reject StateError, zero-run", async () => {
			const seenVerbs: string[] = [];
			const driver = fakeDriver({
				onRun: (cmd) => seenVerbs.push(cmd.verb),
				state: "authenticated",
			});
			const session = makeSession({}, driver);
			MailboxSession.markClosed(session, "closed");

			await expect(session.close()).rejects.toBeInstanceOf(StateError);
			await expect(session.unselect()).rejects.toBeInstanceOf(StateError);
			expect(seenVerbs).toEqual([]);

			let caught: unknown;
			try {
				await session.close();
			} catch (err) {
				caught = err;
			}
			expect(caught).toBeInstanceOf(StateError);
			expect((caught as StateError).state).toBe("authenticated");
			expect((caught as StateError).required).toEqual(["selected"]);
		});
	});

	describe("copy()/move()/seq (spec §5b, M3.8)", () => {
		test("copy(): runs CopyCommand (UID-grain, verb 'UID COPY'), returns the driver's CopyResult verbatim", async () => {
			const seenVerbs: string[] = [];
			const copyResult = { uidValidity: 1, sourceUids: [1], destUids: [2] };
			const driver = fakeDriver({
				run: (async (cmd) => {
					seenVerbs.push(cmd.verb);
					return copyResult;
				}) as MailboxSessionDriver["run"],
			});
			const session = makeSession({}, driver);

			const result = await session.copy("1:5", "Archive");

			expect(seenVerbs).toEqual(["UID COPY"]);
			expect(result).toBe(copyResult);
		});

		test("seq.copy(): runs the bare (seq-grain) 'COPY' verb", async () => {
			const seenVerbs: string[] = [];
			const driver = fakeDriver({ onRun: (cmd) => seenVerbs.push(cmd.verb) });
			const session = makeSession({}, driver);

			await session.seq.copy("1:5", "Archive");

			expect(seenVerbs).toEqual(["COPY"]);
		});

		test("move(): runs MoveCommand (UID-grain, verb 'UID MOVE') when MOVE is advertised", async () => {
			const seenVerbs: string[] = [];
			const driver = fakeDriver({
				onRun: (cmd) => seenVerbs.push(cmd.verb),
				hasCapability: (cap) => cap === "MOVE",
			});
			const session = makeSession({}, driver);

			await session.move("1:5", "Archive");

			expect(seenVerbs).toEqual(["UID MOVE"]);
		});

		test("seq.move(): runs the bare (seq-grain) 'MOVE' verb when MOVE is advertised", async () => {
			const seenVerbs: string[] = [];
			const driver = fakeDriver({
				onRun: (cmd) => seenVerbs.push(cmd.verb),
				hasCapability: (cap) => cap === "MOVE",
			});
			const session = makeSession({}, driver);

			await session.seq.move("1:5", "Archive");

			expect(seenVerbs).toEqual(["MOVE"]);
		});

		test("move(): CapabilityError, zero-run, when MOVE is not advertised (RFC 6851, I-9 -- native MOVE only, never emulated)", async () => {
			const seenVerbs: string[] = [];
			const driver = fakeDriver({
				onRun: (cmd) => seenVerbs.push(cmd.verb),
				hasCapability: () => false,
			});
			const session = makeSession({}, driver);

			let caught: unknown;
			try {
				await session.move("1:5", "Archive");
			} catch (err) {
				caught = err;
			}

			expect(caught).toBeInstanceOf(CapabilityError);
			expect((caught as CapabilityError).capability).toBe("MOVE");
			expect((caught as CapabilityError).rfc).toBe("RFC6851");
			expect(seenVerbs).toEqual([]);
		});

		test("move(): IMAP4rev2 alone satisfies the OR-capability gate (no MOVE token needed, RFC 9051 §6.4.8)", async () => {
			const seenVerbs: string[] = [];
			const driver = fakeDriver({
				onRun: (cmd) => seenVerbs.push(cmd.verb),
				hasCapability: (cap) => cap === "IMAP4rev2",
			});
			const session = makeSession({}, driver);

			await session.move("1:5", "Archive");
			expect(seenVerbs).toEqual(["UID MOVE"]);
		});

		test("seq.move(): the same CapabilityError gate applies to the seq-grain mirror", async () => {
			const seenVerbs: string[] = [];
			const driver = fakeDriver({
				onRun: (cmd) => seenVerbs.push(cmd.verb),
				hasCapability: () => false,
			});
			const session = makeSession({}, driver);

			await expect(session.seq.move("1:5", "Archive")).rejects.toBeInstanceOf(
				CapabilityError,
			);
			expect(seenVerbs).toEqual([]);
		});

		test("copy()/move()/seq.copy()/seq.move() on an already-closed session reject StateError, zero-run", async () => {
			const seenVerbs: string[] = [];
			const driver = fakeDriver({
				onRun: (cmd) => seenVerbs.push(cmd.verb),
				hasCapability: () => true,
			});
			const session = makeSession({}, driver);
			MailboxSession.markClosed(session, "closed");

			await expect(session.copy("1", "A")).rejects.toBeInstanceOf(StateError);
			await expect(session.move("1", "A")).rejects.toBeInstanceOf(StateError);
			await expect(session.seq.copy("1", "A")).rejects.toBeInstanceOf(StateError);
			await expect(session.seq.move("1", "A")).rejects.toBeInstanceOf(StateError);
			expect(seenVerbs).toEqual([]);
		});
	});
});
