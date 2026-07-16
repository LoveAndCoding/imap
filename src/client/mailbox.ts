import { TypedEmitter } from "tiny-typed-emitter";

import type { AppendCapabilityProbe, AppendOptions, AppendResult, AppendSource } from "../commands/append";
import type { Command } from "../commands/base";
import { CloseCommand } from "../commands/close";
import { ConvertCommand } from "../commands/convert";
import type { ConvertResult, ConvertTransformation } from "../commands/convert";
import { CopyCommand } from "../commands/copy";
import type { CopyResult } from "../commands/copy";
import { ExpungeCommand } from "../commands/expunge";
import { FetchCommand } from "../commands/fetch";
import type { FetchCapabilityProbe } from "../commands/fetch";
import { GmailLabelsStoreCommand } from "../commands/gmail-labels";
import type { GmailLabelsOperation } from "../commands/gmail-labels";
import { MoveCommand } from "../commands/move";
import { NoopCommand } from "../commands/noop";
import { SortCommand } from "../commands/message/sort";
import { ThreadCommand } from "../commands/message/thread";
import type { ThreadNode } from "../commands/message/thread";
import { ReplaceCommand } from "../commands/replace";
import type { SelectResult, SelectResyncEvent } from "../commands/select";
import { SearchCommand } from "../commands/search";
import type { SearchOptions, SearchResult } from "../commands/search";
import {
	assertSearchResSentinelAllowed,
	criteriaHasModSeq,
	criteriaSeqSequenceSets,
} from "../commands/search-criteria";
import type { SearchCriteria } from "../commands/search-criteria";
import { StoreCommand } from "../commands/store";
import type { StoreCapabilityProbe, StoreModifiers, StoreOperation, StoreResult } from "../commands/store";
import { UnselectCommand } from "../commands/unselect";
import { CapabilityError, NotImplementedError, StateError } from "../errors";
import { SequenceSet } from "../protocol/sequence-set";
import type { SequenceInput } from "../protocol/sequence-set";
import type { Flag, SortKey, ThreadAlgorithm } from "../protocol/vocabularies";
import type { FetchModifiers, FetchRequest, FetchedMessage, FetchedMessageImpl } from "./fetch";
import { IdleController } from "./idle-controller";
import type { IdleControllerDriver, IdleHandle } from "./idle-controller";
import type { ClientState } from "./state";

/**
 * `MailboxSession` (spec §5b) -- M2.2 landed the skeleton (snapshot fields,
 * events, the M2.2-era reselect/CLOSED choreography); M2.13 (this milestone)
 * adds `close()`/`unselect()` -- the class's only two message-independent
 * deselection methods -- plus the `"closed"`/`"unselected"` reasons those
 * methods emit (`"reselected"` was wired in M2.2; `"disconnected"` is still
 * a future milestone's carry-forward, see `MailboxClosedReason`'s doc
 * comment). `fetch`/`search`/`store`/`copy`/`move`/`expunge`/`seq`/`idle`/
 * `updates` still do not exist on this class -- not even as
 * `NotImplementedError` throws -- they land in M3 (the M2 plan's "no stub
 * methods ahead of their milestone" rule).
 *
 * Lifecycle: constructed by `ImapClient.select()`/`.examine()` once a
 * SELECT/EXAMINE's tagged OK arrives (never directly by a caller). Snapshot
 * fields are then live-mutated by `ImapClient`'s mailbox half of the §8.3
 * state-tracker lane via the package-private `static` driver methods below
 * (same pattern as `commands/base.ts`'s `Command.assignTag`/etc: a class's
 * own static methods may reach the private members of any instance of that
 * class, which is how `client.ts` mutates a session without every field
 * needing to be publicly settable). `close()`/`unselect()` need a second,
 * narrower access seam back into the OWNING client -- `MailboxSessionDriver`
 * below -- since (unlike the one-directional snapshot mutation) actually
 * deselecting requires running a real command through `ImapClient.run()`'s
 * state/capability gating and then telling the client to clear its own
 * `mailbox` pointer and drop back to "authenticated". A full `ImapClient`
 * reference is deliberately NOT threaded through (that would let this class
 * reach far more of the client than it needs, and would create an import
 * cycle with client.ts); the driver interface is the minimal capability set.
 */

/**
 * The minimal callback surface `ImapClient` hands each `MailboxSession` it
 * constructs (see `client.ts`'s `makeMailboxDriver()`), used ONLY by
 * `close()`/`unselect()` below. Kept as a narrow structural interface
 * (rather than importing `ImapClient` itself) to avoid a client.ts <->
 * mailbox.ts import cycle and to keep this class's privileges to exactly
 * what deselection needs.
 */
export interface MailboxSessionDriver {
	/** Runs a `Command` through `ImapClient.run()` -- the same state/
	 *  capability gating (and zero-bytes-written-on-reject guarantee, I-9/
	 *  I-11) every other verb goes through. */
	run<T>(command: Command<T>): Promise<T>;
	/** Live read of the owning client's current `ClientState`, for an
	 *  accurate `StateError` when a caller re-invokes `close()`/`unselect()`
	 *  on an already-closed session. */
	currentState(): ClientState;
	/** Case-insensitive capability probe against the client's live registry
	 *  (mirrors `ImapClient.supports()`), used for `unselect()`'s
	 *  RFC-annotated pre-check (the same "explicit precheck + command's own
	 *  `capability` declare" two-layer pattern `ImapClient.create()`/
	 *  `namespaces()` use). */
	hasCapability(cap: string): boolean;
	/** `ResolvedConfig.maxInlineSize` (spec §5.4/§2, M1 groundwork left
	 *  unconsumed until M3.5): the fetch part buffering cutoff `FetchCommand`
	 *  reads to decide, per body part, whether to eagerly drain a streamed
	 *  literal into a `Buffer` or hand out a live stream. */
	maxInlineSize(): number;
	/** Called ONCE the deselecting command's tagged OK has actually arrived:
	 *  clears the client's `mailbox` pointer (only if it still points at
	 *  THIS session -- a defensive no-op otherwise) and transitions
	 *  "selected" -> "authenticated". Never called before the command
	 *  succeeds, so a failed CLOSE/UNSELECT (tagged NO/BAD) leaves the
	 *  client's selection completely undisturbed. */
	deselect(session: MailboxSession): void;
	/**
	 * M4.1 (spec §3.7): the two `IdleControllerDriver` seams `idle()` needs
	 * to construct a fresh `IdleController` per call -- subscribing to the
	 * queue's "another context queued behind the active isolated one" signal
	 * (`Connection.onQueueContextQueuedBehindIsolated()`) and reading
	 * `timeouts.idleRenew`. Kept as two separate fields (rather than handing
	 * back a whole `IdleControllerDriver` object) so this interface's own
	 * "narrow, additive, one seam per need" shape stays consistent with
	 * every other member here.
	 */
	onQueuedBehindIsolated(cb: () => void): () => void;
	idleRenewMs(): number;
	/**
	 * M4.13 (RFC 5465 §5.2/§5.3): whether the client's most recently
	 * successful `notify()` registered a SELECTED (immediate, never
	 * SELECTED-DELAYED) event-group carrying `MessageNew`/`MessageExpunge`
	 * respectively. Consumed by `runFetch`/`runStore`/`runCopyOrMove` below
	 * to enforce, for the sequence-number ("seq") grain specifically:
	 *   - RFC5465-5.2-4: '*'-terminated sequence-set arguments are refused
	 *     while `hasActiveNotifySelectedMessageNew()` is true (the highest
	 *     MSN can change at any time once MessageNew is active, so '*' no
	 *     longer denotes a stable message).
	 *   - RFC5465-5.3-2: MSN-addressed commands altogether are refused while
	 *     `hasActiveNotifySelectedMessageExpunge()` is true (an MSN can be
	 *     invalidated between composing and parsing a command once immediate
	 *     expunge notifications are active — "such a client cannot use
	 *     FETCH, but has to use UID FETCH"). This library has no live
	 *     sequence-number-to-UID cache to perform that translation safely
	 *     and transparently, so this is an honest `NotImplementedError`
	 *     refusal (see `assertSequenceGrainSafeUnderNotify`'s own doc
	 *     comment), not a silent reinterpretation of the caller's numbers.
	 */
	hasActiveNotifySelectedMessageNew(): boolean;
	hasActiveNotifySelectedMessageExpunge(): boolean;
	/**
	 * M4.3 (spec §3.7): `timeouts.noopFallbackInterval` (already validated/
	 * defaulted to `30_000`, `client/config.ts`) — how often `updates()`'s
	 * NOOP-poll fallback (no IDLE capability, or `{idle:false}`) re-submits a
	 * fresh `NOOP` while at least one such iterator is active on this
	 * session. Same "one seam per need" shape as `idleRenewMs()` above.
	 */
	noopFallbackIntervalMs(): number;
	/**
	 * M5.6 (RFC 8508 REPLACE, RFC 7889 §4): mirrors `AppendCapabilityProbe.
	 * knownAppendLimit()` exactly (`commands/append.ts`) -- `true` only once
	 * the server's upload-size ceiling is actually known (the global valued
	 * `APPENDLIMIT=<number>` capability form), reported through this seam so
	 * `MailboxSession.replace()`/`SeqFacet.replace()` can build the same
	 * `AppendCapabilityProbe` `ImapClient.append()` builds inline, without
	 * this class needing direct access to the capability registry's raw
	 * `view.all()` enumeration (which `hasCapability()` alone doesn't expose).
	 */
	knownAppendLimit(): boolean;
}

/** `closed` event reasons (spec §5b). `"closed"`/`"unselected"` are wired by
 *  THIS milestone's `close()`/`unselect()` methods below; `"reselected"` was
 *  wired in M2.2 (`ImapClient.select()`/`.examine()`'s reselect choreography,
 *  and the RFC 7162/9051 CLOSED resp-code's defensive-backstop handling --
 *  see `client.ts`'s doc comments, including this milestone's revisited
 *  judgment call on that backstop's reason); `"disconnected"` is still wired
 *  wherever the connection teardown path lands (not this task either -- a
 *  future task's carry-forward).
 */
export type MailboxClosedReason =
	| "closed"
	| "unselected"
	| "reselected"
	| "disconnected";

export interface MailboxFlagsUpdate {
	seq: number;
	uid?: number;
	flags: ReadonlySet<string>;
	modSeq?: bigint;
}

/**
 * `updates()`'s discriminated-union payload (spec §5b, M4.3) — a thin,
 * flattened mirror of `MailboxSessionEvents`' four data-carrying members
 * (`exists`/`expunge`/`vanished`/`flags`; `uidValidityChanged`/`closed` are
 * NOT part of this union, same listing spec §5b itself gives). Field shapes
 * copied verbatim from the spec text: `exists` deliberately drops the
 * event's own `prev` argument (the union member has no such field), `flags`
 * keeps `uid`/`modSeq` optional exactly like `MailboxFlagsUpdate` above.
 */
export type MailboxUpdate =
	| { type: "exists"; count: number }
	| { type: "expunge"; seq: number }
	| { type: "vanished"; uids: number[]; earlier: boolean }
	| { type: "flags"; seq: number; uid?: number; flags: ReadonlySet<string>; modSeq?: bigint };

/** `updates()`'s options (spec §5b: `updates(opts?: { idle?: boolean |
 *  "require" }): AsyncIterable<MailboxUpdate>`) — named here (rather than
 *  left as an inline object type) purely for readability at the several call
 *  sites this task's implementation needs it at; the wire contract is
 *  identical either way. See `MailboxSession.updates()`'s own doc comment
 *  for exactly what each of the three `idle` values does. */
export interface MailboxUpdatesOptions {
	idle?: boolean | "require";
}

/**
 * The sequence-number-grain mirror facet (spec §5b: "`MailboxSession.seq`
 * ... exposing the same method shapes over sequence numbers"; "unavailable
 * under UIDONLY, RFC 9586 -- every method rejects
 * CapabilityError('UIDONLY active')" -- that gate is REAL as of M5.15
 * (`assertUidOnlyInactive`, called by every shared `run*` static for the
 * seq grain; note its documented POLARITY INVERSION: the one
 * `CapabilityError` in this codebase thrown because a mode is ACTIVE
 * rather than a capability absent). Created at M3.7 with its
 * first verb, `search()`; M3.6 added the STORE-family mirrors — per the M3
 * plan's shared design note, later message-op tasks (fetch/copy/move/
 * expunge) add their own methods here ADDITIVELY, in their own task, never
 * as an ahead-of-time stub. Every method here issues the bare
 * (non-`UID`-prefixed) wire verb over sequence numbers, exactly mirroring
 * its `MailboxSession` UID-grain counterpart's shape.
 */
export interface SequenceFacet {
	fetch(seqs: SequenceInput, items: FetchRequest, opts?: FetchModifiers): AsyncIterable<FetchedMessage>;
	fetchOne(seq: number, items: FetchRequest, opts?: FetchModifiers): Promise<FetchedMessage | null>;
	search(criteria: SearchCriteria, opts?: SearchOptions): Promise<SearchResult>;
	/** Bare `SORT` (RFC 5256, spec §5b, M4.9) -- sequence-number-grain mirror
	 *  of `MailboxSession.sort()`; see that method's doc comment. */
	sort(sort: SortKey[], criteria: SearchCriteria, opts?: SearchOptions): Promise<SearchResult>;
	/** Bare `THREAD` (RFC 5256, spec §5b, M4.9) -- sequence-number-grain
	 *  mirror of `MailboxSession.thread()`; delivered `ThreadNode`s carry
	 *  `seq`, never `uid`. */
	thread(algorithm: ThreadAlgorithm, criteria: SearchCriteria, opts?: SearchOptions): Promise<ThreadNode[]>;
	addFlags(seqs: SequenceInput, flags: Flag[], opts?: StoreModifiers): Promise<StoreResult>;
	removeFlags(seqs: SequenceInput, flags: Flag[], opts?: StoreModifiers): Promise<StoreResult>;
	setFlags(seqs: SequenceInput, flags: Flag[], opts?: StoreModifiers): Promise<StoreResult>;
	copy(seqs: SequenceInput, dest: string): Promise<CopyResult>;
	move(seqs: SequenceInput, dest: string): Promise<CopyResult>;
	/**
	 * Bare EXPUNGE only (spec §5b, M3.9) -- deliberately NOT a mechanical
	 * "same shape, sequence-number grain" mirror of `MailboxSession.expunge()`
	 * the way every method above it is. UID EXPUNGE's one and only argument
	 * (RFC 4315 §2.1) is a set of UIDs -- there is no such thing as a
	 * "sequence-number-grain UID EXPUNGE": mixing sequence numbers into that
	 * argument would silently resolve to the WRONG messages against a
	 * server's UID space, a footgun this facet must not offer a signature for
	 * at all. Bare EXPUNGE, by contrast, already has NO argument in either
	 * grain (RFC 3501/9051 §6.4.3: "Arguments: none") -- there is nothing
	 * left to be "sequence-number-grain" ABOUT once the UID-grain form is
	 * excluded, so `seq.expunge()` simply always issues bare EXPUNGE, taking
	 * no parameter. See `MailboxSession.expunge()`'s own doc comment for the
	 * full no-arg/with-arg dispatch this method's zero-argument shape falls
	 * out of.
	 */
	expunge(): Promise<number[]>;
	/**
	 * Bare REPLACE (RFC 8508, spec §5b, M5.6) -- sequence-number-grain mirror
	 * of `MailboxSession.replace()`, `seq` interpreted as a message sequence
	 * number rather than a UID (bare `REPLACE`, not `UID REPLACE`).
	 *
	 * The spec's own §5b class listing shows `replace()` once, under the
	 * UID-grain message-op group, not restated in this facet's comment
	 * block -- but RFC 8508 §3.2/§3.3 defines TWO wire forms (`REPLACE
	 * seq-number ...` and `UID REPLACE uid ...`), each independently useful
	 * (a caller addressing a just-fetched sequence number never has to
	 * resolve it to a UID first purely to replace a draft), so this facet
	 * carries the bare-verb form the exact same way every other message-op
	 * mirror here does (`copy`/`move`/`addFlags`/etc.) -- confirmed at this
	 * task's kickoff against the driver-wiring convention already
	 * established for `copy()`/`move()`/`expunge()` (bare verb name -> `.seq`
	 * facet, `uid`-prefixed name -> the UID-grain method directly), which
	 * the pre-existing compliance suite (`test/compliance/specs/ext/
	 * replace-8508.test.ts`, `test/compliance/driver/driver.ts`'s separately
	 * stubbed `replace()`/`uidReplace()`) already pins as two distinct wire
	 * forms to drive.
	 */
	replace(seq: number, mailbox: string, msg: AppendSource, opts?: AppendOptions): Promise<AppendResult>;
	/**
	 * Bare `STORE +X-GM-LABELS` (X-GM-EXT-1, spec §5b, M5.8) -- sequence-
	 * number-grain mirror of `MailboxSession.addGmailLabels()`, `seqs`
	 * interpreted as message sequence numbers rather than UIDs (bare `STORE`,
	 * not `UID STORE`). The vendor doc's own worked example (catalog id
	 * X-GM-EXT-1-labels-6) is itself a bare-STORE form (`a011 STORE 1
	 * +X-GM-LABELS (foo)`) -- same "carry the bare-verb form too" rationale
	 * `replace()` above documents for RFC 8508, applied here since STORE's
	 * base grammar (which X-GM-LABELS reuses per the vendor doc's own STORE
	 * cross-reference) has always supported both grains symmetrically, same
	 * as `addFlags()`/`removeFlags()`.
	 */
	addGmailLabels(seqs: SequenceInput, labels: string[]): Promise<void>;
	/** Bare `STORE -X-GM-LABELS` (X-GM-EXT-1, spec §5b, M5.8) -- sequence-
	 *  number-grain mirror of `MailboxSession.removeGmailLabels()`; see
	 *  `addGmailLabels()`'s own doc comment above for the shared rationale. */
	removeGmailLabels(seqs: SequenceInput, labels: string[]): Promise<void>;
	/**
	 * Bare CONVERT (RFC 5259 §6, M5.12) -- sequence-number-grain mirror of
	 * `MailboxSession.convert()`, `seqs` interpreted as message sequence
	 * numbers rather than UIDs (bare `CONVERT`, not `UID CONVERT`). See
	 * `MailboxSession.convert()`'s own doc comment for the shared capability
	 * gate and the minimal-surface scope note.
	 */
	convert(seqs: SequenceInput, item: string, transformation: ConvertTransformation): Promise<ConvertResult>;
}

