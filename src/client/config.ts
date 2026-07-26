// ImapClient configuration (spec §2): the public `ImapClientConfig` shape,
// its resolved/defaulted/validated counterpart (`ResolvedConfig`), and
// `validateConfig()` — the single synchronous gate `ImapClient`'s
// constructor runs every caller-supplied config through.
//
// Scope note (per this milestone's brief): `extensions` and `maxInlineSize`
// are accepted and type/range-validated here so the public shape is stable
// and callers get synchronous feedback on nonsense input, but nothing in
// `ImapClient` consults their resolved values yet — that wiring lands with
// M1.8 (extensions/ENABLE) and M3 (maxInlineSize, fetch part buffering)
// respectively. `compress` is no longer in that category as of M5.9
// (RFC 4978): `ImapClient.compress()`/`maybeCompress()` consult it for
// real, and its default has flipped `false` -> `"auto"` (see
// `validateCompress()` below).

import type * as tls from "node:tls";

import type { IdCommandValues } from "../commands/id";
import type { SaslMechanism } from "../sasl/mechanism";
import type { IMAPLogMessage } from "../types";

/** Transport security mode (spec §2). */
export type TlsMode = "on" | "starttls" | "opportunistic" | "off";

const TLS_MODES: readonly TlsMode[] = ["on", "starttls", "opportunistic", "off"];

/** Credentials + mechanism preferences for AUTHENTICATE/LOGIN (spec §9.3) —
 *  passed either via `ImapClientConfig.auth` (consumed automatically during
 *  `connect()`) or directly to `ImapClient.authenticate()`. */
export interface ImapAuthConfig {
	/** Authentication identity (the SASL "authcid"/LOGIN userid). */
	user: string;
	/** Password-bearing mechanisms (LOGIN, PLAIN, CRAM-MD5, SCRAM-*). */
	pass?: string;
	/** Bearer token for OAUTHBEARER/XOAUTH2. */
	accessToken?: string;
	/** Preference order; default per spec §9.3. May mix mechanism names and
	 *  concrete `SaslMechanism` instances (a later milestone's selection
	 *  algorithm consumes this — accepted/validated here, not yet acted on). */
	mechanisms?: Array<string | SaslMechanism>;
	/**
	 * M35 fix (second-review round): the SASL authorization identity
	 * (authzid, RFC 4422 §2) a mechanism may request to act as, distinct from
	 * the authentication identity (`user`) — threaded verbatim into every
	 * mechanism's `SaslContext.authzid` (`client/auth.ts`'s
	 * `performAuthSelection()`), which already carries a same-named field
	 * (`sasl/mechanism.ts`) that `ExternalMechanism`/`AnonymousMechanism`
	 * already consume, but that this config surface had no way to populate
	 * before this fix. Also doubles as ANONYMOUS's non-empty trace-
	 * information input (RFC 4505 §2) — see `SaslContext.authzid`'s own doc
	 * comment for why ANONYMOUS reuses this field rather than having a
	 * dedicated one. `validateAuth()` below relaxes the pass/accessToken
	 * requirement when `mechanisms` names only no-secret mechanisms
	 * (EXTERNAL/ANONYMOUS), which have nothing to authenticate WITH but may
	 * still legitimately carry a non-empty `authzid`.
	 */
	authzid?: string;
}

/** Per-operation timeout overrides (all in milliseconds), each independently
 *  optional — omitted fields keep their own documented default via
 *  `validateTimeouts()`. */
export interface ImapClientTimeouts {
	/** Socket + TLS handshake, default 10_000. */
	connect?: number;
	/** Greeting wait, default 10_000. */
	greeting?: number;
	/** 0 = none (default); never applies to IDLE. */
	command?: number;
	/** IDLE renewal interval, default 28 * 60_000 (RFC 2177 ≤29 min). */
	idleRenew?: number;
	/** `updates({idle:true})` NOOP-polling fallback interval when IDLE isn't
	 *  available, default 30_000. */
	noopFallbackInterval?: number;
}

/** Caller-supplied configuration for `ImapClient` (spec §2) — validated and
 *  defaulted into a `ResolvedConfig` by `validateConfig()`, which the
 *  `ImapClient` constructor runs every instance through synchronously. */
