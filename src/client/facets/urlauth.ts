import { CapabilityError } from "../../errors";
import { GenUrlAuthCommand } from "../../commands/urlauth/gen-url-auth";
import type { UrlauthRump } from "../../commands/urlauth/gen-url-auth";
import { UrlFetchCommand } from "../../commands/urlauth/url-fetch";
import type { UrlFetchOptions, UrlFetchResultItem } from "../../commands/urlauth/url-fetch";
import { ResetKeyCommand } from "../../commands/urlauth/reset-key";
import type { FacetDriver } from "./driver";

export type { UrlauthRump } from "../../commands/urlauth/gen-url-auth";
export type { UrlFetchMetadataItem, UrlFetchOptions, UrlFetchResultItem } from "../../commands/urlauth/url-fetch";

/**
 * `ImapClient.urlauth` (spec §3.6, RFC 4467 + RFC 5524's URLAUTH=BINARY
 * extension) — M5.5. Follows `client/facets/quota.ts`'s THE FACET PATTERN
 * verbatim (lazy construction lives in `client.ts`, not here; every method
 * below is capability-gate-THEN-delegate, gate as the first statement).
 *
 * IMAP URL HANDLING SCOPE (this task's judgment call, per the M5 plan's
 * design constraints): this facet — and every command it delegates to —
 * treats IMAP URLs as OPAQUE STRINGS. It does not parse or construct RFC
 * 5092 URL structure. `generate()`'s `rumps[].url` is a "url-rump" the
 * CALLER builds (already carrying its own `;URLAUTH=<access>` component,
 * RFC4467-3-1..5); `fetch()`'s `urls` are complete, already-authorized
 * "url-full" strings (typically ones a prior `generate()` call returned).
 * The one piece of URL-shaped validation this facet's commands DO perform
 * (`GenUrlAuthCommand`'s RFC4467-3-2/-3-6 checks) is a narrow substring
 * check, not a parser — see that command's own doc comment.
 */
export interface UrlauthFacet {
	/** GENURLAUTH (RFC 4467 §7/§9) — authorizes one or more url-rumps,
	 *  returning the freshly-authorized full URL(s) in the same order. */
	generate(rumps: UrlauthRump[]): Promise<string[]>;
	/** URLFETCH (RFC 4467 §7/§9; RFC 5524 §3 when `opts` requests BINARY/
	 *  BODY/BODYPARTSTRUCTURE) — dereferences one or more already-authorized
	 *  url-fulls. A per-url result carries `data: null` for an invalid/
	 *  expired URL (RFC4467-8-3) rather than throwing — never a per-item
	 *  throw inside a multi-URL batch. */
	fetch(urls: string[], opts?: UrlFetchOptions): Promise<UrlFetchResultItem[]>;
	/** RESETKEY (RFC 4467 §7/§9) — resets a mailbox access key (or, with no
	 *  `mailbox`, every mailbox's key, RFC 4467's own documented default). */
	resetKey(mailbox?: string, mechanisms?: string[]): Promise<void>;
}

const URLAUTH_CAPABILITY = "URLAUTH";
const URLAUTH_BINARY_CAPABILITY = "URLAUTH=BINARY";
const URLAUTH_RFC = "RFC4467";
const URLAUTH_BINARY_RFC = "RFC5524";

/** `UrlauthFacet`'s concrete implementation — see this module's header
 *  comment and `client/facets/quota.ts`'s full facet-pattern writeup. */
export class UrlauthFacetImpl implements UrlauthFacet {
	constructor(private readonly driver: FacetDriver) {}

	async generate(rumps: UrlauthRump[]): Promise<string[]> {
		this.assertUrlauthCapability("urlauth.generate");
		return this.driver.run(new GenUrlAuthCommand(rumps));
	}

	async fetch(urls: string[], opts?: UrlFetchOptions): Promise<UrlFetchResultItem[]> {
		const wantsExtended = Boolean(
			opts && (opts.bodyPartStructure || opts.binary || opts.body),
		);
		if (wantsExtended) {
			this.assertUrlauthBinaryCapability("urlauth.fetch");
		} else {
			this.assertUrlauthCapability("urlauth.fetch");
		}
		return this.driver.run(new UrlFetchCommand(urls, opts));
	}

	async resetKey(mailbox?: string, mechanisms?: string[]): Promise<void> {
		this.assertUrlauthCapability("urlauth.resetKey");
		return this.driver.run(new ResetKeyCommand(mailbox, mechanisms));
	}

	/** The base `URLAUTH` gate (RFC4467-1-1), factored so `generate()`/
	 *  `fetch()` (unextended)/`resetKey()` all enforce the identical
	 *  rule/message. */
	private assertUrlauthCapability(method: string): void {
		if (!this.driver.hasCapability(URLAUTH_CAPABILITY)) {
			throw new CapabilityError(
				`${method}() requires the URLAUTH capability (RFC 4467 §1), which the ` +
					"server hasn't advertised",
				{ capability: URLAUTH_CAPABILITY, rfc: URLAUTH_RFC },
			);
		}
	}

	/** The extended-form `URLAUTH=BINARY` gate (RFC5524-3-1) -- a DISTINCT
	 *  capability from bare `URLAUTH`, checked INSTEAD OF (not in addition
	 *  to) it whenever `fetch()`'s `opts` requests BODYPARTSTRUCTURE/
	 *  BINARY/BODY -- see `UrlFetchCommand`'s own doc comment for why a
	 *  single capability name, not an AND-of-two-capabilities shape, is
	 *  the right gate here. */
	private assertUrlauthBinaryCapability(method: string): void {
		if (!this.driver.hasCapability(URLAUTH_BINARY_CAPABILITY)) {
			throw new CapabilityError(
				`${method}() with BODYPARTSTRUCTURE/BINARY/BODY parameters requires the ` +
					"URLAUTH=BINARY capability (RFC 5524 §3), which the server hasn't advertised " +
					"(even if it advertised plain URLAUTH alone)",
				{ capability: URLAUTH_BINARY_CAPABILITY, rfc: URLAUTH_BINARY_RFC },
			);
		}
	}
}
