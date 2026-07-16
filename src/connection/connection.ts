import { EventEmitter } from "events";
import * as net from "net";
import { clearTimeout, setTimeout } from "timers";
import * as tls from "tls";
import { TypedEmitter } from "tiny-typed-emitter";

import {
	CapabilityCommand,
	CompressCommand,
	StartTLSCommand,
	UnauthenticateCommand,
	Command,
} from "../commands";
import { ConnectionError, IMAPError, ServerBadError, ServerNoError } from "../errors";
import NewlineTranform from "../newline.transform";
import { wrapCompression } from "./compress";
import type { CompressionLayer } from "./compress";
import Lexer from "../lexer";
import Parser, {
	CapabilityList,
	CapabilityTextCode,
	ContinueResponse,
	StatusResponse,
	TaggedResponse,
	UnknownResponse,
	UntaggedResponse,
} from "../parser";
import type { IMAPLogMessage } from "../types";
import { CapabilityRegistry } from "./capabilities";
import { CRLF } from "./constants";
import CommandQueue from "./queue";
import { Router } from "./router";
import {
	IConnectionEvents,
	IMAPConnectionConfiguration,
	TLSSetting,
} from "./types";
import { ConnectionTimeout, TLSSocketError } from "./errors";
import { openTls } from "./tls";

// NOTE on scope (spec §10.6 pre-confidentiality/state hygiene lane): this
// milestone does NOT implement a blanket "suppress LIST/FLAGS/EXISTS/etc.
// before authenticated/selected state" gate. A large number of ALREADY
// PASSING compliance rows (RFC3501-7-2/7.2.6-1/7.3.1-1/7.3.2-1/7.4.1-1,
// RFC9051-7-2/7.3.5-1/7.4.1-1/7.5.1-1, RFC3348-3-3, and others) observe
// exactly these response types via `connectLow()` with no way to reach
// authenticated/selected state — because LOGIN/SELECT don't exist yet
// (M1). Every one of those rows is indistinguishable, on the wire, from
// RFC9051-11.3-1/-3's scripts (same types, same "never authenticated,
// never selected" state, same connectLow() harness) — a blanket type-based
// suppression gate would silently flip 10+ passing rows to violations to
// win 2. That trade is not taken here; RFC9051-11.3-1/-3 are left
// unflipped and documented as a follow-up for the M1 router/state machine,
// where genuine authenticate()/select() transitions let the older tests
// and the new ones be told apart by real state instead of by coincidence.
// The ALERT-specific carve-out (RFC9051-11.3-2) has no such conflict — see
// `handleStatusResponse()` below — and IS implemented.

const DEFAULT_TIMEOUT = 10000;

export default class Connection extends TypedEmitter<IConnectionEvents> {
	public socket: undefined | net.Socket | tls.TLSSocket;

	protected lexer!: Lexer;
	protected parser!: Parser;
	protected processingPipeline!: NewlineTranform;

	/** Response routing (spec §8): tag/claimant/continuation-owner
	 *  attribution used by `runCommand()`'s queue-driven execution. Public
	 *  so `connection/queue.ts`'s command execution helper can reach it. */
	public router!: Router;

	private options: IMAPConnectionConfiguration;
	private commandQueue!: CommandQueue;
	private connected: boolean;
	private secure?: boolean;

	/**
	 * Set once `compress()` (RFC 4978, M5.9) has successfully negotiated
	 * COMPRESS=DEFLATE: the inflate/deflate Transform pair currently
	 * interposed on the socket (`send()`/`writeBytes()` route through it
	 * instead of the socket directly). `null` until then, and reset back to
	 * `null` on every teardown -- COMPRESS is a one-shot, per-connection
	 * upgrade (no un-COMPRESS), so a later `connect()` on this same
	 * instance always starts uncompressed again, same posture as `secure`/
	 * `preauthed`.
	 */
	private compression: CompressionLayer | null = null;

	/**
	 * Set once a PREAUTH greeting is accepted (spec §10.5, I-8): the
	 * connection is already authenticated by external means. `Session`
	 * consults this (via the `authenticated` getter) to mark itself
	 * authenticated without ever issuing LOGIN/AUTHENTICATE. Reset on
	 * every socket close so a later `connect()` on the same instance
	 * starts from a clean slate.
	 */
	private preauthed = false;

	/**
	 * Precursor to the spec §3.5 `CapabilityRegistry` (I-2): the STARTTLS
	 * upgrade invalidates it on handshake success and re-populates it from
	 * the post-TLS CAPABILITY round trip; `Session` consults it after
	 * `connect()` resolves so it doesn't re-issue CAPABILITY a second time
	 * when the registry is already valid.
	 */
	public readonly capabilityRegistry = new CapabilityRegistry();

	/**
	 * Injectable LITERAL+/LITERAL- (RFC 7888) capability probe, consulted by
	 * `executeCommand()` when it builds each command's `CommandWriter` (spec
	 * §7.2/§6.2's literal-form decision). `null` until a Layer-2 owner (e.g.
	 * `ImapClient`, in its constructor) calls `setCapabilityProbe()`.
	 *
	 * WHY THIS EXISTS: `capabilityRegistry` immediately above is this
	 * connection's OWN precursor registry, populated ONLY around STARTTLS
	 * (see its doc comment) — every other capability source (the initial
	 * greeting's `[CAPABILITY ...]` code, a plain CAPABILITY command, a
	 * tagged-OK response code, ENABLE) is ingested exclusively into
	 * `ImapClient`'s separate, live `CapabilityView` registry
	 * (src/client/capabilities.ts). Reading only `capabilityRegistry` here
	 * would make the LITERAL+/LITERAL- probe blind to nearly every real
	 * capability announcement, forcing every literal to the synchronizing
	 * form regardless of what the server actually advertised. Layer 2 fixes
	 * that by injecting a probe backed by its own up-to-date registry.
	 */
	private capabilityProbe: ((cap: string) => boolean) | null = null;

