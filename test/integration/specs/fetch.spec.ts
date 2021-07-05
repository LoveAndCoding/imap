// Fetch Spec
//
// This file contains a set of fetch related commands and their expected
// results. Fetch is one of the most frequently used commands in IMAP,
// and is also one of the most complex.
//
// Many of these examples are pulled directly from the IMAP specification.
import {
	CRLF,
	// Helper FNs
	atom,
	litString,
	op,
	num,
	// Premade tokens
	tokenCRLF,
	tokenSP,
	tokenStar,
} from "./constants";
import { TestSpec } from "./types";

// And finally, build our set of test specs
const fetchSet: TestSpec[] = [
	{
		name: "Untagged FETCH with non-body literal",
		input: [
			"* 12 FETCH (INTERNALDATE {26}",
			CRLF,
			"17-Jul-1996 02:44:25 -0700)",
			CRLF,
		].join(""),
		results: {
			lexer: [
				tokenStar,
				tokenSP,
				num(12),
				tokenSP,
				atom("FETCH"),
				tokenSP,
				op("("),
				atom("INTERNALDATE"),
				tokenSP,
				litString("17-Jul-1996 02:44:25 -0700"),
				op(")"),
				tokenCRLF,
			],
			parser: {
				content: {
					sequenceNumber: 12,
					date: new Date("17-Jul-1996 02:44:25 -0700"),
				},
				type: "FETCH",
			},
		},
	},
];

export default fetchSet;
