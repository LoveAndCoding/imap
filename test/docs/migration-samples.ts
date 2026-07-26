// Compile-only companion to docs/MIGRATION.md (task M6.5).
//
// Every fenced ```typescript code block in that doc labeled as "new"
// (ImapClient 1.0) is embedded verbatim below, each wrapped in its own
// exported async function, so that `npm run typecheck` (see
// test/docs/tsconfig.json, wired into the root "typecheck" script) proves
// every destination-side sample in the migration guide actually compiles
// against the real 1.0 surface -- a migration doc with non-compiling
// destination code is worse than none.
//
// Nothing here is executed. These functions are never called; they exist
// solely to be type-checked. Old-side (node-imap / pre-M1 `Connection`)
// samples in the migration guide are illustrative only and are NOT
// reproduced here -- node-imap is not a dependency of this project, and
// the pre-M1 Session/Connection callback surface the guide cites no longer
// exists to compile against.
//
// Imports come from the package root ("../../src/index"), the same
// surface `import { ImapClient } from "@lovely-inbox/imap"` resolves to --
// this is deliberately NOT a deep import into src/client/* etc., so a
// symbol quietly falling out of the public export surface would break this
// file too.

import * as fs from "node:fs";

import {
	CapabilityError,
	ImapClient,
	MailboxSession,
	StateError,
} from "../../src/index";

// --- Connecting & authenticating -------------------------------------------

export async function connectingAndAuthenticating(): Promise<void> {
	const client = new ImapClient({
		host: "imap.gmail.com",
		tls: "on", // implicit TLS, port 993 (the default)
		auth: {
			user: "mygmailname@gmail.com",
			pass: "mygmailpassword",
		},
	});

	await client.connect(); // connects, negotiates TLS, authenticates, ENABLEs

	console.log(client.state); // "selected" only after select()/examine()
	await client.logout();
}

// --- Selecting & closing mailboxes -----------------------------------------

export async function selectingAndClosingMailboxes(): Promise<void> {
	const client = new ImapClient({
		host: "imap.example.com",
		auth: { user: "me", pass: "hunter2" },
	});
	await client.connect();

	const mailbox = await client.select("INBOX"); // read-write
	const readOnlyMailbox = await client.examine("INBOX"); // read-only

	await mailbox.close(); // CLOSE: expunges \Deleted, then deselects
	await readOnlyMailbox.unselect(); // UNSELECT: deselects, no expunge
}

// --- Managing mailboxes & the flat list() data model -----------------------

export async function managingMailboxes(client: ImapClient): Promise<void> {
	await client.create("Archive");
	await client.subscribe("Archive");
	await client.rename("Archive", "Archive 2024");
	await client.unsubscribe("Archive 2024");
	await client.delete("Archive 2024");
}

export async function listingMailboxesFlat(client: ImapClient): Promise<void> {
	// getBoxes()'s nested tree becomes a flat array -- the one mapping in
	// this guide where the DATA MODEL changed, not just the calling
	// convention (see docs/MIGRATION.md's "Listing mailboxes" section).
	const mailboxes = await client.list();
	for (const box of mailboxes) {
		console.log(box.name, box.delimiter, [...box.attributes]);
	}
}

export async function checkingStatus(client: ImapClient): Promise<void> {
	const info = await client.status("Archive", [
		"MESSAGES",
		"UNSEEN",
		"UIDNEXT",
	]);
	console.log(info.messages, info.unseen, info.uidNext);
}

// --- Searching ---------------------------------------------------------------

export async function searchingMessages(
	mailbox: MailboxSession,
): Promise<void> {
	// node-imap's nested-array DSL (`['UNSEEN', ['SINCE', 'May 20, 2010']]`)
	// becomes a typed SearchCriteria object; every key is implicitly ANDed,
	// `or` nests sub-criteria for compound queries.
	const result = await mailbox.search({
		or: [{ seen: false, from: "boss@example.com" }, { flagged: true }],
		since: new Date("2010-05-20"),
	});
	console.log(result.uids);
}

// --- Fetching & streaming bodies ---------------------------------------------

export async function fetchingWithEnvelopeAndFlags(
	mailbox: MailboxSession,
): Promise<void> {
	for await (const message of mailbox.fetch("1:3", {
		envelope: true,
		flags: true,
	})) {
		console.log(message.seq, message.envelope?.subject, [
			...(message.flags ?? []),
		]);
	}
}

export async function streamingAttachmentToDisk(
	mailbox: MailboxSession,
): Promise<void> {
	for await (const message of mailbox.fetch("1:*", {
		bodyParts: [{ section: "", stream: true }],
	})) {
		const part = message.part("");
		part?.stream().pipe(fs.createWriteStream(`msg-${message.seq}.eml`));
	}
}

// --- Flags -------------------------------------------------------------------

export async function updatingFlags(mailbox: MailboxSession): Promise<void> {
	await mailbox.addFlags([101, 102], ["\\Seen"]);
	await mailbox.removeFlags("101:110", ["\\Flagged"]);
	await mailbox.setFlags(101, ["\\Seen", "\\Answered"]);
}

