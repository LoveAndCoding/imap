import * as tls from "node:tls";

// The ONLY allowed client imports in the entire compliance suite: the
// package's own public subpath surfaces (spec §1.1) — "." (this repo's
// `src/index`) and "./sasl" (`src/sasl`). No other `src/**` path may be
// imported from anywhere under test/compliance/specs or test/compliance/driver.
import { Connection, ImapClient } from "../../../src/index";
import type { ImapClientConfig } from "../../../src/index";
import { createMechanism } from "../../../src/sasl";
import type { SaslContext, SaslMechanism } from "../../../src/sasl";

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
	/**
	 * Spec §10.3 (RFC 8314) credential policy: whether `driver.login()`/
	 * `driver.authenticate()` may proceed over a non-confidential transport.
	 * Defaults to `true` — the overwhelming convention across this suite is
	 * `connectPlain()` + `driver.login()`/`driver.authenticate()` to reach an
	 * authenticated state so some UNRELATED requirement can be exercised; the
	 * §10.3 policy itself is a distinct, dedicated concern with its own
	 * catalog family (RFC 8314, RFC 2595) tested through different
	 * observables (STARTTLS sequencing, transcript absence of credentials
	 * pre-TLS — see `tls-8314.test.ts`/`tls-2595.test.ts`), never by asserting
	 * that `driver.login()`/`driver.authenticate()` itself throws. Pass
	 * `false` explicitly for the rare test that wants the client's OWN
	 * default policy (spec default `allowInsecureAuth: false`) exercised.
	 */
	allowInsecureAuth?: boolean;
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
 * Fixed identity `driver.authenticate()` presents to `ImapClient.authenticate()`
 * (spec §9.3) for every mechanism the driver drives. The compliance scripts
 * never assert on the exact credential bytes (only on wire FORM — base64
 * framing, GS2/SASL kvpair shape, etc. — see e.g. `sasl-plain-4616.test.ts`'s
 * `plainMessage()` matcher, which pins these exact strings), so one fixed
 * identity is honest and sufficient for every mechanism family exercised
 * today (PLAIN/OAUTHBEARER/XOAUTH2). A real caller would supply its own via
 * `ImapClientConfig.auth`; the driver's job is only to exercise the client's
 * public surface, not to simulate a credential store.
 */
const DEFAULT_AUTH_USER = "user@example.com";
const DEFAULT_AUTH_PASS = "s3cret";
const DEFAULT_AUTH_TOKEN = "compliance-suite-access-token";

/**
 * Wraps a real, registry-produced `SaslMechanism` so its `SaslContext` carries
 * a caller-supplied `authzid` (RFC 4422 §3.4.1) without inventing any new
 * protocol behavior: `start`/`step`/`finish` all delegate to `inner`
 * unchanged, just with `authzid` merged into the context object each sees.
 * `undefined` is a pass-through (no wrapping needed).
 *
 * A `initialResponse` string containing an embedded NUL is deliberately NOT
 * treated as an authzid override here: several compliance tests pass the
 * FULL expected wire message (e.g. `"\x00user@example.com\x00s3cret"` for
 * PLAIN) purely as inline documentation of what the real exchange looks like
 * — RFC 4616 §2 forbids a NUL inside any PLAIN field, so feeding that whole
 * string in as `authzid` would make the real mechanism legitimately throw.
 * Callers filter that case out before calling `withAuthzid` (see
 * `authenticate()` below); this function only ever sees a plausible bare
 * authzid or `undefined`.
 */
function withAuthzid(inner: SaslMechanism, authzid: string | undefined): SaslMechanism {
	if (authzid === undefined) {
		return inner;
	}
	const merge = (ctx: SaslContext): SaslContext => ({ ...ctx, authzid });
	return {
		name: inner.name,
		requiresSecureTransport: inner.requiresSecureTransport,
		start: (ctx) => inner.start(merge(ctx)),
		step: (challenge, ctx) => inner.step(challenge, merge(ctx)),
		finish: (data, ctx) => inner.finish(data, merge(ctx)),
	};
}

/**
 * Thin adapter between compliance tests and the client's public API.
 * RULE: zero protocol logic — translate calls and observations only.
 */
export class ComplianceDriver {
	public readonly events: ObservedEvent[] = [];

	/** Messages the client emitted through its public logger config. */
	public readonly logs: Array<{ level: string; message: string; detail?: unknown }> = [];

	private client?: ImapClient;
	private connection?: Connection;

