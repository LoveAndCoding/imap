import { AnonymousMechanism, createAnonymousMechanism } from "../../../src/sasl/anonymous";
import { SaslContext } from "../../../src/sasl/mechanism";
import { AuthError } from "../../../src/errors";

function ctx(overrides: Partial<SaslContext> = {}): SaslContext {
	return {
		user: "anonymous",
		host: "imap.example.com",
		port: 993,
		...overrides,
	};
}

describe("AnonymousMechanism", () => {
	test("name and transport requirement", () => {
		//Arrange
		const mech = new AnonymousMechanism();

		//Assert
		expect(mech.name).toBe("ANONYMOUS");
		expect(mech.requiresSecureTransport).toBe(false);
	});

	test("createAnonymousMechanism() returns a working instance", async () => {
		//Act
		const mech = createAnonymousMechanism();
		const initial = await mech.start(ctx());

		//Assert
		expect(initial).toBeInstanceOf(Buffer);
	});

	test("absent authzid (no trace information) produces an empty buffer", async () => {
		//Arrange
		const mech = new AnonymousMechanism();

		//Act
		const initial = await mech.start(ctx());

		//Assert
		expect(initial.length).toBe(0);
	});

	test("RFC 4505 §4's own example email-shaped trace value round-trips exactly", async () => {
		//Arrange
		const mech = new AnonymousMechanism();

		//Act
		const initial = await mech.start(ctx({ authzid: "fred@example.com" }));

		//Assert
		expect(initial.toString("utf8")).toBe("fred@example.com");
	});

	test("RFC 4505 §4's own example opaque-token trace value round-trips exactly", async () => {
		//Arrange
		const mech = new AnonymousMechanism();

		//Act
		const initial = await mech.start(ctx({ authzid: "tim" }));

		//Assert
		expect(initial.toString("utf8")).toBe("tim");
	});

	test("strips a StringPrep-prohibited ASCII control character from the trace value", async () => {
		//Arrange
		const mech = new AnonymousMechanism();

		//Act
		const initial = await mech.start(ctx({ authzid: "admintoken" }));

		//Assert
		expect(initial.toString("utf8")).toBe("admintoken");
	});

	test("strips an unpaired surrogate from the trace value", async () => {
		//Arrange
		const mech = new AnonymousMechanism();

		//Act
		const initial = await mech.start(ctx({ authzid: "a\ud800b" }));

		//Assert
		expect(initial.toString("utf8")).toBe("ab");
	});

	test("does not mutate/normalize characters outside the prohibited tables", async () => {
		//Arrange
		const mech = new AnonymousMechanism();

		//Act
		const initial = await mech.start(ctx({ authzid: "USER-Name.123" }));

		//Assert: no case-folding/normalization — passed through verbatim.
		expect(initial.toString("utf8")).toBe("USER-Name.123");
	});

	test("token trace information over 255 Unicode characters is truncated", async () => {
		//Arrange
		const mech = new AnonymousMechanism();
		const longToken = "a".repeat(300);

		//Act
		const initial = await mech.start(ctx({ authzid: longToken }));

		//Assert
		expect(Array.from(initial.toString("utf8")).length).toBe(255);
	});

	test("email-shaped trace information is not truncated by the token length cap", async () => {
		//Arrange
		const mech = new AnonymousMechanism();
		const longEmail = `${"a".repeat(300)}@example.com`;

		//Act
		const initial = await mech.start(ctx({ authzid: longEmail }));

		//Assert
		expect(initial.toString("utf8")).toBe(longEmail);
	});

	test("step() always throws (single-message exchange, RFC4505-2-1)", async () => {
		//Arrange
		const mech = new AnonymousMechanism();

		//Act & Assert
		await expect(mech.step(Buffer.alloc(0), ctx())).rejects.toThrow(AuthError);
	});

	test("finish() is a no-op regardless of data", async () => {
		//Arrange
		const mech = new AnonymousMechanism();

		//Act & Assert
		await expect(mech.finish(null, ctx())).resolves.toBeUndefined();
		await expect(mech.finish(Buffer.from("ignored"), ctx())).resolves.toBeUndefined();
	});
});
