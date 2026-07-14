import { CapabilityError } from "../../errors";
import { GetMetadataCommand } from "../../commands/metadata/get-metadata";
import type { GetMetadataOptions, MetadataResult } from "../../commands/metadata/get-metadata";
import { SetMetadataCommand } from "../../commands/metadata/set-metadata";
import type { MetadataSetEntry } from "../../commands/metadata/set-metadata";
import type { FacetDriver } from "./driver";

export type { GetMetadataOptions, MetadataEntryResult, MetadataResult } from "../../commands/metadata/get-metadata";
export type { MetadataSetEntry } from "../../commands/metadata/set-metadata";

/**
 * `ImapClient.metadata` (spec §3.6, RFC 5464) — M5.4. Copies the facet
 * pattern `client/facets/quota.ts` establishes VERBATIM (lazy construction
 * lives in `client.ts`, not here; capability-gate-then-delegate is the first
 * statement of every method below; `FacetDriver` is the shared seam) — see
 * that module's header comment for the full worked-example writeup this
 * class does not repeat.
 *
 * ONE DEVIATION FROM `QuotaFacetImpl`'s gate, called out explicitly per the
 * M5 plan's own design note: spec §3.6's facet table lists METADATA's
 * capability column as "METADATA / METADATA-SERVER" — a server advertising
 * ONLY `METADATA-SERVER` (server-level annotations, no mailbox-scoped ones)
 * still gets a working `metadata` facet; RFC 5464 §1 draws no distinction
 * between the two capabilities at the command/response-syntax level, only
 * at which entries the SERVER happens to accept (enforced by the server's
 * own NO responses, e.g. `[METADATA NOPRIVATE]`, not a client-side
 * pre-check). Both methods below therefore gate on `METADATA ||
 * METADATA-SERVER`, never `METADATA` alone.
 *
 * FILTERS (RFC 5466) has no facet or command of its own — it is entirely
 * this facet's `set()`/`get()` against the reserved `/private/filters/...`/
 * `/shared/filters/...` entry hierarchy, referenced from SEARCH via the
 * `filter` key (`commands/search-criteria.ts`, gated on `FILTERS`). A caller
 * creates/updates a named filter with:
 *
 *   client.metadata.set("", [
 *     { entry: "/private/filters/values/<name>", value: "<search-criteria>" },
 *   ]);
 *
 * (the mailbox argument is the empty string — a SERVER annotation, RFC 5466
 * §3.2 — and the value is itself an IMAP search-criteria string, UTF-8
 * encoded on the wire per RFC5466-3.2-1) and then references it with
 * `criteria.filter = "<name>"` in a subsequent `search()`/`sort()`. Nothing
 * in this API creates a named filter beyond this ordinary `metadata.set()`
 * call — see `docs/compliance-adjudications.md`'s RFC5466 entry for the
 * M4.14/M5.4 scope history.
 */
export interface MetadataFacet {
	/** GETMETADATA (RFC 5464 §4.2). `opts` carries the MAXSIZE/DEPTH options
	 *  (§4.2.1/§4.2.2); the result's `longEntries` is populated only when the
	 *  tagged OK carried `[METADATA LONGENTRIES n]` (RFC5464-4.2.1-1). */
	get(mailbox: string, entries: string[], opts?: GetMetadataOptions): Promise<MetadataResult>;
	/** SETMETADATA (RFC 5464 §4.3). An entry's `value: null` removes it
	 *  (NIL-to-remove, RFC5464-4.3-2) — distinct from `value: ""`, which
	 *  sets a genuine zero-length value. Resolves with no payload: per
	 *  RFC5464-4.3-3, success itself is the only signal a conformant client
	 *  may rely on. */
	set(mailbox: string, entries: MetadataSetEntry[]): Promise<void>;
}

const METADATA_RFC = "RFC5464";

/** `MetadataFacet`'s concrete implementation — see this module's header
 *  comment, and `client/facets/quota.ts`'s, for the full facet-pattern
 *  rationale every method here follows. */
export class MetadataFacetImpl implements MetadataFacet {
	constructor(private readonly driver: FacetDriver) {}

	async get(mailbox: string, entries: string[], opts?: GetMetadataOptions): Promise<MetadataResult> {
		this.assertMetadataCapability("metadata.get");
		return this.driver.run(new GetMetadataCommand(mailbox, entries, opts));
	}

	async set(mailbox: string, entries: MetadataSetEntry[]): Promise<void> {
		this.assertMetadataCapability("metadata.set");
		return this.driver.run(new SetMetadataCommand(mailbox, entries));
	}

	/** The capability gate, factored into one place so both methods enforce
	 *  the identical rule/message rather than two independently maintained
	 *  copies that could drift. Still called as literally the first
	 *  statement of every public method above. Accepts EITHER `METADATA` or
	 *  `METADATA-SERVER` — see this class's header comment for why. */
	private assertMetadataCapability(method: string): void {
		if (!this.driver.hasCapability("METADATA") && !this.driver.hasCapability("METADATA-SERVER")) {
			throw new CapabilityError(
				`${method}() requires the METADATA or METADATA-SERVER capability (RFC 5464 §1), which ` +
					"the server hasn't advertised",
				{ capability: "METADATA", rfc: METADATA_RFC },
			);
		}
	}
}
