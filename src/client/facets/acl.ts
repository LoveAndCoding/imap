import { CapabilityError } from "../../errors";
import { DeleteAclCommand } from "../../commands/acl/delete-acl";
import { GetAclCommand } from "../../commands/acl/get-acl";
import type { AclEntry, AclResult } from "../../commands/acl/get-acl";
import { ListRightsCommand } from "../../commands/acl/list-rights";
import type { ListRightsResult } from "../../commands/acl/list-rights";
import { MyRightsCommand } from "../../commands/acl/my-rights";
import { SetAclCommand } from "../../commands/acl/set-acl";
import type { FacetDriver } from "./driver";

export type { AclEntry, AclResult, ListRightsResult };

/**
 * `ImapClient.acl` (spec §3.6, RFC 4314 + RFC 8440's LIST-MYRIGHTS return
 * option) — M5.3.
 *
 * FACET PATTERN CONFORMANCE: this module follows `client/facets/quota.ts`'s
 * header comment VERBATIM — that comment is the one canonical writeup of
 * the shared §3.6 facet pattern (lazy construction lives in `client.ts`, not
 * here; capability-gate-then-delegate, gate as the literal first statement
 * of every method; `FacetDriver` is the only seam threaded through; a
 * facet method returns a plain typed result, never a raw parser structure).
 * Read it before reading the rest of this file. What follows here is only
 * the ACL-specific detail the quota header doesn't cover:
 *
 * 1. FIVE METHODS, FIVE DISTINCT ARGUMENT/RESULT SHAPES (spec §3.6's table:
 *    `get(mb)`, `set(mb, id, rights)`, `delete(mb, id)`, `rights(mb, id)`,
 *    `myRights(mb)`). `rights(mb, id)` (LISTRIGHTS) asks what a SPECIFIC
 *    identifier COULD be granted; `myRights(mb)` (MYRIGHTS) asks what the
 *    LOGGED-IN USER actually holds — these are never collapsed into one
 *    method even though both return rights-string-shaped data (see
 *    `commands/acl/list-rights.ts`'s own doc comment for the full
 *    distinction). `set()`/`delete()` (SETACL/DELETEACL) return `void` —
 *    RFC 4314 defines no untagged response for either, unlike SETQUOTA's
 *    QUOTA echo.
 *
 * 2. RIGHTS STRINGS ARE AN OPEN VOCABULARY (I-6's tolerance posture, applied
 *    here at the facet layer): `rights` is typed as a plain `string`
 *    everywhere in this module (SETACL's third argument, GETACL/LISTRIGHTS/
 *    MYRIGHTS results), never a closed union of the RFC's standard letters.
 *    RFC 4314 §2.1 lists the base rights, but §7 explicitly reserves digits
 *    for "implementation- or site-defined rights" — a server MAY define
 *    extension rights this client has never heard of, and a closed union
 *    would reject a legal-but-uncommon server-defined right at the type
 *    level. `set()` additionally passes its `rights` argument straight to
 *    `SetAclCommand` uninterpreted — the optional "+"/"-" prefix (add/
 *    remove) versus a bare replace string is the CALLER's choice (RFC 4314
 *    §3.1), never rewritten or validated here (RFC4314-3.1-1/-2's client-
 *    binding duties: this facet does not invent a restriction the SERVER's
 *    own BAD-on-unrecognized-right enforcement already covers). This
 *    pass-through posture is also what satisfies RFC4314-5.1.2-1 (a
 *    read+update client MUST preserve rights it doesn't recognize): because
 *    `set()` never parses or filters the `rights` string, a caller that
 *    re-emits an unmodified/partially-modified rights string it read via
 *    `get()` carries every character through unchanged, including ones it
 *    doesn't recognize — there is no facet-level opportunity for such a
 *    right to be silently dropped.
 *
 * 3. VIRTUAL "d"/"c" RIGHTS ARE NOT STRIPPED HERE (RFC4314-2.1.1-3). RFC
 *    4314 §2.1.1's "(*)" footnote says a conformant CLIENT must ignore the
 *    virtual "d"/"c" rights riding alongside their member rights in
 *    MYRIGHTS/ACL/LISTRIGHTS responses — but "ignore" is a caller-side
 *    reading discipline (don't treat 'd'/'c' as if they were independent
 *    grants beyond their already-included members), not a mandate to
 *    mutate the wire data. This facet (like `GetAclCommand`/
 *    `ListRightsCommand`/`MyRightsCommand` underneath it) returns rights
 *    strings EXACTLY as the server sent them; a caller satisfies the MUST
 *    by relying on the member rights and simply not double-counting 'd'/'c'
 *    as additional distinct rights of their own.
 *
 * Capability: `ACL` (RFC 4314's own capability name, spec §3.6 table) — all
 * five methods gate on the identical capability; RFC 4314 draws no
 * distinction between read (GETACL/LISTRIGHTS/MYRIGHTS) and write (SETACL/
 * DELETEACL) access at the capability-advertisement level.
 */
