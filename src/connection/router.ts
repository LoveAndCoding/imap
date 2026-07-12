import {
	AtomTextCode,
	ContinueResponse,
	StatusResponse,
	TaggedResponse,
	UnknownResponse,
	UntaggedResponse,
} from "../parser";
import type { IMAPLogMessage } from "../types";

/**
 * Response router (spec §8). Sits between the `Parser`'s events and every
 * consumer. This milestone re-homes the M0.3 state-tracker logic (ALERT
 * trusted/untrusted logging + the pre-suppression greeting fanout) here
 * pretty much verbatim, and ADDS the attribution machinery (§7.1/§7.3) the
 * queue needs to build each in-flight command's `ResponseCollector` — the
 * tag map, the single continuation-owner registry, and the ordered
 * claimant list.
 *
 * Scope decision (documented): `Connection`'s public event surface
 * (`response`/`untaggedResponse`/`taggedResponse`/`continueResponse`/
 * `unknownResponse`/`serverStatus`) MUST keep firing exactly as it does
 * today (M0), because dozens of unit/compliance tests pin it. Rather than
 * making that emission CONDITIONAL on whether some in-flight command's
 * `claims()` accepted the response — which would be a real behavior change
 * (a claimed CAPABILITY response would silently stop being observable via
 * `untaggedResponse` during, say, the STARTTLS upgrade's internal
 * CAPABILITY probe) — this router treats claim attribution as STRICTLY
 * ADDITIVE bookkeeping alongside the unconditional emission path. The only
 * genuinely new event is `unhandled` (§8 step 3c), which nothing today
 * emits, so adding it is safe by construction. A stricter "claimed responses
 * are consumed, not also re-emitted publicly" design is left to the
 * `ImapClient` milestone, where the full state-tracker lane (CAPABILITY
 * registry auto-update from arbitrary untagged CAPABILITY, BYE close
 * choreography, etc. — spec §8.3) actually lands; this milestone's
 * `handleStatusResponse` is a faithful re-homing of what M0 already does,
 * nothing more (see the identical reasoning already recorded in
 * `Connection`'s pre-M1 comments).
 */

export type StandardResponse =
	| ContinueResponse
	| TaggedResponse
	| UnknownResponse
	| UntaggedResponse
	| null;

/** Everything the router needs from its owner to reproduce M0's exact
 *  observable behavior while also driving the new attribution machinery. */
export interface RouterHost {
	log(info: IMAPLogMessage): void;
	/** Whether the transport is currently confidential (TLS active). */
	isSecure(): boolean;
	/** Internal, pre-suppression fanout of EVERY status response (including
	 *  the greeting) — CRITICAL-3's `rawStatusEvents`, re-homed. */
	emitRawStatus(resp: UntaggedResponse): void;
	emitUntagged(resp: UntaggedResponse): void;
	emitTagged(resp: TaggedResponse): void;
	emitContinue(resp: ContinueResponse): void;
	emitUnknown(resp: UnknownResponse | null): void;
	emitResponse(resp: StandardResponse): void;
	emitServerStatus(resp: UntaggedResponse): void;
	emitUnhandled(resp: ContinueResponse | TaggedResponse | UnknownResponse | UntaggedResponse): void;
	/**
	 * ADDITIVE (spec I-7/§10.6, `ImapClient`'s `alert` event): fired for
	 * EVERY ALERT resp-code, regardless of confidentiality — unlike
	 * `emitServerStatus`, which never surfaces an ALERT-carrying response
	 * pre-confidentiality at all (see `handleStatusResponse` below). Nothing
	 * in M0 emitted this; adding it changes no existing observable behavior.
	 */
	emitAlert(text: string, meta: { trusted: boolean }): void;
}

/** An in-flight command's claim function + the sink its claimed responses
 *  are pushed into. Registered/unregistered by the queue for the lifetime
 *  of one command execution (spec §7.1/§8). */
export interface Claimant {
	claims(resp: UntaggedResponse): boolean;
	push(resp: UntaggedResponse): void;
}

/** An in-flight command's tagged-response resolution callback. */
export interface TaggedOwner {
	resolveTagged(resp: TaggedResponse): void;
}

/** The single continuation owner (spec §6.2: "only one continuation owner
 *  may exist at a time" — an invariant, asserted at registration). */
export interface ContinuationOwner {
	onContinuation(resp: ContinueResponse): void;
}

export class Router {
	private readonly host: RouterHost;
	private readonly tagMap = new Map<string, TaggedOwner>();
	private readonly claimants: Claimant[] = [];
	private continuationOwner: ContinuationOwner | null = null;

	constructor(host: RouterHost) {
		this.host = host;
	}

	// -- registration (used by connection/queue.ts) -------------------------

	/** Registers `owner` as the resolver for `tag`'s eventual tagged
	 *  response. Throws synchronously if `tag` is already registered (a
	 *  reused/duplicate tag is a bug in the caller, never a soft failure). */
	registerTag(tag: string, owner: TaggedOwner): () => void {
		if (this.tagMap.has(tag)) {
			throw new Error(
				`Router: tag "${tag}" is already registered to an in-flight command`,
			);
		}
		this.tagMap.set(tag, owner);
		return () => {
			if (this.tagMap.get(tag) === owner) {
				this.tagMap.delete(tag);
			}
		};
	}

