// M3.4: ResponseCollector FETCH streaming bridge (spec §7.3), exercised
// through the REAL parser/lexer/newline-transform pipeline M3.2 built (over
// a real TCP socket, same harness shape as
// `test/unit/connection/literal-streaming.test.ts`), rather than synthetic
// in-process pushes. `collector.test.ts` already proves the bridge's ordering
// and completion semantics deterministically in isolation; this file proves
// the one thing that requires the real streaming machinery: a claimed FETCH
// response carrying a STILL-ARRIVING literal stream is observable and
// drainable through `ResponseCollector.live()` before the tagged response
// that completes the command ever arrives.
//
// The claimant/tag wiring below mirrors `execute-command.ts`'s own
// production shape exactly (construct the collector empty, feed it via
// `router.registerClaimant({ push: (r) => collector.push(r) })`, settle it
// from the tag owner's `resolveTagged`) -- see that file's M3.4 comment.
import * as net from "node:net";

import { afterEach, describe, expect, test } from "vitest";

import { ResponseCollector } from "../../../src/commands/collector";
import Connection from "../../../src/connection";
import { TLSSetting } from "../../../src/connection/types";
import { Fetch } from "../../../src/parser/structure/fetch";
import TaggedResponse from "../../../src/parser/structure/tagged";
import UntaggedResponse from "../../../src/parser/structure/untagged";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function buildBody(n: number): Buffer {
	// Embedded CRLFs throughout (would derail a literal-blind splitter) --
	// same fixture shape as the M3.2 streaming tests.
	const unit = Buffer.from(
		"0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ\r\n",
		"ascii",
	);
	return Buffer.concat(Array(Math.ceil(n / unit.length)).fill(unit)).subarray(
		0,
		n,
	);
}

async function startServer(
	onSocket: (socket: net.Socket) => void,
): Promise<{ port: number; close: () => Promise<void> }> {
	const server = net.createServer((socket) => {
		socket.on("error", () => undefined);
		onSocket(socket);
	});
	const sockets = new Set<net.Socket>();
	server.on("connection", (socket) => {
		sockets.add(socket);
		socket.on("close", () => sockets.delete(socket));
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address() as net.AddressInfo;
	return {
		port: address.port,
		close: () => {
			for (const s of sockets) s.destroy();
			return new Promise<void>((resolve) => server.close(() => resolve()));
		},
	};
}

describe("M3.4: live FETCH streaming through the real pipeline (spec §7.3/§5.4/§11.4)", () => {
	let connection: Connection | undefined;
	let server: { port: number; close: () => Promise<void> } | undefined;

	afterEach(async () => {
		await connection?.disconnect();
		await server?.close();
		connection = undefined;
		server = undefined;
	});

	test("a claimed FETCH response's live literal stream is observable via live() and fully drainable BEFORE the tagged response settles the collector", async () => {
		const N = 64 * 1024;
		const body = buildBody(N);
		const announce = Buffer.from(`* 1 FETCH (BODY[TEXT] {${N}}\r\n`, "ascii");
		const trailer = Buffer.from(")\r\n", "ascii");
		const taggedLine = Buffer.from(`A1 OK Fetch completed\r\n`, "ascii");

		server = await startServer((socket) => {
			socket.write("* OK ready\r\n");
			void (async () => {
				const wireHead = Buffer.concat([announce, body, trailer]);
				const CHUNK = 8 * 1024;
				for (let off = 0; off < wireHead.length; off += CHUNK) {
					socket.write(wireHead.subarray(off, Math.min(off + CHUNK, wireHead.length)));
					await delay(2);
				}
				// Deliberately hold the tagged OK back for a beat: proves the
				// collector genuinely hasn't been settled yet when the
				// assertions below run, not merely "arrived but unobserved".
				await delay(150);
				socket.write(taggedLine);
			})();
		});

		connection = new Connection({
			host: "127.0.0.1",
			port: server.port,
			tls: TLSSetting.FORCE_OFF,
			timeout: 5000,
		});
		await connection.connect();

		// Mirrors `execute-command.ts`'s own production wiring: a live
		// collector, constructed empty, fed by a claimant registered on the
		// SAME router real commands use, settled from the tag owner once the
		// tagged response for this "command" (tag A1) resolves.
		const collector = new ResponseCollector();
		const unregisterClaimant = connection.router.registerClaimant({
			claims: (resp) => resp.type === "FETCH",
			push: (resp) => collector.push(resp),
		});
		const unregisterTag = connection.router.registerTag("A1", {
			resolveTagged: (resp) => collector.settle(resp),
		});

		try {
			const iter = collector.live("FETCH");
			const { value: claim, done } = await iter.next();
			expect(done).toBe(false);

			const fetch = (claim as UntaggedResponse).content as Fetch;
			const section = fetch.body?.sections[0];
			expect(section?.stream).toBeDefined();

			// THE KEY ASSERTION (spec §7.3): the collector is NOT settled --
			// the tagged OK is still ~150ms away on the wire -- yet the
			// claimed FETCH response, including its live stream, is already
			// in hand via live(). (`.complete` is already `true` here: the
			// structure parser cannot tokenize a body-section literal until
			// its trailing `)\r\n` arrives, which is necessarily AFTER every
			// declared body byte -- see `literal-body-stream.ts`'s
			// "ENGAGEMENT GATE" note. The bridge's value isn't that bytes
			// haven't hit the wire yet; it's that NOTHING has drained this
			// stream into a buffer, and the consumer gets to do that on its
			// own schedule, before the command's tagged response ever
			// arrives.)
			expect(collector.settled).toBe(false);
			expect(section!.stream!.stream.complete).toBe(true);
			expect(section!.stream!.stream.readableLength).toBeGreaterThan(0);

			// Drain the stream -- byte-identical to the source body --
			// entirely before the tagged response arrives.
			const received: Buffer[] = [];
			for await (const chunk of section!.stream!.stream) {
				received.push(chunk as Buffer);
			}
			expect(Buffer.concat(received).equals(body)).toBe(true);
			expect(collector.settled).toBe(false);

			// Now let the tagged OK arrive; live() completes (rather than
			// hanging) once settle() runs.
			const finalStep = await iter.next();
			expect(finalStep.done).toBe(true);
			expect(collector.settled).toBe(true);
			expect(collector.tagged().status.status).toBe("OK");
			expect((collector.tagged() as TaggedResponse).tag.id).toBe("A1");
		} finally {
			unregisterClaimant();
			unregisterTag();
		}
	}, 15000);
});
