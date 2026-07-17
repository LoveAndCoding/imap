import {
	AppendUIDTextCode,
	AtomTextCode,
	CapabilityTextCode,
	CopyUIDTextCode,
	ModifiedTextCode,
	NumberTextCode,
	PermanentFlagsTextCode,
	TaggedResponse,
	UntaggedResponse,
} from "../parser";
import { UIDRange } from "../parser/structure/uid";
import type { UIDSet } from "../parser/structure/uid";
import type { TextCode } from "../parser/structure/text.code";
import type { TypedResponseCode } from "../protocol/response-codes";

/**
 * Sane ceiling on how many concrete UIDs a single `expandUidSet()` call will
 * materialize into the returned array. Every legitimate caller (a single
 * MULTIAPPEND batch's `APPENDUID`, a single COPY's `COPYUID`, a single
 * CONDSTORE `MODIFIED` failure list) is bounded by how many messages ONE
 * command touched, which never approaches this in practice -- it exists
 * specifically to stop a hostile or non-conformant server's `VANISHED
 * (EARLIER) 1:4294967295` (RFC 7162 §3.2.10, `uid-set` legally permits a
 * range spanning the FULL 32-bit UID space) from turning one response line
 * into an attempt to allocate a multi-billion-entry array -- a one-line DoS
 * this function would otherwise walk straight into with its `for` loop. Not
 * itself an RFC-mandated number (the spec places no ceiling on `uid-set`
 * range width), the same kind of implementation judgment call as
 * `commands/writer.ts`'s own `MAX_QUOTABLE_OCTETS`.
 */
const MAX_EXPANDED_UIDS = 1_000_000;

/** Expands a parsed `UIDSet` (individual UIDs and `a:b` ranges, per RFC
 *  3501/9051 §9 `uid-set`) into an ascending flat list of concrete numbers,
 *  used by the `COPYUID`/`APPENDUID` handling below. RFC 4315's
 *  `resp-code-copy`/`resp-code-apnd` grammars never legitimately put `"*"`
 *  in a uid-set here (that placeholder is a `sequence-set`-only wildcard,
 *  meaningless once the server has assigned real UIDs) -- a `"*"`-bearing
 *  element is skipped rather than guessed at, tolerating a non-conformant
 *  server without inventing a number (I-6). Exported for
 *  `commands/append.ts`'s `MultiAppendCommand`, which pairs this same
 *  ascending expansion positionally onto its message array (M3.10), AND for
 *  `commands/select.ts`/`client/client.ts`'s VANISHED handling, which is
 *  where `MAX_EXPANDED_UIDS` above actually matters -- see its own doc
 *  comment. A single `a:b` range wider than that ceiling throws a
 *  `RangeError` BEFORE any of its UIDs are materialized (not a silent
 *  truncation, which would misreport which UIDs were removed/appended/
 *  modified): this is a resource-exhaustion refusal, not a tolerance
 *  concern (I-6 covers unrecognized-shape response DATA, not an
 *  implementation choosing not to allocate an unbounded array on the
 *  strength of one wire line -- see M3.3's own "oversized/malformed literal
 *  framing is a parse error surfaced the normal way" precedent for the same
 *  refuse-rather-than-silently-stall posture). */
export function expandUidSet(set: UIDSet): number[] {
	const out: number[] = [];
	for (const el of set.set) {
		if (el instanceof UIDRange) {
			if (typeof el.startId === "number" && typeof el.endId === "number") {
				const span = el.endId - el.startId + 1;
				if (span > MAX_EXPANDED_UIDS || out.length + span > MAX_EXPANDED_UIDS) {
					throw new RangeError(
						`expandUidSet: refusing to materialize a uid-set range ` +
							`${el.startId}:${el.endId} (${span} UIDs) -- exceeds the ` +
							`${MAX_EXPANDED_UIDS}-UID ceiling this client expands in one call ` +
							"(a range this wide is almost certainly a malformed or hostile " +
							"response, not a legitimate single-command result)",
					);
				}
				for (let n = el.startId; n <= el.endId; n++) {
					out.push(n);
				}
			}
		} else if (typeof el.id === "number") {
			out.push(el.id);
		}
	}
	return out;
}

