import { afterEach, expect, test } from "vitest";

import { ComplianceDriver } from "../driver";
import { NotImplementedError } from "../errors";
import { close, expectLine, reply, send } from "../../harness/script";
import { command } from "../../harness/matchers";
import { ScriptedServer } from "../../harness/scripted-server";

let server: ScriptedServer | undefined;
let driver: ComplianceDriver | undefined;
afterEach(async () => {
	await driver?.end();
	await server?.close();
	server = undefined;
	driver = undefined;
});

test("connect() drives ImapClient.connect() against the scripted server", async () => {
	server = await ScriptedServer.start();
	server.arm([
		[
			send("* OK ready\r\n"),
			expectLine(command("CAPABILITY", { args: null })),
			reply("OK done", ["* CAPABILITY IMAP4rev1"]),
		],
	]);
	driver = new ComplianceDriver();
	const connected = await driver.connect({
		host: "127.0.0.1",
		port: server.port,
		security: "none",
	});
	expect(connected).toBe(true);
	expect(driver.hasCapability("IMAP4rev1")).toBe(true);
	await server.assertCompleted();
});

test("noop/login/logout are wired to the public ImapClient (M1.9)", async () => {
	server = await ScriptedServer.start();
	server.arm([
		[
			send("* OK ready\r\n"),
			expectLine(command("CAPABILITY", { args: null })),
			reply("OK done", ["* CAPABILITY IMAP4rev1"]),
			expectLine(command("LOGIN")),
			reply("OK LOGIN completed"),
			expectLine(command("NOOP", { args: null })),
			reply("OK NOOP completed"),
			expectLine(command("LOGOUT", { args: null })),
			reply("OK LOGOUT completed", ["* BYE logging out"]),
		],
	]);
	driver = new ComplianceDriver();
	await driver.connect({ host: "127.0.0.1", port: server.port, security: "none" });
	await driver.login("user", "pass");
	expect(driver.authenticated).toBe(true);
	await driver.noop();
	await driver.logout();
	await server.assertCompleted();
});

test("enable() is wired to the public ImapClient (M1.9)", async () => {
	server = await ScriptedServer.start();
	server.arm([
		[
			send("* OK ready\r\n"),
			expectLine(command("CAPABILITY", { args: null })),
			reply("OK done", ["* CAPABILITY IMAP4rev1 ENABLE CONDSTORE"]),
			expectLine(command("LOGIN")),
			reply("OK LOGIN completed"),
			expectLine(command("ENABLE", { args: /^CONDSTORE$/ })),
			reply("OK ENABLE completed", ["* ENABLED CONDSTORE"]),
		],
	]);
	driver = new ComplianceDriver();
	await driver.connect({ host: "127.0.0.1", port: server.port, security: "none" });
	await driver.login("user", "pass");
	await expect(driver.enable(["CONDSTORE"])).resolves.toEqual(["CONDSTORE"]);
	await server.assertCompleted();
});

test("select()/examine() are wired to the public ImapClient (M2.2)", async () => {
	server = await ScriptedServer.start();
	server.arm([
		[
			send("* OK ready\r\n"),
			expectLine(command("CAPABILITY", { args: null })),
			reply("OK done", ["* CAPABILITY IMAP4rev1"]),
			expectLine(command("LOGIN")),
			reply("OK LOGIN completed"),
			expectLine(command("SELECT", { args: /^INBOX$/i })),
			reply("OK [READ-WRITE] SELECT completed", [
				"* 3 EXISTS",
				"* 0 RECENT",
				"* FLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft)",
				"* OK [PERMANENTFLAGS (\\Deleted \\Seen \\*)] Limited",
				"* OK [UIDVALIDITY 1] UIDs valid",
				"* OK [UIDNEXT 4] Predicted next UID",
			]),
			expectLine(command("EXAMINE", { args: /^INBOX$/i })),
			reply("OK [READ-ONLY] EXAMINE completed", ["* 3 EXISTS", "* 0 RECENT"]),
		],
	]);
	driver = new ComplianceDriver();
	await driver.connect({ host: "127.0.0.1", port: server.port, security: "none" });
	await driver.login("user", "pass");
	const session = await driver.select("INBOX");
	expect(session.name).toBe("INBOX");
	expect(session.readOnly).toBe(false);
	expect(session.exists).toBe(3);
	expect(session.canCreateKeywords).toBe(true);
	// Reselecting via EXAMINE: the same driver call, now forced read-only.
	const examined = await driver.examine("INBOX");
	expect(examined.readOnly).toBe(true);
	await server.assertCompleted();
});

test("select()/examine() translate CONDSTORE/QRESYNC options to NotImplementedError (M4 carry-forward)", async () => {
	driver = new ComplianceDriver();
	await expect(
		driver.select("INBOX", { condstore: true }),
	).rejects.toBeInstanceOf(NotImplementedError);
	await expect(
		driver.examine("INBOX", { qresync: { uidvalidity: 1, modseq: 1n } }),
	).rejects.toBeInstanceOf(NotImplementedError);
});

