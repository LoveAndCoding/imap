import { describe, expect, test, vi } from "vitest";

import { AuthenticateCommand } from "../../../src/commands/authenticate";
import { executeCommand } from "../../../src/connection/execute-command";
import { Router } from "../../../src/connection/router";
import { AuthError } from "../../../src/errors";
import Lexer from "../../../src/lexer/lexer";
import Parser from "../../../src/parser/parser";
import ContinueResponse from "../../../src/parser/structure/continue";
import TaggedResponse from "../../../src/parser/structure/tagged";
import type { SaslContext, SaslMechanism } from "../../../src/sasl/mechanism";

const CRLF = "\r\n";

function parseLine(line: string) {
	const lexer = new Lexer();
	const parser = new Parser();
	return parser.parseTokens(lexer.tokenize(line));
}

const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve));

function makeFakeConnection() {
	const written: Buffer[] = [];
	const router = new Router({
		log: () => undefined,
		isSecure: () => false,
		emitRawStatus: () => undefined,
		emitUntagged: () => undefined,
		emitTagged: () => undefined,
		emitContinue: () => undefined,
		emitUnknown: () => undefined,
		emitResponse: () => undefined,
		emitServerStatus: () => undefined,
		emitUnhandled: () => undefined,
		emitAlert: () => undefined,
	});
	const connection = {
		capabilityRegistry: { value: null as { has(cap: string): boolean } | null },
		// executeCommand() now resolves its LITERAL+/LITERAL- probe via
		// getCapabilityProbe() rather than reading capabilityRegistry.value
		// directly; these tests never advertise LITERAL+/-, so always-false
		// (forcing a synchronizing literal) reproduces the prior behavior.
		getCapabilityProbe: () => (_cap: string) => false,
		router,
		// `execute-command.ts`'s interactive-continuation write-back checks
		// this before writing (CRITICAL-2 adjacent) — these tests never tear
		// the fake connection down, so it stays live throughout.
		isActive: true,
		writeBytes: (buf: Buffer) => {
			written.push(buf);
		},
		// CRITICAL-2: `executeCommand` subscribes to this (see
		// `Connection.onTeardown`) — a fake connection needs it too, even
		// though none of these tests fire it.
		onTeardown: () => () => undefined,
	};
	return { connection: connection as never, written, router };
}

const CTX: SaslContext = { user: "tim", pass: "secret", host: "imap.example.com", port: 993 };

/** A PLAIN-like mechanism whose initial response is fixed text, for exact
 *  base64 wire assertions independent of the real PlainMechanism's own
 *  encoding logic. */
function makePlainLikeMechanism(): SaslMechanism {
	return {
		name: "PLAIN",
		requiresSecureTransport: true,
		async start(): Promise<Buffer> {
			return Buffer.from("\0tim\0secret", "utf8");
		},
		async step(): Promise<Buffer> {
			throw new Error("PLAIN never expects a server challenge");
		},
		async finish(): Promise<void> {
			/* success */
		},
	};
}

