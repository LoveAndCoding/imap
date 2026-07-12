import { describe, expect, test } from "vitest";

import { Transcript } from "../transcript";

// clientLines() backs the credential-redaction negative assertions used
// across dozens of spec files ("the transcript's client direction never
// contains the password") — a silent behavior change here would turn all of
// those into vacuous checks, so its contract is pinned directly.
describe("Transcript.clientLines", () => {
	test("returns only client-direction entries, formatted like format()", () => {
		const t = new Transcript();
		t.record("S", "* OK ready\r\n");
		t.record("C", "a1 LOGIN user hunter2\r\n");
		t.record("!", "<TLS handshake (server side)>");
		t.record("C", "a2 NOOP\r\n");

		const lines = t.clientLines().split("\n");
		expect(lines).toHaveLength(2);
		expect(lines[0]).toMatch(/^\[\+\d+ms\] C: a1 LOGIN user hunter2\\r\\n$/);
		expect(lines[1]).toMatch(/^\[\+\d+ms\] C: a2 NOOP\\r\\n$/);
		// Server data must never leak into the client view: a redaction
		// assertion on clientLines() must not be satisfiable by S: entries.
		expect(t.clientLines()).not.toContain("OK ready");
	});

	test("escapes control characters the same way format() does", () => {
		const t = new Transcript();
		t.record("C", Buffer.from("a1 X\x01\x7f\\\r\n", "latin1"));
		expect(t.clientLines()).toContain("C: a1 X\\x01\\x7f\\\\\\r\\n");
	});

	test("returns an empty string when nothing was recorded from the client", () => {
		const t = new Transcript();
		t.record("S", "* OK ready\r\n");
		expect(t.clientLines()).toBe("");
	});
});