test("Phase 3 verbs (unauthenticate, compress) throw NotImplementedError", async () => {
	driver = new ComplianceDriver();
	await expect(driver.unauthenticate()).rejects.toBeInstanceOf(NotImplementedError);
	await expect(driver.compress()).rejects.toBeInstanceOf(NotImplementedError);
});

test("authenticate() with a mechanism the registry doesn't know throws NotImplementedError", async () => {
	server = await ScriptedServer.start();
	server.arm([
		[
			send("* OK ready\r\n"),
			expectLine(command("CAPABILITY", { args: null })),
			reply("OK done", ["* CAPABILITY IMAP4rev1 AUTH=GSSAPI"]),
		],
	]);
	driver = new ComplianceDriver();
	await driver.connect({ host: "127.0.0.1", port: server.port, security: "none" });
	// GSSAPI is not (and will never be) a registered mechanism — zero bytes
	// written, NotImplementedError rather than falling through to AuthError.
	await expect(driver.authenticate("GSSAPI")).rejects.toBeInstanceOf(NotImplementedError);
});

test("authenticate(mechanism) drives exactly that mechanism against the scripted server", async () => {
	server = await ScriptedServer.start();
	server.arm([
		[
			send("* OK ready\r\n"),
			expectLine(command("CAPABILITY", { args: null })),
			reply("OK done", ["* CAPABILITY IMAP4rev1 AUTH=PLAIN"]),
			expectLine(command("AUTHENTICATE", { args: /^PLAIN$/i })),
			send("+ \r\n"),
			expectLine({
				description: "base64 SASL response",
				match: (line: string) => ({ ok: /^[A-Za-z0-9+/=]+$/.test(line), reason: "" }),
			}),
			reply("OK AUTHENTICATE completed"),
		],
	]);
	driver = new ComplianceDriver();
	await driver.connect({ host: "127.0.0.1", port: server.port, security: "none" });
	await driver.authenticate("PLAIN");
	await server.assertCompleted();
});

// `uidExpunge()` (M3.9) and `uidMove()` (M3.8) are both implemented now --
// see the dedicated "expunge()/uidExpunge() ... require a selected mailbox"
// test below for their real (StateError, not NotImplementedError) behavior
// on a driver with no selected mailbox.
test("Phase 4 verbs throw NotImplementedError", async () => {
	driver = new ComplianceDriver();
	await expect(driver.replace("1", "Dest", Buffer.from("x"))).rejects.toBeInstanceOf(
		NotImplementedError,
	);
	await expect(driver.uidReplace("1", "Dest", Buffer.from("x"))).rejects.toBeInstanceOf(
		NotImplementedError,
	);
	await expect(driver.setacl("INBOX", "alice", "lrs")).rejects.toBeInstanceOf(
		NotImplementedError,
	);
	await expect(driver.deleteacl("INBOX", "alice")).rejects.toBeInstanceOf(NotImplementedError);
	await expect(driver.getacl("INBOX")).rejects.toBeInstanceOf(NotImplementedError);
	await expect(driver.listrights("INBOX", "alice")).rejects.toBeInstanceOf(NotImplementedError);
	await expect(driver.myrights("INBOX")).rejects.toBeInstanceOf(NotImplementedError);
	await expect(driver.getquota("")).rejects.toBeInstanceOf(NotImplementedError);
	await expect(driver.getquotaroot("INBOX")).rejects.toBeInstanceOf(NotImplementedError);
	await expect(driver.setquota("", [{ resource: "STORAGE", limit: 512 }])).rejects.toBeInstanceOf(
		NotImplementedError,
	);
	await expect(driver.getmetadata("INBOX", ["/private/comment"])).rejects.toBeInstanceOf(
		NotImplementedError,
	);
	await expect(
		driver.setmetadata("INBOX", [{ entry: "/private/comment", value: "hi" }]),
	).rejects.toBeInstanceOf(NotImplementedError);
	await expect(driver.multiAppend("INBOX", [{ message: Buffer.from("a") }])).rejects.toBeInstanceOf(
		NotImplementedError,
	);
});

// M3.9: expunge()/uidExpunge() are real now (delegating to
// MailboxSession.seq.expunge()/.expunge()), not NotImplementedError stubs.
// uidMove() (M3.8) is included here too: it was still (incorrectly) listed as
// NotImplementedError above even though it has been wired since M3.8. No
// connect()/login() here (deliberately -- this file's connect()+login()
// tests are flaky/environment-sensitive under this sandbox's networking,
// independent of this change): with no client at all, `requireClient()`
// throws its own plain `Error` before either method's `StateError` guard is
// ever reached, but that alone already proves neither is the old
// `NotImplementedError` stub -- the deep behavior (StateError message,
// UIDPLUS gate, `exists`/event bookkeeping, return-value ordering) is
// covered without network flakiness in test/unit/client/mailbox-verbs.test.ts
// and test/unit/commands/expunge.test.ts.
test("expunge()/uidExpunge()/uidMove() are wired (no longer NotImplementedError)", async () => {
	driver = new ComplianceDriver();
	await expect(driver.expunge()).rejects.not.toBeInstanceOf(NotImplementedError);
	await expect(driver.uidExpunge("1:*")).rejects.not.toBeInstanceOf(NotImplementedError);
	await expect(driver.uidMove("1", "Dest")).rejects.not.toBeInstanceOf(NotImplementedError);
});

