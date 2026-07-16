import { CapabilityError } from "../../errors";
import { ThreadResponse } from "../../parser";
import type { UntaggedResponse } from "../../parser";
import type { ThreadAlgorithm } from "../../protocol/vocabularies";
import { Command } from "../base";
import type { ClaimContext } from "../base";
import type { ResponseCollector } from "../collector";
import {
	NO_SEARCH_CAPS,
	compileCriteria,
	resolveMandatoryCharset,
} from "../search-criteria";
import type { SearchCapabilityProbe, SearchCriteria } from "../search-criteria";
import type { SearchOptions } from "../search";
import { CommandWriter } from "../writer";

/**
 * `ThreadNode` (spec §5b/§5.6) — the recursive shape `MailboxSession.
 * thread()`/`.seq.thread()` resolve to. **Spec gap, resolved here (M4.9,
 * Shared design note 3):** spec §5b references `ThreadNode[]` as `thread()`'s
 * return type but never defines it anywhere in the document; per the M4
 * plan's kickoff research and the milestone's own adjudicated resolution,
 * this shape is adapted from the already-real internal parser
 * (`src/parser/structure/thread.ts`'s `ThreadResponse`/`ThreadMessage`,
 * which the untagged `* THREAD`/`* UID THREAD` response already parses into
 * fully): `{ uid?: number; seq?: number; children: ThreadNode[] }`,
 * recursive, with EXACTLY ONE of `uid`/`seq` populated (never both) per the
 * grain of the facet call that produced it (`thread()` → `uid`; `seq.
 * thread()` → `seq` — mirroring the uid-grain-default settled decision,
 * proposal §6.2) — except for the RFC's own "missing-parent" orphan form
 * (`thread-nested` with no leading `nz-number`, e.g. `((3)(5))`), where
 * NEITHER `uid` nor `seq` is populated: that node represents no message at
 * all, only a grouping of its `children`.
 */
export interface ThreadNode {
	uid?: number;
	seq?: number;
	children: ThreadNode[];
}

/** Minimal structural shape this module needs from the internal parser's
 *  `ThreadMessage` (kept structural, not a nominal import of the parser's
 *  internal class, the same "depend on shape, not on the producing class"
 *  posture `commands/copy.ts`'s `SequenceSetLike` documents for its own
 *  minimal producer interface). */
interface ParsedThreadMessage {
	readonly id?: number;
	readonly children: readonly ParsedThreadMessage[];
}

/** Converts one parsed thread root (recursively) into a public `ThreadNode`,
 *  stamping `uid` or `seq` per `uidGrain` -- never both, and neither when
 *  `msg.id` is `undefined` (the missing-parent orphan form). */
function adaptThreadMessage(msg: ParsedThreadMessage, uidGrain: boolean): ThreadNode {
	const node: ThreadNode = {
		children: msg.children.map((child) => adaptThreadMessage(child, uidGrain)),
	};
	if (msg.id !== undefined) {
		if (uidGrain) {
			node.uid = msg.id;
		} else {
			node.seq = msg.id;
		}
	}
	return node;
}

/**
 * RFC5256-BASE.6.4.THREAD-6: "Client implementations SHOULD treat
 * descendents of a child in a server response as being siblings of that
 * child" -- context: ORDEREDSUBJECT threads are defined to be at most two
 * levels deep ("there are no grandchildren in ORDEREDSUBJECT threading"), so
 * a non-conformant server response that nests deeper anyway is normalized by
 * flattening every descendant of the root's children up to be the root's own
 * DIRECT children (siblings), rather than delivered as a deep chain. A no-op
 * for any already-compliant (at-most-one-level) response -- `collect()` only
 * ever recurses into (and then clears) a child that itself has children, so
 * an ordinary flat `[A, B]` child list with no grandchildren of its own comes
 * back byte-for-byte unchanged. Mutates `node.children` in place; only ever
 * called on a freshly built `ThreadNode` this module itself owns.
 */
function flattenOrderedSubjectDescendants(node: ThreadNode): void {
	const flattened: ThreadNode[] = [];
	const collect = (children: readonly ThreadNode[]): void => {
		for (const child of children) {
			flattened.push(child);
			if (child.children.length > 0) {
				collect(child.children);
				child.children = [];
			}
		}
	};
	collect(node.children);
	node.children = flattened;
}

function compileThreadWire(
	w: CommandWriter,
	algorithm: ThreadAlgorithm,
	charset: string,
	criteria: SearchCriteria,
	caps: SearchCapabilityProbe,
): void {
	// RFC 5256 §5: thread = ["UID" SP] "THREAD" SP thread-alg SP
	// search-criteria -- the algorithm atom is UNparenthesized (unlike SORT's
	// criteria list), then the (mandatory) charset, then one or more search
	// keys.
	w.atom(algorithm);
	w.astring(charset);
	compileCriteria(w, criteria, caps);
}

