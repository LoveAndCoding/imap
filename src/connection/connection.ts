import * as net from "net";
import { clearTimeout, setTimeout } from "timers";
import * as tls from "tls";
import { TypedEmitter } from "tiny-typed-emitter";

import { CapabilityCommand, StartTLSCommand, Command } from "../commands";
import { IMAPError } from "../errors";
import NewlineTranform from "../newline.transform";
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
import { CRLF } from "./constants";
import CommandQueue from "./queue";
import {
	IConnectionEvents,
	IMAPConnectionConfiguration,
	TLSSetting,
} from "./types";
import { ConnectionTimeout, TLSSocketError } from "./errors";

const DEFAULT_TIMEOUT = 10000;

export default class Connection extends TypedEmitter<IConnectionEvents> {
	public socket: undefined | net.Socket | tls.TLSSocket;

	protected lexer: Lexer;
	protected parser: Parser;
	protected processingPipeline: NewlineTranform;

	private options: IMAPConnectionConfiguration;
	private commandQueue: CommandQueue;
	private connected: boolean;
	private secure?: boolean;

	constructor(options: IMAPConnectionConfiguration) {
		super();
		// Shallow copy options so we're not modifying the original object
		this.options = Object.assign({}, options);

		// Set TLS setting to default if it is unset or invalid
		let { tls } = this.options;
		if (
			!tls ||
			!(
				tls === TLSSetting.DEFAULT ||
				tls === TLSSetting.STARTTLS ||
				tls === TLSSetting.STARTTLS_OPTIONAL ||
				tls === TLSSetting.FORCE_OFF
			)
		) {
			this.options.tls = tls = TLSSetting.DEFAULT;
		}

		this.connected = false;

		this.init();
	}

	get isActive(): boolean {
		return this.connected;
	}

	get isSecure(): boolean {
		return this.connected && this.secure;
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
		let tlsSocketConfig: tls.ConnectionOptions;
		this.socket = undefined;

		if (tlsSetting === TLSSetting.DEFAULT) {
			tlsSocketConfig = {
				// Host name may be overridden by the tlsOptions
				host,
				port,
				servername: host,
				// Explicitly reject unauthorized connections by default
				rejectUnauthorized: true,
			};
			Object.assign(tlsSocketConfig, tlsOptions);
			// Socket cannot be overridden
			delete tlsSocketConfig.socket;
		}

		let connected = await new Promise<boolean>((resolve, reject) => {
			// Setup a simple timeout
			const timeoutWait = timeout || DEFAULT_TIMEOUT;
			let connTimeout = setTimeout(() => {
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
					this.socket.off("end", clearTimerBad);
					this.socket.off("close", clearTimerBad);
				};
			};
			const clearTimerGood = clearTimer(true);
			const clearTimerBad = clearTimer(false);
			if (tlsSocketConfig) {
				this.socket = tls.connect(tlsSocketConfig, clearTimerGood);
				this.secure = true;
			} else {
				this.socket = net.connect(
					{
						host,
						port,
					},
					clearTimerGood,
				);
				this.secure = false;
			}
			this.socket.once("end", clearTimerBad);
			this.socket.once("close", clearTimerBad);
		});

		if (!connected) {
			this.socket = undefined;
			return false;
		}

		this.socket.pipe(this.processingPipeline);

		if (
			!this.isSecure &&
			(tlsSetting === TLSSetting.STARTTLS ||
				tlsSetting === TLSSetting.STARTTLS_OPTIONAL)
		) {
			connected = await this.starttls();
			if (!this.isSecure && tlsSetting === TLSSetting.STARTTLS) {
				this.socket.destroy();
				this.socket = undefined;
				throw new TLSSocketError(
					"Could not establish a secure connection",
				);
			}
		}

		this.connected = connected;
		if (!connected) {
			this.socket.destroy();
			this.socket = undefined;
			return false;
		}

		this.socket.on("error", this.onSocketError);
		this.socket.once("end", this.onSocketEnd);
		this.socket.once("close", this.onSocketClose);

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
		this.socket.unpipe(this.processingPipeline);
		this.processingPipeline.forceNewLine(false);
		this.socket.removeAllListeners();
		this.socket = undefined;
		this.secure = undefined;
		this.emit("disconnected", !hadErr);
	};
	protected onSocketEnd = () => {
		this.commandQueue.stop();
		this.connected = false;
		this.socket.end();
	};

	public async disconnect(error?: Error) {
		if (!this.socket) {
			return;
		}

		// Socket closing event handles cleanup
		this.socket.destroy(error);
	}

	public async runCommand<K extends Command<T>, T>(command: K): Promise<T> {
		this.commandQueue.add<T>(command);
		return command.results;
	}

	public send(toSend: string) {
		this.socket.write(toSend + CRLF, "utf8");
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
				this.emit("serverStatus", resp);
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
		this.parser.on("unknown", (resp: UnknownResponse) => {
			this.emit("unknownResponse", resp);
			this.emit("response", resp);
		});
	}

	protected async starttls(): Promise<boolean> {
		if (!this.connected || !this.socket || this.isSecure) {
			// Don't need to (or can't) do TLS in this case
			return this.connected;
		}

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

		let capabilities: CapabilityList;
		if (greeting.content.text?.code instanceof CapabilityTextCode) {
			// We have a capability list already! Yay
			capabilities = greeting.content.text.code.capabilities;
		} else {
			// We need to retrieve the capabilities
			const cmd = new CapabilityCommand();
			capabilities = await cmd.run(this);
		}

		if (capabilities.doesntHave("STARTTLS")) {
			return this.connected;
		}

		const tlsCmd = new StartTLSCommand();
		const startNegotiation: boolean = await tlsCmd.run(this);

		if (!startNegotiation) {
			// In theory we shouldn't be able to hit this as
			// the above should throw if we can't negotiate,
			// but want to be safe
			return false;
		}

		return new Promise((resolve, reject) => {
			const previousSocket = this.socket;
			previousSocket.unpipe(this.processingPipeline);

			const tlsOptions: tls.ConnectionOptions = {
				host: this.options.host,
				rejectUnauthorized: true,
			};
			// Host name may be overridden the tlsOptions
			Object.assign(tlsOptions, this.options.tlsOptions);
			tlsOptions.socket = previousSocket;

			const timeoutWait = this.options.timeout || DEFAULT_TIMEOUT;
			let timeout = setTimeout(() => {
				// Check to make sure we didn't already close the connection
				if (previousSocket.destroyed) {
					return;
				}

				timeout = undefined;
				const tmrErr = new ConnectionTimeout(
					timeoutWait,
					"TLS Negotiation",
				);
				previousSocket.destroy(tmrErr);
				reject(tmrErr);
			}, timeoutWait);
			let tlsSock: tls.TLSSocket;
			const clearTimer = (connected) => {
				return () => {
					if (timeout) {
						clearTimeout(timeout);
						timeout = undefined;
						resolve(connected);
					}
					tlsSock.off("close", clearTimerBad);
				};
			};
			const clearTimerGood = clearTimer(true);
			const clearTimerBad = clearTimer(false);

			tlsSock = tls.connect(tlsOptions, clearTimerGood);
			this.socket = tlsSock;
			this.secure = true;

			this.socket.pipe(this.processingPipeline);
		});
	}
}
