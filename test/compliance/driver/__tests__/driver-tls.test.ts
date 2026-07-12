import { expect, test } from "vitest";

import { expectLine, reply, send } from "../../harness/script";
import { command } from "../../harness/matchers";
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

test("a rejected TLS identity surfaces as a driver rejection, not a hang", async () => {
	// The client currently never settles its connect promise when certificate
	// identity verification fails, so every TLS-rejection spec test used to die
	// at vitest's opaque test timeout. The driver's connect backstop must turn
	// that into a prompt, diagnosable rejection. (If the client gains a
	// graceful failure path, connect() rejects on its own — this test asserts
	// the observable contract either way: rejection, never a hang.)
	const wrongHost = loadCertFixture("wrong-host");
	const server = await f.startServer({ tlsImplicit: wrongHost });
	server.arm([[send("* OK secure ready\r\n")]]);
	const driver = f.newDriver();
	await expect(
		driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "implicit",
			ca: wrongHost.cert,
			timeoutMs: 500,
		}),
	).rejects.toThrow();
	// The backstop also cleared the half-open client, so teardown cannot hang.
	expect(driver.active).toBe(false);
});
