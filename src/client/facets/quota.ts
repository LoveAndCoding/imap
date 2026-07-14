import { CapabilityError } from "../../errors";
import { GetQuotaCommand } from "../../commands/quota/get-quota";
import type { QuotaResourceUsage, QuotaResult } from "../../commands/quota/get-quota";
import { GetQuotaRootCommand } from "../../commands/quota/get-quota-root";
import type { QuotaRootResult } from "../../commands/quota/get-quota-root";
import { SetQuotaCommand } from "../../commands/quota/set-quota";
import type { QuotaLimitEntry } from "../../commands/quota/set-quota";
import type { FacetDriver } from "./driver";

export type { QuotaLimitEntry, QuotaResourceUsage, QuotaResult, QuotaRootResult };

/**
 * `ImapClient.quota` (spec §3.6, RFC 9208) — M5.2.
 *
 * ============================================================================
 * THE FACET PATTERN — reference implementation for every §3.6 extension
 * facet (quota/acl/metadata/urlauth). Read this before writing ACL's,
 * METADATA's, or URLAUTH's facet module — copy this shape verbatim, do not
 * invent a second one.
 * ============================================================================
 *
 * 1. LAZY CONSTRUCTION IS A `client.ts`-LEVEL CONCERN, NOT A FACET-LEVEL ONE.
 *    `QuotaFacetImpl` itself has nothing lazy about it — it is an ordinary,
 *    cheap-to-construct class. Laziness lives entirely in `ImapClient`: a
 *    private nullable field (`_quota: QuotaFacet | null = null`) plus a
 *    `public get quota(): QuotaFacet` accessor that constructs
 *    `QuotaFacetImpl` on FIRST READ and caches it thereafter. The facet is
 *    NEVER built in `ImapClient`'s constructor. This means:
 *      - `client.quota` is a plain PROPERTY (visible in autocomplete without
 *        a call, spec §3.6: "Facet objects are created lazily but are plain
 *        properties") — never `client.quota()`.
 *      - Repeated reads return the IDENTICAL object (`client.quota ===
 *        client.quota`), so a caller may freely hold onto the reference.
 *      - Construction has no side effects (no command is run, no state is
 *        touched) — it is safe to construct even against a server that will
 *        never advertise `QUOTA` at all; the capability gate lives in each
 *        METHOD, not in the constructor.
 *    See `client.ts`'s `quota` getter and `facetDriver()` for the concrete
 *    wiring; every later facet (`acl`/`metadata`/`urlauth`) adds the
 *    identical private-field + getter pair, nothing more.
 *
 * 2. CAPABILITY-GATE-THEN-DELEGATE, ALWAYS IN THAT ORDER, ALWAYS THE FIRST
 *    LINE OF THE METHOD BODY. Every method below:
 *      (1) checks its capability against the live registry (via
 *          `FacetDriver.hasCapability()`) — absent → throw `CapabilityError
 *          { capability, rfc }` SYNCHRONOUSLY, before anything else runs, so
 *          zero bytes are ever written (I-9). This is a plain `if` as
 *          literally the first statement in the method — a reviewer should
 *          be able to confirm the gate by reading only the first line.
 *      (2) ONLY THEN constructs and delegates to the Layer-2 command
 *          (`GetQuotaCommand`/`GetQuotaRootCommand`/`SetQuotaCommand`) via
 *          `FacetDriver.run()` — the same state-machine/capability/
 *          credential-policy chokepoint (`ImapClient.run()`) every other verb
 *          in this codebase goes through. (Each command ALSO declares its own
 *          `capability` field, so a caller who reaches the command directly
 *          through `client.run(new GetQuotaCommand(...))`, bypassing the
 *          facet entirely, still gets the identical gate enforced a second
 *          time — the same defense-in-depth two-layer pattern
 *          `ImapClient.create()`'s `CREATE-SPECIAL-USE` check uses.)
 *      (3) returns whatever the command's `accept()` already produced —
 *          `QuotaResult`/`QuotaRootResult`, never the raw
 *          `QuotaResponse`/`QuotaRootResponse` parser structure. The
 *          command's own `accept()` is where parser output becomes a public
 *          type (see `get-quota.ts`'s `toQuotaResult()`); the facet method
 *          does no further translation, just a straight return.
 *
 * 3. `FacetDriver` (`client/facets/driver.ts`) IS THE SHARED SEAM. A facet
 *    implementation is constructed with a `FacetDriver` — never a raw
 *    `ImapClient` reference (that would create a `client.ts` <-> facet
 *    import cycle and hand the facet far more privilege than a
 *    two-method capability-gate-then-delegate shape needs). Every later
 *    facet imports the SAME `FacetDriver` interface rather than declaring
 *    its own differently-named equivalent.
 *
 * 4. GET/ROOTS/SET ARE THREE DISTINCT ARGUMENT SHAPES, PER §3.6's OWN TABLE
 *    (`get(root)`, `roots(mailbox)`, `set(root, limits)`) — do not conflate
 *    them. `get()` and `set()` take a quota ROOT name (an opaque astring,
 *    RFC 9208 §3.2 — NOT a mailbox name); `roots()` takes a MAILBOX name
 *    (GETQUOTAROOT's actual argument) and returns the root(s) that govern
 *    it, plus whatever QUOTA data the server chose to report alongside. See
 *    `get-quota.ts`/`get-quota-root.ts`'s own doc comments for the full
 *    root-vs-mailbox distinction and the wire-codec consequence (astring vs
 *    the M2.1 mailbox-name codec).
 *
 * 5. RESOURCE NAMES STAY CASE-INSENSITIVE-AT-THE-PARSER, VERBATIM-ABOVE-IT
 *    (I-5, RFC9208-7-1). `src/parser/structure/quota.ts` already accepts
 *    "STORAGE"/"storage"/"Storage" identically on the wire; nothing in this
 *    facet, or in the command classes it delegates to, re-imposes a
 *    case-sensitive comparison anywhere on top of that — resource names
 *    flow through as plain, uncased strings (`QuotaResourceUsage.resource`,
 *    `QuotaLimitEntry.resource`) with no `.toUpperCase()`/`.toLowerCase()`
 *    normalization added by this layer. A caller who wants case-insensitive
 *    lookups performs that normalization itself.
 *
 * Capability: `QUOTA` (spec §3.6 table) — the bare capability, not any
 * `QUOTA=RES-*` resource-advertisement token (RFC9208-1-1: a client MUST NOT
 * rely on those without seeing one, but issuing GETQUOTA/GETQUOTAROOT/
 * SETQUOTA itself only ever needs bare `QUOTA`). All three methods gate on
 * the identical capability name — RFC 9208 draws no distinction between
 * read (GETQUOTA/GETQUOTAROOT) and write (SETQUOTA) access at the
 * capability-advertisement level (the `QUOTASET` token some servers also
 * advertise is a SERVER-side "will I actually accept a SETQUOTA" signal,
 * catalogued as a server-only duty, not a client-side gate this facet
 * enforces — see `set-quota.ts`'s own doc comment).
 */
