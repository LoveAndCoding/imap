import * as net from "node:net";
import * as tls from "node:tls";
import * as zlib from "node:zlib";

import type { ScriptStep } from "./script";
import { Transcript } from "./transcript";

export interface ServerOptions {
	/** Wrap every connection in TLS from the first byte. */
	tlsImplicit?: { key: Buffer; cert: Buffer };
	/** Cert used when a script performs a startTls upgrade step. */
	tlsUpgrade?: { key: Buffer; cert: Buffer };
	stepTimeoutMs?: number;
	/**
	 * Optional TLS negotiation constraints for the implicit-TLS listener.
	 * Passed straight through to tls.createServer so a test can restrict the
	 * server to a single cipher suite and/or protocol version — used to verify
	 * a client can complete a handshake under those constraints (e.g. the
	 * mandated-cipher duty RFC9051-11.1-4). Only affects the tlsImplicit path.
	 */
	tlsConstraints?: {
		ciphers?: string;
		minVersion?: tls.SecureVersion;
		maxVersion?: tls.SecureVersion;
	};
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

	// Literal assembly state
	private segments: string[] = [];
	private literalsBuf: Buffer[] = [];
	private literalNonSync: boolean[] = [];
	private literalBinary: boolean[] = [];
	private literalRemaining = 0; // >0 while consuming literal octets
	// Stash the completed literals until the expect step claims them
	private lastLiterals: Buffer[] = [];
	private lastNonSync: boolean[] = [];
	private lastBinary: boolean[] = [];

	// Matches a trailing literal announcement: `{n}` / `{n+}` (ordinary literal)
	// or `~{n}` / `~{n+}` (RFC 3516 literal8, carrying BINARY octets). The
	// optional leading `~` is captured so the harness can flag the literal8 form.
	private static readonly LITERAL_RE = /(~)?\{(\d+)(\+)?\}$/;
	private static readonly MAX_LITERAL = 1024 * 1024;

