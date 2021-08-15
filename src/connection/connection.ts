import { Buffer } from "buffer";
import { EventEmitter } from "events";
import { Socket } from "net";
import { clearTimeout, setTimeout } from "timers";
import * as tls from "tls";
import { imap as utf7 } from "utf7";
import { inspect, types } from "util";

import { IMAPError } from "../errors";
import NewlineTranform from "../newline.transform";
import Lexer from "../lexer";
import Parser, {
	AppendUIDTextCode,
	CapabilityList,
	ContinueResponse,
	CopyUIDTextCode,
	ExistsCount,
	Expunge,
	ExtendedSearchResponse,
	Fetch,
	FlagList,
	IDResponse,
	MailboxListing,
	MailboxStatus,
	NamespaceResponse,
	NumberTextCode,
	PermentantFlagsTextCode,
	QuotaResponse,
	RecentCount,
	SearchResponse,
	SortResponse,
	StatusResponse,
	TaggedResponse,
	ThreadResponse,
	UnknownResponse,
	UntaggedResponse,
} from "../parser";
import {
	MAX_INT,
	KEEPALIVE_INTERVAL,
	MAX_IDLE_WAIT,
	MONTHS,
	FETCH_ATTR_MAP,
	SPECIAL_USE_ATTRIBUTES,
	CRLF,
	RE_BODYPART,
	RE_CMD,
	RE_ESCAPE,
	RE_IDLENOOPRES,
	RE_INVALID_KW_CHARS,
	RE_OPENBOX,
	RE_UIDCMD_HASRESULTS,
} from "./constants";
import { buildSearchQuery } from "./search";
import { IBox, ICommand, IConfig, INamespaces } from "./types";
import { deepEqual, escape, validateUIDList } from "./utils";

export default class Connection extends EventEmitter {
	// END Extension methods =======================================================

	// Namespace for seqno-based commands
	get seq() {
		return {
			addKeywords: (seqnos, keywords, cb) => {
				this.store("", seqnos, { mode: "+", keywords }, cb);
			},
			delKeywords: (seqnos, keywords, cb) => {
				this.store("", seqnos, { mode: "-", keywords }, cb);
			},
			setKeywords: (seqnos, keywords, cb) => {
				this.store("", seqnos, { mode: "", keywords }, cb);
			},

			addFlags: (seqnos, flags, cb) => {
				this.store("", seqnos, { mode: "+", flags }, cb);
			},
			delFlags: (seqnos, flags, cb) => {
				this.store("", seqnos, { mode: "-", flags }, cb);
			},
			setFlags: (seqnos, flags, cb) => {
				this.store("", seqnos, { mode: "", flags }, cb);
			},

			copy: (seqnos, boxTo, cb) => {
				this._copy("", seqnos, boxTo, cb);
			},
			fetch: (seqnos, options) => {
				return this._fetch("", seqnos, options);
			},
			move: (seqnos, boxTo, cb) => {
				this._move("", seqnos, boxTo, cb);
			},
			search: (options, cb) => {
				this._search("", options, cb);
			},

			// Extensions ==============================================================
			addLabels: (seqnos, labels, cb) => {
				this.storeLabels("", seqnos, labels, "+", cb);
			},
			delLabels: (seqnos, labels, cb) => {
				this.storeLabels("", seqnos, labels, "-", cb);
			},
			setLabels: (seqnos, labels, cb) => {
				this.storeLabels("", seqnos, labels, "", cb);
			},

			esearch: (criteria, options, cb) => {
				this._esearch("", criteria, options, cb);
			},

			sort: (sorts, options, cb) => {
				this._sort("", sorts, options, cb);
			},
			thread: (algorithm, criteria, cb) => {
				this._thread("", algorithm, criteria, cb);
			},

			addKeywordsSince: (seqnos, keywords, modseq, cb) => {
				this.store("", seqnos, { mode: "+", keywords, modseq }, cb);
			},
			delKeywordsSince: (seqnos, keywords, modseq, cb) => {
				this.store("", seqnos, { mode: "-", keywords, modseq }, cb);
			},
			setKeywordsSince: (seqnos, keywords, modseq, cb) => {
				this.store("", seqnos, { mode: "", keywords, modseq }, cb);
			},

			addFlagsSince: (seqnos, flags, modseq, cb) => {
				this.store("", seqnos, { mode: "+", flags, modseq }, cb);
			},
			delFlagsSince: (seqnos, flags, modseq, cb) => {
				this.store("", seqnos, { mode: "-", flags, modseq }, cb);
			},
			setFlagsSince: (seqnos, flags, modseq, cb) => {
				this.store("", seqnos, { mode: "", flags, modseq }, cb);
			},
		};
	}

	private static getDefaultBox(): IBox {
		return {
			flags: new FlagList([]),
			keywords: [],
			messages: {
				new: 0,
				total: 0,
			},
			name: "",
			newKeywords: false,
			nomodseq: false,
			permFlags: new FlagList([]),
			persistentUIDs: true,
			readOnly: false,
			uidnext: 0,
			uidvalidity: 0,
		};
	}

	public delimiter: void | string;
	public namespaces: void | NamespaceResponse;
	public state: "disconnected" | "connected" | "authenticated";
	public lexer: Lexer;
	public parser: Parser;

	private debug: (msg: string) => void;
	private box: undefined | IBox;
	private caps: undefined | CapabilityList;
	private config: IConfig;
	private curReq: undefined | ICommand;
	private idle: { started: undefined | number; enabled: boolean };
	private queue: ICommand[];
	private newlineTransform: NewlineTranform;
	private sock: undefined | Socket;
	private tagcount: number;
	private tmrAuth: undefined | NodeJS.Timeout;
	private tmrConn: undefined | NodeJS.Timeout;
	private tmrKeepalive: undefined | NodeJS.Timeout;

	private onError: (err: Error) => void;
	private onSocketTimeout: () => void;

	constructor(config: Partial<IConfig>) {
		super();
		config = config || {};

		this.config = {
			authTimeout: config.authTimeout || 5000,
			autotls: config.autotls,
			connTimeout: config.connTimeout || 10000,
			host: config.host || "localhost",
			keepalive:
				config.keepalive === undefined || config.keepalive === null
					? true
					: config.keepalive,
			localAddress: config.localAddress,
			password: config.password,
			port: config.port || 143,
			socket: config.socket,
			socketTimeout: config.socketTimeout || 0,
			tls: config.tls,
			tlsOptions: config.tlsOptions,
			user: config.user,
			xoauth: config.xoauth,
			xoauth2: config.xoauth2,
		};

		this.sock = config.socket || undefined;
		this.tagcount = 0;
		this.tmrConn = undefined;
		this.tmrKeepalive = undefined;
		this.tmrAuth = undefined;
		this.queue = [];
		this.box = undefined;
		this.idle = { started: undefined, enabled: false };
		this.parser = undefined;
		this.curReq = undefined;
		this.delimiter = undefined;
		this.namespaces = undefined;
		this.state = "disconnected";
		// Fallback to no-op
		// tslint:disable-next-line:no-empty
		this.debug = config.debug || (() => {});
	}

