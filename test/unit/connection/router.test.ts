import { describe, expect, test, vi } from "vitest";

import { Router } from "../../../src/connection/router";
import Lexer from "../../../src/lexer/lexer";
import Parser from "../../../src/parser/parser";
import ContinueResponse from "../../../src/parser/structure/continue";
import TaggedResponse from "../../../src/parser/structure/tagged";
import UntaggedResponse from "../../../src/parser/structure/untagged";

const CRLF = "\r\n";

function parseLine(line: string) {
	const lexer = new Lexer();
	const parser = new Parser();
	return parser.parseTokens(lexer.tokenize(line));
}

function makeHost() {
	const calls: Record<string, unknown[]> = {
		log: [],
		untagged: [],
		tagged: [],
		continue: [],
		unknown: [],
		response: [],
		serverStatus: [],
		unhandled: [],
		rawStatus: [],
	};
	let secure = false;
	return {
		calls,
		setSecure(v: boolean) {
			secure = v;
		},
		host: {
			log: (info: unknown) => calls.log.push(info),
			isSecure: () => secure,
			emitRawStatus: (r: unknown) => calls.rawStatus.push(r),
			emitUntagged: (r: unknown) => calls.untagged.push(r),
			emitTagged: (r: unknown) => calls.tagged.push(r),
			emitContinue: (r: unknown) => calls.continue.push(r),
			emitUnknown: (r: unknown) => calls.unknown.push(r),
			emitResponse: (r: unknown) => calls.response.push(r),
			emitServerStatus: (r: unknown) => calls.serverStatus.push(r),
			emitUnhandled: (r: unknown) => calls.unhandled.push(r),
		},
	};
}

