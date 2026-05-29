import { EventEmitter } from "events";

import {
	AppendCommand,
	AuthenticateCommand,
	Command,
	CopyCommand,
	CreateCommand,
	DeleteCommand,
	EnableCommand,
	ExamineCommand,
	ExpungeCommand,
	FetchCommand,
	IdleCommand,
	ListCommand,
	LoginCommand,
	LogoutCommand,
	MoveCommand,
	NamespaceCommand,
	RenameCommand,
	SearchCommand,
	SelectCommand,
	StatusCommand,
	StoreCommand,
	SubscribeCommand,
} from "../../../src/commands";
import Box from "../../../src/box";
import { AuthenticationError } from "../../../src/errors";
import Lexer from "../../../src/lexer";
import Message from "../../../src/message";
import Parser from "../../../src/parser";

const lexer = new Lexer();
const parser = new Parser();

// Build a parsed response object from a raw IMAP line.
function resp(line: string) {
	return parser.parseTokens(lexer.tokenize(`${line}\r\n`));
}

// A minimal stand-in for a Connection that records sent data and lets us
// feed responses back to a running command.
class FakeConnection extends EventEmitter {
	public sent: string[] = [];
	public send(data: string) {
		this.sent.push(data);
	}
}

// The text of the command without the auto-generated tag id.
function commandText(command: Command<any>): string {
	const full = command.getFullAnnotatedCommand();
	return full.slice(command.id.length + 1);
}

// Run a command against a fake connection, feeding it the given responses.
// `untagged` go out on the response channel, `status` on the serverStatus
// channel (untagged OK/NO/BAD lines), then a final tagged OK.
async function runWith<T>(
	command: Command<T>,
	opts: {
		untagged?: string[];
		status?: string[];
		tagged?: string;
	} = {},
): Promise<{ result: T; conn: FakeConnection }> {
	const conn = new FakeConnection();
	const promise = command.run(conn as any);
	for (const line of opts.untagged || []) {
		conn.emit("response", resp(line));
	}
	for (const line of opts.status || []) {
		conn.emit("serverStatus", resp(line));
	}
	const tagged = opts.tagged || `${command.id} OK Completed`;
	conn.emit("response", resp(tagged));
	const result = await promise;
	return { result, conn };
}

describe("Command wire formats", () => {
	test("LOGIN keeps credentials out of the public command text", () => {
		const cmd = new LoginCommand("me", "secret");
		// The public, loggable command text must not contain credentials.
		expect(commandText(cmd)).toBe("LOGIN");
		expect(cmd.getFullAnnotatedCommand()).not.toContain("secret");
		expect(cmd.getFullAnnotatedCommand()).not.toContain("me");
	});

	test("CREATE / DELETE / SUBSCRIBE encode the mailbox name", () => {
		expect(commandText(new CreateCommand("Archive"))).toBe(
			'CREATE "Archive"',
		);
		expect(commandText(new DeleteCommand("Archive"))).toBe(
			'DELETE "Archive"',
		);
		expect(commandText(new SubscribeCommand("Archive"))).toBe(
			'SUBSCRIBE "Archive"',
		);
	});

	test("RENAME encodes both names", () => {
		expect(commandText(new RenameCommand("Old", "New"))).toBe(
			'RENAME "Old" "New"',
		);
	});

	test("SELECT / EXAMINE", () => {
		expect(commandText(new SelectCommand("INBOX"))).toBe('SELECT "INBOX"');
		expect(commandText(new ExamineCommand("INBOX"))).toBe(
			'EXAMINE "INBOX"',
		);
	});

	test("STATUS uses the default item list", () => {
		expect(commandText(new StatusCommand("INBOX"))).toBe(
			'STATUS "INBOX" (MESSAGES RECENT UIDNEXT UIDVALIDITY UNSEEN)',
		);
	});

	test("LIST sends reference and pattern", () => {
		expect(commandText(new ListCommand("", "*"))).toBe('LIST "" "*"');
	});

	test("FETCH formats items and supports UID", () => {
		expect(commandText(new FetchCommand("1:5", ["FLAGS", "UID"]))).toBe(
			"FETCH 1:5 (FLAGS UID)",
		);
		expect(commandText(new FetchCommand(2, "ALL"))).toBe("FETCH 2 ALL");
		expect(commandText(new FetchCommand("1", ["FLAGS"], true))).toBe(
			"UID FETCH 1 (FLAGS)",
		);
	});

	test("STORE formats action and flags", () => {
		expect(
			commandText(new StoreCommand("1", "+FLAGS", ["\\Seen"])),
		).toBe("STORE 1 +FLAGS (\\Seen)");
		expect(
			commandText(new StoreCommand("1", "-FLAGS.SILENT", ["\\Seen"], true)),
		).toBe("UID STORE 1 -FLAGS.SILENT (\\Seen)");
	});

	test("SEARCH supports charset and UID", () => {
		expect(commandText(new SearchCommand(["UNSEEN"]))).toBe(
			"SEARCH UNSEEN",
		);
		expect(
			commandText(
				new SearchCommand(["UNSEEN"], { charset: "UTF-8", useUid: true }),
			),
		).toBe("UID SEARCH CHARSET UTF-8 UNSEEN");
	});

	test("COPY / MOVE", () => {
		expect(commandText(new CopyCommand("1:3", "Archive"))).toBe(
			'COPY 1:3 "Archive"',
		);
		expect(commandText(new MoveCommand("1:3", "Archive", true))).toBe(
			'UID MOVE 1:3 "Archive"',
		);
	});

	test("EXPUNGE plain and UID form", () => {
		expect(commandText(new ExpungeCommand())).toBe("EXPUNGE");
		expect(commandText(new ExpungeCommand(true, "1:5"))).toBe(
			"UID EXPUNGE 1:5",
		);
	});

	test("ENABLE joins capabilities", () => {
		expect(commandText(new EnableCommand(["CONDSTORE", "QRESYNC"]))).toBe(
			"ENABLE CONDSTORE QRESYNC",
		);
	});

	test("NAMESPACE", () => {
		expect(commandText(new NamespaceCommand())).toBe("NAMESPACE");
	});

	test("AUTHENTICATE names the mechanism only", () => {
		expect(
			commandText(
				new AuthenticateCommand("PLAIN", {
					username: "me",
					password: "pw",
				}),
			),
		).toBe("AUTHENTICATE PLAIN");
	});

	test("APPEND announces the literal length", () => {
		expect(
			commandText(
				new AppendCommand("INBOX", "hello", { flags: ["\\Seen"] }),
			),
		).toBe('APPEND "INBOX" (\\Seen) {5}');
	});
});

