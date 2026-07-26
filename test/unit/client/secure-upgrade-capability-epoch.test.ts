// MEDIUM finding (I-2 capability epoch gap, verified real): STARTTLS never
// invalidated `ImapClient`'s OWN capability registry -- only `Connection`'s
// separate, Layer-1 precursor one. A cleartext greeting's `[CAPABILITY ...]`
// code is bridged into the CLIENT-level registry (firing a public
// `capabilitiesChanged`) BEFORE STARTTLS ever runs; without this fix, that
// attacker-forgeable pre-TLS data stayed "current" -- and had already fired
// a public event carrying it -- for the ENTIRE span between the handshake
// succeeding and the fresh post-TLS CAPABILITY response landing, instead of
// being invalidated the instant confidentiality was actually established.
//
// `Connection` emits `secureUpgrade` synchronously the moment STARTTLS
// succeeds, before the post-TLS CAPABILITY re-fetch -- this is a focused,
// white-box test of `ImapClient`'s bridge for that event (the actual fix),
// isolated from real TLS-handshake timing.

import { describe, expect, test } from "vitest";

import { ImapClient } from "../../../src/client/client";
import type { ImapClientConfig } from "../../../src/client/config";

function baseConfig(): ImapClientConfig {
	return {
		host: "127.0.0.1",
		port: 1, // never actually connected in this test
		tls: "off",
		timeouts: { connect: 2000, greeting: 2000 },
	};
}

describe("MEDIUM finding: STARTTLS invalidates ImapClient's OWN (client-level) capability registry via the 'secureUpgrade' bridge", () => {
	test("emitting 'secureUpgrade' on the underlying connection silently invalidates the client's capability registry", () => {
		const client = new ImapClient(baseConfig());

		// Simulate a cleartext greeting's forgeable `[CAPABILITY ...]` code
		// having already been bridged in (`handleServerStatus()`), the way it
		// would be BEFORE STARTTLS ever runs during a real connect().
		const preTlsCaps: any = {
			capabilities: [{ fullValue: "PRE-TLS-ONLY" }],
		};
		(client as unknown as { capabilityRegistry: { set(c: unknown): void } }).capabilityRegistry.set(
			preTlsCaps,
		);
		expect(client.supports("PRE-TLS-ONLY")).toBe(true);

		let changeCount = 0;
		client.on("capabilitiesChanged", () => changeCount++);

		// The fix under test: `wireConnectionEvents()`'s `secureUpgrade` bridge.
		client.connection.emit("secureUpgrade");

		// Invalidated immediately -- the forgeable pre-TLS marker must no
		// longer read as present, even before any post-TLS CAPABILITY
		// response has arrived.
		expect(client.supports("PRE-TLS-ONLY")).toBe(false);
		// Silent, mirroring `invalidateSilently()`'s own contract (same as the
		// disconnect bridge's housekeeping): this is cache housekeeping for an
		// upcoming trustworthy re-fetch, not itself a new fact about the
		// server worth a public event -- the real, trustworthy
		// `capabilitiesChanged` fires once the genuine post-TLS `.set()`
		// runs, which this focused test doesn't need to drive.
		expect(changeCount).toBe(0);

		// The genuine post-TLS CAPABILITY response now lands (via the normal
		// untagged-response bridge) and replaces the invalidated state with
		// trustworthy data -- THIS is the one that fires the public event.
		const postTlsCaps: any = { capabilities: [{ fullValue: "POST-TLS-ONLY" }] };
		(client as unknown as { capabilityRegistry: { set(c: unknown): void } }).capabilityRegistry.set(
			postTlsCaps,
		);
		expect(client.supports("POST-TLS-ONLY")).toBe(true);
		expect(client.supports("PRE-TLS-ONLY")).toBe(false);
		expect(changeCount).toBe(1);
	});
});
