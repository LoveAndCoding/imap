import { decodeWords } from "../encoding";
import { RE_CRLF, RE_ENCWORD_BEGIN, RE_ENCWORD_END, RE_HDR } from "../matchers";
import { IState } from "../types";

export function parseHeader(str: string, noDecode: boolean = false) {
	const lines = str.split(RE_CRLF);
	let len = lines.length;
	const header: Record<string, string[]> = {};
	const state: IState = {
		buffer: undefined,
		consecutive: false,
		curReplace: undefined,
		encoding: undefined,
		remainder: undefined,
		replaces: undefined,
	};
	let m: RegExpExecArray;
	let h: string;
	let i: number;
	let val: string;

	for (i = 0; i < len; ++i) {
		if (lines[i].length === 0) {
			break;
		} // empty line separates message's header and body
		if (lines[i][0] === "\t" || lines[i][0] === " ") {
			if (!Array.isArray(header[h])) {
				continue;
			} // ignore invalid first line
			// folded header content
			val = lines[i];
			if (!noDecode) {
				if (
					RE_ENCWORD_END.test(lines[i - 1]) &&
					RE_ENCWORD_BEGIN.test(val)
				) {
					// RFC2047 says to *ignore* leading whitespace in folded header values
					// for adjacent encoded-words ...
					val = val.substring(1);
				}
			}
			header[h][header[h].length - 1] += val;
		} else {
			m = RE_HDR.exec(lines[i]);
			if (m) {
				h = m[1].toLowerCase().trim();
				if (m[2]) {
					if (header[h] === undefined) {
						header[h] = [m[2]];
					} else {
						header[h].push(m[2]);
					}
				} else {
					header[h] = [""];
				}
			} else {
				break;
			}
		}
	}
	if (!noDecode) {
		let hvs;
		Object.keys(header).forEach((hdr) => {
			hvs = header[hdr];
			for (i = 0, len = header[hdr].length; i < len; ++i) {
				hvs[i] = decodeWords(hvs[i], state);
			}
		});
	}

	return header;
}
