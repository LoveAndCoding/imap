// Compile-only companion to README.md (task M6.6).
//
// Every fenced ```typescript code block in the README is embedded verbatim
// below, each wrapped in its own exported function (parameters added only
// where a snippet references something from outside its own fence -- e.g.
// a `mailbox`/`client` already constructed by an earlier section), so that
// `npm run typecheck` (see test/docs/tsconfig.json, wired into the root
// "typecheck" script) proves every sample in the README actually compiles
// against the real 1.0 surface -- a README with non-compiling sample code
// is worse than no sample code at all. Mirrors the exact discipline
// test/docs/migration-samples.ts established for docs/MIGRATION.md.
//
// Nothing here is executed. These functions are never called; they exist
// solely to be type-checked.
//
// Imports come from the package root ("../../src/index"), the same surface
// `import { ImapClient } from "@lovely-inbox/imap"` resolves to -- this is
// deliberately NOT a deep import into src/client/* etc., so a symbol
// quietly falling out of the public export surface would break this file
// too.

import * as fs from "node:fs";

import { ImapClient, MailboxSession } from "../../src/index";

// --- Quickstart --------------------------------------------------------

export async function quickstart(): Promise<void> {
	const client = new ImapClient({
		host: "imap.gmail.com",
		tls: "on", // implicit TLS, port 993 (the default)
		auth: {
			user: "mygmailname@gmail.com",
			pass: "mygmailpassword",
		},
	});

	await client.connect(); // connects, negotiates TLS, authenticates, ENABLEs
	const mailbox = await client.select("INBOX");

	// fetch() addresses messages by UID (wire: UID FETCH); use
	// mailbox.seq.fetch() to address by message sequence number instead.
	for await (const message of mailbox.fetch("1:10", {
		envelope: true,
		flags: true,
	})) {
		console.log(message.seq, message.envelope?.subject, [...(message.flags ?? [])]);
	}

	await client.logout();
}

// --- Searching -----------------------------------------------------------

export async function searchingCompound(mailbox: MailboxSession): Promise<void> {
	// Unread messages from a given sender, OR anything flagged, in the last week:
	const result = await mailbox.search({
		or: [
			{ seen: false, from: "boss@example.com" },
			{ flagged: true },
		],
		since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
	});
	console.log(result.uids); // number[] (or a compact ESEARCH range form, see SearchResult)
}

export async function searchingSimple(mailbox: MailboxSession): Promise<void> {
	const uids = (await mailbox.search({ subject: "invoice", seen: false })).uids;
	console.log(uids);
}

// --- Fetching messages -----------------------------------------------------

export async function fetchingMessages(mailbox: MailboxSession): Promise<void> {
	for await (const msg of mailbox.fetch("1:*", {
		envelope: true,
		flags: true,
		bodyStructure: true,
	})) {
		console.log(msg.uid, msg.envelope?.subject);
	}
}

export async function fetchingSpecificParts(mailbox: MailboxSession): Promise<void> {
	const msg = await mailbox.fetchOne(42, {
		bodyParts: [{ section: "HEADER.FIELDS", fields: ["FROM", "TO", "SUBJECT"] }],
	});
	const headerBytes = await msg?.part("HEADER.FIELDS")?.buffer();
	console.log(headerBytes?.length);
}

// --- Streaming large bodies --------------------------------------------------

export async function streamingLargeBodies(mailbox: MailboxSession, uid: number): Promise<void> {
	for await (const msg of mailbox.fetch(uid, {
		bodyParts: [{ section: "", stream: true }],
	})) {
		const part = msg.part("");
		part?.stream().pipe(fs.createWriteStream(`msg-${msg.uid}.eml`));
	}
}

// --- Flags -------------------------------------------------------------

export async function updatingFlags(mailbox: MailboxSession): Promise<void> {
	await mailbox.addFlags([101, 102], ["\\Seen"]);
	await mailbox.removeFlags("101:110", ["\\Flagged"]);
	await mailbox.setFlags(101, ["\\Seen", "\\Answered"]);
}

// --- Copying and moving --------------------------------------------------

export async function copyingAndMoving(mailbox: MailboxSession): Promise<void> {
	const copyResult = await mailbox.copy("1:5", "Archive");
	const moveResult = await mailbox.move([10, 11, 12], "Trash");

	console.log(moveResult.uidValidity, moveResult.sourceUids, moveResult.destUids);
}

// --- Appending -----------------------------------------------------------

export async function appendingMessages(
	client: ImapClient,
	rfc822Buffer: Buffer,
	rfc822BufferA: Buffer,
	rfc822BufferB: Buffer,
): Promise<void> {
	// Single message:
	const result = await client.append("INBOX", rfc822Buffer, {
		flags: ["\\Seen"],
		internalDate: new Date(),
	});

	// Several messages in one round trip (MULTIAPPEND, RFC 3502):
	const results = await client.appendMany("INBOX", [
		{ message: rfc822BufferA, flags: ["\\Seen"] },
		{ message: rfc822BufferB, flags: ["\\Flagged"] },
	]);
	console.log(result.uid, results.length);
}

