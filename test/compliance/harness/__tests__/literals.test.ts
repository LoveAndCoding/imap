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
			sock.write("line1\r\nline2\r\n"); // 14 octets literal, then CRLF ends command
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
	await server.outcome();
	await closed; // abrupt close reaches the client
	expect((await server.outcome()).ok).toBe(true);
});
