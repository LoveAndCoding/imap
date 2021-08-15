// Simple Spec
//
// This file contains a set of simple commands and their expected results
// for running tests with. These commands should generally result in basic
// and predictable parsing and lexing results that can be easily reasoned
// by simply reading the input
//
// Many of these examples are pulled directly from the IMAP specification.
import { NumberToken } from "../../../src/lexer/tokens";
import {
	CRLF,
	// Helper FNs
	atom,
	qString,
	op,
	num,
	// Premade tokens
	tokenCRLF,
	tokenCloseBrack,
	tokenCloseParen,
	tokenNil,
	tokenOpenBrack,
	tokenOpenParen,
	tokenPlus,
	tokenSP,
	tokenStar,
} from "./constants";
import { TestSpec } from "./types";

// And finally, build our set of test specs
const simpleSet: TestSpec[] = [
	{
		name: "Tagged OK",
		input: ["A1 OK LOGIN completed", CRLF].join(""),
		results: {
			lexer: [
				atom("A1"),
				tokenSP,
				atom("OK"),
				tokenSP,
				atom("LOGIN"),
				tokenSP,
				atom("completed"),
				tokenCRLF,
			],
			parser: {
				status: {
					status: "OK",
					text: {
						content: "LOGIN completed",
					},
				},
				tag: {
					id: 1,
				},
			},
		},
	},
	{
		name: "Unknown line",
		input: ["IDLE OK IDLE terminated", CRLF].join(""),
		results: {
			lexer: [
				atom("IDLE"),
				tokenSP,
				atom("OK"),
				tokenSP,
				atom("IDLE"),
				tokenSP,
				atom("terminated"),
				tokenCRLF,
			],
			parser: { text: "IDLE OK IDLE terminated" },
		},
	},
	{
		name: "Unknown line with + char",
		input: [
			"IDLE OK Idle completed (0.002 + 1.783 + 1.783 secs).",
			CRLF,
		].join(""),
		results: {
			lexer: [
				atom("IDLE"),
				tokenSP,
				atom("OK"),
				tokenSP,
				atom("Idle"),
				tokenSP,
				atom("completed"),
				tokenSP,
				tokenOpenParen,
				num(0),
				op("."),
				new NumberToken("002"),
				tokenSP,
				tokenPlus,
				tokenSP,
				num(1),
				op("."),
				num(783),
				tokenSP,
				tokenPlus,
				tokenSP,
				num(1),
				op("."),
				num(783),
				tokenSP,
				atom("secs"),
				tokenCloseParen,
				op("."),
				tokenCRLF,
			],
			parser: {
				text: "IDLE OK Idle completed (0.002 + 1.783 + 1.783 secs).",
			},
		},
	},
	{
		name: "Tagged OK (no text code, no text)",
		input: ["A1 OK", CRLF].join(""), // some servers like ppops.net sends such response
		results: {
			lexer: [atom("A1"), tokenSP, atom("OK"), tokenCRLF],
			parser: {
				status: {
					status: "OK",
					text: {
						content: "",
					},
				},
				tag: {
					id: 1,
				},
			},
		},
	},
	{
		name: "Tagged OK Modified Text Code",
		input: [
			"a106 OK [MODIFIED 101,110:111] Conditional STORE failed",
			CRLF,
		].join(""),
		results: {
			lexer: [
				atom("a106"),
				tokenSP,
				atom("OK"),
				tokenSP,
				tokenOpenBrack,
				atom("MODIFIED"),
				tokenSP,
				num(101),
				op(","),
				num(110),
				op(":"),
				num(111),
				tokenCloseBrack,
				tokenSP,
				atom("Conditional"),
				tokenSP,
				atom("STORE"),
				tokenSP,
				atom("failed"),
				tokenCRLF,
			],
			parser: {
				status: {
					status: "OK",
					text: {
						code: {
							kind: "MODIFIED",
							uids: {
								set: [
									{ id: 101 },
									{ startId: 110, endId: 111 },
								],
							},
						},
						content: "Conditional STORE failed",
					},
				},
				tag: {
					id: 106,
				},
			},
		},
	},
	{
		name: "Continuation",
		input: ["+ idling", CRLF].join(""),
		results: {
			lexer: [tokenPlus, tokenSP, atom("idling"), tokenCRLF],
			parser: {
				text: {
					content: "idling",
				},
			},
		},
	},
	{
		name: "Continuation with text code",
		input: ["+ [ALERT] idling", CRLF].join(""),
		results: {
			lexer: [
				tokenPlus,
				tokenSP,
				tokenOpenBrack,
				atom("ALERT"),
				tokenCloseBrack,
				tokenSP,
				atom("idling"),
				tokenCRLF,
			],
			parser: {
				text: {
					code: {
						kind: "ALERT",
					},
					content: "idling",
				},
			},
		},
	},
	{
		name: "Continuation (broken -- RFC violation) sent by AOL IMAP",
		input: `+${CRLF}`,
		results: {
			lexer: [tokenPlus, tokenCRLF],
			parser: {
				text: {
					content: "",
				},
			},
		},
	},
	{
		name: "Multiple namespaces",
		input: [
			"* NAMESPACE ",
			'(("" "/")) ',
			'(("~" "/")) ',
			'(("#shared/" "/")("#public/" "/")("#ftp/" "/")("#news." "."))',
			CRLF,
		].join(""),
		results: {
			lexer: [
				// '* NAMESPACE '
				tokenStar,
				tokenSP,
				atom("NAMESPACE"),
				tokenSP,
				// '(("" "/")) '
				tokenOpenParen,
				tokenOpenParen,
				qString(""),
				tokenSP,
				qString("/"),
				tokenCloseParen,
				tokenCloseParen,
				tokenSP,
				// '(("~" "/")) '
				tokenOpenParen,
				tokenOpenParen,
				qString("~"),
				tokenSP,
				qString("/"),
				tokenCloseParen,
				tokenCloseParen,
				tokenSP,
				// '(("#shared/" "/")("#public/" "/")("#ftp/" "/")("#news." "."))'
				tokenOpenParen,
				tokenOpenParen,
				qString("#shared/"),
				tokenSP,
				qString("/"),
				tokenCloseParen,
				tokenOpenParen,
				qString("#public/"),
				tokenSP,
				qString("/"),
				tokenCloseParen,
				tokenOpenParen,
				qString("#ftp/"),
				tokenSP,
				qString("/"),
				tokenCloseParen,
				tokenOpenParen,
				qString("#news."),
				tokenSP,
				qString("."),
				tokenCloseParen,
				tokenCloseParen,
				tokenCRLF,
			],
			parser: {
				content: {
					personal: {
						configurations: [
							{
								delimeter: "/",
								prefix: "",
								extensions: [],
							},
						],
						kind: 0, // NamespaceKind.Personal === 0
					},
					others: {
						configurations: [
							{
								delimeter: "/",
								prefix: "~",
								extensions: [],
							},
						],
						kind: 1, // NamespaceKind.Others === 1
					},
					shared: {
						configurations: [
							{
								delimeter: "/",
								prefix: "#shared/",
								extensions: [],
							},
							{
								delimeter: "/",
								prefix: "#public/",
								extensions: [],
							},
							{
								delimeter: "/",
								prefix: "#ftp/",
								extensions: [],
							},
							{
								delimeter: ".",
								prefix: "#news.",
								extensions: [],
							},
						],
						kind: 2, // NamespaceKind.Shared === 2
					},
				},
				type: "NAMESPACE",
			},
		},
	},
	{
		name: "Multiple namespaces (NIL Variant)",
		input: [
			"* NAMESPACE ",
			'(("" "/" "X-PARAM" ("FLAG1" "FLAG2"))) ',
			"NIL ",
			"NIL",
			CRLF,
		].join(""),
		results: {
			lexer: [
				// '* NAMESPACE '
				tokenStar,
				tokenSP,
				atom("NAMESPACE"),
				tokenSP,
				// '(("" "/" "X-PARAM" ("FLAG1" "FLAG2"))) '
				tokenOpenParen,
				tokenOpenParen,
				qString(""),
				tokenSP,
				qString("/"),
				tokenSP,
				qString("X-PARAM"),
				tokenSP,
				tokenOpenParen,
				qString("FLAG1"),
				tokenSP,
				qString("FLAG2"),
				tokenCloseParen,
				tokenCloseParen,
				tokenCloseParen,
				tokenSP,
				// 'NIL '
				tokenNil,
				tokenSP,
				// 'NIL'
				tokenNil,
				tokenCRLF,
			],
			parser: {
				content: {
					personal: {
						configurations: [
							{
								delimeter: "/",
								prefix: "",
								extensions: [
									{
										name: "X-PARAM",
										values: ["FLAG1", "FLAG2"],
									},
								],
							},
						],
						kind: 0, // NamespaceKind.Personal === 0
					},
					others: null,
					shared: null,
				},
				type: "NAMESPACE",
			},
		},
	},
	{
		name: "Flags",
		input: [
			"* FLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft)",
			CRLF,
		].join(""),
		results: {
			lexer: [
				tokenStar,
				tokenSP,
				atom("FLAGS"),
				tokenSP,
				tokenOpenParen,
				op("\\"),
				atom("Answered"),
				tokenSP,
				op("\\"),
				atom("Flagged"),
				tokenSP,
				op("\\"),
				atom("Deleted"),
				tokenSP,
				op("\\"),
				atom("Seen"),
				tokenSP,
				op("\\"),
				atom("Draft"),
				tokenCloseParen,
				tokenCRLF,
			],
		},
	},
	{
		name: "Search",
		input: ["* SEARCH 2 3 6", CRLF].join(""),
		results: {
			lexer: [
				tokenStar,
				tokenSP,
				atom("SEARCH"),
				tokenSP,
				num(2),
				tokenSP,
				num(3),
				tokenSP,
				num(6),
				tokenCRLF,
			],
			parser: {
				content: {
					results: [2, 3, 6],
				},
				type: "SEARCH",
			},
		},
	},
	{
		name: "Search with MODSEQ",
		input: ["* SEARCH 2 3 6 (MODSEQ 917162500)", CRLF].join(""),
		results: {
			lexer: [
				tokenStar,
				tokenSP,
				atom("SEARCH"),
				tokenSP,
				num(2),
				tokenSP,
				num(3),
				tokenSP,
				num(6),
				tokenSP,
				tokenOpenParen,
				atom("MODSEQ"),
				tokenSP,
				num(917162500),
				tokenCloseParen,
				tokenCRLF,
			],
			parser: {
				content: {
					results: [2, 3, 6],
					modseq: 917162500,
				},
				type: "SEARCH",
			},
		},
	},
	{
		name: "ESEARCH Spec Example #1 - UID, Count, All Set",
		input: ["* ESEARCH UID COUNT 5 ALL 4:19,21,28", CRLF].join(""),
		results: {
			lexer: [
				tokenStar,
				tokenSP,
				atom("ESEARCH"),
				tokenSP,
				atom("UID"),
				tokenSP,
				atom("COUNT"),
				tokenSP,
				num(5),
				tokenSP,
				atom("ALL"),
				tokenSP,
				num(4),
				op(":"),
				num(19),
				op(","),
				num(21),
				op(","),
				num(28),
				tokenCRLF,
			],
			parser: {
				content: {
					data: new Map(),
					isUID: true,
					count: 5,
					results: {
						set: [
							{ startId: 4, endId: 19 },
							{ id: 21 },
							{ id: 28 },
						],
					},
				},
				type: "ESEARCH",
			},
		},
	},
	{
		name: "ESEARCH Spec Example #2 - Tag, UID, Count, All Set",
		input: [`* ESEARCH (TAG "a567") UID COUNT 5 ALL 4:19,21,28`, CRLF].join(
			"",
		),
		results: {
			lexer: [
				tokenStar,
				tokenSP,
				atom("ESEARCH"),
				tokenSP,
				tokenOpenParen,
				atom("TAG"),
				tokenSP,
				qString("a567"),
				tokenCloseParen,
				tokenSP,
				atom("UID"),
				tokenSP,
				atom("COUNT"),
				tokenSP,
				num(5),
				tokenSP,
				atom("ALL"),
				tokenSP,
				num(4),
				op(":"),
				num(19),
				op(","),
				num(21),
				op(","),
				num(28),
				tokenCRLF,
			],
			parser: {
				content: {
					data: new Map(),
					isUID: true,
					count: 5,
					results: {
						set: [
							{ startId: 4, endId: 19 },
							{ id: 21 },
							{ id: 28 },
						],
					},
					tag: {
						id: 567,
					},
				},
				type: "ESEARCH",
			},
		},
	},
	{
		name: "ESEARCH Spec Example #3 - Count, All Number",
		input: [`* ESEARCH COUNT 1 ALL 1`, CRLF].join(""),
		results: {
			lexer: [
				tokenStar,
				tokenSP,
				atom("ESEARCH"),
				tokenSP,
				atom("COUNT"),
				tokenSP,
				num(1),
				tokenSP,
				atom("ALL"),
				tokenSP,
				num(1),
				tokenCRLF,
			],
			parser: {
				content: {
					data: new Map(),
					isUID: false,
					count: 1,
					results: {
						set: [{ id: 1 }],
					},
				},
				type: "ESEARCH",
			},
		},
	},
	{
		name: "ESEARCH Spec Example #4 - Tag, UID, Min, Max",
		input: [`* ESEARCH (TAG "A285") UID MIN 7 MAX 3800`, CRLF].join(""),
		results: {
			lexer: [
				tokenStar,
				tokenSP,
				atom("ESEARCH"),
				tokenSP,
				tokenOpenParen,
				atom("TAG"),
				tokenSP,
				qString("A285"),
				tokenCloseParen,
				tokenSP,
				atom("UID"),
				tokenSP,
				atom("MIN"),
				tokenSP,
				num(7),
				tokenSP,
				atom("MAX"),
				tokenSP,
				num(3800),
				tokenCRLF,
			],
			parser: {
				content: {
					data: new Map(),
					isUID: true,
					min: 7,
					max: 3800,
					tag: {
						id: 285,
					},
				},
				type: "ESEARCH",
			},
		},
	},
	{
		name: "XLIST",
		input: ['* XLIST (\\Noselect) "/" ~/Mail/foo', CRLF].join(""),
		results: {
			lexer: [
				tokenStar,
				tokenSP,
				atom("XLIST"),
				tokenSP,
				tokenOpenParen,
				op("\\"),
				atom("Noselect"),
				tokenCloseParen,
				tokenSP,
				qString("/"),
				tokenSP,
				atom("~/Mail/foo"),
				tokenCRLF,
			],
			parser: {
				content: {
					name: "~/Mail/foo",
					flags: {
						hasWildcard: false,
						flagMap: new Map([
							[
								"\\Noselect",
								{
									name: "\\Noselect",
									isWildcard: false,
									isKnownName: false,
								},
							],
						]),
					},
					separator: "/",
				},
				type: "XLIST",
			},
		},
	},
	{
		name: "LIST",
		input: ['* LIST (\\Noselect) "/" ~/Mail/foo', CRLF].join(""),
		results: {
			lexer: [
				tokenStar,
				tokenSP,
				atom("LIST"),
				tokenSP,
				tokenOpenParen,
				op("\\"),
				atom("Noselect"),
				tokenCloseParen,
				tokenSP,
				qString("/"),
				tokenSP,
				atom("~/Mail/foo"),
				tokenCRLF,
			],
			parser: {
				content: {
					name: "~/Mail/foo",
					flags: {
						hasWildcard: false,
						flagMap: new Map([
							[
								"\\Noselect",
								{
									name: "\\Noselect",
									isWildcard: false,
									isKnownName: false,
								},
							],
						]),
					},
					separator: "/",
				},
				type: "LIST",
			},
		},
	},
	{
		name: "LIST Special Use",
		input: [
			'* LIST (\\HasNoChildren \\All) "/" "[Gmail]/All Mail"',
			CRLF,
		].join(""),
		results: {
			lexer: [
				tokenStar,
				tokenSP,
				atom("LIST"),
				tokenSP,
				tokenOpenParen,
				op("\\"),
				atom("HasNoChildren"),
				tokenSP,
				op("\\"),
				atom("All"),
				tokenCloseParen,
				tokenSP,
				qString("/"),
				tokenSP,
				qString("[Gmail]/All Mail"),
				tokenCRLF,
			],
			parser: {
				content: {
					name: "[Gmail]/All Mail",
					flags: {
						hasWildcard: false,
						flagMap: new Map([
							[
								"\\HasNoChildren",
								{
									name: "\\HasNoChildren",
									isWildcard: false,
									isKnownName: false,
								},
							],
							[
								"\\All",
								{
									name: "\\All",
									isWildcard: false,
									isKnownName: true,
								},
							],
						]),
					},
					separator: "/",
				},
				type: "LIST",
			},
		},
	},
	{
		name: "STATUS",
		input: ["* STATUS blurdybloop (MESSAGES 231 UIDNEXT 44292)", CRLF].join(
			"",
		),
		results: {
			lexer: [
				tokenStar,
				tokenSP,
				atom("STATUS"),
				tokenSP,
				atom("blurdybloop"),
				tokenSP,
				tokenOpenParen,
				atom("MESSAGES"),
				tokenSP,
				num(231),
				tokenSP,
				atom("UIDNEXT"),
				tokenSP,
				num(44292),
				tokenCloseParen,
				tokenCRLF,
			],
		},
	},
	{
		name: "Untagged ID Spec Example #1 - Values",
		input: [
			'* ID ("name" "Cyrus" "version" "1.5" "os" "sunos" ',
			'"os-version" "5.5" "support-url" ',
			'"mailto:cyrus-bugs+@andrew.cmu.edu")',
			CRLF,
		].join(""),
		results: {
			lexer: [
				tokenStar,
				tokenSP,
				atom("ID"),
				tokenSP,
				tokenOpenParen,
				qString("name"),
				tokenSP,
				qString("Cyrus"),
				tokenSP,
				qString("version"),
				tokenSP,
				qString("1.5"),
				tokenSP,
				qString("os"),
				tokenSP,
				qString("sunos"),
				tokenSP,
				qString("os-version"),
				tokenSP,
				qString("5.5"),
				tokenSP,
				qString("support-url"),
				tokenSP,
				qString("mailto:cyrus-bugs+@andrew.cmu.edu"),
				tokenCloseParen,
				tokenCRLF,
			],
			parser: {
				content: {
					details: new Map([
						["name", "Cyrus"],
						["version", "1.5"],
						["os", "sunos"],
						["os-version", "5.5"],
						["support-url", "mailto:cyrus-bugs+@andrew.cmu.edu"],
					]),
				},
				type: "ID",
			},
		},
	},
	{
		name: "Untagged ID Spec Example #2 - Nil",
		input: ["* ID NIL", CRLF].join(""),
		results: {
			lexer: [
				tokenStar,
				tokenSP,
				atom("ID"),
				tokenSP,
				tokenNil,
				tokenCRLF,
			],
			parser: {
				content: {
					details: null,
				},
				type: "ID",
			},
		},
	},
	{
		name: "Untagged Sort Spec Example #1",
		input: ["* SORT 2 3 6", CRLF].join(""),
		results: {
			lexer: [
				tokenStar,
				tokenSP,
				atom("SORT"),
				tokenSP,
				num(2),
				tokenSP,
				num(3),
				tokenSP,
				num(6),
				tokenCRLF,
			],
			parser: {
				content: { ids: [2, 3, 6] },
				type: "SORT",
			},
		},
	},
	{
		name: "Untagged Sort Spec Example #2 - Empty",
		input: ["* SORT", CRLF].join(""),
		results: {
			lexer: [tokenStar, tokenSP, atom("SORT"), tokenCRLF],
			parser: {
				content: { ids: [] },
				type: "SORT",
			},
		},
	},
	{
		name: "Untagged Thread Spec Example #1 - Empty",
		input: ["* THREAD", CRLF].join(""),
		results: {
			lexer: [tokenStar, tokenSP, atom("THREAD"), tokenCRLF],
			parser: {
				content: { threads: [] },
				type: "THREAD",
			},
		},
	},
	{
		name: "Untagged Thread Spec Example #2 - Split Threads",
		input: ["* THREAD (2)(3 6 (4 23)(44 7 96))", CRLF].join(""),
		results: {
			lexer: [
				tokenStar,
				tokenSP,
				atom("THREAD"),
				tokenSP,
				tokenOpenParen,
				num(2),
				tokenCloseParen,
				tokenOpenParen,
				num(3),
				tokenSP,
				num(6),
				tokenSP,
				tokenOpenParen,
				num(4),
				tokenSP,
				num(23),
				tokenCloseParen,
				tokenOpenParen,
				num(44),
				tokenSP,
				num(7),
				tokenSP,
				num(96),
				tokenCloseParen,
				tokenCloseParen,
				tokenCRLF,
			],
			parser: {
				content: {
					threads: [
						{
							id: 2,
							_children: [],
						},
						{
							id: 3,
							_children: [
								{
									id: 6,
									_children: [
										{
											id: 4,
											_children: [
												{ id: 23, _children: [] },
											],
										},
										{
											id: 44,
											_children: [
												{
													id: 7,
													_children: [
														{
															id: 96,
															_children: [],
														},
													],
												},
											],
										},
									],
								},
							],
						},
					],
				},
				type: "THREAD",
			},
		},
	},
	{
		name: "Untagged Thread Spec Example #3 - No Parent",
		input: ["* THREAD ((3)(5))", CRLF].join(""),
		results: {
			lexer: [
				tokenStar,
				tokenSP,
				atom("THREAD"),
				tokenSP,
				tokenOpenParen,
				tokenOpenParen,
				num(3),
				tokenCloseParen,
				tokenOpenParen,
				num(5),
				tokenCloseParen,
				tokenCloseParen,
				tokenCRLF,
			],
			parser: {
				content: {
					threads: [
						{
							id: undefined,
							_children: [
								{ id: 3, _children: [] },
								{ id: 5, _children: [] },
							],
						},
					],
				},
				type: "THREAD",
			},
		},
	},
	{
		name: "Untagged Quota Spec Example #1 - Empty Name + Storage",
		input: ['* QUOTA "" (STORAGE 10 512)', CRLF].join(""),
		results: {
			lexer: [
				tokenStar,
				tokenSP,
				atom("QUOTA"),
				tokenSP,
				qString(""),
				tokenSP,
				tokenOpenParen,
				atom("STORAGE"),
				tokenSP,
				num(10),
				tokenSP,
				num(512),
				tokenCloseParen,
				tokenCRLF,
			],
			parser: {
				content: {
					rootName: "",
					quotas: [
						{
							resource: "STORAGE",
							current: 10,
							limit: 512,
						},
					],
				},
				type: "QUOTA",
			},
		},
	},
	{
		name: "Untagged Quota Spec #2 - Name + No Triplets",
		input: ['* QUOTA "Shared" ()', CRLF].join(""),
		results: {
			lexer: [
				tokenStar,
				tokenSP,
				atom("QUOTA"),
				tokenSP,
				qString("Shared"),
				tokenSP,
				tokenOpenParen,
				tokenCloseParen,
				tokenCRLF,
			],
			parser: {
				content: {
					rootName: "Shared",
					quotas: [],
				},
				type: "QUOTA",
			},
		},
	},
	{
		name: "Untagged Quota Spec #3 - Multiple Triplets",
		input: ['* QUOTA "" (STORAGE 10 512 "COUNTS" 1 40000)', CRLF].join(""),
		results: {
			lexer: [
				tokenStar,
				tokenSP,
				atom("QUOTA"),
				tokenSP,
				qString(""),
				tokenSP,
				tokenOpenParen,
				atom("STORAGE"),
				tokenSP,
				num(10),
				tokenSP,
				num(512),
				tokenSP,
				qString("COUNTS"),
				tokenSP,
				num(1),
				tokenSP,
				num(40000),
				tokenCloseParen,
				tokenCRLF,
			],
			parser: {
				content: {
					rootName: "",
					quotas: [
						{
							resource: "STORAGE",
							current: 10,
							limit: 512,
						},
						{
							resource: "COUNTS",
							current: 1,
							limit: 40000,
						},
					],
				},
				type: "QUOTA",
			},
		},
	},
	{
		name: "Untagged QuotaRoot Spec Example #1 - Multiple names",
		input: ['* QUOTAROOT INBOX ""', CRLF].join(""),
		results: {
			lexer: [
				tokenStar,
				tokenSP,
				atom("QUOTAROOT"),
				tokenSP,
				atom("INBOX"),
				tokenSP,
				qString(""),
				tokenCRLF,
			],
			parser: {
				content: {
					rootNames: ["INBOX", ""],
				},
				type: "QUOTAROOT",
			},
		},
	},
	{
		name: "Untagged QuotaRoot Spec Example #2 - One Name",
		input: ["* QUOTAROOT comp.mail.mime", CRLF].join(""),
		results: {
			lexer: [
				tokenStar,
				tokenSP,
				atom("QUOTAROOT"),
				tokenSP,
				atom("comp.mail.mime"),
				tokenCRLF,
			],
			parser: {
				content: {
					rootNames: ["comp.mail.mime"],
				},
				type: "QUOTAROOT",
			},
		},
	},
	{
		name: "Untagged QuotaRoot Spec #3 - Zero Names",
		input: ["* QUOTAROOT", CRLF].join(""),
		results: {
			lexer: [tokenStar, tokenSP, atom("QUOTAROOT"), tokenCRLF],
			parser: {
				content: {
					rootNames: [],
				},
				type: "QUOTAROOT",
			},
		},
	},
	{
		name: "Untagged OK (with text code, with text)",
		input: [
			"* OK [UNSEEN 17] Message 17 is the first unseen message",
			CRLF,
		].join(""),
		results: {
			lexer: [
				tokenStar,
				tokenSP,
				atom("OK"),
				tokenSP,
				tokenOpenBrack,
				atom("UNSEEN"),
				tokenSP,
				num(17),
				tokenCloseBrack,
				tokenSP,
				atom("Message"),
				tokenSP,
				num(17),
				tokenSP,
				atom("is"),
				tokenSP,
				atom("the"),
				tokenSP,
				atom("first"),
				tokenSP,
				atom("unseen"),
				tokenSP,
				atom("message"),
				tokenCRLF,
			],
			parser: {
				content: {
					status: "OK",
					text: {
						code: {
							value: 17,
							kind: "UNSEEN",
						},
						content: "Message 17 is the first unseen message",
					},
				},
				type: "STATUS",
			},
		},
	},
	{
		name: "Untagged OK (with array text code, with text)",
		input: [
			"* OK [PERMANENTFLAGS (\\Deleted \\Seen \\*)] Limited",
			CRLF,
		].join(""),
		results: {
			lexer: [
				tokenStar,
				tokenSP,
				atom("OK"),
				tokenSP,
				tokenOpenBrack,
				atom("PERMANENTFLAGS"),
				tokenSP,
				tokenOpenParen,
				op("\\"),
				atom("Deleted"),
				tokenSP,
				op("\\"),
				atom("Seen"),
				tokenSP,
				op("\\"),
				op("*"),
				tokenCloseParen,
				tokenCloseBrack,
				tokenSP,
				atom("Limited"),
				tokenCRLF,
			],
		},
	},
	{
		name: "Untagged OK (no text code, with text) (RFC violation)",
		input: `* OK [UNSEEN 17]${CRLF}`,
		results: {
			lexer: [
				tokenStar,
				tokenSP,
				atom("OK"),
				tokenSP,
				tokenOpenBrack,
				atom("UNSEEN"),
				tokenSP,
				num(17),
				tokenCloseBrack,
				tokenCRLF,
			],
			parser: {
				content: {
					status: "OK",
					text: {
						code: {
							kind: "UNSEEN",
							value: 17,
						},
						content: "",
					},
				},
				type: "STATUS",
			},
		},
	},
	{
		name: "Untagged OK (no text code, with text)",
		input: ["* OK IMAP4rev1 Service Ready", CRLF].join(""),
		results: {
			lexer: [
				tokenStar,
				tokenSP,
				atom("OK"),
				tokenSP,
				atom("IMAP4rev1"),
				tokenSP,
				atom("Service"),
				tokenSP,
				atom("Ready"),
				tokenCRLF,
			],
			parser: {
				content: {
					status: "OK",
					text: {
						content: "IMAP4rev1 Service Ready",
					},
				},
				type: "STATUS",
			},
		},
	},
	{
		name: "Untagged OK (no text code, no text) (RFC violation)",
		input: `* OK${CRLF}`,
		results: {
			lexer: [tokenStar, tokenSP, atom("OK"), tokenCRLF],
			parser: {
				content: {
					status: "OK",
					text: {
						content: "",
					},
				},
				type: "STATUS",
			},
		},
	},
	{
		name: "Untagged EXISTS",
		input: ["* 18 EXISTS", CRLF].join(""),
		results: {
			lexer: [
				tokenStar,
				tokenSP,
				num(18),
				tokenSP,
				atom("EXISTS"),
				tokenCRLF,
			],
			parser: {
				content: {
					count: 18,
				},
				type: "EXISTS",
			},
		},
	},
	{
		name: "Untagged RECENT",
		input: ["* 2 RECENT", CRLF].join(""),
		results: {
			lexer: [
				tokenStar,
				tokenSP,
				num(2),
				tokenSP,
				atom("RECENT"),
				tokenCRLF,
			],
			parser: {
				content: {
					count: 2,
				},
				type: "RECENT",
			},
		},
	},
	{
		name: "Expunge message",
		input: ["* 44 EXPUNGE", CRLF].join(""),
		results: {
			lexer: [
				tokenStar,
				tokenSP,
				num(44),
				tokenSP,
				atom("EXPUNGE"),
				tokenCRLF,
			],
			parser: {
				content: {
					sequenceNumber: 44,
				},
				type: "EXPUNGE",
			},
		},
	},
];

export default simpleSet;
