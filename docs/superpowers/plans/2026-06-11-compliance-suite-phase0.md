# IMAP Compliance Suite — Phase 0 (Machinery) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete compliance-suite machinery (ScriptedServer harness, driver adapter, requirement catalog, runner helpers, custom reporter) and prove it end-to-end on the client's existing surface, producing the first real compliance report.

**Architecture:** Self-contained Vitest suite under `test/compliance/`. Tests script a fake IMAP server on loopback TCP/TLS, drive the client only through its public entry (`src/index.ts`: `Session`/`Connection`), and attach requirement IDs as `task.meta`; a custom reporter joins results against a machine-readable catalog and emits console/JSON/Markdown compliance reports.

**Tech Stack:** TypeScript, Vitest 4.1.8 (new devDependency — approved), Node 20 `net`/`tls`, OpenSSL (cert fixture generation only). No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-06-11-imap-compliance-suite-design.md` — all decisions there are settled; do not re-litigate.

**Execution environment notes:**
- **Recorded deviations (Task 1, reviewed and approved):** (a) root `package.json` carries `"resolutions": {"vite": "^6.0.0"}` because this machine runs Node 20.12.2 and vite 7/8 require >= 20.19 — drop the pin once Node is upgraded past 20.19/22.12. (b) `test/compliance/package.json` contains `{"type": "module"}` so the ESM-style vitest config (`import.meta.url`) loads correctly under the CJS root package — permanent, do not remove.
- Windows; repo at the worktree root. Use `yarn` (yarn.lock, yarn 1.22.5). Run commands from repo root.
- `yarn test` runs the existing Jest suite (`test/(unit|integration)` only — it cannot see `test/compliance/`); it must stay green throughout.
- Vitest does not type-check; the repo's TS 4.3 is irrelevant at runtime (esbuild transform). Don't "fix" type-version mismatches in editor tooling.
- Vitest 4 API names in this plan (`onTestRunEnd`, `TestModule.children.allTests()`, `testCase.meta()`, `testCase.result()`) should be verified against the installed package's types; adjust mechanically if a name differs — the data flow is the design, exact identifiers are not.
- The client's existing public surface: `new Session(opts).start()/end()` (start auto-runs CAPABILITY, then ID if advertised), getters `active/authenticated/capabilities/server`; `new Connection(opts)` with `connect()/disconnect()`, events (`ready`, `disconnected`, `untaggedResponse`, `taggedResponse`, `continueResponse`, `unknownResponse`, `serverStatus`, `connectionError`), `isActive/isSecure`. TLS modes via `tls: TLSSetting` (`"on"`/`"starttls"`/`"opportunistic"`/`"off"`) and `tlsOptions` pass-through. **Command classes are not exported** — NOOP/LOGIN/SELECT/… have no public invocation path; the driver must throw `NotImplementedError` for them.

---

## Task 1: Vitest scaffolding

**Files:**
- Modify: `package.json` (devDependency + script)
- Create: `test/compliance/vitest.config.ts`
- Create: `test/compliance/tsconfig.json`
- Create: `test/compliance/harness/__tests__/smoke.test.ts` (temporary; replaced in Task 3)
- Modify: `.gitignore` (if absent, create) — ignore `test/compliance/reports/`

- [ ] **Step 1: Install vitest**

Run: `yarn add -D vitest@4.1.8`
Expected: success; `package.json` devDependencies gains `"vitest": "4.1.8"`.

- [ ] **Step 2: Add the script and config**

In `package.json` scripts, add:

```json
"test:compliance": "vitest run --config test/compliance/vitest.config.ts"
```

Create `test/compliance/vitest.config.ts`:

```ts
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	root: here,
	test: {
		include: [
			"specs/**/*.test.ts",
			"harness/__tests__/**/*.test.ts",
			"driver/__tests__/**/*.test.ts",
			"runner/__tests__/**/*.test.ts",
			"reporter/__tests__/**/*.test.ts",
		],
		testTimeout: 15000,
		hookTimeout: 15000,
	},
});
```

(The custom reporter is wired in Task 8 — keep default reporters until it exists.)

Create `test/compliance/tsconfig.json` (editor support only; vitest doesn't use it):

```json
{
	"extends": "../../tsconfig.json",
	"compilerOptions": {
		"outDir": null,
		"types": ["node"]
	},
	"include": ["./**/*"]
}
```

Add to `.gitignore` (create the file at repo root if it doesn't exist):

```
test/compliance/reports/
```

- [ ] **Step 3: Write a smoke test**

`test/compliance/harness/__tests__/smoke.test.ts`:

```ts
import { expect, test } from "vitest";

test("vitest runs in the compliance suite", () => {
	expect(1 + 1).toBe(2);
});
```

- [ ] **Step 4: Verify both runners**

Run: `yarn test:compliance`
Expected: 1 passed.
Run: `yarn test`
Expected: existing Jest suite passes, does NOT pick up the smoke test.

- [ ] **Step 5: Commit**

```bash
git add package.json yarn.lock .gitignore test/compliance
git commit -m "🧰 Scaffold Vitest Compliance Suite"
```

---

## Task 2: Catalog types, validation, and meta-test

**Files:**
- Create: `test/compliance/catalog/types.ts`
- Create: `test/compliance/catalog/index.ts`
- Test: `test/compliance/specs/meta/catalog.test.ts`

- [ ] **Step 1: Write the failing meta-test**

`test/compliance/specs/meta/catalog.test.ts`:

```ts
import { expect, test } from "vitest";

import { allCatalogModules } from "../../catalog";
import { validateCatalog } from "../../catalog/types";

test("catalog modules are schema-valid with unique, stable ids", () => {
	const problems = validateCatalog(allCatalogModules);
	expect(problems).toEqual([]);
});

