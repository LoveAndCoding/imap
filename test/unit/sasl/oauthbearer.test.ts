import { AuthError } from "../../../src/errors";
import { SaslContext } from "../../../src/sasl/mechanism";
import {
	createOAuthBearerMechanism,
	OAuthBearerMechanism,
} from "../../../src/sasl/oauthbearer";

function ctx(overrides: Partial<SaslContext> = {}): SaslContext {
	return {
		user: "user@example.com",
		accessToken: "mF9dft4qmTc2Nvb3RlckBhbHRhdmlzdGEuY29tCg==",
		host: "server.example.com",
		port: 143,
		...overrides,
	};
}

describe("OAuthBearerMechanism", () => {
	test("name and transport requirement", () => {
		//Arrange
		const mech = new OAuthBearerMechanism();

		//Assert
		expect(mech.name).toBe("OAUTHBEARER");
		expect(mech.requiresSecureTransport).toBe(true);
	});

	test("createOAuthBearerMechanism() returns a working instance", async () => {
		//Act
		const mech = createOAuthBearerMechanism();
		const initial = await mech.start(ctx());

		//Assert
		expect(initial).toBeInstanceOf(Buffer);
	});

	test("start() produces the RFC 7628 §4.1 example shape", async () => {
		//Arrange
		const mech = new OAuthBearerMechanism();
		const c = ctx();
		const expected =
			`n,a=${c.user},\x01host=${c.host}\x01port=${c.port}` +
			`\x01auth=Bearer ${c.accessToken}\x01\x01`;

		//Act
		const initial = await mech.start(c);

		//Assert
		expect(initial?.toString("utf8")).toBe(expected);
	});

	test("escapes '=' and ',' in the gs2-authzid slot per RFC 5801", async () => {
		//Arrange
		const mech = new OAuthBearerMechanism();
		const c = ctx({ user: "a=b,c" });

		//Act
		const initial = await mech.start(c);
		const text = initial?.toString("utf8") ?? "";

		//Assert
		expect(text.startsWith("n,a=a=3Db=2Cc,\x01")).toBe(true);
		// The un-escaped raw value must not appear anywhere in the
		// authzid slot.
		expect(text.split("\x01")[0]).toBe("n,a=a=3Db=2Cc,");
	});

	test("missing accessToken throws AuthError", async () => {
		//Arrange
		const mech = new OAuthBearerMechanism();

		//Act & Assert
		await expect(
			mech.start(ctx({ accessToken: undefined })),
		).rejects.toThrow(AuthError);
	});

	test("error-challenge flow: step() returns a single 0x01 byte and finish() throws mentioning the status", async () => {
		//Arrange
		const mech = new OAuthBearerMechanism();
		await mech.start(ctx());
		const errorPayload = JSON.stringify({
			status: "invalid_token",
			scope: "https://mail.example.com/",
		});

		//Act
		const stepResult = await mech.step(
			Buffer.from(errorPayload, "utf8"),
			ctx(),
		);

		//Assert
		expect(stepResult).toEqual(Buffer.from([0x01]));
		await expect(mech.finish(null, ctx())).rejects.toThrow(AuthError);
		await expect(mech.finish(null, ctx())).rejects.toThrow(
			/invalid_token/,
		);
	});

	test("a second step() call throws", async () => {
		//Arrange
		const mech = new OAuthBearerMechanism();
		await mech.start(ctx());
		await mech.step(
			Buffer.from(JSON.stringify({ status: "invalid_token" }), "utf8"),
			ctx(),
		);

		//Act & Assert
		await expect(
			mech.step(Buffer.from("{}", "utf8"), ctx()),
		).rejects.toThrow(AuthError);
	});

	test("finish() is a no-op when no error was ever recorded", async () => {
		//Arrange
		const mech = new OAuthBearerMechanism();
		await mech.start(ctx());

		//Act & Assert
		await expect(mech.finish(null, ctx())).resolves.toBeUndefined();
		await expect(
			mech.finish(Buffer.from("extra data"), ctx()),
		).resolves.toBeUndefined();
	});
});
