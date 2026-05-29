import * as net from "net";

const CRLF = "\r\n";

export type LineHandler = (
	line: string,
	sock: net.Socket,
	server: MockIMAPServer,
) => void;

/**
 * A tiny scriptable IMAP server for integration tests. It speaks raw IMAP
 * over a plain TCP socket so the modern Connection/Session can be driven
 * end to end. Every complete client line is recorded on `received`, and a
 * caller-supplied handler decides what (and when) to write back.
 *
 * The handler receives lines with their trailing CRLF already stripped.
 * Literal continuations sent by the client (e.g. the body of an APPEND)
 * are not line-parsed specially; tests that need that should account for
 * it in their handler.
 */
export class MockIMAPServer {
	public received: string[] = [];

	private server: net.Server;
	private sockets: net.Socket[] = [];
	private buffer = "";

	constructor(
		private readonly handler: LineHandler,
		private readonly greeting: string = "* OK mock server ready",
	) {
		this.server = net.createServer((sock) => {
			this.sockets.push(sock);
			sock.setNoDelay(true);
			this.write(sock, this.greeting + CRLF);
			sock.on("data", (data) => this.onData(data, sock));
		});
	}

	public listen(): Promise<number> {
		return new Promise((resolve) => {
			this.server.listen(0, "127.0.0.1", () => {
				resolve((this.server.address() as net.AddressInfo).port);
			});
		});
	}

	public write(sock: net.Socket, data: string): void {
		// Each scripted response already contains its own CRLFs.
		sock.write(data);
	}

	/** Like write, but writes the bytes in arbitrary fragments to simulate
	 *  TCP packet boundaries falling in awkward places (mid-literal, etc.). */
	public writeFragmented(
		sock: net.Socket,
		data: string,
		chunkSize: number,
	): void {
		for (let i = 0; i < data.length; i += chunkSize) {
			sock.write(data.slice(i, i + chunkSize));
		}
	}

	public close(): Promise<void> {
		for (const sock of this.sockets) {
			sock.destroy();
		}
		return new Promise((resolve) => this.server.close(() => resolve()));
	}

	/** The tag of a client line (the first space-delimited token). */
	public static tagOf(line: string): string {
		return line.split(" ")[0];
	}

	/** The command body of a client line (everything after the tag). */
	public static bodyOf(line: string): string {
		if (!line) {
			return "";
		}
		const idx = line.indexOf(" ");
		return idx === -1 ? "" : line.slice(idx + 1);
	}

	private onData(data: Buffer, sock: net.Socket): void {
		this.buffer += data.toString("utf8");
		let idx: number;
		while ((idx = this.buffer.indexOf(CRLF)) > -1) {
			const line = this.buffer.slice(0, idx);
			this.buffer = this.buffer.slice(idx + CRLF.length);
			this.received.push(line);
			this.handler(line, sock, this);
		}
	}
}

/**
 * Build a handler that responds to recognised command keywords, ignoring
 * the (auto-generated) tag. `script` maps an uppercase command keyword to
 * either a static response body (without the tag/OK line) or a function
 * that returns the full raw response to write (including tagged status).
 */
export interface ScriptEntry {
	// Untagged lines to send before the tagged completion (each without CRLF)
	untagged?: string[];
	// The tagged status to send, defaults to "OK <KEYWORD> completed"
	status?: string;
	// Fully custom handler; when present, untagged/status are ignored
	custom?: (
		tag: string,
		line: string,
		sock: net.Socket,
		server: MockIMAPServer,
	) => void;
}

export function scriptedHandler(
	script: Record<string, ScriptEntry>,
): LineHandler {
	return (line, sock, server) => {
		const tag = MockIMAPServer.tagOf(line);
		const body = MockIMAPServer.bodyOf(line);
		const keyword = (body.split(" ")[0] || tag).toUpperCase();
		const entry = script[keyword];
		if (!entry) {
			server.write(sock, `${tag} BAD unknown command ${keyword}${CRLF}`);
			return;
		}
		if (entry.custom) {
			entry.custom(tag, line, sock, server);
			return;
		}
		const lines = [...(entry.untagged || [])];
		lines.push(`${tag} ${entry.status || `OK ${keyword} completed`}`);
		server.write(sock, lines.join(CRLF) + CRLF);
	};
}
