import { Buffer } from "buffer";

import { IMAPError } from "../errors";
import {
	MONTHS,
	RE_BACKSLASH,
	RE_DBLQUOTE,
	RE_INTEGER,
	RE_NUM_RANGE,
} from "./constants";

// utilities -------------------------------------------------------------------

export function escape(str: string) {
	return str.replace(RE_BACKSLASH, "\\\\").replace(RE_DBLQUOTE, '\\"');
}

export function validateUIDList(
	uids: Array<string | number>,
	noThrow: boolean = false,
) {
	for (let i = 0, len = uids.length, intval; i < len; ++i) {
		const uid = uids[i];
		if (typeof uid === "string") {
			if (uid === "*" || uid === "*:*") {
				break;
			} else if (RE_NUM_RANGE.test(uid)) {
				continue;
			}
		}
		intval = parseInt("" + uid, 10);
		if (isNaN(intval)) {
			const err = new IMAPError(
				'UID/seqno must be an integer, "*", or a range: ' + uid,
			);
			if (noThrow) {
				return err;
			} else {
				throw err;
			}
		} else if (intval <= 0) {
			const err = new IMAPError("UID/seqno must be greater than zero");
			if (noThrow) {
				return err;
			} else {
				throw err;
			}
		} else if (typeof uid !== "number") {
			uids[i] = intval;
		}
	}
}

// Pulled from assert.deepEqual:
const pSlice = Array.prototype.slice;
export function deepEqual(actual, expected) {
	// 7.1. All identical values are equivalent, as determined by ===.
	if (actual === expected) {
		return true;
	} else if (Buffer.isBuffer(actual) && Buffer.isBuffer(expected)) {
		if (actual.length !== expected.length) {
			return false;
		}

		for (let i = 0; i < actual.length; i++) {
			if (actual[i] !== expected[i]) {
				return false;
			}
		}

		return true;

		// 7.2. If the expected value is a Date object, the actual value is
		// equivalent if it is also a Date object that refers to the same time.
	} else if (actual instanceof Date && expected instanceof Date) {
		return actual.getTime() === expected.getTime();

		// 7.3 If the expected value is a RegExp object, the actual value is
		// equivalent if it is also a RegExp object with the same source and
		// properties (`global`, `multiline`, `lastIndex`, `ignoreCase`).
	} else if (actual instanceof RegExp && expected instanceof RegExp) {
		return (
			actual.source === expected.source &&
			actual.global === expected.global &&
			actual.multiline === expected.multiline &&
			actual.lastIndex === expected.lastIndex &&
			actual.ignoreCase === expected.ignoreCase
		);

		// 7.4. Other pairs that do not both pass typeof value == 'object',
		// equivalence is determined by ==.
	} else if (typeof actual !== "object" && typeof expected !== "object") {
		// TODO: Figure out if this should be triple equals, or if we want to
		// allow for JS casting.
		// tslint:disable-next-line:triple-equals
		return actual == expected;

		// 7.5 For all other Object pairs, including Array objects, equivalence is
		// determined by having the same number of owned properties (as verified
		// with Object.prototype.hasOwnProperty.call), the same set of keys
		// (although not necessarily the same order), equivalent values for every
		// corresponding key, and an identical 'prototype' property. Note: this
		// accounts for both named and indexed properties on Arrays.
	} else {
		return objEquiv(actual, expected);
	}
}
function isUndefinedOrNull(value) {
	return value === null || value === undefined;
}
function isArguments(object) {
	return Object.prototype.toString.call(object) === "[object Arguments]";
}
function objEquiv(a, b) {
	let ka;
	let kb;
	let key;
	let i;
	if (isUndefinedOrNull(a) || isUndefinedOrNull(b)) {
		return false;
	}
	// an identical 'prototype' property.
	if (a.prototype !== b.prototype) {
		return false;
	}
	// ~~~I've managed to break Object.keys through screwy arguments passing.
	//   Converting to array solves the problem.
	if (isArguments(a)) {
		if (!isArguments(b)) {
			return false;
		}
		a = pSlice.call(a);
		b = pSlice.call(b);
		return deepEqual(a, b);
	}
	try {
		ka = Object.keys(a);
		kb = Object.keys(b);
	} catch (e) {
		// happens when one is a string literal and the other isn't
		return false;
	}
	// having the same number of owned properties (keys incorporates
	// hasOwnProperty)
	if (ka.length !== kb.length) {
		return false;
	}
	// the same set of keys (although not necessarily the same order),
	ka.sort();
	kb.sort();
	// ~~~cheap key test
	for (i = ka.length - 1; i >= 0; i--) {
		// TODO: Figure out if this should be triple equals, or if we want to
		// allow for JS casting.
		// tslint:disable-next-line:triple-equals
		if (ka[i] != kb[i]) {
			return false;
		}
	}
	// equivalent values for every corresponding key, and
	// ~~~possibly expensive deep test
	for (i = ka.length - 1; i >= 0; i--) {
		key = ka[i];
		if (!deepEqual(a[key], b[key])) {
			return false;
		}
	}
	return true;
}
