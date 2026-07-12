import { AuthError } from "../../../src/errors";
import { SaslContext } from "../../../src/sasl/mechanism";
import {
	createExternalMechanism,
	ExternalMechanism,
} from "../../../src/sasl/external";

function ctx(overrides: Partial<SaslContext> = {}): SaslContext {
	return {
		user: "tim",
		pass: "tanstaaftanstaaf",
		host: "imap.example.com",
		port: 993,
		...overrides,
	};
}

describe("ExternalMechanism", () => {
	test("name and transport requirement", () => {
		//Arrange
		const mech = new ExternalMechanism();

		//Assert
		expect(mech.name).toBe("EXTERNAL");
		expect(mech.requiresSecureTransport).toBe(true);
	});

	test("createExternalMechanism() returns a working instance", async () => {
		//Act
		const mech = createExternalMechanism();
		const initial = await mech.start(ctx());

		//Assert
		expect(initial).toBeInstanceOf(Buffer);
		expect(initial.length).toBe(0);
	});

	test("empty authzid produces an empty buffer (derive identity from credentials)", async () => {
		//Arrange
		const mech = new ExternalMechanism();

		//Act
		const initial = await mech.start(ctx());

		//Assert
		expect(initial).toBeInstanceOf(Buffer);
		expect(initial.length).toBe(0);
	});

	test("absent authzid produces an empty buffer", async () => {
		//Arrange
		const mech = new ExternalMechanism();

		//Act
		const initial = await mech.start(ctx({ authzid: undefined }));

		//Assert
		expect(initial.length).toBe(0);
	});

	test("named authzid produces the exact UTF-8 bytes", async () => {
		//Arrange
		const mech = new ExternalMechanism();

		//Act
		const initial = await mech.start(ctx({ authzid: "userA" }));

		//Assert
		expect(initial.toString("utf8")).toBe("userA");
		expect(initial.compare(Buffer.from("userA", "utf8"))).toBe(0);
	});

	test("named authzid with non-ASCII UTF-8 content round-trips exactly", async () => {
		//Arrange
		const mech = new ExternalMechanism();
		const authzid = "usér-é";

		//Act
		const initial = await mech.start(ctx({ authzid }));

		//Assert
		expect(initial.compare(Buffer.from(authzid, "utf8"))).toBe(0);
	});

	test("NUL byte in authzid throws AuthError", async () => {
		//Arrange
		const mech = new ExternalMechanism();

		//Act & Assert
		await expect(
			mech.start(ctx({ authzid: "us\0erA" })),
		).rejects.toThrow(AuthError);
	});

	test("step() always throws", async () => {
		//Arrange
		const mech = new ExternalMechanism();

		//Act & Assert
		await expect(
			mech.step(Buffer.alloc(0), ctx()),
		).rejects.toThrow(AuthError);
	});

	test("finish() is a no-op regardless of data", async () => {
		//Arrange
		const mech = new ExternalMechanism();

		//Act & Assert
		await expect(mech.finish(null, ctx())).resolves.toBeUndefined();
		await expect(
			mech.finish(Buffer.from("ignored"), ctx()),
		).resolves.toBeUndefined();
	});
});