	// RFC 4978 COMPRESS=DEFLATE codec (see the startCompression /
	// endCompression script steps): while `inflate` is non-null, incoming
	// client bytes route through it before line assembly, and outgoing sends
	// are deflated by `writeWire()`. Raw DEFLATE (RFC 1951 — no zlib/gzip
	// header), mirroring `src/connection/compress.ts`. The WRITE side is
	// deliberately NOT a streaming Transform: each send is compressed
	// synchronously via `deflateRawSync(..., { finishFlush: Z_SYNC_FLUSH })`
	// — a sync-flushed, non-final segment from a fresh context makes no
	// history back-references, so concatenated segments form one valid
	// continuous DEFLATE stream for the client's streaming inflater, while
	// keeping the harness free of the flush-callback-vs-'data'-emission
	// ordering race a Transform-based writer suffers on teardown.
	private inflate: zlib.InflateRaw | null = null;
	private compressingWrites = false;

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
							await this.doStartTls(step);
							break;
						case "startCompression":
							this.doStartCompression();
							break;
						case "endCompression":
							this.doEndCompression(step);
							break;
						case "close":
							this.socket.end();
							break;
						case "destroy":
							this.socket.destroy();
							break;
					}
				} catch (stepErr) {
					const msg = stepErr instanceof Error ? stepErr.message : String(stepErr);
					throw new Error(`step #${i + 1} (${step.kind}): ${msg}`, {
						cause: stepErr,
					});
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
			if (this.inflate) {
				// COMPRESS=DEFLATE active: decompress first; the inflater's own
				// 'data' handler (doStartCompression) records the PLAINTEXT into
				// the transcript and runs line assembly on it.
				this.inflate.write(data);
				return;
			}
			this.server.transcript.record("C", data);
			this.buffer = Buffer.concat([this.buffer, data]);
			this.drainLines();
		});
	}

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
			// Fall through to look for the next CRLF-terminated segment.
		}

		const idx = this.buffer.indexOf("\r\n");
		// A bare LF without CR is a protocol violation worth failing fast on.
		// Check for one BEFORE the first CRLF too — a bare-LF line arriving in
		// the same chunk as a later, valid CRLF line must still be flagged,
		// not silently absorbed into that line's segment.
		const lf = this.buffer.indexOf("\n");
		if (lf !== -1 && (idx === -1 || lf < idx)) {
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
			return;
		}
		if (idx === -1) {
			return;
		}

		const segment = this.buffer.subarray(0, idx).toString("latin1");
		this.buffer = this.buffer.subarray(idx + 2);

		const lit = ConnectionRunner.LITERAL_RE.exec(segment);
		if (lit) {
			const binary = lit[1] === "~";
			const size = Number(lit[2]);
			if (size > ConnectionRunner.MAX_LITERAL) {
				const w = this.waiting;
				this.waiting = undefined;
				clearTimeout(w.timer);
				w.rejectLine(new Error(`literal announcement too large: ${size} octets`));
				return;
			}
			this.segments.push(segment);
			this.literalsBuf.push(Buffer.alloc(0));
			this.literalNonSync.push(lit[3] === "+");
			this.literalBinary.push(binary);
			this.literalRemaining = size;
			if (lit[3] !== "+") {
				// Synchronizing literal: harness sends continuation automatically
				// (writeWire honors an active compression layer).
				const cont = "+ Ready\r\n";
				this.server.transcript.record("S", cont);
				this.writeWire(Buffer.from(cont, "latin1"));
			}
			// Payload may already be buffered — recurse to consume it.
			this.drainLines();
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
		this.lastBinary = this.literalBinary;
		this.segments = [];
		this.literalsBuf = [];
		this.literalNonSync = [];
		this.literalBinary = [];

		const w = this.waiting;
		this.waiting = undefined;
		clearTimeout(w.timer);
		w.resolveLine(flat);
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

	/**
	 * Puts server bytes on the wire, honoring an active COMPRESS=DEFLATE
	 * layer: while compression is active the plaintext is compressed as a
	 * sync-flushed raw-DEFLATE segment (see the field comment above for why
	 * per-write `deflateRawSync` segments are both valid and race-free)
	 * before hitting the socket. The transcript always records the PLAINTEXT
	 * form (that is what test assertions grep); the compressed span is
	 * bracketed by the start/endCompression `!` markers instead.
	 */
	private writeWire(chunk: Buffer): void {
		if (this.compressingWrites) {
			this.socket.write(
				zlib.deflateRawSync(chunk, { finishFlush: zlib.constants.Z_SYNC_FLUSH }),
			);
			return;
		}
		this.socket.write(chunk);
	}

	private async doSend(step: Extract<ScriptStep, { kind: "send" }>): Promise<void> {
		const data =
			typeof step.data === "string" ? Buffer.from(step.data, "latin1") : step.data;
		if (step.delayMs) await delay(step.delayMs);
		const chunks = step.chunks ?? [data.length];
		let offset = 0;
		for (let i = 0; i < chunks.length; i++) {
			const chunk = data.subarray(offset, offset + chunks[i]);
			offset += chunks[i];
			this.server.transcript.record("S", chunk);
			this.writeWire(chunk);
			// Force separate packets BETWEEN chunks only. No trailing delay
			// after the final write: a post-final await would open an I/O
			// window in which the client's response bytes can be processed
			// BEFORE the next script step runs — for topology-changing steps
			// (startCompression / endCompression) that window mis-routes those
			// bytes through the wrong codec state, a real observed flake.
			// Returning without a trailing await keeps "reply → next step"
			// I/O-atomic (the run loop resumes in the same microtask
			// continuation, ahead of any pending socket 'data' macrotask).
			if (i < chunks.length - 1 || offset < data.length) {
				await delay(1);
			}
		}
		if (offset < data.length) {
			const rest = data.subarray(offset);
			this.server.transcript.record("S", rest);
			this.writeWire(rest);
		}
	}

	private async doExpect(
		step: Extract<ScriptStep, { kind: "expect" }>,
	): Promise<void> {
		const line = await this.nextLine(step.matcher.description);
		const result = step.matcher.match(line);
		// Claim this line's literals unconditionally so a tagless match can
		// never leak its payloads into the next tagged command's record.
		const literals = this.lastLiterals;
		const nonSync = this.lastNonSync;
		const binary = this.lastBinary;
		this.lastLiterals = [];
		this.lastNonSync = [];
		this.lastBinary = [];
		if (result.tag) {
			this.server.commandTags.push(result.tag);
			this.server.commandLines.push({
				tag: result.tag,
				verb: result.verb ?? "",
				args: result.args ?? "",
				literals,
				nonSync,
				binary,
			});
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

	private async doStartTls(
		step: Extract<ScriptStep, { kind: "startTls" }>,
	): Promise<void> {
		if (!this.opts.tlsUpgrade) {
			throw new Error("script has a startTls step but no tlsUpgrade cert configured");
		}
		if (this.buffer.length > 0) {
			throw new Error(
				`client sent ${this.buffer.length} plaintext byte(s) after the STARTTLS OK ` +
					`but before the TLS handshake (negotiation begins immediately after the CRLF)`,
			);
		}
		const expectAbort = step.expectAbort ?? false;
		const plain = this.socket;
		plain.removeAllListeners("data");
		this.server.transcript.record("!", "<TLS handshake (server side)>");

		type HandshakeOutcome =
			| { kind: "secure"; socket: tls.TLSSocket }
			| { kind: "aborted" };

		const outcome = await new Promise<HandshakeOutcome>((resolve, reject) => {
			const t = new tls.TLSSocket(plain, {
				isServer: true,
				key: this.opts.tlsUpgrade!.key,
				cert: this.opts.tlsUpgrade!.cert,
			});
			let settled = false;
			const cleanup = () => {
				t.removeListener("secure", onSecure);
				t.removeListener("error", onError);
				t.removeListener("close", onEnded);
				plain.removeListener("close", onEnded);
			};
			const onSecure = () => {
				if (settled) return;
				settled = true;
				cleanup();
				resolve({ kind: "secure", socket: t });
			};
			const onError = (err: Error) => {
				if (settled) return;
				settled = true;
				cleanup();
				if (expectAbort) {
					resolve({ kind: "aborted" });
				} else {
					reject(err);
				}
			};
			// A client that aborts a handshake mid-flight (e.g. rejecting the
			// server's identity after inspecting the certificate) typically just
			// closes the transport — Node never fires 'secure' or 'error' on the
			// server-side TLSSocket in that case, only 'close' (either on the
			// wrapping TLSSocket or on the raw socket it wraps, depending on how
			// far negotiation got). Without this handler, that outcome would hang
			// this promise — and therefore the whole script — forever.
			const onEnded = () => {
				if (settled) return;
				settled = true;
				cleanup();
				if (expectAbort) {
					resolve({ kind: "aborted" });
				} else {
					reject(
						new Error(
							"the underlying transport closed before the TLS handshake completed " +
								"(the peer aborted the negotiation instead of completing it)",
						),
					);
				}
			};
			t.once("secure", onSecure);
			t.once("error", onError);
			t.once("close", onEnded);
			plain.once("close", onEnded);
		});

		if (outcome.kind === "aborted") {
			// Expected outcome for an expectAbort step: the client tore the
			// connection down instead of completing the handshake. There is
			// nothing further to wire up — the transport is gone.
			return;
		}

		const secured = outcome.socket;
		if (expectAbort) {
			secured.destroy();
			throw new Error(
				"expected the client to abort the TLS handshake (e.g. after a failed " +
					"post-STARTTLS identity check), but the handshake completed successfully",
			);
		}

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

	/**
	 * Activates the RFC 4978 COMPRESS=DEFLATE codec pair (see the
	 * startCompression script step's doc comment). Raw DEFLATE both ways;
	 * incoming client bytes are inflated before line assembly (with the
	 * PLAINTEXT recorded in the transcript), outgoing sends are deflated by
	 * `writeWire()`.
	 */
	private doStartCompression(): void {
		if (this.inflate || this.compressingWrites) {
			throw new Error("startCompression: compression is already active");
		}
		this.server.transcript.record("!", "<DEFLATE compression begins (both directions)>");

		const inflate = zlib.createInflateRaw();
		inflate.on("data", (plain: Buffer) => {
			this.server.transcript.record("C", plain);
			this.buffer = Buffer.concat([this.buffer, plain]);
			this.drainLines();
		});
		inflate.on("error", (err: Error) => {
			this.server.scriptFailed(
				`inflate error (client bytes are not a valid DEFLATE stream — did the ` +
					`client fail to start, or wrongly stop, compressing?): ${err.message}`,
			);
			this.socket.destroy();
		});

		this.inflate = inflate;
		this.compressingWrites = true;
	}

	/**
	 * Deactivates ONE direction of an active COMPRESS=DEFLATE layer (see the
	 * endCompression script step's doc comment — RFC 8437's UNAUTHENTICATE
	 * boundary is per-direction, and the two teardowns sit at different wire
	 * positions). Step transitions are I/O-atomic (the run loop reaches this
	 * step in the same microtask continuation as the preceding expect/reply
	 * settles, before any further socket 'data' event can be processed), so
	 * an "inbound" teardown placed directly after the UNAUTHENTICATE
	 * expectation deterministically beats the client's first plaintext bytes
	 * — no in-flight-through-the-inflater window exists.
	 */
	private doEndCompression(step: Extract<ScriptStep, { kind: "endCompression" }>): void {
		if (step.direction === "inbound") {
			if (!this.inflate) {
				throw new Error("endCompression('inbound'): inbound compression is not active");
			}
			this.server.transcript.record("!", "<DEFLATE compression ends (client->server direction)>");
			this.inflate.removeAllListeners("data");
			this.inflate.removeAllListeners("error");
			this.inflate.destroy();
			this.inflate = null;
			return;
		}
		if (!this.compressingWrites) {
			throw new Error("endCompression('outbound'): outbound compression is not active");
		}
		this.server.transcript.record("!", "<DEFLATE compression ends (server->client direction)>");
		this.compressingWrites = false;
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
	public readonly commandLines: Array<{
		tag: string;
		verb: string;
		args: string;
		literals: Buffer[];
		nonSync: boolean[];
		/**
		 * Per-literal flag: `true` when the literal was announced as an RFC 3516
		 * literal8 (`~{n}` / `~{n+}`, carrying BINARY octets), `false` for an
		 * ordinary `{n}` / `{n+}` literal. Parallel to `literals` / `nonSync`.
		 */
		binary: boolean[];
	}> = [];

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
				{
					key: this.opts.tlsImplicit.key,
					cert: this.opts.tlsImplicit.cert,
					...(this.opts.tlsConstraints ?? {}),
				},
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