/**
 * M4.13 (RFC 5465 §5.2/§5.3): the sequence-number ("seq") grain enforcement
 * point for both of NOTIFY's client-side prohibitions, called from
 * `runFetch`/`runStore`/`runCopyOrMove` right after each stamps its
 * `SequenceSet` with `kind` -- a no-op for `kind === "uid"` (neither
 * prohibition constrains UID-addressed commands; the whole hazard is MSN
 * instability, and UIDs are exactly the escape hatch RFC 5465 §5.3
 * recommends). Order matters: the narrower, ACTIONABLE '*'-suppression
 * check runs first (so a caller who happens to trip both conditions at once
 * gets the more specific diagnostic), then the broader MSN prohibition.
 *
 * RFC5465-5.3-2's "such a client cannot use FETCH, but has to use UID
 * FETCH" reads, on its face, like an instruction to transparently reissue
 * the SAME call as its UID-grain counterpart. This library does not do that
 * silently: the caller's `seqs` argument denotes MESSAGE SEQUENCE NUMBERS,
 * and turning those same numeric values into a UID-addressed command
 * without a live sequence-number-to-UID mapping (which this milestone does
 * not build -- it would mean this library tracking a full local mirror of
 * every message's current UID, keyed by its current MSN, updated on every
 * EXISTS/EXPUNGE) would silently target different messages than the caller
 * asked for whenever that assumption is wrong -- exactly the kind of
 * "transform caller data instead of refusing it" anti-pattern this codebase
 * avoids elsewhere (`assertNoRecentFlag`'s doc comment states the same
 * refuse-don't-transform posture explicitly). Refusing with an honest
 * `NotImplementedError` (mirroring `SortCommand`'s own PARTIAL-on-SORT
 * precedent for "a real RFC-legal shape this milestone doesn't build") is
 * the correct call here: the caller is told to re-address by UID with
 * numbers IT already knows to be correct, rather than being handed results
 * for messages it never asked about.
 */
/**
 * M5.15 (RFC 9586, spec §5b): the UIDONLY lockout -- called by every shared
 * `run*` static below for its sequence-number ("seq") grain, BEFORE any
 * command object is constructed or byte written (I-9-style zero-bytes
 * discipline). Once `ENABLE UIDONLY` has succeeded on this connection, "the
 * client MUST NOT use message sequence numbers ... as arguments to any IMAP
 * command for the remainder of the connection" (RFC9586-3-2) -- an
 * IRREVERSIBLE per-connection mode: RFC 5161 has no un-ENABLE, so there is
 * no path back to a working `seq` facet short of a new connection
 * (`client.enabled` is cleared only by disconnect/UNAUTHENTICATE).
 *
 * ⚠️ POLARITY INVERSION -- read before pattern-matching this against every
 * other `CapabilityError` in this codebase. Everywhere else (and in every
 * prior milestone), `CapabilityError` means a capability is ABSENT: the
 * server never advertised (or never confirmed ENABLE for) something a method
 * needs. This is the ONE gate that rejects because a mode is ACTIVE --
 * `driver.hasCapability("UIDONLY")` returning TRUE is the failure condition.
 * The error class is reused for message-shape consistency (`{ capability,
 * rfc }` telling the caller exactly which extension and document to look
 * at), not because the trigger matches; a reader assuming "CapabilityError
 * always means capability absent" will misdiagnose this one, which is why
 * both this comment and `SeqFacet`'s class doc call it out explicitly.
 *
 * `driver.hasCapability` is `ImapClient.effectiveCapability()`, which gates
 * UIDONLY on `_enabled` (genuinely ENABLE-confirmed), never on bare
 * advertisement -- a server that merely ADVERTISES UIDONLY leaves the `seq`
 * facet fully usable (RFC 9586 changes nothing until the client opts the
 * connection in).
 */
function assertUidOnlyInactive(driver: MailboxSessionDriver, label: string): void {
	if (!driver.hasCapability("UIDONLY")) {
		return;
	}
	throw new CapabilityError(
		`${label}: UIDONLY active -- ENABLE UIDONLY succeeded earlier on this ` +
			"connection, so message-sequence-number commands are prohibited for " +
			"the remainder of the connection (RFC 9586: the client MUST NOT use " +
			"message sequence numbers as arguments to any IMAP command once " +
			"UIDONLY is enabled; there is no un-ENABLE). Use the UID-grain " +
			"MailboxSession method of the same name instead, or connect with an " +
			'explicit `extensions` config that omits "UIDONLY" if this session ' +
			"must keep its sequence-number facet",
		{ capability: "UIDONLY", rfc: "RFC9586" },
	);
}

function assertSequenceGrainSafeUnderNotify(
	driver: MailboxSessionDriver,
	set: SequenceSet,
	kind: "uid" | "seq",
	label: string,
): void {
	if (kind !== "seq") {
		return;
	}
	if (driver.hasActiveNotifySelectedMessageNew() && set.hasOpenEnd()) {
		throw new RangeError(
			`${label}: '*'-terminated sequence-set arguments are refused while a NOTIFY SET ` +
				"(SELECTED (MessageNew ...)) registration is active (RFC 5465 §5.2: the highest " +
				"message sequence number can change at any time once MessageNew notifications " +
				"are active, so '*' no longer denotes a stable message, RFC5465-5.2-4) -- address " +
				"the intended message with a fixed number, or use the UID-grain method with a " +
				"known UID instead",
		);
	}
	if (driver.hasActiveNotifySelectedMessageExpunge()) {
		throw new NotImplementedError(
			`${label}: message-sequence-numbered commands while a NOTIFY SET (SELECTED ` +
				"(MessageExpunge ...)) registration is active (RFC 5465 §5.3: an MSN can be " +
				"invalidated between composing and parsing a command once immediate expunge " +
				'notifications are active -- "such a client cannot use FETCH, but has to use UID ' +
				'FETCH", RFC5465-5.3-2). Transparently reissuing this call by UID would need a ' +
				"live sequence-number-to-UID cache this library does not maintain, and silently " +
				"reinterpreting the same numbers as UIDs could target different messages than " +
				"requested -- call the UID-grain method (fetch()/addFlags()/removeFlags()/" +
				"setFlags()/copy()/move()) with known UIDs instead",
		);
	}
}

/**
 * CF3+SF1 (M4-phase-boundary review, RFC 5465 §5.2/§5.3): applies the SAME
 * two NOTIFY prohibitions `assertSequenceGrainSafeUnderNotify` enforces for
 * a command's own top-level sequence-set argument, but for a bare
 * `SearchCriteria.seq` search key instead -- called from `runSearch`/
 * `runSort`/`runThread` regardless of grain (`uid`/`seq`), since
 * `criteria.seq` always denotes message sequence numbers no matter which
 * grain the ENCLOSING command uses (unlike `assertSequenceGrainSafeUnderNotify`,
 * which is a no-op for `kind === "uid"` because that check is about the
 * command's OWN addressing, not a nested search key). RFC 5465 §5.2/§5.3's
 * text illustrates both prohibitions with FETCH, but the underlying hazard
 * -- an MSN denoting a different, or no longer any, message by the time the
 * server parses it -- is general to every MSN-addressed argument, search
 * keys included; previously neither guard was applied here at all, so a
 * bare `{ seq: "3:*" }` (or an MSN key under active MessageExpunge) reached
 * the wire ungated even though the equivalent `seq.fetch()` argument was
 * already refused.
 */
function assertSearchCriteriaSeqSafeUnderNotify(
	driver: MailboxSessionDriver,
	criteria: SearchCriteria,
	label: string,
): void {
	const rawSets = criteriaSeqSequenceSets(criteria);
	if (rawSets.length === 0) {
		return;
	}
	const sets = rawSets.map((s) => SequenceSet.from(s).withKind("seq"));
	if (driver.hasActiveNotifySelectedMessageNew() && sets.some((s) => s.hasOpenEnd())) {
		throw new RangeError(
			`${label}: a '*'-terminated SearchCriteria.seq sequence-set is refused while a NOTIFY ` +
				"SET (SELECTED (MessageNew ...)) registration is active (RFC 5465 §5.2: the highest " +
				"message sequence number can change at any time once MessageNew notifications " +
				"are active, so '*' no longer denotes a stable message, RFC5465-5.2-4) -- address " +
				"the intended message with a fixed number instead",
		);
	}
	if (driver.hasActiveNotifySelectedMessageExpunge()) {
		throw new NotImplementedError(
			`${label}: a SearchCriteria.seq (message-sequence-number) search key is refused while ` +
				"a NOTIFY SET (SELECTED (MessageExpunge ...)) registration is active (RFC 5465 " +
				"§5.3: an MSN can be invalidated between composing and parsing a command once " +
				'immediate expunge notifications are active -- "such a client cannot use FETCH, ' +
				'but has to use UID FETCH", RFC5465-5.3-2, read here as general to every ' +
				"MSN-addressed argument). Transparently reissuing this call by UID would need a " +
				"live sequence-number-to-UID cache this library does not maintain -- remove the " +
				"seq criterion, or address the intended message via SearchCriteria.uid instead",
		);
	}
}

export interface MailboxSessionEvents {
	exists: (count: number, prev: number) => void;
	expunge: (seq: number) => void;
	/**
	 * QRESYNC (RFC 7162 §3.2.10, M4.6). `earlier: true` — a `VANISHED
	 * (EARLIER)` response (§3.2.10.1): informational only, reporting UIDs
	 * that are ALREADY excluded from this session's `exists`/wire EXISTS
	 * counts (arriving either as part of a QRESYNC SELECT/EXAMINE's own
	 * resync stream, §3.2.5.1, or -- unusually -- later on the same
	 * connection); `exists` is deliberately NOT decremented for this case.
	 * `earlier: false` — a bare `VANISHED` (§3.2.10.2): a LIVE expunge
	 * report that replaces EXPUNGE for the rest of a QRESYNC-ENABLEd
	 * connection (§3.2.7/§3.2.9); `exists` IS decremented, by the COUNT of
	 * `uids` (this session keeps no seq<->uid map, spec §8.3, so — same
	 * limit `expunge`'s own per-seq decrement already has — a duplicate or
	 * already-absent UID in a pathological server's report would still
	 * decrement once per reported UID; not compensated for). See
	 * `MailboxSession.applyVanished()`'s own doc comment for the full
	 * reconciliation approach and its honest limits.
	 */
	vanished: (uids: number[], earlier: boolean) => void;
	flags: (update: MailboxFlagsUpdate) => void;
	uidValidityChanged: (next: number, prev: number) => void;
	closed: (reason: MailboxClosedReason) => void;
}

/** Event names `MailboxSessionEvents` carries resync-buffered payloads for
 *  (spec §5b's resync-buffering guarantee) -- see `MailboxSession`'s own doc
 *  comment on the buffering mechanism. Currently `vanished`/`flags` only
 *  (the two shapes `SelectResyncEvent` produces); listed explicitly (rather
 *  than "any event") so a future unrelated event addition doesn't silently
 *  start triggering resync flushes it has nothing to do with. */
const RESYNC_TRIGGER_EVENTS: ReadonlySet<keyof MailboxSessionEvents> = new Set([
	"vanished",
	"flags",
]);

/** `updates()`'s two live-update strategies (M4.3, spec §3.7) — see that
 *  method's own doc comment for exactly what each one does. */
type LiveUpdatesMode = "idle" | "noop";

/**
 * The shared, refcounted state backing every session's `_liveUpdatesDriver`
 * field (M4.3) — see `MailboxSession.updates()`'s "CONCURRENT `updates()`
 * ITERATORS" doc-comment section for why this exists at all (avoiding a
 * ping-pong between two independent `IdleController`s on the same session).
 * `ready` lets a SECOND concurrent acquire (arriving while the first is
 * still mid-construction, i.e. before its own first `await`) wait for
 * construction to finish rather than racing to build a second driver of its
 * own — see `MailboxSession.acquireLiveUpdatesDriver()`'s own doc comment.
 */
interface LiveUpdatesDriverState {
	readonly mode: LiveUpdatesMode;
	refCount: number;
	readonly ready: Promise<void>;
	/** Torn down once `refCount` reaches zero — ends the managed IDLE
	 *  session for good, or clears the NOOP-poll timer. */
	stop: () => void;
}

export class MailboxSession extends TypedEmitter<MailboxSessionEvents> {
	/** Decoded (caller-facing UTF-8) mailbox name, INBOX-canonicalized --
	 *  see `ImapClient.selectOrExamine()`'s use of `decodeMailboxName(name,
	 *  { utf8Accepted: true })`, which applies ONLY the INBOX canonicalization
	 *  (the caller already supplied a plain Unicode string, never mUTF-7 wire
	 *  bytes, so no mUTF-7 decode step applies here). */
	public readonly name: string;
	public readonly readOnly: boolean;

	private _closed = false;
	private _exists: number;
	private _recent: number | null;
	private readonly _flags: Set<string>;
	private _permanentFlags: Set<string> | null;
	private _uidValidity: number;
	private readonly _uidNext: number | null;
	private readonly _uidNotSticky: boolean;
	private _highestModSeq: bigint | null;
	private readonly _mailboxId: string | null;
	private readonly driver: MailboxSessionDriver;

	/**
	 * S3 fix (M3-phase-boundary review, RFC3501-5.5's client-side pipelining
	 * duty): "in flight" markers for the two response-families whose untagged
	 * responses a concurrently-in-flight SIBLING of the same family cannot be
	 * unambiguously attributed between (classic `* SEARCH` carries no
	 * correlator at all; `* nn FETCH` carries no per-command tag either) —
	 * keyed `"fetch"` / `"search"`, at most one entry each, always holding the
	 * MOST RECENT same-family command's own completion promise (settling the
	 * instant that command's tagged response arrives, i.e. the router has
	 * unregistered its claimant and it can no longer have anything
	 * mis-attributed to or from it — NOT gated on how long the caller takes
	 * to locally finish iterating/reading the result afterwards). See
	 * `chainFamily()` below for how `runFetch`/`runSearch` use this to
	 * serialize DISPATCH (not full consumption) of a second same-family
	 * command behind the first, while leaving every OTHER command family
	 * (STORE, COPY/MOVE, EXPUNGE — already queue-serial or claim-nothing, per
	 * `FetchCommand`'s own doc comment) free to pipeline against a fetch/
	 * search exactly as before.
	 */
	private readonly familyChains = new Map<string, Promise<unknown>>();

	/**
	 * M4.6 (spec §5b's resync-buffering guarantee): QRESYNC resync events
	 * (`VANISHED`/flag-carrying `FETCH` lines observed during THIS session's
	 * own SELECT/EXAMINE, `SelectResult.resync`) held here until they're
	 * replayed -- see `maybeTriggerResyncFlush()`/`flushResync()` below for
	 * the full mechanism. `null` once flushed (whether or not anything was
	 * ever buffered) — used as the single "already done" sentinel everywhere
	 * else in this class checks it.
	 */
	private _resyncBuffer: SelectResyncEvent[] | null;
	/** Guards against scheduling more than one pending microtask flush (see
	 *  `maybeTriggerResyncFlush()`) — independent of `_resyncBuffer` itself
	 *  being non-null, since the buffer is only cleared once the scheduled
	 *  flush actually RUNS, not when it's merely queued. */
	private _resyncFlushMicrotaskQueued = false;

	/**
	 * M4.3 (`updates()`'s concurrent-iterator design note, see that method's
	 * own doc comment): the single, refcounted live-update driver (a managed
	 * `IdleController` or a NOOP-poll timer) shared by every concurrently
	 * active `updates()` iterator on THIS session — `null` whenever none is
	 * active. Set/read only by `acquireLiveUpdatesDriver()`/
	 * `releaseLiveUpdatesDriver()` below.
	 */
	private _liveUpdatesDriver: LiveUpdatesDriverState | null = null;

	/** Sequence-number-grain mirror facet (spec §5b) — see `SequenceFacet`'s
	 *  own doc comment. Constructed once, alongside every other field, in
	 *  this constructor; its methods delegate back into this same session via
	 *  the `MailboxSession.runSearch`/`.runStore`/`.runCopyOrMove` statics
	 *  (same "static may reach private members" access-widening trick this
	 *  file already documents for `markClosed`/`applyExists`/etc., since
	 *  `SeqFacet` is declared in this module but is not itself a
	 *  `MailboxSession`). */
	public readonly seq: SequenceFacet;

	constructor(name: string, snapshot: SelectResult, driver: MailboxSessionDriver) {
		super();
		this.name = name;
		this.readOnly = snapshot.readOnly;
		this._exists = snapshot.exists;
		this._recent = snapshot.recent;
		this._flags = new Set(snapshot.flags);
		this._permanentFlags =
			snapshot.permanentFlags === null ? null : new Set(snapshot.permanentFlags);
		this._uidValidity = snapshot.uidValidity;
		this._uidNext = snapshot.uidNext;
		this._uidNotSticky = snapshot.uidNotSticky;
		this._highestModSeq = snapshot.noModSeq ? null : snapshot.highestModSeq;
		this._mailboxId = snapshot.mailboxId;
		this.driver = driver;
		this.seq = new SeqFacet(this);
		// ST6 fix (M4-phase-boundary review, spec §5b amendment): NO timed
		// fallback flush. A prior version scheduled a `setImmediate()` fallback
		// here for the caller that never attaches a `vanished`/`flags`
		// listener at all -- but `setImmediate` fires after exactly one
		// macrotask turn, and an ORDINARY caller doing ordinary awaited work
		// between `await select()` and attaching a listener (any work
		// spanning more than one macrotask -- not a contrived adversarial
		// case) would already have missed that deadline, flushing the buffer
		// to ZERO listeners and silently dropping the very
		// VANISHED/flag-carrying-FETCH data this buffering exists to
		// protect. Removing the timed fallback entirely is STRICTLY
		// STRONGER: the buffer now waits for either the first listener
		// attach (`maybeTriggerResyncFlush()`'s own microtask-deferred flush,
		// unchanged, below) or this session closing (`markClosed()` discards
		// it, see that method's own comment) -- a caller that never attaches
		// and never closes the session simply never receives the replay
		// (the buffer is small, bounded by one SELECT's resync payload, and
		// is freed the moment the session closes either way).
		// ST6 fix (M4-phase-boundary review, spec §5b amendment): NO timed
		// fallback flush. A prior version scheduled a `setImmediate()` fallback
		// here for the caller that never attaches a `vanished`/`flags`
		// listener at all -- but `setImmediate` fires after exactly one
		// macrotask turn, and an ORDINARY caller doing ordinary awaited work
		// between `await select()` and attaching a listener (any work
		// spanning more than one macrotask -- not a contrived adversarial
		// case) would already have missed that deadline, flushing the buffer
		// to ZERO listeners and silently dropping the very
		// VANISHED/flag-carrying-FETCH data this buffering exists to
		// protect. Removing the timed fallback entirely is STRICTLY
		// STRONGER: the buffer now waits for either the first listener
		// attach (`maybeTriggerResyncFlush()`'s own microtask-deferred flush,
		// unchanged, below) or this session closing (`markClosed()` discards
		// it, see that method's own comment) -- a caller that never attaches
		// and never closes the session simply never receives the replay
		// (the buffer is small, bounded by one SELECT's resync payload, and
		// is freed the moment the session closes either way).
		this._resyncBuffer = snapshot.resync.length > 0 ? [...snapshot.resync] : null;
	}