/** Strips one layer of surrounding DQUOTEs, mirroring `commands/status.ts`'s
 *  private helper of the same shape (BADURL's `url-resp-text` argument is a
 *  quoted `astring`, e.g. `"/Sent;UIDVALIDITY=.../;UID=20"`). */
function stripQuotes(s: string): string {
	if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
		return s.slice(1, -1);
	}
	return s;
}

/**
 * Converts one of the parser's internal `TextCode` variants into the public
 * `TypedResponseCode` shape (spec §5.5). The full discriminated union (one
 * variant per known code, with typed argument shapes) accretes as each
 * command needs its own codes -- M2.2 (SELECT/EXAMINE) is the first
 * consumer, adding CLOSED/PERMANENTFLAGS/UIDVALIDITY/UIDNEXT/HIGHESTMODSEQ/
 * NOMODSEQ/UIDNOTSTICKY/MAILBOXID. Everything else still surfaces through
 * the open `{ name, args }` fallback shape, rendered from whatever
 * structured data each `TextCode` class happens to carry. This is
 * intentionally conservative: codes this function doesn't know how to
 * render args for still surface (by name), they just carry `args: null`
 * rather than a guessed-at string — never an error, per the tolerance
 * invariant (I-6).
 */
export function toTypedResponseCode(
	code: TextCode | undefined | null,
): TypedResponseCode | null {
	if (!code) {
		return null;
	}
	const name = String((code as { kind: unknown }).kind).toUpperCase();
	if (code instanceof AppendUIDTextCode) {
		// RFC 4315 (UIDPLUS): a single-message APPEND carries exactly one
		// `uniqueid` here; a MULTIAPPEND batch (RFC 3502, M3.10) widens this to
		// a `uid-set` covering every appended message (RFC3502-uidplus-1).
		// `expandUidSet` handles both shapes uniformly -- a lone `uniqueid`
		// expands to a one-element array. `uid` stays the FIRST uid for
		// backward compatibility with the single-message case (M2.11); `0`
		// (never a real IMAP UID, nz-number) documents "the server sent
		// something this parse can't have produced" for an empty expansion
		// without inventing an error for tolerated-but-odd data (I-6).
		const uids = expandUidSet(code.uids);
		return { name: "APPENDUID", uidValidity: code.uidvalidity, uid: uids[0] ?? 0, uids };
	}
	if (code instanceof CopyUIDTextCode) {
		return {
			name: "COPYUID",
			uidValidity: code.uidvalidity,
			sourceUids: expandUidSet(code.fromUIDs),
			destUids: expandUidSet(code.toUIDs),
		};
	}
	if (code instanceof ModifiedTextCode) {
		// RFC 7162 §3.2.5.1 (CONDSTORE), M3.6/M3.11: `StoreCommand.accept()`
		// reads this instance directly off the tagged response (its own
		// `instanceof ModifiedTextCode` check, `commands/store.ts`) rather
		// than through this function -- this branch exists so the GENERIC
		// paths that also read a command's resp-code (this class's own
		// `codes()` below, and `Command`'s `defaultOnError` building
		// `ServerNoError`/`ServerBadError.code`) render the same structured
		// `uids` array instead of silently losing the MODIFIED payload to the
		// open `{name, args}` fallback -- consistent with every other
		// structured-payload code (APPENDUID/COPYUID/PERMANENTFLAGS) above.
		return { name: "MODIFIED", uids: expandUidSet(code.uids) };
	}
	if (code instanceof PermanentFlagsTextCode) {
		return { name: "PERMANENTFLAGS", flags: code.flags.flags.map((f) => f.name) };
	}
	if (code instanceof NumberTextCode) {
		switch (name) {
			case "UIDVALIDITY":
				return { name: "UIDVALIDITY", value: code.value as number };
			case "UIDNEXT":
				return { name: "UIDNEXT", value: code.value as number };
			case "HIGHESTMODSEQ":
				return {
					name: "HIGHESTMODSEQ",
					value: typeof code.value === "bigint" ? code.value : BigInt(code.value),
				};
			default:
				// UNSEEN and any future NumberTextCode kind: no dedicated
				// variant yet -- open fallback, rendered as a plain string.
				return { name, args: String(code.value) };
		}
	}
	if (code instanceof AtomTextCode) {
		switch (name) {
			case "CLOSED":
				return { name: "CLOSED" };
			case "NOMODSEQ":
				return { name: "NOMODSEQ" };
			case "UIDNOTSTICKY":
				return { name: "UIDNOTSTICKY" };
			case "USEATTR":
				// RFC 6154 §3 (M2.3/CREATE): argument-less refusal code on a
				// tagged NO to a special-use CREATE.
				return { name: "USEATTR" };
			case "MAILBOXID":
				return { name: "MAILBOXID", value: code.contents?.[0] ?? null };
			case "TOOBIG":
				// RFC 4469/RFC 7889: argument-less tagged-NO code (over-size
				// APPEND, either the CATENATE 4-GB ceiling or an APPENDLIMIT
				// rejection).
				return { name: "TOOBIG" };
			case "BADURL": {
				// RFC 4469 §5: `badurl-response-code = "BADURL" SP url-resp-text`
				// -- a single quoted-astring argument (the offending IMAP URL).
				const raw = code.contents?.[0];
				return { name: "BADURL", url: raw ? stripQuotes(raw) : "" };
			}
			case "APPENDLIMIT": {
				// RFC 7889 (M2.9): the same atom that serves as a STATUS item
				// also appears as a resp-code carrying the advertised limit.
				// A missing or non-numeric argument surfaces as `null` rather
				// than an error (I-6).
				const raw = code.contents?.[0];
				return {
					name: "APPENDLIMIT",
					value: raw !== undefined && /^\d+$/.test(raw) ? BigInt(raw) : null,
				};
			}
			case "BADCOMPARATOR": {
				// RFC 5255 §4.9 (M5.11): `"BADCOMPARATOR" [SP charset]` -- a
				// tagged-NO code for a COMPARATOR change with no matching
				// installed comparator. The optional trailing charset is a
				// bare (unparenthesized) argument `AtomTextCode`'s
				// bare-vs-parenthesized split already preserves in
				// `contents[0]`; absent -> `null`, never fabricated (I-6).
				const raw = code.contents?.[0];
				return { name: "BADCOMPARATOR", charset: raw ?? null };
			}
			case "UNDEFINED-FILTER": {
				// RFC 5466 §3.1/§4 (FILTERS), M4.14: `"UNDEFINED-FILTER" SP
				// filter-name` -- a bare (unparenthesized) atom naming the
				// nonexistent/unaccessible FILTER the SEARCH referenced.
				// `AtomTextCode`'s bare-vs-parenthesized split already
				// preserves this in `contents[0]`; a missing argument from a
				// non-conformant server surfaces as `null` rather than an
				// error (I-6).
				const raw = code.contents?.[0];
				return { name: "UNDEFINED-FILTER", filterName: raw ?? null };
			}
			case "REFERRAL": {
				// RFC 2193 §3/§6 / RFC 2221 §3/§5 (M5.13): `"REFERRAL"
				// 1*(SP <url>)` -- one or more BARE (unparenthesized)
				// space-separated URLs. `AtomTextCode`'s bare-vs-parenthesized
				// split preserves them all, in the server's preference order
				// (RFC 2193 §3; positional old/new pair on a RENAME referral,
				// §4.3). A missing argument from a non-conformant server
				// surfaces as `[]` rather than an error (I-6). See the
				// `TypedResponseCode` variant's doc comment for the
				// never-auto-follow posture.
				return { name: "REFERRAL", urls: code.contents ? [...code.contents] : [] };
			}
			case "MAXCONVERTMESSAGES": {
				// RFC 5259 §9/§8.5 (CONVERT, M5.12): a bare nz-number argument --
				// `AtomTextCode`'s bare-vs-parenthesized split preserves it in
				// `contents[0]`; a missing/non-numeric argument from a
				// non-conformant server surfaces as `null` rather than an error
				// (I-6), same posture as APPENDLIMIT above.
				const raw = code.contents?.[0];
				return {
					name: "MAXCONVERTMESSAGES",
					value: raw !== undefined && /^\d+$/.test(raw) ? Number(raw) : null,
				};
			}
			case "MAXCONVERTPARTS": {
				// RFC 5259 §9/§8.5: MAXCONVERTMESSAGES's body-parts counterpart --
				// identical shape/tolerance rationale (see above).
				const raw = code.contents?.[0];
				return {
					name: "MAXCONVERTPARTS",
					value: raw !== undefined && /^\d+$/.test(raw) ? Number(raw) : null,
				};
			}
			case "METADATA": {
				// RFC 5464 §4.2.1/§4.3 (M5.4): one wire keyword ("METADATA")
				// fronts four sub-forms -- "LONGENTRIES"/"MAXSIZE"/"TOOMANY"/
				// "NOPRIVATE" -- distinguished by `contents[0]`, with an
				// optional numeric argument in `contents[1]` for the first two.
				// Same bare-argument preservation `AtomTextCode` already gives
				// UNDEFINED-FILTER above.
				const sub = code.contents?.[0]?.toUpperCase();
				if (
					sub === "LONGENTRIES" ||
					sub === "MAXSIZE" ||
					sub === "TOOMANY" ||
					sub === "NOPRIVATE"
				) {
					const raw = code.contents?.[1];
					return {
						name: "METADATA",
						subKind: sub,
						value: raw !== undefined && /^\d+$/.test(raw) ? Number(raw) : null,
					};
				}
				// Unrecognized "METADATA ..." shape from a non-conformant
				// server: fall back to the open form rather than guess (I-6).
				return {
					name,
					args: code.contents && code.contents.length ? code.contents.join(" ") : null,
				};
			}
			default:
				return {
					name,
					args: code.contents && code.contents.length ? code.contents.join(" ") : null,
				};
		}
	}
	if (code instanceof CapabilityTextCode) {
		return {
			name,
			args: code.capabilities.capabilities.map((cap) => cap.fullValue).join(" "),
		};
	}
	// Every TextCode variant with a structured (non-flat-string) payload now
	// has its own typed variant above (APPENDUID landed with M2.11's APPEND;
	// COPYUID with M3.8's COPY/MOVE; MODIFIED with M3.11's resp-code sweep).
	// What reaches here is either a genuinely unknown/untyped code (including
	// argument-less or flat-string codes like UNKNOWN-CTE (RFC 3516) and
	// EXPUNGEISSUED (RFC 5530) -- both audited at M3.11 and left generic
	// on purpose: neither carries a client-observable argument or a
	// structured payload the open `{name, args}` shape would lose, and
	// neither's catalog entry (test/compliance/catalog/ext/rfc3516.ts,
	// rfc9051/s7-responses-a.ts) imposes a client-binding duty beyond
	// tolerating/ignoring the code, per RFC 3501/9051 §7.1's "ignore
	// unrecognized response codes" posture) -- surface the code's name with
	// whatever flat args it carries (usually none) rather than guessing at a
	// dedicated shape with no distinguishing behavior to type.
	return { name, args: null };
}

