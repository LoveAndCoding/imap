import { imap } from "utf7";

import { RE_ENCWORD, RE_LWS_ONLY, RE_QENC } from "./matchers";
import { ISequence, IState } from "./types";

export const utf7 = imap;

export function decodeBytes(
	buf: Buffer,
	encoding: string,
	offset: number,
	mlen: number,
	pendoffset: number,
	state: IState,
	nextBuf: Buffer,
) {
	if (encodingExists(encoding)) {
		if (state.buffer !== undefined) {
			if (state.encoding === encoding && state.consecutive) {
				// concatenate buffer + current bytes in hopes of finally having
				// something that's decodable
				const newbuf = Buffer.alloc(state.buffer.length + buf.length);
				state.buffer.copy(newbuf, 0);
				buf.copy(newbuf, state.buffer.length);
				buf = newbuf;
			} else {
				// either:
				//   - the current encoded word is not separated by the previous partial
				//     encoded word by linear whitespace, OR
				//   - the current encoded word and the previous partial encoded word
				//     use different encodings
				state.buffer = state.encoding = undefined;
				state.curReplace = undefined;
			}
		}
		let ret;
		let isPartial = false;
		if (state.remainder !== undefined) {
			// use cached remainder from the previous lookahead
			ret = state.remainder;
			state.remainder = undefined;
		} else {
			try {
				ret = new TextDecoder(encoding).decode(buf);
			} catch (e) {
				if (e.message.indexOf("Seeking") === 0) {
					isPartial = true;
				}
			}
		}
		if (!isPartial && nextBuf) {
			// try to decode a lookahead buffer (current buffer + next buffer)
			// and see if it starts with the decoded value of the current buffer.
			// if not, the current buffer is partial
			let lookahead;
			const lookaheadBuf = Buffer.alloc(buf.length + nextBuf.length);
			buf.copy(lookaheadBuf);
			nextBuf.copy(lookaheadBuf, buf.length);
			try {
				lookahead = new TextDecoder(encoding).decode(lookaheadBuf);
			} catch (e) {
				// cannot decode the lookahead, do nothing
			}
			if (lookahead !== undefined) {
				if (lookahead.indexOf(ret) === 0) {
					// the current buffer is whole, cache the lookahead's remainder
					state.remainder = lookahead.substring(ret.length);
				} else {
					isPartial = true;
					ret = undefined;
				}
			}
		}
		if (ret !== undefined) {
			if (state.curReplace) {
				// we have some previous partials which were finally "satisfied" by the
				// current encoded word, so replace from the beginning of the first
				// partial to the end of the current encoded word
				state.replaces.push({
					fromOffset: state.curReplace[0].fromOffset,
					toOffset: offset + mlen,
					val: ret,
				});
				state.replaces.splice(
					state.replaces.indexOf(state.curReplace),
					1,
				);
				state.curReplace = undefined;
			} else {
				// normal case where there are no previous partials and we successfully
				// decoded a single encoded word
				state.replaces.push({
					// we ignore linear whitespace between consecutive encoded words
					fromOffset: state.consecutive ? pendoffset : offset,
					toOffset: offset + mlen,
					val: ret,
				});
			}
			state.buffer = state.encoding = undefined;
			return;
		} else if (isPartial) {
			// RFC2047 says that each decoded encoded word "MUST represent an integral
			// number of characters. A multi-octet character may not be split across
			// adjacent encoded-words." However, some MUAs appear to go against this,
			// so we join broken encoded words separated by linear white space until
			// we can successfully decode or we see a change in encoding
			state.encoding = encoding;
			state.buffer = buf;
			if (!state.curReplace) {
				state.curReplace = [];
				state.replaces.push(state.curReplace);
			}
			state.curReplace.push({
				fromOffset: offset,
				toOffset: offset + mlen,
				// the value we replace this encoded word with if it doesn't end up
				// becoming part of a successful decode
				val: "\uFFFD".repeat(buf.length),
			});
			return;
		}
	}
	// in case of unexpected error or unsupported encoding, just substitute the
	// raw bytes
	state.replaces.push({
		fromOffset: offset,
		toOffset: offset + mlen,
		val: buf.toString("binary"),
	});
}