// --- Copying, moving, expunging -----------------------------------------------

export async function copyingMovingExpunging(
	mailbox: MailboxSession,
): Promise<void> {
	const copyResult = await mailbox.copy("1:5", "Archive");
	const moveResult = await mailbox.move([10, 11, 12], "Trash");
	console.log(copyResult.destUids, moveResult.destUids);

	const removedSeqs = await mailbox.expunge();
	console.log(removedSeqs);
}

// --- The `seq` facet -----------------------------------------------------------

export async function usingTheSeqFacet(mailbox: MailboxSession): Promise<void> {
	// UID grain (recommended for anything that outlives a single response):
	await mailbox.fetchOne(4001, { envelope: true });

	// Sequence-number grain -- the direct, happily-parallel counterpart of
	// node-imap's `imap.seq.*` namespace:
	await mailbox.seq.fetchOne(1, { envelope: true });
}

// --- Appending -----------------------------------------------------------------

export async function appendingMessages(
	client: ImapClient,
	rfc822BufferA: Buffer,
	rfc822BufferB: Buffer,
): Promise<void> {
	// Single message:
	const result = await client.append("INBOX", rfc822BufferA, {
		flags: ["\\Seen"],
		internalDate: new Date(),
	});
	console.log(result.uid);

	// Several messages in one round trip (MULTIAPPEND, RFC 3502):
	const results = await client.appendMany("INBOX", [
		{ message: rfc822BufferA, flags: ["\\Seen"] },
		{ message: rfc822BufferB, flags: ["\\Flagged"] },
	]);
	console.log(results.map((r) => r.uid));
}

// --- Events & live updates -----------------------------------------------------

export function handlingClientEvents(client: ImapClient): void {
	client.on("stateChange", (state, prev) => {
		console.log(`state: ${prev} -> ${state}`);
	});
	client.on("error", (err) => {
		console.log(err.message);
	});
	client.on("close", (info) => {
		console.log(`closed (graceful=${info.graceful})`);
	});
}

export function handlingMailboxEvents(mailbox: MailboxSession): void {
	mailbox.on("exists", (count, prev) => {
		/* new mail arrived, or EXPUNGE changed the count */
		console.log(prev, "->", count);
	});
	mailbox.on("expunge", (seq) => {
		/* a message at this sequence number was removed */
		console.log("expunged", seq);
	});
	mailbox.on("flags", (update) => {
		console.log(update.seq, update.uid, [...update.flags]);
	});
	mailbox.on("closed", (reason) => {
		console.log("closed:", reason);
	});
}

export async function subscribingToLiveUpdates(
	mailbox: MailboxSession,
): Promise<void> {
	for await (const update of mailbox.updates({ idle: true })) {
		if (update.type === "exists") {
			console.log("new message count:", update.count);
		}
	}
}

// --- Typed errors ----------------------------------------------------------------

export async function handlingTypedErrors(
	client: ImapClient,
	mailbox: MailboxSession,
): Promise<void> {
	try {
		await mailbox.thread("REFERENCES", { all: true });
	} catch (err) {
		if (err instanceof CapabilityError) {
			console.log(`server lacks ${err.capability} (${err.rfc})`);
		} else {
			throw err;
		}
	}

	try {
		await client.status("INBOX", ["MESSAGES"]);
	} catch (err) {
		if (err instanceof StateError) {
			console.log(
				`illegal from state ${err.state}, needed one of`,
				err.required,
			);
		} else {
			throw err;
		}
	}
}

// --- Worked examples ---------------------------------------------------------

// Mirrors the old Legacy API's first README example: fetch headers +
// structure for the first few messages in the Inbox.
export async function connectSelectFetchPipeline(): Promise<void> {
	const client = new ImapClient({
		host: "imap.gmail.com",
		tls: "on",
		auth: {
			user: "mygmailname@gmail.com",
			pass: "mygmailpassword",
		},
	});

	await client.connect();
	const mailbox = await client.select("INBOX");

	for await (const message of mailbox.fetch("1:3", {
		envelope: true,
		bodyStructure: true,
		bodyParts: [
			{
				section: "HEADER.FIELDS",
				fields: ["FROM", "TO", "SUBJECT", "DATE"],
			},
		],
	})) {
		console.log("Message #%d", message.seq);
		const header = await message.part("HEADER.FIELDS")?.buffer();
		console.log("Parsed header bytes: %d", header?.length ?? 0);
	}

	await client.logout();
}

// Mirrors the old Legacy API's third README example: save raw unread
// message bodies since a given date to files.
export async function searchAndSaveUnreadSince(
	mailbox: MailboxSession,
): Promise<void> {
	const result = await mailbox.search({
		seen: false,
		since: new Date("2010-05-20"),
	});

	for await (const message of mailbox.fetch(result.uids ?? [], {
		bodyParts: [{ section: "", stream: true }],
	})) {
		const part = message.part("");
		part?.stream().pipe(
			fs.createWriteStream(`msg-${message.uid}-body.txt`),
		);
	}
}
