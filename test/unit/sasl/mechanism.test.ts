import { AuthError } from "../../../src/errors";
import {
	createMechanism,
	mechanismAuthError,
	registerMechanism,
	SaslContext,
	SaslMechanism,
} from "../../../src/sasl/mechanism";

function makeDummyMechanism(name: string): SaslMechanism {
	return {
		name,
		requiresSecureTransport: false,
		async start(): Promise<Buffer | null> {
			return null;
		},
		async step(challenge: Buffer): Promise<Buffer> {
			return challenge;
		},
		async finish(): Promise<void> {
			/* no-op */
		},
	};
}

describe("registerMechanism / createMechanism", () => {
	test("registers and looks up a mechanism case-insensitively", () => {
		//Arrange
		registerMechanism(() => makeDummyMechanism("DUMMY-ONE"));

		//Act
		const viaExact = createMechanism("DUMMY-ONE");
		const viaLower = createMechanism("dummy-one");
		const viaMixed = createMechanism("Dummy-One");

		//Assert
		expect(viaExact?.name).toBe("DUMMY-ONE");
		expect(viaLower?.name).toBe("DUMMY-ONE");
		expect(viaMixed?.name).toBe("DUMMY-ONE");
	});

	test("returns a fresh instance on every lookup", () => {
		//Arrange
		registerMechanism(() => makeDummyMechanism("DUMMY-TWO"));

		//Act
		const first = createMechanism("DUMMY-TWO");
		const second = createMechanism("DUMMY-TWO");

		//Assert
		expect(first).not.toBe(second);
	});

	test("unknown mechanism name returns undefined", () => {
		//Act
		const result = createMechanism("TOTALLY-UNREGISTERED-MECHANISM");

		//Assert
		expect(result).toBeUndefined();
	});

	test("re-registering the same name replaces the previous factory", () => {
		//Arrange
		registerMechanism(() => makeDummyMechanism("DUMMY-THREE"));
		const marker = Symbol("replacement");
		registerMechanism(() => {
			const mech = makeDummyMechanism("DUMMY-THREE");
			(mech as SaslMechanism & { marker: symbol }).marker = marker;
			return mech;
		});

		//Act
		const result = createMechanism("dummy-three") as SaslMechanism & {
			marker: symbol;
		};

		//Assert
		expect(result.marker).toBe(marker);
	});
});

describe("mechanismAuthError", () => {
	test("builds an AuthError naming exactly the one mechanism", () => {
		//Act
		const err = mechanismAuthError("PLAIN", "something went wrong");

		//Assert
		expect(err).toBeInstanceOf(AuthError);
		expect(err.message).toBe("something went wrong");
		expect(err.mechanismsTried).toEqual(["PLAIN"]);
		expect(err.code).toBeNull();
	});

	test("carries a cause through when provided", () => {
		//Arrange
		const cause = new Error("inner");

		//Act
		const err = mechanismAuthError("PLAIN", "outer", cause);

		//Assert
		expect(err.cause).toBe(cause);
	});
});

// Re-exported here only so the SaslContext type is exercised by the type
// checker in at least one test file (guards against a signature drift going
// unnoticed by `tsc --noEmit`).
function assertContextShape(ctx: SaslContext): SaslContext {
	return ctx;
}

test("SaslContext accepts the documented optional fields", () => {
	//Arrange
	const ctx: SaslContext = {
		user: "tim",
		host: "imap.example.com",
		port: 993,
	};

	//Act
	const result = assertContextShape(ctx);

	//Assert
	expect(result).toBe(ctx);
});
