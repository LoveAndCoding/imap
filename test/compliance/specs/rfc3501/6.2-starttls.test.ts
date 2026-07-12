import { expect } from "vitest";

import { command } from "../../harness/matchers";
import { expectLine, reply, send, startTls } from "../../harness/script";
import { loadCertFixture } from "../../harness/tls";
import { complianceTest } from "../../runner/compliance-test";
import { useComplianceFixture } from "../../runner/fixture";

const f = useComplianceFixture();

const localhost = loadCertFixture("localhost");

complianceTest(
	{
		reqs: ["RFC3501-6.2.1-1", "RFC3501-6.2.1-2", "RFC3501-6.2.1-3"],
		profiles: ["rev1"],
		title:
			"STARTTLS: no plaintext after OK; capabilities discarded and re-issued post-TLS",
	},
	async () => {
		const server = await f.startServer({ tlsUpgrade: localhost });
		server.arm([
			[
				// Plain greeting — no capability code. The client will issue
				// CAPABILITY pre-TLS, which the server advertises PRE-TLS-ONLY
				// and STARTTLS in. The client must then discard those after
				// upgrading and re-issue CAPABILITY post-TLS (6.2.1-2).
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK caps", ["* CAPABILITY IMAP4rev1 STARTTLS PRE-TLS-ONLY"]),
				expectLine(command("STARTTLS", { args: null })),
				reply("OK begin TLS negotiation"),
				startTls(), // fails the script if plaintext arrives before handshake
				// Post-TLS: client SHOULD re-issue CAPABILITY (6.2.1-2);
				// this expect step fails (timeout) if it never does.
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK done", ["* CAPABILITY IMAP4rev1 POST-TLS-ONLY"]),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "starttls",
			ca: localhost.cert,
		});
		expect(ok).toBe(true);
		await server.assertCompleted();
		// 6.2.1-1: cached pre-TLS capability information must be gone.
		expect(driver.hasCapability("PRE-TLS-ONLY")).toBe(false);
		expect(driver.hasCapability("POST-TLS-ONLY")).toBe(true);
	},
);