test("catalog has at least one module by end of Phase 0", () => {
	expect(allCatalogModules.length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `yarn test:compliance`
Expected: FAIL — cannot resolve `../../catalog`.

- [ ] **Step 3: Implement catalog types + validation**

`test/compliance/catalog/types.ts`:

```ts
export type Profile = "rev1" | "rev2";

export type Rfc2119Level = "MUST" | "MUST NOT" | "SHOULD" | "SHOULD NOT" | "MAY";

export interface SpecRequirement {
	/** `${source}-${section}-${ordinal}` — append-only, never renumbered. */
	id: string;
	/** e.g. 'RFC3501', 'RFC2971', 'XOAUTH2', 'X-GM-EXT-1' */
	source: string;
	/** RFC section, e.g. '6.2.1' */
	section: string;
	/** Short paraphrase for reports. */
	title: string;
	/** Verbatim normative sentence(s) from the spec. */
	text: string;
	level: Rfc2119Level;
	/** 'conditional' = binds only if the client uses the feature. */
	applicability: "always" | "conditional";
	profiles: Profile[];
	testability: "testable" | "untestable";
	/** Required when testability === 'untestable'. */
	untestableRationale?: string;
	/** e.g. judgment call on a lowercase-keyword pre-8174 sentence. */
	notes?: string;
}

export interface CatalogModule {
	source: string;
	requirements: SpecRequirement[];
	/** Sections reviewed + sections with no client-binding requirements. */
	extractionNote: string;
}

const LEVELS: ReadonlySet<string> = new Set([
	"MUST",
	"MUST NOT",
	"SHOULD",
	"SHOULD NOT",
	"MAY",
]);
const PROFILES: ReadonlySet<string> = new Set(["rev1", "rev2"]);

export function validateCatalog(modules: CatalogModule[]): string[] {
	const problems: string[] = [];
	const seenIds = new Set<string>();

	for (const mod of modules) {
		if (!mod.source) problems.push("module with empty source");
		if (!mod.extractionNote || mod.extractionNote.trim().length < 20) {
			problems.push(`${mod.source}: extractionNote missing or too thin`);
		}
		for (const req of mod.requirements) {
			const where = req.id || `${mod.source}-<missing id>`;
			if (seenIds.has(req.id)) problems.push(`duplicate id: ${req.id}`);
			seenIds.add(req.id);
			if (req.source !== mod.source) {
				problems.push(`${where}: source '${req.source}' != module '${mod.source}'`);
			}
			if (!req.id.startsWith(`${req.source}-${req.section}-`)) {
				problems.push(`${where}: id must be '<source>-<section>-<ordinal>'`);
			}
			if (!/^\d+$/.test(req.id.slice(`${req.source}-${req.section}-`.length))) {
				problems.push(`${where}: ordinal must be a positive integer`);
			}
			if (!req.title.trim()) problems.push(`${where}: empty title`);
			if (!req.text.trim()) problems.push(`${where}: empty text`);
			if (!LEVELS.has(req.level)) problems.push(`${where}: bad level '${req.level}'`);
			if (req.applicability !== "always" && req.applicability !== "conditional") {
				problems.push(`${where}: bad applicability`);
			}
			if (!req.profiles.length || req.profiles.some((p) => !PROFILES.has(p))) {
				problems.push(`${where}: bad profiles [${req.profiles.join(",")}]`);
			}
			if (req.testability === "untestable" && !req.untestableRationale?.trim()) {
				problems.push(`${where}: untestable without rationale`);
			}
			if (req.testability !== "testable" && req.testability !== "untestable") {
				problems.push(`${where}: bad testability`);
			}
		}
	}
	return problems;
}
```

`test/compliance/catalog/index.ts`:

```ts
import type { CatalogModule } from "./types";

// Modules are added as catalog extraction lands (rfc3501 etc. in Task 9).
export const allCatalogModules: CatalogModule[] = [];

export function findRequirement(id: string) {
	for (const mod of allCatalogModules) {
		const req = mod.requirements.find((r) => r.id === id);
		if (req) return req;
	}
	return undefined;
}
```

- [ ] **Step 4: Run tests**

Run: `yarn test:compliance`
Expected: schema test PASSES, "at least one module" test FAILS — that is correct and stays red until Task 9. Mark it `test.todo`-style? No — change it now to be introduced in Task 9 instead: **delete the second test** from the file before committing (the first test is the meta-test; module presence is asserted in Task 9's step). Final committed file contains only the schema-validation test.

Run again: `yarn test:compliance`
Expected: PASS (1 catalog test + smoke).

- [ ] **Step 5: Commit**

```bash
git add test/compliance/catalog test/compliance/specs
git commit -m "🗂 Add Requirement Catalog Schema + Meta-Test"
```

---

## Task 3: ScriptedServer core (plain TCP)

**Files:**
- Create: `test/compliance/harness/transcript.ts`
- Create: `test/compliance/harness/script.ts`
- Create: `test/compliance/harness/scripted-server.ts`
- Test: `test/compliance/harness/__tests__/scripted-server.test.ts`
- Delete: `test/compliance/harness/__tests__/smoke.test.ts`

The harness is machinery, so it gets ordinary TDD unit self-tests driven by **raw sockets** (`net.Socket`), never the IMAP client.

- [ ] **Step 1: Write failing self-tests**

`test/compliance/harness/__tests__/scripted-server.test.ts`:

```ts
import * as net from "node:net";
import { afterEach, expect, test } from "vitest";

import { command } from "../matchers";
import { close, expectLine, send } from "../script";
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

function collect(sock: net.Socket): { data: () => string } {
	let buf = "";
	sock.on("data", (d) => (buf += d.toString("utf8")));
	return { data: () => buf };
}

test("sends greeting and matches an expected command line", async () => {
	server = await ScriptedServer.start();
	server.arm([
		[
			send("* OK ready\r\n"),
			expectLine(command("CAPABILITY")),
			send("* CAPABILITY IMAP4rev1\r\na1 OK done\r\n"),
			close(),
		],
	]);
	const sock = await rawConnect(server.port);
	const rx = collect(sock);
	sock.write("a1 CAPABILITY\r\n");
	const outcome = await server.outcome();
	expect(outcome.ok).toBe(true);
	await new Promise((r) => sock.once("close", r));
	expect(rx.data()).toContain("* OK ready\r\n");
	expect(rx.data()).toContain("a1 OK done\r\n");
});

test("chunked send splits bytes across writes", async () => {
	server = await ScriptedServer.start();
	server.arm([[send("* OK split-greeting\r\n", { chunks: [4, 7] }), close()]]);
	const sock = await rawConnect(server.port);
	const rx = collect(sock);
	await server.outcome();
	await new Promise((r) => sock.once("close", r));
	expect(rx.data()).toBe("* OK split-greeting\r\n");
});

test("fails the script when an unexpected line arrives", async () => {
	server = await ScriptedServer.start();
	server.arm([[send("* OK ready\r\n"), expectLine(command("CAPABILITY"))]]);
	const sock = await rawConnect(server.port);
	sock.write("a1 NOOP\r\n");
	const outcome = await server.outcome();
	expect(outcome.ok).toBe(false);
	expect(outcome.reason).toContain("NOOP");
	sock.destroy();
});

test("fails with timeout when expected line never arrives", async () => {
	server = await ScriptedServer.start({ stepTimeoutMs: 200 });
	server.arm([[send("* OK ready\r\n"), expectLine(command("CAPABILITY"))]]);
	const sock = await rawConnect(server.port);
	const outcome = await server.outcome();
	expect(outcome.ok).toBe(false);
	expect(outcome.reason).toContain("timed out");
	sock.destroy();
});

test("records a transcript of both directions", async () => {
	server = await ScriptedServer.start();
	server.arm([[send("* OK ready\r\n"), expectLine(command("CAPABILITY")), close()]]);
	const sock = await rawConnect(server.port);
	sock.write("a1 CAPABILITY\r\n");
	await server.outcome();
	const text = server.transcript.format();
	expect(text).toContain("S: * OK ready\\r\\n");
	expect(text).toContain("C: a1 CAPABILITY\\r\\n");
	sock.destroy();
});

test("runs multiple sequential connection scripts", async () => {
	server = await ScriptedServer.start();
	server.arm([
		[send("* OK first\r\n"), close()],
		[send("* OK second\r\n"), close()],
	]);
	const s1 = await rawConnect(server.port);
	const r1 = collect(s1);
	await new Promise((r) => s1.once("close", r));
	const s2 = await rawConnect(server.port);
	const r2 = collect(s2);
	await new Promise((r) => s2.once("close", r));
	expect(r1.data()).toBe("* OK first\r\n");
	expect(r2.data()).toBe("* OK second\r\n");
	expect((await server.outcome()).ok).toBe(true);
});
```

(`command` from `../matchers` doesn't exist yet — Task 4 implements the real matcher logic; for THIS task create the minimal version below so these tests compile and pass. Task 4 extends it without changing this call shape.)

- [ ] **Step 2: Run to verify failure**

Run: `yarn test:compliance`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement transcript, script steps, minimal matcher, server**

`test/compliance/harness/transcript.ts`:

```ts
export type Direction = "S" | "C" | "!";

export interface TranscriptEntry {
	at: number;
	dir: Direction;
	data: string;
}

function printable(data: string): string {
	return data
		.replace(/\\/g, "\\\\")
		.replace(/\r/g, "\\r")
		.replace(/\n/g, "\\n")
		// eslint-disable-next-line no-control-regex
		.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, (c) => {
			return `\\x${c.charCodeAt(0).toString(16).padStart(2, "0")}`;
		});
}

export class Transcript {
	private entries: TranscriptEntry[] = [];
	private epoch = Date.now();

	public record(dir: Direction, data: Buffer | string): void {
		this.entries.push({
			at: Date.now() - this.epoch,
			dir,
			data: typeof data === "string" ? data : data.toString("latin1"),
		});
	}

	public format(): string {
		if (!this.entries.length) return "(empty transcript)";
		return this.entries
			.map((e) => `[+${e.at}ms] ${e.dir}: ${printable(e.data)}`)
			.join("\n");
	}
}
```

`test/compliance/harness/script.ts`:

```ts
import type { LineMatcher } from "./matchers";

export type ScriptStep =
	| { kind: "send"; data: string | Buffer; chunks?: number[]; delayMs?: number }
	| { kind: "expect"; matcher: LineMatcher }
	| { kind: "startTls" }
	| { kind: "close" };

export function send(
	data: string | Buffer,
	opts: { chunks?: number[]; delayMs?: number } = {},
): ScriptStep {
	return { kind: "send", data, ...opts };
}

export function expectLine(matcher: LineMatcher): ScriptStep {
	return { kind: "expect", matcher };
}

export function startTls(): ScriptStep {
	return { kind: "startTls" };
}

export function close(): ScriptStep {
	return { kind: "close" };
}
```

`test/compliance/harness/matchers.ts` (minimal for this task; Task 4 completes it):

```ts
export interface MatchResult {
	ok: boolean;
	reason?: string;
	/** The command tag, when the matcher parsed one. */
	tag?: string;
}

export interface LineMatcher {
	description: string;
	/** `line` excludes the trailing CRLF. */
	match(line: string): MatchResult;
}

/**
 * Matches `<tag> SP <verb>` with optional arguments. Verb match is
 * case-insensitive (IMAP commands are case-insensitive).
 */
export function command(
	verb: string,
	opts: { args?: RegExp | string | null } = {},
): LineMatcher {
	return {
		description: `command ${verb}`,
		match(line: string): MatchResult {
			const m = /^(\S+) (\S+)(?: (.*))?$/.exec(line);
			if (!m) return { ok: false, reason: `not a command line: '${line}'` };
			const [, tag, gotVerb, rest = ""] = m;
			if (gotVerb.toUpperCase() !== verb.toUpperCase()) {
				return { ok: false, reason: `expected ${verb}, got ${gotVerb}`, tag };
			}
			if (opts.args === null && rest !== "") {
				return { ok: false, reason: `expected no arguments, got '${rest}'`, tag };
			}
			if (typeof opts.args === "string" && rest !== opts.args) {
				return { ok: false, reason: `args '${rest}' != '${opts.args}'`, tag };
			}
			if (opts.args instanceof RegExp && !opts.args.test(rest)) {
				return { ok: false, reason: `args '${rest}' !~ ${opts.args}`, tag };
			}
			return { ok: true, tag };
		},
	};
}
```

`test/compliance/harness/scripted-server.ts`:

```ts
import * as net from "node:net";
import * as tls from "node:tls";

import type { ScriptStep } from "./script";
import { Transcript } from "./transcript";

export interface ServerOptions {
	/** Wrap every connection in TLS from the first byte. */
	tlsImplicit?: { key: Buffer; cert: Buffer };
	/** Cert used when a script performs a startTls upgrade step. */
	tlsUpgrade?: { key: Buffer; cert: Buffer };
	stepTimeoutMs?: number;
}

export interface Outcome {
	ok: boolean;
	reason?: string;
}

const DEFAULT_STEP_TIMEOUT = 2000;

class ConnectionRunner {
	private buffer = Buffer.alloc(0);
	private stepIndex = 0;
	private waiting?: {
		resolveLine: (line: string) => void;
		timer: NodeJS.Timeout;
	};

	constructor(
		private socket: net.Socket | tls.TLSSocket,
		private readonly steps: ScriptStep[],
		private readonly server: ScriptedServer,
		private readonly opts: Required<Pick<ServerOptions, "stepTimeoutMs">> &
			Pick<ServerOptions, "tlsUpgrade">,
	) {}

	public async run(): Promise<void> {
		this.attach(this.socket);
		try {
			for (this.stepIndex = 0; this.stepIndex < this.steps.length; this.stepIndex++) {
				const step = this.steps[this.stepIndex];
				switch (step.kind) {
					case "send":
						await this.doSend(step);
						break;
					case "expect":
						await this.doExpect(step);
						break;
					case "startTls":
						await this.doStartTls();
						break;
					case "close":
						this.socket.end();
						await new Promise<void>((r) => this.socket.once("close", () => r()));
						break;
				}
			}
			this.server.scriptFinished();
		} catch (err) {
			this.server.scriptFailed(
				err instanceof Error ? err.message : String(err),
			);
			this.socket.destroy();
		}
	}

	private attach(socket: net.Socket | tls.TLSSocket): void {
		this.socket = socket;
		socket.on("data", (data: Buffer) => {
			this.server.transcript.record("C", data);
			this.buffer = Buffer.concat([this.buffer, data]);
			this.drainLines();
		});
	}

	private drainLines(): void {
		if (!this.waiting) return;
		const idx = this.buffer.indexOf("\r\n");
		if (idx === -1) {
			// A bare LF without CR is a protocol violation worth failing fast on.
			const lf = this.buffer.indexOf("\n");
			if (lf !== -1) {
				const w = this.waiting;
				this.waiting = undefined;
				clearTimeout(w.timer);
				this.server.scriptFailed(
					`client sent a line terminated by bare LF (commands MUST end with CRLF): '${this.buffer
						.toString("latin1")
						.slice(0, lf)}'`,
				);
				this.socket.destroy();
			}
			return;
		}
		const line = this.buffer.subarray(0, idx).toString("latin1");
		this.buffer = this.buffer.subarray(idx + 2);
		const w = this.waiting;
		this.waiting = undefined;
		clearTimeout(w.timer);
		w.resolveLine(line);
	}

	private nextLine(description: string): Promise<string> {
		return new Promise<string>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.waiting = undefined;
				reject(
					new Error(
						`timed out after ${this.opts.stepTimeoutMs}ms waiting for: ${description}`,
					),
				);
			}, this.opts.stepTimeoutMs);
			this.waiting = { resolveLine: resolve, timer };
			this.drainLines();
		});
	}

	private async doSend(step: Extract<ScriptStep, { kind: "send" }>): Promise<void> {
		const data =
			typeof step.data === "string" ? Buffer.from(step.data, "latin1") : step.data;
		if (step.delayMs) await delay(step.delayMs);
		const chunks = step.chunks ?? [data.length];
		let offset = 0;
		for (const len of chunks) {
			const chunk = data.subarray(offset, offset + len);
			offset += len;
			this.server.transcript.record("S", chunk);
			this.socket.write(chunk);
			await delay(1); // force separate packets
		}
		if (offset < data.length) {
			const rest = data.subarray(offset);
			this.server.transcript.record("S", rest);
			this.socket.write(rest);
		}
	}

	private async doExpect(
		step: Extract<ScriptStep, { kind: "expect" }>,
	): Promise<void> {
		const line = await this.nextLine(step.matcher.description);
		const result = step.matcher.match(line);
		if (result.tag) this.server.commandTags.push(result.tag);
		if (!result.ok) {
			throw new Error(
				`expectation '${step.matcher.description}' failed: ${result.reason}`,
			);
		}
	}

	private async doStartTls(): Promise<void> {
		if (!this.opts.tlsUpgrade) {
			throw new Error("script has a startTls step but no tlsUpgrade cert configured");
		}
		if (this.buffer.length > 0) {
			throw new Error(
				`client sent ${this.buffer.length} plaintext byte(s) after the STARTTLS OK ` +
					`but before the TLS handshake (negotiation begins immediately after the CRLF)`,
			);
		}
		const plain = this.socket;
		plain.removeAllListeners("data");
		this.server.transcript.record("!", "<TLS handshake (server side)>");
		const secured = await new Promise<tls.TLSSocket>((resolve, reject) => {
			const t = new tls.TLSSocket(plain, {
				isServer: true,
				key: this.opts.tlsUpgrade!.key,
				cert: this.opts.tlsUpgrade!.cert,
			});
			t.once("secure", () => resolve(t));
			t.once("error", reject);
		});
		this.buffer = Buffer.alloc(0);
		this.attach(secured);
	}
}