	public connect() {
		const config = this.config;
		let socket: Socket;
		let tlsOptions: tls.ConnectionOptions;

		socket = config.socket || new Socket();
		socket.setKeepAlive(true);
		this.sock = undefined;
		this.tagcount = 0;
		this.tmrConn = undefined;
		this.tmrKeepalive = undefined;
		this.tmrAuth = undefined;
		this.queue = [];
		this.box = undefined;
		this.idle = { started: undefined, enabled: false };
		this.parser = undefined;
		this.curReq = undefined;
		this.delimiter = undefined;
		this.namespaces = undefined;
		this.state = "disconnected";

		if (config.tls) {
			tlsOptions = {};
			tlsOptions.host = config.host;
			// Host name may be overridden the tlsOptions
			Object.assign(tlsOptions, config.tlsOptions);
			tlsOptions.socket = socket;
		}

		const onconnect = () => {
			if (typeof this.tmrConn !== "undefined") {
				clearTimeout(this.tmrConn);
			}
			this.state = "connected";
			this.debug("[connection] Connected to host");
			this.tmrAuth = setTimeout(function () {
				const err = new IMAPError(
					"Timed out while authenticating with server",
				);
				err.source = "timeout-auth";
				this.emit("error", err);
				socket.destroy();
			}, config.authTimeout);
		};

		if (config.tls) {
			this.sock = tls.connect(tlsOptions, onconnect);
		} else {
			socket.once("connect", onconnect);
			this.sock = socket;
		}

		this.onError = (err) => {
			const wrpd = new IMAPError(err);

			if (typeof this.tmrConn !== "undefined") {
				clearTimeout(this.tmrConn);
			}
			if (typeof this.tmrAuth !== "undefined") {
				clearTimeout(this.tmrAuth);
			}
			this.debug("[connection] Error: " + wrpd);
			wrpd.source = "socket";
			this.emit("error", wrpd);
		};
		this.sock.on("error", this.onError);

		this.onSocketTimeout = () => {
			if (typeof this.tmrConn !== "undefined") {
				clearTimeout(this.tmrConn);
			}
			if (typeof this.tmrAuth !== "undefined") {
				clearTimeout(this.tmrAuth);
			}
			if (typeof this.tmrKeepalive !== "undefined") {
				clearTimeout(this.tmrKeepalive);
			}
			this.state = "disconnected";
			this.debug("[connection] Socket timeout");

			const err = new IMAPError(
				"Socket timed out while talking to server",
			);
			err.source = "socket-timeout";
			this.emit("error", err);
			socket.destroy();
		};
		this.sock.on("timeout", this.onSocketTimeout);
		socket.setTimeout(config.socketTimeout);

		socket.once("close", (hadErr) => {
			if (typeof this.tmrConn !== "undefined") {
				clearTimeout(this.tmrConn);
			}
			if (typeof this.tmrAuth !== "undefined") {
				clearTimeout(this.tmrAuth);
			}
			if (typeof this.tmrKeepalive !== "undefined") {
				clearTimeout(this.tmrKeepalive);
			}
			this.state = "disconnected";
			this.debug("[connection] Closed");
			this.emit("close", hadErr);
		});

		socket.once("end", () => {
			if (typeof this.tmrConn !== "undefined") {
				clearTimeout(this.tmrConn);
			}
			if (typeof this.tmrAuth !== "undefined") {
				clearTimeout(this.tmrAuth);
			}
			if (typeof this.tmrKeepalive !== "undefined") {
				clearTimeout(this.tmrKeepalive);
			}
			this.state = "disconnected";
			this.debug("[connection] Ended");
			this.emit("end");
		});

		const newlineTransform = new NewlineTranform();
		this.newlineTransform = newlineTransform;
		const lexer = new Lexer();
		this.lexer = lexer;
		const parser = new Parser();
		this.parser = parser;

		socket.pipe(newlineTransform).pipe(lexer).pipe(parser);

		parser.on("untagged", (resp: UntaggedResponse) => {
			this.resUntagged(resp);
		});
		parser.on("tagged", (resp: TaggedResponse) => {
			this.resTagged(resp);
		});
		parser.on("continue", (resp: ContinueResponse) => {
			if (!this.curReq) {
				throw new IMAPError(
					"Unable to find current request during parsing",
				);
			} else if (!this.sock) {
				throw new IMAPError(
					"No socket available when parsing continue",
				);
			}

			const type = this.curReq.type;
			if (type === "IDLE") {
				if (
					this.queue.length &&
					this.idle.started === 0 &&
					this.curReq &&
					this.curReq.type === "IDLE" &&
					this.sock &&
					this.sock.writable &&
					!this.idle.enabled
				) {
					this.debug("=> DONE");
					this.sock.write("DONE" + CRLF);
					return;
				}
				// now idling
				this.idle.started = Date.now();
			} else if (/^AUTHENTICATE XOAUTH/.test(this.curReq.fullcmd)) {
				this.curReq.oauthError = Buffer.from(
					resp.text.content,
					"base64",
				).toString("utf8");
				this.debug("=> " + inspect(CRLF));
				this.sock.write(CRLF);
			} else if (type === "APPEND") {
				this.sockWriteAppendData(this.curReq.appendData);
			} else if (this.curReq.lines && this.curReq.lines.length) {
				const line = this.curReq.lines.shift() + "\r\n";
				this.debug("=> " + inspect(line));
				this.sock.write(line, "binary");
			}
		});
		parser.on("unknown", (resp: UnknownResponse) => {
			const m = RE_IDLENOOPRES.exec(resp.text);
			if (m) {
				// no longer idling
				this.idle.enabled = false;
				this.idle.started = undefined;
				if (typeof this.tmrKeepalive !== "undefined") {
					clearTimeout(this.tmrKeepalive);
				}

				this.curReq = undefined;

				if (
					this.queue.length === 0 &&
					this.config.keepalive &&
					this.state === "authenticated" &&
					!this.idle.enabled
				) {
					this.idle.enabled = true;
					if (m[1] === "NOOP") {
						this.doKeepaliveTimer();
					} else {
						this.doKeepaliveTimer(true);
					}
				}

				this.processQueue();
			}
		});

		this.tmrConn = setTimeout(() => {
			const err = new IMAPError("Timed out while connecting to server");
			err.source = "timeout";
			this.emit("error", err);
			socket.destroy();
		}, config.connTimeout);

		socket.connect({
			host: config.host,
			localAddress: config.localAddress,
			port: config.port,
		});
	}

	public serverSupports(cap: string): boolean {
		return this.caps.has(cap);
	}

	public destroy() {
		this.queue = [];
		this.curReq = undefined;
		if (this.sock) {
			this.sock.unpipe(this.newlineTransform);
			this.sock.end();
		}
	}

	public end() {
		this.enqueue("LOGOUT", () => {
			this.queue = [];
			this.curReq = undefined;
			this.sock?.end();
		});
	}

