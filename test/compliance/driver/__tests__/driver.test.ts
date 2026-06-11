import { afterEach, expect, test } from "vitest";

import { ComplianceDriver } from "../driver";
import { NotImplementedError } from "../errors";
import { close, expectLine, reply, send } from "../../harness/script";
import { command } from "../../harness/matchers";
import { ScriptedServer } from "../../harness/scripted-server";

let server: ScriptedServer | undefined;
let driver: ComplianceDriver | undefined;
afterEach(async () => {
	await driver?.end();
	await server?.close();
	server = undefined;
	driver = undefined;
});

test("connect() drives Session.start against the scripted server", async () => {
	server = await ScriptedServer.start();
	server.arm([
		[
			send("* OK ready\r\n"),
			expectLine(command("CAPABILITY", { args: null })),
			reply("OK done", ["* CAPABILITY IMAP4rev1"]),
		],
	]);
	driver = new ComplianceDriver();
	const connected = await driver.connect({
		host: "127.0.0.1",
		port: server.port,
		security: "none",
	});
	expect(connected).toBe(true);
	expect(driver.hasCapability("IMAP4rev1")).toBe(true);
	await server.assertCompleted();
});

test("unimplemented verbs throw NotImplementedError", async () => {
	driver = new ComplianceDriver();
	await expect(driver.noop()).rejects.toBeInstanceOf(NotImplementedError);
	await expect(driver.login("u", "p")).rejects.toBeInstanceOf(NotImplementedError);
	await expect(driver.select("INBOX")).rejects.toBeInstanceOf(NotImplementedError);
});