function delay(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

export class ScriptedServer {
	public readonly transcript = new Transcript();
	/** Tags of every command line matched by an expect step, in order. */
	public readonly commandTags: string[] = [];

	private netServer!: net.Server;
	private scripts: ScriptStep[][] = [];
	private scriptsStarted = 0;
	private scriptsFinished = 0;
	private failure?: string;
	private outcomeResolvers: Array<(o: Outcome) => void> = [];
	private sockets = new Set<net.Socket>();

	private constructor(private readonly opts: ServerOptions) {}

	public static async start(opts: ServerOptions = {}): Promise<ScriptedServer> {
		const server = new ScriptedServer(opts);
		await server.listen();
		return server;
	}

	public get port(): number {
		return (this.netServer.address() as net.AddressInfo).port;
	}

	public arm(connectionScripts: ScriptStep[][]): void {
		this.scripts = connectionScripts;
		this.scriptsStarted = 0;
		this.scriptsFinished = 0;
		this.failure = undefined;
	}

	public outcome(): Promise<Outcome> {
		if (this.isSettled()) return Promise.resolve(this.currentOutcome());
		return new Promise((resolve) => this.outcomeResolvers.push(resolve));
	}

	public async assertCompleted(): Promise<void> {
		const o = await this.outcome();
		if (!o.ok) {
			throw new Error(
				`ScriptedServer script failed: ${o.reason}\n--- transcript ---\n${this.transcript.format()}`,
			);
		}
	}

	public async close(): Promise<void> {
		for (const s of this.sockets) s.destroy();
		await new Promise<void>((r) => this.netServer.close(() => r()));
	}

	/** @internal */
	public scriptFinished(): void {
		this.scriptsFinished++;
		this.settleIfDone();
	}

	/** @internal */
	public scriptFailed(reason: string): void {
		if (!this.failure) this.failure = reason;
		this.transcript.record("!", `FAIL: ${reason}`);
		this.settleIfDone();
	}

	private listen(): Promise<void> {
		const onConnection = (socket: net.Socket) => {
			this.sockets.add(socket);
			socket.on("close", () => this.sockets.delete(socket));
			socket.on("error", () => {
				/* raw resets after destroy are fine */
			});
			const script = this.scripts[this.scriptsStarted];
			if (!script) {
				this.scriptFailed(
					`unexpected connection #${this.scriptsStarted + 1}: no script armed for it`,
				);
				socket.destroy();
				return;
			}
			this.scriptsStarted++;
			const runner = new ConnectionRunner(socket, script, this, {
				stepTimeoutMs: this.opts.stepTimeoutMs ?? DEFAULT_STEP_TIMEOUT,
				tlsUpgrade: this.opts.tlsUpgrade,
			});
			void runner.run();
		};

		if (this.opts.tlsImplicit) {
			this.netServer = tls.createServer(
				{ key: this.opts.tlsImplicit.key, cert: this.opts.tlsImplicit.cert },
				onConnection,
			);
		} else {
			this.netServer = net.createServer(onConnection);
		}
		return new Promise<void>((resolve) => {
			this.netServer.listen(0, "127.0.0.1", () => resolve());
		});
	}

	private isSettled(): boolean {
		return (
			this.failure !== undefined ||
			(this.scripts.length > 0 && this.scriptsFinished === this.scripts.length)
		);
	}

	private currentOutcome(): Outcome {
		return this.failure ? { ok: false, reason: this.failure } : { ok: true };
	}

	private settleIfDone(): void {
		if (!this.isSettled()) return;
		const o = this.currentOutcome();
		const resolvers = this.outcomeResolvers;
		this.outcomeResolvers = [];
		for (const r of resolvers) r(o);
	}
}
```

Delete `test/compliance/harness/__tests__/smoke.test.ts`.

- [ ] **Step 4: Run tests**

Run: `yarn test:compliance`
Expected: all scripted-server self-tests + catalog meta-test PASS.

- [ ] **Step 5: Commit**

```bash
git add -A test/compliance/harness
git commit -m "🎭 ScriptedServer Harness Core (TCP, Chunking, Transcript)"
```

(`git add -A` also stages the smoke-test deletion.)

---

## Task 4: Grammar matchers + ambient checks

**Files:**
- Modify: `test/compliance/harness/matchers.ts`
- Test: `test/compliance/harness/__tests__/matchers.test.ts`

- [ ] **Step 1: Write failing tests**

`test/compliance/harness/__tests__/matchers.test.ts`:

```ts
import { describe, expect, test } from "vitest";

import { command, isValidTag } from "../matchers";

describe("isValidTag", () => {
	test.each(["a1", "A0001", "abc.def", "]tag", "~tag", "123"])(
		"accepts valid tag '%s'",
		(tag) => {
			expect(isValidTag(tag)).toBe(true);
		},
	);

	// tag = 1*<ASTRING-CHAR except '+'>; ASTRING-CHAR excludes
	// ( ) { SP CTL % * DQUOTE \  — but ']' IS allowed.
	test.each(["", "a+1", "a 1", "a(1", "a)1", "a{1", "a%1", "a*1", 'a"1', "a\\1", "a\x011", "ä1"])(
		"rejects invalid tag '%s'",
		(tag) => {
			expect(isValidTag(tag)).toBe(false);
		},
	);
});

describe("command matcher", () => {
	test("accepts case-insensitive verb and captures tag", () => {
		const r = command("CAPABILITY", { args: null }).match("a1 capability");
		expect(r.ok).toBe(true);
		expect(r.tag).toBe("a1");
	});

	test("rejects invalid tag syntax", () => {
		const r = command("CAPABILITY").match("a+1 CAPABILITY");
		expect(r.ok).toBe(false);
		expect(r.reason).toContain("tag");
	});

	test("rejects extraneous arguments when args: null", () => {
		const r = command("CAPABILITY", { args: null }).match("a1 CAPABILITY foo");
		expect(r.ok).toBe(false);
	});

	test("rejects trailing whitespace (strict syntax)", () => {
		const r = command("CAPABILITY", { args: null }).match("a1 CAPABILITY ");
		expect(r.ok).toBe(false);
	});

	test("matches argument regex", () => {
		const r = command("ID", { args: /^(NIL|\(.*\))$/ }).match('a2 ID ("name" "x")');
		expect(r.ok).toBe(true);
	});

	test("anyCommand-style matching via verb regex argument", () => {
		const r = command(/^(CAPABILITY|NOOP)$/).match("x9 NOOP");
		expect(r.ok).toBe(true);
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `yarn test:compliance`
Expected: FAIL — `isValidTag` not exported; regex-verb overload missing.

- [ ] **Step 3: Extend matchers.ts**

Replace the body of `test/compliance/harness/matchers.ts` with:

```ts
export interface MatchResult {
	ok: boolean;
	reason?: string;
	tag?: string;
}

export interface LineMatcher {
	description: string;
	/** `line` excludes the trailing CRLF. */
	match(line: string): MatchResult;
}

/**
 * RFC 3501 §9: tag = 1*<any ASTRING-CHAR except "+">
 * ASTRING-CHAR = ATOM-CHAR / resp-specials(']')
 * ATOM-CHAR excludes: ( ) { SP CTL % * DQUOTE \ ]   (then ']' re-allowed)
 * All chars must be 7-bit printable ASCII.
 */
export function isValidTag(tag: string): boolean {
	if (!tag.length) return false;
	// eslint-disable-next-line no-control-regex
	return /^[\x21-\x7e]+$/.test(tag) && !/[(){%*"\\+ ]/.test(tag);
}

/**
 * Matches `<tag> SP <verb>[ SP <args>]`. Verb is case-insensitive; pass a
 * RegExp verb to match alternatives. Tag syntax is always validated.
 *
 * args:
 *  - undefined  → any args (or none) accepted
 *  - null       → no args allowed
 *  - string     → exact args match
 *  - RegExp     → args must match
 */
export function command(
	verb: string | RegExp,
	opts: { args?: RegExp | string | null } = {},
): LineMatcher {
	const verbDesc = typeof verb === "string" ? verb : String(verb);
	return {
		description: `command ${verbDesc}`,
		match(line: string): MatchResult {
			if (/\s$/.test(line)) {
				return {
					ok: false,
					reason: `trailing whitespace (strict syntax violation): '${line}'`,
				};
			}
			const m = /^(\S+) (\S+)(?: (.+))?$/.exec(line);
			if (!m) return { ok: false, reason: `not a command line: '${line}'` };
			const [, tag, gotVerb, rest = ""] = m;
			if (!isValidTag(tag)) {
				return { ok: false, reason: `invalid tag syntax: '${tag}'` };
			}
			const verbOk =
				typeof verb === "string"
					? gotVerb.toUpperCase() === verb.toUpperCase()
					: verb.test(gotVerb.toUpperCase());
			if (!verbOk) {
				return { ok: false, reason: `expected ${verbDesc}, got ${gotVerb}`, tag };
			}
			if (opts.args === null && rest !== "") {
				return { ok: false, reason: `expected no arguments, got '${rest}'`, tag };
			}
			if (typeof opts.args === "string" && rest !== opts.args) {
				return { ok: false, reason: `args '${rest}' != '${opts.args}'`, tag };
			}
			if (opts.args instanceof RegExp && !opts.args.test(rest)) {
				return { ok: false, reason: `args '${rest}' !~ ${opts.args}`, tag };
			}
			return { ok: true, tag };
		},
	};
}
```

- [ ] **Step 4: Run tests**

Run: `yarn test:compliance`
Expected: PASS (including Task 3's tests — call shape unchanged).

- [ ] **Step 5: Commit**

```bash
git add test/compliance/harness
git commit -m "🔍 Command Matchers + Tag Grammar Validation"
```

---

## Task 5: TLS — cert fixtures, implicit TLS, STARTTLS upgrade

**Files:**
- Create: `test/compliance/harness/certs/generate.sh` (+ generated `localhost-key.pem`, `localhost-cert.pem`, `wrong-host-key.pem`, `wrong-host-cert.pem`)
- Create: `test/compliance/harness/tls.ts`
- Test: `test/compliance/harness/__tests__/tls.test.ts`

The **expired** cert fixture is intentionally deferred to Phase 3 (first needed by cert-expiry tests there); the generate script notes this.

- [ ] **Step 1: Create the generation script and generate fixtures**

`test/compliance/harness/certs/generate.sh`:

```bash
#!/usr/bin/env bash
# Regenerates the committed TLS fixtures. Requires OpenSSL 3.x.
# The expired-cert fixture is added in Phase 3 (needs openssl req -not_before/-not_after, OpenSSL >= 3.4).
set -euo pipefail
cd "$(dirname "$0")"

openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 36500 \
  -keyout localhost-key.pem -out localhost-cert.pem \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"

openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 36500 \
  -keyout wrong-host-key.pem -out wrong-host-cert.pem \
  -subj "/CN=wrong.example.test" \
  -addext "subjectAltName=DNS:wrong.example.test"

echo "Done. Commit the regenerated PEM files."
```

Run (Bash tool): `bash test/compliance/harness/certs/generate.sh`
Expected: four `.pem` files created. Verify: `openssl x509 -in test/compliance/harness/certs/localhost-cert.pem -noout -ext subjectAltName` shows `DNS:localhost, IP Address:127.0.0.1`.
(If openssl is missing on this machine, it ships with Git for Windows: `"C:\Program Files\Git\usr\bin\openssl.exe"` — the Bash tool has it on PATH.)

- [ ] **Step 2: Write failing TLS self-tests**

`test/compliance/harness/__tests__/tls.test.ts`:

```ts
import * as tls from "node:tls";
import { afterEach, expect, test } from "vitest";

import { loadCertFixture } from "../tls";
import { close, expectLine, send, startTls } from "../script";
import { command } from "../matchers";
import { ScriptedServer } from "../scripted-server";

let server: ScriptedServer | undefined;
afterEach(async () => {
	await server?.close();
	server = undefined;
});

function tlsConnect(port: number, ca: Buffer): Promise<tls.TLSSocket> {
	return new Promise((resolve, reject) => {
		const sock = tls.connect(
			{ host: "127.0.0.1", port, ca: [ca], servername: "localhost" },
			() => resolve(sock),
		);
		sock.once("error", reject);
	});
}

test("implicit TLS server accepts a trusting client", async () => {
	const fixture = loadCertFixture("localhost");
	server = await ScriptedServer.start({ tlsImplicit: fixture });
	server.arm([[send("* OK secure\r\n"), close()]]);
	const sock = await tlsConnect(server.port, fixture.cert);
	let buf = "";
	sock.on("data", (d) => (buf += d.toString("utf8")));
	await server.outcome();
	await new Promise((r) => sock.once("close", r));
	expect(buf).toBe("* OK secure\r\n");
});

test("startTls step upgrades mid-connection", async () => {
	const fixture = loadCertFixture("localhost");
	server = await ScriptedServer.start({ tlsUpgrade: fixture });
	server.arm([
		[
			send("* OK ready\r\n"),
			expectLine(command("STARTTLS", { args: null })),
			send("a1 OK begin TLS\r\n"),
			startTls(),
			expectLine(command("CAPABILITY")),
			send("* CAPABILITY IMAP4rev1\r\na2 OK done\r\n"),
			close(),
		],
	]);

	const net = await import("node:net");
	const plain = net.connect({ host: "127.0.0.1", port: server.port });
	await new Promise((r) => plain.once("connect", r));
	await new Promise((r) => plain.once("data", r)); // greeting
	plain.write("a1 STARTTLS\r\n");
	await new Promise((r) => plain.once("data", r)); // OK
	const secured = tls.connect({
		socket: plain,
		ca: [fixture.cert],
		servername: "localhost",
	});
	await new Promise((r) => secured.once("secureConnect", r));
	secured.write("a2 CAPABILITY\r\n");
	await server.assertCompleted();
	secured.destroy();
});
```

- [ ] **Step 3: Run to verify failure**

Run: `yarn test:compliance`
Expected: FAIL — `../tls` not found.

- [ ] **Step 4: Implement tls.ts**

`test/compliance/harness/tls.ts`:

```ts
import * as fs from "node:fs";
import * as path from "node:path";

export interface CertFixture {
	key: Buffer;
	cert: Buffer;
}

const CERT_DIR = path.join(__dirname, "certs");

/** name: 'localhost' | 'wrong-host' (expired lands in Phase 3) */
export function loadCertFixture(name: "localhost" | "wrong-host"): CertFixture {
	return {
		key: fs.readFileSync(path.join(CERT_DIR, `${name}-key.pem`)),
		cert: fs.readFileSync(path.join(CERT_DIR, `${name}-cert.pem`)),
	};
}
```

(`__dirname` is unavailable in ESM transform contexts; if vitest reports it undefined, use `path.dirname(fileURLToPath(import.meta.url))` as in vitest.config.ts.)

- [ ] **Step 5: Run tests**

Run: `yarn test:compliance`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add test/compliance/harness
git commit -m "🔐 TLS Cert Fixtures + Implicit/Upgrade Support"
```

---

## Task 6: Driver adapter

**Files:**
- Create: `test/compliance/driver/errors.ts`
- Create: `test/compliance/driver/driver.ts`
- Test: `test/compliance/driver/__tests__/driver.test.ts`

The driver contains **zero protocol logic** — it only translates calls/observations between tests and the public API (`src/index.ts`). It imports nothing else from `src/`.

- [ ] **Step 1: Write failing tests**

`test/compliance/driver/__tests__/driver.test.ts`:

```ts
import { afterEach, expect, test } from "vitest";

import { ComplianceDriver } from "../driver";
import { NotImplementedError } from "../errors";
import { close, expectLine, send } from "../../harness/script";
import { command } from "../../harness/matchers";
import { ScriptedServer } from "../../harness/scripted-server";

let server: ScriptedServer | undefined;
let driver: ComplianceDriver | undefined;
afterEach(async () => {
	await driver?.end();
	await server?.close();
	server = undefined;
	driver = undefined;
});

test("connect() drives Session.start against the scripted server", async () => {
	server = await ScriptedServer.start();
	server.arm([
		[
			send("* OK ready\r\n"),
			expectLine(command("CAPABILITY", { args: null })),
			reply("OK done", ["* CAPABILITY IMAP4rev1"]),
		],
	]);
	driver = new ComplianceDriver();
	const connected = await driver.connect({
		host: "127.0.0.1",
		port: server.port,
		security: "none",
	});
	expect(connected).toBe(true);
	expect(driver.hasCapability("IMAP4rev1")).toBe(true);
	await server.assertCompleted();
});

test("unimplemented verbs throw NotImplementedError", async () => {
	driver = new ComplianceDriver();
	await expect(driver.noop()).rejects.toBeInstanceOf(NotImplementedError);
	await expect(driver.login("u", "p")).rejects.toBeInstanceOf(NotImplementedError);
	await expect(driver.select("INBOX")).rejects.toBeInstanceOf(NotImplementedError);
});
```

(Also import `reply` from `../../harness/script` in this test file.)

**Why the harness needs a new step kind:** tagged replies must echo the client's own tag, which the script can't know in advance — the client generates it. Add a *tagged-reply step* to `script.ts`:

```ts
export type ScriptStep =
	| { kind: "send"; data: string | Buffer; chunks?: number[]; delayMs?: number }
	| { kind: "expect"; matcher: LineMatcher }
	| { kind: "reply"; suffix: string; untagged?: string[] }
	| { kind: "startTls" }
	| { kind: "close" };

/**
 * Sends optional untagged lines then `<tag-of-last-matched-command> SP suffix CRLF`.
 * e.g. reply("OK CAPABILITY completed", ["* CAPABILITY IMAP4rev1"])
 */
export function reply(suffix: string, untagged: string[] = []): ScriptStep {
	return { kind: "reply", suffix, untagged };
}
```

And in `scripted-server.ts` `ConnectionRunner`: track `lastTag` (set in `doExpect` from `result.tag`), and handle the `reply` kind:

```ts
case "reply": {
	if (this.lastTag === undefined) {
		throw new Error("reply step used before any command was matched");
	}
	const lines = [...(step.untagged ?? []), `${this.lastTag} ${step.suffix}`]
		.map((l) => `${l}\r\n`)
		.join("");
	await this.doSend({ kind: "send", data: lines });
	break;
}
```

- [ ] **Step 2: Run to verify failure**

Run: `yarn test:compliance`
Expected: FAIL — driver modules missing; `reply` missing.

- [ ] **Step 3: Implement harness `reply` step, then the driver**

Apply the `script.ts` / `scripted-server.ts` extensions shown above (add `private lastTag?: string;` to `ConnectionRunner`, set it in `doExpect` whenever `result.tag` is present).

`test/compliance/driver/errors.ts`:

```ts
/** The client's public API offers no way to perform this operation. */
export class NotImplementedError extends Error {
	constructor(operation: string) {
		super(`Client public API has no support for: ${operation}`);
		this.name = "NotImplementedError";
	}
}
```

`test/compliance/driver/driver.ts`:

```ts
import * as tls from "node:tls";

// The ONLY allowed client import in the entire compliance suite:
import { Connection, Session } from "../../../src/index";

import { NotImplementedError } from "./errors";

export interface DriverConnectOptions {
	host: string;
	port: number;
	/** 'none' = plain TCP; 'implicit' = TLS from byte 0; 'starttls' = upgrade. */
	security: "none" | "implicit" | "starttls";
	/** CA to trust (cert fixtures). Omit to exercise default verification. */
	ca?: Buffer;
	timeoutMs?: number;
	/** ID field/value pairs the consumer wants to send (RFC 2971). */
	id?: Record<string, string>;
}

export interface ObservedEvent {
	type: string;
	detail?: unknown;
}

/**
 * Thin adapter between compliance tests and the client's public API.
 * RULE: zero protocol logic — translate calls and observations only.
 */
export class ComplianceDriver {
	public readonly events: ObservedEvent[] = [];

	private session?: Session;
	private connection?: Connection;

	public async connect(opts: DriverConnectOptions): Promise<boolean> {
		this.session = new Session(this.toConfig(opts));
		return this.session.start();
	}

	/**
	 * Low-level connect using the public Connection class, capturing response
	 * events for observation-based tests (e.g., unsolicited data handling).
	 */
	public async connectLow(opts: DriverConnectOptions): Promise<boolean> {
		this.connection = new Connection(this.toConfig(opts));
		for (const ev of [
			"ready",
			"disconnected",
			"connectionError",
			"serverStatus",
			"untaggedResponse",
			"taggedResponse",
			"continueResponse",
			"unknownResponse",
		] as const) {
			this.connection.on(ev as never, ((detail: unknown) => {
				this.events.push({ type: ev, detail });
			}) as never);
		}
		return this.connection.connect();
	}

	public async end(): Promise<void> {
		await this.session?.end();
		await this.connection?.disconnect();
		this.session = undefined;
		this.connection = undefined;
	}

	public get active(): boolean {
		return this.session?.active ?? this.connection?.isActive ?? false;
	}

	public get authenticated(): boolean {
		return this.session?.authenticated ?? false;
	}

	public get secure(): boolean {
		return this.connection?.isSecure ?? false;
	}

	public hasCapability(name: string): boolean {
		const caps = this.session?.capabilities;
		return caps ? caps.has(name) : false;
	}

	public serverInfo(): Map<string, string> | null {
		return this.session?.server ?? null;
	}

	// ---- Verbs with no public API surface (yet) ----------------------------
	// Each throws NotImplementedError so compliance tests fail with the
	// 'unimplemented' annotation rather than a compile/type error.

	public async noop(): Promise<never> {
		throw new NotImplementedError("NOOP");
	}
	public async login(_user: string, _pass: string): Promise<never> {
		throw new NotImplementedError("LOGIN");
	}
	public async authenticate(_mechanism: string): Promise<never> {
		throw new NotImplementedError("AUTHENTICATE");
	}
	public async logout(): Promise<never> {
		throw new NotImplementedError("LOGOUT");
	}
	public async select(_mailbox: string): Promise<never> {
		throw new NotImplementedError("SELECT");
	}
	public async examine(_mailbox: string): Promise<never> {
		throw new NotImplementedError("EXAMINE");
	}
	public async create(_mailbox: string): Promise<never> {
		throw new NotImplementedError("CREATE");
	}
	public async delete(_mailbox: string): Promise<never> {
		throw new NotImplementedError("DELETE");
	}
	public async rename(_from: string, _to: string): Promise<never> {
		throw new NotImplementedError("RENAME");
	}
	public async subscribe(_mailbox: string): Promise<never> {
		throw new NotImplementedError("SUBSCRIBE");
	}
	public async unsubscribe(_mailbox: string): Promise<never> {
		throw new NotImplementedError("UNSUBSCRIBE");
	}
	public async list(_ref: string, _pattern: string): Promise<never> {
		throw new NotImplementedError("LIST");
	}
	public async lsub(_ref: string, _pattern: string): Promise<never> {
		throw new NotImplementedError("LSUB");
	}
	public async status(_mailbox: string, _items: string[]): Promise<never> {
		throw new NotImplementedError("STATUS");
	}
	public async append(_mailbox: string, _message: Buffer): Promise<never> {
		throw new NotImplementedError("APPEND");
	}
	public async check(): Promise<never> {
		throw new NotImplementedError("CHECK");
	}
	public async closeMailbox(): Promise<never> {
		throw new NotImplementedError("CLOSE");
	}
	public async expunge(): Promise<never> {
		throw new NotImplementedError("EXPUNGE");
	}
	public async search(_criteria: unknown): Promise<never> {
		throw new NotImplementedError("SEARCH");
	}
	public async fetch(_seq: string, _items: string[]): Promise<never> {
		throw new NotImplementedError("FETCH");
	}
	public async store(_seq: string, _action: string, _flags: string[]): Promise<never> {
		throw new NotImplementedError("STORE");
	}
	public async copy(_seq: string, _mailbox: string): Promise<never> {
		throw new NotImplementedError("COPY");
	}
	public async move(_seq: string, _mailbox: string): Promise<never> {
		throw new NotImplementedError("MOVE");
	}
	public async idle(): Promise<never> {
		throw new NotImplementedError("IDLE");
	}
	public async unselect(): Promise<never> {
		throw new NotImplementedError("UNSELECT");
	}
	public async enable(_capabilities: string[]): Promise<never> {
		throw new NotImplementedError("ENABLE");
	}
	public async namespace(): Promise<never> {
		throw new NotImplementedError("NAMESPACE");
	}

	// ------------------------------------------------------------------------

	private toConfig(opts: DriverConnectOptions) {
		const tlsSetting =
			opts.security === "implicit" ? "on" : opts.security === "starttls" ? "starttls" : "off";
		const tlsOptions: tls.ConnectionOptions | undefined = opts.ca
			? { ca: [opts.ca] }
			: undefined;
		return {
			host: opts.host,
			port: opts.port,
			tls: tlsSetting as never, // TLSSetting enum values are these exact strings
			tlsOptions,
			timeout: opts.timeoutMs ?? 3000,
			id: opts.id,
		};
	}
}
```

Note: `tls: tlsSetting as never` is the one tolerated cast — `TLSSetting` enum *values* are exactly `"on" | "starttls" | "opportunistic" | "off"` (see `src/connection/types.ts`), and the enum type itself is importable only via `src/connection/types` which is not part of the public entry. Keep the cast and this comment.

- [ ] **Step 4: Run tests**

Run: `yarn test:compliance`
Expected: PASS. If the `connect()` test hangs: Session.start also issues ID when the capability list includes `ID` — the script above advertises only `IMAP4rev1`, so no ID command is expected. Debug with `server.transcript.format()`.

- [ ] **Step 5: Commit**

```bash
git add test/compliance/driver test/compliance/harness
git commit -m "🧤 ComplianceDriver Adapter Over Public API"
```

---

## Task 7: Runner helpers (complianceTest, defineAcceptanceTable)

**Files:**
- Create: `test/compliance/runner/meta.ts`
- Create: `test/compliance/runner/compliance-test.ts`
- Create: `test/compliance/runner/acceptance-table.ts`
- Test: `test/compliance/runner/__tests__/runner.test.ts`

- [ ] **Step 1: Write failing tests**

`test/compliance/runner/__tests__/runner.test.ts`:

```ts
// Verifies the helpers register vitest tests with compliance meta attached.
// Meta is asserted indirectly: the wrapper writes to task.meta, which the
// test can read back from its own context.
import { describe, expect } from "vitest";

import { complianceTest } from "../compliance-test";
import { defineAcceptanceTable } from "../acceptance-table";
import { NotImplementedError } from "../../driver/errors";

describe("complianceTest", () => {
	complianceTest(
		{ reqs: ["RFC0000-0.0-1"], profiles: ["rev1"], title: "attaches meta" },
		async (ctx) => {
			expect(ctx.task.meta.compliance?.reqs).toEqual(["RFC0000-0.0-1"]);
			expect(ctx.task.meta.compliance?.profile).toBe("rev1");
			expect(ctx.profile).toBe("rev1");
		},
	);

	complianceTest(
		{
			reqs: ["RFC0000-0.0-2"],
			profiles: ["rev1", "rev2"],
			title: "runs once per profile",
		},
		async (ctx) => {
			expect(["rev1", "rev2"]).toContain(ctx.profile);
		},
	);

	complianceTest(
		{
			reqs: ["RFC0000-0.0-3"],
			profiles: ["rev1"],
			title: "tags NotImplementedError as unimplemented",
			expectFailure: "unimplemented",
		},
		async (ctx) => {
			try {
				throw new NotImplementedError("DEMO");
			} catch (err) {
				// The wrapper re-tags and re-throws; here we just verify the
				// classification helper directly.
				expect(err).toBeInstanceOf(NotImplementedError);
				ctx.task.meta.compliance!.failureKind = "unimplemented";
			}
		},
	);
});

describe("defineAcceptanceTable", () => {
	defineAcceptanceTable({
		name: "demo table",
		profiles: ["rev1"],
		rows: [
			{ req: "RFC0000-0.0-4", variant: "row one", value: 1 },
			{ req: "RFC0000-0.0-5", variant: "row two", value: 2 },
		],
		async execute(row, ctx) {
			expect(row.value).toBeGreaterThan(0);
			expect(ctx.profile).toBe("rev1");
		},
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `yarn test:compliance`
Expected: FAIL — runner modules missing.

- [ ] **Step 3: Implement the helpers**

`test/compliance/runner/meta.ts`:

```ts
import type { Profile } from "../catalog/types";

export type FailureKind = "violation" | "unimplemented";

export interface ComplianceMeta {
	reqs: string[];
	profile: Profile;
	failureKind?: FailureKind;
}

declare module "vitest" {
	interface TaskMeta {
		compliance?: ComplianceMeta;
	}
}
```

`test/compliance/runner/compliance-test.ts`:

```ts
import { test, type TestContext } from "vitest";

import type { Profile } from "../catalog/types";
import { NotImplementedError } from "../driver/errors";
import type { FailureKind } from "./meta";
import "./meta";

export interface ComplianceTestInfo {
	reqs: string[];
	profiles: Profile[];
	title: string;
	/**
	 * Documentation-only hint used by spec authors when a test is known to
	 * fail for a stated reason today; it does not change behavior.
	 */
	expectFailure?: FailureKind;
}

export type ComplianceContext = TestContext & { profile: Profile };

export function complianceTest(
	info: ComplianceTestInfo,
	fn: (ctx: ComplianceContext) => Promise<void>,
): void {
	for (const profile of info.profiles) {
		test(`[${info.reqs.join(" ")}] [${profile}] ${info.title}`, async (tctx) => {
			tctx.task.meta.compliance = { reqs: [...info.reqs], profile };
			try {
				await fn(Object.assign(tctx, { profile }) as ComplianceContext);
			} catch (err) {
				tctx.task.meta.compliance.failureKind =
					err instanceof NotImplementedError ? "unimplemented" : "violation";
				throw err;
			}
		});
	}
}
```

`test/compliance/runner/acceptance-table.ts`:

```ts
import { test } from "vitest";

import type { Profile } from "../catalog/types";
import { NotImplementedError } from "../driver/errors";
import "./meta";

export interface AcceptanceRowBase {
	req: string;
	variant: string;
}

export interface AcceptanceTable<R extends AcceptanceRowBase> {
	name: string;
	profiles: Profile[];
	rows: R[];
	execute(row: R, ctx: { profile: Profile }): Promise<void>;
}

export function defineAcceptanceTable<R extends AcceptanceRowBase>(
	table: AcceptanceTable<R>,
): void {
	for (const row of table.rows) {
		for (const profile of table.profiles) {
			test(`[${row.req}] [${profile}] ${table.name}: ${row.variant}`, async (tctx) => {
				tctx.task.meta.compliance = { reqs: [row.req], profile };
				try {
					await table.execute(row, { profile });
				} catch (err) {
					tctx.task.meta.compliance.failureKind =
						err instanceof NotImplementedError ? "unimplemented" : "violation";
					throw err;
				}
			});
		}
	}
}
```

- [ ] **Step 4: Run tests**

Run: `yarn test:compliance`
Expected: PASS (1 + 2 + 1 complianceTest instances, 2 table rows).

- [ ] **Step 5: Commit**

```bash
git add test/compliance/runner
git commit -m "🏃 complianceTest + defineAcceptanceTable Runner Helpers"
```

---

## Task 8: Reporter (aggregate → console/JSON/Markdown)

**Files:**
- Create: `test/compliance/reporter/aggregate.ts`
- Create: `test/compliance/reporter/render.ts`
- Create: `test/compliance/reporter/compliance-reporter.ts`
- Test: `test/compliance/reporter/__tests__/aggregate.test.ts`
- Modify: `test/compliance/vitest.config.ts` (wire reporter)

- [ ] **Step 1: Write failing aggregate tests**

`test/compliance/reporter/__tests__/aggregate.test.ts`:

```ts
import { describe, expect, test } from "vitest";

import { aggregate, type TestRecord } from "../aggregate";
import type { CatalogModule } from "../../catalog/types";

const catalog: CatalogModule[] = [
	{
		source: "RFCTEST",
		extractionNote: "synthetic module for aggregate unit tests only",
		requirements: [
			{
				id: "RFCTEST-1.1-1",
				source: "RFCTEST",
				section: "1.1",
				title: "passing req",
				text: "The client MUST pass.",
				level: "MUST",
				applicability: "always",
				profiles: ["rev1"],
				testability: "testable",
			},
			{
				id: "RFCTEST-1.1-2",
				source: "RFCTEST",
				section: "1.1",
				title: "failing req",
				text: "The client MUST also do the thing.",
				level: "MUST",
				applicability: "always",
				profiles: ["rev1"],
				testability: "testable",
			},
			{
				id: "RFCTEST-1.2-1",
				source: "RFCTEST",
				section: "1.2",
				title: "untested req",
				text: "The client SHOULD do something untested.",
				level: "SHOULD",
				applicability: "always",
				profiles: ["rev1"],
				testability: "testable",
			},
			{
				id: "RFCTEST-1.3-1",
				source: "RFCTEST",
				section: "1.3",
				title: "untestable req",
				text: "The client MUST NOT do internal things.",
				level: "MUST NOT",
				applicability: "always",
				profiles: ["rev1"],
				testability: "untestable",
				untestableRationale: "not observable at the protocol layer",
			},
		],
	},
];

const tests: TestRecord[] = [
	{
		name: "t1",
		state: "passed",
		meta: { reqs: ["RFCTEST-1.1-1"], profile: "rev1" },
	},
	{
		name: "t2",
		state: "failed",
		meta: { reqs: ["RFCTEST-1.1-2"], profile: "rev1", failureKind: "unimplemented" },
	},
	{ name: "unrelated harness self-test", state: "passed" },
];

describe("aggregate", () => {
	const report = aggregate(catalog, tests);

	test("statuses per requirement", () => {
		const byId = new Map(report.requirements.map((r) => [r.req.id, r]));
		expect(byId.get("RFCTEST-1.1-1")!.byProfile.rev1!.status).toBe("pass");
		expect(byId.get("RFCTEST-1.1-2")!.byProfile.rev1!.status).toBe("fail");
		expect(byId.get("RFCTEST-1.1-2")!.byProfile.rev1!.failureKind).toBe("unimplemented");
		expect(byId.get("RFCTEST-1.2-1")!.byProfile.rev1!.status).toBe("untested");
		expect(byId.get("RFCTEST-1.3-1")!.byProfile.rev1!.status).toBe("untestable");
	});

	test("scores exclude untestable, count untested as not-passed", () => {
		const must = report.summary.find(
			(s) => s.source === "RFCTEST" && s.profile === "rev1" && s.level === "MUST",
		)!;
		// MUST bucket: 1.1-1 pass, 1.1-2 fail → 1/2
		expect(must.counts).toEqual({
			pass: 1,
			violation: 0,
			unimplemented: 1,
			untested: 0,
			untestable: 0,
		});
		expect(must.score).toBeCloseTo(0.5);

		const should = report.summary.find(
			(s) => s.source === "RFCTEST" && s.profile === "rev1" && s.level === "SHOULD",
		)!;
		expect(should.counts.untested).toBe(1);
		expect(should.score).toBe(0);

		const mustNot = report.summary.find(
			(s) => s.source === "RFCTEST" && s.profile === "rev1" && s.level === "MUST NOT",
		)!;
		expect(mustNot.counts.untestable).toBe(1);
		// denominator empty → score reported as null
		expect(mustNot.score).toBeNull();
	});

	test("flags tests citing unknown requirement ids", () => {
		const bad = aggregate(catalog, [
			{ name: "tX", state: "passed", meta: { reqs: ["NOPE-1.1-1"], profile: "rev1" } },
		]);
		expect(bad.problems.some((p) => p.includes("NOPE-1.1-1"))).toBe(true);
	});

	test("a violation outranks an unimplemented annotation", () => {
		const mixed = aggregate(catalog, [
			{
				name: "tA",
				state: "failed",
				meta: { reqs: ["RFCTEST-1.1-1"], profile: "rev1", failureKind: "unimplemented" },
			},
			{
				name: "tB",
				state: "failed",
				meta: { reqs: ["RFCTEST-1.1-1"], profile: "rev1", failureKind: "violation" },
			},
		]);
		const r = mixed.requirements.find((x) => x.req.id === "RFCTEST-1.1-1")!;
		expect(r.byProfile.rev1!.failureKind).toBe("violation");
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `yarn test:compliance`
Expected: FAIL — aggregate module missing.

- [ ] **Step 3: Implement aggregate.ts**

`test/compliance/reporter/aggregate.ts`:

```ts
import type {
	CatalogModule,
	Profile,
	Rfc2119Level,
	SpecRequirement,
} from "../catalog/types";
import type { ComplianceMeta, FailureKind } from "../runner/meta";

export interface TestRecord {
	name: string;
	state: "passed" | "failed" | "skipped";
	meta?: ComplianceMeta;
}

export type ReqStatus = "pass" | "fail" | "untested" | "untestable";

export interface ProfileResult {
	status: ReqStatus;
	failureKind?: FailureKind;
	tests: string[];
}

export interface RequirementResult {
	req: SpecRequirement;
	byProfile: Partial<Record<Profile, ProfileResult>>;
}

export interface SummaryCounts {
	pass: number;
	violation: number;
	unimplemented: number;
	untested: number;
	untestable: number;
}

export interface SourceSummary {
	source: string;
	profile: Profile;
	level: Rfc2119Level;
	counts: SummaryCounts;
	/** pass / (pass + fail + untested); null when the denominator is 0. */
	score: number | null;
}

export interface ComplianceReportData {
	requirements: RequirementResult[];
	summary: SourceSummary[];
	problems: string[];
}

const ALL_LEVELS: Rfc2119Level[] = ["MUST", "MUST NOT", "SHOULD", "SHOULD NOT", "MAY"];

export function aggregate(
	catalog: CatalogModule[],
	tests: TestRecord[],
): ComplianceReportData {
	const problems: string[] = [];
	const knownIds = new Set<string>();
	const allReqs: SpecRequirement[] = [];
	for (const mod of catalog) {
		for (const req of mod.requirements) {
			knownIds.add(req.id);
			allReqs.push(req);
		}
	}

	// Index compliance test results by (reqId, profile).
	const byReqProfile = new Map<string, TestRecord[]>();
	for (const t of tests) {
		if (!t.meta) continue; // machinery self-test — not a compliance test
		for (const reqId of t.meta.reqs) {
			if (!knownIds.has(reqId)) {
				problems.push(`test '${t.name}' cites unknown requirement id ${reqId}`);
				continue;
			}
			const key = `${reqId} ${t.meta.profile}`;
			const list = byReqProfile.get(key) ?? [];
			list.push(t);
			byReqProfile.set(key, list);
		}
	}

	const requirements: RequirementResult[] = allReqs.map((req) => {
		const byProfile: Partial<Record<Profile, ProfileResult>> = {};
		for (const profile of req.profiles) {
			if (req.testability === "untestable") {
				byProfile[profile] = { status: "untestable", tests: [] };
				continue;
			}
			const records = byReqProfile.get(`${req.id} ${profile}`) ?? [];
			const considered = records.filter((r) => r.state !== "skipped");
			if (!considered.length) {
				byProfile[profile] = { status: "untested", tests: [] };
				continue;
			}
			const failures = considered.filter((r) => r.state === "failed");
			if (!failures.length) {
				byProfile[profile] = {
					status: "pass",
					tests: considered.map((r) => r.name),
				};
			} else {
				const kind: FailureKind = failures.some(
					(f) => f.meta?.failureKind === "violation",
				)
					? "violation"
					: "unimplemented";
				byProfile[profile] = {
					status: "fail",
					failureKind: kind,
					tests: considered.map((r) => r.name),
				};
			}
		}
		return { req, byProfile };
	});

	const summary: SourceSummary[] = [];
	const sources = [...new Set(allReqs.map((r) => r.source))];
	for (const source of sources) {
		for (const profile of ["rev1", "rev2"] as Profile[]) {
			for (const level of ALL_LEVELS) {
				const counts: SummaryCounts = {
					pass: 0,
					violation: 0,
					unimplemented: 0,
					untested: 0,
					untestable: 0,
				};
				for (const rr of requirements) {
					if (rr.req.source !== source) continue;
					if (rr.req.level !== level) continue;
					const pr = rr.byProfile[profile];
					if (!pr) continue;
					if (pr.status === "pass") counts.pass++;
					else if (pr.status === "untested") counts.untested++;
					else if (pr.status === "untestable") counts.untestable++;
					else if (pr.failureKind === "violation") counts.violation++;
					else counts.unimplemented++;
				}
				const denom =
					counts.pass + counts.violation + counts.unimplemented + counts.untested;
				const any = denom + counts.untestable;
				if (any === 0) continue; // nothing cataloged at this source×profile×level
				summary.push({
					source,
					profile,
					level,
					counts,
					score: denom === 0 ? null : counts.pass / denom,
				});
			}
		}
	}

	return { requirements, summary, problems };
}
```

- [ ] **Step 4: Run aggregate tests**

Run: `yarn test:compliance`
Expected: PASS.

- [ ] **Step 5: Implement renderers and the vitest reporter (no unit tests for string formatting; verified by inspection in Task 13)**

`test/compliance/reporter/render.ts`:

```ts
import type { ComplianceReportData, SourceSummary } from "./aggregate";

function pct(score: number | null): string {
	return score === null ? "  n/a" : `${(score * 100).toFixed(0).padStart(4)}%`;
}

export function renderConsole(data: ComplianceReportData): string {
	const lines: string[] = ["", "IMAP CLIENT SPEC COMPLIANCE", "==========================="];
	const bySourceProfile = new Map<string, SourceSummary[]>();
	for (const s of data.summary) {
		const key = `${s.source} (${s.profile})`;
		const list = bySourceProfile.get(key) ?? [];
		list.push(s);
		bySourceProfile.set(key, list);
	}
	for (const [key, rows] of bySourceProfile) {
		lines.push("", key);
		for (const s of rows) {
			const c = s.counts;
			lines.push(
				`  ${s.level.padEnd(10)} ${pct(s.score)}  ` +
					`(pass ${c.pass}, violation ${c.violation}, unimplemented ${c.unimplemented}, ` +
					`untested ${c.untested}, untestable ${c.untestable})`,
			);
		}
	}
	if (data.problems.length) {
		lines.push("", "PROBLEMS:");
		for (const p of data.problems) lines.push(`  ! ${p}`);
	}
	lines.push("");
	return lines.join("\n");
}

export function renderMarkdown(data: ComplianceReportData): string {
	const lines: string[] = [
		"# IMAP Client Spec Compliance",
		"",
		"Generated by the compliance suite reporter. Do not edit by hand.",
		"",
		"## Summary",
		"",
		"| Source | Profile | Level | Score | Pass | Violation | Unimplemented | Untested | Untestable |",
		"|---|---|---|---|---|---|---|---|---|",
	];
	for (const s of data.summary) {
		const c = s.counts;
		lines.push(
			`| ${s.source} | ${s.profile} | ${s.level} | ${pct(s.score).trim()} | ` +
				`${c.pass} | ${c.violation} | ${c.unimplemented} | ${c.untested} | ${c.untestable} |`,
		);
	}
	lines.push("", "## Requirements", "");
	lines.push("| Requirement | Level | Profile | Status | Detail |");
	lines.push("|---|---|---|---|---|");
	for (const rr of data.requirements) {
		for (const [profile, pr] of Object.entries(rr.byProfile)) {
			const detail =
				pr.status === "fail"
					? `${pr.failureKind}: ${rr.req.text.replace(/\s+/g, " ").slice(0, 160)}`
					: pr.status === "untestable"
						? (rr.req.untestableRationale ?? "")
						: "";
			lines.push(
				`| ${rr.req.id} — ${rr.req.title} | ${rr.req.level} | ${profile} | ${pr.status} | ${detail} |`,
			);
		}
	}
	if (data.problems.length) {
		lines.push("", "## Problems", "");
		for (const p of data.problems) lines.push(`- ${p}`);
	}
	lines.push("");
	return lines.join("\n");
}
```

`test/compliance/reporter/compliance-reporter.ts`:

```ts
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { Reporter, TestModule } from "vitest/node";

import { allCatalogModules } from "../catalog";
import { aggregate, type TestRecord } from "./aggregate";
import { renderConsole, renderMarkdown } from "./render";

const here = path.dirname(fileURLToPath(import.meta.url));

export default class ComplianceReporter implements Reporter {
	private readonly outDir: string;

	constructor(opts: { outDir?: string } = {}) {
		this.outDir = opts.outDir ?? path.join(here, "..", "reports");
	}

	onTestRunEnd(testModules: ReadonlyArray<TestModule>): void {
		const records: TestRecord[] = [];
		for (const mod of testModules) {
			for (const tc of mod.children.allTests()) {
				const result = tc.result();
				const state =
					result.state === "passed"
						? "passed"
						: result.state === "failed"
							? "failed"
							: "skipped";
				records.push({
					name: tc.fullName,
					state,
					meta: (tc.meta() as { compliance?: TestRecord["meta"] }).compliance,
				});
			}
		}
		const data = aggregate(allCatalogModules, records);

		fs.mkdirSync(this.outDir, { recursive: true });
		fs.writeFileSync(
			path.join(this.outDir, "compliance.json"),
			JSON.stringify(data, null, "\t"),
		);
		fs.writeFileSync(path.join(this.outDir, "COMPLIANCE.md"), renderMarkdown(data));
		// eslint-disable-next-line no-console
		console.log(renderConsole(data));
	}
}
```

Wire into `test/compliance/vitest.config.ts` — change the `test` block to add:

```ts
		reporters: ["default", new ComplianceReporter()],
```

with import `import ComplianceReporter from "./reporter/compliance-reporter";` at the top.

**API-verification note:** confirm against `node_modules/vitest/dist/node.d.ts` that `Reporter.onTestRunEnd`, `TestModule.children.allTests()`, `TestCase.result()`, `TestCase.meta()`, and `TestCase.fullName` exist with these shapes; adjust mechanically if vitest 4.1.8 differs (e.g., `fullName` vs `name`).

- [ ] **Step 6: Run and verify reports generate**

Run: `yarn test:compliance`
Expected: PASS; console shows the compliance summary (empty catalog so far → no summary rows, no problems); `test/compliance/reports/compliance.json` and `COMPLIANCE.md` exist.

- [ ] **Step 7: Commit**

```bash
git add test/compliance/reporter test/compliance/vitest.config.ts
git commit -m "📊 Compliance Reporter (Console/JSON/Markdown)"
```

---

## Task 9: Seed requirement catalog (RFC 3501 / RFC 2971 / RFC 9525) + quote audit

**Files:**
- Create: `test/compliance/catalog/rfc3501.ts`
- Create: `test/compliance/catalog/rfc2971.ts`
- Create: `test/compliance/catalog/rfc9525.ts`
- Modify: `test/compliance/catalog/index.ts`
- Modify: `test/compliance/specs/meta/catalog.test.ts`

This is a Phase 0 **seed** — just enough RFC 3501/2971/9525 requirements to exercise every machinery path. Full extraction happens in Phases 1–3; ids assigned here are append-only and must survive that extraction (Phase 1 keeps these ids, adding new ones around them).

- [ ] **Step 1: Fetch authoritative RFC text**

Fetch (WebFetch or curl) the plaintext RFCs and verify every quote below **verbatim** before committing — fix any drift:
- https://www.rfc-editor.org/rfc/rfc3501.txt (§2.2.1, §2.2.2, §6.1.2, §6.2.1, §7.1.1, §7.1.2, §7.1.5)
- https://www.rfc-editor.org/rfc/rfc2971.txt (§3.3)
- https://www.rfc-editor.org/rfc/rfc9525.txt (§6.3)

- [ ] **Step 2: Write the catalog modules**

`test/compliance/catalog/rfc3501.ts` (quotes below are best-effort drafts — **Step 1 verification is mandatory**; correct them to the RFC's exact words):

```ts
import type { CatalogModule } from "./types";

const rfc3501: CatalogModule = {
	source: "RFC3501",
	extractionNote:
		"PHASE 0 SEED ONLY: sections 2.2.1, 2.2.2, 6.1.2, 6.2.1, 7.1.1, 7.1.2 and " +
		"7.1.5 partially extracted to exercise the suite machinery. Full extraction " +
		"of all client-binding requirements happens in Phase 1; ids here are stable " +
		"and will not be renumbered.",
	requirements: [
		{
			id: "RFC3501-2.2.1-1",
			source: "RFC3501",
			section: "2.2.1",
			title: "Client prefixes each command with a distinct tag",
			text:
				'Each client command is prefixed with an identifier (typically a short alphanumeric string, e.g., A0001, A0002, etc.) called a "tag".  A different tag is generated by the client for each command.',
			level: "MUST",
			applicability: "always",
			profiles: ["rev1"],
			testability: "testable",
			notes: "Imperative prose without a 2119 keyword; treated as MUST.",
		},
		{
			id: "RFC3501-2.2.1-2",
			source: "RFC3501",
			section: "2.2.1",
			title: "Client follows command syntax strictly",
			text:
				"Clients MUST follow the syntax outlined in this specification strictly.  It is a syntax error to send a command with missing or extraneous spaces or arguments.",
			level: "MUST",
			applicability: "always",
			profiles: ["rev1"],
			testability: "testable",
		},
		{
			id: "RFC3501-2.2.2-1",
			source: "RFC3501",
			section: "2.2.2",
			title: "Client accepts any server response at all times",
			text:
				"The client MUST be prepared to accept any server response at all times.  This includes server data that was not requested.",
			level: "MUST",
			applicability: "always",
			profiles: ["rev1"],
			testability: "testable",
		},
		{
			id: "RFC3501-6.1.2-1",
			source: "RFC3501",
			section: "6.1.2",
			title: "NOOP usable as a periodic poll",
			text:
				"The NOOP command can be used as a periodic poll for new messages or message status updates during a period of inactivity (this is the preferred method to do this).",
			level: "MAY",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "testable",
			notes:
				"Capability statement; tested as 'client offers a way to issue NOOP'. " +
				"Currently expected to fail as unimplemented (no public NOOP surface).",
		},
		{
			id: "RFC3501-6.2.1-1",
			source: "RFC3501",
			section: "6.2.1",
			title: "Client discards cached capabilities after STARTTLS",
			text:
				"Once [TLS] has been started, the client MUST discard cached information about server capabilities and SHOULD re-issue the CAPABILITY command.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "testable",
			notes: "MUST half of the sentence (discard cached capabilities).",
		},
		{
			id: "RFC3501-6.2.1-2",
			source: "RFC3501",
			section: "6.2.1",
			title: "Client re-issues CAPABILITY after STARTTLS",
			text:
				"Once [TLS] has been started, the client MUST discard cached information about server capabilities and SHOULD re-issue the CAPABILITY command.",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "testable",
			notes: "SHOULD half of the sentence (re-issue CAPABILITY).",
		},
		{
			id: "RFC3501-6.2.1-3",
			source: "RFC3501",
			section: "6.2.1",
			title: "TLS negotiation begins immediately after the OK CRLF",
			text:
				"A [TLS] negotiation begins immediately after the CRLF at the end of the tagged OK response from the server.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1"],
			testability: "testable",
			notes:
				"Client-binding reading: no further plaintext octets may be sent after " +
				"the STARTTLS command until the handshake completes.",
		},
		{
			id: "RFC3501-7.1.1-1",
			source: "RFC3501",
			section: "7.1.1",
			title: "Client accepts the untagged OK greeting",
			text:
				"The untagged form indicates an information-only message; the nature of the information MAY be indicated by a response code.  The untagged form is also used as one of three possible greetings at connection startup.",
			level: "MUST",
			applicability: "always",
			profiles: ["rev1"],
			testability: "testable",
			notes:
				"Implicit client obligation: accept all valid forms of the OK greeting " +
				"(with or without response codes) and proceed.",
		},
		{
			id: "RFC3501-7.1.2-1",
			source: "RFC3501",
			section: "7.1.2",
			title: "Client treats PREAUTH greeting as already authenticated",
			text:
				"The PREAUTH response is always untagged, and is one of three possible greetings at connection startup.  It indicates that the connection has already been authenticated by external means; thus no LOGIN command is needed.",
			level: "MUST",
			applicability: "always",
			profiles: ["rev1"],
			testability: "testable",
			notes: "Imperative prose; client must enter authenticated state.",
		},
		{
			id: "RFC3501-7.1.5-1",
			source: "RFC3501",
			section: "7.1.5",
			title: "Client recognizes BYE greeting as connection rejection",
			text:
				"The BYE response is always untagged, and indicates that the server is about to close the connection. ... as a part of a connection greeting to refuse the connection",
			level: "MUST",
			applicability: "always",
			profiles: ["rev1"],
			testability: "testable",
			notes:
				"Quote elided with '...'; verify exact wording from the RFC and keep the " +
				"two relevant sentences in full.",
		},
	],
};

export default rfc3501;
```

`test/compliance/catalog/rfc2971.ts`:

```ts
import type { CatalogModule } from "./types";

const rfc2971: CatalogModule = {
	source: "RFC2971",
	extractionNote:
		"PHASE 0 SEED: section 3.3 (defined field values) extracted; sections 1-3.2, " +
		"4-8 reviewed for client-binding text in Phase 0 only as far as the ID " +
		"command syntax; full extraction in a later phase. Ids are stable.",
	requirements: [
		{
			id: "RFC2971-3.3-1",
			source: "RFC2971",
			section: "3.3",
			title: "At most 30 field-value pairs in ID",
			text: "Implementations MUST NOT send more than 30 field-value pairs.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
		},
		{
			id: "RFC2971-3.3-2",
			source: "RFC2971",
			section: "3.3",
			title: "ID field/value length limits",
			text:
				"Field strings MUST NOT be longer than 30 octets.  Value strings MUST NOT be longer than 1024 octets.",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
		},
	],
};

export default rfc2971;
```

`test/compliance/catalog/rfc9525.ts`:

```ts
import type { CatalogModule } from "./types";

const rfc9525: CatalogModule = {
	source: "RFC9525",
	extractionNote:
		"PHASE 0 SEED: the core identity-verification outcome requirement only, to " +
		"prove TLS machinery. Full extraction (with RFC 8314) happens in Phase 3.",
	requirements: [
		{
			id: "RFC9525-6.3-1",
			source: "RFC9525",
			section: "6.3",
			title: "Client rejects certificates that fail identity verification",
			text:
				"If the client does not find a presented identifier matching any of the reference identifiers, the client MUST NOT treat the certificate as verified.",
			level: "MUST NOT",
			applicability: "always",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes: "Verify exact wording against RFC 9525 §6.3 before committing.",
		},
	],
};

export default rfc9525;
```

Update `test/compliance/catalog/index.ts`:

```ts
import type { CatalogModule } from "./types";
import rfc2971 from "./rfc2971";
import rfc3501 from "./rfc3501";
import rfc9525 from "./rfc9525";

export const allCatalogModules: CatalogModule[] = [rfc3501, rfc2971, rfc9525];

export function findRequirement(id: string) {
	for (const mod of allCatalogModules) {
		const req = mod.requirements.find((r) => r.id === id);
		if (req) return req;
	}
	return undefined;
}
```

Add to `test/compliance/specs/meta/catalog.test.ts`:

```ts
test("catalog contains the Phase 0 seed modules", () => {
	const sources = allCatalogModules.map((m) => m.source);
	expect(sources).toEqual(expect.arrayContaining(["RFC3501", "RFC2971", "RFC9525"]));
});
```

- [ ] **Step 3: Quote audit (subagent)**

Dispatch a subagent with the three RFC URLs and the three catalog files; instruct it to diff every `text` field against the RFC verbatim (whitespace-normalized), to check section numbers, and to sanity-check each `level`/`applicability` tag. Fix every discrepancy it reports.

- [ ] **Step 4: Run tests**

Run: `yarn test:compliance`
Expected: PASS; the reporter console output now shows RFC3501/RFC2971/RFC9525 rows, all `untested`.

- [ ] **Step 5: Commit**

```bash
git add test/compliance/catalog test/compliance/specs
git commit -m "📜 Seed Requirement Catalog (RFC 3501/2971/9525)"
```

---

## Task 10: Compliance specs — greetings

**Files:**
- Create: `test/compliance/specs/rfc3501/7.1-greetings.test.ts`

These are real compliance tests: expected to PASS or FAIL according to actual client behavior — a failure with the right annotation is a correct outcome. Never weaken an assertion to make a test pass; the assertion encodes the spec.

- [ ] **Step 1: Write the tests**

```ts
import { afterEach, expect } from "vitest";

import { ComplianceDriver } from "../../driver/driver";
import { command } from "../../harness/matchers";
import { close, expectLine, reply, send } from "../../harness/script";
import { ScriptedServer } from "../../harness/scripted-server";
import { defineAcceptanceTable } from "../../runner/acceptance-table";
import { complianceTest } from "../../runner/compliance-test";

let server: ScriptedServer | undefined;
let driver: ComplianceDriver | undefined;
afterEach(async () => {
	await driver?.end();
	await server?.close();
	server = undefined;
	driver = undefined;
});

// Acceptance table: all valid OK greeting forms must be accepted, after which
// the client proceeds (observably: Session.start() completes its CAPABILITY
// round-trip and reports success).
defineAcceptanceTable({
	name: "accepts valid OK greeting forms",
	profiles: ["rev1"],
	rows: [
		{
			req: "RFC3501-7.1.1-1",
			variant: "minimal text",
			greeting: "* OK ready\r\n",
		},
		{
			req: "RFC3501-7.1.1-1",
			variant: "with CAPABILITY response code",
			greeting: "* OK [CAPABILITY IMAP4rev1] server ready\r\n",
		},
		{
			req: "RFC3501-7.1.1-1",
			variant: "long human text with punctuation",
			greeting: "* OK IMAP4rev1 service: ready & waiting (build 12.3) ...\r\n",
		},
		{
			req: "RFC3501-7.1.1-1",
			variant: "greeting split across TCP packets",
			greeting: "* OK split greeting arrives in pieces\r\n",
			chunks: [3, 5, 9],
		},
	],
	async execute(row) {
		server = await ScriptedServer.start();
		server.arm([
			[
				send(row.greeting, row.chunks ? { chunks: row.chunks } : {}),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK done", ["* CAPABILITY IMAP4rev1"]),
			],
		]);
		driver = new ComplianceDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		expect(ok).toBe(true);
		await server.assertCompleted();
	},
});

complianceTest(
	{
		reqs: ["RFC3501-7.1.2-1"],
		profiles: ["rev1"],
		title: "PREAUTH greeting puts the session in authenticated state",
	},
	async () => {
		server = await ScriptedServer.start();
		server.arm([
			[
				send("* PREAUTH IMAP4rev1 server logged in as user\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK done", ["* CAPABILITY IMAP4rev1"]),
			],
		]);
		driver = new ComplianceDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		expect(ok).toBe(true);
		// Spec: connection is already authenticated; no LOGIN is needed.
		expect(driver.authenticated).toBe(true);
	},
);

complianceTest(
	{
		reqs: ["RFC3501-7.1.5-1"],
		profiles: ["rev1"],
		title: "BYE greeting is recognized as connection rejection",
	},
	async () => {
		server = await ScriptedServer.start();
		server.arm([[send("* BYE server too busy, try later\r\n"), close()]]);
		driver = new ComplianceDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		// Client must recognize the rejection: start() reports failure.
		expect(ok).toBe(false);
		expect(driver.active).toBe(false);
	},
);

complianceTest(
	{
		reqs: ["RFC3501-2.2.2-1"],
		profiles: ["rev1"],
		title: "unsolicited untagged data mid-command is accepted",
	},
	async () => {
		server = await ScriptedServer.start();
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				// Unrequested data the client never asked for, before completion:
				reply("OK done", [
					"* CAPABILITY IMAP4rev1",
					"* 23 EXISTS",
					"* 1 RECENT",
				]),
			],
		]);
		driver = new ComplianceDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		expect(ok).toBe(true);
		expect(driver.active).toBe(true);
		await server.assertCompleted();
	},
);
```

The acceptance-table row type needs `greeting`/`chunks` — the generic `R` row type covers this (rows carry arbitrary extra fields).

- [ ] **Step 2: Run and record honest outcomes**

Run: `yarn test:compliance`
Expected: table rows and the unsolicited-data test likely PASS; the PREAUTH test likely FAILS (`authenticated` stays false — a genuine compliance gap, annotation `violation`); the BYE test outcome depends on actual client behavior. **Do not adjust assertions to force passes.** Verify the failures appear in `reports/COMPLIANCE.md` with correct annotations.

- [ ] **Step 3: Commit**

```bash
git add test/compliance/specs/rfc3501
git commit -m "✅ RFC 3501 Greeting Compliance Specs"
```

---

## Task 11: Compliance specs — tags, syntax, CAPABILITY/ID/NOOP

**Files:**
- Create: `test/compliance/specs/rfc3501/2.2-commands.test.ts`
- Create: `test/compliance/specs/rfc2971/3.3-id.test.ts`

- [ ] **Step 1: Write the RFC 3501 command/tag tests**

`test/compliance/specs/rfc3501/2.2-commands.test.ts`:

```ts
import { afterEach, expect } from "vitest";

import { ComplianceDriver } from "../../driver/driver";
import { command, isValidTag } from "../../harness/matchers";
import { expectLine, reply, send } from "../../harness/script";
import { ScriptedServer } from "../../harness/scripted-server";
import { complianceTest } from "../../runner/compliance-test";

let server: ScriptedServer | undefined;
let driver: ComplianceDriver | undefined;
afterEach(async () => {
	await driver?.end();
	await server?.close();
	server = undefined;
	driver = undefined;
});

complianceTest(
	{
		reqs: ["RFC3501-2.2.1-1"],
		profiles: ["rev1"],
		title: "every command carries a syntactically valid, distinct tag",
	},
	async () => {
		server = await ScriptedServer.start();
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK done", ["* CAPABILITY IMAP4rev1 ID"]),
				expectLine(command("ID")),
				reply("OK done", ['* ID ("name" "fake-server")']),
			],
		]);
		driver = new ComplianceDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
			id: { name: "compliance-suite" },
		});
		expect(ok).toBe(true);
		await server.assertCompleted();

		expect(server.commandTags.length).toBe(2);
		for (const tag of server.commandTags) {
			expect(isValidTag(tag), `tag '${tag}' must be valid per RFC 3501 §9`).toBe(true);
		}
		expect(new Set(server.commandTags).size).toBe(server.commandTags.length);
	},
);

complianceTest(
	{
		reqs: ["RFC3501-2.2.1-2"],
		profiles: ["rev1"],
		title: "CAPABILITY is sent with no extraneous arguments or spaces",
	},
	async () => {
		server = await ScriptedServer.start();
		server.arm([
			[
				send("* OK ready\r\n"),
				// args: null fails the script on any trailing space or argument
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK done", ["* CAPABILITY IMAP4rev1"]),
			],
		]);
		driver = new ComplianceDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
		});
		expect(ok).toBe(true);
		await server.assertCompleted();
	},
);