	/**
	 * Wires an external capability probe (typically `(cap) =>
	 * this.capabilityRegistry.view.has(cap)` from `ImapClient`'s own live
	 * registry) for `executeCommand()`'s LITERAL+/LITERAL- wire-form
	 * decision. Optional: a Layer-1-only caller that never calls this keeps
	 * the conservative fallback below (`getCapabilityProbe()`), which never
	 * reports a capability as present unless this connection has genuinely
	 * observed it -- so every literal stays synchronizing, which is always
	 * protocol-correct even when suboptimal.
	 */
	public setCapabilityProbe(probe: (cap: string) => boolean): void {
		this.capabilityProbe = probe;
	}

	/**
	 * Resolves the effective capability probe for `executeCommand()`: the
	 * injected probe if `setCapabilityProbe()` was called, else a fallback
	 * onto this connection's OWN precursor `capabilityRegistry` (accurate
	 * immediately after a STARTTLS upgrade, `null`/empty otherwise), else
	 * always-false. The fallback is deliberately still consulted rather than
	 * skipped straight to always-false: it costs nothing (same registry this
	 * class already maintains for its own STARTTLS bookkeeping) and can only
	 * ever make a Layer-1-only caller's literals MORE accurate, never less
	 * conservative -- `capabilityRegistry` is only ever populated from a real
	 * CAPABILITY response, so it can't manufacture a false "supported".
	 */
	public getCapabilityProbe(): (cap: string) => boolean {
		if (this.capabilityProbe) {
			return this.capabilityProbe;
		}
		return (cap: string) => this.capabilityRegistry.value?.has(cap) ?? false;
	}

	/**
	 * Internal, untyped fanout of EVERY untagged status response — including
	 * the greeting — fired BEFORE `handleStatusResponse()`'s consumer-facing
	 * ALERT suppression gate (CRITICAL-3). `awaitGreeting()` listens here
	 * instead of on the public `serverStatus` event so a legal `* OK [ALERT]
	 * ...` (or PREAUTH/BYE-with-ALERT) greeting still resolves the greeting
	 * wait even though it's never surfaced as a trusted `serverStatus` event
	 * pre-confidentiality. Purely an implementation detail — it changes
	 * nothing about what consumers observe via the public event map.
	 */
	private readonly rawStatusEvents = new EventEmitter();

	/**
	 * Armed for the duration of an in-flight `connect()` call: kept attached
	 * to whatever socket currently exists (plain, implicit-TLS, or the
	 * post-STARTTLS-upgrade socket) so a socket failure at ANY phase rejects
	 * the in-flight `connect()` promise instead of hanging it, and is never
	 * an unhandled `error` event (which would crash the process) — CRITICAL-2.
	 * Cleared and replaced by the permanent `onSocketError` handler once
	 * `connect()` succeeds.
	 */
	private transientConnectError?: (err: unknown) => void;

	/**
	 * Teardown listeners (CRITICAL-2): fired whenever this connection's
	 * transport tears down while a command may still be in flight
	 * (`onSocketClose`, `teardownFailedConnect`) so `execute-command.ts` can
	 * race a suspended continuation/tagged-response wait against teardown
	 * instead of leaving it — and the `finally` cleanup that depends on it
	 * running — dangling forever. See `onTeardown()`.
	 */
	private readonly teardownListeners = new Set<(err: ConnectionError) => void>();

	/**
	 * Registers `cb` to be invoked (with a `ConnectionError`) the next time
	 * this connection tears down mid-flight. Returns an unsubscribe
	 * function — `execute-command.ts` always calls it in its own `finally`
	 * once a command settles (whether via teardown or normally), so a
	 * long-lived `Connection` never accumulates one live listener per
	 * historical command.
	 */
	public onTeardown(cb: (err: ConnectionError) => void): () => void {
		this.teardownListeners.add(cb);
		return () => {
			this.teardownListeners.delete(cb);
		};
	}

	/** Fires every currently-registered teardown listener with `err`, then
	 *  clears the set (each registration is meant to fire at most once). */
	private fireTeardown(err: ConnectionError): void {
		const listeners = [...this.teardownListeners];
		this.teardownListeners.clear();
		for (const cb of listeners) {
			cb(err);
		}
	}

	/**
	 * (Re-)attaches the transient connect-time error handler to the CURRENT
	 * `this.socket`. Called after every socket (re)assignment during
	 * `connect()` — including the mid-flight swap to the TLS socket in
	 * `starttls()` — so the handler always tracks the live socket rather than
	 * a socket that's since been replaced. A no-op if there's no live socket
	 * or no in-flight `connect()` (i.e. no handler has been armed).
	 */
	private rebindTransientErrorHandler(): void {
		if (!this.socket || !this.transientConnectError) {
			return;
		}
		this.socket.off("error", this.transientConnectError);
		this.socket.on("error", this.transientConnectError);
	}

	/**
	 * Shared teardown for every `connect()` failure path (CRITICAL-1,
	 * CRITICAL-2): destroys whatever socket exists, resets every piece of
	 * per-attempt state (including `preauthed` — a stale `true` here would
	 * let a LATER, unrelated `connect()` attempt on this same instance skip
	 * STARTTLS eligibility and silently resolve over plaintext), and stops
	 * the command queue so a hold engaged mid-STARTTLS can never survive a
	 * torn-down connection attempt.
	 */
	private teardownFailedConnect(): void {
		if (this.transientConnectError) {
			this.socket?.off("error", this.transientConnectError);
		}
		this.socket?.destroy();
		this.socket = undefined;
		this.secure = undefined;
		this.connected = false;
		this.preauthed = false;
		this.compression?.destroy();
		this.compression = null;
		this.commandQueue.stop();
		this.transientConnectError = undefined;
		// CRITICAL-2: a command (e.g. the STARTTLS/CAPABILITY round trips that
		// run DURING connect() itself) can be in flight when a connect()
		// attempt aborts here — clear router state and unstick any suspended
		// `executeCommand()` wait the same way a steady-state teardown does
		// (see `onSocketClose`), so a stale registration can't survive into a
		// later connect() attempt on this same instance.
		this.router.reset();
		this.fireTeardown(
			new ConnectionError("Connection attempt aborted", { phase: "connect" }),
		);
	}