/**
 * Accumulates the responses the router attributed to one in-flight command
 * (spec §7.3): every untagged response `claims()` returned `true` for (in
 * arrival order), plus the tagged response that completed the command.
 *
 * TWO USE SHAPES, one class:
 *
 *  - LEGACY/SNAPSHOT (every command through M3.3, unaffected): construct
 *    with the complete `claimed` array and the `tagged` response already in
 *    hand — `new ResponseCollector(claimed, tagged)`. The instance is
 *    immediately "settled" (see `settled` below); `untagged()`/`first()`/
 *    `tagged()`/`codes()` behave exactly as before M3.4, byte-identical.
 *
 *  - LIVE/INCREMENTAL, the M3.4 FETCH streaming bridge (spec §7.3: "a
 *    claimed FETCH response with a pending literal exposed as a stream
 *    *during* collection, before the tagged OK, so `fetch()` can yield
 *    incrementally"): construct empty (`new ResponseCollector()`) BEFORE
 *    the command's tagged response is known, then feed it as the router
 *    attributes each response via `push()`, and finally `settle(tagged)`
 *    once the tagged response arrives. A consumer calls `live()` — an async
 *    generator — to observe each claimed response THE INSTANT it is
 *    pushed, rather than waiting for `settle()`. This is what lets a
 *    consumer engage with a claimed FETCH response's still-arriving literal
 *    stream (`src/literal-body-stream.ts`) while the command is still in
 *    flight: engaging early is what activates that stream's socket
 *    backpressure (§5.4's "the iterator does not advance past a message
 *    until its live streams are consumed or destroyed").
 *
 *  `execute-command.ts` now always builds the live shape (constructs the
 *  collector empty, feeds it via `push()` as the router claims responses,
 *  calls `settle()` once the tagged response resolves) — this is the ONE
 *  instance production code ever builds. By the time any command's
 *  `accept()` runs (still only invoked once, after `settle()`, unchanged
 *  from pre-M3.4), the snapshot-reading methods below see the exact same
 *  complete, arrival-ordered list they always did — every existing command
 *  is unaffected. `live()` is additive: nothing calls it yet (FETCH, M3.5,
 *  is the first consumer), so no existing behavior changes shape.
 */
