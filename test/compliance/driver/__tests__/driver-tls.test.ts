import { expect, test } from "vitest";

import { ComplianceDriver } from "../driver";
import { expectLine, reply, send } from "../../harness/script";
import { command } from "../../harness/matchers";
import { ScriptedServer } from "../../harness/scripted-server";
import { loadCertFixture } from "../../harness/tls";
import { useComplianceFixture } from "../../runner/fixture";

const f = useComplianceFixture();

test("driver connects over implicit TLS with a trusted localhost cert", async () => {
	const localhost = loadCertFixture("localhost");
	const server = await f.startServer({ tlsImplicit: localhost });
	server.arm([
		[
			send("* OK secure ready\r\n"),
			expectLine(command("CAPABILITY", { args: null })),
			reply("OK done", ["* CAPABILITY IMAP4rev1"]),
		],
	]);
	const driver = f.newDriver();
	const ok = await driver.connect({
		host: "127.0.0.1",
		port: server.port,
		security: "implicit",
		ca: localhost.cert,
		timeoutMs: 3000,
	});
	expect(ok).toBe(true);
	expect(driver.hasCapability("IMAP4rev1")).toBe(true);
	await server.assertCompleted();
});