	constructor(options: IMAPConnectionConfiguration) {
		super();
		// Shallow copy options so we're not modifying the original object
		this.options = Object.assign({}, options);

		// Set TLS setting to default if it is unset or invalid
		const { tls } = this.options;
		if (
			!tls ||
			!(
				tls === TLSSetting.DEFAULT ||
				tls === TLSSetting.STARTTLS ||
				tls === TLSSetting.STARTTLS_OPTIONAL ||
				tls === TLSSetting.FORCE_OFF
			)
		) {
			this.options.tls = TLSSetting.DEFAULT;
		}

		this.connected = false;

		this.init();
	}

	get isActive(): boolean {
		return this.connected;
	}

	get isSecure(): boolean {
		return !!(this.connected && this.secure);
	}

	/** `true` once `compress()` has successfully negotiated COMPRESS=DEFLATE
	 *  on this connection (RFC 4978, M5.9). Unlike `isSecure`, this does NOT
	 *  gate on `this.connected` -- `ImapClient.compress()`'s idempotency
	 *  guard (reject a second attempt) needs to read this synchronously
	 *  right up until teardown actually clears it. */
	get isCompressed(): boolean {
		return !!this.compression;
	}

	/**
	 * `true` once a PREAUTH greeting has been accepted (spec §10.5). This is
	 * the only way this milestone's `Connection` ever becomes authenticated
	 * — there is no LOGIN/AUTHENTICATE yet (M1).
	 */
	get authenticated(): boolean {
		return this.preauthed;
	}

	/**
	 * Notification channel (spec I-7/§10.6). Always safe to call — defaults
	 * to a no-op when the caller didn't configure a `logger`.
	 */
	protected log(info: IMAPLogMessage): void {
		this.options.logger?.(info);
	}