export class ResponseCollector {
	private readonly claimedList: UntaggedResponse[];
	private taggedResp: TaggedResponse | undefined;
	private settledFlag: boolean;
	private waiters: Array<() => void> = [];
	/** S1 fix: set only by `abort()` below -- distinguishes an ERROR
	 *  completion (connection teardown mid-command, never a tagged response)
	 *  from an ordinary `settle()` completion for `live()`'s consumer. */
	private abortErr: Error | undefined;

	/**
	 * @param claimed Initial claimed responses (defaults to none — the live
	 *  shape starts empty and grows via `push()`).
	 * @param tagged When provided, the collector is constructed already
	 *  SETTLED (the legacy/snapshot shape above) — omit it to build a live
	 *  collector that `push()`/`settle()` will feed after construction.
	 */
	constructor(claimed: readonly UntaggedResponse[] = [], tagged?: TaggedResponse) {
		this.claimedList = [...claimed];
		this.taggedResp = tagged;
		this.settledFlag = tagged !== undefined;
	}

	/** Whether `settle()` has run (or `tagged` was supplied at construction):
	 *  no further claims will ever be pushed, and `tagged()` is safe to call.
	 *  A `live()` consumer uses this internally to know when to stop; it is
	 *  also exposed here for any external caller than wants to poll it. */
	get settled(): boolean {
		return this.settledFlag;
	}

