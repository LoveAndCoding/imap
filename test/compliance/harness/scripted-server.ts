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
	private lastTag?: string;
	private waiting?: {
		resolveLine: (line: string) => void;
		rejectLine: (err: Error) => void;
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
			for (let i = 0; i < this.steps.length; i++) {
				const step = this.steps[i];
				try {
					switch (step.kind) {
						case "send":
							await this.doSend(step);
							break;
						case "expect":
							await this.doExpect(step);
							break;
						case "reply":
							await this.doReply(step);
							break;
						case "startTls":
							await this.doStartTls();
							break;
						case "close":
							this.socket.end();
							break;
					}
				} catch (stepErr) {
					const msg = stepErr instanceof Error ? stepErr.message : String(stepErr);
					throw new Error(`step #${i + 1} (${step.kind}): ${msg}`);
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
				w.rejectLine(
					new Error(
						`client sent a line terminated by bare LF (commands MUST end with CRLF): '${this.buffer
							.toString("latin1")
							.slice(0, lf)}'`,
					),
				);
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
			this.waiting = { resolveLine: resolve, rejectLine: reject, timer };
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
		if (result.tag) {
			this.server.commandTags.push(result.tag);
			this.server.commandLines.push({ tag: result.tag, args: result.args ?? "" });
			this.lastTag = result.tag;
		}
		if (!result.ok) {
			throw new Error(
				`expectation '${step.matcher.description}' failed: ${result.reason}`,
			);
		}
	}

	private async doReply(step: Extract<ScriptStep, { kind: "reply" }>): Promise<void> {
		if (this.lastTag === undefined) {
			throw new Error("reply step used before any command was matched");
		}
		const lines = [...(step.untagged ?? []), `${this.lastTag} ${step.suffix}`]
			.map((l) => `${l}\r\n`)
			.join("");
		await this.doSend({ kind: "send", data: lines });
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
		// The handshake error handler on `secured` is now stale (handshake done).
		// Replace it with one that routes post-handshake errors into the failure path.
		secured.removeAllListeners("error");
		secured.on("error", (err) => {
			// Teardown resets after the script has settled are expected noise
			// (e.g., the test client destroying its socket); only live runs fail.
			if (this.server.settled || secured.destroyed) {
				return;
			}
			this.server.scriptFailed(`TLS socket error after handshake: ${err.message}`);
			secured.destroy();
		});
		// Register the secured socket so close() can destroy it directly.
		this.server.sockets.add(secured);
		secured.on("close", () => this.server.sockets.delete(secured));
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
	/** Tag and args of every tagged command line matched by an expect step, in order. */
	public readonly commandLines: Array<{ tag: string; args: string }> = [];

	private netServer!: net.Server;
	private scripts: ScriptStep[][] = [];
	private scriptsStarted = 0;
	private scriptsFinished = 0;
	private failure?: string;
	private outcomeResolvers: Array<(o: Outcome) => void> = [];
	/** @internal — used by ConnectionRunner to register/deregister sockets for close(). */
	public readonly sockets = new Set<net.Socket>();

	private constructor(private readonly opts: ServerOptions) {}

	public static async start(opts: ServerOptions = {}): Promise<ScriptedServer> {
		const server = new ScriptedServer(opts);
		await server.listen();
		return server;
	}

	public get port(): number {
		return (this.netServer.address() as net.AddressInfo).port;
	}

	/**
	 * Load a fresh set of connection scripts and reset the run counters.
	 *
	 * Must be called exactly once per server instance before any clients connect.
	 * It does NOT reset the transcript or commandTags arrays — those accumulate
	 * across the lifetime of the server. Re-arming mid-run (i.e., while a
	 * ConnectionRunner is active) is unsupported and will produce undefined
	 * behaviour.
	 */
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

	/** @internal — true once the run's outcome can no longer change. */
	public get settled(): boolean {
		return this.isSettled();
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