	public async connect(): Promise<boolean> {
		if (this.connected) {
			throw new IMAPError(
				"Must end previous IMAP connection before starting a new one",
			);
		} else if (this.socket) {
			throw new IMAPError(
				"Existing IMAP connection or connection attempt must be fully closed before a new one can be made",
			);
		}

		const {
			host,
			port,
			tls: tlsSetting,
			tlsOptions,
			timeout,
		} = this.options;
		if (typeof port !== "number") {
			throw new IMAPError(
				"A port must be provided in the connection configuration",
			);
		}
		this.socket = undefined;
		const timeoutWait = timeout || DEFAULT_TIMEOUT;

		// CRITICAL-2 adjacent: fresh newline-splitter/lexer/parser chain for
		// THIS attempt — see `resetProcessingPipeline()`'s own doc comment for
		// why reusing the previous attempt's (possibly already-`destroyed`)
		// chain silently breaks incoming-data parsing on a later reconnect.
		this.resetProcessingPipeline();

		// CRITICAL-1: every attempt starts from a clean slate. Without this,
		// a Connection that saw a rejected cleartext PREAUTH greeting on a
		// prior attempt (which sets `preauthed = true` BEFORE the
		// mandatory-TLS policy check throws) would carry that stale flag into
		// a later, successful connect() on the same instance — skipping
		// STARTTLS eligibility below and silently resolving over plaintext
		// while reporting authenticated.
		this.preauthed = false;

		// CRITICAL-2: armed for the whole ritual below. Any socket 'error'
		// event before the permanent handler is installed at the very end
		// rejects `connectAbort` (raced against every hazardous await) —
		// never an unhandled 'error' event, never a hang — and defensively
		// stops the command queue so a hold engaged mid-STARTTLS can never
		// survive the failure.
		let rejectConnectAbort!: (err: Error) => void;
		const connectAbort = new Promise<never>((_, reject) => {
			rejectConnectAbort = reject;
		});
		// A "losing" racer in Promise.race is still attached to via race's
		// internals (no unhandled-rejection risk from that), but this promise
		// is also used stand-alone as a rejection source; give it its own
		// harmless catch so a codepath that never races it can't warn either.
		connectAbort.catch(() => undefined);
		this.transientConnectError = (err: unknown) => {
			this.commandQueue.stop();
			rejectConnectAbort(err instanceof Error ? err : new Error(String(err)));
		};

		let connected: boolean;

		try {
			if (tlsSetting === TLSSetting.DEFAULT) {
				// Implicit TLS: every TLS socket is created through the ONE TLS
				// policy module. A handshake or identity failure rejects here
				// (never a hang, never a boolean-false resolve) — let it
				// propagate to the caller after tearing down any partial state.
				this.socket = await openTls({
					host,
					port,
					timeoutMs: timeoutWait,
					tlsOptions,
				});
				this.secure = true;
				connected = true;
				this.rebindTransientErrorHandler();
			} else {
				connected = await Promise.race([
					new Promise<boolean>((resolve, reject) => {
						// Setup a simple timeout
						let connTimeout: NodeJS.Timeout | undefined = setTimeout(() => {
							// Check to make sure we didn't already close the connection
							if (!this.socket) {
								return;
							}

							connTimeout = undefined;
							const tmrErr = new ConnectionTimeout(timeoutWait, "Socket");
							this.socket.destroy(tmrErr);
							this.socket = undefined;
							reject(tmrErr);
						}, timeoutWait);
						const clearTimer = (connected) => {
							return () => {
								if (connTimeout) {
									clearTimeout(connTimeout);
									connTimeout = undefined;
									resolve(connected);
								}
								// The socket may have already been cleared out (e.g. by
								// the timeout above), in which case there's nothing
								// left to unregister these listeners from.
								this.socket?.off("end", clearTimerBad);
								this.socket?.off("close", clearTimerBad);
							};
						};
						const clearTimerGood = clearTimer(true);
						const clearTimerBad = clearTimer(false);
						this.socket = net.connect(
							{
								host,
								port,
							},
							clearTimerGood,
						);
						this.secure = false;
						// Armed as soon as the socket exists (CRITICAL-2): an
						// ECONNREFUSED/ECONNRESET here previously had no
						// listener at all, which is an unhandled 'error' event
						// (process crash) rather than a rejected connect().
						this.rebindTransientErrorHandler();
						this.socket.once("end", clearTimerBad);
						this.socket.once("close", clearTimerBad);
					}),
					connectAbort,
				]);

				if (!connected) {
					this.socket = undefined;
					return false;
				}
			}
		} catch (err) {
			this.teardownFailedConnect();
			throw err;
		}

		this.socket!.pipe(this.processingPipeline);

		// The queue must be running before a STARTTLS upgrade so its
		// CAPABILITY/STARTTLS commands go through the same isolated-context +
		// hold/release machinery every other command does (§6.1, I-1) instead
		// of writing directly to the socket. `this.connected` stays false
		// until the whole connect() ritual resolves further down — only the
		// queue's own "may I write" state needs to be live this early.
		this.commandQueue.start();

		// Every connect path — plain, implicit TLS, and STARTTLS — waits for
		// the greeting here, exactly once, before anything else runs. This
		// resolves BYE/PREAUTH/policy checks (§10.5, I-8) up front instead of
		// only inside starttls(); the STARTTLS path below reuses this same
		// already-resolved greeting rather than waiting for a second one.
		let greeting: StatusResponse;
		try {
			greeting = await Promise.race([this.awaitGreeting(), connectAbort]);
		} catch (err) {
			this.teardownFailedConnect();
			throw err;
		}

		if (
			!this.isSecure &&
			!this.preauthed &&
			(tlsSetting === TLSSetting.STARTTLS ||
				tlsSetting === TLSSetting.STARTTLS_OPTIONAL)
		) {
			try {
				connected = await Promise.race([
					this.starttls(greeting),
					connectAbort,
				]);
			} catch (err) {
				// A failed STARTTLS upgrade leaves the connection dead — never
				// continue cleartext after a failed handshake. Tear down so a
				// later disconnect()/end() can't hang on a half-open client.
				this.teardownFailedConnect();
				throw err;
			}
			// NOTE: `connected` (the local outcome of starttls(), just
			// assigned above) is the right thing to check here — NOT
			// `this.isSecure`. `isSecure` is gated on `this.connected`, the
			// instance field, which is not assigned until after this whole
			// `if` block (a few lines down); reading it here always
			// observes `false`, so `!this.isSecure` was always `true` and
			// this branch threw "Could not establish a secure connection"
			// even after a successful upgrade — the bug that made every
			// strict-STARTTLS connect() fail regardless of outcome.
			if (!connected && tlsSetting === TLSSetting.STARTTLS) {
				this.teardownFailedConnect();
				throw new TLSSocketError(
					"Could not establish a secure connection",
					"policy",
				);
			}
			this.rebindTransientErrorHandler();
		}

		this.connected = connected;
		if (!connected) {
			this.teardownFailedConnect();
			return false;
		}

		this.socket!.off("error", this.transientConnectError!);
		this.transientConnectError = undefined;
		// CRITICAL-2 adjacent: `onSocketError`/`onSocketEnd`/`onSocketClose` are
		// long-lived instance methods reused across every `connect()` on this
		// same `Connection` — their bodies read `this.socket` (the CURRENT
		// field), not a reference captured at bind time. A stale 'error'/
		// 'end'/'close' event arriving LATE from an already-superseded socket
		// (e.g. a mid-command drop immediately followed by a successful
		// reconnect on the SAME instance, well within this same event-loop
		// turn) would otherwise act on whatever `this.socket` NOW points to —
		// stopping the queue, ending, or tearing down a totally unrelated,
		// healthy connection. `guard()` makes each handler a no-op once
		// `this.socket` has moved on from the socket it was registered
		// against (including the ordinary case where an earlier handler for
		// the SAME teardown already nulled it out).
		const boundSocket = this.socket!;
		const guard =
			<A extends unknown[]>(fn: (...args: A) => void) =>
			(...args: A) => {
				if (this.socket !== boundSocket) {
					return;
				}
				fn(...args);
			};
		boundSocket.on("error", guard(this.onSocketError));
		boundSocket.once("end", guard(this.onSocketEnd));
		boundSocket.once("close", guard(this.onSocketClose));

		// Manually call because the ready event will likely have passed
		this.onSocketReady();
		this.emit("ready", this.isSecure);
		return this.connected;
	}