export interface ImapClientConfig {
	/** Server hostname or IP to connect to. */
	host: string;
	/** Default 993 when `tls:"on"`, else 143. */
	port?: number;
	/** Default "on". */
	tls?: TlsMode;
	/** Merged per §10.2 (cannot weaken identity checks — enforced at connect
	 *  time by `connection/tls.ts`, not here). */
	tlsOptions?: tls.ConnectionOptions;
	/** Omit → `connect()` stops in not-authenticated. */
	auth?: ImapAuthConfig;
	/** Default false — §10.3 (RFC 8314). */
	allowInsecureAuth?: boolean;
	/** `false` = never send ID; default (omitted) = library default values. */
	id?: IdCommandValues | false;
	/** Which server extensions to ENABLE (§3.4); default "auto". Wired in
	 *  M1.8 — accepted/validated, inert until then. */
	extensions?: "auto" | string[] | false;
	/** Default "auto" as of M5.9 (RFC 4978; was `false` before this
	 *  milestone) — negotiated opportunistically post-authentication when
	 *  the server advertises `COMPRESS=DEFLATE`. `false` never negotiates. */
	compress?: "auto" | false;
	/** Fetch part buffering cutoff, default 1 MiB (§5.4). Inert until M3. */
	maxInlineSize?: number;
	/** Per-operation timeout overrides; unset fields fall back to
	 *  `ImapClientTimeouts`'s own per-field defaults (see that interface). */
	timeouts?: ImapClientTimeouts;
	/** Sink for this library's internal diagnostic/warning log lines (e.g.
	 *  a detected UIDVALIDITY change); omitted means logging is a no-op. */
	logger?: (info: IMAPLogMessage) => void;
}

/** `ImapClientConfig` after validation, defaulting, and deep-copying — every
 *  field an `ImapClient` instance actually reads is present with a concrete
 *  value (no more optional/undefined defaults to re-derive at each call
 *  site). `id` stays `IdCommandValues | false | undefined`: `undefined`
 *  deliberately carries the "use the library's built-in ID values" meaning
 *  through unchanged (`IdCommand`'s own constructor default), rather than
 *  this module re-deriving/duplicating what those values are. */
export interface ResolvedConfig {
	readonly host: string;
	readonly port: number;
	readonly tls: TlsMode;
	readonly tlsOptions?: tls.ConnectionOptions;
	readonly auth?: ImapAuthConfig;
	readonly allowInsecureAuth: boolean;
	readonly id: IdCommandValues | false | undefined;
	readonly extensions: "auto" | string[] | false;
	readonly compress: "auto" | false;
	readonly maxInlineSize: number;
	readonly timeouts: Required<ImapClientTimeouts>;
	readonly logger?: (info: IMAPLogMessage) => void;
}

