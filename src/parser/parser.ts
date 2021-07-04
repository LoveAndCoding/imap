import { EventEmitter } from "events";
import { inspect } from "util";

import Lexer from "../lexer/lexer";
import { LexerTokenList } from "../lexer/types";
import { CH_LF, LITPLACEHOLDER } from "./constants";
import {
	RE_BODYLITERAL,
	RE_LISTCONTENT,
	RE_LITERAL,
	RE_PRECEDING,
	RE_SEARCH_MODSEQ,
	RE_SEQNO,
	RE_TAGGED,
	RE_UNTAGGED,
} from "./matchers";
import {
	parseBoxList,
	parseESearch,
	parseExpr,
	parseFetch,
	parseId,
	parseNamespaces,
	parseQuota,
	parseQuotaRoot,
	parseStatus,
	parseTextCode,
	TextCode,
} from "./sections";
import ParserStream from "./stream";
import ContinueResponse from "./structure/continue";
import TaggedResponse from "./structure/tagged";
import UntaggedResponse from "./structure/untagged";

function indexOfCh(buffer, len, i, ch) {
	let r = -1;
	for (; i < len; ++i) {
		if (buffer[i] === ch) {
			r = i;
			break;
		}
	}
	return r;
}

export default class Parser extends EventEmitter {
	private debug: (msg: string) => void;
	private body: void | ParserStream;
	private buffer: string;
	private ignoreReadable: boolean;
	private lexer: Lexer;
	private literallen: number;
	private literals: string[];
	private stream: NodeJS.ReadableStream;
	private cbReadable: () => void;

	constructor(stream: NodeJS.ReadableStream, debug?: (msg: string) => void) {
		super();

		this.stream = undefined;
		this.body = undefined;
		this.literallen = 0;
		this.literals = [];
		this.buffer = "";
		this.ignoreReadable = false;
		// Fallback to no-op
		// tslint:disable-next-line:no-empty
		this.debug = debug || (() => {});
		this.lexer = new Lexer();

		this.cbReadable = () => {
			if (this.ignoreReadable) {
				return;
			}
			if (this.literallen > 0 && !this.body) {
				this.tryread(this.literallen);
			} else {
				this.tryread();
			}
		};

		this.setStream(stream);

		process.nextTick(this.cbReadable);
	}

	public setStream(stream: NodeJS.ReadableStream) {
		if (this.stream) {
			this.stream.removeListener("readable", this.cbReadable);
		}

		this.stream = stream;

		this.stream.on("readable", this.cbReadable);
	}

	private tryread(n?: number) {
		if (this.stream.readable) {
			// We know this is a buffer because we don't provide an encoding
			const r: Buffer = this.stream.read(n) as Buffer;
			if (r) {
				this.parse(r);
			}
		}
	}

	private parse(data: Buffer) {
		const datalen = data.length;
		let i = 0;
		let idxlf: number;

		if (this.literallen > 0) {
			if (this.body) {
				const body = this.body;
				if (datalen >= this.literallen) {
					const litlen = this.literallen;
					i = litlen;
					this.literallen = 0;
					this.body = undefined;
					body.readCallback = undefined;
					if (datalen > litlen) {
						body.push(data.slice(0, litlen));
					} else {
						body.push(data);
					}
					body.push(null);
				} else {
					this.literallen -= datalen;
					const r = body.push(data);
					if (!r) {
						body.readCallback = this.cbReadable;
						return;
					}
					i = datalen;
				}
			} else {
				if (datalen > this.literallen) {
					this.literals.push(
						data.slice(0, this.literallen).toString(),
					);
				} else {
					this.literals.push(data.toString());
				}
				i = this.literallen;
				this.literallen = 0;
			}
		}

		while (i < datalen) {
			idxlf = indexOfCh(data, datalen, i, CH_LF);
			if (idxlf === -1) {
				this.buffer += data.toString("utf8", i);
				break;
			} else {
				this.buffer += data.toString("utf8", i, idxlf);
				this.buffer = this.buffer.trim();
				i = idxlf + 1;

				this.debug("<= " + inspect(this.buffer));

				const tokens = this.lexer.tokenize(this.buffer);

				if (RE_PRECEDING.test(this.buffer)) {
					const firstChar = this.buffer[0];
					if (firstChar === "*") {
						this.resUntagged();
					} else if (firstChar === "A") {
						this.resTagged(tokens);
					} else if (firstChar === "+") {
						this.resContinue(tokens);
					}

					if (this.literallen > 0 && i < datalen) {
						this.ignoreReadable = true;
						// literal data included in this chunk -- put it back onto stream
						this.stream.unshift(data.slice(i));
						this.ignoreReadable = false;
						i = datalen;
						if (!this.body) {
							// check if unshifted contents satisfies non-body literal length
							this.tryread(this.literallen);
						}
					}
				} else {
					this.emit("other", this.buffer);
					this.buffer = "";
				}
			}
		}

		if (this.literallen === 0 || this.body) {
			this.tryread();
		}
	}