	// Socket event handlers
	protected onSocketReady = () => {
		this.connected = true;
		this.commandQueue.start();
	};
	protected onSocketError = (err) => {
		this.emit("connectionError", new IMAPError(err));
	};
	protected onSocketClose = (hadErr: boolean) => {
		this.commandQueue.stop();
		this.connected = false;
		// If compress() ever activated, the socket's read side is piped into
		// `inflate`, not `processingPipeline` directly (see `wrapCompression`)
		// -- destroy the compression layer FIRST so its own `unpipe()` calls
		// run against a still-live socket, then the direct-pipe `unpipe()`
		// below is the correct (and harmless, if compression was active and
		// this never was a direct pipe) cleanup for the uncompressed case.
		this.compression?.destroy();
		this.compression = null;
		this.socket!.unpipe(this.processingPipeline);
		this.processingPipeline.forceNewLine(false);
		this.socket!.removeAllListeners();
		this.socket = undefined;
		this.secure = undefined;
		// A closed connection can't have "current" capabilities — a later
		// connect() on this same Connection instance must not let a
		// previous session's (possibly post-TLS) capability data leak into
		// the new one. Same reasoning for `preauthed`: a fresh connect() on
		// this instance starts from Not Authenticated again.
		this.capabilityRegistry.invalidate();
		this.preauthed = false;
		// CRITICAL-2: clear router registries (tag map / claimants /
		// continuation owner) and unstick any `executeCommand()` invocation
		// still suspended waiting on a continuation or tagged response that
		// will now never arrive — a mid-command socket drop otherwise leaves
		// a stale `continuationOwner` that makes the NEXT
		// connect()/authenticate() on this same instance throw synchronously
		// ("continuation owner already registered"). Both run BEFORE
		// 'disconnected' fires so a synchronous reconnect from a
		// 'disconnected' listener never observes stale router state.
		this.router.reset();
		this.fireTeardown(
			new ConnectionError("Connection closed while a command was pending", {
				phase: "steady",
			}),
		);
		this.emit("disconnected", !hadErr);
	};
	protected onSocketEnd = () => {
		this.commandQueue.stop();
		this.connected = false;
		this.socket!.end();
	};

	public async disconnect(error?: Error) {
		if (!this.socket) {
			return;
		}

		// Socket closing event handles cleanup
		this.socket.destroy(error);
	}

	public async runCommand<T>(command: Command<T>): Promise<T> {
		return this.commandQueue.add<T>(command);
	}

	/**
	 * M4.1 (spec §3.7): subscribes to the queue's "another context was just
	 * queued behind the currently-active isolated context" signal (see
	 * `CommandQueue`'s `contextQueuedBehindIsolated` event, `connection/
	 * queue.ts`, for the full design rationale) — `IdleController`'s only
	 * way to learn that a command submission needs it to send `DONE`.
	 * Returns an unsubscribe function.
	 */
	public onQueueContextQueuedBehindIsolated(cb: () => void): () => void {
		this.commandQueue.on("contextQueuedBehindIsolated", cb);
		return () => this.commandQueue.off("contextQueuedBehindIsolated", cb);
	}

	public send(toSend: string) {
		this.writeBytes(Buffer.from(toSend + CRLF, "utf8"));
	}

	/**
	 * Writes already-fully-serialized wire bytes, with no CRLF/encoding
	 * applied — used exclusively by `connection/execute-command.ts` to write
	 * `CommandWriter`'s byte-exact segments (spec I-4: all client bytes go
	 * through `CommandWriter`; this is the one place those bytes actually
	 * reach the wire). Once `compress()` has activated (RFC 4978), every
	 * byte is routed through the DEFLATE write path instead of straight to
	 * the socket -- this is the ONE chokepoint both `send()` above and
	 * `execute-command.ts` funnel through, so neither has to know whether
	 * compression is active.
	 */
	public writeBytes(buf: Buffer): void {
		if (this.compression) {
			this.compression.write(buf);
			return;
		}
		this.socket!.write(buf);
	}

	protected init() {
		this.commandQueue = new CommandQueue(this, false);
		this.router = new Router({
			log: (info) => this.log(info),
			isSecure: () => !!this.secure,
			emitRawStatus: (resp) => this.rawStatusEvents.emit("status", resp),
			emitUntagged: (resp) => this.emit("untaggedResponse", resp),
			emitTagged: (resp) => this.emit("taggedResponse", resp),
			emitContinue: (resp) => this.emit("continueResponse", resp),
			emitUnknown: (resp) => this.emit("unknownResponse", resp),
			emitResponse: (resp) => this.emit("response", resp),
			emitServerStatus: (resp) => this.emit("serverStatus", resp),
			emitUnhandled: (resp) => this.emit("unhandled", resp),
			emitAlert: (text, meta) => this.emit("alert", text, meta),
		});
		this.resetProcessingPipeline();
	}

	/**
	 * (Re-)builds the whole newline-splitter -> lexer -> parser `.pipe()`
	 * chain, and re-wires the parser's event fan-out into the (persistent)
	 * `router`. CRITICAL-2 adjacent: called once from the constructor AND
	 * fresh at the top of every `connect()` attempt (see below) — NOT just
	 * once for the lifetime of this `Connection` instance. `.pipe()`
	 * auto-`end()`s its destination once the SOURCE emits a graceful 'end'
	 * (a FIN, as opposed to an abrupt RST, which produces 'close'/'error'
	 * with no 'end' at all); a stream Node has fully finished is, by
	 * default (`autoDestroy`), then also `destroyed`. Since `processingPipeline`
	 * used to be built exactly once, in the constructor, ANY connection that
	 * ended gracefully — an ordinary, successful teardown, not just a
	 * mid-command drop — permanently killed it: bytes arriving on a LATER
	 * `connect()`'s new socket would be piped into an already-destroyed
	 * transform stream and simply vanish before ever reaching the parser,
	 * surfacing as an inexplicable greeting/command timeout with no error at
	 * all. Rebuilding the chain fresh every attempt is the fix.
	 */
	private resetProcessingPipeline(): void {
		this.processingPipeline = new NewlineTranform({
			allowHalfOpen: true,
			// §11.4/§5.4 (M3.1 resolution): explicit socket-level
			// backpressure keyed to live literal-stream consumption, NOT
			// pipe-chain backpressure (see the removed `parser.resume()`
			// note below for why that's abandoned as a mechanism). Reads
			// `this.socket` lazily -- this transform is (re)built before a
			// socket exists for this connect() attempt.
			socketControl: {
				pause: () => this.socket?.pause(),
				resume: () => this.socket?.resume(),
			},
		});
		this.lexer = new Lexer();
		this.parser = new Parser();

		// Pipe from our newline splitter to lexer to parser
		this.processingPipeline.pipe(this.lexer).pipe(this.parser);
		// Once we hit the parser, everything is routed through the response
		// router (spec §8) — which reproduces exactly the same public event
		// fan-out (+ ALERT/hygiene handling) M0 always has, and additionally
		// drives tag/claimant/continuation-owner attribution for
		// `runCommand()`.
		this.parser.on("untagged", (resp: UntaggedResponse) => {
			this.router.routeUntagged(resp);
		});
		this.parser.on("tagged", (resp: TaggedResponse) => {
			this.router.routeTagged(resp);
		});
		this.parser.on("continue", (resp: ContinueResponse) => {
			this.router.routeContinuation(resp);
		});
		this.parser.on("unknown", (resp: UnknownResponse | null) => {
			this.router.routeUnknown(resp);
		});

		// NOTE (M2.2 -> M3.2): `Parser` used to `push()` every parsed
		// response onto its own (unconsumed) Readable side, which
		// deadlocked the whole pipeline past ~16 cumulative responses on one
		// connection once objectMode's default `highWaterMark` was crossed
		// (fixed at the time by a `parser.resume()` call here that discarded
		// backpressure entirely). `parser.ts` no longer `push()`es at all --
		// see its `_transform` doc comment -- which removes the deadlock
		// class at the root instead of suppressing it, and makes the
		// `.resume()` call that used to sit here unnecessary. Real
		// backpressure (§5.4's "don't advance past a live stream") is now
		// handled at the socket level by `NewlineTranform`, wired above.
	}

