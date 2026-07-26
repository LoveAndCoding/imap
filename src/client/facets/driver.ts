import type { Command } from "../../commands/base";

/**
 * The minimal callback surface `ImapClient` hands each §3.6 extension facet
 * it constructs (`quota`/`acl`/`metadata`/`urlauth`) — mirrors
 * `MailboxSessionDriver`'s own narrow-seam convention (`client/mailbox.ts`):
 * a full `ImapClient` reference is deliberately NOT threaded through (that
 * would let a facet reach far more of the client than it needs, and would
 * create an import cycle with `client.ts`, which must import the facet
 * implementation to construct it). This is the minimal capability set every
 * facet method's capability-gate-then-delegate shape (spec §3.6, M5 plan's
 * "Shared design notes") actually needs:
 *
 *   1. `hasCapability()` — the capability gate, checked synchronously as the
 *      FIRST line of every facet method, before any bytes are written (I-9).
 *   2. `run()` — delegation to the facet method's Layer-2 command, through
 *      the SAME state/capability-gated chokepoint (`ImapClient.run()`) every
 *      other verb in this codebase goes through (so a facet method's own
 *      command still gets the state-machine check, the credential-over-
 *      cleartext guard, etc. — nothing about going through a facet skips any
 *      of `run()`'s existing enforcement).
 *
 * Established at M5.2 (the QUOTA facet, first of the four to land) as the
 * shared shape every subsequent facet (ACL/METADATA/URLAUTH) reuses
 * VERBATIM — import this interface rather than declaring a second,
 * differently-named-but-identically-shaped one. See `client/facets/quota.ts`'s
 * header comment for the full worked example of the facet pattern this
 * interface supports.
 */
export interface FacetDriver {
	run<T>(command: Command<T>): Promise<T>;
	hasCapability(cap: string): boolean;
}