	/**
	 * Called from the `on`/`once`/`addListener` overrides below on EVERY
	 * attach of a resync-bearing event name (`RESYNC_TRIGGER_EVENTS`) -- not
	 * itself the flush, but the trigger that SCHEDULES one, deferred by
	 * exactly one microtask turn. That one-turn defer (rather than flushing
	 * synchronously, inline with the attach) is deliberate: a caller that
	 * attaches SEVERAL resync-relevant listeners back-to-back, synchronously,
	 * in the same tick --
	 *   ```
	 *   const session = await client.select(...);
	 *   session.on("vanished", onVanished);
	 *   session.on("flags", onFlags);
	 *   ```
	 * -- must have BOTH registered before either one receives a replayed
	 * event; flushing on the FIRST attach synchronously would emit `flags`
	 * events to zero listeners (since `onFlags` hasn't been registered yet at
	 * that point), silently dropping them. Deferring to the next microtask
	 * turn lets the rest of the caller's own synchronous statements (any
	 * further `.on()` calls in the same block) run to completion first --
	 * JS never interleaves microtasks with currently-executing synchronous
	 * code -- so by the time the deferred flush actually runs, every
	 * same-tick listener is already attached.
	 */
	private maybeTriggerResyncFlush(event: keyof MailboxSessionEvents): void {
		if (
			this._resyncBuffer === null ||
			this._resyncFlushMicrotaskQueued ||
			!RESYNC_TRIGGER_EVENTS.has(event)
		) {
			return;
		}
		this._resyncFlushMicrotaskQueued = true;
		queueMicrotask(() => MailboxSession.flushResync(this));
	}

	// `tiny-typed-emitter`'s `TypedEmitter` IS Node's `EventEmitter` (just
	// retyped, `require("events").EventEmitter`) -- overriding `on`/`once`/
	// `addListener` here intercepts every attachment path this codebase (and
	// the eventual M4.3 `updates()` iterator, which attaches the same way)
	// actually uses. `prependListener`/`prependOnceListener` are deliberately
	// NOT overridden -- unused anywhere in this codebase today; a caller that
	// reaches for one of those two specifically to observe resync data would
	// not get the buffering guarantee, a documented, narrow limitation (see
	// this milestone's report).
	on<E extends keyof MailboxSessionEvents>(event: E, listener: MailboxSessionEvents[E]): this {
		super.on(event, listener);
		this.maybeTriggerResyncFlush(event);
		return this;
	}

	once<E extends keyof MailboxSessionEvents>(event: E, listener: MailboxSessionEvents[E]): this {
		super.once(event, listener);
		this.maybeTriggerResyncFlush(event);
		return this;
	}

	addListener<E extends keyof MailboxSessionEvents>(event: E, listener: MailboxSessionEvents[E]): this {
		super.addListener(event, listener);
		this.maybeTriggerResyncFlush(event);
		return this;
	}

	/** `true` once this session has been deselected (reselected, closed,
	 *  unselected, or the connection dropped) -- every method M3/M2.13 add
	 *  later rejects `StateError` once this flips. M2.2 itself adds no
	 *  methods that need that guard yet; the field exists now because the
	 *  snapshot-mutation lane (`ImapClient`) must stop writing into a
	 *  session's fields the instant it closes (see the static `apply*`
	 *  methods below, each of which is a guarded no-op once `closed`). */
	public get closed(): boolean {
		return this._closed;
	}

	public get exists(): number {
		return this._exists;
	}

	/** rev1 only -- `null` on a rev2 response set that omitted RECENT (spec
	 *  §5b), NOT the same as "zero recent messages". */
	public get recent(): number | null {
		return this._recent;
	}

	public get flags(): ReadonlySet<string> {
		return this._flags;
	}

	/** `null` = PERMANENTFLAGS was not announced (the literal wire truth) --
	 *  see `canCreateKeywords`'s doc comment for the RFC 3501/9051 §6.3.1
	 *  omission rule this deliberately does NOT paper over. */
	public get permanentFlags(): ReadonlySet<string> | null {
		return this._permanentFlags;
	}

	/**
	 * `"\*"` in PERMANENTFLAGS (spec §5b). Per RFC 3501/9051 §6.3.1, when the
	 * server OMITS the PERMANENTFLAGS response the client "should assume that
	 * all flags can be changed permanently" -- but that RFC sentence is about
	 * the flags ALREADY listed in the FLAGS response being settable, not
	 * about the separate `\*` capability (the ability to create BRAND NEW
	 * keywords not present in FLAGS at all). Nothing in the RFC's omission
	 * clause licenses assuming `\*` specifically, so this getter stays
	 * conservative: `false` whenever PERMANENTFLAGS was never announced
	 * (`permanentFlags === null`), exactly like the case where it WAS
	 * announced but didn't include `\*`. `permanentFlags` itself keeps the
	 * `null` "nothing announced" wire truth (documented on that field above,
	 * per the M2 plan's explicit call-out that this is "the one place the
	 * type and the RFC don't say the same English sentence") -- only THIS
	 * derived getter applies the narrower, `\*`-specific reading.
	 */
	public get canCreateKeywords(): boolean {
		return this._permanentFlags !== null && this._permanentFlags.has("\\*");
	}

	public get uidValidity(): number {
		return this._uidValidity;
	}

	public get uidNext(): number | null {
		return this._uidNext;
	}

	/** UIDNOTSTICKY (RFC 4315): UIDs assigned this session are not guaranteed
	 *  to persist across a re-SELECT. */
	public get uidNotSticky(): boolean {
		return this._uidNotSticky;
	}

	/** `null` = NOMODSEQ was announced, or the server said nothing about
	 *  mod-sequences at all (CONDSTORE inert until M4 either way). */
	public get highestModSeq(): bigint | null {
		return this._highestModSeq;
	}

	public get mailboxId(): string | null {
		return this._mailboxId;
	}

	// -- message operations (spec §5b, UID grain) ------------------------------

	/**
	 * SEARCH / UID SEARCH (spec §5.3/§5b; RFC 3501/9051 §6.4.4, RFC 4731
	 * ESEARCH, RFC 5182 SEARCHRES, RFC 9394 PARTIAL). UID grain (spec §6.2's
	 * settled default) — the wire verb is always `UID SEARCH`; see `seq`
	 * for the bare `SEARCH` (sequence-number grain) mirror. Every criteria
	 * key's capability gate (`SearchCriteria`'s extension fields) and this
	 * command's own `SearchOptions.return`/`.partial` gates are enforced by
	 * `SearchCommand`'s constructor, before any bytes are written (I-9) —
	 * this method contributes no additional protocol logic of its own (I-4),
	 * only the open-session precondition and the live capability probe.
	 *
	 * Rejects `StateError` (zero bytes written) if this session is already
	 * closed, same precondition as `close()`/`unselect()`.
	 */
	public async search(criteria: SearchCriteria, opts?: SearchOptions): Promise<SearchResult> {
		return MailboxSession.runSearch(this, criteria, opts, true);
	}

	// -- message ops: SORT/THREAD (spec §5.6/§5b, M4.9) -----------------------

	/**
	 * SORT / UID SORT (RFC 5256 §3 BASE.6.4.SORT; RFC 5957 SORT=DISPLAY). UID
	 * grain (spec §6.2's settled default) — the wire verb is always `UID
	 * SORT`; see `seq.sort()` for the bare `SORT` mirror. Reuses the same
	 * `SearchCriteria` compiler (M3) SEARCH itself uses for its trailing
	 * search-key argument (spec §5.3) — SORT/THREAD add only the leading
	 * sort-criteria/algorithm argument and a MANDATORY charset (unlike
	 * SEARCH's optional one, RFC 5256 §3), both handled by `SortCommand`.
	 * Returns the same `SearchResult` shape as `search()`: `uids` carries the
	 * server's SORTED order verbatim (never re-sorted or deduplicated by this
	 * library).
	 *
	 * Capability gates (`SORT`, plus `SORT=DISPLAY` for the two RFC 5957
	 * criteria) and value validation happen in `SortCommand`'s constructor,
	 * before any bytes are written (I-9) — this method contributes no
	 * additional protocol logic of its own (I-4).
	 *
	 * Rejects `StateError` (zero bytes written) if this session is already
	 * closed, same precondition every other method here enforces.
	 */
	public async sort(sort: SortKey[], criteria: SearchCriteria, opts?: SearchOptions): Promise<SearchResult> {
		return MailboxSession.runSort(this, sort, criteria, opts, true);
	}

	/**
	 * THREAD / UID THREAD (RFC 5256 §3 BASE.6.4.THREAD). UID grain (spec
	 * §6.2's settled default) — the wire verb is always `UID THREAD`; see
	 * `seq.thread()` for the bare `THREAD` mirror. `algorithm` must be one the
	 * server has advertised via its own `THREAD=<algorithm>` capability token
	 * (RFC5256-1-2) — `ThreadCommand`'s constructor enforces this, zero bytes
	 * written on refusal (I-9).
	 *
	 * Returns `ThreadNode[]` (spec §5b/§5.6 — see `ThreadNode`'s own doc
	 * comment, `commands/message/thread.ts`, for the M4.9 spec-gap resolution
	 * this shape settles): each delivered node carries `uid` (never `seq`,
	 * this grain), except the RFC's "missing-parent" orphan form, which
	 * carries neither.
	 *
	 * Rejects `StateError` (zero bytes written) if this session is already
	 * closed.
	 */
	public async thread(
		algorithm: ThreadAlgorithm,
		criteria: SearchCriteria,
		opts?: SearchOptions,
	): Promise<ThreadNode[]> {
		return MailboxSession.runThread(this, algorithm, criteria, opts, true);
	}

	// -- message ops: FETCH (spec §5.4/§5b, M3.5) ------------------------------

	/**
	 * FETCH / UID FETCH (spec §5.4/§5b; RFC 3501/9051 §6.4.5/§6.4.9). UID
	 * grain (spec §6.2's settled default) — the wire verb is always `UID
	 * FETCH`, and the UID data item is always implicit in the response
	 * regardless of whether `items.uid` was set (RFC9051-6.4.9-3) — see `seq`
	 * for the bare `FETCH` (sequence-number grain) mirror, where an explicit
	 * ask IS required to see `UID` in the response.
	 *
	 * Returns an async iterable (NOT a `Promise` of one — spec §5.4's own
	 * signature): iterating it is what actually submits the command and
	 * starts consuming responses (`MailboxSession.runFetch()`/`driveFetch()`
	 * below build this lazily), so constructing the iterable performs no I/O
	 * by itself. `FetchModifiers.changedSince` is CONDSTORE-gated
	 * (advertisement); `.vanished` (M4.6, RFC 7162 §3.2.6) additionally
	 * requires `changedSince` also being set (`RangeError` if not, enforced
	 * in `runFetch()`) AND the UID grain (`RangeError` on `seq.fetch()`) AND
	 * QRESYNC having been positively ENABLEd (`CapabilityError`, enforced in
	 * `FetchCommand`'s own constructor) -- all zero bytes written, I-9. Every
	 * other capability gate (`items.modSeq`/`.emailId`/etc.) also lives in
	 * `FetchCommand`'s own constructor.
	 *
	 * Rejects `StateError` (zero bytes written, thrown synchronously from
	 * this call, not from the returned iterable) if this session is already
	 * closed, same precondition every other method here enforces.
	 */
	public fetch(uids: SequenceInput, items: FetchRequest, opts?: FetchModifiers): AsyncIterable<FetchedMessage> {
		return MailboxSession.runFetch(this, uids, items, opts, "uid");
	}

	/**
	 * Single-UID convenience form of `fetch()` (spec §5b): `Promise<
	 * FetchedMessage | null>`, `null` on no match (a UID the server has
	 * nothing to say about — a legal, common outcome, e.g. a since-expunged
	 * UID), never a thrown error for that case. Implemented as "take the
	 * first (and, for a single-UID request, only) yielded message, then stop
	 * iterating" — the early `return` inside the `for await` loop invokes the
	 * SAME abandoned-iterator drain path `fetch()`'s own mandatory compliance
	 * coverage exercises (spec §5.4), so a multi-part response's live streams
	 * this caller never touched are destroyed rather than left dangling.
	 */
	public async fetchOne(
		uid: number,
		items: FetchRequest,
		opts?: FetchModifiers,
	): Promise<FetchedMessage | null> {
		return fetchOneOf(this.fetch(uid, items, opts));
	}

	// -- live updates: IDLE (spec §3.7/§5b, M4.1) ------------------------------

	/**
	 * IDLE (RFC 2177; folded into the base command set under IMAP4rev2 with
	 * no separate capability token, RFC 9051 §6.3.13) -- M4.1's explicit
	 * surface. Opens one IDLE session through a fresh `IdleController`
	 * (`src/client/idle-controller.ts`) and hands back an `IdleHandle` the
	 * caller uses to end it (`handle.done()`); the controller silently
	 * renews (`DONE` + immediate re-IDLE) every `timeouts.idleRenew` (default
	 * 28 minutes, under RFC 2177's 29-minute guidance) for as long as nothing
	 * else asks it to stop. A command submitted through ANY OTHER method on
	 * this client while this session is idling ends it automatically (spec
	 * §3.7: `DONE`, await tagged completion, run the queued command) --
	 * explicit mode does NOT re-enter IDLE afterward (only the managed
	 * `updates({idle:true})` loop, M4.3, does); a caller that wants to keep
	 * idling calls `idle()` again. See `IdleController`'s own doc comment for
	 * the full renewal/interruption design and the Shared design note 4
	 * queue-hook-vs-controller-mediated decision this implements.
	 *
	 * Capability gate (I-9, zero bytes written): `IDLE` under rev1, folded
	 * into `IMAP4rev2` under rev2 with no separate token -- same OR-check
	 * `unselect()` above uses for its own rev1-token-or-IMAP4rev2 dual.
	 *
	 * Rejects `StateError` (zero bytes written) if this session is already
	 * closed, same precondition every other method here enforces.
	 *
	 * ⚠️ **Do not mix `idle()` and `updates({idle:true})` (or another
	 * concurrent `idle()`) on the SAME session (ST5, M4-phase-boundary
	 * review).** Every explicit `IdleHandle` and every managed `updates()`
	 * loop drive the SAME underlying "a command submission ends the current
	 * isolated round" interrupt hook (spec §3.7) -- submitting through
	 * `updates({idle:true})`'s own driver, or calling `idle()` again, DONEs
	 * whatever ELSE is currently idling on this session out from under it,
	 * same as any other command would. This converges (no deadlock, no
	 * silent corruption) but is genuinely RFC 3501/9051 §3.7-by-design
	 * DONE-interleaving, not a bug: any submission on a connection currently
	 * idling ends that IDLE round. If you need concurrent live-update
	 * consumers on one session, use `updates()` (its shared, refcounted
	 * driver is exactly the mechanism built for that) rather than multiple
	 * independent `idle()` handles. Routing `idle()` itself through that
	 * same shared driver is an M5 carry-forward, not done in this milestone.
	 */
	public async idle(): Promise<IdleHandle> {
		this.assertOpen("idle");
		if (!this.driver.hasCapability("IDLE") && !this.driver.hasCapability("IMAP4rev2")) {
			throw new CapabilityError(
				"idle() requires the IDLE capability (RFC 2177 §3) or an " +
					"IMAP4rev2 server (RFC 9051 §6.3.13, which folds IDLE into the " +
					"base command set with no separate capability token) -- neither " +
					"of which the server has advertised",
				{ capability: "IDLE", rfc: "RFC2177" },
			);
		}
		const idleDriver: IdleControllerDriver = {
			run: (command) => this.driver.run(command),
			onQueuedBehindIsolated: (cb) => this.driver.onQueuedBehindIsolated(cb),
			idleRenewMs: () => this.driver.idleRenewMs(),
		};
		const controller = new IdleController(idleDriver);
		await controller.start();
		return { done: () => controller.done() };
	}

