import {
	AuthError,
	CapabilityError,
	CommandError,
	ConnectionError,
	IMAPError,
	ImapError,
	InvalidParsedDataError,
	NotImplementedError,
	ProtocolError,
	ServerBadError,
	ServerNoError,
	StateError,
	TlsError,
	TokenizationError,
} from "../../src/errors";

describe("IMAPError", () => {
	test("Initialize with just a message", () => {
		//Arrange
		const msg = "A test error";

		//Act
		const err = new IMAPError(msg);

		//Assert
		expect(err.message).toBe(msg);
		expect(err.wrappedError).toBeUndefined();
	});

	test("Initialize with just a wrapped error", () => {
		//Arrange
		const innerErr = new Error("A test inner error");

		//Act
		const err = new IMAPError(innerErr);

		//Assert
		expect(err.wrappedError).toBe(innerErr);
		expect(err.message).toBe(innerErr.message);
	});

	test("Initialize with a message and wrapped error", () => {
		//Arrange
		const msg = "Outer error message";
		const innerError = new Error("Inner error message");

		//Act
		const err = new IMAPError(msg, innerError);

		//Assert
		expect(err.message).toBe(msg);
		expect(err.wrappedError).toBe(innerError);
	});
});

describe("InvalidParsedDataError", () => {
	test("Initializes correctly", () => {
		//Arrange
		const expected = ["1", "2"];
		const actual = ["1", "2", "3"];

		//Act
		const err = new InvalidParsedDataError(expected, actual);

		//Assert
		expect(err.message).toBe("Invalid parsed data");
		expect(err.expected).toBe(expected);
		expect(err.actual).toBe(actual);
	});

	describe(".toString()", () => {
		test("Shows expected and actual when actual is string", () => {
			//Arrange
			const expected = [];
			const actual = "['test']";
			const err = new InvalidParsedDataError(expected, actual);

			//Act
			const result = err.toString();

			//Assert
			expect(result).toContain("Invalid parsed data");
			expect(result).toContain("Expected: []");
			expect(result).toContain("Actual: ['test']");
		});

		test("Shows expected and actual when actual is array", () => {
			//Arrange
			const expected = [];
			const actual = ["test"];
			const err = new InvalidParsedDataError(expected, actual);

			//Act
			const result = err.toString();

			//Assert
			expect(result).toContain("Invalid parsed data");
			expect(result).toContain("Expected: []");
			expect(result).toContain("Actual: [test]");
		});
	});
});

describe("NotImplementedError", () => {
	test("Initializes correctly", () => {
		//Arrange
		const what = "TestFunction";

		//Act
		const err = new NotImplementedError(what);

		//Assert
		expect(err.message).toContain(`"${what}" has not been implemented`);
	});
});

describe("TokenizationError", () => {
	test("Initializes correctly", () => {
		//Arrange
		const msg = "A test tokenization error";
		const input = "to tokenize";

		//Act
		const err = new TokenizationError(msg, input);

		//Assert
		expect(err.message).toBe(msg);
		expect(err.input).toBe(input);
	});

	describe(".toString()", () => {
		test("Shows input", () => {
			//Arrange
			const msg = "A test tokenization error";
			const input = "to tokenize";
			const err = new TokenizationError(msg, input);

			//Act
			const result = err.toString();

			//Assert
			expect(result).toContain(msg);
			expect(result).toContain(`Input: ${input}`);
		});
	});
});

// ---------------------------------------------------------------------------
// Public error hierarchy (modern API spec §4).
// ---------------------------------------------------------------------------

describe("ImapError", () => {
	test("is a standard Error", () => {
		const err = new ImapError("boom");
		expect(err).toBeInstanceOf(Error);
		expect(err.message).toBe("boom");
	});

	test("sets .name", () => {
		const err = new ImapError("boom");
		expect(err.name).toBe("ImapError");
	});

	test("carries .cause via standard Error cause mechanics", () => {
		const cause = new Error("root cause");
		const err = new ImapError("boom", { cause });
		expect(err.cause).toBe(cause);
	});

	test(".cause is undefined when not provided", () => {
		const err = new ImapError("boom");
		expect(err.cause).toBeUndefined();
	});
});