	public append(data: string | Buffer, cb: Function);
	public append(
		data: string | Buffer,
		options: Record<string, any>,
		cb: Function,
	);
	public append(
		data: string | Buffer,
		optionsOrCb: Record<string, any> | Function,
		cb?: Function,
	) {
		const literal = this.serverSupports("LITERAL+");
		let options: Record<string, any>;
		if (typeof optionsOrCb === "function") {
			cb = optionsOrCb;
			options = {};
		} else {
			options = optionsOrCb;
		}
		if (!options.mailbox) {
			if (!this.box) {
				throw new IMAPError(
					"No mailbox specified or currently selected",
				);
			} else {
				options.mailbox = this.box.name;
			}
		}
		let cmd = 'APPEND "' + escape(utf7.encode("" + options.mailbox)) + '"';
		if (options.flags) {
			if (!Array.isArray(options.flags)) {
				options.flags = [options.flags];
			}
			if (options.flags.length > 0) {
				for (let i = 0, len = options.flags.length; i < len; ++i) {
					if (
						options.flags[i][0] !== "$" &&
						options.flags[i][0] !== "\\"
					) {
						options.flags[i] = "\\" + options.flags[i];
					}
				}
				cmd += " (" + options.flags.join(" ") + ")";
			}
		}
		if (options.date) {
			if (!types.isDate(options.date)) {
				throw new IMAPError("`date` is not a Date object");
			}
			cmd += ' "';
			cmd += options.date.getDate();
			cmd += "-";
			cmd += MONTHS[options.date.getMonth()];
			cmd += "-";
			cmd += options.date.getFullYear();
			cmd += " ";
			cmd += ("0" + options.date.getHours()).slice(-2);
			cmd += ":";
			cmd += ("0" + options.date.getMinutes()).slice(-2);
			cmd += ":";
			cmd += ("0" + options.date.getSeconds()).slice(-2);
			cmd += options.date.getTimezoneOffset() > 0 ? " -" : " +";
			cmd += ("0" + -options.date.getTimezoneOffset() / 60).slice(-2);
			cmd += ("0" + (-options.date.getTimezoneOffset() % 60)).slice(-2);
			cmd += '"';
		}
		cmd += " {";
		cmd += Buffer.isBuffer(data) ? data.length : Buffer.byteLength(data);
		cmd += (literal ? "+" : "") + "}";

		this.enqueue(cmd, cb);

		if (literal) {
			this.queue[this.queue.length - 1].literalAppendData = data;
		} else {
			this.queue[this.queue.length - 1].appendData = data;
		}
	}

	public getSpecialUseBoxes(cb: Function) {
		this.enqueue('XLIST "" "*"', cb);
	}

	public getBoxes(cb: Function);
	public getBoxes(namespace: string, cb: Function);
	public getBoxes(namespace: string | Function, cb?: Function) {
		if (typeof namespace === "function") {
			cb = namespace;
			namespace = "";
		}

		namespace = escape(utf7.encode("" + namespace));

		this.enqueue('LIST "' + namespace + '" "*"', cb);
	}

	public id(identification: null | Record<string, string>, cb: Function) {
		if (!this.serverSupports("ID")) {
			throw new IMAPError("Server does not support ID");
		}
		let cmd = "ID";
		if (
			identification === null ||
			Object.keys(identification).length === 0
		) {
			cmd += " NIL";
		} else {
			if (Object.keys(identification).length > 30) {
				throw new IMAPError("Max allowed number of keys is 30");
			}
			const kv = [];
			Object.keys(identification).forEach((k) => {
				if (Buffer.byteLength(k) > 30) {
					throw new IMAPError("Max allowed key length is 30");
				}
				if (Buffer.byteLength(identification[k]) > 1024) {
					throw new IMAPError("Max allowed value length is 1024");
				}
				kv.push('"' + escape(k) + '"');
				kv.push('"' + escape(identification[k]) + '"');
			});
			cmd += " (" + kv.join(" ") + ")";
		}
		this.enqueue(cmd, cb);
	}

	public openBox(
		name: string,
		cb: (err: undefined | Error, box?: IBox) => void,
	);
	public openBox(
		name: string,
		readonly: boolean,
		cb: (err: undefined | Error, box?: IBox) => void,
	);
	public openBox(
		name: string,
		readOnly: boolean | ((err: undefined | Error, box: IBox) => void),
		cb?: (err: undefined | Error, box?: IBox) => void,
	) {
		if (this.state !== "authenticated") {
			throw new IMAPError("Not authenticated");
		}

		if (typeof readOnly === "function") {
			cb = readOnly;
			readOnly = false;
		}

		name = "" + name;
		const encname = escape(utf7.encode(name));
		let cmd = readOnly ? "EXAMINE" : "SELECT";

		cmd += ' "' + encname + '"';

		if (this.serverSupports("CONDSTORE")) {
			cmd += " (CONDSTORE)";
		}

		this.enqueue(cmd, (err) => {
			if (err) {
				this.box = undefined;
				cb(err);
			} else if (!this.box) {
				cb(new IMAPError("Did not successfully open box"));
			} else {
				this.box.name = name;
				cb(err, this.box);
			}
		});
	}

	public closeBox(cb: (err?: Error) => void);
	public closeBox(shouldExpunge: boolean, cb: (err?: Error) => void);
	public closeBox(
		shouldExpunge: boolean | ((err?: Error) => void),
		cb?: (err?: Error) => void,
	) {
		if (this.box === undefined) {
			throw new IMAPError("No mailbox is currently selected");
		}

		if (typeof shouldExpunge === "function") {
			cb = shouldExpunge;
			shouldExpunge = true;
		}

		if (shouldExpunge) {
			this.enqueue("CLOSE", (err) => {
				if (!err) {
					this.box = undefined;
				}

				cb(err);
			});
		} else {
			if (this.serverSupports("UNSELECT")) {
				// use UNSELECT if available, as it claims to be "cleaner" than the
				// alternative "hack"
				this.enqueue("UNSELECT", (err) => {
					if (!err) {
						this.box = undefined;
					}

					cb(err);
				});
			} else {
				// "HACK": close the box without expunging by attempting to SELECT a
				// non-existent mailbox
				const badbox = "NODEJSIMAPCLOSINGBOX" + Date.now();
				this.enqueue('SELECT "' + badbox + '"', (err) => {
					this.box = undefined;
					cb();
				});
			}
		}
	}

	public addBox(name: string, cb: Function) {
		this.enqueue('CREATE "' + escape(utf7.encode("" + name)) + '"', cb);
	}

	public delBox(name: string, cb: Function) {
		this.enqueue('DELETE "' + escape(utf7.encode("" + name)) + '"', cb);
	}

	public renameBox(
		oldname: string,
		newname: string,
		cb: (err?: Error, box?: IBox) => void,
	) {
		const encoldname = escape(utf7.encode("" + oldname));
		const encnewname = escape(utf7.encode("" + newname));

		this.enqueue(
			'RENAME "' + encoldname + '" "' + encnewname + '"',
			(err) => {
				if (err) {
					return cb(err);
				}

				if (
					this.box &&
					this.box.name === oldname &&
					oldname.toUpperCase() !== "INBOX"
				) {
					this.box.name = newname;
					cb(err, this.box);
				} else {
					cb();
				}
			},
		);
	}

	public subscribeBox(name: string, cb: Function) {
		this.enqueue('SUBSCRIBE "' + escape(utf7.encode("" + name)) + '"', cb);
	}

	public unsubscribeBox(name: string, cb: Function) {
		this.enqueue(
			'UNSUBSCRIBE "' + escape(utf7.encode("" + name)) + '"',
			cb,
		);
	}

	public getSubscribedBoxes(cb: Function);
	public getSubscribedBoxes(namespace: string, cb: Function);
	public getSubscribedBoxes(namespace: string | Function, cb?: Function) {
		if (typeof namespace === "function") {
			cb = namespace;
			namespace = "";
		}

		namespace = escape(utf7.encode("" + namespace));

		this.enqueue('LSUB "' + namespace + '" "*"', cb);
	}

