import * as tls from "tls";

import {
	ContinueResponse,
	TaggedResponse,
	UnknownResponse,
	UntaggedResponse,
} from "../parser";
import type { IMAPLogMessage } from "../types";
import { ConnectionErrors } from "./errors";

/**
 * How `Connection.connect()` (spec §3.2/§10.5) establishes and upgrades
 * transport confidentiality for a given host/port.
 */
export enum TLSSetting {
	/** Implicit TLS: the TLS handshake happens immediately, before any IMAP
	 *  greeting is read (the traditional "IMAPS" port-993 style connection). */
	"DEFAULT" = "on",
	/** Mandatory STARTTLS: connect in cleartext, then upgrade via the
	 *  STARTTLS command before authenticating; failure to upgrade (including
	 *  an absent STARTTLS capability) fails the whole `connect()` call. */
	"STARTTLS" = "starttls",
	/** Opportunistic STARTTLS: upgrade via STARTTLS when the server
	 *  advertises it, but continue over cleartext instead of failing when it
	 *  doesn't (spec §3.3: "opportunistic continues cleartext"). */
	"STARTTLS_OPTIONAL" = "opportunistic",
	/** Never negotiate TLS; the connection stays cleartext for its entire
	 *  lifetime. */
	"FORCE_OFF" = "off",
}

/** Configuration accepted by the Layer-1 `Connection` escape hatch (spec
 *  §3.2) to establish a single IMAP transport connection. */
export type IMAPConnectionConfiguration = {
	/** Hostname or IP address of the IMAP server to connect to. */
	host: string;
	/** TCP port to connect to. Required by `connect()` at call time even
	 *  though this field itself is optional on the configuration object. */
	port?: number;
	/** Confidentiality strategy for this connection (spec §3.3/§10.5).
	 *  Defaults to {@link TLSSetting.DEFAULT} when unset or given an
	 *  unrecognized value. */
	tls?: TLSSetting;
	/** Passed through verbatim to Node's `tls.connect()`/`tls.TLSSocket` for
	 *  both implicit TLS and the STARTTLS upgrade (e.g. custom CA, SNI
	 *  overrides, `rejectUnauthorized`). */
	tlsOptions?: tls.ConnectionOptions;
	/** Milliseconds to wait for the TCP connection and the server's greeting
	 *  before rejecting with a `ConnectionTimeout`. Defaults to 10000ms when
	 *  unset. */
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
