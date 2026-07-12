# IMAP Compliance Suite — Phase 1 (RFC 3501 Full Catalog + Specs) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract every client-binding requirement from RFC 3501 into the audited catalog and cover every testable one with compliance specs, producing the first full per-RFC compliance picture of the client.

**Architecture:** Builds entirely on Phase 0 machinery (ScriptedServer, driver, runner, reporter — see `docs/superpowers/plans/2026-06-11-compliance-suite-phase0.md`, all 23 commits merged). Phase 1 adds: four machinery carry-forwards, a per-section catalog directory for RFC 3501, and seven spec batches organized by RFC section group. Catalog extraction and audit are controller-orchestrated subagent processes with merge rules that preserve append-only requirement ids.

**Tech Stack:** unchanged — TypeScript, Vitest 4.1.8, Node 20 net/tls. No new dependencies of any kind.

**Spec:** `docs/superpowers/specs/2026-06-11-imap-compliance-suite-design.md`. Scoring, coverage depth ("representative + spec-enumerated variants"), and black-box rules are settled there.

---

**Execution environment notes (carried from Phase 0, still binding):**
- Worktree `F:\Code\node-imap\.claude\worktrees\clever-wozniak-275e61`, branch `claude/clever-wozniak-275e61`. Use `yarn`. `yarn test:compliance` currently: 69 passed / 6 failed (the 6 are honest compliance failures — they stay). `yarn test` (Jest): 1 pre-existing failure (`newline.transform`), tracked separately.
- `test/compliance/` is ESM (`"type":"module"`); no `__dirname` — use `fileURLToPath(import.meta.url)`.
- **PRIME DIRECTIVE for all spec work:** tests encode the SPEC, never the client's current behavior. A failing test with the right annotation is a correct outcome. Never weaken an assertion, never modify `src/`, the driver, harness, runner, catalog, or reporter to change a result. Most §6.3/§6.4 specs will fail `unimplemented` at the first driver verb — that is the measurement.
- **Append-only ids:** existing ids (15 across RFC3501/RFC2971/RFC9525) must never change. New RFC3501 entries in an already-seeded section take the next free ordinal; ordering of NEW entries follows RFC text order.
- Vitest runs test files in parallel, tests within a file sequentially; one ScriptedServer per test (ephemeral ports) keeps this safe.
- Reports (`test/compliance/reports/`) are generated and gitignored; `problems` must stay `[]` after every batch.

---

## Stage A — Machinery carry-forwards (Tasks 1–4)

### Task 1: Happy-path TLS connect test

**Files:**
- Test: `test/compliance/driver/__tests__/driver-tls.test.ts`

The driver's `security: "implicit"` + `ca` path has never been exercised successfully (Phase 0 final review, Important #1). This is a machinery self-test (not a compliance spec — no requirement ids).

- [ ] **Step 1: Write the test**

```ts
import { expect, test } from "vitest";

import { ComplianceDriver } from "../driver";
import { expectLine, reply, send } from "../../harness/script";
import { command } from "../../harness/matchers";
import { ScriptedServer } from "../../harness/scripted-server";
import { loadCertFixture } from "../../harness/tls";
import { useComplianceFixture } from "../../runner/fixture";

const f = useComplianceFixture();

test("driver connects over implicit TLS with a trusted localhost cert", async () => {
	const localhost = loadCertFixture("localhost");
	const server = await f.startServer({ tlsImplicit: localhost });
	server.arm([
		[
			send("* OK secure ready\r\n"),
			expectLine(command("CAPABILITY", { args: null })),
			reply("OK done", ["* CAPABILITY IMAP4rev1"]),
		],
	]);
	const driver = f.newDriver();
	const ok = await driver.connect({
		host: "127.0.0.1",
		port: server.port,
		security: "implicit",
		ca: localhost.cert,
		timeoutMs: 3000,
	});
	expect(ok).toBe(true);
	expect(driver.hasCapability("IMAP4rev1")).toBe(true);
	await server.assertCompleted();
});
```

- [ ] **Step 2: Run it**

Run: `yarn test:compliance`
Expected: this test PASSES (70 passed / 6 failed). If it fails, that is a machinery or client implicit-TLS bug — STOP and report with the transcript; do not weaken the test.

- [ ] **Step 3: Commit**

