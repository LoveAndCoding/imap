import * as tls from "node:tls";
import { afterEach, expect, test } from "vitest";

import { loadCertFixture } from "../tls";
import { close, expectLine, send, startTls } from "../script";
import { command } from "../matchers";
import { ScriptedServer } from "../scripted-server";

let server: ScriptedServer | undefined;
afterEach(async () => {
	await server?.close();
	server = undefined;
});

function tlsConnect(port: number, ca: Buffer): Promise<tls.TLSSocket> {
	return new Promise((resolve, reject) => {
		const sock = tls.connect(
			{ host: "127.0.0.1", port, ca: [ca], servername: "localhost" },
			() => resolve(sock),
		);
		sock.once("error", reject);
	});
}

test("implicit TLS server accepts a trusting client", async () => {
	const fixture = loadCertFixture("localhost");
	server = await ScriptedServer.start({ tlsImplicit: fixture });
	server.arm([[send("* OK secure\r\n"), close()]]);
	const sock = await tlsConnect(server.port, fixture.cert);
	let buf = "";
	sock.on("data", (d) => (buf += d.toString("utf8")));
	await server.outcome();
	await new Promise((r) => sock.once("close", r));
	expect(buf).toBe("* OK secure\r\n");
});

test("startTls step upgrades mid-connection", async () => {
	const fixture = loadCertFixture("localhost");
	server = await ScriptedServer.start({ tlsUpgrade: fixture });
	server.arm([
		[
			send("* OK ready\r\n"),
			expectLine(command("STARTTLS", { args: null })),
			send("a1 OK begin TLS\r\n"),
			startTls(),
			expectLine(command("CAPABILITY")),
			send("* CAPABILITY IMAP4rev1\r\na2 OK done\r\n"),
			close(),
		],
	]);

	const net = await import("node:net");
	const plain = net.connect({ host: "127.0.0.1", port: server.port });
	await new Promise((r) => plain.once("connect", r));
	await new Promise((r) => plain.once("data", r)); // greeting
	plain.write("a1 STARTTLS\r\n");
	await new Promise((r) => plain.once("data", r)); // OK
	const secured = tls.connect({
		socket: plain,
		ca: [fixture.cert],
		servername: "localhost",
	});
	await new Promise((r) => secured.once("secureConnect", r));
	secured.write("a2 CAPABILITY\r\n");
	await server.assertCompleted();
	secured.destroy();
});
