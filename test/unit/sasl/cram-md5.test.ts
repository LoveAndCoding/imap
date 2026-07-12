import { AuthError } from "../../../src/errors";
import { SaslContext } from "../../../src/sasl/mechanism";
import {
	createCramMd5Mechanism,
	CramMd5Mechanism,
} from "../../../src/sasl/cram-md5";

// RFC 2195 §2's own worked example.
const CHALLENGE = "<1896.697170952@postoffice.reston.mci.net>";
const USERNAME = "tim";
const SECRET = "tanstaaftanstaaf";
const EXPECTED_DIGEST = "b913a602c7eda7a495b4e6e7334d3890";

function ctx(overrides: Partial<SaslContext> = {}): SaslContext {
	return {
		user: USERNAME,
		pass: SECRET,
		host: "imap.example.com",
		port: 993,
		...overrides,
	};
}

describe("CramMd5Mechanism", () => {
	test("name and transport requirement", () => {
		//Arrange
		const mech = new CramMd5Mechanism();

		//Assert
		expect(mech.name).toBe("CRAM-MD5");
		expect(mech.requiresSecureTransport).toBe(false);
	});

	test("createCramMd5Mechanism() returns a working instance", async () => {
		//Act
		const mech = createCramMd5Mechanism();
		const initial = await mech.start(ctx());

		//Assert
		expect(initial).toBeNull();
	});

	test("start() returns null (server-first, no initial response)", async () => {
		//Arrange
		const mech = new CramMd5Mechanism();

		//Act
		const initial = await mech.start(ctx());

		//Assert
		expect(initial).toBeNull();
	});

	test("step() produces the exact RFC 2195 §2 example response", async () => {
		//Arrange
		const mech = new CramMd5Mechanism();
		await mech.start(ctx());

		//Act
		const response = await mech.step(
			Buffer.from(CHALLENGE, "utf8"),
			ctx(),
		);

		//Assert
		expect(response.toString("utf8")).toBe(
			`${USERNAME} ${EXPECTED_DIGEST}`,
		);
	});

	test("missing pass throws AuthError", async () => {
		//Arrange
		const mech = new CramMd5Mechanism();
		await mech.start(ctx());

		//Act & Assert
		await expect(
			mech.step(Buffer.from(CHALLENGE, "utf8"), ctx({ pass: undefined })),
		).rejects.toThrow(AuthError);
	});

	test("missing pass error message names the missing field", async () => {
		//Arrange
		const mech = new CramMd5Mechanism();
		await mech.start(ctx());

		//Act & Assert
		await expect(
			mech.step(Buffer.from(CHALLENGE, "utf8"), ctx({ pass: undefined })),
		).rejects.toThrow(/pass/);
	});

	test("a second step() call throws", async () => {
		//Arrange
		const mech = new CramMd5Mechanism();
		await mech.start(ctx());
		await mech.step(Buffer.from(CHALLENGE, "utf8"), ctx());

		//Act & Assert
		await expect(
			mech.step(Buffer.from(CHALLENGE, "utf8"), ctx()),
		).rejects.toThrow(AuthError);
	});

	test("finish() is a no-op regardless of data", async () => {
		//Arrange
		const mech = new CramMd5Mechanism();
		await mech.start(ctx());
		await mech.step(Buffer.from(CHALLENGE, "utf8"), ctx());

		//Act & Assert
		await expect(mech.finish(null, ctx())).resolves.toBeUndefined();
		await expect(
			mech.finish(Buffer.from("ignored"), ctx()),
		).resolves.toBeUndefined();
	});
});
