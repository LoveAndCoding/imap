import * as net from "node:net";
import { afterEach, expect, test } from "vitest";

import { bareLine, command } from "../matchers";
import { close, expectLine, reply, send } from "../script";
import { ScriptedServer } from "../scripted-server";

let server: ScriptedServer | undefined;
afterEach(async () => {
	await server?.close();
	server = undefined;
});

function rawConnect(port: number): Promise<net.Socket> {
	return new Promise((resolve, reject) => {
		const sock = net.connect({ host: "127.0.0.1", port }, () => resolve(sock));
		sock.once("error", reject);
	});
}

function collect(sock: net.Socket): { data: () => string } {
	let buf = "";
	sock.on("data", (d) => (buf += d.toString("utf8")));
	return { data: () => buf };
}

test("sends greeting and matches an expected command line", async () => {
	server = await ScriptedServer.start();
	server.arm([
		[
			send("* OK ready\r\n"),
			expectLine(command("CAPABILITY")),
			send("* CAPABILITY IMAP4rev1\r\na1 OK done\r\n"),
			close(),
		],
	]);
	const sock = await rawConnect(server.port);
	const rx = collect(sock);
	sock.write("a1 CAPABILITY\r\n");
	const outcome = await server.outcome();
	expect(outcome.ok).toBe(true);
	await new Promise((r) => sock.once("close", r));
	expect(rx.data()).toContain("* OK ready\r\n");
	expect(rx.data()).toContain("a1 OK done\r\n");
});

test("chunked send delivers bytes intact", async () => {
	server = await ScriptedServer.start();
	server.arm([[send("* OK split-greeting\r\n", { chunks: [4, 7] }), close()]]);
	const sock = await rawConnect(server.port);
	const rx = collect(sock);
	await server.outcome();
	await new Promise((r) => sock.once("close", r));
	expect(rx.data()).toBe("* OK split-greeting\r\n");
	// Chunking must actually have happened: the transcript records one S entry
	// per write, so the greeting must appear as three separate sends ([4, 7]
	// plus the remainder), not one coalesced write.
	const sends = server.transcript
		.format()
		.split("\n")
		.filter((l) => / S: /.test(l));
	expect(sends).toHaveLength(3);
	expect(sends[0]).toContain("S: * OK");
	expect(sends[1]).toContain("S:  split-");
	expect(sends[2]).toContain("S: greeting\\r\\n");
});

test("fails the script when an unexpected line arrives", async () => {
	server = await ScriptedServer.start();
	server.arm([[send("* OK ready\r\n"), expectLine(command("CAPABILITY"))]]);
	const sock = await rawConnect(server.port);
	sock.write("a1 NOOP\r\n");
	const outcome = await server.outcome();
	expect(outcome.ok).toBe(false);
	expect(outcome.reason).toContain("NOOP");
	sock.destroy();
});

test("fails the script when a line is terminated by a bare LF", async () => {
	server = await ScriptedServer.start();
	server.arm([[send("* OK ready\r\n"), expectLine(command("CAPABILITY"))]]);
	const sock = await rawConnect(server.port);
	sock.write("a1 CAPABILITY\n");
	const outcome = await server.outcome();
	expect(outcome.ok).toBe(false);
	expect(outcome.reason).toContain("bare LF");
	sock.destroy();
});

test("flags a bare-LF line even when a CRLF-terminated line follows in the same chunk", async () => {
	// Regression guard: the bare-LF check used to run only when the buffer
	// contained NO CRLF at all, so `foo\n` arriving together with a later
	// valid `bar\r\n` was silently absorbed into one logical line instead of
	// failing the framing requirement the framing spec files rely on.
	server = await ScriptedServer.start();
	server.arm([[send("* OK ready\r\n"), expectLine(command("NOOP"))]]);
	const sock = await rawConnect(server.port);
	sock.write("a1 NOOP\na2 NOOP\r\n");
	const outcome = await server.outcome();
	expect(outcome.ok).toBe(false);
	expect(outcome.reason).toContain("bare LF");
	expect(outcome.reason).toContain("a1 NOOP");
	sock.destroy();
});

test("fails with timeout when expected line never arrives", async () => {
	server = await ScriptedServer.start({ stepTimeoutMs: 200 });
	server.arm([[send("* OK ready\r\n"), expectLine(command("CAPABILITY"))]]);
	const sock = await rawConnect(server.port);
	const outcome = await server.outcome();
	expect(outcome.ok).toBe(false);
	expect(outcome.reason).toContain("timed out");
	sock.destroy();
});

test("records a transcript of both directions", async () => {
	server = await ScriptedServer.start();
	server.arm([[send("* OK ready\r\n"), expectLine(command("CAPABILITY")), close()]]);
	const sock = await rawConnect(server.port);
	sock.write("a1 CAPABILITY\r\n");
	await server.outcome();
	const text = server.transcript.format();
	expect(text).toContain("S: * OK ready\\r\\n");
	expect(text).toContain("C: a1 CAPABILITY\\r\\n");
	sock.destroy();
});

