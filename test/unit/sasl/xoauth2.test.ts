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

	describe("PR #18 review fix (High #8): reused instance resets per-attempt state in start()", () => {
		test("REVERT-VERIFY: a recorded error in attempt 1 does not poison finish() on a genuinely-successful attempt 2", async () => {
			//Arrange: the SAME instance is driven through two cycles, mirroring
			// how `ImapAuthConfig.mechanisms` supplying a literal `SaslMechanism`
			// object gets reused verbatim across reconnects. Pre-fix,
			// `errorPayload`/`stepCalled` from attempt 1 stayed set forever.
			const mech = new XOAuth2Mechanism();

			// Attempt 1: error-recovery flow records a failure.
			await mech.start(ctx());
			await mech.step(Buffer.from(JSON.stringify({ status: "400" }), "utf8"), ctx());
			await expect(mech.finish(null, ctx())).rejects.toThrow(AuthError);

			// Attempt 2, same instance: clean success, no challenge at all.
			await mech.start(ctx());

			//Act & Assert
			await expect(mech.finish(null, ctx())).resolves.toBeUndefined();
		});

		test("REVERT-VERIFY: attempt 2's own step() is not rejected as a stale 'second challenge'", async () => {
			//Arrange
			const mech = new XOAuth2Mechanism();
			await mech.start(ctx());
			await mech.step(Buffer.from(JSON.stringify({ status: "400" }), "utf8"), ctx());
			await mech.start(ctx());

			//Act & Assert: attempt 2's FIRST step() call must succeed.
			const result = await mech.step(Buffer.from(JSON.stringify({ status: "400" }), "utf8"), ctx());
			expect(result).toEqual(Buffer.alloc(0));
		});
	});

	describe("PR #18 review fix (Medium): field-separator (0x01)/CR/LF injection guards", () => {
		test("REVERT-VERIFY: a 0x01 byte in user is rejected before it reaches the wire", async () => {
			//Arrange
			const mech = new XOAuth2Mechanism();

			//Act & Assert
			await expect(
				mech.start(ctx({ user: "attacker\x01auth=Bearer forged" })),
			).rejects.toThrow(AuthError);
		});

		test("REVERT-VERIFY: a 0x01 byte in accessToken is rejected before it reaches the wire", async () => {
			//Arrange
			const mech = new XOAuth2Mechanism();

			//Act & Assert
			await expect(
				mech.start(ctx({ accessToken: "real-token\x01auth=Bearer forged" })),
			).rejects.toThrow(AuthError);
		});

		test("a CRLF byte in user is rejected", async () => {
			//Arrange
			const mech = new XOAuth2Mechanism();

			//Act & Assert
			await expect(mech.start(ctx({ user: "someone\r\nSTUFF" }))).rejects.toThrow(AuthError);
		});

		test("a clean context with no 0x01/CR/LF is unaffected", async () => {
			//Arrange
			const mech = new XOAuth2Mechanism();

			//Act & Assert
			await expect(mech.start(ctx())).resolves.toBeInstanceOf(Buffer);
		});
	});

	describe("PR #18 review fix (Medium, report-or-fix): describeFailure() surfaces the diagnostic on the realistic tagged-NO path", () => {
		test("describeFailure() returns undefined before any error is recorded", () => {
			//Arrange
			const mech = new XOAuth2Mechanism();

			//Act & Assert
			expect(mech.describeFailure?.()).toBeUndefined();
		});

		test("describeFailure() surfaces the same diagnostic finish() would have thrown, after a recorded error", async () => {
			//Arrange
			const mech = new XOAuth2Mechanism();
			await mech.start(ctx());
			await mech.step(Buffer.from(JSON.stringify({ status: "400" }), "utf8"), ctx());

			//Act & Assert
			expect(mech.describeFailure?.()).toMatch(/400/);
		});
	});
});