	/** Registers a claimant, offered (in registration/write order) to every
	 *  untagged response until one claims it (spec §8 step 3a). */
	registerClaimant(claimant: Claimant): () => void {
		this.claimants.push(claimant);
		return () => {
			const i = this.claimants.indexOf(claimant);
			if (i >= 0) {
				this.claimants.splice(i, 1);
			}
		};
	}

	/** Registers the single continuation owner (spec §6.2). Throws
	 *  synchronously if one is already registered — violating the
	 *  single-owner invariant is a bug in the caller, asserted immediately
	 *  rather than surfacing later as misattributed data. */
	registerContinuationOwner(owner: ContinuationOwner): () => void {
		if (this.continuationOwner) {
			throw new Error(
				"Router: a continuation owner is already registered — only one " +
					"continuation owner may exist at a time (spec §6.2)",
			);
		}
		this.continuationOwner = owner;
		return () => {
			if (this.continuationOwner === owner) {
				this.continuationOwner = null;
			}
		};
	}

	// -- routing (fed by connection.ts's parser fan-out) ---------------------

	routeUntagged(resp: UntaggedResponse): void {
		const isStatus = resp.content instanceof StatusResponse;
		if (isStatus) {
			// CRITICAL-3: fire the pre-suppression fanout for EVERY status
			// response — including the greeting — before the ALERT
			// consumer-facing gate below runs.
			this.host.emitRawStatus(resp);
			this.handleStatusResponse(resp);
		} else {
			this.host.emitUntagged(resp);
			this.host.emitResponse(resp);
		}

		// §8 step 3a: offered to every in-flight command's claims(), in
		// registration (write) order; first claim wins. Additive — never
		// suppresses the emission above (see the class doc comment).
		const claimant = this.claimants.find((c) => {
			try {
				return c.claims(resp);
			} catch {
				// A misbehaving claims() override must not take down routing
				// for every other in-flight command (same tolerance posture
				// as the parser's own matcher fallbacks).
				return false;
			}
		});
		if (claimant) {
			claimant.push(resp);
		} else if (!isStatus) {
			// §8 step 3c: nothing claimed it, and (for non-status content) it
			// didn't go through the state-tracker lane either — genuinely
			// unhandled data.
			this.host.emitUnhandled(resp);
		}
	}

	routeTagged(resp: TaggedResponse): void {
		this.host.emitTagged(resp);
		this.host.emitResponse(resp);

		const owner = this.tagMap.get(resp.tag.id);
		if (owner) {
			this.tagMap.delete(resp.tag.id);
			owner.resolveTagged(resp);
		} else {
			this.host.log({
				level: "warn",
				message: `Received a tagged response for unknown tag "${resp.tag.id}"`,
			});
			this.host.emitUnhandled(resp);
		}
	}

	routeContinuation(resp: ContinueResponse): void {
		this.host.emitContinue(resp);
		this.host.emitResponse(resp);

		if (this.continuationOwner) {
			this.continuationOwner.onContinuation(resp);
		} else {
			this.host.log({
				level: "warn",
				message: "Received a continuation response with no registered owner",
			});
			this.host.emitUnhandled(resp);
		}
	}

	routeUnknown(resp: UnknownResponse | null): void {
		this.host.emitUnknown(resp);
		this.host.emitResponse(resp);
		if (resp) {
			this.host.emitUnhandled(resp);
		}
	}

	/**
	 * Re-homed verbatim from `Connection`'s former `handleStatusResponse`
	 * (M0.3): ALERT resp-code anywhere always reaches the logger at "warn";
	 * when the transport is not yet confidential the log entry is marked
	 * `trusted: false` and the response is NOT surfaced as `serverStatus`
	 * (RFC9051-11.3-2). Every other status (including BYE) is surfaced
	 * exactly as before — BYE close choreography and CAPABILITY
	 * registry auto-update from the state-tracker lane proper (spec §8.3)
	 * are explicitly out of scope for this milestone (see class doc
	 * comment); this is the same M0 behavior, just relocated.
	 */
	private handleStatusResponse(resp: UntaggedResponse): void {
		const status = resp.content as StatusResponse;
		const code = status.text?.code;
		const isAlert = code instanceof AtomTextCode && code.kind === "ALERT";

		if (isAlert) {
			const alertText = status.text?.content ?? "";
			const confidential = this.host.isSecure();
			this.host.log({
				level: "warn",
				message: alertText,
				detail: { code: "ALERT", trusted: confidential },
			});
			// ADDITIVE, and deliberately BEFORE the pre-confidentiality
			// early-return below: `ImapClient`'s `alert` event (spec I-7) must
			// fire regardless of confidentiality (with `trusted` reflecting
			// it), unlike `serverStatus`, which stays suppressed pre-TLS.
			this.host.emitAlert(alertText, { trusted: confidential });
			if (!confidential) {
				return;
			}
		}

		this.host.emitServerStatus(resp);
	}
}
