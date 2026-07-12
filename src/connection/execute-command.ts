import { Command } from "../commands/base";
import { ResponseCollector } from "../commands/collector";
import { CommandWriter, WireSegment } from "../commands/writer";
import { TaggedResponse, UntaggedResponse } from "../parser";
import { CRLF } from "./constants";
import type Connection from "./connection";

const CRLF_BUF = Buffer.from(CRLF, "ascii");

/**
 * Performs the actual wire I/O for one command execution (spec §7.1/§6.2):
 * tag assignment, argument serialization via `CommandWriter`, the literal
 * gate, router attribution (tag map + claimant registration), and result
 * construction once the tagged response arrives. This — together with
 * `CommandWriter` itself — is the ONLY code that ever writes command bytes
 * to the socket (spec I-4); `connection/queue.ts` calls this once per
 * dispatched command and otherwise only concerns itself with scheduling
 * (pipeline/serial/isolated grouping, hold/release, §6.1).
 */
export async function executeCommand<T>(
	connection: Connection,
	command: Command<T>,
	tag: string,
): Promise<T> {
	Command.assignTag(command, tag);

	const writer = new CommandWriter({
		has: (cap) => connection.capabilityRegistry.value?.has(cap) ?? false,
	});
	// A validation throw here happens before any byte is written — writer
	// methods are atomic-per-call (spec §7.2) — so it's safe to propagate
	// straight out of this function; zero bytes reach the socket.
	Command.writeArgs(command, writer);
	const segments = writer.segments();

	const router = connection.router;

	let resolveTagged!: (resp: TaggedResponse) => void;
	const taggedPromise = new Promise<TaggedResponse>((resolve) => {
		resolveTagged = resolve;
	});
	const unregisterTag = router.registerTag(tag, {
		resolveTagged: (resp) => resolveTagged(resp),
	});

	const claimed: UntaggedResponse[] = [];
	const unregisterClaimant = router.registerClaimant({
		claims: (resp) => Command.claimsResponse(command, resp, { tag }),
		push: (resp) => {
			claimed.push(resp);
		},
	});

	// Interactive commands (future AUTHENTICATE/IDLE — `onContinuation`
	// defined) own continuation handling for their ENTIRE execution, not
	// just around one literal boundary: registered up front, unregistered
	// only once the tagged response settles (the `finally` below), so a
	// multi-round-trip SASL exchange keeps its single continuation owner
	// for as long as it needs it.
	const interactive = Command.hasContinuationHook(command);
	let unregisterInteractive: (() => void) | undefined;
	if (interactive) {
		unregisterInteractive = router.registerContinuationOwner({
			onContinuation: (resp) => {
				void Command.handleContinuation(command, resp).then((out) => {
					const bytes = out === "abort" ? Buffer.from("*", "ascii") : out;
					connection.writeBytes(Buffer.concat([bytes, CRLF_BUF]));
				});
			},
		});
	}

	try {
		await performWrite(connection, command, tag, segments, taggedPromise, interactive);
		const tagged = await taggedPromise;
		if (tagged.status.status === "OK") {
			return Command.acceptResult(command, new ResponseCollector(claimed, tagged));
		}
		throw Command.mapError(command, tagged);
	} finally {
		unregisterInteractive?.();
		unregisterTag();
		unregisterClaimant();
	}
}

/**
 * Writes every wire segment `CommandWriter` produced. At each
 * synchronizing-literal boundary (`awaitContinuation: true`) this
 * implements the queue-automatic literal gate (spec §6.2): register as the
 * sole continuation owner for just that boundary, withhold any further
 * bytes for THIS command until either `+` arrives (continue writing the
 * next segment) or this command's own tagged response arrives first — a
 * NO/BAD abort (stop writing immediately and return; the caller observes
 * the already-resolved `taggedPromise`). Skipped for `interactive` commands
 * — they registered their OWN persistent continuation owner already (see
 * `executeCommand`), and no command shipping in this milestone combines a
 * literal argument with an interactive (`onContinuation`) hook.
 */
async function performWrite<T>(
	connection: Connection,
	command: Command<T>,
	tag: string,
	segments: readonly WireSegment[],
	taggedPromise: Promise<TaggedResponse>,
	interactive: boolean,
): Promise<void> {
	const router = connection.router;

	for (let i = 0; i < segments.length; i++) {
		const seg = segments[i];
		const bytes =
			i === 0
				? Buffer.concat([
						Buffer.from(`${tag} ${command.verb}${seg.bytes.length ? " " : ""}`, "ascii"),
						seg.bytes,
					])
				: seg.bytes;
		connection.writeBytes(bytes);

		if (seg.awaitContinuation && !interactive) {
			let resolveGate!: (outcome: "continue" | "aborted") => void;
			const gate = new Promise<"continue" | "aborted">((resolve) => {
				resolveGate = resolve;
			});
			const unregisterGate = router.registerContinuationOwner({
				onContinuation: () => resolveGate("continue"),
			});
			const outcome = await Promise.race([
				gate,
				taggedPromise.then((): "aborted" => "aborted"),
			]);
			unregisterGate();
			if (outcome === "aborted") {
				// The tagged response (a NO/BAD abort, spec §6.2) already
				// arrived — nothing further to write for this command.
				return;
			}
		}
	}
	connection.writeBytes(CRLF_BUF);
}