test("Phase 4 widened signatures still throw NotImplementedError", async () => {
	driver = new ComplianceDriver();
	await expect(driver.list("", "*", { returnOptions: ["SPECIAL-USE"] })).rejects.toBeInstanceOf(
		NotImplementedError,
	);
	await expect(driver.create("Archive", { useAttributes: ["\\Archive"] })).rejects.toBeInstanceOf(
		NotImplementedError,
	);
	await expect(driver.append("INBOX", Buffer.from("x"), { binary: true })).rejects.toBeInstanceOf(
		NotImplementedError,
	);
});

test("Phase 5 verbs throw NotImplementedError", async () => {
	const driver = new ComplianceDriver();
	await expect(driver.sort(["DATE"], ["ALL"])).rejects.toBeInstanceOf(NotImplementedError);
	await expect(driver.uidSort(["DATE"], ["ALL"], "UTF-8")).rejects.toBeInstanceOf(NotImplementedError);
	await expect(driver.thread("REFERENCES", ["ALL"])).rejects.toBeInstanceOf(NotImplementedError);
	await expect(driver.uidThread("ORDEREDSUBJECT", ["ALL"], "US-ASCII")).rejects.toBeInstanceOf(NotImplementedError);
	await expect(driver.notify({ set: "NONE" })).rejects.toBeInstanceOf(NotImplementedError);
});

test("Phase 6 verbs throw NotImplementedError", async () => {
	const driver = new ComplianceDriver();
	await expect(driver.language(["en", "fr"])).rejects.toBeInstanceOf(NotImplementedError);
	await expect(driver.convert("1", "1", { "message/global": "message/rfc822" })).rejects.toBeInstanceOf(
		NotImplementedError,
	);
	await expect(
		driver.genurlauth([{ url: "imap://user@server/mbox/;uid=1", mechanism: "INTERNAL" }]),
	).rejects.toBeInstanceOf(NotImplementedError);
	await expect(driver.urlfetch(["imap://user@server/mbox/;uid=1"])).rejects.toBeInstanceOf(
		NotImplementedError,
	);
	await expect(driver.resetkey("INBOX", ["INTERNAL"])).rejects.toBeInstanceOf(NotImplementedError);
	await expect(driver.rlist("", "*")).rejects.toBeInstanceOf(NotImplementedError);
	await expect(driver.rlsub("", "*")).rejects.toBeInstanceOf(NotImplementedError);
});

test("Phase 5 widened signatures still throw NotImplementedError", async () => {
	const driver = new ComplianceDriver();
	await expect(driver.search(["ALL"], { return: ["MIN", "MAX"] })).rejects.toBeInstanceOf(NotImplementedError);
	await expect(driver.select("INBOX", { condstore: true })).rejects.toBeInstanceOf(NotImplementedError);
	await expect(
		driver.select("INBOX", { qresync: { uidvalidity: 67890007, modseq: 90060115194045000n } }),
	).rejects.toBeInstanceOf(NotImplementedError);
	await expect(driver.fetch("1:*", ["FLAGS"], { changedSince: 12345n })).rejects.toBeInstanceOf(NotImplementedError);
	await expect(driver.store("1", "+FLAGS", ["\\Seen"], { unchangedSince: 320162338n })).rejects.toBeInstanceOf(NotImplementedError);
});

test("driver.logs captures client logger output (BYE/failed-connect path)", async () => {
	// The client emits level:"error" / message:"Unable to connect to the server"
	// when Session.start() fails. A BYE greeting is the cheapest way to provoke
	// this: the server rejects the connection immediately, so connect() returns
	// false and the logger fires.
	server = await ScriptedServer.start();
	server.arm([
		[
			// BYE greeting — server not willing to accept; closes immediately.
			send("* BYE Go away\r\n"),
			close(),
		],
	]);
	driver = new ComplianceDriver();
	const connected = await driver.connect({
		host: "127.0.0.1",
		port: server.port,
		security: "none",
		timeoutMs: 3000,
	});
	// connect() returns false because the session rejected the BYE greeting
	expect(connected).toBe(false);
	// The logger must have captured at least one entry containing the expected message
	const match = driver.logs.some((entry) =>
		entry.message.includes("Unable to connect"),
	);
	expect(match, "driver.logs must contain an entry with 'Unable to connect'").toBe(true);
});