	/**
	 * `updates()` (spec §5b/§3.7, M4.3) — a thin, ergonomic
	 * `AsyncIterable<MailboxUpdate>` adapter over this session's own
	 * `MailboxSessionEvents` (`exists`/`expunge`/`vanished`/`flags` only —
	 * `uidValidityChanged`/`closed` are NOT part of the `MailboxUpdate` union,
	 * spec §5b's own listing). Two live-update strategies, chosen by
	 * `opts.idle`:
	 *
	 * - `idle: true` (the DEFAULT — bare `updates()` behaves exactly like
	 *   `updates({idle:true})`, per spec §3.7's own "`updates({idle: true})`
	 *   (managed)" phrasing paired with this method's `idle?` being entirely
	 *   optional): opens a MANAGED IDLE session (a fresh `IdleController`,
	 *   `managedReentry: true` — see that option's own doc comment) when the
	 *   server has the IDLE capability (rev1 token, or folded into
	 *   IMAP4rev2, same OR-check `idle()` above uses) — DONE + re-IDLE around
	 *   every externally-submitted command AND the renewal timer, spec §3.7
	 *   verbatim, entirely invisible to this iterator. No IDLE capability:
	 *   silently falls back to NOOP polling every `timeouts.
	 *   noopFallbackInterval` (default 30s) instead — untagged EXISTS/
	 *   EXPUNGE/FETCH/VANISHED riding back on those NOOP exchanges through
	 *   the ordinary router lane (`ImapClient.applyMailboxLiveUpdate`)
	 *   populate this same event stream regardless of which strategy is
	 *   active.
	 * - `idle: false`: NOOP-polls even when the server supports IDLE — an
	 *   explicit opt-out of the isolated-context machinery FOR THIS CALL.
	 *   ST5/ST2 amendment (M4-phase-boundary review): this is NOT an
	 *   absolute "always NOOP-polls" guarantee — if another concurrently-
	 *   active `updates()` iterator on the SAME session already won the
	 *   shared driver in `"idle"` mode, THIS call joins that existing
	 *   IDLE-backed driver instead of forcing a second, independent NOOP
	 *   timer (see the concurrent-iterator design note below: the shared
	 *   driver is first-iterator-wins, not decided per call). An
	 *   `{idle:false}` caller accepts "NOOP or better", and IDLE strictly
	 *   subsumes NOOP's observable guarantees, so silently joining an
	 *   already-active IDLE driver is never a correctness problem for it —
	 *   only the FIRST concurrent call (or joining an already-`"noop"`
	 *   driver) actually forces NOOP polling.
	 * - `idle: "require"`: like `true`, but a server WITHOUT the IDLE
	 *   capability makes this call throw `CapabilityError` (zero bytes
	 *   written, I-9) INSTEAD of silently degrading to NOOP polling — spec
	 *   §3.7's documented opt-out of the silent-fallback default. ST2 fix
	 *   (M4-phase-boundary review): the SAME `CapabilityError` also fires
	 *   when this call would otherwise JOIN an already-active `"noop"`-mode
	 *   shared driver (a concurrent `{idle:false}` call, or an earlier
	 *   `updates()` call that fell back to NOOP because the server lacked
	 *   IDLE, already won it) — silently joining would hand this caller a
	 *   NOOP-backed driver despite its explicit demand for IDLE, which
	 *   `"require"`'s whole point is to refuse rather than silently degrade.
	 *

	 * Subscription (and, per spec §5b, the QRESYNC resync-buffer flush it
	 * triggers via `on()`'s override below) happens LAZILY, on ITERATION
	 * START — the first `.next()` call on the returned iterator actually
	 * subscribes/acquires (`createUpdatesIterator()`'s `ensureStarted()`).
	 * Constructing (but never iterating) the value this method returns
	 * therefore performs no subscription, no IDLE/NOOP submission, and no
	 * premature resync flush.
	 *
	 * Deliberately NOT an async generator function (an earlier draft of this
	 * method was): `AsyncGenerator.prototype.return()` can only interrupt a
	 * generator that is currently suspended AT A `yield` — NOT one blocked
	 * inside an arbitrary internal `await` (verified empirically; see this
	 * milestone's report). A generator-based `driveUpdates()` whose main loop
	 * did `await new Promise(resolve => pendingResolve = resolve)` while
	 * waiting for the NEXT mailbox event would make `.return()` (and
	 * therefore a consumer's `for await` `break`) HANG FOREVER on a quiet
	 * mailbox with no event yet pending — exactly the abandoned-iterator
	 * hazard the M3 review's "break/return must clean up, never deadlock"
	 * lesson warns about. `createUpdatesIterator()` below instead implements
	 * `AsyncIterator<MailboxUpdate>` by hand: the promise a blocked `next()`
	 * call is waiting on is the SAME promise `return()`/`throw()` settle
	 * directly, so abandonment while blocked resolves immediately no matter
	 * how quiet the mailbox is.
	 *
	 * Cleanup (`break`/`return`/an uncaught `throw` inside a `for await`, or
	 * the session closing mid-iteration, see below): every event listener
	 * this iterator attached is removed, and the shared live-update driver
	 * this iterator was counted against (see the concurrency note below) is
	 * released — torn down for good once the LAST concurrently-active
	 * `updates()` iterator on this session stops. This iterator never leaves
	 * the session idling (or NOOP-polling) unmanaged after every consumer has
	 * walked away.
	 *
	 * CONCURRENT `updates()` ITERATORS on the same session (design note, not
	 * spelled out by spec §5b): every `MailboxUpdate` is BROADCAST — each
	 * concurrent iterator attaches its OWN listeners/queue and sees every
	 * event independently (never "first iterator steals the event",
	 * ordinary multi-listener `EventEmitter` semantics). The underlying live-
	 * update DRIVER (the managed `IdleController`, or the NOOP timer),
	 * though, is a single shared, REFCOUNTED resource per session — running
	 * two independent `IdleController`s against the same isolated IDLE
	 * context concurrently would ping-pong forever (each one's own
	 * `contextQueuedBehindIsolated` hook would treat the OTHER's very own
	 * re-submitted IDLE round as "a command queuing up behind ME" and DONE
	 * it, in an endless cycle — never actually settling into steady-state
	 * idling). The FIRST concurrently-active `updates({idle:...})` call's
	 * resolved mode (`"idle"` vs. `"noop"`) wins the shared driver for as
	 * long as ANY concurrent iterator remains active; a later concurrent
	 * call simply attaches as an additional listener (refcount bump) without
	 * starting a second, conflicting driver of its own, even if its OWN
	 * `opts.idle` would have resolved differently in isolation — a
	 * documented simplification, not a spec requirement.
	 *
	 * Mid-iteration session close (the `closed` event — `close()`/
	 * `unselect()`, reselect, or disconnect): ends the iterator GRACEFULLY
	 * (an ordinary generator `return`, no thrown error) rather than
	 * rejecting, on the judgment that a mailbox deselecting out from under a
	 * live `for await` loop is a normal async lifecycle event — not
	 * necessarily caused by, or even knowable in advance to, this iterator's
	 * own caller — so forcing a `try`/`catch` around routine mailbox closure
	 * would be needless ceremony for the common case. `session.closed`
	 * remains readable afterward for a caller that wants to distinguish
	 * "the session closed" from "I broke out of the loop myself" post hoc.
	 * (Every OTHER method on this class still rejects `StateError` once
	 * closed, per spec §5b — `updates()` ITSELF still throws synchronously,
	 * below, if called on an ALREADY-closed session, the same precondition
	 * `idle()`/`fetch()` enforce; only the MID-iteration case gets this
	 * softer graceful-end treatment, since no synchronous throw is available
	 * once a `for await` loop is already running.)
	 *
	 * ⚠️ **Do not mix `updates()` and an explicit `idle()` (or another
	 * session's worth of expectations about who "owns" idling) concurrently
	 * on the SAME session (ST5, M4-phase-boundary review).** Concurrent
	 * `updates()` iterators on their own ARE coordinated (the refcounted
	 * shared-driver design immediately above) -- the hazard is mixing
	 * `updates({idle:true})` with a SEPARATE explicit `idle()` call: any
	 * OTHER submission on this session (an ordinary command, another
	 * `idle()`, `updates()`'s own managed re-entry) DONEs whatever is
	 * currently idling out from under it, per spec §3.7's "a command
	 * submission ends the current isolated round" interrupt hook -- an
	 * explicit `IdleHandle` can be ended by any other submission, including
	 * one issued through a DIFFERENT `updates()`/`idle()` call on the same
	 * session. This converges (no deadlock, no silent corruption), but is
	 * genuinely RFC 3501/9051 §3.7-by-design DONE-interleaving, not a bug --
	 * routing `idle()` itself through this method's shared, refcounted
	 * driver (so both surfaces coordinate automatically) is an M5
	 * carry-forward, not done in this milestone.
	 */
	public updates(opts?: MailboxUpdatesOptions): AsyncIterable<MailboxUpdate> {
		this.assertOpen("updates");
		const hasIdleCap = this.driver.hasCapability("IDLE") || this.driver.hasCapability("IMAP4rev2");
		if (opts?.idle === "require" && !hasIdleCap) {
			throw new CapabilityError(
				'updates({idle:"require"}) requires the IDLE capability (RFC 2177 ' +
					"§3) or an IMAP4rev2 server (RFC 9051 §6.3.13, which folds IDLE " +
					"into the base command set with no separate capability token) -- " +
					'neither of which the server has advertised, and "require" opts ' +
					"out of this method's default silent NOOP-poll fallback (spec §3.7)",
				{ capability: "IDLE", rfc: "RFC2177" },
			);
		}
		const wantIdle = opts?.idle !== false; // default true (spec §3.7's own "updates({idle:true})" wording)
		const mode: LiveUpdatesMode = wantIdle && hasIdleCap ? "idle" : "noop";
		// ST2 (M4-phase-boundary review): threaded through to
		// `acquireLiveUpdatesDriver()` so it can refuse joining an existing
		// "noop"-mode shared driver when THIS call explicitly demanded IDLE.
		const requireIdle = opts?.idle === "require";
		return { [Symbol.asyncIterator]: () => createUpdatesIterator(this, mode, requireIdle) };
	}

	// -- deselection (spec §5b) -----------------------------------------------

	/**
	 * CLOSE (RFC 3501/9051 §6.4.2/§6.4.1) — silently expunges every message
	 * with the \Deleted flag set, THEN deselects: see `CloseCommand`'s doc
	 * comment for the "silent" half (no untagged EXPUNGE responses accompany
	 * it, in either revision). On the tagged OK: this session's `closed`
	 * flips `true` with reason `"closed"`, the owning client's `mailbox`
	 * pointer clears, and the client state drops `"selected"` ->
	 * `"authenticated"` — in that order (state/pointer first, `closed`
	 * flag+event second), matching `unselect()`'s ordering below.
	 *
	 * Rejects `StateError` (zero bytes written) if this session is already
	 * closed — re-calling `close()`/`unselect()` on a dead session is a
	 * caller bug, not a retryable condition. A tagged NO/BAD from the server
	 * propagates as the ordinary `ServerNoError`/`ServerBadError` and leaves
	 * this session completely untouched (still selected, still open).
	 */
	public async close(): Promise<void> {
		this.assertOpen("close");
		await this.driver.run(new CloseCommand());
		this.driver.deselect(this);
		MailboxSession.markClosed(this, "closed");
	}

	/**
	 * UNSELECT (RFC 3691, gated on the `UNSELECT` capability under rev1;
	 * base protocol under rev2 per RFC 9051 §6.4.2 — see `UnselectCommand`'s
	 * doc comment for the OR-capability gate). Performs the SAME deselect as
	 * `close()` above, EXCEPT no message is ever expunged — the entire
	 * reason RFC 3691 exists. Same tagged-OK choreography as `close()`
	 * (state/pointer, then `closed` flag+event), except the reason is
	 * `"unselected"`.
	 *
	 * The capability gate is enforced TWICE, both before any bytes are
	 * written (I-9): the explicit check here supplies an RFC-annotated
	 * `CapabilityError` (mirroring `ImapClient.create()`/`namespaces()`'s own
	 * two-layer gate), and `UnselectCommand` also declares
	 * `capability: ["UNSELECT", "IMAP4rev2"]`, so a caller reaching the
	 * command directly via the `client.run()` escape hatch is still caught.
	 *
	 * Rejects `StateError` (zero bytes written) if this session is already
	 * closed, same as `close()`.
	 */
	public async unselect(): Promise<void> {
		this.assertOpen("unselect");
		if (!this.driver.hasCapability("UNSELECT") && !this.driver.hasCapability("IMAP4rev2")) {
			throw new CapabilityError(
				"unselect() requires the UNSELECT capability (RFC 3691 §1) or an " +
					"IMAP4rev2 server (RFC 9051 §6.4.2, which folds UNSELECT into the " +
					"base command set with no separate capability token) -- neither " +
					"of which the server has advertised",
				{ capability: "UNSELECT", rfc: "RFC3691" },
			);
		}
		await this.driver.run(new UnselectCommand());
		this.driver.deselect(this);
		MailboxSession.markClosed(this, "unselected");
	}

	// -- message ops: STORE family (spec §5b, M3.6) ---------------------------
	// UID grain (settled default, proposal §6.2): `uids` are UIDs, the wire
	// command is `UID STORE`. `.seq`'s mirrors (`SeqFacet` below) call the
	// same `runStore` static with `kind: "seq"` instead, sending bare
	// `STORE` over sequence numbers. See `StoreCommand`'s doc comment
	// (src/commands/store.ts) for the silent-vs-non-silent design decision:
	// `opts.silent` defaults to `false`; the server's FETCH FLAGS echo (own or
	// external) flows through the ordinary `flags` event / `updates()` stream
	// either way, never through `StoreResult`.

	/** `+FLAGS` (RFC 3501/9051 §6.4.6/§6.4.9, spec §5b). Adds `flags` to every
	 *  message in `uids` without disturbing any flag not named. */
	public async addFlags(
		uids: SequenceInput,
		flags: Flag[],
		opts?: StoreModifiers,
	): Promise<StoreResult> {
		return MailboxSession.runStore(this, "uid", uids, "add", flags, opts);
	}

	/** `-FLAGS` (RFC 3501/9051 §6.4.6/§6.4.9, spec §5b). Removes `flags` from
	 *  every message in `uids` without disturbing any flag not named. */
	public async removeFlags(
		uids: SequenceInput,
		flags: Flag[],
		opts?: StoreModifiers,
	): Promise<StoreResult> {
		return MailboxSession.runStore(this, "uid", uids, "remove", flags, opts);
	}

	/** Bare `FLAGS` (RFC 3501/9051 §6.4.6/§6.4.9, spec §5b). Replaces every
	 *  message's flag set in `uids` with exactly `flags`. */
	public async setFlags(
		uids: SequenceInput,
		flags: Flag[],
		opts?: StoreModifiers,
	): Promise<StoreResult> {
		return MailboxSession.runStore(this, "uid", uids, "replace", flags, opts);
	}

	/** Shared STORE/UID STORE implementation behind `addFlags`/`removeFlags`/
	 *  `setFlags` and their `.seq` mirrors -- `kind` picks the wire verb
	 *  (`UID STORE` vs bare `STORE`) and stamps the `SequenceSet` accordingly
	 *  (`SequenceSet.withKind`, spec §5.1). A `static` for the same
	 *  facet-delegation reason as `runSearch` above (so `SeqFacet`, a
	 *  separate class in this module, can reach it). Rejects `StateError`
	 *  (zero bytes written) once this session is closed, same guard
	 *  `close()`/`unselect()` use. `opts.unchangedSince` is real as of M4.5
	 *  (RFC 7162 §3.1.3): gated HERE against `assertModSeqUsable()`'s
	 *  NOMODSEQ check (RFC7162-3.1.2.2-1) before `StoreCommand` is even
	 *  constructed, which separately gates plain CONDSTORE-advertisement
	 *  (RFC7162-3.1.1-1) in its own constructor. */
	static async runStore(
		session: MailboxSession,
		kind: "uid" | "seq",
		input: SequenceInput,
		operation: StoreOperation,
		flags: Flag[],
		opts?: StoreModifiers,
	): Promise<StoreResult> {
		const method =
			kind === "uid" ? "addFlags/removeFlags/setFlags" : "seq.addFlags/seq.removeFlags/seq.setFlags";
		session.assertOpen(method);
		// M5.15 (RFC 9586, RFC9586-3-2): the UIDONLY lockout, seq grain only --
		// see `assertUidOnlyInactive`'s own doc comment (incl. its polarity
		// inversion note).
		if (kind === "seq") {
			assertUidOnlyInactive(session.driver, `${method}()`);
		}
		if (opts?.unchangedSince !== undefined) {
			MailboxSession.assertModSeqUsable(session, `${method}()`);
		}
		const set = SequenceSet.from(input).withKind(kind);
		// P1 fix (M3-phase-boundary review): the "$" SEARCHRES gate (see
		// `assertSearchResSentinelAllowed()`'s own doc comment) applies here
		// too -- previously only `runFetch()` enforced it.
		assertSearchResSentinelAllowed(
			set,
			{ has: (cap) => session.driver.hasCapability(cap) },
			kind === "uid" ? "addFlags/removeFlags/setFlags()" : "seq.addFlags/seq.removeFlags/seq.setFlags()",
		);
		// M4.13 (RFC 5465 §5.2/§5.3): the '*'-suppression/MSN-prohibition gate
		// -- see `assertSequenceGrainSafeUnderNotify`'s own doc comment.
		assertSequenceGrainSafeUnderNotify(session.driver, set, kind, method);
		const probe: StoreCapabilityProbe = { has: (cap) => session.driver.hasCapability(cap) };
		return session.driver.run(new StoreCommand(kind === "uid", set, operation, flags, opts, probe));
	}

	// -- message ops: STORE +/-X-GM-LABELS (X-GM-EXT-1, spec §5b, M5.8) ------
	// Not folded into `addFlags`/`removeFlags` above (spec §5b names these as
	// their own methods) -- see `GmailLabelsStoreCommand`'s own doc comment
	// (src/commands/gmail-labels.ts) for why labels get a dedicated command
	// class rather than reusing `StoreCommand`'s `Flag[]`/`flagList()` path.

	/** `+X-GM-LABELS` (X-GM-EXT-1, not an RFC -- see
	 *  `test/compliance/catalog/ext/xgmext1.ts`, catalog id
	 *  X-GM-EXT-1-labels-6). Adds `labels` to every message in `uids` without
	 *  disturbing any label not named. Gated on the `X-GM-EXT-1` capability
	 *  (I-9): `CapabilityError`, zero bytes written, when the server hasn't
	 *  advertised it. */
	public async addGmailLabels(uids: SequenceInput, labels: string[]): Promise<void> {
		await MailboxSession.runGmailLabelsStore(this, "uid", uids, "add", labels);
	}

	/** `-X-GM-LABELS` (X-GM-EXT-1). Removes `labels` from every message in
	 *  `uids` without disturbing any label not named. Same capability gate as
	 *  `addGmailLabels()`. */
	public async removeGmailLabels(uids: SequenceInput, labels: string[]): Promise<void> {
		await MailboxSession.runGmailLabelsStore(this, "uid", uids, "remove", labels);
	}