complianceTest(
	{
		reqs: ["RFC3501-6.1.2-1"],
		profiles: ["rev1"],
		title: "client offers a way to issue NOOP",
	},
	async () => {
		server = await ScriptedServer.start();
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK done", ["* CAPABILITY IMAP4rev1"]),
				expectLine(command("NOOP", { args: null })),
				reply("OK NOOP completed"),
			],
		]);
		driver = new ComplianceDriver();
		await driver.connect({ host: "127.0.0.1", port: server.port, security: "none" });
		// Throws NotImplementedError today → annotated 'unimplemented'.
		await driver.noop();
		await server.assertCompleted();
	},
);
```

- [ ] **Step 2: Write the RFC 2971 ID syntax tests**

`test/compliance/specs/rfc2971/3.3-id.test.ts`:

```ts
import { afterEach, expect } from "vitest";

import { ComplianceDriver } from "../../driver/driver";
import { command } from "../../harness/matchers";
import { expectLine, reply, send } from "../../harness/script";
import { ScriptedServer } from "../../harness/scripted-server";
import { complianceTest } from "../../runner/compliance-test";

let server: ScriptedServer | undefined;
let driver: ComplianceDriver | undefined;
afterEach(async () => {
	await driver?.end();
	await server?.close();
	server = undefined;
	driver = undefined;
});