	public status(boxName: string, cb: Function) {
		if (this.box && this.box.name === boxName) {
			throw new IMAPError(
				"Cannot call status on currently selected mailbox",
			);
		}

		boxName = escape(utf7.encode("" + boxName));

		let info = ["MESSAGES", "RECENT", "UNSEEN", "UIDVALIDITY", "UIDNEXT"];

		if (this.serverSupports("CONDSTORE")) {
			info.push("HIGHESTMODSEQ");
		}

		const attrs = info.join(" ");

		this.enqueue('STATUS "' + boxName + '" (' + attrs + ")", cb);
	}

	public expunge(cb: Function);
	public expunge(uids: string | number | (string | number)[], cb: Function);
	public expunge(
		uidsOrCb: string | number | (string | number)[] | Function,
		cb?: Function,
	) {
		let uids: (string | number)[];
		if (typeof uidsOrCb === "function") {
			cb = uidsOrCb;
			uids = undefined;
		} else if (!Array.isArray(uidsOrCb)) {
			uids = [uidsOrCb];
		} else {
			uids = uidsOrCb;
		}

		if (uids !== undefined) {
			validateUIDList(uids);

			if (uids.length === 0) {
				throw new IMAPError("Empty uid list");
			}

			const uidsList = uids.join(",");

			if (!this.serverSupports("UIDPLUS")) {
				throw new IMAPError(
					"Server does not support this feature (UIDPLUS)",
				);
			}

			this.enqueue("UID EXPUNGE " + uidsList, cb);
		} else {
			this.enqueue("EXPUNGE", cb);
		}
	}

	public search(criteria: string | string[], cb: Function) {
		this._search("UID ", criteria, cb);
	}

	public addFlags(
		uids: string | string[],
		flags: string | string[],
		cb: Function,
	) {
		this.store("UID ", uids, { mode: "+", flags }, cb);
	}

	public delFlags(
		uids: string | string[],
		flags: string | string[],
		cb: Function,
	) {
		this.store("UID ", uids, { mode: "-", flags }, cb);
	}

	public setFlags(
		uids: string | string[],
		flags: string | string[],
		cb: Function,
	) {
		this.store("UID ", uids, { mode: "", flags }, cb);
	}

	public addKeywords(
		uids: string | string[],
		keywords: string | string[],
		cb: Function,
	) {
		this.store("UID ", uids, { mode: "+", keywords }, cb);
	}

	public delKeywords(
		uids: string | string[],
		keywords: string | string[],
		cb: Function,
	) {
		this.store("UID ", uids, { mode: "-", keywords }, cb);
	}

	public setKeywords(
		uids: string | string[],
		keywords: string | string[],
		cb: Function,
	) {
		this.store("UID ", uids, { mode: "", keywords }, cb);
	}

	public copy(uids: string | string[], boxTo: string, cb: Function) {
		this._copy("UID ", uids, boxTo, cb);
	}

	public move(uids: string | string[], boxTo: string, cb: Function) {
		this._move("UID ", uids, boxTo, cb);
	}

	public fetch(uids: string | string[], options) {
		return this._fetch("UID ", uids, options);
	}

	// Extension methods ===========================================================
	public setLabels(
		uids: string | string[],
		labels: string | string[],
		cb: Function,
	) {
		this.storeLabels("UID ", uids, labels, "", cb);
	}

	public addLabels(uids, labels, cb: Function) {
		this.storeLabels("UID ", uids, labels, "+", cb);
	}

	public delLabels(uids, labels, cb: Function) {
		this.storeLabels("UID ", uids, labels, "-", cb);
	}

	public sort(sorts, criteria: string[], cb: Function) {
		this._sort("UID ", sorts, criteria, cb);
	}

	public esearch(criteria: string[], options, cb: Function) {
		this._esearch("UID ", criteria, options, cb);
	}

	public setQuota(quotaRoot: string, limits, cb: Function) {
		if (typeof limits === "function") {
			cb = limits;
			limits = {};
		}

		let triplets = "";
		Object.keys(limits).forEach((l) => {
			if (triplets) {
				triplets += " ";
			}
			triplets += l + " " + limits[l];
		});

		quotaRoot = escape(utf7.encode("" + quotaRoot));

		this.enqueue(
			'SETQUOTA "' + quotaRoot + '" (' + triplets + ")",
			(err, quotalist) => {
				if (err) {
					return cb(err);
				}

				cb(err, quotalist ? quotalist[0] : limits);
			},
		);
	}

	public getQuota(quotaRoot: string, cb: Function) {
		quotaRoot = escape(utf7.encode("" + quotaRoot));

		this.enqueue('GETQUOTA "' + quotaRoot + '"', (err, quotalist) => {
			if (err) {
				return cb(err);
			}

			cb(err, quotalist[0]);
		});
	}

	public getQuotaRoot(boxName: string, cb: Function) {
		boxName = escape(utf7.encode("" + boxName));

		this.enqueue('GETQUOTAROOT "' + boxName + '"', (err, quotalist) => {
			if (err) {
				return cb(err);
			}

			const quotas = {};
			if (quotalist) {
				for (let i = 0, len = quotalist.length; i < len; ++i) {
					quotas[quotalist[i].root] = quotalist[i].resources;
				}
			}

			cb(err, quotas);
		});
	}

	public thread(algorithm: string, criteria: string[], cb: Function) {
		this._thread("UID ", algorithm, criteria, cb);
	}

	public addFlagsSince(
		uids: string | string[],
		flags: string | string[],
		modseq: number,
		cb: Function,
	) {
		this.store("UID ", uids, { mode: "+", flags, modseq }, cb);
	}

	public delFlagsSince(
		uids: string | string[],
		flags: string | string[],
		modseq: number,
		cb: Function,
	) {
		this.store("UID ", uids, { mode: "-", flags, modseq }, cb);
	}

	public setFlagsSince(
		uids: string | string[],
		flags: string | string[],
		modseq: number,
		cb: Function,
	) {
		this.store("UID ", uids, { mode: "", flags, modseq }, cb);
	}

	public addKeywordsSince(
		uids: string | string[],
		keywords: string | string[],
		modseq: number,
		cb: Function,
	) {
		this.store("UID ", uids, { mode: "+", keywords, modseq }, cb);
	}

	public delKeywordsSince(
		uids: string | string[],
		keywords: string | string[],
		modseq: number,
		cb: Function,
	) {
		this.store("UID ", uids, { mode: "-", keywords, modseq }, cb);
	}

	public setKeywordsSince(
		uids: string | string[],
		keywords: string | string[],
		modseq: number,
		cb: Function,
	) {
		this.store("UID ", uids, { mode: "", keywords, modseq }, cb);
	}

	private _search(which, criteria, cb: Function) {
		if (this.box === undefined) {
			throw new IMAPError("No mailbox is currently selected");
		} else if (!Array.isArray(criteria)) {
			throw new IMAPError("Expected array for search criteria");
		}

		let cmd = which + "SEARCH";
		const info = { hasUTF8: false /*output*/ };
		let query = buildSearchQuery(criteria, this.caps, info);
		let lines;
		if (info.hasUTF8) {
			cmd += " CHARSET UTF-8";
			lines = query.split(CRLF);
			query = lines.shift();
		}
		cmd += query;
		this.enqueue(cmd, cb);
		if (info.hasUTF8) {
			const req = this.queue[this.queue.length - 1];
			req.lines = lines;
		}
	}

