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

	describe("PR #18 review fix (High #8): reused instance resets per-attempt state in start()", () => {
		test("REVERT-VERIFY: a recorded error in attempt 1 does not poison finish() on a genuinely-successful attempt 2", async () => {
			//Arrange: the SAME instance (as `ImapAuthConfig.mechanisms` supplying
			// a literal `SaslMechanism` object would reuse across reconnects) is
			// driven through two cycles: attempt 1 records an error via step(),
			// attempt 2 never gets a challenge at all (a clean tagged-OK
			// success). Pre-fix, `errorPayload`/`stepCalled` from attempt 1
			// stayed set forever, so attempt 2's `finish()` would incorrectly
			// keep throwing attempt 1's stale error, and a genuine attempt-2
			// challenge would incorrectly hit the "second challenge" guard.
			const mech = new OAuthBearerMechanism();

			// Attempt 1: error-recovery flow records a failure.
			await mech.start(ctx());
			await mech.step(
				Buffer.from(JSON.stringify({ status: "invalid_token" }), "utf8"),
				ctx(),
			);
			await expect(mech.finish(null, ctx())).rejects.toThrow(AuthError);

			// Attempt 2, same instance: clean success, no challenge at all.
			await mech.start(ctx());

			//Act & Assert
			await expect(mech.finish(null, ctx())).resolves.toBeUndefined();
		});

		test("REVERT-VERIFY: attempt 2's own step() is not rejected as a stale 'second challenge'", async () => {
			//Arrange
			const mech = new OAuthBearerMechanism();
			await mech.start(ctx());
			await mech.step(
				Buffer.from(JSON.stringify({ status: "invalid_token" }), "utf8"),
				ctx(),
			);
			await mech.start(ctx());

			//Act & Assert: attempt 2's FIRST step() call must succeed.
			const result = await mech.step(
				Buffer.from(JSON.stringify({ status: "expired_token" }), "utf8"),
				ctx(),
			);
			expect(result).toEqual(Buffer.from([0x01]));
		});
	});

	describe("PR #18 review fix (Medium): kvsep (0x01)/CR/LF injection guards", () => {
		test.each([
			["user", { user: "attacker\x01auth=Bearer forged" }],
			["host", { host: "attacker\x01auth=Bearer forged" }],
			["accessToken", { accessToken: "real-token\x01auth=Bearer forged" }],
		])("REVERT-VERIFY: a 0x01 byte in %s is rejected before it reaches the wire", async (_label, overrides) => {
			//Arrange
			const mech = new OAuthBearerMechanism();

			//Act & Assert
			await expect(mech.start(ctx(overrides))).rejects.toThrow(AuthError);
			await expect(mech.start(ctx(overrides))).rejects.toThrow(/kvsep|0x01/);
		});

		test("a CRLF byte in accessToken is rejected", async () => {
			//Arrange
			const mech = new OAuthBearerMechanism();

			//Act & Assert
			await expect(
				mech.start(ctx({ accessToken: "token\r\nSTUFF" })),
			).rejects.toThrow(AuthError);
		});

		test("a clean context with no 0x01/CR/LF is unaffected", async () => {
			//Arrange
			const mech = new OAuthBearerMechanism();

			//Act & Assert
			await expect(mech.start(ctx())).resolves.toBeInstanceOf(Buffer);
		});
	});

	describe("PR #18 review fix (Medium, report-or-fix): describeFailure() surfaces the diagnostic on the realistic tagged-NO path", () => {
		test("describeFailure() returns undefined before any error is recorded", () => {
			//Arrange
			const mech = new OAuthBearerMechanism();

			//Act & Assert
			expect(mech.describeFailure?.()).toBeUndefined();
		});

		test("describeFailure() surfaces the same diagnostic finish() would have thrown, after a recorded error", async () => {
			//Arrange
			const mech = new OAuthBearerMechanism();
			await mech.start(ctx());
			await mech.step(
				Buffer.from(
					JSON.stringify({ status: "invalid_token", scope: "https://mail.example.com/" }),
					"utf8",
				),
				ctx(),
			);

			//Act
			const diagnostic = mech.describeFailure?.();

			//Assert: this is the detail that USED to be lost on the realistic
			// tagged-NO failure path, since finish() (where it previously lived
			// exclusively) only ever runs after a tagged OK.
			expect(diagnostic).toMatch(/invalid_token/);
			expect(diagnostic).toMatch(/scope=https:\/\/mail\.example\.com\//);
		});
	});
});