export interface AclFacet {
	/** GETACL (RFC 4314 §3.3) — the full access control list for `mb`. */
	get(mb: string): Promise<AclResult>;
	/** SETACL (RFC 4314 §3.1) — sets `identifier`'s rights on `mb` to
	 *  `rights` verbatim (optional "+"/"-" prefix = add/remove, bare =
	 *  replace wholesale; the caller's choice, not reinterpreted here). */
	set(mb: string, identifier: string, rights: string): Promise<void>;
	/** DELETEACL (RFC 4314 §3.2) — removes `identifier`'s ACL entry from
	 *  `mb` entirely. */
	delete(mb: string, identifier: string): Promise<void>;
	/** LISTRIGHTS (RFC 4314 §3.4) — the rights `identifier` could be granted
	 *  on `mb` (a hypothetical/administrative query), distinct from
	 *  `myRights()`. */
	rights(mb: string, identifier: string): Promise<ListRightsResult>;
	/** MYRIGHTS (RFC 4314 §3.5) — the rights the LOGGED-IN USER actually
	 *  holds on `mb`. */
	myRights(mb: string): Promise<string>;
}

const ACL_CAPABILITY = "ACL";
const ACL_RFC = "RFC4314";

/** `AclFacet`'s concrete implementation — see this module's header comment
 *  (and `client/facets/quota.ts`'s, the canonical pattern writeup) for the
 *  full facet-pattern rationale every method here follows. */
export class AclFacetImpl implements AclFacet {
	constructor(private readonly driver: FacetDriver) {}

	async get(mb: string): Promise<AclResult> {
		this.assertAclCapability("acl.get");
		return this.driver.run(new GetAclCommand(mb));
	}

	async set(mb: string, identifier: string, rights: string): Promise<void> {
		this.assertAclCapability("acl.set");
		return this.driver.run(new SetAclCommand(mb, identifier, rights));
	}

	async delete(mb: string, identifier: string): Promise<void> {
		this.assertAclCapability("acl.delete");
		return this.driver.run(new DeleteAclCommand(mb, identifier));
	}

	async rights(mb: string, identifier: string): Promise<ListRightsResult> {
		this.assertAclCapability("acl.rights");
		return this.driver.run(new ListRightsCommand(mb, identifier));
	}

	async myRights(mb: string): Promise<string> {
		this.assertAclCapability("acl.myRights");
		return this.driver.run(new MyRightsCommand(mb));
	}

	/** The capability gate, factored into one place so all five methods
	 *  enforce the identical rule/message rather than five independently
	 *  maintained copies that could drift. Still called as literally the
	 *  first statement of every public method above — factoring the check's
	 *  BODY into a helper does not change where it runs. */
	private assertAclCapability(method: string): void {
		if (!this.driver.hasCapability(ACL_CAPABILITY)) {
			throw new CapabilityError(
				`${method}() requires the ACL capability (RFC 4314 §1), which the ` +
					"server hasn't advertised",
				{ capability: ACL_CAPABILITY, rfc: ACL_RFC },
			);
		}
	}
}
