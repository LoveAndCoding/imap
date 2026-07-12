// CapabilityRegistry + CapabilityView (spec §3.5, invariant I-2/I-5/I-9).
//
// Supersedes the M0 precursor `src/connection/capabilities.ts` (which just
// held "the last CapabilityList, or null"): this registry additionally
// exposes a LIVE `CapabilityView` (the same object instance keeps reading
// correctly across `set()`/`invalidate()` calls — consumers stash `.view`
// once, e.g. as `ImapClient.capabilities`, rather than re-fetching it) and
// an `epoch` counter so callers can detect staleness without re-reading
// every field. A later task rewires `Connection` onto this registry; the
// precursor is left as-is until then.

import type { CapabilityList } from "../parser";
import { ciCanonicalize } from "../lexer/case-insensitive";

const AUTH_PREFIX = "AUTH=";
const EMPTY_CAPS: ReadonlySet<string> = new Set();

/**
 * Read-only, live snapshot of the registry's current capability set. "Live"
 * means: hold onto one `CapabilityView` instance and its answers stay
 * correct after any number of subsequent `set()`/`invalidate()` calls on
 * the owning registry — it is a view, not a copy taken at construction
 * time.
 */
export interface CapabilityView {
	/** Case-insensitive membership test (RFC3501-9-2/RFC9051-9-2). */
	has(cap: string): boolean;
	/** Parsed `AUTH=` values, canonical upper-case (e.g. "PLAIN"). */
	authMechanisms(): string[];
	/** All known capabilities, canonical upper-case. */
	all(): ReadonlySet<string>;
	/** Bumps on every `set()` AND every `invalidate()`; never decreases. */
	readonly epoch: number;
}

/**
 * A capability source the registry can ingest: either a parsed
 * `CapabilityList` (what the client feeds it from a CAPABILITY response or
 * a `[CAPABILITY ...]` response code) or a plain iterable of raw capability
 * atom strings (handy for tests, and for greeting/tagged-OK code paths that
 * only have the raw strings on hand).
 */
export type CapabilitySource = CapabilityList | Iterable<string>;

function isPlainIterable(
	source: CapabilitySource,
): source is Iterable<string> {
	return typeof (source as Iterable<string>)[Symbol.iterator] === "function";
}

function toCapabilityStrings(source: CapabilitySource): Iterable<string> {
	if (isPlainIterable(source)) {
		return source;
	}
	// CapabilityList isn't itself iterable; unwrap it to its capabilities'
	// full string form (e.g. "STARTTLS", "AUTH=PLAIN") and process those
	// identically to the plain-iterable path below, so there is exactly one
	// place that does AUTH= parsing / canonicalization.
	return source.capabilities.map((cap) => cap.fullValue);
}

/**
 * Same shape as `CapabilityView`, except `epoch` is a plain mutable field
 * rather than a read-only accessor. The registry holds one instance of
 * this (`mutableView`) and exposes it externally as `view: CapabilityView`
 * — same object, stricter type. Bumping `epoch` is then just
 * `mutableView.epoch += 1`, with no need for a `this`-capturing `get`
 * accessor (which would otherwise require aliasing `this`, since a `get`
 * defined via object-literal/method shorthand binds `this` to the object
 * literal itself, not the enclosing registry).
 */
interface MutableCapabilityView {
	has(cap: string): boolean;
	authMechanisms(): string[];
	all(): ReadonlySet<string>;
	epoch: number;
}

/**
 * Holds the client's current understanding of server capabilities as a
 * live `CapabilityView`, plus the invalidation/epoch machinery §3.5
 * requires: STARTTLS handshake success, authentication, and UNAUTHENTICATE
 * all `invalidate()` this registry (I-2) so stale pre-upgrade/pre-auth
 * capability data is never observable; an untagged CAPABILITY or
 * `[CAPABILITY]` response code `set()`s it instead (a set, not a merge —
 * the server's capability list is authoritative and complete each time
 * per RFC3501/RFC9051 §7.2.1).
 *
 * Reads of an invalid (unset/invalidated) registry return empty/false —
 * they never throw. Deciding whether/when to force a CAPABILITY round trip
 * in response to an invalid registry is the client's call, not this
 * registry's.
 */