	/**
	 * Shared STORE/UID STORE +/-X-GM-LABELS implementation behind
	 * `addGmailLabels`/`removeGmailLabels` and their `.seq` mirrors -- same
	 * static-widening/facet-delegation shape as `runStore` above. Gated on
	 * the `X-GM-EXT-1` capability (I-9) BEFORE `GmailLabelsStoreCommand` is
	 * even constructed -- the explicit, RFC-annotated (vendor-doc-annotated,
	 * here) precheck plus the command's own `capability = "X-GM-EXT-1"`
	 * declaration is the same two-layer defense-in-depth pattern
	 * `unselect()`/`move()`/`replace()` above all use. Rejects `StateError`
	 * (zero bytes written) once this session is closed, same guard every
	 * other STORE-family method uses. No `StoreModifiers`/`unchangedSince`
	 * parameter -- spec §5b declares neither method taking one, so there is
	 * no CONDSTORE surface to gate here the way `runStore` does.
	 */
	static async runGmailLabelsStore(
		session: MailboxSession,
		kind: "uid" | "seq",
		input: SequenceInput,
		operation: GmailLabelsOperation,
		labels: string[],
	): Promise<void> {
		const method =
			kind === "uid" ? "addGmailLabels/removeGmailLabels" : "seq.addGmailLabels/seq.removeGmailLabels";
		session.assertOpen(method);
		if (!session.driver.hasCapability("X-GM-EXT-1")) {
			throw new CapabilityError(
				`${method}() requires the X-GM-EXT-1 capability (Google's Gmail IMAP vendor ` +
					"extension, not an RFC) -- the server has not advertised support for " +
					"X-GM-LABELS",
				{ capability: "X-GM-EXT-1", rfc: "n/a" },
			);
		}
		const set = SequenceSet.from(input).withKind(kind);
		// Same "$" SEARCHRES gate every other sequence-set-accepting entry
		// point applies (see `assertSearchResSentinelAllowed()`'s own doc
		// comment).
		assertSearchResSentinelAllowed(
			set,
			{ has: (cap) => session.driver.hasCapability(cap) },
			method,
		);
		// M4.13 (RFC 5465 §5.2/§5.3): the '*'-suppression/MSN-prohibition gate
		// -- see `assertSequenceGrainSafeUnderNotify`'s own doc comment.
		assertSequenceGrainSafeUnderNotify(session.driver, set, kind, method);
		await session.driver.run(new GmailLabelsStoreCommand(kind === "uid", set, operation, labels));
	}

	// -- message ops: COPY/MOVE (spec §5b, M3.8) ------------------------------

	/**
	 * COPY / UID COPY (RFC 3501 §6.4.7 / RFC 9051 §6.4.7) -- M3.8. Copies
	 * `uids` into `dest`; the source mailbox is left untouched (contrast
	 * `move()` below). `dest` goes through the same `CommandWriter.mailbox()`
	 * mUTF-7/UTF-8 codec every other mailbox-name argument in this codebase
	 * uses (M2.1) -- `CopyCommand.write()` is where that actually happens,
	 * not here.
	 *
	 * Returns `CopyResult` (RFC 4315 UIDPLUS's `COPYUID`, spec §5.4/§5b) --
	 * every field stays `undefined`, never a thrown error, when the server
	 * lacks UIDPLUS.
	 *
	 * Rejects `StateError` (zero bytes written) if this session is already
	 * closed, same precondition every other method here enforces.
	 */
	public async copy(uids: SequenceInput, dest: string): Promise<CopyResult> {
		return MailboxSession.runCopyOrMove(this, uids, dest, "uid", false);
	}

	/**
	 * MOVE / UID MOVE (RFC 6851 §3 / RFC 9051 §6.4.8) -- M3.8. Native MOVE
	 * ONLY (spec §5b's own "native MOVE only, gated" callout): a server that
	 * hasn't advertised the `MOVE` capability (rev1) or folded it into base
	 * protocol via `IMAP4rev2` (RFC 9051 §6.4.8 absorbs MOVE into rev2 core
	 * with no separate token -- same OR-capability precedent as
	 * `unselect()`'s own UNSELECT-or-IMAP4rev2 gate) never sees a single byte
	 * of this command -- there is NO client-side COPY+STORE(\Deleted)+EXPUNGE
	 * emulation fallback. The capability gate is enforced TWICE, both before
	 * any bytes are written (I-9), same two-layer pattern `unselect()` above
	 * uses: the explicit, RFC-annotated check in `runCopyOrMove()` below, and
	 * `MoveCommand`'s own `capability = ["MOVE", "IMAP4rev2"]` declaration,
	 * so a caller reaching the command directly via the `client.run()`
	 * escape hatch is still caught.
	 *
	 * Returns `CopyResult` exactly like `copy()` above; see `MoveCommand`'s
	 * own doc comment for why its `COPYUID` capture (an untagged OK arriving
	 * BEFORE the EXPUNGE responses, RFC9051-6.4.8-1) needs different
	 * machinery than `copy()`'s tagged-only read, and for why this method
	 * performs no EXPUNGE bookkeeping itself (the existing untagged-EXPUNGE
	 * state-tracker lane in `ImapClient`, `applyMailboxLiveUpdate`, already
	 * applies it -- unconditionally of any command's `claims()` -- so doing
	 * it again here would double-decrement `exists`).
	 *
	 * Rejects `StateError` (zero bytes written) if this session is already
	 * closed.
	 */
	public async move(uids: SequenceInput, dest: string): Promise<CopyResult> {
		return MailboxSession.runCopyOrMove(this, uids, dest, "uid", true);
	}

	// -- message ops: REPLACE / UID REPLACE (spec §5b, M5.6, RFC 8508) -------

	/**
	 * UID REPLACE (RFC 8508 §3.3) -- M5.6. Atomically (RFC8508-3.2-2) appends
	 * `msg` to `mailbox` and removes the message identified by `uid` from
	 * THIS selected mailbox -- see `ReplaceCommand`'s own doc comment
	 * (`commands/replace.ts`) for the full wire-form/response-shape/
	 * queueMode rationale; this method's job is only the capability gate and
	 * dispatch, mirroring `copy()`/`move()`'s own thin-delegation shape.
	 *
	 * `mailbox` need not be the currently selected mailbox (RFC8508-3.4-3
	 * permissively allows targeting a different one, e.g. replacing a
	 * `\Drafts` message with one landing in `\Sent`) -- this method performs
	 * no such equality check.
	 *
	 * Returns `AppendResult` (RFC 4315 UIDPLUS's `APPENDUID`, spec §5.4) --
	 * every field stays `undefined`, never a thrown error, when the server
	 * lacks UIDPLUS, same posture as `append()`'s own result.
	 *
	 * Gated on the `REPLACE` capability (RFC 8508 §3.1, I-9): `CapabilityError`,
	 * zero bytes written, when absent -- `ReplaceCommand`'s own `capability =
	 * "REPLACE"` declaration is the defense-in-depth backstop for a caller
	 * reaching the command directly via the `client.run()` escape hatch, same
	 * two-layer pattern `move()` above established.
	 *
	 * Rejects `StateError` (zero bytes written) if this session is already
	 * closed, same precondition every other method here enforces -- and,
	 * per RFC8508-3.5-1/-3.5-2, REPLACE/UID REPLACE are selected-state-only
	 * to begin with (`ReplaceCommand.states = ["selected"]`), so there is no
	 * authenticated-state form to fall back to the way plain `append()` has.
	 */
	public async replace(
		uid: number,
		mailbox: string,
		msg: AppendSource,
		opts?: AppendOptions,
	): Promise<AppendResult> {
		return MailboxSession.runReplace(this, uid, mailbox, msg, opts, "uid");
	}

	/**
	 * Shared REPLACE/UID REPLACE dispatch for both `replace()` above (UID
	 * grain) and `SeqFacet.replace()` below (sequence-number grain) -- same
	 * static-widening reason as `runCopyOrMove`/`runExpunge` (a `SeqFacet`
	 * instance, a separate class in this same file, cannot reach a real
	 * `private` member of `MailboxSession`, so this static is the minimal
	 * seam letting it reuse the exact same precondition/capability/dispatch
	 * logic). `label` only affects the `StateError`/`CapabilityError`
	 * message text.
	 */
	static async runReplace(
		session: MailboxSession,
		input: number,
		mailbox: string,
		msg: AppendSource,
		opts: AppendOptions | undefined,
		kind: "uid" | "seq",
	): Promise<AppendResult> {
		const label = kind === "uid" ? "replace" : "seq.replace";
		session.assertOpen(label);
		// M5.15 (RFC 9586, RFC9586-3-2): the UIDONLY lockout, seq grain only,
		// checked BEFORE the REPLACE capability gate (the mode-level refusal is
		// the more fundamental diagnostic) -- see `assertUidOnlyInactive`'s own
		// doc comment (incl. its polarity inversion note).
		if (kind === "seq") {
			assertUidOnlyInactive(session.driver, `${label}()`);
		}
		// RFC 8508 §3.1 (I-9): CapabilityError, zero bytes written, before
		// `ReplaceCommand` is even constructed -- same explicit-precheck-plus-
		// command's-own-declared-capability two-layer pattern `move()` above
		// established for MOVE/RFC 6851.
		if (!session.driver.hasCapability("REPLACE")) {
			throw new CapabilityError(
				`${label}() requires the REPLACE capability (RFC 8508 §3.1) -- the ` +
					"server has not advertised support for the REPLACE/UID REPLACE " +
					"extension",
				{ capability: "REPLACE", rfc: "RFC8508" },
			);
		}
		// Same small `AppendCapabilityProbe` adapter `ImapClient.append()`
		// builds inline (`client.ts`) -- `hasCapability()` is already the
		// ENABLE-aware `effectiveCapability()` probe (see
		// `MailboxSessionDriver.hasCapability`'s own doc comment);
		// `knownAppendLimit()` is forwarded through the dedicated driver seam
		// added for this task (`MailboxSessionDriver.knownAppendLimit`).
		const probe: AppendCapabilityProbe = {
			has: (cap) => session.driver.hasCapability(cap),
			knownAppendLimit: () => session.driver.knownAppendLimit(),
		};
		const command = new ReplaceCommand(input, mailbox, msg, opts, probe, kind === "uid");
		return session.driver.run(command);
	}

	// -- message ops: CONVERT / UID CONVERT (RFC 5259, M5.12) -----------------

	/**
	 * UID CONVERT (RFC 5259 §6) -- M5.12. Requests a server-side conversion
	 * of the named data item (`"TEXT"`, `"HEADER"`, `"BODYPARTSTRUCTURE"`,
	 * section-part-qualified `BODY[...]` forms, ...) for the messages in
	 * `uids`, to the destination MIME type named by `transformation` (or the
	 * server's own default conversion when `transformation` is `null`/has a
	 * `null` destination -- the NIL marker, RFC5259-6-2). See
	 * `ConvertCommand`'s own doc comment (`commands/convert.ts`) for the wire
	 * form, the caller-owned construction rules (CHARSET-REQUIRED for header
	 * conversions, NIL-only with header/MIME items), and this task's
	 * deliberately minimal result shape (`ConvertResult.converted` carries
	 * the raw CONVERTED response text, tolerance-level, I-6).
	 *
	 * Note (RFC5259-6-4): unlike FETCH, CONVERT never sets `\Seen` -- a
	 * caller wanting the converted message marked seen must follow up with
	 * its own `addFlags(uids, ["\\Seen"])`.
	 *
	 * Gated on the `CONVERT` capability (RFC 5259 §3.1, RFC5259-3.1-1, I-9):
	 * `CapabilityError`, zero bytes written, when absent -- `ConvertCommand`'s
	 * own `capability = "CONVERT"` declaration is the defense-in-depth
	 * backstop for a caller reaching the command directly via the
	 * `client.run()` escape hatch, same two-layer pattern `move()`/`replace()`
	 * above use.
	 *
	 * Rejects `StateError` (zero bytes written) if this session is already
	 * closed, same precondition every other method here enforces.
	 */
	public async convert(
		uids: SequenceInput,
		item: string,
		transformation: ConvertTransformation,
	): Promise<ConvertResult> {
		return MailboxSession.runConvert(this, uids, item, transformation, "uid");
	}

	/**
	 * Shared CONVERT/UID CONVERT dispatch for both `convert()` above (UID
	 * grain) and `SeqFacet.convert()` below (sequence-number grain) -- same
	 * static-widening reason as `runCopyOrMove`/`runReplace`. `label` only
	 * affects the `StateError`/`CapabilityError` message text.
	 */
	static async runConvert(
		session: MailboxSession,
		input: SequenceInput,
		item: string,
		transformation: ConvertTransformation,
		kind: "uid" | "seq",
	): Promise<ConvertResult> {
		const label = kind === "uid" ? "convert" : "seq.convert";
		session.assertOpen(label);
		// RFC 5259 §3.1 (I-9): CapabilityError, zero bytes written, before
		// `ConvertCommand` is even constructed -- same explicit-precheck-plus-
		// command's-own-declared-capability two-layer pattern `move()`/
		// `replace()` above established.
		if (!session.driver.hasCapability("CONVERT")) {
			throw new CapabilityError(
				`${label}() requires the CONVERT capability (RFC 5259 §3.1) -- the ` +
					"server has not advertised support for the CONVERT extension",
				{ capability: "CONVERT", rfc: "RFC5259" },
			);
		}
		const set = SequenceSet.from(input).withKind(kind);
		// Same sequence-set argument gates every other message-op applies:
		// the "$" SEARCHRES sentinel needs its capability (RFC 5182), and the
		// seq grain is subject to NOTIFY's '*'-suppression/MSN prohibitions
		// (RFC 5465 §5.2/§5.3) exactly as FETCH/STORE/COPY are -- CONVERT's
		// sequence-set argument has the identical MSN-instability hazard.
		assertSearchResSentinelAllowed(
			set,
			{ has: (cap) => session.driver.hasCapability(cap) },
			`${label}()`,
		);
		assertSequenceGrainSafeUnderNotify(session.driver, set, kind, label);
		return session.driver.run(new ConvertCommand(kind === "uid", set, item, transformation));
	}

	// -- message ops: EXPUNGE (spec §5b, M3.9) --------------------------------

	/**
	 * EXPUNGE / UID EXPUNGE (RFC 3501/9051 §6.4.3 / RFC 4315 §2.1) -- M3.9.
	 * `uids` UNDEFINED (the no-arg call, `expunge()`) issues bare `EXPUNGE`:
	 * every message in this mailbox carrying `\Deleted` is permanently
	 * removed. `uids` GIVEN issues `UID EXPUNGE <uids>` (UIDPLUS, RFC 4315,
	 * gated on the `UIDPLUS` capability -- `CapabilityError`, zero bytes
	 * written, I-9, when absent -- NEVER a client-side emulation via bare
	 * EXPUNGE, per spec §5b's explicit native-command-only posture already
	 * established for `move()` above): only messages inside `uids` that ALSO
	 * carry `\Deleted` are removed, leaving every other `\Deleted` message in
	 * the mailbox untouched.
	 *
	 * Resolves the sequence numbers of every message this command's own
	 * untagged EXPUNGE responses reported, in wire arrival order --
	 * `ExpungeCommand`'s own doc comment (src/commands/expunge.ts) works
	 * through why this is safe to read directly off the claimed responses
	 * without this method (or the command) ALSO touching `exists`/emitting
	 * `MailboxSessionEvents.expunge` itself: `ImapClient`'s
	 * `applyMailboxLiveUpdate` state-tracker lane is the ONE place
	 * `MailboxSession.applyExpunge` is called, unconditionally of any
	 * command's `claims()`, so the returned array and the `expunge` event
	 * stream are always two views of the identical underlying wire data,
	 * never a double-counted one.
	 *
	 * Rejects `StateError` (zero bytes written) if this session is already
	 * closed, same precondition every other method here enforces.
	 */
	public async expunge(uids?: SequenceInput): Promise<number[]> {
		return MailboxSession.runExpunge(this, uids, "expunge");
	}

	/**
	 * Shared EXPUNGE/UID EXPUNGE dispatch for both `expunge()` above and
	 * `SeqFacet.expunge()` below (same static-widening reason as
	 * `runSearch`/`runStore`/`runCopyOrMove`). `input === undefined` always
	 * issues bare EXPUNGE regardless of which entry point called this --
	 * this is exactly how `seq.expunge()` ends up "always the bare form"
	 * (`SequenceFacet.expunge()`'s own doc comment): it simply calls this
	 * static with `undefined`, the very same argument-less path
	 * `MailboxSession.expunge()` takes when its own caller passes nothing.
	 * `label` only affects the `StateError`/`CapabilityError` message text.
	 */
	static async runExpunge(
		session: MailboxSession,
		input: SequenceInput | undefined,
		label: "expunge" | "seq.expunge",
	): Promise<number[]> {
		session.assertOpen(label);
		// M5.15 (RFC 9586, spec §5b): the UIDONLY lockout covers seq.expunge()
		// too -- spec §5b's rule is "EVERY method [on the seq facet] rejects",
		// facet-wide, even though bare EXPUNGE itself carries no
		// sequence-number argument for RFC9586-3-2 to wire-prohibit: the
		// method's RESULT (the sequence numbers reported by classic untagged
		// EXPUNGE responses) cannot exist on a UIDONLY connection (the server
		// reports expunges via VANISHED, by UID, RFC9586-3-4), so resolving
		// `[]` while messages genuinely vanished would be silently wrong.
		// `MailboxSession.expunge()` (no-arg, UID-grain surface) intentionally
		// stays usable -- same wire form, but its caller gets the vanished
		// UIDs through the `vanished` event/updates lane. See
		// `assertUidOnlyInactive`'s own doc comment (incl. its polarity
		// inversion note).
		if (label === "seq.expunge") {
			assertUidOnlyInactive(session.driver, `${label}()`);
		}
		if (input === undefined) {
			return session.driver.run(new ExpungeCommand(undefined, false));
		}
		if (!session.driver.hasCapability("UIDPLUS")) {
			throw new CapabilityError(
				`${label}(uids) requires the UIDPLUS capability (RFC 4315 §2.1) for ` +
					"UID EXPUNGE -- which the server has not advertised; call " +
					`${label}() with no argument for the capability-free bare EXPUNGE ` +
					"form instead",
				{ capability: "UIDPLUS", rfc: "RFC4315" },
			);
		}
		const set = SequenceSet.from(input).withKind("uid");
		// P1 fix (M3-phase-boundary review): the "$" SEARCHRES gate applies to
		// UID EXPUNGE's argument too (see `assertSearchResSentinelAllowed()`'s
		// own doc comment).
		assertSearchResSentinelAllowed(
			set,
			{ has: (cap) => session.driver.hasCapability(cap) },
			`${label}(uids)`,
		);
		return session.driver.run(new ExpungeCommand(set, true));
	}