const DEFAULT_TLS: TlsMode = "on";
const DEFAULT_PORT_TLS = 993;
const DEFAULT_PORT_PLAIN = 143;
const DEFAULT_MAX_INLINE_SIZE = 1024 * 1024; // 1 MiB
const DEFAULT_TIMEOUTS: Required<ImapClientTimeouts> = {
	connect: 10_000,
	greeting: 10_000,
	command: 0,
	idleRenew: 28 * 60_000,
	noopFallbackInterval: 30_000,
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertNonNegativeNumber(value: unknown, field: string): number {
	if (typeof value !== "number" || Number.isNaN(value)) {
		throw new TypeError(`${field} must be a number`);
	}
	if (value < 0) {
		throw new RangeError(`${field} must not be negative (got ${value})`);
	}
	return value;
}

function validateHost(host: unknown): string {
	if (typeof host !== "string") {
		throw new TypeError("host must be a non-empty string");
	}
	if (host.trim().length === 0) {
		throw new RangeError("host must not be empty/blank");
	}
	return host;
}

function validateTls(tlsMode: unknown): TlsMode {
	if (tlsMode === undefined) {
		return DEFAULT_TLS;
	}
	if (typeof tlsMode !== "string" || !TLS_MODES.includes(tlsMode as TlsMode)) {
		throw new TypeError(
			`tls must be one of ${TLS_MODES.map((m) => `"${m}"`).join(", ")}; got ${JSON.stringify(tlsMode)}`,
		);
	}
	return tlsMode as TlsMode;
}

function validatePort(port: unknown, tlsMode: TlsMode): number {
	if (port === undefined) {
		return tlsMode === "on" ? DEFAULT_PORT_TLS : DEFAULT_PORT_PLAIN;
	}
	if (typeof port !== "number" || !Number.isInteger(port)) {
		throw new TypeError(`port must be an integer; got ${JSON.stringify(port)}`);
	}
	if (port < 1 || port > 65535) {
		throw new RangeError(`port must be between 1 and 65535; got ${port}`);
	}
	return port;
}

/**
 * M35 fix (second-review round): the built-in mechanisms that need NO
 * secret at all to authenticate (RFC 4422 Appendix A EXTERNAL — the
 * identity comes entirely from the already-established TLS client cert;
 * RFC 4505 ANONYMOUS — unauthenticated by design). `requiresNoSecret()`
 * below only recognizes these by NAME (case-insensitively, matching how
 * `client/auth.ts`'s `resolveMechanism()` itself uppercases string
 * candidates) — a caller-supplied `SaslMechanism` OBJECT candidate is
 * deliberately NOT special-cased here (this module has no principled way to
 * introspect an arbitrary mechanism instance for whether it needs a
 * secret), so mixing one into `mechanisms` still requires `pass`/
 * `accessToken` exactly as before this fix.
 */
const NO_SECRET_MECHANISM_NAMES: ReadonlySet<string> = new Set(["EXTERNAL", "ANONYMOUS"]);

/** `true` only when `mechanisms` is a non-empty array whose EVERY entry is a
 *  known no-secret mechanism name (see `NO_SECRET_MECHANISM_NAMES`) — the
 *  narrow carve-out `validateAuth()` uses to relax its pass/accessToken
 *  requirement. An unset/empty `mechanisms` (the default-candidate-list
 *  path, `client/auth.ts`'s `defaultCandidates()`, which never proposes
 *  EXTERNAL/ANONYMOUS on its own) or a list mixing in anything else
 *  (a password/token mechanism name, LOGIN, or a raw `SaslMechanism`
 *  object) does NOT qualify — the caller must explicitly and exclusively
 *  opt into no-secret mechanisms for this carve-out to apply. */
function requiresNoSecret(mechanisms: unknown): boolean {
	if (!Array.isArray(mechanisms) || mechanisms.length === 0) {
		return false;
	}
	return mechanisms.every(
		(m) => typeof m === "string" && NO_SECRET_MECHANISM_NAMES.has(m.toUpperCase()),
	);
}

function validateAuth(auth: unknown): ImapAuthConfig | undefined {
	if (auth === undefined) {
		return undefined;
	}
	if (!isPlainObject(auth) || typeof auth.user !== "string") {
		throw new TypeError("auth.user must be a string");
	}
	if (
		auth.pass === undefined &&
		auth.accessToken === undefined &&
		!requiresNoSecret(auth.mechanisms)
	) {
		// M35 fix (second-review round): the no-secret carve-out
		// (`requiresNoSecret()` above) lets an explicit, EXTERNAL/ANONYMOUS-
		// only `mechanisms` list through without either credential --
		// neither mechanism has anything to authenticate WITH (see
		// `NO_SECRET_MECHANISM_NAMES`'s own doc comment). Every other shape
		// (the default candidate list, or any mechanism name/object this
		// carve-out doesn't recognize) still requires one of the two.
		throw new TypeError(
			"auth requires either 'pass' or 'accessToken' to be set (unless " +
				"'mechanisms' names only no-secret mechanisms, e.g. EXTERNAL/ANONYMOUS)",
		);
	}
	if (auth.pass !== undefined && typeof auth.pass !== "string") {
		throw new TypeError("auth.pass must be a string");
	}
	if (auth.accessToken !== undefined && typeof auth.accessToken !== "string") {
		throw new TypeError("auth.accessToken must be a string");
	}
	if (auth.mechanisms !== undefined && !Array.isArray(auth.mechanisms)) {
		throw new TypeError("auth.mechanisms must be an array");
	}
	if (auth.authzid !== undefined && typeof auth.authzid !== "string") {
		throw new TypeError("auth.authzid must be a string");
	}
	return {
		user: auth.user,
		pass: auth.pass as string | undefined,
		accessToken: auth.accessToken as string | undefined,
		authzid: auth.authzid as string | undefined,
		mechanisms: auth.mechanisms
			? [...(auth.mechanisms as Array<string | SaslMechanism>)]
			: undefined,
	};
}

/**
 * LOW fix (second-review round): every other field in this module VALIDATES
 * (throws `TypeError` on a wrong-shaped value) rather than silently coercing
 * -- `allowInsecureAuth`'s old inline `config.allowInsecureAuth === true`
 * was the one outlier, silently treating ANY non-boolean-`true` value
 * (including a truthy one, e.g. `"true"` — the string a caller wiring this
 * from an env var like `process.env.ALLOW_INSECURE_AUTH` would naturally
 * produce, or `1`) as `false` with no error at all. That direction happens
 * to be the SAFE one (it can never silently WEAKEN the §10.3/RFC 8314
 * cleartext-auth policy this field gates), but it is still a confusing
 * silent-wrong-behavior trap for a caller who believes they opted in and
 * gets no error telling them otherwise. Matches this module's established
 * convention (`validateTls`/`validateExtensions`/`validateCompress`/the
 * `logger`/`tlsOptions` inline checks in `validateConfig`) of throwing
 * rather than coercing.
 */
function validateAllowInsecureAuth(value: unknown): boolean {
	if (value === undefined) {
		return false;
	}
	if (typeof value !== "boolean") {
		throw new TypeError(`allowInsecureAuth must be a boolean; got ${JSON.stringify(value)}`);
	}
	return value;
}

function validateId(id: unknown): IdCommandValues | false | undefined {
	if (id === undefined || id === false) {
		return id;
	}
	if (!isPlainObject(id)) {
		throw new TypeError("id must be an object, false, or omitted");
	}
	return { ...(id as IdCommandValues) };
}

function validateExtensions(extensions: unknown): "auto" | string[] | false {
	if (extensions === undefined) {
		return "auto";
	}
	if (extensions === "auto" || extensions === false) {
		return extensions;
	}
	if (
		Array.isArray(extensions) &&
		extensions.every((e) => typeof e === "string")
	) {
		return [...extensions];
	}
	throw new TypeError('extensions must be "auto", false, or a string[]');
}

function validateCompress(compress: unknown): "auto" | false {
	if (compress === undefined) {
		// M5.9: default flipped `false` -> `"auto"` (RFC 4978, spec §2 —
		// this is the diff that makes that comment true).
		return "auto";
	}
	if (compress === "auto" || compress === false) {
		return compress;
	}
	throw new TypeError('compress must be "auto", false, or omitted');
}

function validateTimeouts(timeouts: unknown): Required<ImapClientTimeouts> {
	if (timeouts === undefined) {
		return { ...DEFAULT_TIMEOUTS };
	}
	if (!isPlainObject(timeouts)) {
		throw new TypeError("timeouts must be an object");
	}
	const resolved = { ...DEFAULT_TIMEOUTS };
	for (const key of Object.keys(DEFAULT_TIMEOUTS) as Array<
		keyof ImapClientTimeouts
	>) {
		const value = timeouts[key];
		if (value !== undefined) {
			resolved[key] = assertNonNegativeNumber(value, `timeouts.${key}`);
		}
	}
	return resolved;
}

/**
 * Validates and resolves a caller-supplied `ImapClientConfig` (spec §2).
 * Throws `TypeError`/`RangeError` synchronously on the first violation found
 * (bad port, blank host, `auth` with neither `pass` nor `accessToken`,
 * negative timeouts, an unknown `tls` mode, …). The returned `ResolvedConfig`
 * is a deep-enough copy that later mutation of the caller's original object
 * (including its nested `tlsOptions`/`auth`/`timeouts`/`id` objects) has no
 * effect on it — every nested object field this module reads is copied one
 * level deep at minimum.
 */
export function validateConfig(config: ImapClientConfig): ResolvedConfig {
	if (!isPlainObject(config)) {
		throw new TypeError("config must be an object");
	}

	const host = validateHost(config.host);
	const tlsMode = validateTls(config.tls);
	const port = validatePort(config.port, tlsMode);
	const auth = validateAuth(config.auth);
	const id = validateId(config.id);
	const extensions = validateExtensions(config.extensions);
	const compress = validateCompress(config.compress);
	const timeouts = validateTimeouts(config.timeouts);

	const allowInsecureAuth = validateAllowInsecureAuth(config.allowInsecureAuth);

	const maxInlineSize =
		config.maxInlineSize === undefined
			? DEFAULT_MAX_INLINE_SIZE
			: assertNonNegativeNumber(config.maxInlineSize, "maxInlineSize");

	if (
		config.tlsOptions !== undefined &&
		!isPlainObject(config.tlsOptions)
	) {
		throw new TypeError("tlsOptions must be an object");
	}
	if (config.logger !== undefined && typeof config.logger !== "function") {
		throw new TypeError("logger must be a function");
	}

	return {
		host,
		port,
		tls: tlsMode,
		tlsOptions: config.tlsOptions ? { ...config.tlsOptions } : undefined,
		auth,
		allowInsecureAuth,
		id,
		extensions,
		compress,
		maxInlineSize,
		timeouts,
		logger: config.logger,
	};
}
