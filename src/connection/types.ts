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
	response: (
		response:
			| ContinueResponse
			| TaggedResponse
			| UnknownResponse
			| UntaggedResponse,
	) => void;
	continueResponse: (response: ContinueResponse) => void;
	taggedResponse: (response: TaggedResponse) => void;
	unknownResponse: (response: UnknownResponse) => void;
	untaggedResponse: (response: UntaggedResponse) => void;
}