	private store(
		which: string,
		uids: string[] | string,
		cfg:
			| { mode: string; flags: string | string[]; modseq?: number }
			| { mode: string; keywords: string | string[]; modseq?: number },
		cb: Function,
	) {
		const mode = cfg.mode;
		const isFlags = "flags" in cfg;
		let items = "flags" in cfg ? cfg.flags : cfg.keywords;
		if (this.box === undefined) {
			throw new IMAPError("No mailbox is currently selected");
		} else if (uids === undefined) {
			throw new IMAPError("No messages specified");
		}

		if (!Array.isArray(uids)) {
			uids = [uids];
		}
		validateUIDList(uids);

		if (uids.length === 0) {
			throw new IMAPError(
				"Empty " + (which === "" ? "sequence number" : "uid") + "list",
			);
		}

		if (
			(!Array.isArray(items) && typeof items !== "string") ||
			(Array.isArray(items) && items.length === 0)
		) {
			throw new IMAPError(
				(isFlags ? "Flags" : "Keywords") +
					" argument must be a string or a non-empty Array",
			);
		}
		if (!Array.isArray(items)) {
			items = [items];
		}
		for (let i = 0, len = items.length; i < len; ++i) {
			if (isFlags) {
				if (items[i][0] !== "\\") {
					items[i] = "\\" + items[i];
				}
			} else {
				// keyword contains any char except control characters (%x00-1F and %x7F)
				// and: '(', ')', '{', ' ', '%', '*', '\', '"', ']'
				if (RE_INVALID_KW_CHARS.test(items[i])) {
					throw new IMAPError(
						'The keyword "' +
							items[i] +
							'" contains invalid characters',
					);
				}
			}
		}

		items = items.join(" ");
		uids = uids.join(",");

		let modifiers = "";
		if (cfg.modseq !== undefined && !this.box?.nomodseq) {
			modifiers += "UNCHANGEDSINCE " + cfg.modseq + " ";
		}

		this.enqueue(
			which +
				"STORE " +
				uids +
				" " +
				modifiers +
				mode +
				"FLAGS.SILENT (" +
				items +
				")",
			cb,
		);
	}

	private _copy(which, uids, boxTo, cb: Function) {
		if (this.box === undefined) {
			throw new IMAPError("No mailbox is currently selected");
		}

		if (!Array.isArray(uids)) {
			uids = [uids];
		}
		validateUIDList(uids);

		if (uids.length === 0) {
			throw new IMAPError(
				"Empty " + (which === "" ? "sequence number" : "uid") + "list",
			);
		}

		boxTo = escape(utf7.encode("" + boxTo));

		this.enqueue(which + "COPY " + uids.join(",") + ' "' + boxTo + '"', cb);
	}

	private _move(which, uids, boxTo, cb: Function) {
		if (this.box === undefined) {
			throw new IMAPError("No mailbox is currently selected");
		}

		if (this.serverSupports("MOVE")) {
			if (!Array.isArray(uids)) {
				uids = [uids];
			}
			validateUIDList(uids);

			if (uids.length === 0) {
				throw new IMAPError(
					"Empty " +
						(which === "" ? "sequence number" : "uid") +
						"list",
				);
			}

			uids = uids.join(",");
			boxTo = escape(utf7.encode("" + boxTo));

			this.enqueue(which + "MOVE " + uids + ' "' + boxTo + '"', cb);
		} else if (
			!this.box.permFlags.has("\\Deleted") &&
			!this.box.flags.has("\\Deleted")
		) {
			throw new IMAPError(
				"Cannot move message: " +
					"server does not allow deletion of messages",
			);
		} else {
			let deletedUIDs;
			let task = 0;
			const ccb = (err, info) => {
				if (err) {
					return cb(err, info);
				}

				if (task === 0 && which && this.serverSupports("UIDPLUS")) {
					// UIDPLUS gives us a 'UID EXPUNGE n' command to expunge a subset of
					// messages with the \Deleted flag set. This allows us to skip some
					// actions.
					task = 2;
				}
				// Make sure we don't expunge any messages marked as Deleted except the
				// one we are moving
				if (task === 0) {
					this.search(["DELETED"], (e, result) => {
						++task;
						deletedUIDs = result;
						ccb(e, info);
					});
				} else if (task === 1) {
					if (deletedUIDs.length) {
						this.delFlags(deletedUIDs, "\\Deleted", (e) => {
							++task;
							ccb(e, info);
						});
					} else {
						++task;
						ccb(err, info);
					}
				} else if (task === 2) {
					const cbMarkDel = (e) => {
						++task;
						ccb(e, info);
					};
					if (which) {
						this.addFlags(uids, "\\Deleted", cbMarkDel);
					} else {
						this.seq.addFlags(uids, "\\Deleted", cbMarkDel);
					}
				} else if (task === 3) {
					if (which && this.serverSupports("UIDPLUS")) {
						this.expunge(uids, (e) => {
							cb(e, info);
						});
					} else {
						this.expunge((e) => {
							++task;
							ccb(e, info);
						});
					}
				} else if (task === 4) {
					if (deletedUIDs.length) {
						this.addFlags(deletedUIDs, "\\Deleted", (e) => {
							cb(e, info);
						});
					} else {
						cb(err, info);
					}
				}
			};
			this._copy(which, uids, boxTo, ccb);
		}
	}

	private _fetch(which, uids, options) {
		if (
			uids === undefined ||
			uids === null ||
			(Array.isArray(uids) && uids.length === 0)
		) {
			throw new IMAPError("Nothing to fetch");
		}

		if (!Array.isArray(uids)) {
			uids = [uids];
		}
		validateUIDList(uids);

		if (uids.length === 0) {
			throw new IMAPError(
				"Empty " + (which === "" ? "sequence number" : "uid") + " list",
			);
		}

		uids = uids.join(",");

		let cmd = which + "FETCH " + uids + " (";
		const fetching = [];
		let i;
		let len;
		let key;

		if (this.serverSupports("X-GM-EXT-1")) {
			fetching.push("X-GM-THRID");
			fetching.push("X-GM-MSGID");
			fetching.push("X-GM-LABELS");
		}
		if (this.serverSupports("CONDSTORE") && !this.box.nomodseq) {
			fetching.push("MODSEQ");
		}

		fetching.push("UID");
		fetching.push("FLAGS");
		fetching.push("INTERNALDATE");

		let modifiers;

		if (options) {
			modifiers = options.modifiers;
			if (options.envelope) {
				fetching.push("ENVELOPE");
			}
			if (options.struct) {
				fetching.push("BODYSTRUCTURE");
			}
			if (options.size) {
				fetching.push("RFC822.SIZE");
			}
			if (Array.isArray(options.extensions)) {
				options.extensions.forEach((extension) => {
					fetching.push(extension.toUpperCase());
				});
			}
			cmd += fetching.join(" ");
			if (options.bodies !== undefined) {
				let bodies = options.bodies;
				const prefix = options.markSeen ? "" : ".PEEK";
				if (!Array.isArray(bodies)) {
					bodies = [bodies];
				}
				for (i = 0, len = bodies.length; i < len; ++i) {
					fetching.push(bodies[i]);
					cmd += " BODY" + prefix + "[" + bodies[i] + "]";
				}
			}
		} else {
			cmd += fetching.join(" ");
		}

		cmd += ")";

		const modkeys =
			typeof modifiers === "object" ? Object.keys(modifiers) : [];
		let modstr = " (";
		for (i = 0, len = modkeys.length, key; i < len; ++i) {
			key = modkeys[i].toUpperCase();
			if (
				key === "CHANGEDSINCE" &&
				this.serverSupports("CONDSTORE") &&
				!this.box.nomodseq
			) {
				modstr += key + " " + modifiers[modkeys[i]] + " ";
			}
		}
		if (modstr.length > 2) {
			cmd += modstr.substring(0, modstr.length - 1);
			cmd += ")";
		}

		this.enqueue(cmd);
		const req = this.queue[this.queue.length - 1];
		req.fetchCache = {};
		req.fetching = fetching;
		return (req.bodyEmitter = new EventEmitter());
	}