describe("Command response parsing", () => {
	test("LOGIN resolves true on a tagged OK", async () => {
		const { result } = await runWith(new LoginCommand("me", "pw"));
		expect(result).toBe(true);
	});

	test("LOGOUT resolves true", async () => {
		const { result } = await runWith(new LogoutCommand());
		expect(result).toBe(true);
	});

	test("SELECT builds a writable Box from the untagged data", async () => {
		const cmd = new SelectCommand("INBOX");
		const { result } = await runWith(cmd, {
			untagged: ["* 17 EXISTS", "* 2 RECENT", "* FLAGS (\\Seen \\Draft)"],
			status: [
				"* OK [UNSEEN 8] first unseen",
				"* OK [UIDVALIDITY 12345] uids valid",
				"* OK [UIDNEXT 99] predicted next",
				"* OK [PERMANENTFLAGS (\\Deleted \\Seen \\*)] limited",
			],
			tagged: `${cmd.id} OK [READ-WRITE] SELECT completed`,
		});
		expect(result).toBeInstanceOf(Box);
		expect(result.name).toBe("INBOX");
		expect(result.readOnly).toBe(false);
		expect(result.writable).toBe(true);
		expect(result.exists).toBe(17);
		expect(result.recent).toBe(2);
		expect(result.unseen).toBe(8);
		expect(result.uidvalidity).toBe(12345);
		expect(result.uidnext).toBe(99);
		expect(result.flags).toBeDefined();
		expect(result.permanentFlags).toEqual(
			expect.arrayContaining(["\\Deleted", "\\Seen"]),
		);
	});

	test("EXAMINE marks the Box read-only", async () => {
		const cmd = new ExamineCommand("INBOX");
		const { result } = await runWith(cmd, {
			untagged: ["* 17 EXISTS"],
			tagged: `${cmd.id} OK [READ-ONLY] EXAMINE completed`,
		});
		expect(result.readOnly).toBe(true);
		expect(result.writable).toBe(false);
	});

	test("FETCH collects messages", async () => {
		const { result } = await runWith(new FetchCommand("1", ["FLAGS", "UID"]), {
			untagged: ["* 1 FETCH (UID 99 FLAGS (\\Seen))"],
		});
		expect(result).toHaveLength(1);
		expect(result[0]).toBeInstanceOf(Message);
		expect(result[0].sequenceNumber).toBe(1);
		expect(result[0].uid).toBe(99);
		expect(result[0].seen).toBe(true);
	});

	test("SEARCH returns the matched sequence numbers", async () => {
		const { result } = await runWith(new SearchCommand(["UNSEEN"]), {
			untagged: ["* SEARCH 2 84 882"],
		});
		expect(result).toEqual([2, 84, 882]);
	});

	test("EXPUNGE returns the expunged sequence numbers", async () => {
		const { result } = await runWith(new ExpungeCommand(), {
			untagged: ["* 4 EXPUNGE", "* 2 EXPUNGE"],
		});
		expect(result).toEqual([4, 2]);
	});

	test("STATUS returns the parsed mailbox status", async () => {
		const { result } = await runWith(new StatusCommand("INBOX"), {
			untagged: [
				"* STATUS INBOX (MESSAGES 231 RECENT 0 UIDNEXT 44292 UIDVALIDITY 1 UNSEEN 5)",
			],
		});
		expect(result.name).toBe("INBOX");
		expect(result.messages).toBe(231);
		expect(result.uidnext).toBe(44292);
		expect(result.unseen).toBe(5);
	});

	test("LIST returns mailbox listings", async () => {
		const { result } = await runWith(new ListCommand("", "*"), {
			untagged: [
				'* LIST (\\HasNoChildren) "/" "INBOX"',
				'* LIST (\\HasNoChildren) "/" "Archive"',
			],
		});
		expect(result.map((l) => l.name)).toEqual(["INBOX", "Archive"]);
	});

	test("NAMESPACE returns the namespace response", async () => {
		const { result } = await runWith(new NamespaceCommand(), {
			untagged: ['* NAMESPACE (("" "/")) NIL NIL'],
		});
		expect(result.personal).not.toBeNull();
		expect(result.others).toBeNull();
		expect(result.shared).toBeNull();
	});

	test("AUTHENTICATE answers the continuation with base64 credentials", async () => {
		const cmd = new AuthenticateCommand("PLAIN", {
			username: "me",
			password: "pw",
		});
		const conn = new FakeConnection();
		const promise = cmd.run(conn as any);
		conn.emit("response", resp("+ "));
		conn.emit("response", resp(`${cmd.id} OK AUTHENTICATE completed`));
		const result = await promise;
		expect(result).toBe(true);
		const expected = Buffer.from("\0me\0pw", "utf8").toString("base64");
		expect(conn.sent).toContain(expected);
	});

	test("APPEND sends the message body on continuation", async () => {
		const cmd = new AppendCommand("INBOX", "hello");
		const conn = new FakeConnection();
		const promise = cmd.run(conn as any);
		conn.emit("response", resp("+ Ready for literal"));
		conn.emit("response", resp(`${cmd.id} OK APPEND completed`));
		const result = await promise;
		expect(result).toBe(true);
		expect(conn.sent).toContain("hello");
	});
});

