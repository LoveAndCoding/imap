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

test("connect() drives Session.start against the scripted server", async () => {
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

test("unimplemented verbs throw NotImplementedError", async () => {
	driver = new ComplianceDriver();
	await expect(driver.noop()).rejects.toBeInstanceOf(NotImplementedError);
	await expect(driver.login("u", "p")).rejects.toBeInstanceOf(NotImplementedError);
	await expect(driver.select("INBOX")).rejects.toBeInstanceOf(NotImplementedError);
});

test("Phase 3 verbs (unauthenticate, compress) throw NotImplementedError", async () => {
	driver = new ComplianceDriver();
	await expect(driver.unauthenticate()).rejects.toBeInstanceOf(NotImplementedError);
	await expect(driver.compress()).rejects.toBeInstanceOf(NotImplementedError);
});

test("widened authenticate(mechanism, initialResponse?) still throws NotImplementedError", async () => {
	driver = new ComplianceDriver();
	await expect(driver.authenticate("PLAIN")).rejects.toBeInstanceOf(NotImplementedError);
	await expect(driver.authenticate("PLAIN", "AGZvbwBiYXI=")).rejects.toBeInstanceOf(
		NotImplementedError,
	);
});

test("Phase 4 verbs throw NotImplementedError", async () => {
	driver = new ComplianceDriver();
	await expect(driver.uidExpunge("1:*")).rejects.toBeInstanceOf(NotImplementedError);
	await expect(driver.uidMove("1", "Dest")).rejects.toBeInstanceOf(NotImplementedError);
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