	/**
	 * LIVE APPEND (spec §7.3): appends one more claimed response, in the
	 * exact order the router attributed it (§8.3's arrival-order invariant
	 * — `execute-command.ts` calls this synchronously, in routing order, the
	 * instant `Router.routeUntagged` claims a response for this command).
	 * Wakes any consumer currently blocked in `live()` awaiting the next
	 * claim. Tolerated (never throws) even if called after `settle()` —
	 * same defensive posture as the rest of this codebase's response
	 * handling (I-6): a non-conformant server sending data after a
	 * command's own tagged response is unusual but not a reason to crash
	 * the router's synchronous dispatch of the NEXT response in the same
	 * tick.
	 */
	push(resp: UntaggedResponse): void {
		this.claimedList.push(resp);
		this.wake();
	}

	/**
	 * Marks collection complete: the command's tagged response is now known
	 * and no more claims are expected. Wakes any `live()` consumer still
	 * waiting so it can observe completion instead of hanging forever.
	 */
	settle(tagged: TaggedResponse): void {
		this.taggedResp = tagged;
		this.settledFlag = true;
		this.wake();
	}

	/**
	 * ABORT (S1 fix, M3-phase-boundary review): marks this collector
	 * permanently done WITHOUT a tagged response ever having arrived --
	 * `execute-command.ts` calls this from its own error path (a connection
	 * teardown racing a still-in-flight command, spec CRITICAL-2) so a
	 * `live()` consumer parked mid-iteration (`FetchCommand.messages()`,
	 * M3.5) settles too, instead of waiting forever for a claim or
	 * settlement that can now never come. Every claim already pushed before
	 * the abort is still yielded first (`live()` drains its buffered
	 * backlog before observing this) -- only the "wait for more" tail of
	 * the generator turns into a rejection, carrying `err` verbatim (e.g.
	 * the connection's own `ConnectionError`) rather than a bespoke
	 * sentinel, so the caller's `for await` surfaces the SAME error
	 * `driver.run()`'s own rejected promise would have.
	 *
	 * A no-op once already settled (via `settle()` or a prior `abort()`) --
	 * whichever completion reaches this collector first wins, same
	 * single-terminal-state discipline `settle()` itself relies on
	 * (`execute-command.ts` never calls both for the same invocation).
	 * `tagged()` keeps throwing its existing defensive assertion after an
	 * abort (spec: no tagged response was ever supplied) -- callers that
	 * reach `tagged()` at all only do so from `accept()`, which never runs
	 * on this path (see `execute-command.ts`'s own catch-and-rethrow).
	 */
	abort(err: Error): void {
		if (this.settledFlag) {
			return;
		}
		this.abortErr = err;
		this.settledFlag = true;
		this.wake();
	}

