import { Buffer } from "buffer";

import { IMAPError } from "../errors";
import { MONTHS, RE_INTEGER } from "./constants";
import { validateUIDList } from "./utils";

function hasNonASCII(str: string) {
	for (let i = 0, len = str.length; i < len; ++i) {
		if (str.charCodeAt(i) > 0x7f) {
			return true;
		}
	}
	return false;
}

function buildString(str: string) {
	if (typeof str !== "string") {
		str = "" + str;
	}

	if (hasNonASCII(str)) {
		const buf = Buffer.from(str, "utf8");
		return "{" + buf.length + "}\r\n" + buf.toString("binary");
	} else {
		return '"' + escape(str) + '"';
	}
}

export function buildSearchQuery(
	options,
	extensions,
	info,
	isOrChild: boolean = false,
) {
	let searchargs = "";
	let val;
	for (let i = 0, len = options.length; i < len; ++i) {
		let criteria = isOrChild ? options : options[i];
		let args: any[] | null = null;
		let modifier = isOrChild ? "" : " ";
		if (typeof criteria === "string") {
			criteria = criteria.toUpperCase();
		} else if (Array.isArray(criteria)) {
			if (criteria.length > 1) {
				args = criteria.slice(1);
			}
			if (criteria.length > 0) {
				criteria = criteria[0].toUpperCase();
			}
		} else {
			throw new IMAPError(
				"Unexpected search option data type. " +
					"Expected string or array. Got: " +
					typeof criteria,
			);
		}
		if (criteria === "OR") {
			if (!args || args.length !== 2) {
				throw new IMAPError("OR must have exactly two arguments");
			}
			if (isOrChild) {
				searchargs += "OR (";
			} else {
				searchargs += " OR (";
			}
			searchargs += buildSearchQuery(args[0], extensions, info, true);
			searchargs += ") (";
			searchargs += buildSearchQuery(args[1], extensions, info, true);
			searchargs += ")";
		} else {
			if (criteria[0] === "!") {
				modifier += "NOT ";
				criteria = criteria.substr(1);
			}
			switch (criteria) {
				// -- Standard criteria --
				case "ALL":
				case "ANSWERED":
				case "DELETED":
				case "DRAFT":
				case "FLAGGED":
				case "NEW":
				case "SEEN":
				case "RECENT":
				case "OLD":
				case "UNANSWERED":
				case "UNDELETED":
				case "UNDRAFT":
				case "UNFLAGGED":
				case "UNSEEN":
					searchargs += modifier + criteria;
					break;
				case "BCC":
				case "BODY":
				case "CC":
				case "FROM":
				case "SUBJECT":
				case "TEXT":
				case "TO":
					if (!args || args.length !== 1) {
						throw new IMAPError(
							"Incorrect number of arguments for search option: " +
								criteria,
						);
					}
					val = buildString(args[0]);
					if (info && val[0] === "{") {
						info.hasUTF8 = true;
					}
					searchargs += modifier + criteria + " " + val;
					break;
				case "BEFORE":
				case "ON":
				case "SENTBEFORE":
				case "SENTON":
				case "SENTSINCE":
				case "SINCE":
					if (!args || args.length !== 1) {
						throw new IMAPError(
							"Incorrect number of arguments for search option: " +
								criteria,
						);
					} else if (!(args[0] instanceof Date)) {
						if (
							(args[0] = new Date(args[0])).toString() ===
							"Invalid Date"
						) {
							throw new IMAPError(
								"Search option argument must be a Date object" +
									" or a parseable date string",
							);
						}
					}
					searchargs +=
						modifier +
						criteria +
						" " +
						args[0].getDate() +
						"-" +
						MONTHS[args[0].getMonth()] +
						"-" +
						args[0].getFullYear();
					break;
				case "KEYWORD":
				case "UNKEYWORD":
					if (!args || args.length !== 1) {
						throw new IMAPError(
							"Incorrect number of arguments for search option: " +
								criteria,
						);
					}
					searchargs += modifier + criteria + " " + args[0];
					break;
				case "LARGER":
				case "SMALLER":
					if (!args || args.length !== 1) {
						throw new IMAPError(
							"Incorrect number of arguments for search option: " +
								criteria,
						);
					}
					const num = parseInt(args[0], 10);
					if (isNaN(num)) {
						throw new IMAPError(
							"Search option argument must be a number",
						);
					}
					searchargs += modifier + criteria + " " + args[0];
					break;
				case "HEADER":
					if (!args || args.length !== 2) {
						throw new IMAPError(
							"Incorrect number of arguments for search option: " +
								criteria,
						);
					}
					val = buildString(args[1]);
					if (info && val[0] === "{") {
						info.hasUTF8 = true;
					}
					searchargs +=
						modifier +
						criteria +
						' "' +
						escape("" + args[0]) +
						'" ' +
						val;
					break;
				case "UID":
					if (!args) {
						throw new IMAPError(
							"Incorrect number of arguments for search option: " +
								criteria,
						);
					}
					validateUIDList(args);
					if (args.length === 0) {
						throw new IMAPError("Empty uid list");
					}
					searchargs += modifier + criteria + " " + args.join(",");
					break;
				// Extensions ==========================================================
				case "X-GM-MSGID": // Gmail unique message ID
				case "X-GM-THRID": // Gmail thread ID
					if (extensions.indexOf("X-GM-EXT-1") === -1) {
						throw new IMAPError(
							"IMAP extension not available for: " + criteria,
						);
					}
					if (!args || args.length !== 1) {
						throw new IMAPError(
							"Incorrect number of arguments for search option: " +
								criteria,
						);
					} else {
						val = "" + args[0];
						if (!RE_INTEGER.test(args[0])) {
							throw new IMAPError("Invalid value");
						}
					}
					searchargs += modifier + criteria + " " + val;
					break;
				case "X-GM-RAW": // Gmail search syntax
					if (extensions.indexOf("X-GM-EXT-1") === -1) {
						throw new IMAPError(
							"IMAP extension not available for: " + criteria,
						);
					}
					if (!args || args.length !== 1) {
						throw new IMAPError(
							"Incorrect number of arguments for search option: " +
								criteria,
						);
					}
					val = buildString(args[0]);
					if (info && val[0] === "{") {
						info.hasUTF8 = true;
					}
					searchargs += modifier + criteria + " " + val;
					break;
				case "X-GM-LABELS": // Gmail labels
					if (extensions.indexOf("X-GM-EXT-1") === -1) {
						throw new IMAPError(
							"IMAP extension not available for: " + criteria,
						);
					}
					if (!args || args.length !== 1) {
						throw new IMAPError(
							"Incorrect number of arguments for search option: " +
								criteria,
						);
					}
					searchargs += modifier + criteria + " " + args[0];
					break;
				case "MODSEQ":
					if (extensions.indexOf("CONDSTORE") === -1) {
						throw new IMAPError(
							"IMAP extension not available for: " + criteria,
						);
					}
					if (!args || args.length !== 1) {
						throw new IMAPError(
							"Incorrect number of arguments for search option: " +
								criteria,
						);
					}
					searchargs += modifier + criteria + " " + args[0];
					break;
				default:
					// last hope it's a seqno set
					// http://tools.ietf.org/html/rfc3501#section-6.4.4
					const seqnos = args ? [criteria].concat(args) : [criteria];
					if (!validateUIDList(seqnos, true)) {
						if (seqnos.length === 0) {
							throw new IMAPError("Empty sequence number list");
						}
						searchargs += modifier + seqnos.join(",");
					} else {
						throw new IMAPError(
							"Unexpected search option: " + criteria,
						);
					}
			}
		}
		if (isOrChild) {
			break;
		}
	}
	return searchargs;
}
