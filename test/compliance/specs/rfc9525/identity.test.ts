import { afterEach, expect } from "vitest";

import { ComplianceDriver } from "../../driver/driver";
import { send } from "../../harness/script";
import { ScriptedServer } from "../../harness/scripted-server";
import { loadCertFixture } from "../../harness/tls";
import { complianceTest } from "../../runner/compliance-test";

let server: ScriptedServer | undefined;
let driver: ComplianceDriver | undefined;
afterEach(async () => {
	await driver?.end();
	await server?.close();
	server = undefined;
	driver = undefined;
});

complianceTest(
	{
		reqs: ["RFC9525-6.6-1"],
		profiles: ["rev1", "rev2"],
		title: "implicit TLS: certificate for the wrong host is rejected",
	},
	async () => {
		const wrongHost = loadCertFixture("wrong-host");
		server = await ScriptedServer.start({ tlsImplicit: wrongHost });
		// Greeting armed but should never be deliverable over a completed session.
		server.arm([[send("* OK should never complete a session\r\n")]]);

		driver = new ComplianceDriver();
		// The CA *is* trusted (we pass it), so the only failure mode left is
		// identity mismatch: cert says wrong.example.test, we connect to 127.0.0.1.
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "implicit",
			ca: wrongHost.cert,
			timeoutMs: 2000,
		});
		expect(ok).toBe(false);
		expect(driver.active).toBe(false);
	},
);