	private storeLabels(which, uids, labels, mode, cb: Function) {
		if (!this.serverSupports("X-GM-EXT-1")) {
			throw new IMAPError("Server must support X-GM-EXT-1 capability");
		} else if (this.box === undefined) {
			throw new IMAPError("No mailbox is currently selected");
		} else if (uids === undefined) {
			throw new IMAPError("No messages specified");
		}

		if (!Array.isArray(uids)) {
			uids = [uids];
		}
		validateUIDList(uids);

		if (uids.length === 0) {
			throw new IMAPError(
				"Empty " + (which === "" ? "sequence number" : "uid") + "list",
			);
		}

		if (
			(!Array.isArray(labels) && typeof labels !== "string") ||
			(Array.isArray(labels) && labels.length === 0)
		) {
			throw new IMAPError(
				"labels argument must be a string or a non-empty Array",
			);
		}

		if (!Array.isArray(labels)) {
			labels = [labels];
		}
		labels = labels
			.map((v) => {
				return '"' + escape(utf7.encode("" + v)) + '"';
			})
			.join(" ");

		uids = uids.join(",");

		this.enqueue(
			which +
				"STORE " +
				uids +
				" " +
				mode +
				"X-GM-LABELS.SILENT (" +
				labels +
				")",
			cb,
		);
	}

	private _sort(which, sorts, criteria, cb: Function) {
		if (this.box === undefined) {
			throw new IMAPError("No mailbox is currently selected");
		} else if (!Array.isArray(sorts) || !sorts.length) {
			throw new IMAPError(
				"Expected array with at least one sort criteria",
			);
		} else if (!Array.isArray(criteria)) {
			throw new IMAPError("Expected array for search criteria");
		} else if (!this.serverSupports("SORT")) {
			throw new IMAPError("Sort is not supported on the server");
		}

		sorts = sorts.map((c) => {
			if (typeof c !== "string") {
				throw new IMAPError(
					"Unexpected sort criteria data type. " +
						"Expected string. Got: " +
						typeof criteria,
				);
			}

			let modifier = "";
			if (c[0] === "-") {
				modifier = "REVERSE ";
				c = c.substring(1);
			}
			switch (c.toUpperCase()) {
				case "ARRIVAL":
				case "CC":
				case "DATE":
				case "FROM":
				case "SIZE":
				case "SUBJECT":
				case "TO":
					break;
				default:
					throw new IMAPError("Unexpected sort criteria: " + c);
			}

			return modifier + c;
		});

		sorts = sorts.join(" ");

		const info = { hasUTF8: false /*output*/ };
		let query = buildSearchQuery(criteria, this.caps, info);
		let charset = "US-ASCII";
		let lines;
		if (info.hasUTF8) {
			charset = "UTF-8";
			lines = query.split(CRLF);
			query = lines.shift();
		}

		this.enqueue(which + "SORT (" + sorts + ") " + charset + query, cb);
		if (info.hasUTF8) {
			const req = this.queue[this.queue.length - 1];
			req.lines = lines;
		}
	}

	private _esearch(which, criteria, options, cb: Function) {
		if (this.box === undefined) {
			throw new IMAPError("No mailbox is currently selected");
		} else if (!Array.isArray(criteria)) {
			throw new IMAPError("Expected array for search options");
		}

		const info = { hasUTF8: false /*output*/ };
		let query = buildSearchQuery(criteria, this.caps, info);
		let charset = "";
		let lines;
		if (info.hasUTF8) {
			charset = " CHARSET UTF-8";
			lines = query.split(CRLF);
			query = lines.shift();
		}

		if (typeof options === "function") {
			cb = options;
			options = "";
		} else if (!options) {
			options = "";
		}

		if (Array.isArray(options)) {
			options = options.join(" ");
		}

		this.enqueue(
			which + "SEARCH RETURN (" + options + ")" + charset + query,
			cb,
		);
		if (info.hasUTF8) {
			const req = this.queue[this.queue.length - 1];
			req.lines = lines;
		}
	}

	private _thread(which, algorithm, criteria, cb: Function) {
		algorithm = algorithm.toUpperCase();

		if (!this.serverSupports("THREAD=" + algorithm)) {
			throw new IMAPError(
				"Server does not support that threading algorithm",
			);
		}

		const info = { hasUTF8: false /*output*/ };
		let query = buildSearchQuery(criteria, this.caps, info);
		let charset = "US-ASCII";
		let lines;
		if (info.hasUTF8) {
			charset = "UTF-8";
			lines = query.split(CRLF);
			query = lines.shift();
		}

		this.enqueue(which + "THREAD " + algorithm + " " + charset + query, cb);
		if (info.hasUTF8) {
			const req = this.queue[this.queue.length - 1];
			req.lines = lines;
		}
	}