	public async connect(opts: DriverConnectOptions): Promise<boolean> {
		const client = new ImapClient(this.toClientConfig(opts));
		this.client = client;
		this.wireClientEvents(client);
		this.wireRawConnectionEvents(client.connection);
		try {
			await this.withConnectBackstop("connect", opts, client.connect());
			return true;
		} catch (err) {
			// Historical parity with the pre-ImapClient driver (`Session.start()`
			// used to log this exact message on a failed connect — see
			// `driver/__tests__/driver.test.ts`): `ImapClient` itself only
			// rejects the promise, it doesn't separately log a summary line, so
			// the driver records one itself rather than losing this observable
			// for consumers that poll `driver.logs`.
			this.logs.push({
				level: "error",
				message: "Unable to connect to the server",
				detail: err,
			});
			return false;
		}
	}

	/**
	 * Low-level connect using the public Connection class, capturing response
	 * events for observation-based tests (e.g., unsolicited data handling).
	 */
	public async connectLow(opts: DriverConnectOptions): Promise<boolean> {
		const connection = new Connection(this.toConnectionConfig(opts));
		this.connection = connection;
		this.wireRawConnectionEvents(connection);
		return this.withConnectBackstop("connectLow", opts, connection.connect());
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
						const client = this.client;
						const connection = this.connection;
						this.client = undefined;
						this.connection = undefined;
						void Promise.resolve(client?.close({ force: true })).catch(() => undefined);
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
		await this.client?.close({ force: true });
		await this.connection?.disconnect();
		this.client = undefined;
		this.connection = undefined;
	}

	public get active(): boolean {
		if (this.client) {
			return this.client.state !== "disconnected";
		}
		return this.connection?.isActive ?? false;
	}

	public get authenticated(): boolean {
		if (!this.client) {
			return false;
		}
		return this.client.state === "authenticated" || this.client.state === "selected";
	}

	/**
	 * `connectLow()` has no TLS concept of its own beyond the raw socket, so
	 * this reads `Connection.isSecure` directly there; on the `connect()`
	 * path it reads the client's own `secure` getter (spec §3.2).
	 */
	public get secure(): boolean {
		if (this.client) {
			return this.client.secure;
		}
		return this.connection?.isSecure ?? false;
	}

	/** `connect()`-path only (`ImapClient.supports`); always false after
	 *  `connectLow()` — Layer 1 has no capability registry of its own that
	 *  the driver surfaces here. */
	public hasCapability(name: string): boolean {
		return this.client?.supports(name) ?? false;
	}

	/** `connect()`-path only (`ImapClient.serverId`); always null after
	 *  `connectLow()`. */
	public serverInfo(): ReadonlyMap<string, string | null> | null {
		return this.client?.serverId ?? null;
	}

	// ---- Verbs wired to the public client (M1.9) ---------------------------

	public async noop(): Promise<void> {
		await this.requireClient().noop();
	}

	/**
	 * LOGIN (RFC 3501/9051 §6.2.3). Maps to `ImapClient.authenticate({user,
	 * pass, mechanisms: []})` — an EXPLICIT empty mechanisms list, not an
	 * omitted one. `performAuthSelection` (spec §9.3) only substitutes its
	 * own default SASL candidate order when `mechanisms` is `undefined`
	 * (`auth.mechanisms ?? defaultCandidates(auth)`); a present-but-empty
	 * array survives that check as `[]`, so the selection loop tries zero
	 * SASL mechanisms and falls straight through to step 4 (LOGIN). This
	 * makes `driver.login()` deterministically drive the LOGIN command
	 * itself — never AUTHENTICATE — regardless of what `AUTH=` mechanisms a
	 * given script's CAPABILITY also happens to advertise (some scripts
	 * advertise `AUTH=PLAIN` alongside a plain `driver.login()` call, e.g.
	 * to also exercise a LATER `driver.authenticate()` on the same
	 * connection — an earlier version of this mapping omitted `mechanisms`
	 * entirely and let the full preference order run, which sent
	 * AUTHENTICATE instead of the LOGIN such scripts expect). Step 4 still
	 * enforces everything it always does: `LOGINDISABLED` prohibition
	 * (`performAuthSelection` rejects with `AuthError`, zero bytes) and the
	 * §10.3 credential policy — this mapping does not bypass either.
	 */
	public async login(user: string, pass: string): Promise<void> {
		await this.requireClient().authenticate({ user, pass, mechanisms: [] });
	}