export function decodeWords(str: string, state?: IState) {
	let pendoffset = -1;

	if (!state) {
		state = {
			buffer: undefined,
			consecutive: false,
			curReplace: undefined,
			encoding: undefined,
			remainder: undefined,
			replaces: undefined,
		};
	}

	state.replaces = [];

	let bytes: Buffer;
	let regexMatch: RegExpExecArray;
	let next: ISequence;
	let i: number;
	let j: number;
	let leni: number;
	let lenj: number;
	let seq: ISequence;
	const replaces: ISequence[] = [];
	let replaceMatch: ISequence;
	let lastReplace: any = {};

	// join consecutive q-encoded words that have the same charset first
	while ((regexMatch = RE_ENCWORD.exec(str))) {
		seq = {
			buf: undefined,
			charset: regexMatch[1].toLowerCase(),
			chunk: regexMatch[3],
			consecutive:
				pendoffset > -1
					? RE_LWS_ONLY.test(
							str.substring(pendoffset, regexMatch.index),
					  )
					: false,
			encoding: regexMatch[2].toLowerCase(),
			index: regexMatch.index,
			length: regexMatch[0].length,
			pendoffset,
		};
		lastReplace = replaces.length && replaces[replaces.length - 1];
		if (
			seq.consecutive &&
			seq.charset === lastReplace.charset &&
			seq.encoding === lastReplace.encoding &&
			seq.encoding === "q"
		) {
			lastReplace.length += seq.length + seq.index - pendoffset;
			lastReplace.chunk += seq.chunk;
		} else {
			replaces.push(seq);
			lastReplace = seq;
		}
		pendoffset = regexMatch.index + regexMatch[0].length;
	}

	// generate replacement substrings and their positions
	for (i = 0, leni = replaces.length; i < leni; ++i) {
		replaceMatch = replaces[i];
		state.consecutive = replaceMatch.consecutive;
		if (replaceMatch.encoding === "q") {
			// q-encoding, similar to quoted-printable
			bytes = Buffer.from(
				replaceMatch.chunk.replace(RE_QENC, qEncReplacer),
				"binary",
			);
			next = undefined;
		} else {
			// base64
			bytes =
				replaceMatch.buf || Buffer.from(replaceMatch.chunk, "base64");
			next = replaces[i + 1];
			if (
				next &&
				next.consecutive &&
				next.encoding === replaceMatch.encoding &&
				next.charset === replaceMatch.charset
			) {
				// we use the next base64 chunk, if any, to determine the integrity
				// of the current chunk
				next.buf = Buffer.from(next.chunk, "base64");
			}
		}
		decodeBytes(
			bytes,
			replaceMatch.charset,
			replaceMatch.index,
			replaceMatch.length,
			// Because we set this above, we know we have a pendoffset
			replaceMatch.pendoffset as number,
			state,
			next && next.buf,
		);
	}

	// perform the actual replacements
	for (i = state.replaces.length - 1; i >= 0; --i) {
		let rpl = state.replaces[i];
		if (Array.isArray(rpl)) {
			for (j = 0, lenj = rpl.length; j < lenj; ++j) {
				str =
					str.substring(0, rpl[j].fromOffset) +
					rpl[j].val +
					str.substring(seq[j].toOffset);
			}
		} else {
			str =
				str.substring(0, rpl.fromOffset) +
				rpl.val +
				str.substring(rpl.toOffset);
		}
	}

	return str;
}

function qEncReplacer(match, byte) {
	if (match === "_") {
		return " ";
	} else {
		return String.fromCharCode(parseInt(byte, 16));
	}
}