test("records a literal8 (~{n}) marker, flagged binary, in commandLines[].literals", async () => {
	// BINARY (RFC 3516) APPENDs carry a literal8: `~{n}` (or non-sync `~{n+}`)
	// instead of `{n}`. The harness must record the payload octets in
	// commandLines[i].literals just like an ordinary literal, and distinguish
	// the literal8 form via a per-literal `binary` flag so the BINARY spec batch
	// (Task 9 / M4) can assert the client emitted the `~`-prefixed form.
	server = await ScriptedServer.start();
	server.arm([
		[
			send("* OK ready\r\n"),
			expectLine(command("APPEND")),
			send("a1 OK APPEND completed\r\n"),
			close(),
		],
	]);
	const sock = await rawConnect(server.port);
	// A synchronizing literal8: the harness auto-sends "+ Ready" then consumes
	// the 3 payload octets, and the trailing segment completes the logical line.
	sock.write("a1 APPEND INBOX ~{3}\r\n");
	sock.write("abc\r\n");
	const outcome = await server.outcome();
	expect(outcome.ok).toBe(true);
	expect(server.commandLines).toHaveLength(1);
	const rec = server.commandLines[0];
	expect(rec.literals).toHaveLength(1);
	expect(rec.literals[0].toString("latin1")).toBe("abc");
	expect(rec.binary).toEqual([true]);
	sock.destroy();
});

test("records an ordinary literal ({n}) flagged non-binary", async () => {
	// Contrast test: a plain `{n}` literal must record binary:false for that
	// literal, so the binary flag actually discriminates literal8 from literal.
	server = await ScriptedServer.start();
	server.arm([
		[
			send("* OK ready\r\n"),
			expectLine(command("APPEND")),
			send("a1 OK APPEND completed\r\n"),
			close(),
		],
	]);
	const sock = await rawConnect(server.port);
	sock.write("a1 APPEND INBOX {3}\r\n");
	sock.write("abc\r\n");
	const outcome = await server.outcome();
	expect(outcome.ok).toBe(true);
	expect(server.commandLines).toHaveLength(1);
	expect(server.commandLines[0].binary).toEqual([false]);
	sock.destroy();
});

test("matches a bare (tagless) DONE line in an IDLE continuation flow", async () => {
	// IDLE (RFC 2177 / RFC 9051 §6.3.13) ends its continuation with a BARE line:
	// `C: a1 IDLE` → `S: + idling` → `C: DONE` (no tag). This self-test pins the
	// harness capability the Phase 5 IDLE spec batch relies on:
	//  (1) expectLine() accepts any LineMatcher, so bareLine("DONE") matches a
	//      tagless line with no harness change;
	//  (2) a tagless match records NOTHING in commandTags/commandLines (doExpect
	//      only pushes when result.tag is set) — asserted below so a behavior
	//      change is caught;
	//  (3) lastTag survives the tagless match, so reply("OK done") answers with
	//      the IDLE command's own tag — exactly the framing IDLE requires.
	server = await ScriptedServer.start();
	server.arm([
		[
			send("* OK ready\r\n"),
			expectLine(command("IDLE", { args: null })),
			send("+ idling\r\n"),
			expectLine(bareLine("DONE")),
			reply("OK done"),
			close(),
		],
	]);
	const sock = await rawConnect(server.port);
	const rx = collect(sock);
	sock.write("a1 IDLE\r\n");
	// Wait for the continuation request before terminating the idle, as a real
	// client would (no fixed sleeps — resolve on the actual data event).
	await new Promise<void>((resolve) => {
		const check = () => {
			if (rx.data().includes("+ idling\r\n")) resolve();
			else sock.once("data", check);
		};
		check();
	});
	sock.write("DONE\r\n");
	const outcome = await server.outcome();
	expect(outcome.ok).toBe(true);
	await new Promise((r) => sock.once("close", r));
	// The reply used the IDLE command's tag even though DONE carried none.
	expect(rx.data()).toContain("a1 OK done\r\n");
	// The tagless DONE line is NOT recorded: only the tagged IDLE command is.
	expect(server.commandTags).toEqual(["a1"]);
	expect(server.commandLines).toHaveLength(1);
	expect(server.commandLines[0].verb).toBe("IDLE");
});

test("bare-line matcher rejects a tagged line and a wrong bare line", async () => {
	// Guard against a loose self-actualizing matcher: bareLine("DONE") must NOT
	// match a plausible wrong wire form (a TAGGED DONE, or some other bare line).
	const m = bareLine("DONE");
	expect(m.match("DONE").ok).toBe(true);
	expect(m.match("done").ok).toBe(true); // ABNF string literals are case-insensitive (RFC 5234)
	expect(m.match("a1 DONE").ok).toBe(false);
	expect(m.match("DONE ").ok).toBe(false);
	expect(m.match("NOOP").ok).toBe(false);
});

test("runs multiple sequential connection scripts", async () => {
	server = await ScriptedServer.start();
	server.arm([
		[send("* OK first\r\n"), close()],
		[send("* OK second\r\n"), close()],
	]);
	const s1 = await rawConnect(server.port);
	const r1 = collect(s1);
	await new Promise((r) => s1.once("close", r));
	const s2 = await rawConnect(server.port);
	const r2 = collect(s2);
	await new Promise((r) => s2.once("close", r));
	expect(r1.data()).toBe("* OK first\r\n");
	expect(r2.data()).toBe("* OK second\r\n");
	expect((await server.outcome()).ok).toBe(true);
});
