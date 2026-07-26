import { expect } from "vitest";

import { send } from "../../harness/script";
import { loadCertFixture } from "../../harness/tls";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";

const f = useComplianceFixture();

complianceTest(
	{
		reqs: ["RFC9525-6.6-1"],
		profiles: ["rev1", "rev2"],
		title: "implicit TLS: certificate for the wrong host is rejected",
		timeout: 5000,
	},
	async () => {
		const wrongHost = loadCertFixture("wrong-host");
		const server = await f.startServer({ tlsImplicit: wrongHost });
		// Greeting armed but should never be deliverable over a completed session.
		server.arm([[send("* OK should never complete a session\r\n")]]);

		const driver = f.newDriver();
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
