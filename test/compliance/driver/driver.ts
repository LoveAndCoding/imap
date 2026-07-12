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
 * Options carried by APPEND-family commands (APPEND, REPLACE, UID REPLACE, and
 * the per-message payload of MULTIAPPEND). Defined once and reused so the
 * scripted wire form stays meaningful once these verbs are implemented.
 *  - `flags` / `date`: the optional `(flags)` list and date-time (RFC 3501 §6.3.11).
 *  - `binary`: emit the message as a literal8 `~{n}` (RFC 3516 BINARY APPEND).
 *  - `catenate`: build the message from TEXT literals and IMAP URLs (RFC 4469).
 */
export interface AppendOptions {
	flags?: string[];
	date?: string;
	binary?: boolean;
	catenate?: Array<{ type: "TEXT"; message: Buffer } | { type: "URL"; url: string }>;
}

/**
 * Options carried by SEARCH-family commands (SEARCH, UID SEARCH). Defined once
 * so the scripted wire form stays meaningful once these verbs are implemented.
 *  - `return`: RETURN result options — ESEARCH MIN/MAX/ALL/COUNT (RFC 4731),
 *    SAVE (RFC 5182 SEARCHRES), PARTIAL m:n (RFC 9394), UPDATE/CONTEXT (RFC 5267).
 *  - `charset`: the optional CHARSET specification.
 */
export interface SearchOptions {
	return?: string[];
	charset?: string;
}

/**
 * Options carried by SELECT/EXAMINE (RFC 7162 CONDSTORE/QRESYNC parameters).
 *  - `condstore`: append the `(CONDSTORE)` select parameter.
 *  - `qresync`: append `(QRESYNC (uidvalidity modseq [known-uids]))`.
 */
export interface SelectOptions {
	condstore?: boolean;
	qresync?: { uidvalidity: number; modseq: bigint; knownUids?: string };
}

/**
 * Options carried by FETCH/UID FETCH (RFC 7162 modifiers).
 *  - `changedSince`: append the `(CHANGEDSINCE n)` modifier.
 *  - `vanished`: append the `VANISHED` modifier (UID FETCH under QRESYNC).
 */
export interface FetchOptions {
	changedSince?: bigint;
	vanished?: boolean;
}

/**
 * Options carried by STORE/UID STORE (RFC 7162 CONDSTORE modifier).
 *  - `unchangedSince`: append the `(UNCHANGEDSINCE n)` modifier.
 */
export interface StoreOptions {
	unchangedSince?: bigint;
}

/**
 * Thin adapter between compliance tests and the client's public API.
 * RULE: zero protocol logic — translate calls and observations only.
 */
export class ComplianceDriver {
	public readonly events: ObservedEvent[] = [];

	/** Messages the client emitted through its public logger config. */
	public readonly logs: Array<{ level: string; message: string; detail?: unknown }> = [];

	private session?: Session;
	private connection?: Connection;

	public async connect(opts: DriverConnectOptions): Promise<boolean> {
		this.session = new Session(this.toConfig(opts));
		return this.withConnectBackstop("connect", opts, this.session.start());
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
		return this.withConnectBackstop("connectLow", opts, this.connection.connect());
	}

