import { ImapClient } from "../../src";

export const describeAllServers = (host: string, port: number) => {
	let client: ImapClient;
	describe("Unauthenticated state", () => {
		afterEach(async () => {
			if (client) {
				try {
					await client.close({ force: true });
				} catch (_) {
					// Intentionally ignored: best-effort cleanup between tests
				}
				client = undefined as any;
			}
		});

		it("grabs server info and capabilities on connection and clears them after", async () => {
			client = new ImapClient({
				host,
				port,
			});
			expect(client.state).toBe("disconnected");
			await client.connect();
			expect(client.state).toBe("not-authenticated");
			expect(client.capabilities.all().size).not.toBe(0);
			expect(client.serverId).toBeInstanceOf(Map);
			await client.close({ force: true });
			expect(client.state).toBe("disconnected");
			expect(client.capabilities.all().size).toBe(0);
		});
	});
};
