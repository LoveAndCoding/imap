import { EventEmitter } from "events";
import { Socket } from "net";
import * as tls from "tls";

import type { FlagList } from "../parser";

export enum TLSSetting {
	"DEFAULT" = "on",
	"STARTTLS" = "starttls",
	"FORCE_OFF" = "off",
}

export type IMAPConnectionConfiguration = {
	host: string;
	port?: number;
	tls?: TLSSetting;
	tlsOptions?: tls.ConnectionOptions;
	timeout?: number;
};

export interface IConfig {
	authTimeout?: number;
	autotls?: "never" | "always" | "required";
	connTimeout?: number;
	debug?: (msg: string) => void;
	host: string;
	keepalive:
		| boolean
		| { interval?: number; idleInterval?: number; forceNoop?: boolean };
	localAddress: string;
	password: string;
	port: number;
	socket?: Socket;
	socketTimeout?: number;
	tls?: boolean;
	tlsOptions?: tls.ConnectionOptions;
	user: string;
	xoauth: string;
	xoauth2: string;
}

export interface ICommand {
	appendData?: any;
	bodyEmitter?: EventEmitter;
	cb: Function;
	cbargs: any[];
	data?: any;
	fetchCache?: any;
	fetching?: string[];
	fullcmd?: string;
	lines?: string[];
	literalAppendData?: any;
	oauthError?: string;
	type: string;
}

export interface IBox {
	name: string;
	flags: FlagList;
	readOnly: boolean;
	uidvalidity: number;
	uidnext: number;
	permFlags: FlagList;
	keywords: string[];
	newKeywords: boolean;
	persistentUIDs: boolean;
	nomodseq: boolean;
	highestmodseq?: string;
	messages: {
		total: number;
		new: number;
	};
}

export interface INamespaces {
	personal: string[];
	other: string[];
	shared: string[];
}
