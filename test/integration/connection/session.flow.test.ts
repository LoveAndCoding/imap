import { TLSSetting } from "../../../src/connection/types";
import Session from "../../../src/session";
import {
	MockIMAPServer,
	ScriptEntry,
	scriptedHandler,
} from "./mock.server";

const CRLF = "\r\n";

const CAPS = "* CAPABILITY IMAP4rev1 UNSELECT IDLE NAMESPACE QUOTA CHILDREN";

// A baseline script covering the unauthenticated/authenticated handshake
// used by most flows. Individual tests override entries as needed.
function baseScript(overrides: Record<string, ScriptEntry> = {}) {
	return {
		CAPABILITY: { untagged: [CAPS], status: "OK done" },
		LOGIN: { status: "OK authenticated (Success)" },
		NAMESPACE: {
			untagged: ['* NAMESPACE (("" "/")) NIL NIL'],
			status: "OK Success",
		},
		LIST: {
			untagged: ['* LIST (\\Noselect) "/" "/"'],
			status: "OK Success",
		},
		EXAMINE: {
			untagged: [
				"* FLAGS (\\Answered \\Flagged \\Draft \\Deleted \\Seen)",
				"* OK [PERMANENTFLAGS ()] Flags permitted.",
				"* OK [UIDVALIDITY 2] UIDs valid.",
				"* 685 EXISTS",
				"* 0 RECENT",
				"* OK [UIDNEXT 4422] Predicted next UID.",
			],
			status: "OK [READ-ONLY] INBOX selected. (Success)",
		},
		STATUS: {
			untagged: [
				"* STATUS test (MESSAGES 231 RECENT 0 UNSEEN 0 UIDVALIDITY 123 UIDNEXT 442)",
			],
			status: "OK STATUS completed",
		},
		LOGOUT: { untagged: ["* BYE LOGOUT Requested"], status: "OK good day" },
		...overrides,
	};
}

async function connectedSession(script: Record<string, ScriptEntry>) {
	const server = new MockIMAPServer(scriptedHandler(script), "* OK asdf");
	const port = await server.listen();
	const session = new Session({
		host: "127.0.0.1",
		port,
		tls: TLSSetting.FORCE_OFF,
	});
	await session.start();
	return { server, session };
}

describe("Session command wire formats", () => {
	test("sends the expected client requests for a full flow", async () => {
		const { server, session } = await connectedSession(baseScript());
		try {
			await session.login("foo", "bar");
			await session.namespace();
			await session.list("", "");
			await session.examine("INBOX");
			await session.status("test", [
				"MESSAGES",
				"RECENT",
				"UNSEEN",
				"UIDVALIDITY",
				"UIDNEXT",
			]);
			await session.logout();
		} finally {
			await server.close();
		}

		const bodies = server.received.map((l) => MockIMAPServer.bodyOf(l));
		expect(bodies).toEqual([
			"CAPABILITY",
			'LOGIN "foo" "bar"',
			"NAMESPACE",
			'LIST "" ""',
			'EXAMINE "INBOX"',
			'STATUS "test" (MESSAGES RECENT UNSEEN UIDVALIDITY UIDNEXT)',
			"LOGOUT",
		]);
	});

	test("LOGIN never exposes credentials through the public command text", () => {
		// getFullAnnotatedCommand is public and must not leak the password.
		const {
			LoginCommand,
		} = require("../../../src/commands") as typeof import("../../../src/commands");
		const cmd = new LoginCommand("foo", "hunter2");
		const text = cmd.getFullAnnotatedCommand();
		expect(text).not.toContain("hunter2");
		expect(text).not.toContain("foo");
	});
});

