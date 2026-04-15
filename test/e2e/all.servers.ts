import { Session } from "../../src";

export const describeAllServers = (host: string, port: number) => {
	let session: Session;
	describe("Unauthenticated state", () => {
		afterEach(async () => {
			if (session) {
				try {
					await session.end();
				} catch (_) {}
				session = undefined as any;
			}
		});

		it("grabs server info and capabilities on connection and clears them after", async () => {
			session = new Session({
				host,
				port,
			});
			expect(session.active).toBe(false);
			expect(session.authenticated).toBe(false);
			await session.start();
			expect(session.active).toBe(true);
			expect(session.authenticated).toBe(false);
			expect(session.capabilities?.capabilities).not.toHaveLength(0);
			expect(session.server).toBeInstanceOf(Map);
			await session.end();
			expect(session.active).toBe(false);
			expect(session.authenticated).toBe(false);
			expect(session.capabilities).toBeFalsy();
			expect(session.server).toBeFalsy();
		});
	});
};