function encodingExists(encoding: string) {
	// From: https://nodejs.org/dist/latest-v14.x/docs/api/util.html#util_whatwg_supported_encodings
	return [
		"ibm866",
		"866",
		"cp866",
		"csibm866",
		"iso-8859-2",
		"csisolatin2",
		"iso-ir-101",
		"iso8859-2",
		"iso88592",
		"iso_8859-2",
		"iso_8859-2:1987",
		"l2",
		"latin2",
		"iso-8859-3",
		"csisolatin3",
		"iso-ir-109",
		"iso8859-3",
		"iso88593",
		"iso_8859-3",
		"iso_8859-3:1988",
		"l3",
		"latin3",
		"iso-8859-4",
		"csisolatin4",
		"iso-ir-110",
		"iso8859-4",
		"iso88594",
		"iso_8859-4",
		"iso_8859-4:1988",
		"l4",
		"latin4",
		"iso-8859-5",
		"csisolatincyrillic",
		"cyrillic",
		"iso-ir-144",
		"iso8859-5",
		"iso88595",
		"iso_8859-5",
		"iso_8859-5:1988",
		"iso-8859-6",
		"arabic",
		"asmo-708",
		"csiso88596e",
		"csiso88596i",
		"csisolatinarabic",
		"ecma-114",
		"iso-8859-6-e",
		"iso-8859-6-i",
		"iso-ir-127",
		"iso8859-6",
		"iso88596",
		"iso_8859-6",
		"iso_8859-6:1987",
		"iso-8859-7",
		"csisolatingreek",
		"ecma-118",
		"elot_928",
		"greek",
		"greek8",
		"iso-ir-126",
		"iso8859-7",
		"iso88597",
		"iso_8859-7",
		"iso_8859-7:1987",
		"sun_eu_greek",
		"iso-8859-8",
		"csiso88598e",
		"csisolatinhebrew",
		"hebrew",
		"iso-8859-8-e",
		"iso-ir-138",
		"iso8859-8",
		"iso88598",
		"iso_8859-8",
		"iso_8859-8:1988",
		"visual",
		"iso-8859-8-i",
		"csiso88598i",
		"logical",
		"iso-8859-10",
		"csisolatin6",
		"iso-ir-157",
		"iso8859-10",
		"iso885910",
		"l6",
		"latin6",
		"iso-8859-13",
		"iso8859-13",
		"iso885913",
		"iso-8859-14",
		"iso8859-14",
		"iso885914",
		"iso-8859-15",
		"csisolatin9",
		"iso8859-15",
		"iso885915",
		"iso_8859-15",
		"l9",
		"koi8-r",
		"cskoi8r",
		"koi",
		"koi8",
		"koi8_r",
		"koi8-u",
		"koi8-ru",
		"macintosh",
		"csmacintosh",
		"mac",
		"x-mac-roman",
		"windows-874",
		"dos-874",
		"iso-8859-11",
		"iso8859-11",
		"iso885911",
		"tis-620",
		"windows-1250",
		"cp1250",
		"x-cp1250",
		"windows-1251",
		"cp1251",
		"x-cp1251",
		"windows-1252",
		"ansi_x3.4-1968",
		"ascii",
		"cp1252",
		"cp819",
		"csisolatin1",
		"ibm819",
		"iso-8859-1",
		"iso-ir-100",
		"iso8859-1",
		"iso88591",
		"iso_8859-1",
		"iso_8859-1:1987",
		"l1",
		"latin1",
		"us-ascii",
		"x-cp1252",
		"windows-1253",
		"cp1253",
		"x-cp1253",
		"windows-1254",
		"cp1254",
		"csisolatin5",
		"iso-8859-9",
		"iso-ir-148",
		"iso8859-9",
		"iso88599",
		"iso_8859-9",
		"iso_8859-9:1989",
		"l5",
		"latin5",
		"x-cp1254",
		"windows-1255",
		"cp1255",
		"x-cp1255",
		"windows-1256",
		"cp1256",
		"x-cp1256",
		"windows-1257",
		"cp1257",
		"x-cp1257",
		"windows-1258",
		"cp1258",
		"x-cp1258",
		"x-mac-cyrillic",
		"x-mac-ukrainian",
		"gbk",
		"chinese",
		"csgb2312",
		"csiso58gb231280",
		"gb2312",
		"gb_2312",
		"gb_2312-80",
		"iso-ir-58",
		"x-gbk",
		"gb18030",
		"big5",
		"big5-hkscs",
		"cn-big5",
		"csbig5",
		"x-x-big5",
		"euc-jp",
		"cseucpkdfmtjapanese",
		"x-euc-jp",
		"iso-2022-jp",
		"csiso2022jp",
		"shift_jis",
		"csshiftjis",
		"ms932",
		"ms_kanji",
		"shift-jis",
		"sjis",
		"windows-31j",
		"x-sjis",
		"euc-kr",
		"cseuckr",
		"csksc56011987",
		"iso-ir-149",
		"korean",
		"ks_c_5601-1987",
		"ks_c_5601-1989",
		"ksc5601",
		"ksc_5601",
		"windows-949",
		"utf-8",
		"unicode-1-1-utf-8",
		"utf8",
		"utf-16le",
		"utf-16",
		"utf-16be",
	].includes(encoding);
}
