import * as net from "node:net";
import { afterEach, expect, test } from "vitest";

import { command } from "../matchers";
import { close, expectLine, send } from "../script";
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