```bash
git add test/compliance/driver
git commit -m "🔌 Happy-Path Implicit-TLS Driver Self-Test"
```

### Task 2: Harness literal/continuation support, destroy step, helper parity

**Files:**
- Modify: `test/compliance/harness/scripted-server.ts`
- Modify: `test/compliance/harness/script.ts`
- Modify: `test/compliance/runner/acceptance-table.ts`
- Modify: `test/compliance/specs/meta/import-hygiene.test.ts`
- Test: `test/compliance/harness/__tests__/literals.test.ts`

Design (from the suite spec's "ambient grammar checks … correct literal `{n}` handling with continuation waits"):

- A client command line ending in `{n}` (synchronizing literal) means: harness sends `+ Ready\r\n` automatically, then reads exactly `n` octets, then resumes line assembly; the logical command may chain multiple literals and ends at the first CRLF-terminated segment with no trailing literal announcement.
- `{n+}` (LITERAL+, RFC 7888) is the same without the continuation send. The harness records which form was used (specs decide whether LITERAL+ was legitimate given advertised caps).
- Matchers keep their `match(line: string)` signature: they receive the **marker-flat** logical line — the CRLF-delimited text segments joined as-is, with each `{n}`/`{n+}` announcement left in place (e.g. `a1 LOGIN {6} PASS2`). Literal payloads are NEVER inlined into the matched line: payload bytes may contain CRLF or trailing whitespace, which would corrupt single-line grammar matching. Raw payloads are recorded per command (`commandLines[i].literals`) for tests that assert on values or on literal-vs-quoted syntax choice.
- Sanity cap: literal larger than 1 MiB fails the script (no Phase 1 spec needs more; prevents a runaway client hanging the harness).

- [ ] **Step 1: Write failing self-tests**

`test/compliance/harness/__tests__/literals.test.ts`:

```ts
import * as net from "node:net";
import { afterEach, expect, test } from "vitest";

import { command } from "../matchers";
import { close, destroy, expectLine, reply, send } from "../script";
import { ScriptedServer } from "../scripted-server";

let server: ScriptedServer | undefined;
afterEach(async () => {
	await server?.close();
	server = undefined;
});

function rawConnect(port: number): Promise<net.Socket> {
	return new Promise((resolve, reject) => {
		const sock = net.connect({ host: "127.0.0.1", port }, () => resolve(sock));
		sock.once("error", reject);
	});
}

test("synchronizing literal gets an automatic continuation and flat assembly", async () => {
	server = await ScriptedServer.start();
	server.arm([
		[
			send("* OK ready\r\n"),
			expectLine(command("LOGIN")),
			reply("OK done"),
			close(),
		],
	]);
	const sock = await rawConnect(server.port);
	let rx = "";
	sock.on("data", (d) => {
		rx += d.toString("utf8");
		// After the continuation arrives, send the literal payload + rest.
		if (rx.endsWith("+ Ready\r\n")) {
			sock.write("secret PASS2\r\n");
		}
	});
	sock.write("a1 LOGIN {6}\r\n");
	await server.assertCompleted();
	// Matched line keeps the literal marker; payload is recorded separately.
	expect(server.commandLines[0].args).toBe("{6} PASS2");
	expect(server.commandLines[0].literals.length).toBe(1);
	expect(server.commandLines[0].literals[0].toString("utf8")).toBe("secret");
	expect(server.commandLines[0].nonSync).toEqual([false]);
});

test("LITERAL+ non-sync literal needs no continuation", async () => {
	server = await ScriptedServer.start();
	server.arm([
		[
			send("* OK ready\r\n"),
			expectLine(command("LOGIN")),
			reply("OK done"),
			close(),
		],
	]);
	const sock = await rawConnect(server.port);
	sock.write("a1 LOGIN {4+}\r\nuser pass\r\n");
	await server.assertCompleted();
	expect(server.commandLines[0].args).toBe("{4+} pass");
	expect(server.commandLines[0].literals[0].toString("utf8")).toBe("user");
	expect(server.commandLines[0].nonSync).toEqual([true]);
});

test("literal octet count is honored exactly (CRLF inside literal preserved)", async () => {
	server = await ScriptedServer.start();
	server.arm([
		[
			send("* OK ready\r\n"),
			expectLine(command("APPEND")),
			reply("OK done"),
			close(),
		],
	]);
	const sock = await rawConnect(server.port);
	let rx = "";
	sock.on("data", (d) => {
		rx += d.toString("utf8");
		if (rx.endsWith("+ Ready\r\n")) {
			sock.write("line1\r\nline2\r\n"); // 14 octets literal, then CRLF ends command
		}
	});
	sock.write("a1 APPEND INBOX {12}\r\n");
	await server.assertCompleted();
	expect(server.commandLines[0].args).toBe("INBOX {12}");
	expect(server.commandLines[0].literals[0].toString("utf8")).toBe("line1\r\nline2");
});

test("oversized literal announcement fails the script", async () => {
	server = await ScriptedServer.start();
	server.arm([[send("* OK ready\r\n"), expectLine(command("APPEND"))]]);
	const sock = await rawConnect(server.port);
	sock.write(`a1 APPEND INBOX {${2 * 1024 * 1024}}\r\n`);
	const outcome = await server.outcome();
	expect(outcome.ok).toBe(false);
	expect(outcome.reason).toContain("literal");
	sock.destroy();
});

test("destroy step abruptly terminates the connection", async () => {
	server = await ScriptedServer.start();
	server.arm([[send("* OK ready\r\n"), destroy()]]);
	const sock = await rawConnect(server.port);
	const closed = new Promise<boolean>((r) => sock.once("close", (hadErr) => r(hadErr)));
	await server.outcome();
	await closed; // abrupt close reaches the client
	expect((await server.outcome()).ok).toBe(true);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `yarn test:compliance`
Expected: FAIL — `destroy` not exported; `commandLines[0].literals` undefined.

- [ ] **Step 3: Implement**

`script.ts` — extend the union and factories:

```ts
export type ScriptStep =
	| { kind: "send"; data: string | Buffer; chunks?: number[]; delayMs?: number }
	| { kind: "expect"; matcher: LineMatcher }
	| { kind: "reply"; suffix: string; untagged?: string[] }
	| { kind: "startTls" }
	| { kind: "close" }
	| { kind: "destroy" };

export function destroy(): ScriptStep {
	return { kind: "destroy" };
}
```

`scripted-server.ts` — ConnectionRunner changes:

1. Add fields:

```ts
private literalsBuf: Buffer[] = [];
private literalNonSync: boolean[] = [];
private segments: string[] = [];
private literalRemaining = 0; // >0 while consuming literal octets
```

2. Extend `commandLines` element type on ScriptedServer:

```ts
public readonly commandLines: Array<{
	tag: string;
	args: string;
	literals: Buffer[];
	nonSync: boolean[];
}> = [];
```

3. Replace `drainLines()` logical-line assembly with this algorithm (keep the existing bare-LF rejection for text segments and the existing waiting/reject plumbing):

```ts
private static readonly LITERAL_RE = /\{(\d+)(\+)?\}$/;
private static readonly MAX_LITERAL = 1024 * 1024;

private drainLines(): void {
	if (!this.waiting) return;
	// Consume pending literal octets first.
	if (this.literalRemaining > 0) {
		if (this.buffer.length < this.literalRemaining) return;
		const idx = this.literalsBuf.length - 1;
		this.literalsBuf[idx] = Buffer.concat([
			this.literalsBuf[idx],
			this.buffer.subarray(0, this.literalRemaining),
		]);
		this.buffer = this.buffer.subarray(this.literalRemaining);
		this.literalRemaining = 0;
	}
	const idx = this.buffer.indexOf("\r\n");
	if (idx === -1) {
		const lf = this.buffer.indexOf("\n");
		if (lf !== -1) { /* existing bare-LF rejection, unchanged */ }
		return;
	}
	const segment = this.buffer.subarray(0, idx).toString("latin1");
	this.buffer = this.buffer.subarray(idx + 2);

	const lit = ConnectionRunner.LITERAL_RE.exec(segment);
	if (lit) {
		const size = Number(lit[1]);
		if (size > ConnectionRunner.MAX_LITERAL) {
			const w = this.waiting;
			this.waiting = undefined;
			clearTimeout(w.timer);
			w.rejectLine(new Error(`literal announcement too large: ${size} octets`));
			return;
		}
		this.segments.push(segment);
		this.literalsBuf.push(Buffer.alloc(0));
		this.literalNonSync.push(lit[2] === "+");
		this.literalRemaining = size;
		if (lit[2] !== "+") {
			// Synchronizing literal: harness continues automatically.
			const cont = "+ Ready\r\n";
			this.server.transcript.record("S", cont);
			this.socket.write(cont);
		}
		this.drainLines(); // payload may already be buffered
		return;
	}

	// Final segment: assemble the marker-flat logical line. Literal markers
	// stay in place; payload bytes are exposed via commandLines[].literals,
	// never inlined (payloads may contain CRLF / trailing whitespace, which
	// would corrupt single-line grammar matching).
	this.segments.push(segment);
	const flat = this.segments.join("");
	this.lastLiterals = this.literalsBuf;
	this.lastNonSync = this.literalNonSync;
	this.segments = [];
	this.literalsBuf = [];
	this.literalNonSync = [];

	const w = this.waiting;
	this.waiting = undefined;
	clearTimeout(w.timer);
	w.resolveLine(flat);
}
```

Add `private lastLiterals: Buffer[] = []; private lastNonSync: boolean[] = [];` and in `doExpect`, when `result.tag` is present, push:

```ts
this.server.commandLines.push({
	tag: result.tag,
	args: result.args ?? "",
	literals: this.lastLiterals,
	nonSync: this.lastNonSync,
});
this.lastLiterals = [];
this.lastNonSync = [];
```

(Replace the existing `commandLines` push — it currently lacks literals/nonSync.)

4. `run()` switch gains:

```ts
case "destroy":
	this.socket.destroy();
	break;
```

A `destroy` as the final step must still count the script finished (it is a deliberate abrupt end): ensure the loop simply continues to `scriptFinished()` after the destroy case.

`acceptance-table.ts` — add `timeout?: number` to `AcceptanceTable` and pass as `test(title, fn, table.timeout)` (parity with `complianceTest`).

`import-hygiene.test.ts` — extend the specifier scan to also match `require("…")` and dynamic `import("…")`, and flag bare `/src` endings:

```ts
const IMPORT_RE = /(?:from\s+|require\(\s*|import\(\s*)["']([^"']+)["']/g;
// offender condition:
if (/\/src(\/|$)/.test(spec) && !/\/src\/index$/.test(spec)) { ... }
```

(Apply the same condition in both hygiene tests.)

- [ ] **Step 4: Run tests**

Run: `yarn test:compliance`
Expected: all literal/destroy self-tests pass; previous totals preserved (75 passed / 6 failed). The two existing ID-test usages of `commandLines` keep working (`args` unchanged).

- [ ] **Step 5: Commit**

```bash
git add test/compliance
git commit -m "📦 Harness Literals/Continuation + Destroy Step + Helper Parity"
```

### Task 3: Unhandled-error containment

**Files:**
- Modify: `test/compliance/vitest.config.ts`

The identity specs leak client-originated uncaught exceptions (`ERR_TLS_CERT_ALTNAME_INVALID`, `Command canceled`) as run-level vitest errors. Contain KNOWN client-bug signatures without masking unknown ones.

- [ ] **Step 1: Check the installed API**

Vitest 4 config supports `test.onUnhandledError(error): boolean | void` (returning `false` suppresses). Verify the exact name/signature in `node_modules/vitest/dist/node.d.ts` (search `onUnhandledError`). If it does not exist in 4.1.8, use `dangerouslyIgnoreUnhandledErrors: true` plus a comment table of known signatures — and say so in your report.

- [ ] **Step 2: Implement**

In `test/compliance/vitest.config.ts` `test` block:

```ts
		// Known client bugs surface as process-level errors during honest
		// compliance failures (tracked in the catalog/report — not suite bugs).
		// Suppress ONLY these signatures; anything else still fails the run.
		onUnhandledError(error: unknown): boolean | void {
			const msg = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
			const known = [
				/ERR_TLS_CERT_ALTNAME_INVALID/,
				/Hostname\/IP does not match certificate/,
				/Command canceled/,
			];
			if (known.some((re) => re.test(msg))) return false;
		},
```

- [ ] **Step 3: Verify**

Run: `yarn test:compliance`
Expected: same totals; the "Unhandled Errors" block disappears (or shrinks to zero known signatures). If unknown errors appear, do NOT add them to the list — report them.

- [ ] **Step 4: Commit**

```bash
git add test/compliance/vitest.config.ts
git commit -m "🧯 Contain Known Client-Originated Unhandled Errors"
```

### Task 4: State-prefix helpers + catalog directory restructure

**Files:**
- Create: `test/compliance/runner/state.ts`
- Create: `test/compliance/catalog/rfc3501/index.ts` (+ per-section files, see below)
- Delete: `test/compliance/catalog/rfc3501.ts` (content moves, ids unchanged)
- Test: `test/compliance/runner/__tests__/state.test.ts`

- [ ] **Step 1: Write failing tests for the script-prefix builders**

`test/compliance/runner/__tests__/state.test.ts`:

```ts
import { describe, expect, test } from "vitest";

import { capabilityExchange, greet, loginExchange, selectExchange } from "../state";

describe("state script prefixes", () => {
	test("greet defaults to plain OK", () => {
		const [step] = greet();
		expect(step).toEqual({ kind: "send", data: "* OK ready\r\n" });
	});

	test("greet preauth variant", () => {
		const [step] = greet({ kind: "preauth" });
		expect((step as { data: string }).data).toBe("* PREAUTH ready\r\n");
	});

	test("capabilityExchange expects CAPABILITY and replies with the list", () => {
		const steps = capabilityExchange(["IMAP4rev1", "STARTTLS"]);
		expect(steps.map((s) => s.kind)).toEqual(["expect", "reply"]);
		expect((steps[1] as { untagged: string[] }).untagged).toEqual([
			"* CAPABILITY IMAP4rev1 STARTTLS",
		]);
	});

	test("loginExchange expects LOGIN and replies OK", () => {
		const steps = loginExchange();
		expect(steps.map((s) => s.kind)).toEqual(["expect", "reply"]);
	});

	test("selectExchange produces the canonical RFC 3501 §6.3.1 response set", () => {
		const steps = selectExchange("INBOX", { exists: 3, recent: 1, uidValidity: 42 });
		const replyStep = steps[1] as { suffix: string; untagged: string[] };
		expect(replyStep.untagged).toEqual([
			"* 3 EXISTS",
			"* 1 RECENT",
			"* OK [UNSEEN 1] Message 1 is first unseen",
			"* OK [UIDVALIDITY 42] UIDs valid",
			"* OK [UIDNEXT 4] Predicted next UID",
			"* FLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft)",
			"* OK [PERMANENTFLAGS (\\Deleted \\Seen \\*)] Limited",
		]);
		expect(replyStep.suffix).toBe("OK [READ-WRITE] SELECT completed");
	});
});
```

- [ ] **Step 2: Run to verify failure, then implement `runner/state.ts`**

```ts
import { command } from "../harness/matchers";
import { expectLine, reply, send, type ScriptStep } from "../harness/script";

/** Untagged greeting. */
export function greet(opts: { kind?: "ok" | "preauth"; text?: string } = {}): ScriptStep[] {
	const kind = opts.kind === "preauth" ? "PREAUTH" : "OK";
	return [send(`* ${kind} ${opts.text ?? "ready"}\r\n`)];
}

/** Expect a CAPABILITY command; reply with the given capability list. */
export function capabilityExchange(caps: string[]): ScriptStep[] {
	return [
		expectLine(command("CAPABILITY", { args: null })),
		reply("OK CAPABILITY completed", [`* CAPABILITY ${caps.join(" ")}`]),
	];
}

/** Expect a LOGIN command (any credentials); reply OK. */
export function loginExchange(): ScriptStep[] {
	return [expectLine(command("LOGIN")), reply("OK LOGIN completed")];
}

export interface SelectOptions {
	exists?: number;
	recent?: number;
	unseen?: number;
	uidValidity?: number;
	uidNext?: number;
	readOnly?: boolean;
}

/** Expect SELECT <mailbox>; reply with the canonical §6.3.1 data set. */
export function selectExchange(mailbox: string, opts: SelectOptions = {}): ScriptStep[] {
	const exists = opts.exists ?? 0;
	const recent = opts.recent ?? 0;
	const unseen = opts.unseen ?? 1;
	const uidValidity = opts.uidValidity ?? 1;
	const uidNext = opts.uidNext ?? exists + 1;
	const code = opts.readOnly ? "READ-ONLY" : "READ-WRITE";
	return [
		expectLine(command("SELECT", { args: new RegExp(`^"?${mailbox}"?$`, "i") })),
		reply(`OK [${code}] SELECT completed`, [
			`* ${exists} EXISTS`,
			`* ${recent} RECENT`,
			`* OK [UNSEEN ${unseen}] Message ${unseen} is first unseen`,
			`* OK [UIDVALIDITY ${uidValidity}] UIDs valid`,
			`* OK [UIDNEXT ${uidNext}] Predicted next UID`,
			"* FLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft)",
			"* OK [PERMANENTFLAGS (\\Deleted \\Seen \\*)] Limited",
		]),
	];
}
```

- [ ] **Step 3: Restructure the RFC 3501 catalog into a directory**

Create `test/compliance/catalog/rfc3501/` with these section files (each exporting `requirements: SpecRequirement[]` and `note: string`), moving the existing 10 entries UNCHANGED (ids, text, everything) into their homes:

| File | Sections | Gets existing entries |
|---|---|---|
| `s2-protocol.ts` | §2, §3 | 2.2.1-1, 2.2.1-2, 2.2.2-1 |
| `s4-data.ts` | §4 | — |
| `s5-operational.ts` | §5 | — |
| `s6-any-notauth.ts` | §6.1, §6.2 | 6.1.2-1, 6.2.1-1..3 |
| `s6-auth.ts` | §6.3 | — |
| `s6-selected.ts` | §6.4, §6.5 | — |
| `s7-responses.ts` | §7 | 7.1.1-1, 7.1.4-1, 7.1.5-1 |
| `s9-syntax-security.ts` | §9, §11 | — |

`test/compliance/catalog/rfc3501/index.ts`:

```ts
import type { CatalogModule } from "../types";
import * as s2 from "./s2-protocol";
import * as s4 from "./s4-data";
import * as s5 from "./s5-operational";
import * as s6any from "./s6-any-notauth";
import * as s6auth from "./s6-auth";
import * as s6sel from "./s6-selected";
import * as s7 from "./s7-responses";
import * as s9 from "./s9-syntax-security";

const parts = [s2, s4, s5, s6any, s6auth, s6sel, s7, s9];

const rfc3501: CatalogModule = {
	source: "RFC3501",
	extractionNote: parts.map((p) => p.note).join(" "),
	requirements: parts.flatMap((p) => p.requirements),
};

export default rfc3501;
```

Update `catalog/index.ts`'s import from `./rfc3501` (directory resolution keeps the specifier identical — verify; if ESM resolution requires it, use `./rfc3501/index`). Pre-extraction, the new empty section files export `requirements: []` and a one-line `note` ("§4: pending Phase 1 extraction." etc. — these are replaced in Task 5).

- [ ] **Step 4: Verify + commit**

Run: `yarn test:compliance`
Expected: identical totals to before this task (the catalog content is unchanged — same 15 requirements; meta-tests green; report identical).

```bash
git add test/compliance
git commit -m "🧱 State Prefix Helpers + RFC3501 Catalog Directory"
```

---

## Stage B — RFC 3501 catalog extraction (Tasks 5–6)

### Task 5: Full extraction (controller-orchestrated)

**Files:**
- Modify: all eight `test/compliance/catalog/rfc3501/s*.ts` files
- Modify: `test/compliance/specs/meta/catalog.test.ts` (raise the seed-modules assertion if needed — module list unchanged, so likely no change)

This is a controller process task, not a single-subagent task.

- [ ] **Step 1: Dispatch 8 parallel read-only extraction agents**

One agent per section file scope (the table in Task 4). Each agent prompt MUST contain:

1. Fetch `https://www.rfc-editor.org/rfc/rfc3501.txt`; read ONLY its assigned sections (plus §1 for terminology if needed).
2. Extract EVERY **client-binding** normative statement: explicit 2119 keywords binding the client, and imperative prose that plainly obligates the client (tag with a judgment `note`). Server-only requirements are skipped, but each skipped *subsection* is named in a coverage note.
3. For each requirement return (as structured text in the final report, NOT files): `section`, `rfcOrder` (1,2,3… within the section), `title` (short paraphrase), `text` (VERBATIM, whitespace-normalized; elide only non-normative spans with explicit "..."), `level` (strongest client-binding keyword; judgment note if prose), `applicability` (`always` | `conditional` — conditional iff it binds only when the client uses the feature), `testability` (`testable` | `untestable` + rationale: untestable = not observable at the protocol/black-box layer), optional `notes`.
4. Also return a `coverageNote`: every subsection in scope, listed, with "extracted N client requirements" or "no client-binding requirements (server-only/informational)".
5. Constraints: do NOT write any files; do NOT renumber or restate existing entries (agent receives the existing entries for its sections to avoid duplicates — duplicates of existing ids' text must be flagged, not re-extracted).

> **Note (post-execution deviation, recorded):** because each section group maps to exactly ONE disjoint catalog file and ordinals are per-section, the extraction agents write their own section files directly (id-assignment rules included in their instructions) instead of returning entries for controller merge — protects controller context at identical id-discipline guarantees. The catalog meta-test and the Task 6 independent audit verify the result.

- [ ] **Step 2: Merge (controller)**

For each section file: take the agent's entries in `rfcOrder`, assign ids `RFC3501-<section>-<ordinal>` where ordinal continues after any existing entries in that section; write the section file with existing entries first (unchanged), then new entries; set the file's `note` to the agent's coverageNote. Spot-fix obvious schema violations (missing rationale etc.) but do NOT edit quote text — quote problems go back to the extracting agent or to Task 6.

- [ ] **Step 3: Validate + commit**

Run: `yarn test:compliance`
Expected: catalog meta-test green (schema, unique ids); reporter shows the new RFC3501 totals, all new entries `untested`; `problems: []`.

```bash
git add test/compliance/catalog
git commit -m "📜 Full RFC 3501 Client-Requirement Extraction"
```

**Acceptance criteria for the task:** every RFC 3501 section §2–§11 appears in exactly one coverage note; no duplicate ids; existing 10 entries byte-identical; expected magnitude sanity check — if total RFC3501 entries land under ~80 or over ~400, something is off (too coarse / too shredded): investigate before committing.

### Task 6: Independent catalog audit

- [ ] **Step 1: Dispatch 3 parallel auditor agents** (section split: s2+s4+s5 / s6-* / s7+s9), each instructed exactly as Phase 0's auditor (fetch the RFC themselves; verify verbatim quotes with header-stripping + whitespace normalization; check section placement, level, applicability, client-binding, honest elisions, coverage-note honesty by re-scanning their sections for missed client-binding statements). Auditors return per-entry ✅/❌ + a fix list.

- [ ] **Step 2: Apply fixes** via one fix agent (fresh RFC fetch, exact fixes from audit lists, never weakening), then re-run the failed checks. Repeat until all three audit scopes are CLEAN.

- [ ] **Step 3: Commit**

```bash
git add test/compliance/catalog
git commit -m "🔎 RFC 3501 Catalog Audit Fixes"
```

---

## Stage C — Spec batches (Tasks 7–13)

**Shared conventions for every batch (give these to each implementer verbatim):**

- Read the Phase 0 spec files first as exemplars: `specs/rfc3501/7.1-greetings.test.ts` (acceptance table + scenarios + fixture), `specs/rfc3501/2.2-commands.test.ts`, `specs/rfc3501/6.2-starttls.test.ts`, `specs/rfc2971/3.3-id.test.ts`.
- Coverage policy (from the design spec): every `testable` requirement in scope gets ≥1 test; where the spec text enumerates variants (forms, types, alternatives), each variant is a table row or test; boundary values where the grammar allows (empty list, NIL vs string, numbers at limits).
- Use `complianceTest` / `defineAcceptanceTable` only; cite real catalog ids; use `useComplianceFixture()`, state prefixes from `runner/state.ts` (`greet`, `capabilityExchange`, `loginExchange`, `selectExchange`) for setup; drive ONLY the driver.
- For commands with no public API: the spec still scripts the full expected exchange, calls the driver verb, and lets `NotImplementedError` fail it `unimplemented` (see the NOOP exemplar). Add `expectFailure: "unimplemented"` when that is today's known outcome.
- For response-acceptance tables in selected state: state setup will throw `NotImplementedError` at `driver.select` — the rows still encode the right assertions for the future. Use `expectFailure: "unimplemented"` and keep the row's `expect` observation written against the driver's normalized observations.
- File naming: `specs/rfc3501/<section>-<topic>.test.ts` (e.g. `6.3-select.test.ts`, `7.4-fetch.test.ts`).
- After writing: run `yarn test:compliance`; verify `problems: []`; record per-test honest outcomes; NEVER weaken an assertion; commit with the batch's specified message.
- Per-test timeouts: any test expected to hang (client bug) gets `timeout: 5000`.

**Batches** (each = one implementer dispatch + spec review; quality review every two batches):

- [ ] **Task 7 (B1):** §2/§3/§4/§9 — command formation & data formats the client SENDS (tag rules beyond Phase 0, CRLF discipline, atom/quoted/literal choice rules, 8-bit prohibitions, command-per-line). Commit: `✅ RFC3501 §2/§4/§9 Syntax Compliance Specs`
- [ ] **Task 8 (B2):** §5 — operational conventions (INBOX case-insensitivity in client-sent names, mailbox naming, autologout timer client duties, multiple-command interleaving rules §5.5, untagged-data recording duties §5.2/5.3). Commit: `✅ RFC3501 §5 Operational Compliance Specs`
- [ ] **Task 9 (B3):** §6.1/§6.2/§11 — CAPABILITY/NOOP/LOGOUT, STARTTLS deepening, AUTHENTICATE (incl. base64 + cancel duties), LOGIN, LOGINDISABLED MUST NOT. Commit: `✅ RFC3501 §6.1-6.2 Command Compliance Specs`
- [ ] **Task 10 (B4):** §6.3 — SELECT/EXAMINE/CREATE/DELETE/RENAME/SUBSCRIBE/UNSUBSCRIBE/LIST/LSUB/STATUS/APPEND client duties. Commit: `✅ RFC3501 §6.3 Command Compliance Specs`
- [ ] **Task 11 (B5):** §6.4/§6.5 — CHECK/CLOSE/EXPUNGE/SEARCH/FETCH/STORE/COPY/UID. Commit: `✅ RFC3501 §6.4 Command Compliance Specs`
- [ ] **Task 12 (B6):** §7.1/§7.2/§7.3/§7.5 — status/server/mailbox-size response acceptance (untagged OK/NO/BAD/BYE, response codes incl. ALERT/READ-ONLY/TRYCREATE/UIDVALIDITY/UNSEEN/PERMANENTFLAGS, CAPABILITY/LIST/LSUB/STATUS/SEARCH/FLAGS data, EXISTS/RECENT/EXPUNGE, continuation requests). Include the stronger BYE variant carried from Phase 0: server sends `* BYE` WITHOUT closing — the client must recognize the rejection itself rather than relying on close detection. Commit: `✅ RFC3501 §7.1-7.3 Response Compliance Specs`
- [ ] **Task 13 (B7):** §7.4 — message-status responses: FETCH data items, ENVELOPE/BODYSTRUCTURE acceptance to the limits §7 requires (NOT full MIME — per the design spec's scope exclusion). Commit: `✅ RFC3501 §7.4 Response Compliance Specs`

**Per-batch review gates:**
- Spec review (every batch): plan-conventions fidelity; assertions encode the catalog requirement (reviewer reads the cited catalog entries); failures genuine (transcripts); no weakening; `problems: []`; per-requirement coverage — every in-scope `testable` requirement cited by ≥1 test (cross-check compliance.json `untested` for the batch's sections).
- Quality review (after Tasks 8, 10, 12, 13): test-code quality across the two preceding batches (cleanup, duplication worth extracting, readability, runtime).

---

## Task 14: Phase 1 wrap

- [ ] **Step 1:** Full `yarn test:compliance` + `yarn test`; capture totals and runtime. Verify `problems: []`; verify zero `untested` testable RFC3501 requirements remain (or produce the explicit exception list with reasons — each exception needs a catalog `notes` update or a follow-up task).
- [ ] **Step 2:** Final phase-boundary code-review subagent over the whole Phase 1 range (plan + spec adherence, system properties, Phase 2 readiness).
- [ ] **Step 3:** Audited progress report to the user: per-level RFC3501 compliance numbers, gap highlights, client bugs discovered, Phase 2 carry-forwards. Phase boundary = user checkpoint.
