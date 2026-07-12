import { IMAPError } from "../errors";

export class ConnectionTimeout extends Error {
	constructor(
		public readonly timeout: number,
		public readonly phase: "Socket" | "Greeting" | "TLS Negotiation",
	) {
		super(`IMAP connection timed out`);
	}
}

/**
 * Reason classification for a TLS failure:
 *  - "identity-mismatch": handshake succeeded but the presented certificate
 *    does not match the configured reference identity (host).
 *  - "handshake": the TLS handshake itself failed (untrusted chain, expired
 *    certificate, protocol/cipher negotiation failure, socket error, etc).
 *  - "policy": the library refused to proceed for a local policy reason not
 *    tied to a specific handshake attempt (e.g. STARTTLS capability absent
 *    when TLS was mandatory).
 *
 * A full public error hierarchy lands in a later milestone; this is kept
 * intentionally local and minimal for now.
 */
export type TLSErrorReason = "identity-mismatch" | "handshake" | "policy";

export class TLSSocketError extends Error {
	constructor(
		message: string,
		public readonly reason: TLSErrorReason = "handshake",
		public readonly certificate?: unknown,
	) {
		super(message);
		this.name = "TLSSocketError";
	}
}

// `IMAPError` is included here because `Connection`'s generic socket-error
// handler wraps arbitrary socket errors in one; not every connection-level
// error is TLS-specific.
export type ConnectionErrors = ConnectionTimeout | TLSSocketError | IMAPError;