	/**
	 * Package-private (same static-widening convention as `applyExists`/
	 * `applyExpunge`/etc. below, and `commands/base.ts`'s own
	 * `Command.assignTag`) -- shared COPY/MOVE dispatch for both the UID-grain
	 * `copy()`/`move()` above and `SeqFacet`'s sequence-number-grain
	 * mirrors (`SeqFacet` is a genuinely separate class in this same
	 * file, so it cannot reach a real `private` member of `MailboxSession`;
	 * this static is the minimal seam that lets it reuse the exact same
	 * precondition/capability/dispatch logic rather than duplicating it --
	 * `async` so the guards reject rather than throw, like `runSearch`/
	 * `runStore` above). Nothing outside this file should call it.
	 */
	static async runCopyOrMove(
		session: MailboxSession,
		input: SequenceInput,
		dest: string,
		kind: "uid" | "seq",
		isMove: boolean,
	): Promise<CopyResult> {
		const label = isMove
			? kind === "uid"
				? "move"
				: "seq.move"
			: kind === "uid"
				? "copy"
				: "seq.copy";
		session.assertOpen(label);
		// M5.15 (RFC 9586, RFC9586-3-2): the UIDONLY lockout, seq grain only,
		// before the MOVE capability gate below (mode-level refusal first) --
		// see `assertUidOnlyInactive`'s own doc comment (incl. its polarity
		// inversion note).
		if (kind === "seq") {
			assertUidOnlyInactive(session.driver, `${label}()`);
		}
		if (
			isMove &&
			!session.driver.hasCapability("MOVE") &&
			!session.driver.hasCapability("IMAP4rev2")
		) {
			throw new CapabilityError(
				`${label}() requires the MOVE capability (RFC 6851 §3) or an ` +
					"IMAP4rev2 server (RFC 9051 §6.4.8, which folds MOVE into the base " +
					"command set with no separate capability token) -- native MOVE " +
					"only, this library never emulates it client-side via " +
					"COPY+STORE(\\Deleted)+EXPUNGE -- neither of which the server has " +
					"advertised",
				{ capability: "MOVE", rfc: "RFC6851" },
			);
		}
		const set = SequenceSet.from(input).withKind(kind);
		// P1 fix (M3-phase-boundary review): the "$" SEARCHRES gate applies to
		// COPY/MOVE's sequence-set argument too (see
		// `assertSearchResSentinelAllowed()`'s own doc comment).
		assertSearchResSentinelAllowed(
			set,
			{ has: (cap) => session.driver.hasCapability(cap) },
			`${label}()`,
		);
		// M4.13 (RFC 5465 §5.2/§5.3): the '*'-suppression/MSN-prohibition gate
		// -- see `assertSequenceGrainSafeUnderNotify`'s own doc comment.
		assertSequenceGrainSafeUnderNotify(session.driver, set, kind, `${label}()`);
		const command = isMove
			? new MoveCommand(set, dest, kind === "uid")
			: new CopyCommand(set, dest, kind === "uid");
		return session.driver.run(command);
	}

	/** Shared precondition for every message-op/deselection method (spec §5b:
	 *  "`closed`... all methods reject `StateError`"). Reads the live client
	 *  state through the driver seam rather than guessing, so the error's
	 *  `state` field is accurate even if this session outlives the client
	 *  dropping further (e.g. logout) after having already been deselected.
	 *  `method` is a free-form label (not a closed union) so each new verb
	 *  task can pass its own method name without editing this signature --
	 *  additive, merge-friendly, same spirit as `SequenceFacet` growing one
	 *  method per task. */
	private assertOpen(method: string): void {
		if (this._closed) {
			throw new StateError(
				`MailboxSession.${method}(): this session for "${this.name}" is ` +
					"already closed -- every method rejects once a session has been " +
					"deselected (spec §5b)",
				{ state: this.driver.currentState(), required: ["selected"] },
			);
		}
	}

	/**
	 * RFC7162-3.1.2.2-1: "MUST NOT use CONDSTORE modifiers on a NOMODSEQ
	 * mailbox." Shared by `runFetch()`/`runStore()`/`runSearch()` — every
	 * entry point that can emit a CONDSTORE-shaped modifier (`CHANGEDSINCE`,
	 * `UNCHANGEDSINCE`, the SEARCH `MODSEQ` criterion) calls this first.
	 *
	 * `highestModSeq === null` is the one signal `MailboxSession` already
	 * carries for this (§5b: "null = NOMODSEQ or no CONDSTORE"). Once
	 * CONDSTORE is advertised AT ALL, RFC 7162 §3.1.2 requires the server to
	 * send exactly one of HIGHESTMODSEQ/NOMODSEQ on every successful
	 * SELECT/EXAMINE regardless of whether the client asked for the
	 * `(CONDSTORE)` select parameter — so for a real server, `null` here
	 * unambiguously means "this mailbox reported NOMODSEQ" whenever CONDSTORE
	 * is available at all; the "CONDSTORE isn't advertised at all" case
	 * collapses to the same `null` value, but is already caught earlier (and
	 * with a more specific message) by each command's own CONDSTORE-
	 * advertisement gate (`FetchCommand`/`StoreCommand`/`SearchCommand`'s own
	 * `assertCap`-style checks) — this guard only ever needs to fire for the
	 * NOMODSEQ case in practice, but is safe (same outcome either way) if a
	 * caller somehow reaches it first.
	 *
	 * `CapabilityError` (not `StateError`): this is a capability-shaped
	 * refusal ("CONDSTORE modifiers aren't usable against THIS mailbox right
	 * now"), the same error type every other CONDSTORE gate in this codebase
	 * uses — even though the underlying fact (NOMODSEQ) is per-mailbox
	 * rather than per-connection, `StateError`'s own shape (`state`/
	 * `required: ClientState[]`) has no field for "this mailbox lacks
	 * mod-sequences", so it would be a structural mismatch here.
	 */
	private static assertModSeqUsable(session: MailboxSession, method: string): void {
		if (session._highestModSeq === null) {
			throw new CapabilityError(
				`${method}: CONDSTORE modifiers cannot be used while the selected ` +
					`mailbox "${session.name}" has no mod-sequence support (NOMODSEQ, ` +
					"RFC 7162 §3.1.2.2) -- select a mailbox that supports mod-sequences " +
					"to use this option",
				{ capability: "CONDSTORE", rfc: "RFC7162" },
			);
		}
	}

	/**
	 * Shared SEARCH/UID SEARCH implementation for both `search()` (UID grain)
	 * and `seq.search()` (sequence-number grain) — a `static` (rather than a
	 * private instance method) so `SeqFacet` below, a separate class in this
	 * module, can reach it without this being a public instance method on
	 * `MailboxSession` itself (same access-widening trick as `markClosed`/
	 * `applyExists`/etc. below, applied for a facet-delegation reason rather
	 * than a cross-module one). `criteria.modSeq` (RFC 7162 §3.1.5) is gated
	 * HERE against `assertModSeqUsable()`'s NOMODSEQ check
	 * (RFC7162-3.1.2.2-1) before `SearchCommand` is even constructed, which
	 * separately gates plain CONDSTORE-advertisement (RFC7162-3.1.1-1) inside
	 * the criteria compiler (`search-criteria.ts`).
	 */
	static async runSearch(
		session: MailboxSession,
		criteria: SearchCriteria,
		opts: SearchOptions | undefined,
		uid: boolean,
	): Promise<SearchResult> {
		const method = uid ? "search" : "seq.search";
		session.assertOpen(method);
		// M5.15 (RFC 9586, RFC9586-3-2): the UIDONLY lockout, seq grain only
		// (bare SEARCH both accepts MSN arguments and RETURNS MSNs; UID SEARCH
		// stays legal) -- see `assertUidOnlyInactive`'s own doc comment (incl.
		// its polarity inversion note).
		if (!uid) {
			assertUidOnlyInactive(session.driver, `${method}()`);
		}
		if (criteriaHasModSeq(criteria)) {
			MailboxSession.assertModSeqUsable(session, `${method}()`);
		}
		// CF3+SF1 (M4-phase-boundary review): a bare SearchCriteria.seq key is
		// exactly as MSN-fragile as a FETCH/STORE/COPY sequence-set argument --
		// see `assertSearchCriteriaSeqSafeUnderNotify`'s own doc comment.
		assertSearchCriteriaSeqSafeUnderNotify(session.driver, criteria, `${method}()`);
		const probe = { has: (cap: string) => session.driver.hasCapability(cap) };
		const command = new SearchCommand(criteria, opts, probe, uid);
		// S3 fix: serialize against any OTHER search()/seq.search() currently
		// in flight on this session (same "search" family -- see
		// `familyChains`'s own doc comment); a fetch/store/etc. concurrently
		// in flight is untouched, `chainFamily` only ever looks at this one
		// family's own slot.
		return MailboxSession.chainFamily(session, "search", () => session.driver.run(command));
	}

	/**
	 * Shared SORT/UID SORT implementation for both `sort()` (UID grain) and
	 * `seq.sort()` (sequence-number grain) — same static-widening/facet-
	 * delegation reason as `runSearch` above. The untagged `* SORT` response
	 * carries no per-command correlator either (same ambiguity `runSearch`'s
	 * own doc comment describes for classic `* SEARCH`), so this serializes
	 * DISPATCH against any other `sort()`/`seq.sort()` in flight on THIS
	 * session via its own `"sort"` `chainFamily` slot — distinct from
	 * `"search"`'s (a concurrently in-flight `search()` is unaffected: the two
	 * response types, `SEARCH` and `SORT`, are never confusable with each
	 * other on the wire either).
	 */
	static async runSort(
		session: MailboxSession,
		sortKeys: SortKey[],
		criteria: SearchCriteria,
		opts: SearchOptions | undefined,
		uid: boolean,
	): Promise<SearchResult> {
		const method = uid ? "sort" : "seq.sort";
		session.assertOpen(method);
		// M5.15 (RFC 9586, RFC9586-3-2): the UIDONLY lockout, seq grain only --
		// see `assertUidOnlyInactive`'s own doc comment.
		if (!uid) {
			assertUidOnlyInactive(session.driver, `${method}()`);
		}
		// CF3+SF1 (M4-phase-boundary review): `runSearch` already applied both
		// of these guards; `runSort`/`runThread` previously applied neither,
		// even though SORT/THREAD share the exact same `SearchCriteria`
		// compiler (and therefore the exact same `modSeq`/`seq` criteria
		// hazards) SEARCH does.
		if (criteriaHasModSeq(criteria)) {
			MailboxSession.assertModSeqUsable(session, `${method}()`);
		}
		assertSearchCriteriaSeqSafeUnderNotify(session.driver, criteria, `${method}()`);
		const probe = { has: (cap: string) => session.driver.hasCapability(cap) };
		const command = new SortCommand(sortKeys, criteria, opts, probe, uid);
		return MailboxSession.chainFamily(session, "sort", () => session.driver.run(command));
	}

	/**
	 * Shared THREAD/UID THREAD implementation for both `thread()` (UID grain)
	 * and `seq.thread()` (sequence-number grain) — same rationale as
	 * `runSort` above, its own independent `"thread"` `chainFamily` slot.
	 */
	static async runThread(
		session: MailboxSession,
		algorithm: ThreadAlgorithm,
		criteria: SearchCriteria,
		opts: SearchOptions | undefined,
		uid: boolean,
	): Promise<ThreadNode[]> {
		const method = uid ? "thread" : "seq.thread";
		session.assertOpen(method);
		// M5.15 (RFC 9586, RFC9586-3-2): the UIDONLY lockout, seq grain only --
		// see `assertUidOnlyInactive`'s own doc comment.
		if (!uid) {
			assertUidOnlyInactive(session.driver, `${method}()`);
		}
		// CF3+SF1 (M4-phase-boundary review): see `runSort`'s own comment above.
		if (criteriaHasModSeq(criteria)) {
			MailboxSession.assertModSeqUsable(session, `${method}()`);
		}
		assertSearchCriteriaSeqSafeUnderNotify(session.driver, criteria, `${method}()`);
		const probe = { has: (cap: string) => session.driver.hasCapability(cap) };
		const command = new ThreadCommand(algorithm, criteria, opts, probe, uid);
		return MailboxSession.chainFamily(session, "thread", () => session.driver.run(command));
	}

	/**
	 * S3 fix (M3-phase-boundary review): serializes DISPATCH of same-`family`
	 * commands on `session` -- see `familyChains`'s own doc comment for
	 * exactly what "in flight" means here and why gating on the prior
	 * command's own completion (not the caller's consumption pace) is the
	 * correct and sufficient fix for RFC3501-5.5's ambiguity duty. The very
	 * first call for a family (nothing in `familyChains` yet) dispatches
	 * IMMEDIATELY/synchronously -- `runFetch()`'s own doc comment's "kicks off
	 * dispatch by the time this call returns" claim stays true for the
	 * overwhelmingly common single-in-flight case; only a genuinely
	 * overlapping second (or later) same-family call is deferred behind the
	 * one ahead of it. `dispatch`'s own rejection (a tagged NO/BAD, or a
	 * teardown) is exactly what THIS call's returned promise carries --
	 * swallowed only in the copy stashed back into `familyChains` for the
	 * NEXT same-family caller to wait on, so one command's failure can never
	 * leak into an unrelated sibling's result.
	 */
	private static chainFamily<T>(
		session: MailboxSession,
		family: string,
		dispatch: () => Promise<T>,
	): Promise<T> {
		const prior = session.familyChains.get(family);
		const started = prior === undefined ? dispatch() : prior.then(dispatch, dispatch);
		session.familyChains.set(
			family,
			started.then(
				() => undefined,
				() => undefined,
			),
		);
		return started;
	}

	/**
	 * Shared FETCH/UID FETCH implementation for both `fetch()` (UID grain)
	 * and `seq.fetch()` (sequence-number grain) — a `static` for the same
	 * facet-delegation reason as `runSearch`/`runStore`/`runCopyOrMove`
	 * above. `FetchModifiers.changedSince` is real as of M4.5 (RFC 7162
	 * §3.1.4.1) — gated HERE against `assertModSeqUsable()`'s NOMODSEQ check
	 * (RFC7162-3.1.2.2-1) before `FetchCommand` is even constructed, which
	 * separately gates plain CONDSTORE-advertisement (RFC7162-3.1.1-1).
	 * `FetchModifiers.vanished` is real as of M4.6 (RFC 7162 §3.2.6): two
	 * STRUCTURAL prerequisites (independent of any capability) are enforced
	 * HERE, synchronously, before `FetchCommand` is even constructed --
	 * `vanished` requires `changedSince` also being set (§3.2.6's "MUST only
	 * be specified together with the CHANGEDSINCE ... modifier",
	 * RFC7162-3.2.6-2 -- the public `FetchModifiers` union type already makes
	 * this a compile-time error for a caller going through the typed surface;
	 * this is the runtime backstop for one that doesn't, e.g. a driver/JS
	 * caller), and `vanished` is only legal on UID FETCH, never plain FETCH
	 * (§3.2.6: "only allowed in the UID FETCH command", RFC7162-3.2.6-1).
	 * The actual QRESYNC-ENABLEd capability gate lives in `FetchCommand`'s own
	 * constructor (`caps.has("QRESYNC")`, mirroring `changedSince`'s
	 * CONDSTORE-advertisement gate living there too) -- `session.driver.
	 * hasCapability()` is `ImapClient.effectiveCapability()` (M4.6: now
	 * `_enabled`-aware for QRESYNC specifically), so that check is
	 * genuinely hard-ENABLE-gated, not merely advertisement-gated.
	 */
	static runFetch(
		session: MailboxSession,
		input: SequenceInput,
		items: FetchRequest,
		opts: FetchModifiers | undefined,
		kind: "uid" | "seq",
	): AsyncIterable<FetchedMessage> {
		const method = kind === "uid" ? "fetch" : "seq.fetch";
		session.assertOpen(method);
		// M5.15 (RFC 9586, RFC9586-3-2): the UIDONLY lockout, seq grain only --
		// thrown synchronously here (before the command exists, zero bytes,
		// same timing as `assertOpen` above and every other guard in this
		// method, rather than deferred to first iteration) -- see
		// `assertUidOnlyInactive`'s own doc comment (incl. its polarity
		// inversion note).
		if (kind === "seq") {
			assertUidOnlyInactive(session.driver, `${method}()`);
		}
		if (opts?.vanished) {
			if (kind !== "uid") {
				throw new RangeError(
					`${method}(): the VANISHED FETCH modifier is only allowed on UID ` +
						"FETCH (RFC 7162 §3.2.6) -- call fetch() (not seq.fetch()) if " +
						"you need it",
				);
			}
			if (opts.changedSince === undefined) {
				throw new RangeError(
					`${method}(): the VANISHED FETCH modifier must be specified together ` +
						"with `changedSince` (RFC 7162 §3.2.6) -- the server has no other " +
						"way to bound which expunges to report",
				);
			}
		}
		if (opts?.changedSince !== undefined) {
			MailboxSession.assertModSeqUsable(session, `${method}()`);
		}
		const set = SequenceSet.from(input).withKind(kind);
		// RFC 5182 §2.1's "$" SEARCHRES sentinel gate AT POINT OF USE (I-9):
		// `SequenceSet` itself deliberately leaves this "gated on capability
		// elsewhere" (its own doc comment) -- this is that "elsewhere". P1 fix
		// (M3-phase-boundary review): factored into the shared
		// `assertSearchResSentinelAllowed()` helper (`commands/search-
		// criteria.ts`) so every sequence-set-accepting entry point applies
		// the identical gate -- see that helper's own doc comment.
		assertSearchResSentinelAllowed(
			set,
			{ has: (cap) => session.driver.hasCapability(cap) },
			kind === "uid" ? "fetch()" : "seq.fetch()",
		);
		// M4.13 (RFC 5465 §5.2/§5.3): the '*'-suppression/MSN-prohibition gate
		// -- see `assertSequenceGrainSafeUnderNotify`'s own doc comment.
		assertSequenceGrainSafeUnderNotify(session.driver, set, kind, method);
		const probe: FetchCapabilityProbe = { has: (cap) => session.driver.hasCapability(cap) };
		const command = new FetchCommand(
			set,
			items,
			kind === "uid",
			session.driver.maxInlineSize(),
			probe,
			opts?.changedSince,
			opts?.vanished === true,
		);
		// Kicks off the actual submission/dispatch (write, wait-for-tagged,
		// settle, cleanup) in the background -- by the time this call returns
		// (synchronously, even though it's a Promise), `FetchCommand`'s
		// `onCollectorReady()` hook has ALREADY fired if the queue is running
		// (constructing the collector and registering the claimant happen
		// synchronously inside `executeCommand`, before its first `await`);
		// `driveFetch()` below awaits that hook internally regardless, so this
		// is correct even if the queue is held/not yet running. Never awaited
		// directly here -- errors (a tagged NO/BAD) surface through
		// `driveFetch()`'s own `await resultPromise` instead, once every
		// already-claimed message has been yielded.
		//
		// S3 fix: `chainFamily` defers this dispatch behind any OTHER
		// fetch()/seq.fetch() already in flight on this session (same "fetch"
		// family -- see `familyChains`'s own doc comment) -- transparent here
		// (still synchronous for the common no-overlap case): a search/store/
		// etc. concurrently in flight is untouched.
		const resultPromise = MailboxSession.chainFamily(session, "fetch", () => session.driver.run(command));
		return { [Symbol.asyncIterator]: () => driveFetch(command, resultPromise) };
	}