	private wake(): void {
		const pending = this.waiters;
		this.waiters = [];
		for (const resolve of pending) {
			resolve();
		}
	}

	/**
	 * Incremental observation (spec §7.3, the FETCH streaming bridge): an
	 * async generator yielding every claimed response (optionally filtered
	 * to one `.type`, matching `untagged()`'s filter) in the SAME order the
	 * router attributed them (§8.3) — regardless of whether an earlier
	 * yielded response's own literal stream (M3.2) has finished arriving.
	 * This generator never waits on stream completion; it only waits on the
	 * NEXT claim (or settlement) — a slow consumer draining one response's
	 * stream does not reorder what this yields next, it just delays when
	 * the consumer comes back to ask for it.
	 *
	 * Completes (the generator returns) once `settle()` has run and every
	 * buffered claim has been yielded. Safe to call before any claim has
	 * arrived — it simply awaits the first `push()`/`settle()`. Each call
	 * to `live()` gets its own independent cursor (fan-out, not a
	 * single-reader queue), though no consumer needs more than one today.
	 */
	async *live(type?: string): AsyncGenerator<UntaggedResponse, void, void> {
		const wanted = type === undefined ? undefined : type.toUpperCase();
		let i = 0;
		for (;;) {
			while (i < this.claimedList.length) {
				const next = this.claimedList[i];
				i++;
				if (wanted === undefined || next.type === wanted) {
					yield next;
				}
			}
			if (this.settledFlag) {
				// S1 fix: an abort()-driven completion surfaces as a REJECTION
				// here (once every already-buffered claim has been drained
				// above) rather than a quiet generator return -- see abort()'s
				// own doc comment for why this is the one shape that lets a
				// FETCH `for await` loop observe the connection failure instead
				// of concluding as if the command had simply run out of data.
				if (this.abortErr) {
					throw this.abortErr;
				}
				return;
			}
			await new Promise<void>((resolve) => {
				this.waiters.push(resolve);
			});
		}
	}

	/** Every claimed untagged response, optionally filtered to one `.type`
	 *  (case-insensitive), in arrival order — a point-in-time snapshot (for
	 *  a still-live, unsettled collector: whatever has been pushed so far).
	 *  Every existing caller only calls this once `settle()` has already
	 *  run (a command's `accept()`, invoked once the tagged response
	 *  arrives, unchanged from pre-M3.4), so the snapshot is always
	 *  complete for them. */
	untagged(type?: string): UntaggedResponse[] {
		if (type === undefined) {
			return [...this.claimedList];
		}
		const wanted = type.toUpperCase();
		return this.claimedList.filter((resp) => resp.type === wanted);
	}

	/** The first claimed untagged response of `.type` (case-insensitive), or
	 *  `undefined` if none was claimed (yet, for a still-live collector). */
	first(type: string): UntaggedResponse | undefined {
		const wanted = type.toUpperCase();
		return this.claimedList.find((resp) => resp.type === wanted);
	}

	/** The tagged response that completed this command. Throws if called
	 *  before `settle()` — every existing caller (a command's `accept()`)
	 *  only ever runs after settlement, so this is a defensive assertion on
	 *  a state that should be unreachable in practice, not a new
	 *  control-flow path any shipped code exercises. */
	tagged(): TaggedResponse {
		if (!this.taggedResp) {
			throw new Error("ResponseCollector.tagged() called before the tagged response arrived");
		}
		return this.taggedResp;
	}

	/** Typed response codes carried by every claimed status response, plus
	 *  the tagged line's own code if present, in arrival order (spec §7.3). */
	codes(): TypedResponseCode[] {
		const out: TypedResponseCode[] = [];
		for (const resp of this.claimedList) {
			const content = resp.content as { text?: { code?: TextCode } } | undefined;
			const code = toTypedResponseCode(content?.text?.code);
			if (code) {
				out.push(code);
			}
		}
		const taggedCode = this.taggedResp
			? toTypedResponseCode(this.taggedResp.status.text?.code)
			: null;
		if (taggedCode) {
			out.push(taggedCode);
		}
		return out;
	}
}