describe("ConnectionError", () => {
	test("instanceof chain", () => {
		const err = new ConnectionError("disconnected", { phase: "connect" });
		expect(err).toBeInstanceOf(ConnectionError);
		expect(err).toBeInstanceOf(ImapError);
		expect(err).toBeInstanceOf(Error);
	});

	test("sets .name", () => {
		const err = new ConnectionError("disconnected", { phase: "connect" });
		expect(err.name).toBe("ConnectionError");
	});

	test("carries phase and bye", () => {
		const err = new ConnectionError("server said goodbye", {
			phase: "greeting",
			bye: "Server shutting down",
		});
		expect(err.phase).toBe("greeting");
		expect(err.bye).toBe("Server shutting down");
	});

	test("bye is undefined when not provided", () => {
		const err = new ConnectionError("boom", { phase: "resolve" });
		expect(err.bye).toBeUndefined();
	});

	test("carries cause", () => {
		const cause = new Error("ECONNRESET");
		const err = new ConnectionError("boom", { phase: "steady", cause });
		expect(err.cause).toBe(cause);
	});
});

describe("TlsError", () => {
	test("instanceof chain", () => {
		const err = new TlsError("cert mismatch", {
			phase: "connect",
			reason: "identity-mismatch",
		});
		expect(err).toBeInstanceOf(TlsError);
		expect(err).toBeInstanceOf(ConnectionError);
		expect(err).toBeInstanceOf(ImapError);
		expect(err).toBeInstanceOf(Error);
	});

	test("sets .name", () => {
		const err = new TlsError("cert mismatch", {
			phase: "connect",
			reason: "identity-mismatch",
		});
		expect(err.name).toBe("TlsError");
	});

	test("carries reason, certificate, and inherited fields", () => {
		const fakeCert = { subject: { CN: "example.com" } } as unknown as ConstructorParameters<
			typeof TlsError
		>[1]["certificate"];
		const err = new TlsError("handshake failed", {
			phase: "connect",
			reason: "handshake",
			certificate: fakeCert,
			bye: undefined,
		});
		expect(err.reason).toBe("handshake");
		expect(err.certificate).toBe(fakeCert);
		expect(err.phase).toBe("connect");
	});
});

describe("ProtocolError", () => {
	test("instanceof chain", () => {
		const err = new ProtocolError("bad framing");
		expect(err).toBeInstanceOf(ProtocolError);
		expect(err).toBeInstanceOf(ImapError);
		expect(err).toBeInstanceOf(Error);
	});

	test("sets .name", () => {
		const err = new ProtocolError("bad framing");
		expect(err.name).toBe("ProtocolError");
	});

	test("carries bytes and context, defaults to undefined", () => {
		const err = new ProtocolError("bad framing", {
			bytes: "a1 OK\r\n",
			context: "tag parsing",
		});
		expect(err.bytes).toBe("a1 OK\r\n");
		expect(err.context).toBe("tag parsing");

		const bare = new ProtocolError("bad framing");
		expect(bare.bytes).toBeUndefined();
		expect(bare.context).toBeUndefined();
	});

	test("wraps an internal parsing error as .cause", () => {
		const inner = new TokenizationError("bad token", "xyz");
		const err = new ProtocolError("framing failed", { cause: inner });
		expect(err.cause).toBe(inner);
	});
});

describe("CommandError", () => {
	const baseInit = {
		command: "UID FETCH",
		tag: "a1",
		status: "NO" as const,
		code: null,
		text: "no such message",
	};

	test("instanceof chain", () => {
		const err = new CommandError("command failed", baseInit);
		expect(err).toBeInstanceOf(CommandError);
		expect(err).toBeInstanceOf(ImapError);
		expect(err).toBeInstanceOf(Error);
	});

	test("sets .name", () => {
		const err = new CommandError("command failed", baseInit);
		expect(err.name).toBe("CommandError");
	});

	test("carries all fields", () => {
		const code = { name: "TRYCREATE", args: null };
		const err = new CommandError("command failed", {
			...baseInit,
			status: "BAD",
			code,
		});
		expect(err.command).toBe("UID FETCH");
		expect(err.tag).toBe("a1");
		expect(err.status).toBe("BAD");
		expect(err.code).toBe(code);
		expect(err.text).toBe("no such message");
	});
});