	private resUntagged(resp: UntaggedResponse) {
		const { content, type } = resp;
		let i;
		let len;
		let box;
		if (content instanceof StatusResponse && content.status === "BYE") {
			if (this.sock) {
				this.sock.end();
			}
		} else if (
			type === "NAMESPACE" &&
			content instanceof NamespaceResponse
		) {
			this.namespaces = content;
		} else if (type === "ID" && content instanceof IDResponse) {
			this.curReq?.cbargs.push(content.details);
		} else if (type === "CAPABILITY" && content instanceof CapabilityList) {
			this.caps = content;
		} else if (
			content instanceof StatusResponse &&
			content.status === "PREAUTH"
		) {
			this.state = "authenticated";
		} else if (content instanceof SortResponse) {
			this.curReq.cbargs.push(content.ids);
		} else if (content instanceof ExtendedSearchResponse) {
			this.curReq.cbargs.push(content);
		} else if (content instanceof ThreadResponse) {
			this.curReq.cbargs.push(content.threads);
		} else if (content instanceof SearchResponse) {
			// CONDSTORE-modified search results
			this.curReq.cbargs.push(content.results);
			this.curReq.cbargs.push(content.modseq);
		} else if (content instanceof QuotaResponse) {
			this.curReq.cbargs.push(content.quotas);
			this.curReq.cbargs.push(content.rootName);
		} else if (content instanceof RecentCount) {
			if (!this.box && RE_OPENBOX.test(this.curReq.type)) {
				this.box = Connection.getDefaultBox();
			}
			if (this.box) {
				this.box.messages.new = content.count;
			}
		} else if (content instanceof FlagList) {
			if (!this.box && RE_OPENBOX.test(this.curReq.type)) {
				this.box = Connection.getDefaultBox();
			}
			if (this.box) {
				this.box.flags = content;
			}
		} else if (
			content instanceof StatusResponse &&
			(content.status === "BAD" || content.status === "NO")
		) {
			if (this.state === "connected" && !this.curReq) {
				if (typeof this.tmrConn !== "undefined") {
					clearTimeout(this.tmrConn);
				}
				if (typeof this.tmrAuth !== "undefined") {
					clearTimeout(this.tmrAuth);
				}
				const err = new IMAPError(
					"Received negative welcome: " + content.text,
				);
				err.source = "protocol";
				this.emit("error", err);
				if (this.sock) {
					this.sock.end();
				}
			}
		} else if (content instanceof ExistsCount) {
			if (!this.box && RE_OPENBOX.test(this.curReq.type)) {
				this.box = Connection.getDefaultBox();
			}
			if (this.box) {
				const prev = this.box.messages.total;
				const now = content.count;
				this.box.messages.total = now;
				if (now > prev && this.state === "authenticated") {
					this.box.messages.new = now - prev;
					this.emit("mail", this.box.messages.new);
				}
			}
		} else if (content instanceof Expunge) {
			if (this.box) {
				if (this.box.messages.total > 0) {
					--this.box.messages.total;
				}
				this.emit("expunge", content.sequenceNumber);
			}
		} else if (
			content instanceof StatusResponse &&
			content.status === "OK"
		) {
			if (this.state === "connected" && !this.curReq) {
				this.login();
			} else if (
				content.text &&
				content.text.code &&
				content.text.code.kind === "ALERT"
			) {
				this.emit("alert", content.text.content);
			} else if (
				this.curReq &&
				content.text &&
				content.text.code &&
				RE_OPENBOX.test(this.curReq.type)
			) {
				// we're opening a mailbox

				if (!this.box) {
					this.box = Connection.getDefaultBox();
				}
				const code = content.text.code;
				const kind = code.kind;

				if (
					kind === "UIDVALIDITY" &&
					code instanceof NumberTextCode &&
					typeof code.value === "number"
				) {
					this.box.uidvalidity = code.value;
				} else if (
					kind === "UIDNEXT" &&
					code instanceof NumberTextCode &&
					typeof code.value === "number"
				) {
					this.box.uidnext = code.value;
				} else if (
					kind === "HIGHESTMODSEQ" &&
					code instanceof NumberTextCode
				) {
					this.box.highestmodseq = "" + code.value;
				} else if (code instanceof PermentantFlagsTextCode) {
					let permFlags: FlagList;
					let keywords;
					this.box.permFlags = permFlags = code.flags;
					this.box.newKeywords = permFlags.includesWildcard;
					this.box.keywords = keywords = permFlags.flags
						.filter((f) => {
							return f.name[0] !== "\\" && !f.isWildcard;
						})
						.map((f) => f.name);
				} else if (kind === "UIDNOTSTICKY") {
					this.box.persistentUIDs = false;
				} else if (kind === "NOMODSEQ") {
					this.box.nomodseq = true;
				}
			} else if (
				content.text &&
				content.text.code &&
				content.text.code.kind === "UIDVALIDITY" &&
				content.text.code instanceof NumberTextCode
			) {
				this.emit("uidvalidity", content.text.code.value);
			}
		} else if (content instanceof MailboxListing) {
			if (this.delimiter === undefined) {
				this.delimiter = content.separator;
			} else {
				if (this.curReq.cbargs.length === 0) {
					this.curReq.cbargs.push({});
				}

				box = {
					attribs: content.flags,
					children: null,
					delimiter: content.separator,
					parent: null,
				};

				box.special_use_attrib = content.getSpecialUse();

				let name = content.name;
				let curChildren = this.curReq.cbargs[0];

				if (box.delimiter) {
					const path = name.split(box.delimiter);
					let parent = null;
					name = path.pop();
					for (i = 0, len = path.length; i < len; ++i) {
						if (!curChildren[path[i]]) {
							curChildren[path[i]] = {};
						}
						if (!curChildren[path[i]].children) {
							curChildren[path[i]].children = {};
						}
						parent = curChildren[path[i]];
						curChildren = curChildren[path[i]].children;
					}
					box.parent = parent;
				}
				if (curChildren[name]) {
					box.children = curChildren[name].children;
				}
				curChildren[name] = box;
			}
		} else if (content instanceof MailboxStatus) {
			this.curReq.cbargs.push(content);
		} else if (content instanceof Fetch) {
			if (/^(?:UID )?FETCH/.test(this.curReq.fullcmd)) {
				this.curReq.bodyEmitter.emit(
					"message",
					content,
					content.sequenceNumber,
				);
			} else {
				// FETCH response sent as result of STORE request or sent unilaterally,
				// treat them as the same for now for simplicity
				this.emit("update", content.sequenceNumber, content);
			}
		}
	}

	private resTagged(info: TaggedResponse) {
		const req = this.curReq;
		let err;

		if (!req) {
			return;
		}

		this.curReq = undefined;

		const status = info.status.status;
		const statusText = info.status.text;
		const statusCode = statusText?.code;
		if (status === "NO" || status === "BAD") {
			if (statusText) {
				err = new IMAPError(statusText.content);
				err.textCode = statusText.code;
			} else {
				err = new IMAPError(req.oauthError);
			}
			err.type = status;
			err.source = "protocol";
		} else if (this.box) {
			if (req.type === "EXAMINE" || req.type === "SELECT") {
				this.box.readOnly =
					statusCode && statusCode.kind.toUpperCase() === "READ-ONLY";
			}

			// According to RFC 3501, UID commands do not give errors for
			// non-existant user-supplied UIDs, so give the callback empty results
			// if we unexpectedly received no untagged responses.
			if (
				RE_UIDCMD_HASRESULTS.test(req.fullcmd) &&
				req.cbargs.length === 0
			) {
				req.cbargs.push([]);
			}
		}

		if (req.bodyEmitter) {
			const bodyEmitter = req.bodyEmitter;
			if (err) {
				bodyEmitter.emit("error", err);
			}
			process.nextTick(() => {
				bodyEmitter.emit("end");
			});
		} else {
			req.cbargs.unshift(err);
			if (statusCode) {
				if (statusCode instanceof AppendUIDTextCode) {
					req.cbargs.push(statusCode.uids);
				} else if (statusCode instanceof CopyUIDTextCode) {
					req.cbargs.push(statusCode.toUIDs);
				}
			}
			if (req.cb) {
				req.cb.apply(this, req.cbargs);
			}
		}

		if (
			this.queue.length === 0 &&
			this.config.keepalive &&
			this.state === "authenticated" &&
			!this.idle.enabled
		) {
			this.idle.enabled = true;
			this.doKeepaliveTimer(true);
		}

		this.processQueue();
	}

