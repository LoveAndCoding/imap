export class ConnectionTimeout extends Error {
	constructor(
		public readonly timeout: number,
		public readonly phase: "Socket" | "Greeting" | "TLS Negotiation",
	) {
		super(`IMAP connection timed out`);
	}
}

export class TLSSocketError extends Error {}

export type ConnectionErrors = ConnectionTimeout | TLSSocketError;
