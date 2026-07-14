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

export interface ImapAuthConfig {
	user: string;
	/** Password-bearing mechanisms (LOGIN, PLAIN, CRAM-MD5, SCRAM-*). */
	pass?: string;
	/** Bearer token for OAUTHBEARER/XOAUTH2. */
	accessToken?: string;
	/** Preference order; default per spec §9.3. May mix mechanism names and
	 *  concrete `SaslMechanism` instances (a later milestone's selection
	 *  algorithm consumes this — accepted/validated here, not yet acted on). */
	mechanisms?: Array<string | SaslMechanism>;
}

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

export interface ImapClientConfig {
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
	timeouts?: ImapClientTimeouts;
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

function validateAuth(auth: unknown): ImapAuthConfig | undefined {
	if (auth === undefined) {
		return undefined;
	}
	if (!isPlainObject(auth) || typeof auth.user !== "string") {
		throw new TypeError("auth.user must be a string");
	}
	if (auth.pass === undefined && auth.accessToken === undefined) {
		throw new TypeError(
			"auth requires either 'pass' or 'accessToken' to be set",
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
	return {
		user: auth.user,
		pass: auth.pass as string | undefined,
		accessToken: auth.accessToken as string | undefined,
		mechanisms: auth.mechanisms
			? [...(auth.mechanisms as Array<string | SaslMechanism>)]
			: undefined,
	};
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

	const allowInsecureAuth = config.allowInsecureAuth === true;

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
