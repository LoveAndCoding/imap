import { describe, expect, test, vi } from "vitest";

import { MailboxSession } from "../../../src/client/mailbox";
import type { SelectResult } from "../../../src/commands/select";

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
		...overrides,
	};
}

describe("MailboxSession (spec §5b, M2.2 skeleton)", () => {
	test("constructs a live snapshot from a SelectResult", () => {
		const session = new MailboxSession("INBOX", baseSnapshot());
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
		const withWildcard = new MailboxSession("INBOX", baseSnapshot());
		expect(withWildcard.canCreateKeywords).toBe(true);

		const withoutWildcard = new MailboxSession(
			"INBOX",
			baseSnapshot({ permanentFlags: new Set(["\\Seen", "\\Deleted"]) }),
		);
		expect(withoutWildcard.canCreateKeywords).toBe(false);
	});

	test("PERMANENTFLAGS omitted -> permanentFlags null AND canCreateKeywords false (documented split)", () => {
		const session = new MailboxSession("INBOX", baseSnapshot({ permanentFlags: null }));
		expect(session.permanentFlags).toBeNull();
		// The RFC's "assume all flags are settable" omission-default is about the
		// FLAGS already listed, not about the separate \* create-new-keywords
		// capability -- nothing licenses assuming \* when it was never announced.
		expect(session.canCreateKeywords).toBe(false);
	});

	test("noModSeq collapses highestModSeq to null even if a value was also parsed", () => {
		const session = new MailboxSession(
			"INBOX",
			baseSnapshot({ noModSeq: true, highestModSeq: 12345n }),
		);
		expect(session.highestModSeq).toBeNull();
	});

	describe("internal driver surface (ImapClient's state-tracker lane)", () => {
		test("markClosed emits 'closed' with the given reason exactly once", () => {
			const session = new MailboxSession("INBOX", baseSnapshot());
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
			const session = new MailboxSession("INBOX", baseSnapshot({ exists: 3 }));
			const handler = vi.fn();
			session.on("exists", handler);

			MailboxSession.applyExists(session, 5);
			expect(session.exists).toBe(5);
			expect(handler).toHaveBeenCalledExactlyOnceWith(5, 3);

			MailboxSession.applyExists(session, 5);
			expect(handler).toHaveBeenCalledTimes(1);
		});

		test("applyExpunge decrements exists (floored at 0) and emits the seq", () => {
			const session = new MailboxSession("INBOX", baseSnapshot({ exists: 1 }));
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
			const session = new MailboxSession("INBOX", baseSnapshot());
			const handler = vi.fn();
			session.on("flags", handler);

			const update = { seq: 2, uid: 9, flags: new Set(["\\Seen"]), modSeq: 7n };
			MailboxSession.applyFlagsUpdate(session, update);
			expect(handler).toHaveBeenCalledExactlyOnceWith(update);
		});

		test("applyUidValidity emits (next, prev) only when it actually changes", () => {
			const session = new MailboxSession("INBOX", baseSnapshot({ uidValidity: 1 }));
			const handler = vi.fn();
			session.on("uidValidityChanged", handler);

			MailboxSession.applyUidValidity(session, 1);
			expect(handler).not.toHaveBeenCalled();

			MailboxSession.applyUidValidity(session, 2);
			expect(session.uidValidity).toBe(2);
			expect(handler).toHaveBeenCalledExactlyOnceWith(2, 1);
		});

		test("every apply* is a no-op once the session is closed", () => {
			const session = new MailboxSession("INBOX", baseSnapshot({ exists: 3 }));
			MailboxSession.markClosed(session, "closed");

			const existsHandler = vi.fn();
			const expungeHandler = vi.fn();
			session.on("exists", existsHandler);
			session.on("expunge", expungeHandler);

			MailboxSession.applyExists(session, 99);
			MailboxSession.applyExpunge(session, 1);
			MailboxSession.applyRecent(session, 5);
			MailboxSession.applyUidValidity(session, 999);

			expect(session.exists).toBe(3);
			expect(session.uidValidity).toBe(42);
			expect(existsHandler).not.toHaveBeenCalled();
			expect(expungeHandler).not.toHaveBeenCalled();
		});
	});
});
