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

	/**
	 * Only meaningful after connectLow() — Session does not expose its inner
	 * Connection, so on the connect() path this is always false. Tests
	 * asserting TLS state must use the connectLow path.
	 */
	public get secure(): boolean {
		return this.connection?.isSecure ?? false;
	}

	/** Session-path only (connect()); always false after connectLow(). */
	public hasCapability(name: string): boolean {
		const caps = this.session?.capabilities;
		return caps ? caps.has(name) : false;
	}

	/** Session-path only (connect()); always null after connectLow(). */
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