	/**
	 * Backstop for a connect promise that never settles: the client currently
	 * has no graceful failure path for some rejected TLS handshakes (see the
	 * TLS-rejection findings), so without this every such test dies at
	 * vitest's opaque "Test timed out" instead of a diagnosable driver error.
	 * The client's own timeout (toConfig: timeoutMs ?? 3000) gets a head
	 * start; the backstop fires only if the promise neither resolves nor
	 * rejects, and tears the half-open client down so a later end() cannot
	 * hang on it.
	 */
	private async withConnectBackstop<T>(
		kind: "connect" | "connectLow",
		opts: DriverConnectOptions,
		attempt: Promise<T>,
	): Promise<T> {
		const ms = (opts.timeoutMs ?? 3000) + 1000;
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			return await Promise.race([
				attempt,
				new Promise<never>((_, reject) => {
					timer = setTimeout(() => {
						// Best-effort teardown — the hung connect may ignore it,
						// so don't await; just make sure end() won't block on it.
						const session = this.session;
						const connection = this.connection;
						this.session = undefined;
						this.connection = undefined;
						void Promise.resolve(session?.end()).catch(() => undefined);
						void Promise.resolve(connection?.disconnect()).catch(() => undefined);
						reject(
							new Error(
								`driver ${kind}() did not settle within ${ms}ms ` +
									`(security=${opts.security} ${opts.host}:${opts.port}); ` +
									`the client promise neither resolved nor rejected — torn down by driver backstop`,
							),
						);
					}, ms);
				}),
			]);
		} finally {
			if (timer !== undefined) clearTimeout(timer);
		}
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
	public serverInfo(): ReadonlyMap<string, string | null> | null {
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
	public async authenticate(_mechanism: string, _initialResponse?: string): Promise<never> {
		throw new NotImplementedError("AUTHENTICATE");
	}
	public async unauthenticate(): Promise<never> {
		throw new NotImplementedError("UNAUTHENTICATE");
	}
	public async compress(): Promise<never> {
		throw new NotImplementedError("COMPRESS");
	}
	public async logout(): Promise<never> {
		throw new NotImplementedError("LOGOUT");
	}
	public async select(_mailbox: string, _opts?: SelectOptions): Promise<never> {
		throw new NotImplementedError("SELECT");
	}
	public async examine(_mailbox: string, _opts?: SelectOptions): Promise<never> {
		throw new NotImplementedError("EXAMINE");
	}
	public async create(
		_mailbox: string,
		_opts?: { useAttributes?: string[] },
	): Promise<never> {
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
	// NOTE: the options surface for extended LIST now EXISTS on this signature —
	// `selectOptions` (e.g. SUBSCRIBED, RECURSIVEMATCH), `returnOptions` (e.g.
	// RETURN (STATUS (...) SPECIAL-USE CHILDREN)), and multiple `patterns` — so
	// the option-prohibition tests RFC9051-6.3.9-5 (unadvertised option) and
	// RFC9051-6.3.9-6 (duplicate option) are no longer vacuous by construction:
	// a test CAN drive an option to be emitted. The verb itself remains
	// unimplemented (throws NotImplementedError), so those tests currently
	// self-actualize as unimplemented rather than passing vacuously.
	public async list(
		_ref: string,
		_pattern: string,
		_opts?: { selectOptions?: string[]; returnOptions?: string[]; patterns?: string[] },
	): Promise<never> {
		throw new NotImplementedError("LIST");
	}
	public async lsub(_ref: string, _pattern: string): Promise<never> {
		throw new NotImplementedError("LSUB");
	}
	public async status(_mailbox: string, _items: string[]): Promise<never> {
		throw new NotImplementedError("STATUS");
	}
	public async append(
		_mailbox: string,
		_message: Buffer,
		_opts?: AppendOptions,
	): Promise<never> {
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
	public async search(_criteria: unknown, _opts?: SearchOptions): Promise<never> {
		throw new NotImplementedError("SEARCH");
	}
	public async fetch(_seq: string, _items: string[], _opts?: FetchOptions): Promise<never> {
		throw new NotImplementedError("FETCH");
	}
	public async store(
		_seq: string,
		_action: string,
		_flags: string[],
		_opts?: StoreOptions,
	): Promise<never> {
		throw new NotImplementedError("STORE");
	}
	public async copy(_seq: string, _mailbox: string): Promise<never> {
		throw new NotImplementedError("COPY");
	}
	public async move(_seq: string, _mailbox: string): Promise<never> {
		throw new NotImplementedError("MOVE");
	}
	public async uidFetch(
		_seq: string,
		_items: string[],
		_opts?: FetchOptions,
	): Promise<never> {
		throw new NotImplementedError("UID FETCH");
	}
	public async uidSearch(_criteria: unknown, _opts?: SearchOptions): Promise<never> {
		throw new NotImplementedError("UID SEARCH");
	}
	public async uidStore(
		_seq: string,
		_action: string,
		_flags: string[],
		_opts?: StoreOptions,
	): Promise<never> {
		throw new NotImplementedError("UID STORE");
	}
	public async uidCopy(_seq: string, _mailbox: string): Promise<never> {
		throw new NotImplementedError("UID COPY");
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

	// ---- Phase 4: mailbox/listing/metadata + message operations ------------
	// UIDPLUS (RFC 4315) / MOVE (RFC 6851) / REPLACE (RFC 8508)
	public async uidExpunge(_seq: string): Promise<never> {
		throw new NotImplementedError("UID EXPUNGE");
	}
	public async uidMove(_seq: string, _mailbox: string): Promise<never> {
		throw new NotImplementedError("UID MOVE");
	}
	public async replace(
		_seq: string,
		_mailbox: string,
		_message: Buffer,
		_opts?: AppendOptions,
	): Promise<never> {
		throw new NotImplementedError("REPLACE");
	}
	public async uidReplace(
		_seq: string,
		_mailbox: string,
		_message: Buffer,
		_opts?: AppendOptions,
	): Promise<never> {
		throw new NotImplementedError("UID REPLACE");
	}

	// ACL (RFC 4314)
	public async setacl(
		_mailbox: string,
		_identifier: string,
		_rights: string,
	): Promise<never> {
		throw new NotImplementedError("SETACL");
	}
	public async deleteacl(_mailbox: string, _identifier: string): Promise<never> {
		throw new NotImplementedError("DELETEACL");
	}
	public async getacl(_mailbox: string): Promise<never> {
		throw new NotImplementedError("GETACL");
	}
	public async listrights(_mailbox: string, _identifier: string): Promise<never> {
		throw new NotImplementedError("LISTRIGHTS");
	}
	public async myrights(_mailbox: string): Promise<never> {
		throw new NotImplementedError("MYRIGHTS");
	}

	// QUOTA (RFC 9208, obsoletes RFC 2087)
	public async getquota(_root: string): Promise<never> {
		throw new NotImplementedError("GETQUOTA");
	}
	public async getquotaroot(_mailbox: string): Promise<never> {
		throw new NotImplementedError("GETQUOTAROOT");
	}
	public async setquota(
		_root: string,
		_limits: Array<{ resource: string; limit: number }>,
	): Promise<never> {
		throw new NotImplementedError("SETQUOTA");
	}

	// METADATA (RFC 5464)
	public async getmetadata(
		_mailbox: string,
		_entries: string[],
		_opts?: { maxsize?: number; depth?: "0" | "1" | "infinity" },
	): Promise<never> {
		throw new NotImplementedError("GETMETADATA");
	}
	public async setmetadata(
		_mailbox: string,
		_entries: Array<{ entry: string; value: string | null }>,
	): Promise<never> {
		throw new NotImplementedError("SETMETADATA");
	}

	// MULTIAPPEND (RFC 3502)
	public async multiAppend(
		_mailbox: string,
		_messages: Array<{ message: Buffer; flags?: string[]; date?: string }>,
	): Promise<never> {
		throw new NotImplementedError("MULTIAPPEND");
	}

	// ---- Phase 5: search/sort/sync/events ----------------------------------
	// SORT/THREAD (RFC 5256, +DISPLAY RFC 5957, +ESORT/CONTEXT RFC 5267)
	public async sort(
		_criteria: string[],
		_searchKeys: unknown,
		_charset?: string,
	): Promise<never> {
		throw new NotImplementedError("SORT");
	}
	public async uidSort(
		_criteria: string[],
		_searchKeys: unknown,
		_charset?: string,
	): Promise<never> {
		throw new NotImplementedError("UID SORT");
	}
	public async thread(
		_algorithm: string,
		_searchKeys: unknown,
		_charset?: string,
	): Promise<never> {
		throw new NotImplementedError("THREAD");
	}
	public async uidThread(
		_algorithm: string,
		_searchKeys: unknown,
		_charset?: string,
	): Promise<never> {
		throw new NotImplementedError("UID THREAD");
	}

	// NOTIFY (RFC 5465)
	public async notify(_spec: unknown): Promise<never> {
		throw new NotImplementedError("NOTIFY");
	}

	// ---- Phase 6: i18n + misc + vendor family -------------------------------
	// LANGUAGE/I18NLEVEL (RFC 5255), CONVERT (RFC 5259), URLAUTH (RFC 4467),
	// URLAUTH=BINARY (RFC 5524), MAILBOX-REFERRALS (RFC 2193)
	public async language(_tags?: string[]): Promise<never> {
		throw new NotImplementedError("LANGUAGE");
	}
	public async convert(
		_seq: string,
		_part: string,
		_transformation: unknown,
	): Promise<never> {
		throw new NotImplementedError("CONVERT");
	}
	public async genurlauth(
		_urls: Array<{ url: string; mechanism: string }>,
	): Promise<never> {
		throw new NotImplementedError("GENURLAUTH");
	}
	public async urlfetch(_urls: string[]): Promise<never> {
		throw new NotImplementedError("URLFETCH");
	}
	public async resetkey(_mailbox?: string, _mechanisms?: string[]): Promise<never> {
		throw new NotImplementedError("RESETKEY");
	}
	public async rlist(_ref: string, _pattern: string): Promise<never> {
		throw new NotImplementedError("RLIST");
	}
	public async rlsub(_ref: string, _pattern: string): Promise<never> {
		throw new NotImplementedError("RLSUB");
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
			logger: (info: { level: string; message: string }) => {
				this.logs.push(info);
			},
		};
	}
}