	/**
	 * Waits for the server's greeting — the first untagged status response
	 * of the connection — and applies spec §10.5's PREAUTH policy. Used by
	 * EVERY connect() path (plain, implicit TLS, STARTTLS) exactly once;
	 * the STARTTLS path is handed the resolved value instead of waiting for
	 * a second one.
	 *
	 * Resolves with the greeting's `StatusResponse` (status OK or PREAUTH).
	 * Rejects:
	 *  - on a BYE greeting (`IMAPError`, carrying the server's text);
	 *  - on timeout (`ConnectionTimeout`, phase "Greeting");
	 *  - on a PREAUTH greeting received over a cleartext socket while
	 *    `tls: "starttls"` (mandatory TLS) is configured: PREAUTH forecloses
	 *    STARTTLS-before-auth (STARTTLS is only legal in Not Authenticated
	 *    state, and PREAUTH means the connection is already authenticated),
	 *    so there is no longer any path to the confidentiality the config
	 *    demands — rejects `TLSSocketError(..., "policy")`. `tls:
	 *    "opportunistic"` tolerates cleartext PREAUTH (documented residual
	 *    risk, spec §10.5); implicit TLS/an already-secure socket is fine
	 *    either way.
	 */
	protected async awaitGreeting(): Promise<StatusResponse> {
		const greeting = await new Promise<UntaggedResponse>(
			(resolve, reject) => {
				const greetingTimeoutAmount =
					this.options.timeout || DEFAULT_TIMEOUT;
				// CRITICAL-3: listen on the internal pre-suppression fanout,
				// not the public `serverStatus` event — an ALERT-carrying
				// greeting is never emitted as `serverStatus` pre-
				// confidentiality, but it MUST still resolve this wait.
				const onStatus = (resp: UntaggedResponse) => {
					clearTimeout(greetingTimeout);
					resolve(resp);
				};
				const greetingTimeout = setTimeout(() => {
					// LOW-14a: the timeout path must remove this listener too
					// — previously only the resolved path did (implicitly, via
					// `once` firing), leaking one listener per timed-out
					// greeting wait.
					this.rawStatusEvents.off("status", onStatus);
					reject(
						new ConnectionTimeout(
							greetingTimeoutAmount,
							"Greeting",
						),
					);
				}, greetingTimeoutAmount);
				this.rawStatusEvents.once("status", onStatus);
			},
		);

		if (!(greeting.content instanceof StatusResponse)) {
			throw new IMAPError(
				"Error processing greeting message from server: Invalid content type",
			);
		}

		const status = greeting.content;

		if (status.status === "BYE") {
			throw new IMAPError(
				`Server rejected the connection with a BYE greeting: ${
					status.text?.content ?? ""
				}`,
			);
		}

		if (status.status === "PREAUTH") {
			this.preauthed = true;
			if (!this.secure && this.options.tls === TLSSetting.STARTTLS) {
				throw new TLSSocketError(
					"Server sent a PREAUTH greeting over a cleartext connection while STARTTLS was mandatory; PREAUTH forecloses STARTTLS-before-auth (spec §10.5)",
					"policy",
				);
			}
		}

		return status;
	}