// --- The `seq` facet -------------------------------------------------------

export async function theSeqFacet(mailbox: MailboxSession): Promise<void> {
	// UID grain (recommended -- see below):
	await mailbox.fetchOne(4001, { envelope: true });

	// Sequence-number grain:
	await mailbox.seq.fetchOne(1, { envelope: true });
}

// --- Events --------------------------------------------------------------

export function handlingEvents(mailbox: MailboxSession): void {
	mailbox.on("exists", (count, prev) => {
		/* new mail arrived, or EXPUNGE changed the count */
		console.log(prev, count);
	});
	mailbox.on("expunge", (seq) => {
		/* a message at this sequence number was removed -- renumber any cached seqs above it */
		console.log(seq);
	});
	mailbox.on("flags", (update) => {
		/* update.seq, update.uid?, update.flags, update.modSeq? */
		console.log(update);
	});
	mailbox.on("uidValidityChanged", (next, prev) => {
		/* cached UIDs from before this point are no longer valid */
		console.log(next, prev);
	});
	mailbox.on("closed", (reason) => {
		/* "closed" | "unselected" | "reselected" | "disconnected" */
		console.log(reason);
	});
}

// --- Live updates and IDLE -------------------------------------------------

export async function liveUpdates(mailbox: MailboxSession): Promise<void> {
	for await (const update of mailbox.updates({ idle: true })) {
		if (update.type === "exists") {
			console.log("new message count:", update.count);
		} else if (update.type === "expunge") {
			console.log("expunged seq:", update.seq);
		}
	}
}

export async function explicitIdleHandle(mailbox: MailboxSession): Promise<void> {
	const handle = await mailbox.idle();
	// ... some time later ...
	await handle.done();
}

// --- Extensions and facets: QUOTA/ACL/METADATA/URLAUTH ----------------------

export async function extensionsAndFacets(client: ImapClient): Promise<void> {
	// QUOTA (RFC 9208):
	const usage = await client.quota.get("");
	const roots = await client.quota.roots("INBOX");
	await client.quota.set("", [{ resource: "STORAGE", limit: 102400 }]);

	// ACL (RFC 4314):
	const acl = await client.acl.get("INBOX");
	await client.acl.set("INBOX", "alice", "+lrs");
	const myRights = await client.acl.myRights("INBOX");

	// METADATA (RFC 5464) -- also backs FILTERS (RFC 5466) search-key values:
	const entries = await client.metadata.get("INBOX", ["/private/comment"]);
	await client.metadata.set("INBOX", [{ entry: "/private/comment", value: "reviewed" }]);

	// URLAUTH (RFC 4467 + RFC 5524's BINARY extension):
	const [url] = await client.urlauth.generate([{ url: "/INBOX;UID=42/;URLAUTH=submit+alice" }]);
	const [fetched] = await client.urlauth.fetch([url]);

	console.log(usage, roots, acl, myRights, entries, fetched);
}

// --- Compression -----------------------------------------------------------

export async function compressionOnDemand(): Promise<void> {
	const client = new ImapClient({ host: "imap.example.com", compress: false, /* ... */ });
	await client.connect();
	if (client.supports("COMPRESS=DEFLATE")) {
		await client.compress();
	}
}

// --- UNAUTHENTICATE ----------------------------------------------------------

export async function unauthenticateAndReauthenticate(client: ImapClient): Promise<void> {
	await client.unauthenticate(); // requires the UNAUTHENTICATE capability
	await client.authenticate({ user: "someone-else", pass: "hunter3" });
}

// --- UIDONLY -----------------------------------------------------------------

export function checkingUidonly(client: ImapClient): void {
	if (client.enabled.has("UIDONLY")) {
		// mailbox.seq.* now refuses -- use the UID-grain methods exclusively.
	}
}

// --- TLS and authentication configuration -----------------------------------

export function tlsAndAuthConfiguration(): void {
	const client = new ImapClient({
		host: "imap.example.com",
		tls: "on", // "on" (implicit TLS, default) | "starttls" (required) |
		           // "opportunistic" (upgrade if offered, else plaintext) | "off"
		tlsOptions: { minVersion: "TLSv1.2" }, // passed to node:tls -- merged, never
		                                       // used to weaken identity checks
		auth: {
			user: "me@example.com",
			pass: "hunter2",
			// or: accessToken: "<bearer token>" for OAUTHBEARER/XOAUTH2
			// mechanisms: ["CRAM-MD5", "PLAIN"] to override the default preference order
		},
		allowInsecureAuth: false, // refuse to send credentials over cleartext (RFC 8314 §5)
		timeouts: { connect: 10_000, greeting: 10_000 },
		maxInlineSize: 1024 * 1024, // fetch part buffering cutoff, see "Streaming large bodies"
	});
	console.log(client);
}