	private doKeepaliveTimer(immediate = false) {
		if (!this.config.keepalive) {
			return;
		}

		const keepalive = {
			interval: KEEPALIVE_INTERVAL,
			idleInterval: MAX_IDLE_WAIT,
			forceNoop: false,
		};
		if (typeof this.config.keepalive === "object") {
			Object.assign(keepalive, this.config.keepalive);
		}

		const timerfn = () => {
			if (this.idle.enabled) {
				// unlike NOOP, IDLE is only a valid command after authenticating
				if (
					!this.serverSupports("IDLE") ||
					this.state !== "authenticated" ||
					keepalive.forceNoop
				) {
					this.enqueue("NOOP", true);
				} else {
					if (typeof this.idle.started !== "number") {
						this.idle.started = 0;
						this.enqueue("IDLE", true);
					} else if (this.idle.started > 0) {
						const timeDiff = Date.now() - this.idle.started;
						if (timeDiff >= keepalive.idleInterval) {
							this.idle.enabled = false;
							this.debug("=> DONE");
							if (this.sock) {
								this.sock.write("DONE" + CRLF);
							}
							return;
						}
					}
					this.tmrKeepalive = setTimeout(timerfn, keepalive.interval);
				}
			}
		};

		if (immediate) {
			timerfn();
		} else {
			this.tmrKeepalive = setTimeout(timerfn, keepalive.interval);
		}
	}

	private login() {
		let checkedNS = false;

		const reentry = (err?: Error) => {
			if (this.tmrAuth) {
				clearTimeout(this.tmrAuth);
			}
			if (err) {
				this.emit("error", err);
				if (this.sock) {
					this.sock.end();
				}
				return;
			}

			// 2. Get the list of available namespaces (RFC2342)
			if (!checkedNS && this.serverSupports("NAMESPACE")) {
				checkedNS = true;
				return this.enqueue("NAMESPACE", reentry);
			}

			// 3. Get the top-level mailbox hierarchy delimiter used by the server
			this.enqueue('LIST "" ""', () => {
				this.state = "authenticated";
				this.emit("ready");
			});
		};

		// 1. Get the supported capabilities
		this.enqueue("CAPABILITY", () => {
			// No need to attempt the login sequence if we're on a PREAUTH connection.
			if (this.state === "connected") {
				let err;
				const checkCaps = (error) => {
					if (error) {
						error.source = "authentication";
						return reentry(error);
					}

					if (this.caps === undefined) {
						// Fetch server capabilities if they were not automatically
						// provided after authentication
						return this.enqueue("CAPABILITY", reentry);
					} else {
						reentry();
					}
				};

				if (
					this.serverSupports("STARTTLS") &&
					(this.config.autotls === "always" ||
						(this.config.autotls === "required" &&
							this.serverSupports("LOGINDISABLED")))
				) {
					this.starttls();
					return;
				}

				if (this.serverSupports("LOGINDISABLED")) {
					err = new IMAPError(
						"Logging in is disabled on this server",
					);
					err.source = "authentication";
					return reentry(err);
				}

				let cmd;
				if (this.serverSupports("AUTH=XOAUTH") && this.config.xoauth) {
					this.caps = undefined;
					cmd = "AUTHENTICATE XOAUTH";
					// are there any servers that support XOAUTH/XOAUTH2 and not SASL-IR?
					// if (this.serverSupports('SASL-IR'))
					cmd += " " + escape(this.config.xoauth);
					this.enqueue(cmd, checkCaps);
				} else if (
					this.serverSupports("AUTH=XOAUTH2") &&
					this.config.xoauth2
				) {
					this.caps = undefined;
					cmd = "AUTHENTICATE XOAUTH2";
					// if (this.serverSupports('SASL-IR'))
					cmd += " " + escape(this.config.xoauth2);
					this.enqueue(cmd, checkCaps);
				} else if (this.config.user && this.config.password) {
					this.caps = undefined;
					this.enqueue(
						'LOGIN "' +
							escape(this.config.user) +
							'" "' +
							escape(this.config.password) +
							'"',
						checkCaps,
					);
				} else {
					err = new IMAPError(
						"No supported authentication method(s) available. " +
							"Unable to login.",
					);
					err.source = "authentication";
					return reentry(err);
				}
			} else {
				reentry();
			}
		});
	}

	private starttls() {
		this.enqueue("STARTTLS", (err) => {
			if (err) {
				this.emit("error", err);
				if (this.sock) {
					this.sock.end();
				}
				return;
			}

			this.caps = undefined;
			if (this.sock) {
				this.sock.removeAllListeners("error");
			}

			const tlsOptions: tls.ConnectionOptions = {};

			tlsOptions.host = this.config.host;
			// Host name may be overridden the tlsOptions
			Object.assign(tlsOptions, this.config.tlsOptions);
			if (this.sock) {
				tlsOptions.socket = this.sock;
				this.sock.unpipe(this.newlineTransform);
			}

			this.sock = tls.connect(tlsOptions, () => {
				this.login();
			});

			this.sock.on("error", this.onError);
			this.sock.on("timeout", this.onSocketTimeout);
			this.sock.setTimeout(this.config.socketTimeout);

			// The rest of the piping should still be setup,
			// so just reattach the socket to the start of
			// of the pipeline
			this.sock.pipe(this.newlineTransform);
		});
	}

	private processQueue() {
		if (
			this.curReq ||
			!this.queue.length ||
			!this.sock ||
			!this.sock.writable
		) {
			return;
		}

		this.curReq = this.queue.shift();

		if (this.tagcount === MAX_INT) {
			this.tagcount = 0;
		}

		let prefix;

		if (this.curReq.type === "IDLE" || this.curReq.type === "NOOP") {
			prefix = this.curReq.type;
		} else {
			prefix = "A" + this.tagcount++;
		}

		const out = prefix + " " + this.curReq.fullcmd;
		this.debug("=> " + inspect(out));
		this.sock.write(out + CRLF, "utf8");

		if (this.curReq.literalAppendData) {
			// LITERAL+: we are appending a mesage, and not waiting for a reply
			this.sockWriteAppendData(this.curReq.literalAppendData);
		}
	}

	private sockWriteAppendData(appendData) {
		if (!this.sock) {
			return;
		}

		let val = appendData;
		if (Buffer.isBuffer(appendData)) {
			val = val.toString("utf8");
		}

		this.debug("=> " + inspect(val));
		this.sock.write(val);
		this.sock.write(CRLF);
	}

	// TODO: Function is not specific enough, but cb can be a lot of things
	private enqueue(
		fullcmd: string,
		promote: Function | boolean = false,
		cb?: Function,
	) {
		if (typeof promote === "function") {
			cb = promote;
			promote = false;
		}

		const info: ICommand = {
			cb,
			cbargs: [],
			fullcmd,
			type: fullcmd.match(RE_CMD)[1],
		};

		if (promote) {
			this.queue.unshift(info);
		} else {
			this.queue.push(info);
		}

		if (!this.curReq && this.state !== "disconnected") {
			// defer until next tick for requests like APPEND and FETCH where access to
			// the request object is needed immediately after enqueueing
			process.nextTick(() => {
				this.processQueue();
			});
		} else if (
			this.curReq &&
			this.curReq.type === "IDLE" &&
			this.sock &&
			this.sock.writable &&
			this.idle.enabled
		) {
			this.idle.enabled = false;
			if (this.tmrKeepalive) {
				clearTimeout(this.tmrKeepalive);
			}
			if (this.idle.started > 0) {
				// we've seen the continuation for our IDLE
				this.debug("=> DONE");
				this.sock.write("DONE" + CRLF);
			}
		}
	}
}
