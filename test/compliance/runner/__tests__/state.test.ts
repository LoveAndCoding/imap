import { describe, expect, test } from "vitest";

import { capabilityExchange, greet, loginExchange, selectExchange } from "../state";

describe("state script prefixes", () => {
	test("greet defaults to plain OK", () => {
		const [step] = greet();
		expect(step).toEqual({ kind: "send", data: "* OK ready\r\n" });
	});

	test("greet preauth variant", () => {
		const [step] = greet({ kind: "preauth" });
		expect((step as { data: string }).data).toBe("* PREAUTH ready\r\n");
	});

	test("capabilityExchange expects CAPABILITY and replies with the list", () => {
		const steps = capabilityExchange(["IMAP4rev1", "STARTTLS"]);
		expect(steps.map((s) => s.kind)).toEqual(["expect", "reply"]);
		expect((steps[1] as { untagged: string[] }).untagged).toEqual([
			"* CAPABILITY IMAP4rev1 STARTTLS",
		]);
	});

	test("loginExchange expects LOGIN and replies OK", () => {
		const steps = loginExchange();
		expect(steps.map((s) => s.kind)).toEqual(["expect", "reply"]);
	});

	test("selectExchange produces the canonical RFC 3501 §6.3.1 response set", () => {
		const steps = selectExchange("INBOX", { exists: 3, recent: 1, uidValidity: 42 });
		const replyStep = steps[1] as { suffix: string; untagged: string[] };
		expect(replyStep.untagged).toEqual([
			"* 3 EXISTS",
			"* 1 RECENT",
			"* OK [UNSEEN 1] Message 1 is first unseen",
			"* OK [UIDVALIDITY 42] UIDs valid",
			"* OK [UIDNEXT 4] Predicted next UID",
			"* FLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft)",
			"* OK [PERMANENTFLAGS (\\Deleted \\Seen \\*)] Limited",
		]);
		expect(replyStep.suffix).toBe("OK [READ-WRITE] SELECT completed");
	});
});
