import { Command } from "../commands/base";
import { ResponseCollector } from "../commands/collector";
import { CommandWriter, WireSegment } from "../commands/writer";
import { ConnectionError } from "../errors";
import { TaggedResponse } from "../parser";
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

	// LITERAL+/LITERAL- (RFC 7888) wire-form decision: consult whichever
	// capability probe the connection currently has wired -- an injected
	// Layer-2 probe (`ImapClient` wires its own live `CapabilityView` in its
	// constructor; see `Connection.setCapabilityProbe()`'s doc comment for
	// why that owner, not this connection's own precursor registry, is the
	// source of truth) or the conservative fallback when none was injected.
	const writer = new CommandWriter({
		has: connection.getCapabilityProbe(),
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

	// CRITICAL-2: races against `taggedPromise` (both here at the literal-gate
	// boundary in `performWrite` and at the top-level await below) so a
	// mid-command socket drop settles THIS invocation's promise — via
	// rejection — instead of leaving it suspended forever waiting on a
	// continuation/tagged response that will now never arrive. Without this,
	// the `finally` block below (which unregisters the tag/claimant/
	// continuation-owner) would never run for the command that was in flight
	// when the connection died; `Router.reset()` (called from
	// `Connection.onSocketClose`) covers that same registry cleanup
	// independently as defense in depth, but this is what lets the
	// suspended promise itself actually settle.
	let rejectTeardown!: (err: ConnectionError) => void;
	const teardownPromise = new Promise<never>((_resolve, reject) => {
		rejectTeardown = reject;
	});
	const unregisterTeardown = connection.onTeardown((err) => rejectTeardown(err));

	// M3.4: the collector is built LIVE, not as a post-hoc snapshot — it
	// exists (empty) before this command has received a single response, and
	// is fed via `push()` in the exact order the router attributes claims to
	// it (spec §8.3's arrival-order invariant). This is what lets a future
	// streaming command (FETCH, M3.5) observe a claimed response — including
	// one carrying a still-arriving literal stream (M3.2) — via
	// `collector.live()` while this command is still in flight, instead of
	// only after the tagged response below resolves. Every command through
	// M3.3 is unaffected: none of them call `live()`, and `untagged()`/
	// `first()`/`codes()`/`tagged()` (called from `accept()`, still only
	// invoked once below, after `settle()`) see the exact same complete,
	// arrival-ordered contents they always did.
	const collector = new ResponseCollector();
	const unregisterClaimant = router.registerClaimant({
		claims: (resp) => Command.claimsResponse(command, resp, { tag }),
		push: (resp) => {
			collector.push(resp);
		},
	});

	// Interactive commands (future AUTHENTICATE/IDLE — `onContinuation`
	// defined) own continuation handling for their ENTIRE execution, not
	// just around one literal boundary: registered up front, unregistered
	// only once the tagged response settles (the `finally` below), so a
	// multi-round-trip SASL exchange keeps its single continuation owner
	// for as long as it needs it.
	// CRITICAL-2 adjacent: set exactly once, in the `finally` below, once THIS
	// invocation's execution has concluded (normal completion OR teardown).
	// The interactive write-back closure below checks it before ever calling
	// `connection.writeBytes()` — see that closure's own comment for why a
	// generic "is the connection currently active" check is NOT the right
	// guard here.
	let settled = false;

	const interactive = Command.hasContinuationHook(command);
	let unregisterInteractive: (() => void) | undefined;
	if (interactive) {
		unregisterInteractive = router.registerContinuationOwner({
			onContinuation: (resp) => {
				// GAP FOUND (M1.7b — AUTHENTICATE is the first real exercise of
				// this path): `Command.handleContinuation()` (i.e. a subclass's
				// `onContinuation`) is contractually supposed to catch its own
				// failures and resolve to `"abort"` rather than reject (spec §9.1:
				// a SASL mechanism's `step()` throw maps to `"abort"`, never a
				// rejected hook) — but nothing enforced that, and the original
				// `.then()` here had no `.catch()`. A hook that broke that
				// contract (a genuine bug, or a future interactive command that
				// doesn't follow the same discipline) would produce an unhandled
				// promise rejection AND leave the command hung forever: no bytes
				// are ever written back to the server, so the tagged response that
				// would settle the command's promise never arrives either. Falling
				// back to `"abort"` here — same as an explicit `step()` throw —
				// keeps that failure mode a normal `*` cancellation (tagged NO/BAD
				// settles the promise) instead of a silent deadlock/process crash.
				void Command.handleContinuation(command, resp)
					.catch((): "abort" => "abort")
					.then((out) => {
						// CRITICAL-2 adjacent: this fire-and-forget chain can settle
						// AFTER this command's execution has already concluded — the
						// socket dropped between the continuation arriving and this
						// reply being computed (or is dropping right now). Checking
						// `connection.isActive` is NOT sufficient here: `Connection`
						// is a single long-lived instance reused across reconnects,
						// so by the time this callback runs, `isActive` may already
						// be `true` again because a LATER, wholly unrelated
						// connect()/command is now live on the very same instance —
						// writing this stale reply would inject bytes into THAT
						// exchange. `settled` is scoped to THIS invocation alone, so
						// it can't produce that false negative. Nothing is lost by
						// skipping the write: this command's own promise has already
						// settled (or is settling) via the teardown race/tagged
						// response.
						if (settled) {
							return;
						}
						const bytes = out === "abort" ? Buffer.from("*", "ascii") : out;
						connection.writeBytes(Buffer.concat([bytes, CRLF_BUF]));
					});
			},
		});
	}

	try {
		await performWrite(
			connection,
			command,
			tag,
			segments,
			taggedPromise,
			interactive,
			teardownPromise,
		);
		// Raced against teardown (CRITICAL-2): if the connection tears down
		// while a synchronizing-literal gate is clear but the tagged response
		// hasn't arrived yet (e.g. mid-AUTHENTICATE, after a continuation but
		// before any tagged reply), `taggedPromise` alone would never settle.
		const tagged = await Promise.race([taggedPromise, teardownPromise]);
		// Settle the SAME live collector instance regardless of outcome (OK,
		// NO, or BAD): a `live()` consumer must be able to observe completion
		// no matter how the command finished, not only on success. Discarded
		// immediately in the error branch below -- no existing command's
		// `accept()` runs on a NO/BAD tagged response (unchanged from
		// pre-M3.4: `Command.mapError` was, and still is, the only thing that
		// sees a non-OK tagged response here).
		collector.settle(tagged);
		if (tagged.status.status === "OK") {
			// `accept()` may itself be async (spec §7.1's widened contract, M1.7b
			// — e.g. `AuthenticateCommand` awaiting a SASL mechanism's `finish()`,
			// which can reject the command's promise even though the server
			// already said OK); `await`ing a synchronous return is a no-op, so
			// every pre-existing synchronous `accept()` is unaffected.
			return await Command.acceptResult(command, collector);
		}
		throw Command.mapError(command, tagged);
	} finally {
		settled = true;
		unregisterTeardown();
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
 *
 * `teardown` (CRITICAL-2) is raced alongside `gate`/`taggedPromise`: a
 * mid-gate socket drop (the server disappears after announcing a
 * synchronizing literal but before ever sending `+` or a tagged abort)
 * would otherwise leave this `await` — and the whole `executeCommand()`
 * invocation waiting on it — suspended forever.
 */
async function performWrite<T>(
	connection: Connection,
	command: Command<T>,
	tag: string,
	segments: readonly WireSegment[],
	taggedPromise: Promise<TaggedResponse>,
	interactive: boolean,
	teardown: Promise<never>,
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
			let outcome: "continue" | "aborted";
			try {
				// `finally` below must run even when `teardown` wins this race
				// (it rejects, so the `await` throws) — otherwise a mid-gate
				// socket drop would leave THIS gate's continuation-owner
				// registration behind. `Connection.onSocketClose`'s
				// `router.reset()` covers the same cleanup independently
				// (defense in depth), but `performWrite` shouldn't rely on its
				// caller to unstick its own local registration.
				outcome = await Promise.race([
					gate,
					taggedPromise.then((): "aborted" => "aborted"),
					teardown,
				]);
			} finally {
				unregisterGate();
			}
			if (outcome === "aborted") {
				// The tagged response (a NO/BAD abort, spec §6.2) already
				// arrived — nothing further to write for this command.
				return;
			}
		}
	}
	connection.writeBytes(CRLF_BUF);
}
