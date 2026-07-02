/**
 * RFC 2342 — "IMAP4 Namespace" — the NAMESPACE command + `* NAMESPACE` response.
 * Client-binding duties for a client that uses the NAMESPACE extension.
 *
 * Testable catalog id covered here (see test/compliance/catalog/ext/rfc2342.ts):
 *
 *   RFC2342-5-4  Client (implicit) MUST accept a NIL for any unavailable
 *                namespace class in the `* NAMESPACE` response. testable,
 *                profiles ["rev1","rev2"] — no RFC 9051 §6.3.10 prose counterpart
 *                (9051 states the NIL-per-class shape only through ABNF), so
 *                RFC 2342 remains source-of-truth for both profiles.
 *
 * NOT cited (untestable per the catalog — see the module for rationales):
 *   RFC2342-3-1 (ui-presentation — manual namespace-prefix entry affordance),
 *   RFC2342-5-1 (internal-decision — "be prepared for" multiple namespaces;
 *                rev1-only, rev2 scores via RFC9051-6.3.10-1),
 *   RFC2342-5-2 (user-intent-policy — let the user pick a create namespace;
 *                rev1-only, rev2 scores via RFC9051-6.3.10-2),
 *   RFC2342-5-3 (user-intent-policy — MAY append '%' to the Other Users' prefix).
 * These have no wire-observable pass/fail boundary and are deliberately omitted.
 *
 * REAL SIGNAL (not self-actualizing). driver.namespace() throws
 * NotImplementedError, so there is no COMMAND surface to drive. But the client
 * DOES parse an unsolicited `* NAMESPACE` response: src/parser/structure/
 * namespace.ts builds a NamespaceResponse whose three positional classes are the
 * parsed `.personal` / `.others` / `.shared` (each a Namespace, or `null` when the
 * wire carried the atom NIL), and Connection surfaces it as an "untaggedResponse"
 * event of type "NAMESPACE". So RFC2342-5-4 is exercised for real via the
 * connectLow() observation path: the server sends a NAMESPACE response carrying
 * NIL classes after the greeting, and we assert the client accepts it (parses to
 * completion, exposing NIL as `null` and the present class as a real prefix/
 * delimiter) rather than erroring. These tests therefore carry NO expectFailure
 * hint — a genuine pass is the expected, correct outcome, and the assertions are
 * tight enough to reject a wrong parse (a client that dropped the response, choked
 * on NIL, or mis-slotted the classes would fail).
 */
import { expect } from "vitest";

import { close, send } from "../../harness/script";
import { complianceTest } from "../../runner/compliance-test";
import { waitForUntagged } from "../../runner/events";
import { useComplianceFixture } from "../../runner/fixture";

const f = useComplianceFixture();

// Shape of the parsed NamespaceResponse content surfaced on the event. Each class
// is null (the wire NIL) or a Namespace carrying one or more configurations, each
// with a prefix + delimiter. We read structurally so a wrong parse cannot pass.
interface NsConfig {
	prefix: string;
	delimeter: string;
}
interface NsClass {
	configurations: NsConfig[];
}
interface NsContent {
	personal: NsClass | null;
	others: NsClass | null;
	shared: NsClass | null;
}

// Greeting per profile: rev2 folds an inline CAPABILITY into the greeting.
function greeting(profile: "rev1" | "rev2"): string {
	return profile === "rev2"
		? "* OK [CAPABILITY IMAP4rev2 LITERAL-] ready\r\n"
		: "* OK [CAPABILITY IMAP4rev1 NAMESPACE] ready\r\n";
}