describe("ServerNoError", () => {
	const init = {
		command: "SELECT",
		tag: "a2",
		code: null,
		text: "mailbox does not exist",
	};

	test("instanceof chain", () => {
		const err = new ServerNoError("select failed", init);
		expect(err).toBeInstanceOf(ServerNoError);
		expect(err).toBeInstanceOf(CommandError);
		expect(err).toBeInstanceOf(ImapError);
		expect(err).toBeInstanceOf(Error);
	});

	test("sets .name", () => {
		const err = new ServerNoError("select failed", init);
		expect(err.name).toBe("ServerNoError");
	});

	test("enforces status NO regardless of caller intent", () => {
		const err = new ServerNoError("select failed", {
			...init,
			// @ts-expect-error -- status isn't part of ServerNoErrorInit
			status: "BAD",
		});
		expect(err.status).toBe("NO");
	});

	test("carries fields", () => {
		const err = new ServerNoError("select failed", init);
		expect(err.command).toBe("SELECT");
		expect(err.tag).toBe("a2");
		expect(err.text).toBe("mailbox does not exist");
	});
});

describe("ServerBadError", () => {
	const init = {
		command: "FOO",
		tag: "a3",
		code: null,
		text: "unknown command",
	};

	test("instanceof chain", () => {
		const err = new ServerBadError("bad command", init);
		expect(err).toBeInstanceOf(ServerBadError);
		expect(err).toBeInstanceOf(CommandError);
		expect(err).toBeInstanceOf(ImapError);
		expect(err).toBeInstanceOf(Error);
	});

	test("sets .name", () => {
		const err = new ServerBadError("bad command", init);
		expect(err.name).toBe("ServerBadError");
	});

	test("enforces status BAD regardless of caller intent", () => {
		const err = new ServerBadError("bad command", {
			...init,
			// @ts-expect-error -- status isn't part of ServerBadErrorInit
			status: "NO",
		});
		expect(err.status).toBe("BAD");
	});
});

describe("AuthError", () => {
	test("instanceof chain", () => {
		const err = new AuthError("auth failed", {
			mechanismsTried: ["PLAIN"],
			code: null,
		});
		expect(err).toBeInstanceOf(AuthError);
		expect(err).toBeInstanceOf(ImapError);
		expect(err).toBeInstanceOf(Error);
	});

	test("sets .name", () => {
		const err = new AuthError("auth failed", {
			mechanismsTried: ["PLAIN"],
			code: null,
		});
		expect(err.name).toBe("AuthError");
	});

	test("carries mechanismsTried and code", () => {
		const code = { name: "AUTHENTICATIONFAILED", args: null };
		const err = new AuthError("auth failed", {
			mechanismsTried: ["SCRAM-SHA-256", "PLAIN"],
			code,
		});
		expect(err.mechanismsTried).toEqual(["SCRAM-SHA-256", "PLAIN"]);
		expect(err.code).toBe(code);
	});
});

describe("CapabilityError", () => {
	test("instanceof chain", () => {
		const err = new CapabilityError("QUOTA not supported", {
			capability: "QUOTA",
			rfc: "9208",
		});
		expect(err).toBeInstanceOf(CapabilityError);
		expect(err).toBeInstanceOf(ImapError);
		expect(err).toBeInstanceOf(Error);
	});

	test("sets .name", () => {
		const err = new CapabilityError("QUOTA not supported", {
			capability: "QUOTA",
			rfc: "9208",
		});
		expect(err.name).toBe("CapabilityError");
	});

	test("carries capability and rfc", () => {
		const err = new CapabilityError("QUOTA not supported", {
			capability: "QUOTA",
			rfc: "9208",
		});
		expect(err.capability).toBe("QUOTA");
		expect(err.rfc).toBe("9208");
	});
});

describe("StateError", () => {
	test("instanceof chain", () => {
		const err = new StateError("illegal state", {
			state: "not-authenticated",
			required: ["selected"],
		});
		expect(err).toBeInstanceOf(StateError);
		expect(err).toBeInstanceOf(ImapError);
		expect(err).toBeInstanceOf(Error);
	});

	test("sets .name", () => {
		const err = new StateError("illegal state", {
			state: "not-authenticated",
			required: ["selected"],
		});
		expect(err.name).toBe("StateError");
	});

	test("carries state and required", () => {
		const err = new StateError("illegal state", {
			state: "authenticated",
			required: ["selected", "disconnected"],
		});
		expect(err.state).toBe("authenticated");
		expect(err.required).toEqual(["selected", "disconnected"]);
	});
});