	// -- internal driver surface (ImapClient's §8.3 state-tracker lane ONLY) --
	// Public statics (same access-widening trick `commands/base.ts` documents
	// for `Command`'s own static driver methods): nothing outside `client.ts`
	// should call these. Each is a no-op once the session is already closed,
	// so a stray late event after deselection can never resurrect/mutate a
	// dead session's fields.

	static markClosed(session: MailboxSession, reason: MailboxClosedReason): void {
		if (session._closed) {
			return;
		}
		session._closed = true;
		// ST6 fix (M4-phase-boundary review, spec §5b amendment): a closed
		// session can never gain a first listener capable of receiving a
		// resync replay -- discard rather than leave an un-flushable buffer
		// referenced for the rest of this (now-dead) session's lifetime. A
		// no-op if already flushed (or never had anything to buffer) --
		// `_resyncBuffer` is already `null` either way.
		session._resyncBuffer = null;
		session.emit("closed", reason);
	}

	static applyExists(session: MailboxSession, count: number): void {
		if (session._closed || count === session._exists) {
			return;
		}
		const prev = session._exists;
		session._exists = count;
		session.emit("exists", count, prev);
	}

	/** RECENT has no dedicated event (spec §5b's `MailboxSessionEvents` list)
	 *  -- the snapshot field is updated silently. */
	static applyRecent(session: MailboxSession, count: number): void {
		if (session._closed) {
			return;
		}
		session._recent = count;
	}

	static applyExpunge(session: MailboxSession, seq: number): void {
		if (session._closed) {
			return;
		}
		// Spec §8.3: "the session keeps no full [seq->uid] map"; EXPUNGE only
		// decrements the count. Floored at 0 as defense-in-depth against a
		// pathological/duplicate EXPUNGE, never going negative.
		session._exists = Math.max(0, session._exists - 1);
		session.emit("expunge", seq);
	}

	/**
	 * QRESYNC VANISHED (RFC 7162 §3.2.10, M4.6) -- the single entry point for
	 * BOTH the resync-buffered case (`flushResync()` below, from a QRESYNC
	 * SELECT/EXAMINE's own response family) and a genuinely LIVE untagged
	 * `VANISHED` arriving later on the connection (`ImapClient.
	 * applyMailboxLiveUpdate()`). One reconciliation rule covers both call
	 * sites correctly:
	 *
	 * - `earlier: true` (`VANISHED (EARLIER)`, §3.2.10.1) is, per the RFC's
	 *   own wording, informational about UIDs that are ALREADY excluded from
	 *   whatever EXISTS count accompanies it -- true whether that EXISTS
	 *   count is the SELECT's own initial one (the resync case) or a LATER
	 *   untagged EXISTS on the same connection (the unusual live case: a
	 *   compliant server only sends the EARLIER form during resync, per
	 *   §3.2.5.1, but nothing this client controls prevents a
	 *   non-conformant one from sending it later too). Either way, `exists`
	 *   is NOT decremented here -- doing so would double-count against an
	 *   EXISTS line that already reflects the removal.
	 * - `earlier: false` (bare `VANISHED`, §3.2.10.2) is always a LIVE
	 *   expunge report, replacing EXPUNGE for the rest of a QRESYNC-ENABLEd
	 *   connection (§3.2.7/§3.2.9) -- `exists` IS decremented, by
	 *   `uids.length` (mirroring `applyExpunge()`'s own per-message
	 *   decrement, just counted rather than one-at-a-time, since spec §8.3
	 *   keeps no seq<->uid map to look any individual UID up in). Floored at
	 *   0, same defense-in-depth as `applyExpunge()`.
	 *
	 * HONEST LIMIT: because this session tracks no seq<->uid map, a
	 * pathological server reporting a UID that was never actually present
	 * (or reporting the same UID twice across two live VANISHED responses)
	 * would still decrement `exists` once per reported UID -- the exact same
	 * class of limitation `applyExpunge()`'s own doc comment already accepts
	 * for a duplicate/spurious classic EXPUNGE, just counted instead of
	 * single-stepped. Not compensated for; a conformant server never does
	 * this.
	 */
	static applyVanished(session: MailboxSession, uids: number[], earlier: boolean): void {
		if (session._closed) {
			return;
		}
		if (!earlier) {
			session._exists = Math.max(0, session._exists - uids.length);
		}
		session.emit("vanished", uids, earlier);
	}

	static applyFlagsUpdate(session: MailboxSession, update: MailboxFlagsUpdate): void {
		if (session._closed) {
			return;
		}
		session.emit("flags", update);
	}

	/**
	 * Replays this session's buffered QRESYNC resync events (spec §5b's
	 * resync-buffering guarantee), in the original wire arrival order --
	 * idempotent no-op once already flushed/discarded (`_resyncBuffer ===
	 * null`). Reached ONLY via `maybeTriggerResyncFlush()`'s
	 * listener-triggered microtask (ST6 fix, M4-phase-boundary review: the
	 * construction-time `setImmediate` timed fallback this doc comment used
	 * to also mention was removed entirely -- see the constructor's own
	 * comment and the spec §5b amendment note). Stops replaying (but still
	 * clears the buffer) if the session closes partway through -- same
	 * no-op-once-closed posture every other `apply*` static above takes; a
	 * session that closes between `select()` resolving and its resync flush
	 * running has bigger problems than a few stale cached-flag events. A
	 * session that closes BEFORE any listener ever attaches never reaches
	 * this method at all -- `markClosed()` discards the buffer directly.
	 */
	private static flushResync(session: MailboxSession): void {
		const buffer = session._resyncBuffer;
		if (buffer === null) {
			return;
		}
		session._resyncBuffer = null;
		for (const event of buffer) {
			if (session._closed) {
				break;
			}
			if (event.kind === "vanished") {
				MailboxSession.applyVanished(session, event.uids, event.earlier);
			} else {
				MailboxSession.applyFlagsUpdate(session, {
					seq: event.seq,
					...(event.uid !== undefined ? { uid: event.uid } : {}),
					flags: event.flags,
					...(event.modSeq !== undefined ? { modSeq: event.modSeq } : {}),
				});
			}
		}
	}

	static applyUidValidity(session: MailboxSession, next: number): void {
		if (session._closed || next === session._uidValidity) {
			return;
		}
		const prev = session._uidValidity;
		session._uidValidity = next;
		session.emit("uidValidityChanged", next, prev);
	}

	// -- `updates()` live-update driver (spec §3.7, M4.3) ----------------------
	// See `updates()`'s own doc comment for the full design (the two modes,
	// the refcounted-sharing rationale). Declared as statics (rather than
	// free functions) purely so they can reach `_liveUpdatesDriver`/`driver`,
	// same access-widening trick every other static in this class already
	// uses -- deliberately NOT marked `private` (same convention `markClosed`/
	// `applyExists`/etc. above already follow): `createUpdatesIterator()`
	// (module-level, below `SeqFacet`) needs to call these two from outside
	// the class body; nothing outside THIS FILE should call them.

	/**
	 * Acquires (starting if necessary) this session's shared live-update
	 * driver for one `updates()` iterator. Guards against the two-concurrent-
	 * acquires race with a synchronous placeholder write: `session.
	 * _liveUpdatesDriver` is assigned BEFORE this function's first `await`,
	 * so a second call arriving while the first is still mid-construction
	 * (e.g. two `updates({idle:true})` iterators both starting in the same
	 * microtask stretch) sees the placeholder already in place — bumps its
	 * refcount and awaits `ready` instead of racing to build a second,
	 * independent driver (which, for `mode: "idle"`, would ping-pong forever,
	 * see `updates()`'s own doc comment).
	 *
	 * ST2 fix (M4-phase-boundary review): joining an EXISTING driver whose
	 * mode doesn't match `requireIdle` is no longer silently accepted in
	 * both directions -- see `updates()`'s own doc comment (amended by this
	 * fix) for the policy this enforces: `requireIdle` joining an existing
	 * `"noop"`-mode driver throws `CapabilityError` (the caller demanded
	 * IDLE; a NOOP driver is a degradation, not a silent substitute);
	 * anything else joining an existing driver of either mode keeps the
	 * pre-existing first-iterator-wins behavior unchanged.
	 */
	static async acquireLiveUpdatesDriver(
		session: MailboxSession,
		mode: LiveUpdatesMode,
		requireIdle: boolean,
	): Promise<void> {
		const existing = session._liveUpdatesDriver;
		if (existing) {
			if (requireIdle && existing.mode !== "idle") {
				throw new CapabilityError(
					'updates({idle:"require"}) cannot join this session\'s already-active ' +
						"NOOP-poll live-update driver -- a concurrent updates({idle:false}) call, " +
						"or an earlier updates() call that fell back to NOOP polling because the " +
						"server lacked IDLE, already won the shared driver (the concurrent-iterator " +
						"design is first-iterator-wins, not per-call, see updates()'s own doc " +
						"comment) -- the caller demanded IDLE, and a NOOP driver is a degradation " +
						"from that, not a silent substitute; call updates({idle:true}) instead to " +
						"join the existing driver regardless of its mode",
					{ capability: "IDLE", rfc: "RFC2177" },
				);
			}
			existing.refCount += 1;
			await existing.ready;
			return;
		}
		let resolveReady!: () => void;
		const ready = new Promise<void>((resolve) => {
			resolveReady = resolve;
		});
		// ST3 fix (M4-phase-boundary review): construction-race guard. Before
		// this fix, a `releaseLiveUpdatesDriver()` call landing while
		// `controller.start()` (below) was still pending called this SAME
		// placeholder `stop` (the real one is only installed once `start()`
		// resolves) -- a true no-op, silently orphaning the just-started
		// `IdleController` (a live-IDLE leak, and later ping-pong once a NEW
		// `updates()` call builds a SECOND, independent driver against the
		// same session). `released` lets the placeholder record that a
		// release already happened; the post-`await` continuation checks it
		// and stops the controller itself instead of installing a real `stop`
		// nobody will ever call again (`releaseLiveUpdatesDriver` already
		// cleared `session._liveUpdatesDriver` and never calls `state.stop()`
		// a second time).
		let released = false;
		const state: LiveUpdatesDriverState = {
			mode,
			refCount: 1,
			ready,
			stop: () => {
				released = true;
			},
		};
		session._liveUpdatesDriver = state;

		if (mode === "idle") {
			const idleDriver: IdleControllerDriver = {
				run: (command) => session.driver.run(command),
				onQueuedBehindIsolated: (cb) => session.driver.onQueuedBehindIsolated(cb),
				idleRenewMs: () => session.driver.idleRenewMs(),
			};
			const controller = new IdleController(idleDriver, { managedReentry: true });
			await controller.start();
			if (released) {
				// ST3: a release() call already arrived and landed on the inert
				// placeholder above while `start()` was still pending -- stop
				// the just-started controller right now instead of leaking it.
				void controller.done();
			} else {
				// Nobody calls `controller.done()` unless `stop()` below fires --
				// `IdleController`'s own constructor already guards its `stopped`
				// promise against becoming an unhandled rejection when nothing
				// awaits it (see that class's own doc comment), so a controller
				// that fails entirely in the background (e.g. connection teardown)
				// cannot crash the process even though this class never observes
				// that failure directly (a known, documented limitation -- see
				// this milestone's report).
				state.stop = () => {
					void controller.done();
				};
			}
		} else {
			const intervalMs = session.driver.noopFallbackIntervalMs();
			let stopped = false;
			const timer = setInterval(() => {
				if (stopped || session._closed) {
					return;
				}
				// Best-effort: a single failed NOOP (e.g. a transient tagged
				// NO, or the connection dying) does not end the poll loop --
				// it just tries again next interval. A hard, permanent
				// connection loss surfaces separately through this session's
				// own `closed` event once that lane is wired (see
				// `MailboxClosedReason`'s own doc comment on `"disconnected"`).
				session.driver.run(new NoopCommand()).catch(() => undefined);
			}, intervalMs);
			(timer as unknown as { unref?: () => void }).unref?.();
			state.stop = () => {
				stopped = true;
				clearInterval(timer);
			};
		}

		resolveReady();
	}

	/** Releases one `updates()` iterator's hold on this session's shared
	 *  live-update driver — tears it down for good once the last one lets
	 *  go. A no-op if none is active (defensive; should not happen given
	 *  every `createUpdatesIterator()` call path that acquires also
	 *  releases, in its own `cleanup()`). */
	static releaseLiveUpdatesDriver(session: MailboxSession): void {
		const state = session._liveUpdatesDriver;
		if (!state) {
			return;
		}
		state.refCount -= 1;
		if (state.refCount <= 0) {
			session._liveUpdatesDriver = null;
			state.stop();
		}
	}

}

/**
 * `SequenceFacet` implementation backing `MailboxSession.seq` (spec §5b).
 * A thin delegator: every method forwards to the SAME shared static
 * (`MailboxSession.runSearch`, etc.) the UID-grain method uses, passing
 * the seq grain so the wire verb is the bare (non-`UID`-prefixed) form.
 * Kept as its own class (rather than an object literal built in the
 * constructor) so future verbs land here as ordinary additional methods —
 * additive, merge-friendly, matching `SequenceFacet`'s own doc comment.
 *
 * UIDONLY lockout (RFC 9586, spec §5b: "unavailable under UIDONLY -- every
 * method rejects `CapabilityError('UIDONLY active')`") is REAL as of M5.15:
 * every method below reaches a shared `MailboxSession.run*` static whose
 * seq-grain branch calls `assertUidOnlyInactive()` before any command is
 * constructed or byte written (zero-bytes discipline, I-9-style). Once
 * `ENABLE UIDONLY` succeeds, this entire facet is dead for the remainder of
 * the connection -- irreversibly (RFC 5161 has no un-ENABLE), across
 * reselects too (`client.enabled` persists per-connection, cleared only by
 * disconnect/UNAUTHENTICATE). ⚠️ Note the POLARITY INVERSION documented on
 * `assertUidOnlyInactive` itself: this is the one `CapabilityError` in the
 * codebase whose trigger is a capability being ACTIVE (ENABLEd), not
 * absent -- do not "fix" it to match the usual absent-capability pattern.
 */
class SeqFacet implements SequenceFacet {
	constructor(private readonly session: MailboxSession) {}

	/** Sequence-number-grain FETCH -- see `MailboxSession.fetch()`'s doc
	 *  comment; identical behavior (bare `FETCH`, not `UID FETCH`), except an
	 *  explicit `items.uid: true` ask IS required to see the `UID` data item
	 *  in the response (contrast the UID-grain method, where it's always
	 *  implicit regardless). */
	fetch(seqs: SequenceInput, items: FetchRequest, opts?: FetchModifiers): AsyncIterable<FetchedMessage> {
		return MailboxSession.runFetch(this.session, seqs, items, opts, "seq");
	}

	fetchOne(seq: number, items: FetchRequest, opts?: FetchModifiers): Promise<FetchedMessage | null> {
		return fetchOneOf(this.fetch(seq, items, opts));
	}

	search(criteria: SearchCriteria, opts?: SearchOptions): Promise<SearchResult> {
		return MailboxSession.runSearch(this.session, criteria, opts, false);
	}

	/** Sequence-number-grain SORT -- see `MailboxSession.sort()`'s doc
	 *  comment; identical behavior (bare `SORT`, not `UID SORT`). */
	sort(sort: SortKey[], criteria: SearchCriteria, opts?: SearchOptions): Promise<SearchResult> {
		return MailboxSession.runSort(this.session, sort, criteria, opts, false);
	}

	/** Sequence-number-grain THREAD -- see `MailboxSession.thread()`'s doc
	 *  comment; identical behavior (bare `THREAD`, not `UID THREAD`) --
	 *  delivered `ThreadNode`s carry `seq`, never `uid`. */
	thread(algorithm: ThreadAlgorithm, criteria: SearchCriteria, opts?: SearchOptions): Promise<ThreadNode[]> {
		return MailboxSession.runThread(this.session, algorithm, criteria, opts, false);
	}

	addFlags(seqs: SequenceInput, flags: Flag[], opts?: StoreModifiers): Promise<StoreResult> {
		return MailboxSession.runStore(this.session, "seq", seqs, "add", flags, opts);
	}

	removeFlags(seqs: SequenceInput, flags: Flag[], opts?: StoreModifiers): Promise<StoreResult> {
		return MailboxSession.runStore(this.session, "seq", seqs, "remove", flags, opts);
	}

	setFlags(seqs: SequenceInput, flags: Flag[], opts?: StoreModifiers): Promise<StoreResult> {
		return MailboxSession.runStore(this.session, "seq", seqs, "replace", flags, opts);
	}

