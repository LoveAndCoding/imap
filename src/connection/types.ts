import * as tls from "tls";

import {
	ContinueResponse,
	TaggedResponse,
	UnknownResponse,
	UntaggedResponse,
} from "../parser";
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
}
