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

		test("finish() throwing an AuthError directly is propagated unwrapped", async () => {
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
			expect(err).toBe(authErr);
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
	});
});
