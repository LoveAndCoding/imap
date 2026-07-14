import { GenUrlAuthResponse } from "../../parser";
import type { UntaggedResponse } from "../../parser";
import { Command } from "../base";
import type { ClaimContext } from "../base";
import type { ResponseCollector } from "../collector";
import type { CommandWriter } from "../writer";

/**
 * One requested URL/mechanism pair for GENURLAUTH (RFC 4467 §7/§9:
 * `genurlauth = "GENURLAUTH" 1*(SP url-rump SP mechanism)`).
 *
 * `url` is the "url-rump" -- an IMAP URL that ALREADY carries its own
 * `;URLAUTH=<access>` component (one of the four access-identifier forms,
 * RFC4467-3-1..5: `submit+<userid>`/`user+<userid>`/`authuser`/`anonymous`)
 * but not yet the trailing `:<mech>:<token>` the server appends once it
 * authorizes the URL (RFC4467-9-2). Per this milestone's IMAP-URL-handling
 * scope decision (see the plan's M5.5 design constraints): this client
 * never builds or parses IMAP URL structure itself -- `url` is an opaque
 * string the CALLER constructs (or, for `resetKey`/round-tripping a URL a
 * server already authorized, receives back verbatim from `generate()`).
 * `mechanism` defaults to `"INTERNAL"` (RFC 4467 §2.4.1 -- the base spec's
 * only defined mechanism).
 */
export interface UrlauthRump {
	url: string;
	mechanism?: string;
}

interface ResolvedRump {
	url: string;
	mechanism: string;
}

/**
 * GENURLAUTH (RFC 4467 §7 BASE.6.3.GENURLAUTH / §9
 * `genurlauth = "GENURLAUTH" 1*(SP url-rump SP mechanism)`) -- M5.5.
 *
 * Two LOCAL (never-touches-the-wire) validations run at construction, both
 * zero-bytes-written per I-9 since they throw before `write()` is ever
 * called:
 *   - RFC4467-3-6: each `url` MUST already carry a `;URLAUTH=<access>`
 *     component -- a rump missing it can never successfully complete
 *     GENURLAUTH (the RFC's own worked example: a rump without one gets a
 *     tagged `BAD missing access identifier in supplied URL`), so this
 *     client refuses to even attempt it.
 *   - RFC4467-3-2: URLAUTH MUST NOT be used with a URL referring to an
 *     entire IMAP server, a list of mailboxes, an entire IMAP mailbox, or
 *     IMAP search results -- only a URL addressing a specific message (or
 *     message part) may be authorized. Per this task's URL-handling scope
 *     decision, this client does NOT parse full RFC 5092 URL grammar to
 *     make that call; the one structural signal it DOES check is the
 *     presence of a `;UID=` component (case-insensitive) outside the
 *     `;URLAUTH=` suffix -- every legal target (a specific message or a
 *     part within one) carries one, and every prohibited target (server
 *     root, mailbox list, whole mailbox, search results) does not.
 *
 * Capability gate: `URLAUTH` (RFC4467-1-1), declared here too (not only on
 * the facet) for the same defense-in-depth reason `GetQuotaCommand`
 * documents.
 */
export class GenUrlAuthCommand extends Command<string[]> {
	readonly verb = "GENURLAUTH";
	readonly queueMode = "pipeline" as const;
	readonly states = ["authenticated", "selected"] as const;
	readonly capability = "URLAUTH";

	private readonly rumps: ResolvedRump[];

	constructor(rumps: UrlauthRump[]) {
		super();
		if (!Array.isArray(rumps) || rumps.length === 0) {
			throw new RangeError(
				"GENURLAUTH: at least one URL/mechanism pair is required (RFC 4467 §9 genurlauth ABNF)",
			);
		}
		this.rumps = rumps.map((r) => {
			if (!r || typeof r.url !== "string" || r.url.length === 0) {
				throw new RangeError("GENURLAUTH: each entry needs a non-empty url");
			}
			if (!/;urlauth=/i.test(r.url)) {
				throw new RangeError(
					"GENURLAUTH: url-rump must include a ';URLAUTH=<access>' component " +
						"(RFC4467-3-6) -- construct one of the four access-identifier forms " +
						"(submit+<userid>/user+<userid>/authuser/anonymous) onto the URL before " +
						"requesting authorization for it",
				);
			}
			if (!GenUrlAuthCommand.addressesSpecificMessage(r.url)) {
				throw new RangeError(
					"GENURLAUTH: URLAUTH does not apply to, and MUST NOT be used with, a URL " +
						"referring to an entire IMAP server, a list of mailboxes, an entire IMAP " +
						"mailbox, or IMAP search results (RFC4467-3-2) -- the url-rump must address " +
						"a specific message (a ';UID=' component)",
				);
			}
			if (r.mechanism !== undefined && (typeof r.mechanism !== "string" || r.mechanism.length === 0)) {
				throw new RangeError("GENURLAUTH: mechanism, when given, must be a non-empty string");
			}
			return { url: r.url, mechanism: r.mechanism ?? "INTERNAL" };
		});
	}

	/** See the class doc comment's RFC4467-3-2 note for why `;UID=` presence
	 *  (outside the `;URLAUTH=` suffix) is the one structural signal this
	 *  client checks, rather than a full RFC 5092 URL parse. */
	private static addressesSpecificMessage(url: string): boolean {
		const withoutUrlauthSuffix = url.replace(/;urlauth=.*/i, "");
		return /;uid=/i.test(withoutUrlauthSuffix);
	}

	protected write(w: CommandWriter): void {
		for (const { url, mechanism } of this.rumps) {
			// Quoted/literal, never a bare atom: every worked example in RFC
			// 4467 §5/§7 shows the url-rump double-quoted, even though its
			// characters (mostly ":"/"/"/";"/"@") are individually legal
			// ATOM-CHARs and `astring()` would otherwise emit it bare.
			w.quotedOrLiteral(url);
			w.atom(mechanism);
		}
	}

	protected claims(resp: UntaggedResponse, _ctx: ClaimContext): boolean {
		return resp.type === "GENURLAUTH";
	}

	protected accept(c: ResponseCollector): string[] {
		const urls: string[] = [];
		for (const line of c.untagged("GENURLAUTH")) {
			if (line.content instanceof GenUrlAuthResponse) {
				urls.push(...line.content.urls);
			}
		}
		return urls;
	}
}