/** Counts `"field" "value"` pairs in an ID parameter list. */
function idPairCount(args: string): number {
	if (args.trim().toUpperCase() === "NIL") return 0;
	const m = args.match(/"((?:[^"\\]|\\.)*)"/g);
	return m ? m.length / 2 : 0;
}

complianceTest(
	{
		reqs: ["RFC2971-3.3-1"],
		profiles: ["rev1"],
		title: "client never sends more than 30 ID field-value pairs",
	},
	async () => {
		// Consumer hands the client 35 pairs; a compliant client must cap or refuse.
		const tooMany: Record<string, string> = {};
		for (let i = 0; i < 35; i++) tooMany[`field${i}`] = `value${i}`;

		let sentArgs = "";
		server = await ScriptedServer.start();
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK done", ["* CAPABILITY IMAP4rev1 ID"]),
				expectLine({
					description: "ID command (capturing args)",
					match(line) {
						const r = command("ID").match(line);
						if (r.ok) sentArgs = line.replace(/^\S+ \S+ ?/, "");
						return r;
					},
				}),
				reply("OK done", ["* ID NIL"]),
			],
		]);
		driver = new ComplianceDriver();
		await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
			id: tooMany,
		});
		await server.assertCompleted();
		expect(idPairCount(sentArgs)).toBeLessThanOrEqual(30);
	},
);