export interface QuotaFacet {
	/** GETQUOTA (RFC 9208 §4.1.1) — the resource list for a quota root named
	 *  directly (an opaque astring, not a mailbox name). */
	get(root: string): Promise<QuotaResult>;
	/** GETQUOTAROOT (RFC 9208 §4.1.2) — the quota root(s) governing a
	 *  mailbox, plus whatever QUOTA data the server reports alongside. */
	roots(mailbox: string): Promise<QuotaRootResult>;
	/** SETQUOTA (RFC 9208 §4.1.3) — replaces a quota root's resource limits
	 *  wholesale with `limits` (never additive/merging — RFC 9208 §4.1.3:
	 *  "discards any previous limits"), echoing back whatever the server
	 *  confirms. */
	set(root: string, limits: QuotaLimitEntry[]): Promise<QuotaResult>;
}

const QUOTA_CAPABILITY = "QUOTA";
const QUOTA_RFC = "RFC9208";

/** `QuotaFacet`'s concrete implementation — see this module's header
 *  comment for the full facet-pattern rationale every method here follows. */
export class QuotaFacetImpl implements QuotaFacet {
	constructor(private readonly driver: FacetDriver) {}

	async get(root: string): Promise<QuotaResult> {
		this.assertQuotaCapability("quota.get");
		return this.driver.run(new GetQuotaCommand(root));
	}

	async roots(mailbox: string): Promise<QuotaRootResult> {
		this.assertQuotaCapability("quota.roots");
		return this.driver.run(new GetQuotaRootCommand(mailbox));
	}

	async set(root: string, limits: QuotaLimitEntry[]): Promise<QuotaResult> {
		this.assertQuotaCapability("quota.set");
		return this.driver.run(new SetQuotaCommand(root, limits));
	}

	/** The capability gate, factored into one place so all three methods
	 *  enforce the identical rule/message rather than three independently
	 *  maintained copies that could drift. Still called as literally the
	 *  first statement of every public method above — factoring the check's
	 *  BODY into a helper does not change where it runs. */
	private assertQuotaCapability(method: string): void {
		if (!this.driver.hasCapability(QUOTA_CAPABILITY)) {
			throw new CapabilityError(
				`${method}() requires the QUOTA capability (RFC 9208 §1), which the ` +
					"server hasn't advertised",
				{ capability: QUOTA_CAPABILITY, rfc: QUOTA_RFC },
			);
		}
	}
}
