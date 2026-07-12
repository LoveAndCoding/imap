import { vi } from "vitest";

import { CapabilityRegistry } from "../../src/connection/capabilities";
import Session from "../../src/session";

/** Minimal duck-typed CapabilityList stand-in — only `.has()` is consulted. */
function fakeCaps(present: string[]): any {
	const set = new Set(present.map((c) => c.toUpperCase()));
	return { has: (c: string) => set.has(c.toUpperCase()) };
}

/**
 * A fake `Connection` good enough to drive `Session.start()`: `connect()`
 * resolves immediately, `capabilityRegistry` is a REAL `CapabilityRegistry`
 * (so we exercise the same isValid/value contract Session consults), and
 * `runCommand()` is a spy so tests can assert whether/how many times Session
 * issued its own CAPABILITY round trip.
 */
function makeFakeConnection(opts: {
	preSet?: any;
	runCommandResult?: any;
} = {}) {
	const capabilityRegistry = new CapabilityRegistry();
	if (opts.preSet) {
		capabilityRegistry.set(opts.preSet);
	}
	const runCommand = vi.fn(async (command: any) => {
		if (command.type === "CAPABILITY") {
			return opts.runCommandResult ?? fakeCaps(["IMAP4rev1"]);
		}
		if (command.type === "ID") {
			return new Map();
		}
		throw new Error(`unexpected command in test: ${command.type}`);
	});
	return {
		isActive: true,
		capabilityRegistry,
		connect: vi.fn(async () => true),
		runCommand,
		disconnect: vi.fn(async () => undefined),
	};
}

describe("Session capability reconciliation (spec §10.4, I-2)", () => {
	test("reuses a registry already populated post-connect instead of re-issuing CAPABILITY", async () => {
		// Arrange: simulate what connection.starttls() does on a successful
		// upgrade — invalidate whatever was cached pre-TLS and re-populate the
		// registry from the post-TLS CAPABILITY round trip, all before
		// connect() resolves. Session must see ONLY the post-TLS value and
		// must not perform a second, redundant CAPABILITY round trip (the
		// STARTTLS compliance scripts script exactly one post-TLS CAPABILITY;
		// a second one would be an unscripted command).
		const postTlsCaps = fakeCaps(["IMAP4rev1", "POST-TLS-ONLY"]);
		const fakeConnection = makeFakeConnection({ preSet: postTlsCaps });
		const session = new Session({ host: "localhost", port: 143 } as any);
		(session as any).connection = fakeConnection;

		// Act
		const ok = await session.start();

		// Assert
		expect(ok).toBe(true);
		expect(session.capabilities).toBe(postTlsCaps);
		expect(session.capabilities?.has("POST-TLS-ONLY")).toBe(true);
		// The registry was already valid — Session must not have fetched
		// CAPABILITY (or anything else) itself.
		expect(fakeConnection.runCommand).not.toHaveBeenCalled();
	});

	test("fetches CAPABILITY itself, and populates the registry, when it starts out invalid", async () => {
		// Arrange: a plain/implicit connect never touches capabilities during
		// connect() — the registry starts (and stays) invalid until Session
		// does its own round trip, exactly as it always has.
		const caps = fakeCaps(["IMAP4rev1"]);
		const fakeConnection = makeFakeConnection({ runCommandResult: caps });
		const session = new Session({ host: "localhost", port: 143 } as any);
		(session as any).connection = fakeConnection;

		expect(fakeConnection.capabilityRegistry.isValid).toBe(false);

		// Act
		const ok = await session.start();

		// Assert
		expect(ok).toBe(true);
		expect(session.capabilities).toBe(caps);
		expect(fakeConnection.runCommand).toHaveBeenCalledTimes(1);
		expect(fakeConnection.runCommand.mock.calls[0][0]).toMatchObject({
			type: "CAPABILITY",
		});
		// Session must have written its own fetch back into the registry so
		// later readers (and a future re-entrant call) see it as current.
		expect(fakeConnection.capabilityRegistry.isValid).toBe(true);
		expect(fakeConnection.capabilityRegistry.value).toBe(caps);
	});

	test("pre-TLS-only capability data can never resurface: the registry only ever exposes its current value", async () => {
		// Arrange: this is the discard half of I-2, expressed at the Session
		// boundary — even if some earlier (pre-TLS) capability data existed,
		// once the registry has been invalidated and re-set (as STARTTLS
		// does), Session has no path back to the old value: it only ever
		// reads `registry.value`.
		const preTls = fakeCaps(["IMAP4rev1", "PRE-TLS-ONLY"]);
		const fakeConnection = makeFakeConnection({ preSet: preTls });
		// Simulate the handshake's invalidate() + re-set() happening between
		// Connection construction and connect() resolving.
		fakeConnection.capabilityRegistry.invalidate();
		const postTls = fakeCaps(["IMAP4rev1", "POST-TLS-ONLY"]);
		fakeConnection.capabilityRegistry.set(postTls);

		const session = new Session({ host: "localhost", port: 143 } as any);
		(session as any).connection = fakeConnection;

		// Act
		await session.start();

		// Assert
		expect(session.capabilities?.has("PRE-TLS-ONLY")).toBe(false);
		expect(session.capabilities?.has("POST-TLS-ONLY")).toBe(true);
	});
});