complianceTest(
	{
		reqs: ["RFC2971-3.3-2"],
		profiles: ["rev1"],
		title: "client enforces ID field (30) and value (1024) octet limits",
	},
	async () => {
		const oversized = {
			["f".repeat(40)]: "ok",
			name: "v".repeat(2000),
		};
		let sentArgs = "";
		server = await ScriptedServer.start();
		server.arm([
			[
				send("* OK ready\r\n"),
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK done", ["* CAPABILITY IMAP4rev1 ID"]),
				expectLine({
					description: "ID command (capturing args)",
					match(line) {
						const r = command("ID").match(line);
						if (r.ok) sentArgs = line.replace(/^\S+ \S+ ?/, "");
						return r;
					},
				}),
				reply("OK done", ["* ID NIL"]),
			],
		]);
		driver = new ComplianceDriver();
		await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "none",
			id: oversized,
		});
		await server.assertCompleted();
		const strings = sentArgs.match(/"((?:[^"\\]|\\.)*)"/g) ?? [];
		for (let i = 0; i < strings.length; i += 2) {
			expect(strings[i].length - 2).toBeLessThanOrEqual(30); // field
			if (strings[i + 1]) {
				expect(strings[i + 1].length - 2).toBeLessThanOrEqual(1024); // value
			}
		}
	},
);
```

- [ ] **Step 3: Run and record honest outcomes**

Run: `yarn test:compliance`
Expected: tag/syntax tests likely PASS; NOOP fails `unimplemented`; ID-limit tests likely FAIL (`violation` — client probably passes oversized input through). Confirm annotations in the report. Do not weaken assertions.

- [ ] **Step 4: Commit**

```bash
git add test/compliance/specs
git commit -m "✅ Command Tag/Syntax + ID Limit Compliance Specs"
```

---

## Task 12: Compliance specs — STARTTLS + TLS identity

**Files:**
- Create: `test/compliance/specs/rfc3501/6.2-starttls.test.ts`
- Create: `test/compliance/specs/rfc9525/identity.test.ts`

- [ ] **Step 1: Write the STARTTLS tests**

`test/compliance/specs/rfc3501/6.2-starttls.test.ts`:

```ts
import { afterEach, expect } from "vitest";