describe("Authentication error semantics", () => {
	test("LOGIN resolves false when the server says NO", async () => {
		const cmd = new LoginCommand("me", "wrong");
		const conn = new FakeConnection();
		const promise = cmd.run(conn as any);
		conn.emit("response", resp(`${cmd.id} NO authentication failed`));
		await expect(promise).resolves.toBe(false);
	});

	test("LOGIN throws AuthenticationError when the server says BAD", async () => {
		const cmd = new LoginCommand("me", "x");
		const conn = new FakeConnection();
		const promise = cmd.run(conn as any);
		conn.emit("response", resp(`${cmd.id} BAD plaintext auth disabled`));
		await expect(promise).rejects.toBeInstanceOf(AuthenticationError);
	});

	test("AUTHENTICATE rejects bad credentials with a CREDENTIALS error", async () => {
		const cmd = new AuthenticateCommand("PLAIN", {
			username: "me",
			password: "wrong",
		});
		const conn = new FakeConnection();
		const promise = cmd.run(conn as any);
		conn.emit("response", resp("+ "));
		conn.emit("response", resp(`${cmd.id} NO invalid credentials`));
		await expect(promise).rejects.toMatchObject({ type: "CREDENTIALS" });
	});
});

describe("IdleCommand", () => {
	test("sends DONE once idling and resolves on the tagged OK", async () => {
		const cmd = new IdleCommand();
		const conn = new FakeConnection();
		const promise = cmd.run(conn as any);
		expect(cmd.isIdling).toBe(false);
		conn.emit("response", resp("+ idling"));
		expect(cmd.isIdling).toBe(true);
		cmd.done();
		expect(conn.sent).toContain("DONE");
		conn.emit("response", resp(`${cmd.id} OK IDLE terminated`));
		await expect(promise).resolves.toBe(true);
	});

	test("defers DONE until the server acknowledges IDLE", async () => {
		const cmd = new IdleCommand();
		const conn = new FakeConnection();
		const promise = cmd.run(conn as any);
		// Request done before the continuation arrives
		cmd.done();
		expect(conn.sent).not.toContain("DONE");
		conn.emit("response", resp("+ idling"));
		expect(conn.sent).toContain("DONE");
		conn.emit("response", resp(`${cmd.id} OK IDLE terminated`));
		await expect(promise).resolves.toBe(true);
	});
});
