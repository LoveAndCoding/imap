import * as tls from "tls";

import {
	ContinueResponse,
	TaggedResponse,
	UnknownResponse,
	UntaggedResponse,
} from "../parser";
import type { IMAPLogMessage } from "../types";
import { ConnectionErrors } from "./errors";

export enum TLSSetting {
	"DEFAULT" = "on",
	"STARTTLS" = "starttls",
	"STARTTLS_OPTIONAL" = "opportunistic",
	"FORCE_OFF" = "off",
}

export type IMAPConnectionConfiguration = {
	host: string;
	port?: number;
	tls?: TLSSetting;
	tlsOptions?: tls.ConnectionOptions;
	timeout?: number;
	/**
	 * Optional notification channel (spec I-7/§10.6): Connection uses this to
	 * surface things like ALERT response-code text. Defaults to a no-op so
	 * Connection can always call it unconditionally. `Session`/`IMAPConfiguration`
	 * carry their own copy of this same shape — the compliance driver's single
	 * config object flows the identical function to both.
	 */
	logger?: (info: IMAPLogMessage) => void;
};

export interface IConnectionEvents {
	// Connection Events
	ready: (isSecure: boolean) => void;
	connectionError: (error: ConnectionErrors) => void;
	disconnected: (wasGraceful: boolean) => void;

	// Response Events
	serverStatus: (response: UntaggedResponse) => void;
	// `null` accommodates the parser's `unknown` event, which can fire with
	// `null` for a malformed/too-short token list (see the flag comment on
	// Parser#parseTokens) — surfaced here rather than silently dropped.
	response: (
		response:
			| ContinueResponse
			| TaggedResponse
			| UnknownResponse
			| UntaggedResponse
			| null,
	) => void;
	continueResponse: (response: ContinueResponse) => void;
	taggedResponse: (response: TaggedResponse) => void;
	unknownResponse: (response: UnknownResponse | null) => void;
	untaggedResponse: (response: UntaggedResponse) => void;
	/**
	 * ADDITIVE (spec I-7/§10.6): fired for every ALERT resp-code regardless
	 * of confidentiality, `trusted` reflecting whether TLS was active when it
	 * arrived. `ImapClient` bridges this straight to its own public `alert`
	 * event. Nothing in M0 emitted this — see `Router.handleStatusResponse`.
	 */
	alert: (text: string, meta: { trusted: boolean }) => void;
	/**
	 * A response the router (spec §8) could neither attribute to any
	 * in-flight command's `claims()` nor route through the state-tracker
	 * lane (an unknown tagged-response tag, an unowned continuation, or
	 * genuinely unclaimed/unknown data). Additive: nothing in M0 emitted
	 * this, so adding it changes no existing observable behavior — it's a
	 * new signal, not a replacement for any of the events above.
	 */
	unhandled: (
		response: ContinueResponse | TaggedResponse | UnknownResponse | UntaggedResponse,
	) => void;
}
