import { afterEach } from "vitest";

import { ComplianceDriver } from "../driver/driver";
import { ScriptedServer, type ServerOptions } from "../harness/scripted-server";

/**
 * Per-file fixture owning ScriptedServer/ComplianceDriver cleanup. Call once
 * at module scope; use the returned factories inside tests.
 */
export function useComplianceFixture() {
	let server: ScriptedServer | undefined;
	let driver: ComplianceDriver | undefined;
	afterEach(async () => {
		const results = await Promise.allSettled([
			driver?.end(),
			server?.close(),
		]);
		driver = undefined;
		server = undefined;
		const failure = results.find((r) => r.status === "rejected");
		if (failure) throw (failure as PromiseRejectedResult).reason;
	});
	return {
		async startServer(opts?: ServerOptions): Promise<ScriptedServer> {
			server = await ScriptedServer.start(opts);
			return server;
		},
		newDriver(): ComplianceDriver {
			driver = new ComplianceDriver();
			return driver;
		},
	};
}