import { ComplianceDriver } from "../../driver/driver";
import { command } from "../../harness/matchers";
import { expectLine, reply, send, startTls } from "../../harness/script";
import { ScriptedServer } from "../../harness/scripted-server";
import { loadCertFixture } from "../../harness/tls";
import { complianceTest } from "../../runner/compliance-test";

let server: ScriptedServer | undefined;
let driver: ComplianceDriver | undefined;
afterEach(async () => {
	await driver?.end();
	await server?.close();
	server = undefined;
	driver = undefined;
});

const localhost = loadCertFixture("localhost");

complianceTest(
	{
		reqs: ["RFC3501-6.2.1-1", "RFC3501-6.2.1-2", "RFC3501-6.2.1-3"],
		profiles: ["rev1"],
		title:
			"STARTTLS: no plaintext after OK; capabilities discarded and re-issued post-TLS",
	},
	async () => {
		server = await ScriptedServer.start({ tlsUpgrade: localhost });
		server.arm([
			[
				// Pre-TLS capabilities advertise a marker that MUST disappear.
				send("* OK [CAPABILITY IMAP4rev1 STARTTLS PRE-TLS-ONLY] ready\r\n"),
				expectLine(command("STARTTLS", { args: null })),
				reply("OK begin TLS negotiation"),
				startTls(), // fails the script if plaintext arrives before handshake
				// Post-TLS: client SHOULD re-issue CAPABILITY (6.2.1-2);
				// this expect step fails (timeout) if it never does.
				expectLine(command("CAPABILITY", { args: null })),
				reply("OK done", ["* CAPABILITY IMAP4rev1 POST-TLS-ONLY"]),
			],
		]);
		driver = new ComplianceDriver();
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "starttls",
			ca: localhost.cert,
		});
		expect(ok).toBe(true);
		await server.assertCompleted();
		// 6.2.1-1: cached pre-TLS capability information must be gone.
		expect(driver.hasCapability("PRE-TLS-ONLY")).toBe(false);
		expect(driver.hasCapability("POST-TLS-ONLY")).toBe(true);
	},
);
```

- [ ] **Step 2: Write the TLS identity test**

`test/compliance/specs/rfc9525/identity.test.ts`:

```ts
import { afterEach, expect } from "vitest";