/**
 * THREAD / UID THREAD (RFC 5256 §3 BASE.6.4.THREAD — M4.9). A variant of
 * SEARCH that groups its matches into threads instead of returning a flat
 * list. `queueMode: "pipeline"` (spec §6.1), legal only from `"selected"`.
 *
 * Capability gate (I-9, zero bytes written on failure): `THREAD=<algorithm>`
 * PER ALGORITHM (RFC5256-1-2 — a client must only ever name an algorithm the
 * server has actually advertised via its own `THREAD=` token; there is no
 * bare `THREAD` capability the way SORT has a bare `SORT` token). The
 * catalog's REV2 ADJUDICATION note applies here too: THREAD is never folded
 * into IMAP4rev2 core, so there is no OR-with-rev2 gate.
 *
 * ESORT SEAM (M4.10, RFC 5267; re-verified at the M5 CONTEXT-machinery
 * carry-forward): `opts.return`/`.partial`/`.update` are typed (via the
 * shared `SearchOptions`) but throw `CapabilityError` synchronously --
 * PERMANENTLY, not "until a later milestone": RFC 5267 extends only SEARCH
 * and SORT, never THREAD, so there is no spec-legal wire form for these
 * options on this command at all.
 */
export class ThreadCommand extends Command<ThreadNode[]> {
	readonly verb: string;
	readonly queueMode = "pipeline" as const;
	readonly states = ["selected"] as const;
	readonly capability: string[];

	private readonly algorithm: ThreadAlgorithm;
	private readonly criteria: SearchCriteria;
	private readonly charset: string;
	private readonly caps: SearchCapabilityProbe;
	private readonly uidGrain: boolean;

	constructor(
		algorithm: ThreadAlgorithm,
		criteria: SearchCriteria,
		opts: SearchOptions = {},
		caps: SearchCapabilityProbe = NO_SEARCH_CAPS,
		uid = false,
	) {
		super();
		this.verb = uid ? "UID THREAD" : "THREAD";
		const algo = typeof algorithm === "string" ? algorithm.toUpperCase() : "";
		if (algo !== "ORDEREDSUBJECT" && algo !== "REFERENCES") {
			throw new RangeError(
				`${this.verb}: ${JSON.stringify(algorithm)} is not a registered threading ` +
					'algorithm (expected "ORDEREDSUBJECT" or "REFERENCES", RFC 5256 §5)',
			);
		}
		const requiredCap = `THREAD=${algo}`;
		this.capability = [requiredCap];
		if (!caps.has(requiredCap)) {
			throw new CapabilityError(
				`${this.verb} ${algo} requires the ${requiredCap} capability (RFC 5256), ` +
					"which the server hasn't advertised",
				{ capability: requiredCap, rfc: "RFC5256" },
			);
		}
		if (opts.return !== undefined || opts.partial !== undefined || opts.update !== undefined) {
			throw new CapabilityError(
				`${this.verb}: RETURN (...)/PARTIAL/UPDATE result options are not defined ` +
					"for THREAD -- RFC 5267 extends only SEARCH and SORT (§3/§4), and RFC " +
					"9394's PARTIAL likewise never touches THREAD; call thread() without " +
					"`opts.return`/`opts.partial`/`opts.update` (M5 carry-forward note: " +
					"SEARCH and SORT now implement all three for real)",
				{ capability: "ESORT", rfc: "RFC5267" },
			);
		}
		if (typeof criteria !== "object" || criteria === null || Array.isArray(criteria)) {
			throw new RangeError("THREAD: criteria must be a SearchCriteria object");
		}
		if (Object.keys(criteria).length === 0) {
			throw new RangeError(
				"THREAD requires at least one search key (RFC 5256 §5: search-criteria = " +
					"charset 1*(SP search-key))",
			);
		}
		this.algorithm = algo as ThreadAlgorithm;
		this.criteria = criteria;
		this.caps = caps;
		this.uidGrain = uid;
		this.charset = resolveMandatoryCharset(opts.charset, criteria);
		// Pre-compile once against a throwaway writer purely to surface any
		// CapabilityError/RangeError synchronously (I-9).
		compileThreadWire(
			new CommandWriter({ has: (cap) => caps.has(cap) }),
			this.algorithm,
			this.charset,
			this.criteria,
			this.caps,
		);
	}

	protected write(w: CommandWriter): void {
		compileThreadWire(w, this.algorithm, this.charset, this.criteria, this.caps);
	}

	/** Claims the untagged `* THREAD` response family -- see `SortCommand.
	 *  claims()`'s doc comment for the identical no-correlator/`chainFamily`
	 *  reasoning (here `MailboxSession.runThread()`'s `"thread"` family). */
	protected claims(resp: UntaggedResponse, _ctx: ClaimContext): boolean {
		return resp.type === "THREAD" && resp.content instanceof ThreadResponse;
	}

	protected accept(c: ResponseCollector): ThreadNode[] {
		const lines = c.untagged("THREAD").filter((line) => line.content instanceof ThreadResponse);
		if (lines.length === 0) {
			return [];
		}
		const content = lines[lines.length - 1].content as ThreadResponse;
		return content.threads.map((thread) => {
			const node = adaptThreadMessage(thread, this.uidGrain);
			if (this.algorithm === "ORDEREDSUBJECT") {
				flattenOrderedSubjectDescendants(node);
			}
			return node;
		});
	}
}
