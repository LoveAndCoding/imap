// CF3+SF1 (M4-phase-boundary review): two guards `runSearch` already applied
// were missing from `runSort`/`runThread` and (for one of the two)
// missing from all three of `runSearch`/`runSort`/`runThread`:
//
//   (a) RFC7162-3.1.2.2-1's NOMODSEQ guard (`assertModSeqUsable`), keyed on
//       `criteriaHasModSeq()` -- `runSearch` already applied it; `runSort`/
//       `runThread` did not, even though they share the exact same
//       `SearchCriteria` compiler (and therefore the exact same `modSeq`
//       hazard) SEARCH does.
//   (b) `assertSequenceGrainSafeUnderNotify`'s RFC5465-5.2-4/-5.3-2 NOTIFY
//       guards, applied here to a bare `SearchCriteria.seq` search key (a
//       message-sequence-number search key is exactly as MSN-fragile as a
//       FETCH/STORE/COPY sequence-set argument) -- none of `runSearch`/
//       `runSort`/`runThread` applied this at all before this fix.
//
// This file exercises `MailboxSession.search()`/`.sort()`/`.thread()`
// directly against a minimal fake `MailboxSessionDriver` (mirroring
// `mailbox.test.ts`'s own `fakeDriver()` convention) rather than a full
// `ImapClient`/`ScriptedServer` round trip -- the guards under test throw
// (or don't) entirely client-side, before any command is even constructed
// in the seq/'*' cases, so a full wire round trip adds nothing but noise.
import { describe, expect, test } from "vitest";

import type { Command } from "../../../src/commands/base";
import type { SelectResult } from "../../../src/commands/select";
import { MailboxSession } from "../../../src/client/mailbox";
import type { MailboxSessionDriver } from "../../../src/client/mailbox";
import type { ClientState } from "../../../src/client/state";
import { CapabilityError, NotImplementedError } from "../../../src/errors";

function baseSnapshot(overrides: Partial<SelectResult> = {}): SelectResult {
	return {
		flags: new Set(),
		permanentFlags: null,
		exists: 5,
		recent: null,
		uidValidity: 42,
		uidNext: 6,
		readOnly: false,
		highestModSeq: 100n,
		noModSeq: false,
		uidNotSticky: false,
		mailboxId: null,
		resync: [],
		...overrides,
	};
}

/** Same minimal-fake-driver convention as `mailbox.test.ts`'s own
 *  `fakeDriver()` -- every capability reads as advertised (`hasCapability`
 *  always `true`), `run()` resolves every command with `undefined`
 *  (sufficient here: every assertion below cares only whether the guard
 *  under test throws BEFORE `driver.run()` is ever reached, not the
 *  resolved value's shape), and the two NOTIFY flags default `false`
 *  (overridable per test). */
function fakeDriver(
	overrides: Partial<{
		hasActiveNotifySelectedMessageNew: boolean;
		hasActiveNotifySelectedMessageExpunge: boolean;
	}> = {},
): MailboxSessionDriver {
	return {
		run: (async (_command: Command<unknown>) => undefined) as MailboxSessionDriver["run"],
		currentState: () => "selected" as ClientState,
		hasCapability: () => true,
		maxInlineSize: () => 8192,
		deselect: () => undefined,
		onQueuedBehindIsolated: () => () => undefined,
		idleRenewMs: () => 28 * 60_000,
		hasActiveNotifySelectedMessageNew: () => overrides.hasActiveNotifySelectedMessageNew ?? false,
		hasActiveNotifySelectedMessageExpunge: () =>
			overrides.hasActiveNotifySelectedMessageExpunge ?? false,
		noopFallbackIntervalMs: () => 30_000,
	};
}

function makeSession(
	snapshotOverrides: Partial<SelectResult> = {},
	driver: MailboxSessionDriver = fakeDriver(),
): MailboxSession {
	return new MailboxSession("INBOX", baseSnapshot(snapshotOverrides), driver);
}

