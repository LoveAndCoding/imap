import * as net from "node:net";
import { afterEach, expect, test } from "vitest";

import { command } from "../matchers";
import { close, destroy, expectLine, reply, send } from "../script";
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

test("synchronizing literal gets an automatic continuation and flat assembly", async () => {
	server = await ScriptedServer.start();
	server.arm([
		[
			send("* OK ready\r\n"),
			expectLine(command("LOGIN")),
			reply("OK done"),
			close(),
		],
	]);
	const sock = await rawConnect(server.port);
	let rx = "";
	sock.on("data", (d) => {
		rx += d.toString("utf8");
		// After the continuation arrives, send the literal payload + rest.
		if (rx.endsWith("+ Ready\r\n")) {
			sock.write("secret PASS2\r\n");
		}
	});
	sock.write("a1 LOGIN {6}\r\n");
	await server.assertCompleted();
	// Matched line keeps the literal marker; payload is recorded separately.
	expect(server.commandLines[0].args).toBe("{6} PASS2");
	expect(server.commandLines[0].literals.length).toBe(1);
	expect(server.commandLines[0].literals[0].toString("utf8")).toBe("secret");
	expect(server.commandLines[0].nonSync).toEqual([false]);
});

test("LITERAL+ non-sync literal needs no continuation", async () => {
	server = await ScriptedServer.start();
	server.arm([
		[
			send("* OK ready\r\n"),
			expectLine(command("LOGIN")),
			reply("OK done"),
			close(),
		],
	]);
	const sock = await rawConnect(server.port);
	sock.write("a1 LOGIN {4+}\r\nuser pass\r\n");
	await server.assertCompleted();
	expect(server.commandLines[0].args).toBe("{4+} pass");
	expect(server.commandLines[0].literals[0].toString("utf8")).toBe("user");
	expect(server.commandLines[0].nonSync).toEqual([true]);
});

test("literal octet count is honored exactly (CRLF inside literal preserved)", async () => {
	server = await ScriptedServer.start();
	server.arm([
		[
			send("* OK ready\r\n"),
			expectLine(command("APPEND")),
			reply("OK done"),
			close(),
		],
	]);
	const sock = await rawConnect(server.port);
	let rx = "";
	sock.on("data", (d) => {
		rx += d.toString("utf8");
		if (rx.endsWith("+ Ready\r\n")) {
			sock.write("line1\r\nline2\r\n"); // 12-octet literal, then CRLF ends command
		}
	});
	sock.write("a1 APPEND INBOX {12}\r\n");
	await server.assertCompleted();
	expect(server.commandLines[0].args).toBe("INBOX {12}");
	expect(server.commandLines[0].literals[0].toString("utf8")).toBe("line1\r\nline2");
});

test("oversized literal announcement fails the script", async () => {
	server = await ScriptedServer.start();
	server.arm([[send("* OK ready\r\n"), expectLine(command("APPEND"))]]);
	const sock = await rawConnect(server.port);
	sock.write(`a1 APPEND INBOX {${2 * 1024 * 1024}}\r\n`);
	const outcome = await server.outcome();
	expect(outcome.ok).toBe(false);
	expect(outcome.reason).toContain("literal");
	sock.destroy();
});

test("destroy step abruptly terminates the connection", async () => {
	server = await ScriptedServer.start();
	server.arm([[send("* OK ready\r\n"), destroy()]]);
	const sock = await rawConnect(server.port);
	// Resume the socket so the OS-level FIN/RST from the server's destroy()
	// call is delivered to Node.js — without a data listener the socket stays
	// in paused mode and libuv does not monitor the fd for read-side events.
	sock.resume();
	const closed = new Promise<boolean>((r) => sock.once("close", (hadErr) => r(hadErr)));
	const outcome = await server.outcome();
	await closed; // abrupt close reaches the client
	expect(outcome.ok).toBe(true);
});

// Harness mechanics test: the server sends "+" before any payload bytes arrive,
// confirming the ScriptedServer continuation behaviour (not a driver/RFC test).
test("synchronizing literal: harness sends continuation before payload is read", async () => {
	server = await ScriptedServer.start();
	server.arm([
		[
			send("* OK ready\r\n"),
			expectLine(command("LOGIN")),
			reply("OK done"),
			close(),
		],
	]);

	let continuationReceived = false;
	let payloadSent = false;

	expect(server).toBeDefined();
	const s = server as ScriptedServer;
	await new Promise<void>((resolve, reject) => {
		const sock = net.connect({ host: "127.0.0.1", port: s.port }, () => {
			// Send LOGIN with a synchronizing literal for the password.
			sock.write("a1 LOGIN user {6}\r\n");
		});
		sock.on("data", (d: Buffer) => {
			const text = d.toString("utf8");
			if (text.includes("+ Ready")) {
				// Continuation received BEFORE payload
				continuationReceived = true;
				payloadSent = true;
				sock.write("passwd\r\n");
			}
		});
		sock.on("error", reject);
		s
			.outcome()
			.then((o) => {
				sock.destroy();
				if (o.ok) resolve();
				else reject(new Error(o.reason));
			})
			.catch(reject);
	});

	expect(continuationReceived).toBe(true);
	expect(payloadSent).toBe(true);
});

test("two literals in one command interleave correctly, even chunked", async () => {
	server = await ScriptedServer.start();
	server.arm([
		[
			send("* OK ready\r\n"),
			expectLine(command("LOGIN")),
			reply("OK done"),
			close(),
		],
	]);
	const sock = await rawConnect(server.port);
	let rx = "";
	let stage = 0;
	sock.on("data", (d) => {
		rx += d.toString("utf8");
		if (rx.endsWith("+ Ready\r\n")) {
			rx = "";
			if (stage === 0) {
				stage = 1;
				// First literal payload split across two writes, then the
				// second literal announcement.
				sock.write("us");
				setTimeout(() => sock.write("er {4}\r\n"), 5);
			} else {
				sock.write("pass\r\n");
			}
		}
	});
	sock.write("a1 LOGIN {4}\r\n");
	await server.assertCompleted();
	expect(server.commandLines[0].args).toBe("{4} {4}");
	expect(server.commandLines[0].literals.map((b) => b.toString("utf8"))).toEqual([
		"user",
		"pass",
	]);
	expect(server.commandLines[0].nonSync).toEqual([false, false]);
});
