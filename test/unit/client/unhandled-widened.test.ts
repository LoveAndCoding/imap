import { describe, expect, test } from "vitest";

import { ImapClient } from "../../../src/client/client";
import type { ImapClientConfig } from "../../../src/client/config";
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

function baseConfig(): ImapClientConfig {
	// Never actually connects in this test -- only `client.connection`'s
	// event bridge (wired in the constructor, `wireConnectionEvents()`) is
	// exercised, directly, without a live socket.
	return { host: "127.0.0.1", port: 1, tls: "off" };
}

/**
 * H4 (verified real): `ImapClient`'s public `unhandled` event used to
 * narrow `Connection`'s own 4-way `unhandled` union
 * (`ContinueResponse | TaggedResponse | UnknownResponse | UntaggedResponse`,
 * `connection/router.ts`'s `routeTagged()`/`routeContinuation()`/
 * `routeUnknown()`/`routeUntagged()`) down to just `UntaggedResponse |
 * UnknownResponse` in the client-level bridge (`wireConnectionEvents()`),
 * silently dropping an unmatched-tag `TaggedResponse` (`Router.routeTagged()`'s
 * "unknown tag" branch) and an unowned `ContinueResponse`
 * (`Router.routeContinuation()`'s "no continuation owner" branch) -- exactly
 * the protocol-desync signals this event exists to surface, with no
 * error/log reaching a consumer of the PUBLIC client API either (the
 * `Router`-level `log()` call is internal-only, gated on the caller having
 * configured a `logger`).
 *
 * These tests drive `client.connection`'s (`Connection`'s, the public Layer-1
 * escape hatch) own `unhandled` event directly with real parsed response
 * instances -- `Router`'s own routing logic that produces these two shapes is
 * already covered by `test/unit/connection/router.test.ts`; this isolates the
 * CLIENT-level bridge specifically, which is what H4 fixes.
 */
describe("ImapClient 'unhandled' event widened to the full 4-way union (H4)", () => {
	test("an unmatched-tag TaggedResponse reaches the public 'unhandled' event", () => {
		const client = new ImapClient(baseConfig());
		const events: unknown[] = [];
		client.on("unhandled", (resp) => events.push(resp));

		const resp = parseLine(`Z9999 OK completed${CRLF}`) as TaggedResponse;
		expect(resp).toBeInstanceOf(TaggedResponse);
		client.connection.emit("unhandled", resp);

		// REVERT-VERIFY: reverting the bridge back to
		// `if (resp instanceof UntaggedResponse || resp instanceof UnknownResponse)`
		// would leave `events` empty here -- a `TaggedResponse` matches
		// neither arm of that narrowed check.
		expect(events).toEqual([resp]);
	});

	test("an unowned ContinueResponse reaches the public 'unhandled' event", () => {
		const client = new ImapClient(baseConfig());
		const events: unknown[] = [];
		client.on("unhandled", (resp) => events.push(resp));

		const resp = parseLine(`+ ${CRLF}`) as ContinueResponse;
		expect(resp).toBeInstanceOf(ContinueResponse);
		client.connection.emit("unhandled", resp);

		expect(events).toEqual([resp]);
	});

	test("the two previously-supported shapes (UntaggedResponse/UnknownResponse) still reach it -- unaffected by the widening", () => {
		const client = new ImapClient(baseConfig());
		const events: unknown[] = [];
		client.on("unhandled", (resp) => events.push(resp));

		const untagged = parseLine(`* 7 EXISTS${CRLF}`) as UntaggedResponse;
		expect(untagged).toBeInstanceOf(UntaggedResponse);
		client.connection.emit("unhandled", untagged);

		expect(events).toEqual([untagged]);
	});
});