describe("Router (spec §8)", () => {
	describe("untagged routing order: claims() -> state-tracker lane -> unhandled", () => {
		test("a claimed (non-status) response is pushed to the claimant AND still emits untaggedResponse/response (additive attribution)", () => {
			const { host, calls } = makeHost();
			const router = new Router(host);
			const pushed: UntaggedResponse[] = [];
			router.registerClaimant({
				claims: (r) => r.type === "CAPABILITY",
				push: (r) => pushed.push(r),
			});

			const resp = parseLine(`* CAPABILITY IMAP4rev1${CRLF}`) as UntaggedResponse;
			router.routeUntagged(resp);

			expect(pushed).toEqual([resp]);
			expect(calls.untagged).toEqual([resp]);
			expect(calls.response).toEqual([resp]);
			expect(calls.unhandled).toEqual([]);
		});

		test("claimants are offered in registration (write) order — first claim wins", () => {
			const { host } = makeHost();
			const router = new Router(host);
			const order: string[] = [];
			router.registerClaimant({
				claims: () => {
					order.push("first");
					return true;
				},
				push: () => order.push("first-pushed"),
			});
			router.registerClaimant({
				claims: () => {
					order.push("second");
					return true;
				},
				push: () => order.push("second-pushed"),
			});

			const resp = parseLine(`* CAPABILITY IMAP4rev1${CRLF}`) as UntaggedResponse;
			router.routeUntagged(resp);

			expect(order).toEqual(["first", "first-pushed"]);
		});

		test("an unclaimed non-status response fires unhandled", () => {
			const { host, calls } = makeHost();
			const router = new Router(host);

			const resp = parseLine(`* CAPABILITY IMAP4rev1${CRLF}`) as UntaggedResponse;
			router.routeUntagged(resp);

			expect(calls.unhandled).toEqual([resp]);
		});

		test("a status response never fires unhandled even when unclaimed (routed through the state-tracker lane instead)", () => {
			const { host, calls } = makeHost();
			const router = new Router(host);

			const resp = parseLine(`* OK [UIDVALIDITY 42] ok${CRLF}`) as UntaggedResponse;
			router.routeUntagged(resp);

			expect(calls.unhandled).toEqual([]);
			expect(calls.serverStatus).toEqual([resp]);
			expect(calls.rawStatus).toEqual([resp]);
		});

		test("a misbehaving claims() override does not break routing for other claimants", () => {
			const { host, calls } = makeHost();
			const router = new Router(host);
			router.registerClaimant({
				claims: () => {
					throw new Error("boom");
				},
				push: () => undefined,
			});
			const pushed: UntaggedResponse[] = [];
			router.registerClaimant({
				claims: (r) => r.type === "CAPABILITY",
				push: (r) => pushed.push(r),
			});

			const resp = parseLine(`* CAPABILITY IMAP4rev1${CRLF}`) as UntaggedResponse;
			expect(() => router.routeUntagged(resp)).not.toThrow();
			expect(pushed).toEqual([resp]);
			expect(calls.unhandled).toEqual([]);
		});
	});

	describe("ALERT hygiene (re-homed from Connection's M0 handleStatusResponse)", () => {
		test("pre-confidentiality ALERT logs trusted:false and does not emit serverStatus", () => {
			const { host, calls, setSecure } = makeHost();
			setSecure(false);
			const router = new Router(host);

			const resp = parseLine(`* OK [ALERT] system going down${CRLF}`) as UntaggedResponse;
			router.routeUntagged(resp);

			expect(calls.serverStatus).toEqual([]);
			expect(calls.log).toHaveLength(1);
			expect((calls.log[0] as { detail: { trusted: boolean } }).detail.trusted).toBe(false);
		});

		test("post-confidentiality ALERT logs trusted:true and DOES emit serverStatus", () => {
			const { host, calls, setSecure } = makeHost();
			setSecure(true);
			const router = new Router(host);

			const resp = parseLine(`* OK [ALERT] system going down${CRLF}`) as UntaggedResponse;
			router.routeUntagged(resp);

			expect(calls.serverStatus).toEqual([resp]);
			expect((calls.log[0] as { detail: { trusted: boolean } }).detail.trusted).toBe(true);
		});
	});

	describe("tagged routing", () => {
		test("resolves the registered owner for a known tag", () => {
			const { host } = makeHost();
			const router = new Router(host);
			const resolve = vi.fn();
			router.registerTag("A1", { resolveTagged: resolve });

			const resp = parseLine(`A1 OK done${CRLF}`) as TaggedResponse;
			router.routeTagged(resp);

			expect(resolve).toHaveBeenCalledWith(resp);
		});

		test("an unknown tag logs a warning and emits unhandled, never throws", () => {
			const { host, calls } = makeHost();
			const router = new Router(host);

			const resp = parseLine(`Z00099 OK done${CRLF}`) as TaggedResponse;
			expect(() => router.routeTagged(resp)).not.toThrow();

			expect(calls.unhandled).toEqual([resp]);
			expect(calls.log).toHaveLength(1);
		});

		test("still fires taggedResponse/response even for a known tag (M0 event parity)", () => {
			const { host, calls } = makeHost();
			const router = new Router(host);
			router.registerTag("A1", { resolveTagged: () => undefined });

			const resp = parseLine(`A1 OK done${CRLF}`) as TaggedResponse;
			router.routeTagged(resp);

			expect(calls.tagged).toEqual([resp]);
			expect(calls.response).toEqual([resp]);
		});

		test("a tag is only resolved once — a repeat with the same tag is unknown", () => {
			const { host, calls } = makeHost();
			const router = new Router(host);
			const resolve = vi.fn();
			router.registerTag("A1", { resolveTagged: resolve });

			const resp = parseLine(`A1 OK done${CRLF}`) as TaggedResponse;
			router.routeTagged(resp);
			router.routeTagged(resp);

			expect(resolve).toHaveBeenCalledTimes(1);
			expect(calls.unhandled).toEqual([resp]);
		});
	});

	describe("continuation routing + single-owner invariant (spec §6.2)", () => {
		test("delivers to the registered continuation owner", () => {
			const { host } = makeHost();
			const router = new Router(host);
			const onContinuation = vi.fn();
			router.registerContinuationOwner({ onContinuation });

			const resp = parseLine(`+ ready${CRLF}`) as ContinueResponse;
			router.routeContinuation(resp);

			expect(onContinuation).toHaveBeenCalledWith(resp);
		});

		test("no registered owner logs a warning and emits unhandled, never throws", () => {
			const { host, calls } = makeHost();
			const router = new Router(host);

			const resp = parseLine(`+ ready${CRLF}`) as ContinueResponse;
			expect(() => router.routeContinuation(resp)).not.toThrow();

			expect(calls.unhandled).toEqual([resp]);
			expect(calls.log).toHaveLength(1);
		});

		test("registering a second continuation owner while one is active throws synchronously", () => {
			const { host } = makeHost();
			const router = new Router(host);
			router.registerContinuationOwner({ onContinuation: () => undefined });

			expect(() =>
				router.registerContinuationOwner({ onContinuation: () => undefined }),
			).toThrow();
		});

		test("unregistering (via the returned function) frees the slot for a new owner", () => {
			const { host } = makeHost();
			const router = new Router(host);
			const unregister = router.registerContinuationOwner({
				onContinuation: () => undefined,
			});
			unregister();

			expect(() =>
				router.registerContinuationOwner({ onContinuation: () => undefined }),
			).not.toThrow();
		});
	});

	describe("unknown-response routing", () => {
		test("emits unknownResponse/response and unhandled for a non-null unknown response", () => {
			const { host, calls } = makeHost();
			const router = new Router(host);

			// A line that matches none of tagged/untagged/continuation shapes.
			const resp = parseLine(`totally-not-a-valid-line${CRLF}`);
			router.routeUnknown(resp as never);

			expect(calls.unknown).toHaveLength(1);
			expect(calls.response).toHaveLength(1);
			expect(calls.unhandled).toHaveLength(1);
		});

		test("a null unknown response (malformed/too-short token list) is emitted but not marked unhandled", () => {
			const { host, calls } = makeHost();
			const router = new Router(host);

			router.routeUnknown(null);

			expect(calls.unknown).toEqual([null]);
			expect(calls.response).toEqual([null]);
			expect(calls.unhandled).toEqual([]);
		});
	});
});