	protected async starttls(greeting: StatusResponse): Promise<boolean> {
		// NOTE: this is invoked from connect() before `this.connected` is
		// set (that assignment happens after this whole STARTTLS step, once
		// the overall connect() ritual has resolved) — so this guard must
		// not depend on it. A live `this.socket` is the correct signal for
		// "there is a transport to upgrade"; `this.isSecure` (also gated on
		// `this.connected`) is likewise never true here in practice, but is
		// kept for safety in case a future public starttls() entry point
		// calls this post-connect.
		if (this.isSecure) {
			// Already secure: nothing left to do, and that's success.
			return true;
		}
		if (!this.socket) {
			// No transport at all to upgrade — can't proceed either way.
			return false;
		}

		let capabilities: CapabilityList;
		if (greeting.text?.code instanceof CapabilityTextCode) {
			// We have a capability list already! Yay. This is ONLY used
			// locally to decide whether STARTTLS is worth attempting — it is
			// never written into `capabilityRegistry`, so there's nothing to
			// discard post-upgrade (I-2): pre-TLS capability data was never
			// exposed as "current" to begin with.
			capabilities = greeting.text.code.capabilities;
		} else {
			// We need to retrieve the capabilities. Goes through the queue
			// (not a bare `cmd.run(this)`) so it participates in the same
			// isolated-context bookkeeping STARTTLS itself relies on.
			capabilities = await this.runCommand(new CapabilityCommand());
		}

		if (capabilities.doesntHave("STARTTLS")) {
			// HIGH-4: opportunistic (`STARTTLS_OPTIONAL`) mode continues on
			// the CURRENT (cleartext) transport when the server doesn't
			// advertise STARTTLS — spec §3.3: "opportunistic continues
			// cleartext"; only a FAILED negotiation is fatal, an absent
			// capability is not. `true` here means exactly that: connect()
			// should treat this as success and resolve over plaintext.
			// Strict (`STARTTLS`) mode must still fail when there's nothing
			// to upgrade to — `false` here is what lets connect()'s
			// `!connected && tlsSetting === STARTTLS` check turn this into
			// the mandatory-TLS policy-error teardown.
			return this.options.tls !== TLSSetting.STARTTLS;
		}

		const tlsCmd = new StartTLSCommand();
		// `runCommand()` synchronously adds the command to its (isolated,
		// because StartTLSCommand.requiresOwnContext) queue context, which —
		// since the queue isn't held yet — synchronously writes the STARTTLS
		// command bytes before this call returns. Holding the queue right
		// after that still lets STARTTLS's own bytes through while blocking
		// every other command from writing anything until release() below —
		// the §6.1 drain guarantee behind I-1 (no bytes between the STARTTLS
		// tagged OK and handshake completion).
		const negotiationResult = this.runCommand(tlsCmd);
		this.commandQueue.hold();

		let startNegotiation: boolean;
		try {
			startNegotiation = await negotiationResult;
		} catch (err) {
			this.commandQueue.release();
			throw err;
		}

		if (!startNegotiation) {
			// In theory we shouldn't be able to hit this as
			// the above should throw if we can't negotiate,
			// but want to be safe
			this.commandQueue.release();
			return false;
		}

		// MEDIUM-7 (STARTTLS command-injection defense): the tagged OK for
		// STARTTLS was just observed. Discard any buffered-but-not-yet-
		// complete line sitting in the processing pipeline right now, before
		// touching the socket at all — the same discard `onSocketClose` does
		// for the same reason. A server that packs extra plaintext bytes into
		// the same TCP segment as the tagged OK (the classic STARTTLS
		// plaintext-injection shape) must never have that residue carried
		// across the TLS boundary and misread as a post-handshake response.
		this.processingPipeline.forceNewLine(false);

		// We already checked for `this.socket` above, so it must still be
		// set here. Upgrade it in place through the ONE TLS policy module —
		// `tlsOptions.socket` here is the module's own internal wiring of
		// the existing plaintext socket, not a caller-supplied override (the
		// merge guard in openTls() applies to caller-supplied `tlsOptions`).
		const previousSocket = this.socket!;
		previousSocket.unpipe(this.processingPipeline);

		let tlsSock: tls.TLSSocket;
		try {
			tlsSock = await openTls({
				host: this.options.host,
				socket: previousSocket,
				timeoutMs: this.options.timeout || DEFAULT_TIMEOUT,
				tlsOptions: this.options.tlsOptions,
			});
		} catch (err) {
			// Handshake failure ends the I-1 window — release so the queue
			// isn't left permanently wedged. connect() tears the whole
			// connection down regardless of this release.
			this.commandQueue.release();
			throw err;
		}

		// MEDIUM-6: swap to the new secure socket BEFORE releasing the held
		// queue. `release()` synchronously flushes anything parked during the
		// hold — a command parked there must be dispatched against the NEW
		// (TLS) socket, never the old plaintext one it would otherwise still
		// see if release() ran first.
		this.socket = tlsSock;
		this.secure = true;
		this.socket.pipe(this.processingPipeline);
		// CRITICAL-2: the transient connect-time error handler was bound to
		// `previousSocket`; follow the swap so a socket failure between here
		// and the permanent handler's installation (e.g. during the post-TLS
		// CAPABILITY round trip below) still rejects the in-flight connect()
		// instead of crashing or hanging it.
		this.rebindTransientErrorHandler();
		this.commandQueue.release();

		// I-2: discard everything captured before confidentiality was
		// established, then re-issue CAPABILITY over the now-protected
		// channel before connect() resolves (spec §10.4). `Session` consults
		// `capabilityRegistry` and reuses this value instead of re-fetching.
		this.capabilityRegistry.invalidate();
		const postTlsCapabilities = await this.runCommand(
			new CapabilityCommand(),
		);
		this.capabilityRegistry.set(postTlsCapabilities);

		return true;
	}