	private resTagged(tokens: LexerTokenList) {
		let m: RegExpExecArray;
		if ((m = RE_LITERAL.exec(this.buffer))) {
			// non-BODY literal -- buffer it
			this.buffer = this.buffer.replace(RE_LITERAL, LITPLACEHOLDER);
			this.literallen = parseInt(m[1], 10);
		} else if (RE_TAGGED.exec(this.buffer)) {
			this.buffer = "";
			this.literals = [];

			this.emit("tagged", new TaggedResponse(tokens));
		} else {
			this.buffer = "";
		}
	}

	private resUntagged() {
		let m: RegExpExecArray;
		if ((m = RE_BODYLITERAL.exec(this.buffer))) {
			// BODY literal -- stream it
			const which = m[1];
			const size = parseInt(m[2], 10);
			this.literallen = size;
			this.body = new ParserStream();
			m = RE_SEQNO.exec(this.buffer);
			this.buffer = this.buffer.replace(RE_BODYLITERAL, "");
			this.emit("body", this.body, {
				seqno: parseInt(m[1], 10),
				size,
				which,
			});
		} else if ((m = RE_LITERAL.exec(this.buffer))) {
			// non-BODY literal -- buffer it
			this.buffer = this.buffer.replace(RE_LITERAL, LITPLACEHOLDER);
			this.literallen = parseInt(m[1], 10);
		} else if ((m = RE_UNTAGGED.exec(this.buffer))) {
			const tokens = this.lexer.tokenize(this.buffer);
			this.buffer = "";

			try {
				const resp = new UntaggedResponse(tokens);
				this.emit("untagged", resp);
				return;
			} catch (err) {
				// log the error, but fallback
				this.debug(
					[
						"New parsing method not supported:",
						err && err.message ? err.message : err,
						"Falling back to old parsing method.",
					].join("\n"),
				);
			}

			// normal single line response

			// m[1] or m[3] = response type
			// if m[3] is set, m[2] = sequence number (for FETCH) or count
			// m[4] = response text code (optional)
			// m[5] = response text (optional)

			let type: string;
			let num: number;
			let textCode: TextCode;
			let val: any;
			if (m[2] !== undefined) {
				num = parseInt(m[2], 10);
			}
			if (m[4] !== undefined) {
				textCode = parseTextCode(m[4], this.literals);
			}

			type = (m[1] || m[3]).toLowerCase();

			if (
				type === "flags" ||
				type === "search" ||
				type === "capability" ||
				type === "sort"
			) {
				if (m[5]) {
					if (type === "search" && RE_SEARCH_MODSEQ.test(m[5])) {
						// CONDSTORE search response
						const p = RE_SEARCH_MODSEQ.exec(m[5]);
						val = {
							modseq: p[2],
							results: p[1].split(" "),
						};
					} else {
						if (m[5][0] === "(") {
							val = RE_LISTCONTENT.exec(m[5])[1].split(" ");
						} else {
							val = m[5].split(" ");
						}

						if (type === "search" || type === "sort") {
							val = val.map((v) => {
								return parseInt(v, 10);
							});
						}
					}
				} else {
					val = [];
				}
			} else if (type === "thread") {
				if (m[5]) {
					val = parseExpr(m[5], this.literals);
				} else {
					val = [];
				}
			} else if (type === "list" || type === "lsub" || type === "xlist") {
				val = parseBoxList(m[5], this.literals);
			} else if (type === "id") {
				val = parseId(m[5], this.literals);
			} else if (type === "status") {
				val = parseStatus(m[5], this.literals);
			} else if (type === "fetch") {
				val = parseFetch.call(this, m[5], this.literals, num);
			} else if (type === "namespace") {
				val = parseNamespaces(m[5], this.literals);
			} else if (type === "esearch") {
				val = parseESearch(m[5], this.literals);
			} else if (type === "quota") {
				val = parseQuota(m[5], this.literals);
			} else if (type === "quotaroot") {
				val = parseQuotaRoot(m[5], this.literals);
			} else {
				val = m[5];
			}

			this.literals = [];

			this.emit("untagged", {
				num,
				text: val,
				textCode,
				type,
			});
		} else {
			this.buffer = "";
		}
	}

	private resContinue(tokens: LexerTokenList) {
		this.buffer = "";
		this.emit("continue", new ContinueResponse(tokens));
	}
}