describe("CF3+SF1 (M4-phase-boundary review): SEARCH/SORT/THREAD NOMODSEQ + NOTIFY guards", () => {
	describe("RFC7162-3.1.2.2-1 NOMODSEQ guard (criteriaHasModSeq -> assertModSeqUsable)", () => {
		test("search({modSeq}) on a NOMODSEQ mailbox throws CapabilityError (pre-existing guard, unaffected)", async () => {
			const session = makeSession({ highestModSeq: null, noModSeq: true });
			await expect(session.search({ modSeq: { since: 5n } })).rejects.toThrow(CapabilityError);
		});

		test("sort() with a modSeq criterion on a NOMODSEQ mailbox throws CapabilityError (new guard)", async () => {
			const session = makeSession({ highestModSeq: null, noModSeq: true });
			await expect(
				session.sort(["ARRIVAL"], { modSeq: { since: 5n } }),
			).rejects.toThrow(CapabilityError);
		});

		test("thread() with a modSeq criterion on a NOMODSEQ mailbox throws CapabilityError (new guard)", async () => {
			const session = makeSession({ highestModSeq: null, noModSeq: true });
			await expect(
				session.thread("ORDEREDSUBJECT", { modSeq: { since: 5n } }),
			).rejects.toThrow(CapabilityError);
		});

		test("negative: sort()/thread() with NO modSeq criterion are unaffected by a NOMODSEQ mailbox", async () => {
			const session = makeSession({ highestModSeq: null, noModSeq: true });
			await expect(session.sort(["ARRIVAL"], { all: true })).resolves.toBeUndefined();
			await expect(session.thread("ORDEREDSUBJECT", { all: true })).resolves.toBeUndefined();
		});

		test("negative: sort()/thread() with a modSeq criterion are unaffected when the mailbox HAS mod-sequences", async () => {
			const session = makeSession({ highestModSeq: 100n, noModSeq: false });
			await expect(
				session.sort(["ARRIVAL"], { modSeq: { since: 5n } }),
			).resolves.toBeUndefined();
			await expect(
				session.thread("ORDEREDSUBJECT", { modSeq: { since: 5n } }),
			).resolves.toBeUndefined();
		});
	});

	describe("RFC5465-5.2-4/-5.3-2 NOTIFY guards on a bare SearchCriteria.seq key", () => {
		const notifyDriver = fakeDriver({
			hasActiveNotifySelectedMessageNew: true,
			hasActiveNotifySelectedMessageExpunge: true,
		});

		test("search({seq: '3:*'}) is refused RangeError ('*' unstable under active MessageNew)", async () => {
			const session = makeSession({}, notifyDriver);
			await expect(session.search({ seq: "3:*" })).rejects.toThrow(RangeError);
		});

		test("sort(..., {seq: '3:*'}) is refused RangeError (new guard)", async () => {
			const session = makeSession({}, notifyDriver);
			await expect(session.sort(["ARRIVAL"], { seq: "3:*" })).rejects.toThrow(RangeError);
		});

		test("thread(..., {seq: '3:*'}) is refused RangeError (new guard)", async () => {
			const session = makeSession({}, notifyDriver);
			await expect(session.thread("ORDEREDSUBJECT", { seq: "3:*" })).rejects.toThrow(RangeError);
		});

		test("search({seq: '3'}) (no '*') is refused NotImplementedError under active MessageExpunge", async () => {
			const session = makeSession({}, notifyDriver);
			await expect(session.search({ seq: "3" })).rejects.toThrow(NotImplementedError);
		});

		test("sort(..., {seq: '3'}) is refused NotImplementedError (new guard)", async () => {
			const session = makeSession({}, notifyDriver);
			await expect(session.sort(["ARRIVAL"], { seq: "3" })).rejects.toThrow(NotImplementedError);
		});

		test("thread(..., {seq: '3'}) is refused NotImplementedError (new guard)", async () => {
			const session = makeSession({}, notifyDriver);
			await expect(session.thread("ORDEREDSUBJECT", { seq: "3" })).rejects.toThrow(NotImplementedError);
		});

		test("negative: search()/sort()/thread() with NO seq criterion are unaffected by active NOTIFY", async () => {
			const session = makeSession({}, notifyDriver);
			await expect(session.search({ all: true })).resolves.toBeUndefined();
			await expect(session.sort(["ARRIVAL"], { all: true })).resolves.toBeUndefined();
			await expect(session.thread("ORDEREDSUBJECT", { all: true })).resolves.toBeUndefined();
		});

		test("negative: a SearchCriteria.seq key is unaffected when NOTIFY is inactive", async () => {
			const session = makeSession(); // default fakeDriver(): both NOTIFY flags false
			await expect(session.search({ seq: "3:*" })).resolves.toBeUndefined();
			await expect(session.sort(["ARRIVAL"], { seq: "3:*" })).resolves.toBeUndefined();
			await expect(session.thread("ORDEREDSUBJECT", { seq: "3:*" })).resolves.toBeUndefined();
		});

		test("nested SearchCriteria.seq (under `and`/`or`/`not`/`fuzzy`) is caught too", async () => {
			const session = makeSession({}, notifyDriver);
			await expect(
				session.search({ and: [{ seq: "3:*" }, { subject: "hi" }] }),
			).rejects.toThrow(RangeError);
			await expect(session.search({ not: { seq: "3" } })).rejects.toThrow(NotImplementedError);
		});
	});
});
