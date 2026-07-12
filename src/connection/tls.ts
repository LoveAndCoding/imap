import * as net from "net";
import { clearTimeout, setTimeout } from "timers";
import * as tls from "tls";

import { ConnectionTimeout, TLSSocketError } from "./errors";
import type { TLSErrorReason } from "./errors";

/**
 * ONE TLS policy module (spec §10.1/§10.2): every TLS socket the library
 * creates — implicit connect AND the STARTTLS upgrade — MUST be created
 * through `openTls()` below. No other module may call `tls.connect`
 * directly.
 */

/**
 * Connection options a caller may not override via `tlsOptions`. These four
 * keys are the ones that would let a caller silently weaken (or entirely
 * disable) identity verification, so `openTls` enforces them itself and
 * rejects any attempt to set them from the outside (§10.2).
 */
const FORBIDDEN_TLS_OPTION_KEYS = [
	"rejectUnauthorized",
	"checkServerIdentity",
	"servername",
	"socket",
] as const;

export interface OpenTlsOptions {
	/** Reference identity used for `servername` and hostname verification. */
	host: string;
	/** Target port for a fresh connection. Ignored when `socket` is provided. */
	port?: number;
	/**
	 * An already-connected plaintext socket to upgrade in place (STARTTLS).
	 * When provided, a fresh TCP connection is not made; `host`/`port` are
	 * only used to compute `servername`.
	 */
	socket?: net.Socket;
	/** Milliseconds to wait for the handshake (or the initial TCP connect). */
	timeoutMs: number;
	/**
	 * Caller-supplied TLS options (e.g. `ca`, `minVersion`, ciphers). Merged
	 * UNDER the identity-enforcing values below — see FORBIDDEN_TLS_OPTION_KEYS.
	 */
	tlsOptions?: tls.ConnectionOptions;
}

/**
 * Validates that the caller did not attempt to set any of the
 * identity-weakening keys on `tlsOptions`. Throws `RangeError` synchronously
 * (no silent weakening, per §10.2).
 */
function assertNoForbiddenTlsOptions(tlsOptions: tls.ConnectionOptions | undefined): void {
	if (!tlsOptions) {
		return;
	}
	for (const key of FORBIDDEN_TLS_OPTION_KEYS) {
		if (Object.prototype.hasOwnProperty.call(tlsOptions, key)) {
			throw new RangeError(
				`tlsOptions.${key} may not be set by the caller: it is enforced ` +
					`by the connection layer to guarantee TLS identity checks ` +
					`cannot be silently weakened`,
			);
		}
	}
}

/**
 * Best-effort classification of a TLS failure into the reason taxonomy
 * defined on `TLSSocketError`. Hostname/identity mismatches are singled out
 * because Node reports them with a stable error code; everything else that
 * happens while trying to establish the secure channel is a "handshake"
 * failure.
 */
function classifyTlsError(err: NodeJS.ErrnoException): TLSErrorReason {
	if (err.code === "ERR_TLS_CERT_ALTNAME_INVALID") {
		return "identity-mismatch";
	}
	return "handshake";
}

function toTlsError(err: Error, socket: tls.TLSSocket): TLSSocketError {
	if (err instanceof TLSSocketError) {
		return err;
	}
	const reason = classifyTlsError(err as NodeJS.ErrnoException);
	let certificate: tls.PeerCertificate | undefined;
	try {
		const cert = socket.getPeerCertificate?.();
		certificate = cert && Object.keys(cert).length > 0 ? cert : undefined;
	} catch {
		certificate = undefined;
	}
	return new TLSSocketError(err.message, reason, certificate);
}

/**
 * Opens (or upgrades) a TLS socket under the library's fixed identity
 * policy: `servername` is always the configured reference identity
 * (`host`), `rejectUnauthorized` is always `true`, and Node's default
 * `checkServerIdentity` (DNS-ID matching, no CN fallback, URI-ID never
 * consulted) is always used. Handshake or identity failure destroys the
 * socket and REJECTS the returned promise with a `TLSSocketError` — it never
 * hangs and never resolves with a falsy value to signal failure.
 */
export async function openTls(opts: OpenTlsOptions): Promise<tls.TLSSocket> {
	const { host, port, socket, timeoutMs, tlsOptions } = opts;

	// Validate up front so a caller gets a clear failure — as a rejected
	// promise, same as every other openTls() failure mode, never a
	// synchronous throw a caller might not be prepared to catch — rather
	// than a confusing downstream TLS error (no silent weakening, §10.2).
	assertNoForbiddenTlsOptions(tlsOptions);

	const connectOptions: tls.ConnectionOptions = {
		...tlsOptions,
		// Enforced identity policy — always wins over anything above.
		servername: host,
		rejectUnauthorized: true,
	};
	if (socket) {
		connectOptions.socket = socket;
	} else {
		connectOptions.host = host;
		connectOptions.port = port;
	}

	return new Promise<tls.TLSSocket>((resolve, reject) => {
		let settled = false;

		const tlsSocket = tls.connect(connectOptions);

		let timer: NodeJS.Timeout | undefined = setTimeout(() => {
			if (settled) {
				return;
			}
			settled = true;
			tlsSocket.off("error", onError);
			tlsSocket.off("secureConnect", onSecureConnect);
			const err = new ConnectionTimeout(
				timeoutMs,
				socket ? "TLS Negotiation" : "Socket",
			);
			tlsSocket.destroy();
			reject(err);
		}, timeoutMs);

		const cleanup = () => {
			if (timer !== undefined) {
				clearTimeout(timer);
				timer = undefined;
			}
			tlsSocket.off("error", onError);
			tlsSocket.off("secureConnect", onSecureConnect);
		};

		const onError = (err: Error) => {
			if (settled) {
				return;
			}
			settled = true;
			const tlsErr = toTlsError(err, tlsSocket);
			cleanup();
			tlsSocket.destroy();
			reject(tlsErr);
		};

		const onSecureConnect = () => {
			if (settled) {
				return;
			}
			settled = true;
			cleanup();
			resolve(tlsSocket);
		};

		// Attach the error listener BEFORE waiting for secureConnect: a
		// handshake/identity failure surfaces as an 'error' event, and an
		// unhandled 'error' event would otherwise crash the process instead
		// of rejecting this promise.
		tlsSocket.once("error", onError);
		tlsSocket.once("secureConnect", onSecureConnect);
	});
}
