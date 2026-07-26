import { AuthError } from "../../../src/errors";
import { SaslContext } from "../../../src/sasl/mechanism";
import { createPlainMechanism, PlainMechanism } from "../../../src/sasl/plain";

function ctx(overrides: Partial<SaslContext> = {}): SaslContext {
	return {
		user: "tim",
		pass: "tanstaaftanstaaf",
		host: "imap.example.com",
		port: 993,
		...overrides,
	};
}

describe("PlainMechanism", () => {
	test("name and transport requirement", () => {
		//Arrange
		const mech = new PlainMechanism();

		//Assert
		expect(mech.name).toBe("PLAIN");
		expect(mech.requiresSecureTransport).toBe(true);
	});

	test("createPlainMechanism() returns a working instance", async () => {
		//Act
		const mech = createPlainMechanism();
		const initial = await mech.start(ctx());

		//Assert
		expect(initial?.toString("hex")).toBe(
			"0074696d0074616e737461616674616e7374616166",
		);
	});

	test("start() produces the exact RFC 4616 example wire bytes (empty authzid)", async () => {
		//Arrange
		const mech = new PlainMechanism();

		//Act
		const initial = await mech.start(ctx());

		//Assert — RFC 4616 §2's own worked example: NUL "tim" NUL
		// "tanstaaftanstaaf".
		expect(initial).toBeInstanceOf(Buffer);
		expect(initial?.toString("hex")).toBe(
			"0074696d0074616e737461616674616e7374616166",
		);
	});

	test("start() includes a non-empty authzid verbatim before the first NUL", async () => {
		//Arrange
		const mech = new PlainMechanism();

		//Act
		const initial = await mech.start(ctx({ authzid: "Zorro" }));

		//Assert
		expect(initial?.toString("hex")).toBe(
			"5a6f72726f0074696d0074616e737461616674616e7374616166",
		);
		expect(initial?.toString("utf8")).toBe(
			"Zorro\0tim\0tanstaaftanstaaf",
		);
	});

	test("missing pass throws AuthError", async () => {
		//Arrange
		const mech = new PlainMechanism();
		const badCtx = ctx({ pass: undefined });

		//Act & Assert
		await expect(mech.start(badCtx)).rejects.toThrow(AuthError);
		await expect(mech.start(badCtx)).rejects.toThrow(/pass/);
	});

	test("NUL byte in user throws AuthError", async () => {
		//Arrange
		const mech = new PlainMechanism();

		//Act & Assert
		await expect(mech.start(ctx({ user: "ti\0m" }))).rejects.toThrow(
			AuthError,
		);
	});

	test("NUL byte in pass throws AuthError", async () => {
		//Arrange
		const mech = new PlainMechanism();

		//Act & Assert
		await expect(
			mech.start(ctx({ pass: "tans\0taaf" })),
		).rejects.toThrow(AuthError);
	});

	test("NUL byte in authzid throws AuthError", async () => {
		//Arrange
		const mech = new PlainMechanism();

		//Act & Assert
		await expect(
			mech.start(ctx({ authzid: "zo\0rro" })),
		).rejects.toThrow(AuthError);
	});

	test("step() always throws", async () => {
		//Arrange
		const mech = new PlainMechanism();

		//Act & Assert
		await expect(
			mech.step(Buffer.alloc(0), ctx()),
		).rejects.toThrow(AuthError);
	});

	test("finish() is a no-op regardless of data", async () => {
		//Arrange
		const mech = new PlainMechanism();

		//Act & Assert
		await expect(mech.finish(null, ctx())).resolves.toBeUndefined();
		await expect(
			mech.finish(Buffer.from("ignored"), ctx()),
		).resolves.toBeUndefined();
	});
});
