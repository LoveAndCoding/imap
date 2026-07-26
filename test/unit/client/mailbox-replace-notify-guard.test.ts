// H14 fix (second-review): every sibling seq-grain static in
// src/client/mailbox.ts (runStore/runGmailLabelsStore/runConvert/
// runCopyOrMove/runFetch) calls assertSequenceGrainSafeUnderNotify() before
// dispatching -- runReplace was missing it. Under an active NOTIFY SET
// (SELECTED (MessageExpunge ...)) registration (RFC 5465 §5.3), a stale MSN
// can resolve to a different message by the time the server parses the
// command (RFC5465-5.3-2), and REPLACE atomically appends-and-removes (RFC
// 8508 §3.2) -- so seq.replace(<seq>, ...) under that condition could
// silently replace/delete the wrong message. This file exercises
// MailboxSession.replace()/SeqFacet.replace() directly against a minimal
// fake MailboxSessionDriver (mirroring mailbox-search-sort-thread-guards.
// test.ts's own fakeDriver() convention) rather than a full ImapClient/
// ScriptedServer round trip -- the guard under test throws entirely
// client-side, before ReplaceCommand is even constructed, so a full wire
// round trip adds nothing but noise.
import { describe, expect, test } from "vitest";

import type { Command } from "../../../src/commands/base";
import type { SelectResult } from "../../../src/commands/select";
import { MailboxSession } from "../../../src/client/mailbox";
import type { MailboxSessionDriver } from "../../../src/client/mailbox";
import type { ClientState } from "../../../src/client/state";
import { NotImplementedError } from "../../../src/errors";

const MESSAGE = Buffer.from("Subject: draft\r\n\r\nBody.\r\n");

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

/** Same minimal-fake-driver convention as mailbox.test.ts's/
 *  mailbox-search-sort-thread-guards.test.ts's own fakeDriver() -- every
 *  capability (including REPLACE) reads as advertised, run() resolves with
 *  `undefined` (sufficient: every assertion here cares only whether the
 *  guard throws BEFORE driver.run() is ever reached), and the NOTIFY flags
 *  default false (overridable per test). */
function fakeDriver(
	overrides: Partial<{
		hasActiveNotifySelectedMessageNew: boolean;
		hasActiveNotifySelectedMessageExpunge: boolean;
	}> = {},
): MailboxSessionDriver {
	return {
		run: (async (_command: Command<unknown>) => undefined) as MailboxSessionDriver["run"],
		currentState: () => "selected" as ClientState,
		// Every capability reads as advertised EXCEPT UIDONLY (RFC 9586) --
		// left un-ENABLEd so `assertUidOnlyInactive()`'s own, unrelated,
		// seq-grain lockout doesn't mask the NOTIFY guard this file targets.
		hasCapability: (cap) => cap !== "UIDONLY",
		maxInlineSize: () => 8192,
		deselect: () => undefined,
		onQueuedBehindIsolated: () => () => undefined,
		idleRenewMs: () => 28 * 60_000,
		hasActiveNotifySelectedMessageNew: () => overrides.hasActiveNotifySelectedMessageNew ?? false,
		hasActiveNotifySelectedMessageExpunge: () =>
			overrides.hasActiveNotifySelectedMessageExpunge ?? false,
		noopFallbackIntervalMs: () => 30_000,
		knownAppendLimit: () => false,
	};
}

function makeSession(
	snapshotOverrides: Partial<SelectResult> = {},
	driver: MailboxSessionDriver = fakeDriver(),
): MailboxSession {
	return new MailboxSession("INBOX", baseSnapshot(snapshotOverrides), driver);
}

describe("H14 fix: RFC5465-5.3-2 NOTIFY guard on seq.replace()", () => {
	const notifyDriver = fakeDriver({ hasActiveNotifySelectedMessageExpunge: true });

	test("seq.replace(<seq>, ...) is refused NotImplementedError while a SELECTED MessageExpunge NOTIFY registration is active", async () => {
		const session = makeSession({}, notifyDriver);
		await expect(session.seq.replace(3, "INBOX", MESSAGE)).rejects.toThrow(
			NotImplementedError,
		);
	});

	test("the refusal message cites RFC5465-5.3-2, matching every sibling seq-grain guard", async () => {
		const session = makeSession({}, notifyDriver);
		await expect(session.seq.replace(3, "INBOX", MESSAGE)).rejects.toThrow(
			/RFC5465-5\.3-2/,
		);
	});

	test("replace(<uid>, ...) (UID grain) is completely unaffected by the same active NOTIFY registration", async () => {
		const session = makeSession({}, notifyDriver);
		// The fake driver's run() resolves every command with `undefined`
		// (an AppendResult with no APPENDUID, same shape a UIDPLUS-less
		// server produces) -- what matters here is that the call resolves
		// AT ALL rather than rejecting with the seq-grain-only guard.
		await expect(session.replace(3, "INBOX", MESSAGE)).resolves.toBeUndefined();
	});

	test("negative: seq.replace() is unaffected when NOTIFY is inactive (default fakeDriver)", async () => {
		const session = makeSession(); // default fakeDriver(): both NOTIFY flags false
		await expect(session.seq.replace(3, "INBOX", MESSAGE)).resolves.toBeUndefined();
	});
});
