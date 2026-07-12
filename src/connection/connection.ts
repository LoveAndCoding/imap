import * as net from "net";
import { clearTimeout, setTimeout } from "timers";
import * as tls from "tls";
import { TypedEmitter } from "tiny-typed-emitter";

import { CapabilityCommand, StartTLSCommand, Command } from "../commands";
import { IMAPError } from "../errors";
import NewlineTranform from "../newline.transform";
import Lexer from "../lexer";
import Parser, {
	AtomTextCode,
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

	private options: IMAPConnectionConfiguration;
	private commandQueue!: CommandQueue;
	private connected: boolean;
	private secure?: boolean;

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

		let connected: boolean;

		if (tlsSetting === TLSSetting.DEFAULT) {
			// Implicit TLS: every TLS socket is created through the ONE TLS
			// policy module. A handshake or identity failure rejects here
			// (never a hang, never a boolean-false resolve) — let it
			// propagate to the caller after tearing down any partial state.
			try {
				this.socket = await openTls({
					host,
					port,
					timeoutMs: timeoutWait,
					tlsOptions,
				});
			} catch (err) {
				this.socket = undefined;
				this.secure = undefined;
				this.connected = false;
				throw err;
			}
			this.secure = true;
			connected = true;
		} else {
			connected = await new Promise<boolean>((resolve, reject) => {
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
				this.socket.once("end", clearTimerBad);
				this.socket.once("close", clearTimerBad);
			});

			if (!connected) {
				this.socket = undefined;
				return false;
			}
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
			greeting = await this.awaitGreeting();
		} catch (err) {
			this.socket?.destroy();
			this.socket = undefined;
			this.secure = undefined;
			this.connected = false;
			throw err;
		}

		if (
			!this.isSecure &&
			!this.preauthed &&
			(tlsSetting === TLSSetting.STARTTLS ||
				tlsSetting === TLSSetting.STARTTLS_OPTIONAL)
		) {
			try {
				connected = await this.starttls(greeting);
			} catch (err) {
				// A failed STARTTLS upgrade leaves the connection dead — never
				// continue cleartext after a failed handshake. Tear down so a
				// later disconnect()/end() can't hang on a half-open client.
				this.socket?.destroy();
				this.socket = undefined;
				this.secure = undefined;
				this.connected = false;
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
				this.socket!.destroy();
				this.socket = undefined;
				throw new TLSSocketError(
					"Could not establish a secure connection",
					"policy",
				);
			}
		}

		this.connected = connected;
		if (!connected) {
			this.socket!.destroy();
			this.socket = undefined;
			return false;
		}

		this.socket!.on("error", this.onSocketError);
		this.socket!.once("end", this.onSocketEnd);
		this.socket!.once("close", this.onSocketClose);

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
		this.commandQueue.add<T>(command);
		return command.results;
	}

	public send(toSend: string) {
		this.socket!.write(toSend + CRLF, "utf8");
	}

	protected init() {
		this.commandQueue = new CommandQueue(this, false);

		// Setup our Lexing/Parsing
		this.processingPipeline = new NewlineTranform({ allowHalfOpen: true });
		this.lexer = new Lexer();
		this.parser = new Parser();

		// Pipe from our newline splitter to lexer to parser
		this.processingPipeline.pipe(this.lexer).pipe(this.parser);
		// Once we hit the parser, we want to (mostly) bubble events
		this.parser.on("untagged", (resp: UntaggedResponse) => {
			if (resp.content instanceof StatusResponse) {
				this.handleStatusResponse(resp);
			} else {
				this.emit("untaggedResponse", resp);
				this.emit("response", resp);
			}
		});
		this.parser.on("tagged", (resp: TaggedResponse) => {
			this.emit("taggedResponse", resp);
			this.emit("response", resp);
		});
		this.parser.on("continue", (resp: ContinueResponse) => {
			this.emit("continueResponse", resp);
			this.emit("response", resp);
		});
		this.parser.on("unknown", (resp: UnknownResponse | null) => {
			this.emit("unknownResponse", resp);
			this.emit("response", resp);
		});
	}

	/**
	 * Fanout for every untagged status response (OK/NO/BAD/BYE/PREAUTH),
	 * including the greeting itself (`awaitGreeting()` observes the very
	 * first one via a one-shot listener registered before this handler ever
	 * runs — both see the same event).
	 *
	 * ALERT carve-out (spec §10.6, I-7, RFC9051-11.3-2): a response-code
	 * ALERT always reaches the logger at "warn" — that's the notification
	 * channel this headless library has. When the transport is NOT yet
	 * confidential (no TLS on the wire), the log entry is structurally
	 * marked `trusted: false` and the response is NOT emitted as
	 * `serverStatus` (an unauthenticated/unprotected peer's ALERT text is
	 * never presented as a trusted event — RFC9051-11.3-2). Once
	 * confidential, both the log AND the normal `serverStatus` emit happen.
	 * Every other status (including BYE, which callers still need to see)
	 * emits exactly as before.
	 */
	protected handleStatusResponse(resp: UntaggedResponse): void {
		const status = resp.content as StatusResponse;
		const code = status.text?.code;
		const isAlert = code instanceof AtomTextCode && code.kind === "ALERT";

		if (isAlert) {
			const alertText = status.text?.content ?? "";
			const confidential = !!this.secure;
			this.log({
				level: "warn",
				message: alertText,
				detail: { code: "ALERT", trusted: confidential },
			});
			if (!confidential) {
				// Pre-confidentiality: logged above, but not surfaced as a
				// trusted event (RFC9051-11.3-2).
				return;
			}
		}

		this.emit("serverStatus", resp);
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
				const greetingTimeout = setTimeout(() => {
					reject(
						new ConnectionTimeout(
							greetingTimeoutAmount,
							"Greeting",
						),
					);
				}, greetingTimeoutAmount);
				this.once("serverStatus", (resp) => {
					clearTimeout(greetingTimeout);
					resolve(resp);
				});
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
		if (!this.socket || this.isSecure) {
			// Don't need to (or can't) do TLS in this case
			return this.connected;
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
			return this.connected;
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
		} finally {
			// Handshake completion — success or failure — is the end of the
			// I-1 window either way. On failure connect() tears the whole
			// connection down regardless; releasing here just avoids leaving
			// the queue permanently wedged for anything that might inspect it
			// first.
			this.commandQueue.release();
		}

		this.socket = tlsSock;
		this.secure = true;
		this.socket.pipe(this.processingPipeline);

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
}