	/**
	 * COMPRESS DEFLATE (RFC 4978, M5.9) — modeled directly on `starttls()`
	 * above, with one structural difference: STARTTLS swaps the socket
	 * itself (plaintext -> TLS); COMPRESS interposes a codec on the SAME
	 * socket (`wrapCompression`, `connection/compress.ts`) instead of
	 * replacing it. Capability gating (I-9: `CapabilityError` with zero
	 * bytes written when `COMPRESS=DEFLATE` isn't advertised) and the
	 * "already compressed" idempotency guard both live one layer up, in
	 * `ImapClient.compress()` — this method assumes both have already been
	 * checked and simply runs the negotiation, exactly the same division of
	 * labor as `starttls()`'s own capability check living in the connect()
	 * ritual rather than here... except `starttls()` DOES still check
	 * locally (it runs before `ImapClient` exists during the initial
	 * connect() ritual); `compress()` is only ever reachable post-connect,
	 * through `ImapClient`, so its capability gate is the ONE place that
	 * check lives.
	 *
	 * Resolves `true` once compression is active, `false` if the server
	 * declined with a tagged NO/BAD (RFC4978-3-3: the client "MUST NOT turn
	 * on compression" after such a result — an ordinary, non-fatal decline,
	 * not a connection failure, since COMPRESS itself is only ever a
	 * RFC4978-1-1 MAY). Any OTHER failure (e.g. the connection tearing down
	 * mid-negotiation) still propagates as a rejection.
	 */
	public async compress(): Promise<boolean> {
		if (this.compression) {
			// Already active: idempotent success, mirroring `starttls()`'s own
			// `isSecure` early return. `ImapClient.compress()` is what actually
			// guards against a CALLER re-requesting this (client-bug-shaped
			// rejection, not a silent no-op) -- this method itself stays a
			// plain idempotent primitive, same posture as `starttls()`.
			return true;
		}
		if (!this.socket) {
			return false;
		}

		const compressCmd = new CompressCommand();
		// Same choreography as starttls(): `runCommand()` synchronously
		// writes COMPRESS DEFLATE's bytes (queueMode "isolated", queue not
		// yet held) before this call returns; holding right after still lets
		// COMPRESS's own bytes through while blocking every other command's
		// bytes until release() below (spec §6.1/I-1, RFC4978-3-1: "the
		// client MUST NOT send any further commands until it has seen the
		// result of COMPRESS").
		const negotiationResult = this.runCommand(compressCmd);
		this.commandQueue.hold();

		let activated: boolean;
		try {
			activated = await negotiationResult;
		} catch (err) {
			this.commandQueue.release();
			if (err instanceof ServerNoError || err instanceof ServerBadError) {
				// RFC4978-3-3: leave the connection exactly as it was --
				// fully functional, uncompressed.
				return false;
			}
			throw err;
		}

		if (!activated) {
			// In theory unreachable (a non-OK tagged response always throws,
			// caught above) -- kept for safety, same posture as starttls()'s
			// own identical guard.
			this.commandQueue.release();
			return false;
		}

		// MEDIUM-7 parity: the tagged OK for COMPRESS was just observed.
		// Discard any buffered-but-not-yet-complete line sitting in the
		// processing pipeline right now, before touching the stream topology
		// at all -- a server that packs extra bytes into the same TCP
		// segment as the tagged OK must never have that residue carried
		// across the compression boundary and misread as a post-negotiation
		// response (the same STARTTLS-plaintext-injection defense class,
		// applied to the DEFLATE boundary instead of the TLS one).
		this.processingPipeline.forceNewLine(false);

		// Unlike starttls(), the socket itself is never replaced -- only
		// unpiped from the pipeline so `wrapCompression` can re-pipe it
		// through `inflate` first.
		const socket = this.socket!;
		socket.unpipe(this.processingPipeline);

		this.compression = wrapCompression(socket, this.processingPipeline, (err) => {
			this.onSocketError(err);
		});

		// MEDIUM-6 parity: the codec is fully interposed BEFORE releasing the
		// held queue -- anything parked during the hold must write through
		// the NEW (compressing) path, never bypass it by writing to the raw
		// socket first.
		this.commandQueue.release();

		return true;
	}

	/**
	 * UNAUTHENTICATE (RFC 8437, M5.10) — the Layer-1 wire exchange plus the
	 * one piece of stream-topology surgery this command can imply: if
	 * COMPRESS=DEFLATE is active, both compression directions terminate at
	 * this command's boundary (RFC8437-4.1-1: "The client terminates its
	 * outgoing compression layer after the CRLF following the UNAUTHENTICATE
	 * command"; the server's own outgoing layer terminates after the CRLF
	 * following its OK). Same division of labor as `compress()` directly
	 * above: capability/state gating and ALL client-level state bookkeeping
	 * (state machine, mailbox session, ENABLE state, capability registry)
	 * live one layer up in `ImapClient.unauthenticate()` — this method owns
	 * only the exchange and the codec teardown.
	 *
	 * Choreography mirrors `compress()` exactly: `runCommand()` writes the
	 * (isolated) command's bytes synchronously before the queue is held;
	 * `hold()` then blocks every other write until `release()`, so nothing
	 * can cross the teardown boundary through a stale (still-compressing)
	 * write path — this window is what makes "the client's outgoing layer
	 * terminates after the command's CRLF" true in effect: the command line
	 * is the LAST compressed thing this client writes, since no other write
	 * can happen until after the codec is gone. A tagged NO/BAD propagates
	 * as a rejection (unlike COMPRESS's swallowed decline — a server that
	 * refuses UNAUTHENTICATE leaves the connection state unchanged, and the
	 * caller must know); the queue is released and the topology untouched.
	 *
	 * When compression was never active this reduces to a plain isolated
	 * round trip (the hold/release pair is kept unconditionally for a
	 * uniform, simpler invariant — it is a no-op-cost window when there is
	 * no topology to swap).
	 */
	public async unauthenticate(): Promise<void> {
		const cmd = new UnauthenticateCommand();
		const result = this.runCommand(cmd);
		this.commandQueue.hold();

		try {
			await result;
		} catch (err) {
			this.commandQueue.release();
			throw err;
		}

		if (this.compression) {
			// MEDIUM-7 parity (same defense class as starttls()/compress()):
			// the tagged OK was just observed and the server's outgoing
			// compression layer ends at that OK's CRLF — discard any
			// buffered-but-incomplete line residue before touching topology,
			// so post-teardown plaintext is never glued onto pre-teardown
			// residue.
			this.processingPipeline.forceNewLine(false);

			// Tear the codec down and restore the direct pipe (the exact
			// inverse of compress()'s interposition): read side back to
			// socket -> processingPipeline, write side back to raw
			// `sendCommand` writes.
			const socket = this.socket!;
			this.compression.destroy();
			this.compression = null;
			socket.pipe(this.processingPipeline);
		}

		// MEDIUM-6 parity: topology fully restored BEFORE releasing the held
		// queue — anything parked during the hold dispatches against the new
		// (uncompressed) path.
		this.commandQueue.release();
	}
}