export class CapabilityRegistry {
	private caps: Set<string> | null = null;
	private authMechs: Set<string> | null = null;
	private readonly listeners = new Set<(view: CapabilityView) => void>();
	private readonly mutableView: MutableCapabilityView;

	/** The live view backed by this registry. Stable identity — cache it. */
	public readonly view: CapabilityView;

	constructor() {
		this.mutableView = {
			has: (cap: string): boolean => {
				return this.caps?.has(ciCanonicalize(cap)) ?? false;
			},
			authMechanisms: (): string[] => {
				return this.authMechs ? Array.from(this.authMechs) : [];
			},
			all: (): ReadonlySet<string> => {
				return this.caps ?? EMPTY_CAPS;
			},
			epoch: 0,
		};
		this.view = this.mutableView;
	}

	/** `true` once a capability set has been recorded and not since invalidated. */
	public get isValid(): boolean {
		return this.caps !== null;
	}

	/**
	 * Records a freshly-obtained capability set as current, replacing
	 * (never merging with) whatever was there before. Accepts either a
	 * parsed `CapabilityList` or a plain iterable of raw capability
	 * strings. Bumps `epoch` and notifies `onChange` subscribers.
	 */
	public set(source: CapabilitySource): void {
		const nextCaps = new Set<string>();
		const nextAuth = new Set<string>();

		for (const raw of toCapabilityStrings(source)) {
			const canonical = ciCanonicalize(raw);
			nextCaps.add(canonical);

			if (
				canonical.length > AUTH_PREFIX.length &&
				canonical.startsWith(AUTH_PREFIX)
			) {
				nextAuth.add(canonical.slice(AUTH_PREFIX.length));
			}
		}

		this.caps = nextCaps;
		this.authMechs = nextAuth;
		this.commit();
	}

	/**
	 * Drops to "unknown" (per §3.5: post-STARTTLS-handshake,
	 * post-authentication, post-UNAUTHENTICATE). Bumps `epoch` and notifies
	 * `onChange` subscribers same as `set()` — both are state changes a
	 * consumer may care about, and the epoch counter exists precisely so a
	 * consumer can tell "unknown-because-just-invalidated" apart from
	 * "unknown-because-never-set" without a separate flag.
	 */
	public invalidate(): void {
		this.caps = null;
		this.authMechs = null;
		this.commit();
	}

	/**
	 * Same reset as `invalidate()` (drops to "unknown", bumps `epoch`), but
	 * does NOT notify `onChange` subscribers. For internal housekeeping only
	 * — currently: `ImapClient` clearing its capability cache when the
	 * connection drops, so a LATER reconnect's `ensureCapabilities()` doesn't
	 * skip re-fetching. That housekeeping is not itself a fact about the
	 * server worth surfacing through the public `capabilitiesChanged` event
	 * (nothing about the server's capabilities changed — the client merely
	 * forgot them because the transport went away); a caller that wants to
	 * know when the connection dropped already has the client's `close`
	 * event for that.
	 */
	public invalidateSilently(): void {
		this.caps = null;
		this.authMechs = null;
		this.mutableView.epoch += 1;
	}

	/**
	 * Subscribes to every `set()`/`invalidate()` (the `capabilitiesChanged`
	 * event's eventual backing). Returns an unsubscribe function.
	 */
	public onChange(cb: (view: CapabilityView) => void): () => void {
		this.listeners.add(cb);
		return () => {
			this.listeners.delete(cb);
		};
	}

	private commit(): void {
		this.mutableView.epoch += 1;
		for (const listener of this.listeners) {
			listener(this.view);
		}
	}
}