import { ComplianceDriver } from "../../driver/driver";
import { send } from "../../harness/script";
import { ScriptedServer } from "../../harness/scripted-server";
import { loadCertFixture } from "../../harness/tls";
import { complianceTest } from "../../runner/compliance-test";

let server: ScriptedServer | undefined;
let driver: ComplianceDriver | undefined;
afterEach(async () => {
	await driver?.end();
	await server?.close();
	server = undefined;
	driver = undefined;
});

complianceTest(
	{
		reqs: ["RFC9525-6.3-1"],
		profiles: ["rev1", "rev2"],
		title: "implicit TLS: certificate for the wrong host is rejected",
	},
	async () => {
		const wrongHost = loadCertFixture("wrong-host");
		server = await ScriptedServer.start({ tlsImplicit: wrongHost });
		// Greeting armed but should never be deliverable over a completed session.
		server.arm([[send("* OK should never complete a session\r\n")]]);

		driver = new ComplianceDriver();
		// The CA *is* trusted (we pass it), so the only failure mode left is
		// identity mismatch: cert says wrong.example.test, we connect to 127.0.0.1.
		const ok = await driver.connect({
			host: "127.0.0.1",
			port: server.port,
			security: "implicit",
			ca: wrongHost.cert,
			timeoutMs: 2000,
		});
		expect(ok).toBe(false);
		expect(driver.active).toBe(false);
	},
);
```

- [ ] **Step 3: Run and record honest outcomes**

Run: `yarn test:compliance`
Expected: STARTTLS scenario likely PASSES end-to-end (Session re-fetches capabilities post-upgrade); identity test PASSES if the client's default verification is sound (it sets `rejectUnauthorized: true`). Any failure: capture transcript, confirm it's a genuine client gap, leave the test honest.

- [ ] **Step 4: Commit**

```bash
git add test/compliance/specs
git commit -m "✅ STARTTLS + TLS Identity Compliance Specs"
```

---

## Task 13: Import-hygiene meta-test + full verification

**Files:**
- Create: `test/compliance/specs/meta/import-hygiene.test.ts`

- [ ] **Step 1: Write the import-hygiene meta-test**

```ts
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const complianceRoot = path.join(here, "..", "..");

function walk(dir: string): string[] {
	const out: string[] = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) out.push(...walk(full));
		else if (entry.name.endsWith(".ts")) out.push(full);
	}
	return out;
}

test("compliance suite only touches the client via src/index", () => {
	const offenders: string[] = [];
	for (const sub of ["specs", "driver", "runner", "harness", "reporter", "catalog"]) {
		for (const file of walk(path.join(complianceRoot, sub))) {
			const content = fs.readFileSync(file, "utf8");
			for (const m of content.matchAll(/from\s+["']([^"']+)["']/g)) {
				const spec = m[1];
				if (/\/src\//.test(spec) && !/\/src\/index$/.test(spec)) {
					offenders.push(`${path.relative(complianceRoot, file)} imports ${spec}`);
				}
			}
		}
	}
	expect(offenders).toEqual([]);
});

test("only the driver imports the client at all", () => {
	const offenders: string[] = [];
	for (const sub of ["specs", "runner", "harness", "reporter", "catalog"]) {
		for (const file of walk(path.join(complianceRoot, sub))) {
			const content = fs.readFileSync(file, "utf8");
			if (/from\s+["'][^"']*\/src\/index["']/.test(content)) {
				offenders.push(path.relative(complianceRoot, file));
			}
		}
	}
	expect(offenders).toEqual([]);
});
```

- [ ] **Step 2: Full suite run + report inspection**

Run: `yarn test:compliance`
Expected: all machinery self-tests PASS; compliance specs show honest mixed results. Then verify the report artifacts:
1. `test/compliance/reports/compliance.json` parses, `problems` is `[]`.
2. `test/compliance/reports/COMPLIANCE.md`: every seed requirement appears; failed reqs annotated `violation`/`unimplemented` correctly; untested seed reqs (if any) show `untested`.
3. Console summary shows per-source × profile × level scores.

- [ ] **Step 3: Jest regression**

Run: `yarn test`
Expected: existing Jest suite passes exactly as before this work.

- [ ] **Step 4: Commit**

```bash
git add test/compliance/specs/meta
git commit -m "🛂 Import Hygiene Meta-Test + Phase 0 Verification"
```

---

## Task 14: Phase-boundary review

- [ ] **Step 1: Subagent code review** — dispatch a code-review subagent over the full Phase 0 diff against this plan and the spec; fix actionable findings (driver protocol-logic leaks, assertion weakening, catalog/report mismatches are the priority items).
- [ ] **Step 2: Verify the three self-verification invariants ran** — catalog quote audit (Task 9 Step 3) done; import-hygiene meta-test green; reporter output cross-checked against a manual count of seed requirements.
- [ ] **Step 3: Progress report to user** — per-claim audited against tool results: suite layout, first compliance numbers (per source × level), known honest failures with annotations, and what Phase 1 will do next.