// ── RFC2342-5-4: accept NIL for the Other Users' and Shared classes ──────────
// The canonical §5 Example 5.1 personal-only response `((\"\" \"/\")) NIL NIL`:
// a single Personal Namespace with prefix "" and delimiter "/", and NIL for both
// the Other Users' and Shared classes. A conformant client MUST accept this as a
// well-formed response, exposing the two absent classes as null and the present
// class as a real (prefix, delimiter) pair — not treat the NILs as a parse error.
// connectLow() sends no commands, so the response is unsolicited; the client must
// still process it (untaggedResponse event of type NAMESPACE).
complianceTest(
	{
		reqs: ["RFC2342-5-4"],
		profiles: ["rev1", "rev2"],
		title: "client accepts a `* NAMESPACE` response with NIL Other-Users' and Shared classes (personal only)",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				send(greeting(ctx.profile)),
				// §5 Example 5.1: one Personal Namespace ("" "/"), NIL Others, NIL Shared.
				send('* NAMESPACE (("" "/")) NIL NIL\r\n'),
				close(),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connectLow({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		expect(ok).toBe(true);
		await server.assertCompleted();
		// Accepting the response means PARSING it: the event must surface with the
		// parsed content, not be dropped or errored.
		const ev = await waitForUntagged(driver, "NAMESPACE");
		const content = (ev.detail as { content?: NsContent }).content;
		expect(content, "NAMESPACE event must carry parsed content").toBeDefined();
		// The two NIL classes MUST become null (a wrong impl that mis-slotted or
		// choked on NIL would not produce exactly this shape).
		expect(content!.others, "Other Users' class was NIL → null").toBeNull();
		expect(content!.shared, "Shared class was NIL → null").toBeNull();
		// The present Personal class must parse to the real prefix/delimiter pair —
		// this rejects a parser that collapsed everything to null or mis-read NIL.
		expect(content!.personal, "Personal class must be present").not.toBeNull();
		expect(content!.personal!.configurations.length).toBe(1);
		expect(content!.personal!.configurations[0].prefix).toBe("");
		expect(content!.personal!.configurations[0].delimeter).toBe("/");
		// The client must remain connected after accepting the response.
		expect(driver.active, "client stays active after a NIL-bearing NAMESPACE").toBe(true);
	},
);

// ── RFC2342-5-4 (companion slot coverage): NIL in the Personal + Others slots ─
// §5 Example (shared-only): `NIL NIL (("" "."))` — the Personal and Other Users'
// classes are NIL and only the Shared class is present. This exercises NIL in the
// FIRST and SECOND positional slots (the prior test covered slots 2 and 3), so
// together the two tests prove the client accepts NIL in ANY of the three slots
// (the duty's "any namespace class") and does not, e.g., require the Personal
// class to be non-NIL. A wrong impl that special-cased NIL only in trailing slots,
// or that mis-mapped the surviving class into the wrong property, is rejected.
complianceTest(
	{
		reqs: ["RFC2342-5-4"],
		profiles: ["rev1", "rev2"],
		title: "client accepts a `* NAMESPACE` response with NIL Personal and Other-Users' classes (shared only)",
		timeout: 5000,
	},
	async (ctx) => {
		const server = await f.startServer();
		server.arm([
			[
				send(greeting(ctx.profile)),
				// Shared-only: NIL Personal, NIL Others, one Shared Namespace ("" ".").
				send('* NAMESPACE NIL NIL (("" "."))\r\n'),
				close(),
			],
		]);
		const driver = f.newDriver();
		const ok = await driver.connectLow({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		expect(ok).toBe(true);
		await server.assertCompleted();
		const ev = await waitForUntagged(driver, "NAMESPACE");
		const content = (ev.detail as { content?: NsContent }).content;
		expect(content, "NAMESPACE event must carry parsed content").toBeDefined();
		// Personal and Others were NIL → null; Shared is the sole present class.
		expect(content!.personal, "Personal class was NIL → null").toBeNull();
		expect(content!.others, "Other Users' class was NIL → null").toBeNull();
		expect(content!.shared, "Shared class must be present").not.toBeNull();
		expect(content!.shared!.configurations.length).toBe(1);
		expect(content!.shared!.configurations[0].prefix).toBe("");
		// The Shared delimiter here is "." — asserting it rejects a parser that
		// mis-slotted the surviving class or dropped its delimiter.
		expect(content!.shared!.configurations[0].delimeter).toBe(".");
		expect(driver.active, "client stays active after a NIL-bearing NAMESPACE").toBe(true);
	},
);
