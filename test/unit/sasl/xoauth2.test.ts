import { AuthError } from "../../../src/errors";
import { SaslContext } from "../../../src/sasl/mechanism";
import {
	createXOAuth2Mechanism,
	XOAuth2Mechanism,
} from "../../../src/sasl/xoauth2";

function ctx(overrides: Partial<SaslContext> = {}): SaslContext {
	return {
		user: "someuser@example.com",
		accessToken: "ya29.SomeAccessToken",
		host: "imap.gmail.com",
		port: 993,
		...overrides,
	};
}

describe("XOAuth2Mechanism", () => {
	test("name and transport requirement", () => {
		//Arrange
		const mech = new XOAuth2Mechanism();

		//Assert
		expect(mech.name).toBe("XOAUTH2");
		expect(mech.requiresSecureTransport).toBe(true);
	});

	test("createXOAuth2Mechanism() returns a working instance", async () => {
		//Act
		const mech = createXOAuth2Mechanism();
		const initial = await mech.start(ctx());

		//Assert
		expect(initial).toBeInstanceOf(Buffer);
	});

	test("start() produces the exact initial-response bytes", async () => {
		//Arrange
		const mech = new XOAuth2Mechanism();
		const c = ctx();
		const expected = `user=${c.user}\x01auth=Bearer ${c.accessToken}\x01\x01`;

		//Act
		const initial = await mech.start(c);

		//Assert
		expect(initial?.toString("utf8")).toBe(expected);
	});

	test("missing accessToken throws AuthError", async () => {
		//Arrange
		const mech = new XOAuth2Mechanism();

		//Act & Assert
		await expect(
			mech.start(ctx({ accessToken: undefined })),
		).rejects.toThrow(AuthError);
	});

	test("error-challenge flow: step() responds with an empty Buffer and finish() throws", async () => {
		//Arrange
		const mech = new XOAuth2Mechanism();
		await mech.start(ctx());
		const errorPayload = JSON.stringify({
			status: "400",
			schemes: "Bearer",
			scope: "https://mail.google.com/",
		});

		//Act
		const stepResult = await mech.step(
			Buffer.from(errorPayload, "utf8"),
			ctx(),
		);

		//Assert
		expect(stepResult).toEqual(Buffer.alloc(0));
		expect(stepResult.length).toBe(0);
		await expect(mech.finish(null, ctx())).rejects.toThrow(AuthError);
		await expect(mech.finish(null, ctx())).rejects.toThrow(/400/);
	});

	test("a second step() call throws", async () => {
		//Arrange
		const mech = new XOAuth2Mechanism();
		await mech.start(ctx());
		await mech.step(Buffer.from("{}", "utf8"), ctx());

		//Act & Assert
		await expect(
			mech.step(Buffer.from("{}", "utf8"), ctx()),
		).rejects.toThrow(AuthError);
	});

	test("finish() is a no-op when no error was ever recorded", async () => {
		//Arrange
		const mech = new XOAuth2Mechanism();
		await mech.start(ctx());

		//Act & Assert
		await expect(mech.finish(null, ctx())).resolves.toBeUndefined();
	});
});
