import { UrlFetchResponse } from "../../parser";
import type { UntaggedResponse } from "../../parser";
import type { UrlFetchMetadataItem } from "../../parser";
import { Command } from "../base";
import type { ClaimContext } from "../base";
import type { ResponseCollector } from "../collector";
import type { CommandWriter } from "../writer";

export type { UrlFetchMetadataItem };

/**
 * Per-call RFC 5524 §3.1 extended-parameter request. When any of these is
 * set, EVERY url in the batch is requested with the SAME parameter set
 * (matching this facet method's `fetch(urls, opts)` shape -- one shared
 * `opts` for the whole call, not a per-url parameter list); when none is
 * set, the plain RFC 4467 unextended form is emitted (`URLFETCH
 * <url-full> [<url-full> ...]`, no capability beyond bare `URLAUTH`
 * needed).
 *
 * `binary` and `body` are mutually exclusive per RFC5524-3.1-2 ("clients
 * MUST NOT request both BINARY and BODY") -- enforced at construction
 * (zero bytes written, I-9).
 */
export interface UrlFetchOptions {
	/** Request the BODYPARTSTRUCTURE extended parameter (RFC 5524 §3.1). */
	bodyPartStructure?: boolean;
	/** Request the BINARY extended parameter (RFC 5524 §3.1) — decoded
	 *  binary content-transfer-encoding. Mutually exclusive with `body`. */
	binary?: boolean;
	/** Request the BODY extended parameter (RFC 5524 §3.1) — raw MIME body
	 *  part content. Mutually exclusive with `binary`. */
	body?: boolean;
}

/** One url's result (see `parser/structure/urlauth.ts`'s `UrlFetchResult`
 *  for the full field-by-field rationale -- this is the same shape,
 *  re-exported as the command's own public result type per this codebase's
 *  "command owns the public type it produces" convention). */
export interface UrlFetchResultItem {
	/** The url this result corresponds to, exactly as requested. */
	url: string;
	/** The fetched content, `null` if the URL failed to resolve, or absent
	 *  when only extended metadata (no content) was requested/returned. */
	data?: string | null;
	/** Extended-parameter metadata (BODYPARTSTRUCTURE/BINARY/BODY), present
	 *  only when the extended URLFETCH form was used. */
	metadata?: UrlFetchMetadataItem[];
}

/**
 * URLFETCH (RFC 4467 §7 BASE.6.3.URLFETCH / §9
 * `urlfetch = "URLFETCH" 1*(SP url-full)`; extended by RFC 5524 §3.1/§5's
 * `"(" url-full *(SP url-fetch-param) ")"` per-URL parenthesized form) --
 * M5.5.
 *
 * Capability gate: bare `URLAUTH` for the unextended form (RFC4467-1-1);
 * `URLAUTH=BINARY` INSTEAD OF (not in addition to) `URLAUTH` when any
 * extended parameter was requested (RFC5524-3-1: "a compliant client MUST
 * NOT send the parenthesized extended URLFETCH form ... unless the server
 * specifically advertised 'URLAUTH=BINARY', even if it advertised plain
 * URLAUTH alone"). `Command.capability` is a single static-per-instance
 * declaration (no AND-of-two-capabilities shape), so -- mirroring
 * `CreateCommand`'s CREATE-SPECIAL-USE gate, which sets a DIFFERENT single
 * capability depending on whether `specialUse` was given -- this class
 * picks whichever ONE capability actually governs the wire form this
 * particular instance will emit, decided at construct time.
 *
 * Does NOT require a selected mailbox (RFC4467-8-4/RFC4467-7-3) -- nothing
 * in this class's `states` declaration restricts that; `authenticated` is
 * legal on its own.
 */
export class UrlFetchCommand extends Command<UrlFetchResultItem[]> {
	readonly verb = "URLFETCH";
	readonly queueMode = "pipeline" as const;
	readonly states = ["authenticated", "selected"] as const;
	declare readonly capability: string;

	private readonly urls: string[];
	private readonly opts: UrlFetchOptions | undefined;
	private readonly extended: boolean;

	constructor(urls: string[], opts?: UrlFetchOptions) {
		super();
		if (!Array.isArray(urls) || urls.length === 0) {
			throw new RangeError(
				"URLFETCH: at least one URL is required (RFC 4467 §9 urlfetch ABNF)",
			);
		}
		for (const url of urls) {
			if (typeof url !== "string" || url.length === 0) {
				throw new RangeError("URLFETCH: each url must be a non-empty string");
			}
		}
		if (opts?.binary && opts?.body) {
			throw new RangeError(
				"URLFETCH: clients MUST NOT request both BINARY and BODY for the same URL (RFC5524-3.1-2)",
			);
		}
		this.urls = [...urls];
		this.opts = opts;
		this.extended = Boolean(
			opts && (opts.bodyPartStructure || opts.binary || opts.body),
		);
		this.capability = this.extended ? "URLAUTH=BINARY" : "URLAUTH";
	}

	protected write(w: CommandWriter): void {
		for (const url of this.urls) {
			if (this.extended) {
				w.list((inner) => {
					// Same quoting rationale as GENURLAUTH's url-rump argument --
					// see GenUrlAuthCommand's write() comment.
					inner.quotedOrLiteral(url);
					if (this.opts?.bodyPartStructure) {
						inner.atom("BODYPARTSTRUCTURE");
					}
					if (this.opts?.binary) {
						inner.atom("BINARY");
					}
					if (this.opts?.body) {
						inner.atom("BODY");
					}
				});
			} else {
				w.quotedOrLiteral(url);
			}
		}
	}

	protected claims(resp: UntaggedResponse, _ctx: ClaimContext): boolean {
		return resp.type === "URLFETCH";
	}

	protected accept(c: ResponseCollector): UrlFetchResultItem[] {
		const results: UrlFetchResultItem[] = [];
		for (const line of c.untagged("URLFETCH")) {
			if (line.content instanceof UrlFetchResponse) {
				for (const r of line.content.results) {
					results.push({ url: r.url, data: r.data, metadata: r.metadata });
				}
			}
		}
		return results;
	}
}