describe("FETCH result parsing", () => {
	test("merges duplicate FETCH responses for one sequence number (fetch-dup)", async () => {
		const fetchEntry: ScriptEntry = {
			custom: (tag, _line, sock, server) => {
				server.write(
					sock,
					[
						"* 1 FETCH (UID 1)",
						'* 1 FETCH (INTERNALDATE "05-Sep-2004 00:38:03 +0000" UID 1000)',
						'* 1 FETCH (BODY[TEXT] "IMAP is terrible")',
						"* 1 FETCH (FLAGS (\\Seen))",
						`${tag} OK Success`,
						"",
					].join(CRLF),
				);
			},
		};
		const { server, session } = await connectedSession(
			baseScript({ FETCH: fetchEntry }),
		);
		try {
			await session.login("foo", "bar");
			await session.examine("INBOX");
			const messages = await session.fetch(1, [
				"UID",
				"FLAGS",
				"INTERNALDATE",
				"BODY.PEEK[TEXT]",
			]);

			expect(messages).toHaveLength(1);
			const msg = messages[0];
			// First UID wins; later duplicate must not overwrite it.
			expect(msg.uid).toBe(1);
			expect(msg.internalDate).toEqual(
				new Date("05-Sep-2004 00:38:03 +0000"),
			);
			expect(msg.flags.flags.map((f) => f.name)).toEqual(["\\Seen"]);

			const section = msg.body.sections.find((s) => s.kind === "TEXT");
			expect(section.contents).toBe("IMAP is terrible");
			expect(section.contents.length).toBe(16);
		} finally {
			await server.close();
		}

		const fetchLine = server.received.find((l) =>
			MockIMAPServer.bodyOf(l).startsWith("FETCH"),
		);
		expect(MockIMAPServer.bodyOf(fetchLine)).toBe(
			"FETCH 1 (UID FLAGS INTERNALDATE BODY.PEEK[TEXT])",
		);
	});

	test("reads a literal body split across TCP packets (fetch-frag)", async () => {
		const bodyText = "IMAP is terrible";
		const fetchEntry: ScriptEntry = {
			custom: (tag, _line, sock, server) => {
				const raw =
					[
						"* 1 FETCH (UID 1)",
						'* 1 FETCH (INTERNALDATE "05-Sep-2004 00:38:03 +0000" UID 1000)',
						`* 1 FETCH (BODY[TEXT] {${bodyText.length}}`,
						`${bodyText})`,
						"* 1 FETCH (FLAGS (\\Seen))",
						`${tag} OK Success`,
						"",
					].join(CRLF);
				// Fragment aggressively to split the literal mid-stream.
				server.writeFragmented(sock, raw, 7);
			},
		};
		const { server, session } = await connectedSession(
			baseScript({ FETCH: fetchEntry }),
		);
		try {
			await session.login("foo", "bar");
			await session.examine("INBOX");
			const messages = await session.fetch(1, [
				"UID",
				"FLAGS",
				"INTERNALDATE",
				"BODY.PEEK[TEXT]",
			]);
			expect(messages).toHaveLength(1);
			expect(messages[0].uid).toBe(1);
			const section = messages[0].body.sections.find(
				(s) => s.kind === "TEXT",
			);
			expect(section.contents).toBe(bodyText);
		} finally {
			await server.close();
		}
	});

	test("handles multiple messages with partial bodies (fetch-spillover)", async () => {
		const bytes = "x".repeat(800);
		const fetchEntry: ScriptEntry = {
			custom: (tag, _line, sock, server) => {
				const raw =
					[
						'* 1 FETCH (UID 1000 INTERNALDATE "05-Sep-2004 00:38:03 +0000" FLAGS (\\Seen) BODY[TEXT] {' +
							bytes.length +
							"}",
						`${bytes})`,
						'* 2 FETCH (UID 1001 INTERNALDATE "05-Sep-2004 00:38:13 +0000" FLAGS (\\Seen) BODY[TEXT] {200}',
						`${bytes.substring(0, 200)})`,
						`${tag} OK Success`,
						"",
					].join(CRLF);
				server.write(sock, raw);
			},
		};
		const { server, session } = await connectedSession(
			baseScript({ FETCH: fetchEntry }),
		);
		try {
			await session.login("foo", "bar");
			await session.examine("INBOX");
			const messages = await session.fetch("1,2", [
				"UID",
				"FLAGS",
				"INTERNALDATE",
				"BODY.PEEK[TEXT]",
			]);
			expect(messages.map((m) => m.uid)).toEqual([1000, 1001]);
			const bodies = messages.map(
				(m) => m.body.sections.find((s) => s.kind === "TEXT").contents,
			);
			expect(bodies).toEqual([bytes, bytes.substring(0, 200)]);
		} finally {
			await server.close();
		}

		const fetchLine = server.received.find((l) =>
			MockIMAPServer.bodyOf(l).startsWith("FETCH"),
		);
		expect(MockIMAPServer.bodyOf(fetchLine)).toBe(
			"FETCH 1,2 (UID FLAGS INTERNALDATE BODY.PEEK[TEXT])",
		);
	});
});

describe("IDLE", () => {
	test("sends DONE only after the server continuation (idle-order)", async () => {
		let continued = false;
		const idleEntry: ScriptEntry = {
			custom: (tag, _line, sock, server) => {
				setTimeout(() => {
					continued = true;
					server.write(sock, "+ idling" + CRLF);
				}, 50);
				// The tagged completion is sent in response to DONE below.
				(server as any)._idleTag = tag;
			},
		};
		const doneEntry: ScriptEntry = {
			custom: (_tag, _line, sock, server) => {
				expect(continued).toBe(true);
				server.write(sock, `${(server as any)._idleTag} OK IDLE${CRLF}`);
			},
		};
		const { server, session } = await connectedSession(
			baseScript({ IDLE: idleEntry, DONE: doneEntry }),
		);
		try {
			await session.login("foo", "bar");
			await session.examine("INBOX");
			const idle = session.idle();
			await new Promise<void>((resolve) => idle.on("idling", resolve));
			idle.done();
			await idle.results;
		} finally {
			await server.close();
		}

		const bodies = server.received.map((l) => MockIMAPServer.bodyOf(l));
		// DONE is sent with no tag, so its body is empty; the raw line is "DONE".
		expect(server.received).toContain("DONE");
		const idleIdx = bodies.findIndex((b) => b === "IDLE");
		const doneIdx = server.received.findIndex((l) => l === "DONE");
		expect(idleIdx).toBeGreaterThan(-1);
		expect(doneIdx).toBeGreaterThan(idleIdx);
	});
});