	/**
	 * AUTHENTICATE (RFC 3501/9051 §6.2.2). Drives EXACTLY the named
	 * mechanism (never the full preference-ordered selection algorithm a
	 * plain `authenticate()` call would run) by handing
	 * `ImapClient.authenticate()` a single-element `mechanisms` array
	 * containing that one mechanism instance — this still goes through the
	 * real public method (state transition, credential policy §10.3,
	 * capability-advertisement filtering, capability-epoch refresh, all of
	 * it), it just pins the choice so the scripted server sees the mechanism
	 * the test asked for.
	 *
	 * A mechanism name the registry doesn't recognize (GSSAPI — never on
	 * this library's roadmap; CRAM-MD5, SCRAM-SHA-1/256, ANONYMOUS, EXTERNAL
	 * — not shipped until M5) throws `NotImplementedError` directly, with zero
	 * bytes written: `createMechanism()` returning `undefined` is a
	 * capability gap in the CLIENT, not a protocol decision, so the driver
	 * surfaces it as the same "no public API for this" signal every other
	 * unwired verb uses, rather than letting it fall through to
	 * `performAuthSelection`'s generic `AuthError` (which exists for a
	 * different case: every CANDIDATE excluded after a real attempt).
	 *
	 * `initialResponse`, when supplied, is treated as an authzid override
	 * (RFC 4422 §3.4.1) for mechanisms that accept one (PLAIN, EXTERNAL) —
	 * see `withAuthzid()` — UNLESS it contains an embedded NUL, in which
	 * case it is documentation-only (see `withAuthzid`'s doc comment) and
	 * the mechanism runs with its default (absent) authzid instead.
	 */
	public async authenticate(mechanism: string, initialResponse?: string): Promise<void> {
		const client = this.requireClient();
		const base = createMechanism(mechanism);
		if (!base) {
			throw new NotImplementedError(`AUTHENTICATE ${mechanism}`);
		}
		const authzid =
			initialResponse !== undefined && !initialResponse.includes("\0")
				? initialResponse
				: undefined;
		await client.authenticate({
			user: DEFAULT_AUTH_USER,
			pass: DEFAULT_AUTH_PASS,
			accessToken: DEFAULT_AUTH_TOKEN,
			mechanisms: [withAuthzid(base, authzid)],
		});
	}

	public async logout(): Promise<void> {
		await this.requireClient().logout();
	}

	public async enable(capabilities: string[]): Promise<string[]> {
		return this.requireClient().enableExtensions(capabilities);
	}

	// ---- Verbs with no public API surface (yet) ----------------------------
	// Each throws NotImplementedError so compliance tests fail with the
	// 'unimplemented' annotation rather than a compile/type error.

	public async unauthenticate(): Promise<never> {
		throw new NotImplementedError("UNAUTHENTICATE");
	}
	public async compress(): Promise<never> {
		throw new NotImplementedError("COMPRESS");
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

	private requireClient(): ImapClient {
		if (!this.client) {
			throw new Error(
				"ComplianceDriver: connect() must be called before issuing a Layer-3 verb",
			);
		}
		return this.client;
	}

	/** Bridges every event the pre-`ImapClient` driver bridged from a bare
	 *  `Connection` (used by `connectLow()`) — additively also wired for the
	 *  `connect()` path, sourced from `client.connection` (public, spec
	 *  §3.2's Layer 1 escape hatch), so scripts that poll `driver.events` for
	 *  raw wire-level types (`untaggedResponse`, `serverStatus`, …) keep
	 *  working whether they drove the connection via `connect()` or
	 *  `connectLow()`. */
	private wireRawConnectionEvents(connection: Connection): void {
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
			connection.on(ev as never, ((detail: unknown) => {
				this.events.push({ type: ev, detail });
			}) as never);
		}
	}

	/** Additively bridges `ImapClient`'s OWN events (distinct type strings
	 *  from the raw `Connection` ones above — `close`/`error` here never
	 *  collide with `disconnected`/`connectionError` above) — this is the
	 *  client-level ("Layer 3") observation surface, e.g. `unhandled` for
	 *  the router's tolerance channel (spec §8 step 3c / invariant I-6). */
	private wireClientEvents(client: ImapClient): void {
		client.on("stateChange", (state, prev) => {
			this.events.push({ type: "stateChange", detail: { state, prev } });
		});
		client.on("alert", (text, meta) => {
			this.events.push({ type: "alert", detail: { text, meta } });
		});
		client.on("capabilitiesChanged", (caps) => {
			this.events.push({ type: "capabilitiesChanged", detail: caps });
		});
		client.on("unhandled", (resp) => {
			this.events.push({ type: "unhandled", detail: resp });
		});
		client.on("close", (info) => {
			this.events.push({ type: "close", detail: info });
		});
		client.on("error", (err) => {
			this.events.push({ type: "error", detail: err });
		});
	}

	private toClientConfig(opts: DriverConnectOptions): ImapClientConfig {
		const tlsSetting =
			opts.security === "implicit" ? "on" : opts.security === "starttls" ? "starttls" : "off";
		const tlsOptions: tls.ConnectionOptions | undefined = opts.ca
			? { ca: [opts.ca] }
			: undefined;
		return {
			host: opts.host,
			port: opts.port,
			tls: tlsSetting,
			tlsOptions,
			timeouts: { connect: opts.timeoutMs ?? 3000 },
			id: opts.id,
			allowInsecureAuth: opts.allowInsecureAuth ?? true,
			logger: (info) => {
				this.logs.push(info);
			},
		};
	}

	private toConnectionConfig(opts: DriverConnectOptions) {
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
