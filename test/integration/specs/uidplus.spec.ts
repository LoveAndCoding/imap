// UIDPLUS Spec
//
// This file contains spec tests related to RFC 4315, which is the UIDPLUS
// spec. Some of these tests are pulled from the spec examples, while others
// have been created to test variations allowed as outlined in that spec.
import {
	CRLF,
	// Helper FNs
	atom,
	op,
	num,
	// Premade tokens
	tokenCRLF,
	tokenCloseBrack,
	tokenOpenBrack,
	tokenSP,
} from "./constants";
import { TestSpec } from "./types";

const uidplusSet: TestSpec[] = [
	{
		name: "APPENDUID Specification Example #1 - Single UID Append",
		input: ["A003 OK [APPENDUID 38505 3955] APPEND completed", CRLF].join(
			"",
		),
		results: {
			lexer: [
				atom("A003"),
				tokenSP,
				atom("OK"),
				tokenSP,
				tokenOpenBrack,
				atom("APPENDUID"),
				tokenSP,
				num(38505),
				tokenSP,
				num(3955),
				tokenCloseBrack,
				tokenSP,
				atom("APPEND"),
				tokenSP,
				atom("completed"),
				tokenCRLF,
			],
			parser: {
				status: {
					status: "OK",
					text: {
						code: {
							kind: "APPENDUID",
							uidvalidity: 38505,
							uids: {
								set: [
									{
										id: 3955,
									},
								],
							},
						},
						content: "APPEND completed",
					},
				},
				tag: {
					id: 3,
				},
			},
		},
	},
	{
		name: "UID Append Set",
		input: [
			"A003 OK [APPENDUID 5212 3955:3958] APPEND completed",
			CRLF,
		].join(""),
		results: {
			lexer: [
				atom("A003"),
				tokenSP,
				atom("OK"),
				tokenSP,
				tokenOpenBrack,
				atom("APPENDUID"),
				tokenSP,
				num(5212),
				tokenSP,
				num(3955),
				op(":"),
				num(3958),
				tokenCloseBrack,
				tokenSP,
				atom("APPEND"),
				tokenSP,
				atom("completed"),
				tokenCRLF,
			],
			parser: {
				status: {
					status: "OK",
					text: {
						code: {
							kind: "APPENDUID",
							uidvalidity: 5212,
							uids: {
								set: [
									{
										startId: 3955,
										endId: 3958,
									},
								],
							},
						},
						content: "APPEND completed",
					},
				},
				tag: {
					id: 3,
				},
			},
		},
	},
	{
		name: "UID Append Multi-set",
		input: [
			"A003 OK [APPENDUID 5212 3144,3955:3958] APPEND completed",
			CRLF,
		].join(""),
		results: {
			lexer: [
				atom("A003"),
				tokenSP,
				atom("OK"),
				tokenSP,
				tokenOpenBrack,
				atom("APPENDUID"),
				tokenSP,
				num(5212),
				tokenSP,
				num(3144),
				op(","),
				num(3955),
				op(":"),
				num(3958),
				tokenCloseBrack,
				tokenSP,
				atom("APPEND"),
				tokenSP,
				atom("completed"),
				tokenCRLF,
			],
			parser: {
				status: {
					status: "OK",
					text: {
						code: {
							kind: "APPENDUID",
							uidvalidity: 5212,
							uids: {
								set: [
									{
										id: 3144,
									},
									{
										startId: 3955,
										endId: 3958,
									},
								],
							},
						},
						content: "APPEND completed",
					},
				},
				tag: {
					id: 3,
				},
			},
		},
	},
	{
		name: "COPYUID Specification Example #1 - UID Set Copy",
		input: [
			"A004 OK [COPYUID 38505 304,319:320 3956:3958] Done",
			CRLF,
		].join(""),
		results: {
			lexer: [
				atom("A004"),
				tokenSP,
				atom("OK"),
				tokenSP,
				tokenOpenBrack,
				atom("COPYUID"),
				tokenSP,
				num(38505),
				tokenSP,
				num(304),
				op(","),
				num(319),
				op(":"),
				num(320),
				tokenSP,
				num(3956),
				op(":"),
				num(3958),
				tokenCloseBrack,
				tokenSP,
				atom("Done"),
				tokenCRLF,
			],
			parser: {
				status: {
					status: "OK",
					text: {
						code: {
							kind: "COPYUID",
							uidvalidity: 38505,
							fromUIDs: {
								set: [
									{
										id: 304,
									},
									{
										startId: 319,
										endId: 320,
									},
								],
							},
							toUIDs: {
								set: [
									{
										startId: 3956,
										endId: 3958,
									},
								],
							},
						},
						content: "Done",
					},
				},
				tag: {
					id: 4,
				},
			},
		},
	},
	{
		name: "Single UID Copy",
		input: ["A004 OK [COPYUID 38505 304 3956] Done", CRLF].join(""),
		results: {
			lexer: [
				atom("A004"),
				tokenSP,
				atom("OK"),
				tokenSP,
				tokenOpenBrack,
				atom("COPYUID"),
				tokenSP,
				num(38505),
				tokenSP,
				num(304),
				tokenSP,
				num(3956),
				tokenCloseBrack,
				tokenSP,
				atom("Done"),
				tokenCRLF,
			],
			parser: {
				status: {
					status: "OK",
					text: {
						code: {
							kind: "COPYUID",
							uidvalidity: 38505,
							fromUIDs: {
								set: [
									{
										id: 304,
									},
								],
							},
							toUIDs: {
								set: [
									{
										id: 3956,
									},
								],
							},
						},
						content: "Done",
					},
				},
				tag: {
					id: 4,
				},
			},
		},
	},
];

export default uidplusSet;