describe("AuthenticateCommand (spec §9.1/§9)", () => {
	describe("SASL-IR wire framing", () => {
		test("SASL-IR advertised: initial response sent inline, exact base64", async () => {
			const { connection, written, router } = makeFakeConnection();
			const mechanism = makePlainLikeMechanism();
			const initialResponse = await mechanism.start(CTX);
			const cmd = new AuthenticateCommand({
				mechanism,
				ctx: CTX,
				initialResponse,
				saslIrAllowed: true,
			});

			const resultPromise = executeCommand(connection, cmd, "A1");
			await flushMicrotasks();

			const expectedB64 = Buffer.from("\0tim\0secret", "utf8").toString("base64");
			expect(Buffer.concat(written).toString("ascii")).toBe(
				`A1 AUTHENTICATE PLAIN ${expectedB64}${CRLF}`,
			);

			router.routeTagged(parseLine(`A1 OK done${CRLF}`) as TaggedResponse);
			await expect(resultPromise).resolves.toBeUndefined();
		});

		test("empty initial response, SASL-IR advertised, is sent as a bare '='", async () => {
			const { connection, written, router } = makeFakeConnection();
			const mechanism: SaslMechanism = {
				name: "XTEST",
				requiresSecureTransport: false,
				async start(): Promise<Buffer> {
					return Buffer.alloc(0);
				},
				async step(): Promise<Buffer> {
					throw new Error("unexpected");
				},
				async finish(): Promise<void> {},
			};
			const cmd = new AuthenticateCommand({
				mechanism,
				ctx: CTX,
				initialResponse: Buffer.alloc(0),
				saslIrAllowed: true,
			});

			const resultPromise = executeCommand(connection, cmd, "A2");
			await flushMicrotasks();

			expect(Buffer.concat(written).toString("ascii")).toBe(`A2 AUTHENTICATE XTEST =${CRLF}`);

			router.routeTagged(parseLine(`A2 OK done${CRLF}`) as TaggedResponse);
			await expect(resultPromise).resolves.toBeUndefined();
		});

		test("without SASL-IR: no initial response inline; delivered as the reply to the first (empty) continuation", async () => {
			const { connection, written, router } = makeFakeConnection();
			const mechanism = makePlainLikeMechanism();
			const initialResponse = await mechanism.start(CTX);
			const cmd = new AuthenticateCommand({
				mechanism,
				ctx: CTX,
				initialResponse,
				saslIrAllowed: false,
			});

			const resultPromise = executeCommand(connection, cmd, "A3");
			await flushMicrotasks();

			// Only the bare command line — no initial response argument.
			expect(Buffer.concat(written).toString("ascii")).toBe(`A3 AUTHENTICATE PLAIN${CRLF}`);

			// Server prompts with an empty continuation ("+ ").
			router.routeContinuation(parseLine(`+ ${CRLF}`) as ContinueResponse);
			await flushMicrotasks();

			const expectedB64 = Buffer.from("\0tim\0secret", "utf8").toString("base64");
			expect(Buffer.concat(written).toString("ascii")).toBe(
				`A3 AUTHENTICATE PLAIN${CRLF}${expectedB64}${CRLF}`,
			);

			router.routeTagged(parseLine(`A3 OK done${CRLF}`) as TaggedResponse);
			await expect(resultPromise).resolves.toBeUndefined();
		});
	});

	describe("OAUTHBEARER-style error-recovery flow", () => {
		test("server error challenge -> client sends a single 0x01 byte -> tagged NO -> AuthError carries the JSON detail", async () => {
			const { connection, written, router } = makeFakeConnection();
			const errorPayload = { status: "invalid_token", scope: "mail" };
			let recordedFinishData: Buffer | null | undefined;
			const mechanism: SaslMechanism = {
				name: "OAUTHBEARER",
				requiresSecureTransport: true,
				async start(): Promise<Buffer> {
					return Buffer.from("initial-response", "utf8");
				},
				async step(challenge: Buffer): Promise<Buffer> {
					const parsed = JSON.parse(challenge.toString("utf8"));
					expect(parsed).toEqual(errorPayload);
					return Buffer.from([0x01]);
				},
				async finish(data): Promise<void> {
					recordedFinishData = data;
				},
			};
			const cmd = new AuthenticateCommand({
				mechanism,
				ctx: CTX,
				initialResponse: await mechanism.start(CTX),
				saslIrAllowed: true,
			});

			const resultPromise = executeCommand(connection, cmd, "A4");
			await flushMicrotasks();

			const challengeB64 = Buffer.from(JSON.stringify(errorPayload), "utf8").toString(
				"base64",
			);
			router.routeContinuation(
				parseLine(`+ ${challengeB64}${CRLF}`) as ContinueResponse,
			);
			await flushMicrotasks();

			// The dummy response is a single 0x01 byte, base64-encoded.
			const expectedDummy = Buffer.from([0x01]).toString("base64");
			expect(Buffer.concat(written).toString("ascii")).toBe(
				`A4 AUTHENTICATE OAUTHBEARER aW5pdGlhbC1yZXNwb25zZQ==${CRLF}${expectedDummy}${CRLF}`,
			);

			router.routeTagged(
				parseLine(`A4 NO [AUTHENTICATIONFAILED] invalid_token${CRLF}`) as TaggedResponse,
			);

			const err = await resultPromise.catch((e: unknown) => e);
			expect(err).toBeInstanceOf(AuthError);
			expect((err as AuthError).mechanismsTried).toEqual(["OAUTHBEARER"]);
			expect((err as AuthError).code?.name).toBe("AUTHENTICATIONFAILED");
			// finish() was never reached (the tagged response was NO, not OK).
			expect(recordedFinishData).toBeUndefined();
		});

		test("PR #18 review fix (Medium, report-or-fix): onError() folds describeFailure()'s diagnostic into the AuthError message on the realistic tagged-NO path", async () => {
			// This is the concrete demonstration of the "dead code" finding: the
			// mechanism's own recorded diagnostic (e.g. OAUTHBEARER/XOAUTH2's
			// JSON error-recovery payload) used to be visible ONLY from
			// finish() -- which the test above proves never runs on this path
			// (a tagged NO, not OK). `describeFailure()` is the fix: `onError()`
			// now calls it and folds a non-undefined result into the message.
			const { connection, router } = makeFakeConnection();
			const mechanism: SaslMechanism = {
				name: "MOCK-OAUTHBEARER",
				requiresSecureTransport: true,
				async start(): Promise<Buffer> {
					return Buffer.from("initial-response", "utf8");
				},
				async step(): Promise<Buffer> {
					return Buffer.from([0x01]);
				},
				async finish(): Promise<void> {
					// Never reached on this path -- see the test above.
				},
				describeFailure(): string | undefined {
					return "status=invalid_token, scope=mail";
				},
			};
			const cmd = new AuthenticateCommand({
				mechanism,
				ctx: CTX,
				initialResponse: await mechanism.start(CTX),
				saslIrAllowed: true,
			});

			const resultPromise = executeCommand(connection, cmd, "A11");
			await flushMicrotasks();
			router.routeTagged(
				parseLine(`A11 NO [AUTHENTICATIONFAILED] invalid_token${CRLF}`) as TaggedResponse,
			);

			const err = await resultPromise.catch((e: unknown) => e);
			expect(err).toBeInstanceOf(AuthError);
			expect((err as AuthError).message).toContain("invalid_token");
			expect((err as AuthError).message).toContain("status=invalid_token, scope=mail");
		});

		test("REVERT-VERIFY: a mechanism with no describeFailure() (the common case) leaves the message unchanged", async () => {
			const { connection, router } = makeFakeConnection();
			const mechanism = makePlainLikeMechanism();
			const cmd = new AuthenticateCommand({
				mechanism,
				ctx: CTX,
				initialResponse: await mechanism.start(CTX),
				saslIrAllowed: true,
			});

			const resultPromise = executeCommand(connection, cmd, "A12");
			await flushMicrotasks();
			router.routeTagged(
				parseLine(`A12 NO [AUTHENTICATIONFAILED] bad credentials${CRLF}`) as TaggedResponse,
			);

			const err = await resultPromise.catch((e: unknown) => e);
			expect((err as AuthError).message).toBe(
				"AUTHENTICATE PLAIN failed with NO: bad credentials",
			);
		});
	});

	describe("'*' abort on a mechanism throw", () => {
		test("mechanism.step() throws -> client writes '*' -> tagged NO settles the command with AuthError", async () => {
			const { connection, written, router } = makeFakeConnection();
			const mechanism: SaslMechanism = {
				name: "BROKEN",
				requiresSecureTransport: false,
				async start(): Promise<Buffer | null> {
					return null;
				},
				async step(): Promise<Buffer> {
					throw new Error("cannot answer this challenge");
				},
				async finish(): Promise<void> {},
			};
			const cmd = new AuthenticateCommand({
				mechanism,
				ctx: CTX,
				initialResponse: null,
				saslIrAllowed: true,
			});

			const resultPromise = executeCommand(connection, cmd, "A5");
			await flushMicrotasks();
			expect(Buffer.concat(written).toString("ascii")).toBe(`A5 AUTHENTICATE BROKEN${CRLF}`);

			router.routeContinuation(parseLine(`+ Y2hhbGxlbmdl${CRLF}`) as ContinueResponse);
			await flushMicrotasks();

			expect(Buffer.concat(written).toString("ascii")).toBe(
				`A5 AUTHENTICATE BROKEN${CRLF}*${CRLF}`,
			);

			router.routeTagged(parseLine(`A5 NO authentication cancelled${CRLF}`) as TaggedResponse);

			const err = await resultPromise.catch((e: unknown) => e);
			expect(err).toBeInstanceOf(AuthError);
			expect((err as AuthError).mechanismsTried).toEqual(["BROKEN"]);

			// The queue/router is healthy afterward: a following command's
			// continuation owner registers cleanly (proves the aborted command's
			// owner was unregistered, not left dangling).
			const { NoopCommand } = await import("../../../src/commands/noop");
			const noop = new NoopCommand();
			const noopPromise = executeCommand(connection, noop, "A6");
			await flushMicrotasks();
			router.routeTagged(parseLine(`A6 OK done${CRLF}`) as TaggedResponse);
			await expect(noopPromise).resolves.toBeNull();
		});
	});

	describe("finish() throwing after a tagged OK (the SCRAM seam)", () => {
		test("finish() rejecting still rejects the command's promise despite the tagged OK", async () => {
			const { connection, router } = makeFakeConnection();
			const finishSpy = vi.fn().mockRejectedValue(new Error("server signature mismatch"));
			const mechanism: SaslMechanism = {
				name: "MOCK-SCRAM",
				requiresSecureTransport: true,
				async start(): Promise<Buffer> {
					return Buffer.from("client-first", "utf8");
				},
				async step(): Promise<Buffer> {
					throw new Error("not expected in this test");
				},
				finish: finishSpy,
			};
			const cmd = new AuthenticateCommand({
				mechanism,
				ctx: CTX,
				initialResponse: await mechanism.start(CTX),
				saslIrAllowed: true,
			});

			const resultPromise = executeCommand(connection, cmd, "A7");
			await flushMicrotasks();

			router.routeTagged(parseLine(`A7 OK done${CRLF}`) as TaggedResponse);

			const err = await resultPromise.catch((e: unknown) => e);
			expect(err).toBeInstanceOf(AuthError);
			expect((err as AuthError).message).toContain("server signature mismatch");
			expect(finishSpy).toHaveBeenCalledTimes(1);
			// No text on the tagged OK -> finish() is called with null extra data.
			expect(finishSpy).toHaveBeenCalledWith(null, CTX);
		});

		test("finish() throwing an AuthError is re-issued TERMINAL, carrying the original as cause (M5.1 security fix)", async () => {
			// Pre-M5.1 this test asserted the mechanism's own AuthError propagated
			// unwrapped. That contract deliberately changed: a finish() rejection
			// is a post-tagged-OK integrity failure (the mechanism saying "the
			// server is lying" -- a suspected MITM), so accept() re-issues it as a
			// fresh AuthError with `terminal: true` -- the flag
			// `performAuthSelection` uses to stop dead instead of downgrading to a
			// weaker mechanism or LOGIN. The mechanism's own instance can't carry
			// the flag itself (`mechanismAuthError()` is shared by pre-tagged-OK
			// failures where try-next is still correct); it survives as `.cause`.
			const { connection, router } = makeFakeConnection();
			const authErr = new AuthError("server signature did not verify", {
				mechanismsTried: ["MOCK-SCRAM"],
				code: null,
			});
			const mechanism: SaslMechanism = {
				name: "MOCK-SCRAM",
				requiresSecureTransport: true,
				async start(): Promise<Buffer> {
					return Buffer.from("client-first", "utf8");
				},
				async step(): Promise<Buffer> {
					throw new Error("not expected in this test");
				},
				async finish(): Promise<void> {
					throw authErr;
				},
			};
			const cmd = new AuthenticateCommand({
				mechanism,
				ctx: CTX,
				initialResponse: await mechanism.start(CTX),
				saslIrAllowed: true,
			});

			const resultPromise = executeCommand(connection, cmd, "A8");
			await flushMicrotasks();
			router.routeTagged(parseLine(`A8 OK done${CRLF}`) as TaggedResponse);

			const err = await resultPromise.catch((e: unknown) => e);
			expect(err).toBeInstanceOf(AuthError);
			expect((err as AuthError).terminal).toBe(true);
			expect((err as AuthError).cause).toBe(authErr);
			expect((err as AuthError).message).toContain("server signature did not verify");
			expect((err as AuthError).mechanismsTried).toEqual(["MOCK-SCRAM"]);
		});
	});

	describe("tagged NO/BAD mapping", () => {
		test("tagged NO maps to AuthError carrying the typed code and mechanismsTried", async () => {
			const { connection, router } = makeFakeConnection();
			const mechanism = makePlainLikeMechanism();
			const cmd = new AuthenticateCommand({
				mechanism,
				ctx: CTX,
				initialResponse: await mechanism.start(CTX),
				saslIrAllowed: true,
			});

			const resultPromise = executeCommand(connection, cmd, "A9");
			await flushMicrotasks();
			router.routeTagged(
				parseLine(`A9 NO [AUTHENTICATIONFAILED] bad credentials${CRLF}`) as TaggedResponse,
			);

			const err = await resultPromise.catch((e: unknown) => e);
			expect(err).toBeInstanceOf(AuthError);
			expect((err as AuthError).mechanismsTried).toEqual(["PLAIN"]);
			expect((err as AuthError).code?.name).toBe("AUTHENTICATIONFAILED");
		});

		test("tagged BAD maps to AuthError too (not a plain CommandError)", async () => {
			const { connection, router } = makeFakeConnection();
			const mechanism = makePlainLikeMechanism();
			const cmd = new AuthenticateCommand({
				mechanism,
				ctx: CTX,
				initialResponse: await mechanism.start(CTX),
				saslIrAllowed: true,
			});

			const resultPromise = executeCommand(connection, cmd, "A10");
			await flushMicrotasks();
			router.routeTagged(parseLine(`A10 BAD malformed command${CRLF}`) as TaggedResponse);

			const err = await resultPromise.catch((e: unknown) => e);
			expect(err).toBeInstanceOf(AuthError);
			expect((err as AuthError).mechanismsTried).toEqual(["PLAIN"]);
		});

		// M14 (log-injection defense, verified real): the server's free-text
		// explanation used to be embedded verbatim, completely unsanitized,
		// into the resulting `AuthError`'s `message`. A literal CR/LF can't
		// actually ride inside a single parsed response line (CRLF IS the
		// line terminator -- the wire grammar itself excludes it from
		// resp-text), but other C0/DEL control bytes (ESC, in particular --
		// terminal-escape-sequence injection into a log viewer) pass through
		// completely unremarkable to the lexer/parser and land in
		// `resp.status.text.content` verbatim.
		test("M14: a C0 control byte (ESC) in the server's NO text is escaped, never embedded raw, in the resulting AuthError message", async () => {
			const { connection, router } = makeFakeConnection();
			const mechanism = makePlainLikeMechanism();
			const cmd = new AuthenticateCommand({
				mechanism,
				ctx: CTX,
				initialResponse: await mechanism.start(CTX),
				saslIrAllowed: true,
			});

			const resultPromise = executeCommand(connection, cmd, "A11");
			await flushMicrotasks();
			// A raw ESC (\x1b) byte embedded in the resp-text -- a single
			// line, so it parses cleanly (no CRLF involved) but still
			// carries a live control byte through to `text.content`.
			router.routeTagged(
				parseLine(`A11 NO bad credentials\x1b[31minjected${CRLF}`) as TaggedResponse,
			);

			const err = await resultPromise.catch((e: unknown) => e);
			expect(err).toBeInstanceOf(AuthError);
			// REVERT-VERIFY: reverting `authenticate.ts`'s `sanitizeForErrorMessage()`
			// call back to the raw `resp.status.text?.content` this test would
			// instead see the literal ESC byte (`"\x1b"`) inside the message --
			// this asserts the ESCAPED two-character form is present and the
			// raw control byte is not.
			expect((err as AuthError).message).toContain("\\x1b[31minjected");
			// eslint-disable-next-line no-control-regex -- asserting the raw control byte is absent is the whole point of this test
			expect((err as AuthError).message).not.toMatch(/\x1b/);
		});
	});
});