	/** Sequence-number-grain COPY -- see `MailboxSession.copy()`'s doc
	 *  comment; identical behavior, `seqs` interpreted as sequence numbers
	 *  (bare `COPY`, not `UID COPY`) rather than UIDs. */
	copy(seqs: SequenceInput, dest: string): Promise<CopyResult> {
		return MailboxSession.runCopyOrMove(this.session, seqs, dest, "seq", false);
	}

	/** Sequence-number-grain MOVE -- see `MailboxSession.move()`'s doc
	 *  comment; identical behavior (including the native-MOVE-only
	 *  capability gate), `seqs` interpreted as sequence numbers (bare
	 *  `MOVE`, not `UID MOVE`) rather than UIDs. */
	move(seqs: SequenceInput, dest: string): Promise<CopyResult> {
		return MailboxSession.runCopyOrMove(this.session, seqs, dest, "seq", true);
	}

	/** Bare EXPUNGE, no argument -- see `SequenceFacet.expunge()`'s own doc
	 *  comment for why this facet does NOT mirror `MailboxSession.expunge()`'s
	 *  optional-UID-argument shape (UID EXPUNGE's argument is UIDs only;
	 *  there is no sequence-number-grain form of it to expose here). */
	expunge(): Promise<number[]> {
		return MailboxSession.runExpunge(this.session, undefined, "seq.expunge");
	}

	/** Sequence-number-grain REPLACE -- see `MailboxSession.replace()`'s doc
	 *  comment; identical behavior (bare `REPLACE`, not `UID REPLACE`), `seq`
	 *  interpreted as a message sequence number rather than a UID. */
	replace(seq: number, mailbox: string, msg: AppendSource, opts?: AppendOptions): Promise<AppendResult> {
		return MailboxSession.runReplace(this.session, seq, mailbox, msg, opts, "seq");
	}

	/** Sequence-number-grain `STORE +X-GM-LABELS` -- see
	 *  `MailboxSession.addGmailLabels()`'s doc comment; identical behavior
	 *  (bare `STORE`, not `UID STORE`), `seqs` interpreted as message
	 *  sequence numbers rather than UIDs. */
	addGmailLabels(seqs: SequenceInput, labels: string[]): Promise<void> {
		return MailboxSession.runGmailLabelsStore(this.session, "seq", seqs, "add", labels);
	}

	/** Sequence-number-grain `STORE -X-GM-LABELS` -- see
	 *  `MailboxSession.removeGmailLabels()`'s doc comment; identical behavior
	 *  (bare `STORE`, not `UID STORE`), `seqs` interpreted as message
	 *  sequence numbers rather than UIDs. */
	removeGmailLabels(seqs: SequenceInput, labels: string[]): Promise<void> {
		return MailboxSession.runGmailLabelsStore(this.session, "seq", seqs, "remove", labels);
	}

	/** Sequence-number-grain CONVERT -- see `MailboxSession.convert()`'s doc
	 *  comment; identical behavior (including the CONVERT capability gate),
	 *  `seqs` interpreted as sequence numbers (bare `CONVERT`, not
	 *  `UID CONVERT`) rather than UIDs. */
	convert(seqs: SequenceInput, item: string, transformation: ConvertTransformation): Promise<ConvertResult> {
		return MailboxSession.runConvert(this.session, seqs, item, transformation, "seq");
	}
}

// -- FETCH async-iterable driver (spec §5.4, M3.5) ---------------------------
// Free functions (not methods) because they operate on a `FetchCommand`
// instance directly, not on `MailboxSession`'s own private state -- kept
// beside `MailboxSession`/`SeqFacet` rather than in `commands/fetch.ts` since
// this is where the PUBLIC `AsyncIterable` contract (backpressure + the
// abandoned-iterator drain, both spec §5.4) is implemented; `FetchCommand`
// itself only knows how to expose the raw claimed-response stream
// (`messages()`).

/**
 * Backs one `updates()` call's `AsyncIterable<MailboxUpdate>` (spec §5b/
 * §3.7, M4.3) — see `MailboxSession.updates()`'s own doc comment for the full
 * design (the two live-update modes, the concurrent-iterator refcounted-
 * sharing rationale, and WHY this is a hand-rolled `AsyncIterator` rather
 * than an `async function*`: `.return()`/`.throw()` must be able to
 * interrupt a `next()` call that is blocked waiting for the next mailbox
 * event, something a generator's own internal `await` cannot be interrupted
 * out of).
 *
 * Subscription (the four `session.on(...)` calls, and acquiring/joining the
 * shared live-update driver) is deferred to `ensureStarted()`, invoked from
 * the FIRST `next()` call — matching `updates()`'s own "iteration start,
 * not construction" contract. Every event handler below either resolves an
 * in-flight `next()` call directly (`pending`, if a consumer is currently
 * blocked awaiting the next event) or appends to `queue` for the NEXT
 * `next()` call to pick up — no backpressure is applied (unlike `fetch()`'s
 * live body-part streams): `MailboxUpdate` values are cheap, plain data, so
 * an unbounded queue is the right tradeoff here, not a hazard.
 *
 * Ordering guarantee for the resync-buffer case (spec §5b): the five
 * `session.on(...)` calls in `ensureStarted()` run synchronously, back-to-
 * back, in the SAME synchronous stretch the first `next()` call executes in
 * (before `acquireLiveUpdatesDriver()`'s own internal `await`) —
 * `maybeTriggerResyncFlush()` always defers its own flush at least one
 * further microtask turn, so by the time it runs, every listener this
 * iterator attaches is already in place; any buffered resync events replay
 * through THESE listeners exactly like any other `vanished`/`flags` event,
 * arriving as this iterator's first yields whenever a resync buffer is
 * pending.
 *
 * `return()`/`throw()` both: mark this iterator ended, run `cleanup()`
 * (unsubscribe every listener, release this iterator's hold on the shared
 * live-update driver — idempotent, and a no-op if `ensureStarted()` never
 * actually ran), and — the crux of the fix documented above — settle
 * `pending` directly if a `next()` call is currently blocked on it, so an
 * abandon on a quiet mailbox (no event ever pending) still resolves
 * immediately instead of hanging.
 */
function createUpdatesIterator(
	session: MailboxSession,
	mode: LiveUpdatesMode,
	requireIdle: boolean,
): AsyncIterator<MailboxUpdate> {
	const queue: MailboxUpdate[] = [];
	let pending:
		| { resolve: (result: IteratorResult<MailboxUpdate>) => void; reject: (err: unknown) => void }
		| undefined;
	let ended = false;
	let started = false;
	let subscribed = false;
	let cleanedUp = false;
	/** ST2 (M4-phase-boundary review): `acquireLiveUpdatesDriver()` can now
	 *  genuinely reject (`CapabilityError`, `{idle:"require"}` joining an
	 *  existing NOOP driver) -- caught below and surfaced through the very
	 *  next `next()` call (or the one ALREADY blocked on `pending`, if any)
	 *  rather than silently swallowed the way the pre-M4.13 fire-and-forget
	 *  call did (that call's only fallible step was `IdleController.start()`,
	 *  which does not reject in practice; this new failure mode genuinely
	 *  can, and must reach the caller). */
	let pendingError: unknown;

	const push = (update: MailboxUpdate): void => {
		if (pending) {
			pending.resolve({ value: update, done: false });
			pending = undefined;
			return;
		}
		queue.push(update);
	};
	const onExists = (count: number): void => push({ type: "exists", count });
	const onExpunge = (seq: number): void => push({ type: "expunge", seq });
	const onVanished = (uids: number[], earlier: boolean): void =>
		push({ type: "vanished", uids, earlier });
	const onFlags = (update: MailboxFlagsUpdate): void =>
		push({
			type: "flags",
			seq: update.seq,
			...(update.uid !== undefined ? { uid: update.uid } : {}),
			flags: update.flags,
			...(update.modSeq !== undefined ? { modSeq: update.modSeq } : {}),
		});
	/** The session closing mid-iteration (spec §5b design note, see
	 *  `updates()`'s own doc comment): ends this iterator GRACEFULLY, not
	 *  with a thrown error — see that doc comment for the full rationale.
	 *  Only settles `pending` (a currently-blocked `next()` call); anything
	 *  already sitting in `queue` is still drained by subsequent `next()`
	 *  calls before `ended` actually stops the iteration (handled in
	 *  `next()` below). */
	const onClosed = (): void => {
		ended = true;
		if (pending) {
			pending.resolve({ value: undefined, done: true });
			pending = undefined;
		}
		cleanup();
	};

	function ensureStarted(): void {
		if (started) {
			return;
		}
		started = true;
		if (session.closed) {
			// Already closed by the time iteration actually started (lazy
			// subscription) -- graceful, degenerate "closed before it even
			// began" case, same treatment as `onClosed` above.
			ended = true;
			return;
		}
		subscribed = true;
		session.on("exists", onExists);
		session.on("expunge", onExpunge);
		session.on("vanished", onVanished);
		session.on("flags", onFlags);
		session.on("closed", onClosed);
		// `IdleController.start()` itself does not reject in practice (`start()`
		// only kicks off the round's submission, see that method's own doc
		// comment) -- a hard failure of the underlying driver, once started,
		// is a known, documented limitation this iterator does not surface
		// (see `MailboxSession.acquireLiveUpdatesDriver()`'s own doc comment).
		// ST2 (M4-phase-boundary review): `acquireLiveUpdatesDriver()` can
		// ALSO now reject synchronously-in-effect with `CapabilityError`
		// (`{idle:"require"}` joining an existing NOOP driver) -- caught here
		// and surfaced through `next()` rather than becoming an unhandled
		// rejection.
		void MailboxSession.acquireLiveUpdatesDriver(session, mode, requireIdle).catch((err: unknown) => {
			ended = true;
			if (pending) {
				pending.reject(err);
				pending = undefined;
			} else {
				pendingError = err;
			}
		});
	}

	function cleanup(): void {
		if (cleanedUp) {
			return;
		}
		cleanedUp = true;
		if (!subscribed) {
			return;
		}
		session.off("exists", onExists);
		session.off("expunge", onExpunge);
		session.off("vanished", onVanished);
		session.off("flags", onFlags);
		session.off("closed", onClosed);
		MailboxSession.releaseLiveUpdatesDriver(session);
	}

	return {
		next(): Promise<IteratorResult<MailboxUpdate>> {
			ensureStarted();
			if (pendingError !== undefined) {
				const err = pendingError;
				pendingError = undefined;
				cleanup();
				return Promise.reject(err);
			}
			if (queue.length > 0) {
				return Promise.resolve({ value: queue.shift() as MailboxUpdate, done: false });
			}
			if (ended) {
				cleanup();
				return Promise.resolve({ value: undefined, done: true });
			}
			return new Promise<IteratorResult<MailboxUpdate>>((resolve, reject) => {
				pending = { resolve, reject };
			});
		},
		return(): Promise<IteratorResult<MailboxUpdate>> {
			ended = true;
			cleanup();
			if (pending) {
				pending.resolve({ value: undefined, done: true });
				pending = undefined;
			}
			return Promise.resolve({ value: undefined, done: true });
		},
		throw(err: unknown): Promise<IteratorResult<MailboxUpdate>> {
			ended = true;
			cleanup();
			if (pending) {
				pending.reject(err);
				pending = undefined;
			}
			return Promise.reject(err);
		},
	};
}

/**
 * Drives one `fetch()`/`seq.fetch()` call's `AsyncIterable<FetchedMessage>`
 * (spec §5.4): yields each message as `FetchCommand.messages()` produces it
 * (itself fed by the M3.4 collector bridge, before this command's tagged OK),
 * and — the backpressure contract — does not pull the NEXT message out of
 * `messages()` until every LIVE (not-yet-buffered) `FetchedPart` on the
 * current message has been consumed (drained via `buffer()`/read to the end
 * of `stream()`) or destroyed. `await resultPromise` at the end surfaces a
 * tagged NO/BAD (or any other rejection `driver.run()` itself would produce)
 * as this iterable's own completion error, once every already-claimed
 * message has been exhausted.
 *
 * Abandoned iterator (`break`/`return`, the mandatory compliance scenario):
 * the `finally` block destroys the just-yielded message's own not-yet-
 * settled live parts (in case the consumer walked away between the `yield`
 * and the backpressure `await` above), then keeps draining the REST of
 * `messages()` in the background (`drainAbandoned`, fire-and-forget,
 * destroying any live parts it encounters along the way) — the command was
 * already dispatched; its remaining responses will keep arriving over the
 * wire regardless of whether anyone reads them here, and every one of them
 * must still be claimed/settled so the NEXT command on this connection
 * parses cleanly (`ResponseCollector.settle()` — and this command's own
 * tag/claimant cleanup in `executeCommand`'s `finally` — only ever happen
 * once, driven by the tagged response arriving, independent of this
 * generator's own lifetime).
 */
async function* driveFetch(
	command: { messages(): AsyncGenerator<FetchedMessage, void, void> },
	resultPromise: Promise<AsyncIterable<FetchedMessage>>,
): AsyncGenerator<FetchedMessage, void, void> {
	const iter = command.messages();
	let current: FetchedMessageImpl | undefined;
	try {
		for (;;) {
			const next = await iter.next();
			if (next.done) {
				break;
			}
			current = next.value as FetchedMessageImpl;
			yield current;
			// S2 fix (M3-phase-boundary review): reaching here means the
			// consumer resumed this generator by asking for the NEXT message
			// (`iter.next()`) -- a genuine abandon (`.return()`) unwinds
			// straight to the `finally` below instead, never resuming past the
			// `yield` above. Advancing past a message the caller never
			// engaged one of its own live parts for (`stream()`/`buffer()`
			// never called) is "relinquishing" that part, per spec §5.4's
			// "consumed or destroyed" contract -- destroy it now so the
			// backpressure await just below can't deadlock on a stream nobody
			// asked for. A part the consumer DID engage (started reading via
			// `stream()`, or is mid-`buffer()`) is left alone: it keeps gating
			// exactly as before -- requesting the next message before
			// finishing a part you started is a documented caller error, not
			// something this call papers over.
			current.destroyUnengagedLiveParts();
			await Promise.all(current.livePartSettledPromises());
			current = undefined;
		}
		await resultPromise;
	} finally {
		if (current) {
			current.destroyLiveParts();
		}
		void drainAbandoned(iter);
		// The command's own completion is observed either via the `await`
		// above (normal path) or discarded here (abandoned path) -- either
		// way, a rejection must never become an unhandled rejection just
		// because this generator stopped reading before it settled.
		resultPromise.catch(() => undefined);
	}
}

/** Best-effort background drain for an abandoned `fetch()` iterator (see
 *  `driveFetch()`'s own doc comment) -- consumes the rest of `iter`,
 *  destroying every live part of every remaining message so none of them
 *  can leave the underlying socket paused forever (`LiteralBodyStream`'s own
 *  "consumed or destroyed" contract, §5.4) with nobody left to resume it. */
async function drainAbandoned(iter: AsyncGenerator<FetchedMessage, void, void>): Promise<void> {
	try {
		for (;;) {
			const next = await iter.next();
			if (next.done) {
				break;
			}
			(next.value as FetchedMessageImpl).destroyLiveParts();
		}
	} catch {
		// Best-effort drain only -- a parse/protocol error surfaces through
		// the command's own `resultPromise` instead (already handled by the
		// caller that abandoned this iterator); nothing more to do here.
	}
}

/**
 * Shared `fetchOne()`/`seq.fetchOne()` implementation (spec §5b): take the
 * first yielded message, then stop.
 *
 * Deliberately NOT `for await (const msg of iterable) { return msg; }`:
 * `for await...of` calls the underlying iterator's `.return()` on ANY early
 * exit, which is exactly `driveFetch()`'s ABANDONED-iterator signal --
 * destroying the just-yielded message's own not-yet-consumed live parts
 * (spec §5.4's "consumed or destroyed" contract) BEFORE `fetchOne()`'s
 * caller ever gets a chance to read them. That's correct for a genuine
 * caller-initiated `break`, but wrong here: `fetchOne()` hands the message
 * back whole, live parts intact, for the caller to use exactly like any
 * other `FetchedMessage`. Calling the raw `.next()` once (never `.return()`)
 * avoids triggering that cleanup for the message actually being returned.
 *
 * The rest of the iterator (if a non-conformant server sends more than one
 * response to what should be a single-UID request, or a caller reuses
 * `fetchOne()` against a range) is still drained in the background via
 * ordinary `.next()` calls -- NORMAL completion, not abandonment -- so
 * `driveFetch()`'s own final settle/cleanup still runs exactly as it would
 * for a fully-consumed `fetch()` call.
 *
 * S2 FIX INTERACTION (M3-phase-boundary review): that background drain's
 * OWN `.next()` call resumes the SAME `driveFetch()` generator instance
 * `first` came from, right past ITS `yield` -- indistinguishable, from
 * `driveFetch()`'s point of view, from "the consumer requested the next
 * message" (the exact signal `destroyUnengagedLiveParts()` now acts on,
 * spec §5.4's "consumed or destroyed"). Left alone, that background drain
 * would destroy `first`'s own not-yet-engaged live parts BEFORE this
 * function's real caller (below) ever gets `first.value` back — silently
 * reintroducing the same "cleanup runs before the caller can read it"
 * problem `.next()`-not-`.return()` was already chosen to avoid above, just
 * moved one step later. `protectLiveParts()` (called BEFORE the background
 * drain starts) marks every one of `first.value`'s live parts "engaged"
 * without reading them, exempting it from that pass entirely — this
 * function's own contract already promises live parts "intact" for the real
 * caller, so there is no "next message" of fetchOne()'s own for `first` to
 * ever be relinquished in favor of.
 */
async function fetchOneOf(iterable: AsyncIterable<FetchedMessage>): Promise<FetchedMessage | null> {
	const it = iterable[Symbol.asyncIterator]();
	const first = await it.next();
	if (!first.done) {
		(first.value as FetchedMessageImpl).protectLiveParts();
	}
	void (async () => {
		try {
			for (;;) {
				const next = await it.next();
				if (next.done) {
					break;
				}
			}
		} catch {
			// Already surfaced through the original command's own error path
			// (whoever is holding the first message / awaiting `fetchOne()`);
			// nothing more to do with a background drain failure.
		}
	})();
	return first.done ? null : first.value;
}
