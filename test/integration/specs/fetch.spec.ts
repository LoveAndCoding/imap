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
	tokenOpenParen,
	tokenCloseParen,
	qString,
	tokenNil,
	tokenOpenBrack,
	tokenCloseBrack,
	bigInt,
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
	{
		name: "RFC3501 example #1 - Mixed body structure",
		input:
			"* 20 FETCH (BODY (" +
			'("TEXT" "PLAIN" ("CHARSET" "US-ASCII") NIL NIL "7BIT" 1152 23)' +
			'("TEXT" "PLAIN" ("CHARSET" "US-ASCII" "NAME" "cc.diff")' +
			' "<960723163407.20117h@cac.washington.edu>" "Compiler diff"' +
			' "BASE64" 4554 73)' +
			' "MIXED"))' +
			CRLF,
		results: {
			lexer: [
				tokenStar,
				tokenSP,
				num(20),
				tokenSP,
				atom("FETCH"),
				tokenSP,
				tokenOpenParen,
				atom("BODY"),
				tokenSP,
				tokenOpenParen,
				tokenOpenParen,
				qString("TEXT"),
				tokenSP,
				qString("PLAIN"),
				tokenSP,
				tokenOpenParen,
				qString("CHARSET"),
				tokenSP,
				qString("US-ASCII"),
				tokenCloseParen,
				tokenSP,
				tokenNil,
				tokenSP,
				tokenNil,
				tokenSP,
				qString("7BIT"),
				tokenSP,
				num(1152),
				tokenSP,
				num(23),
				tokenCloseParen,
				tokenOpenParen,
				qString("TEXT"),
				tokenSP,
				qString("PLAIN"),
				tokenSP,
				tokenOpenParen,
				qString("CHARSET"),
				tokenSP,
				qString("US-ASCII"),
				tokenSP,
				qString("NAME"),
				tokenSP,
				qString("cc.diff"),
				tokenCloseParen,
				tokenSP,
				qString("<960723163407.20117h@cac.washington.edu>"),
				tokenSP,
				qString("Compiler diff"),
				tokenSP,
				qString("BASE64"),
				tokenSP,
				num(4554),
				tokenSP,
				num(73),
				tokenCloseParen,
				tokenSP,
				qString("MIXED"),
				tokenCloseParen,
				tokenCloseParen,
				tokenCRLF,
			],
			parser: {
				content: {
					body: {
						header: {
							fields: new Map(),
							offest: undefined,
						},
						sections: [],
						structure: {
							disposition: undefined,
							language: undefined,
							location: undefined,
							subtype: "MIXED",
							structures: [
								{
									mediaType: "TEXT",
									mediaSubType: "PLAIN",
									parameters: new Map([
										["CHARSET", "US-ASCII"],
									]),
									id: null,
									description: null,
									encoding: "7BIT",
									octets: 1152,
									lines: 23,
								},
								{
									mediaType: "TEXT",
									mediaSubType: "PLAIN",
									parameters: new Map([
										["CHARSET", "US-ASCII"],
										["NAME", "cc.diff"],
									]),
									id:
										"<960723163407.20117h@cac.washington.edu>",
									description: "Compiler diff",
									encoding: "BASE64",
									octets: 4554,
									lines: 73,
								},
							],
						},
					},
					sequenceNumber: 20,
				},
				type: "FETCH",
			},
		},
	},
	{
		name: "node-imap Issue 477",
		input:
			'* 21 FETCH (BODY (NIL NIL ("CHARSET" "GB2312") NIL NIL NIL 176 NIL NIL NIL))' +
			CRLF,
		results: {
			lexer: [
				tokenStar,
				tokenSP,
				num(21),
				tokenSP,
				atom("FETCH"),
				tokenSP,
				tokenOpenParen,
				atom("BODY"),
				tokenSP,
				tokenOpenParen,
				tokenNil,
				tokenSP,
				tokenNil,
				tokenSP,
				tokenOpenParen,
				qString("CHARSET"),
				tokenSP,
				qString("GB2312"),
				tokenCloseParen,
				tokenSP,
				tokenNil,
				tokenSP,
				tokenNil,
				tokenSP,
				tokenNil,
				tokenSP,
				num(176),
				tokenSP,
				tokenNil,
				tokenSP,
				tokenNil,
				tokenSP,
				tokenNil,
				tokenCloseParen,
				tokenCloseParen,
				tokenCRLF,
			],
			parser: {
				content: {
					body: {
						header: {
							fields: new Map(),
							offest: undefined,
						},
						sections: [],
						structure: {
							mediaType: null,
							mediaSubType: null,
							parameters: new Map([["CHARSET", "GB2312"]]),
							id: null,
							description: null,
							encoding: null,
							octets: 176,
							md5: null,
							disposition: null,
							language: null,
							location: undefined,
						},
					},
					sequenceNumber: 21,
				},
				type: "FETCH",
			},
		},
	},
	{
		name: "Untagged FETCH (flags, date, size, envelope, body[structure])",
		input: [
			"* 12 FETCH (FLAGS (\\Seen)",
			' INTERNALDATE "17-Jul-1996 02:44:25 -0700"',
			" RFC822.SIZE 4286",
			' ENVELOPE ("Wed, 17 Jul 1996 02:23:25 -0700 (PDT)"',
			' "IMAP4rev1 WG mtg summary and minutes"',
			' (("Terry Gray" NIL "gray" "cac.washington.edu"))',
			' (("Terry Gray" NIL "gray" "cac.washington.edu"))',
			' (("Terry Gray" NIL "gray" "cac.washington.edu"))',
			' ((NIL NIL "imap" "cac.washington.edu"))',
			' ((NIL NIL "minutes" "CNRI.Reston.VA.US")',
			'("John Klensin" NIL "KLENSIN" "MIT.EDU")) NIL NIL',
			' "<B27397-0100000@cac.washington.edu>")',
			' BODY ("TEXT" "PLAIN" ("CHARSET" "US-ASCII") NIL NIL "7BIT" 3028',
			" 92))",
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
				tokenOpenParen,
				atom("FLAGS"),
				tokenSP,
				tokenOpenParen,
				op("\\"),
				atom("Seen"),
				tokenCloseParen,
				tokenSP,
				atom("INTERNALDATE"),
				tokenSP,
				qString("17-Jul-1996 02:44:25 -0700"),
				tokenSP,
				atom("RFC822.SIZE"),
				tokenSP,
				num(4286),
				tokenSP,
				atom("ENVELOPE"),
				tokenSP,
				tokenOpenParen,
				qString("Wed, 17 Jul 1996 02:23:25 -0700 (PDT)"),
				tokenSP,
				qString("IMAP4rev1 WG mtg summary and minutes"),
				tokenSP,
				tokenOpenParen,
				tokenOpenParen,
				qString("Terry Gray"),
				tokenSP,
				tokenNil,
				tokenSP,
				qString("gray"),
				tokenSP,
				qString("cac.washington.edu"),
				tokenCloseParen,
				tokenCloseParen,
				tokenSP,
				tokenOpenParen,
				tokenOpenParen,
				qString("Terry Gray"),
				tokenSP,
				tokenNil,
				tokenSP,
				qString("gray"),
				tokenSP,
				qString("cac.washington.edu"),
				tokenCloseParen,
				tokenCloseParen,
				tokenSP,
				tokenOpenParen,
				tokenOpenParen,
				qString("Terry Gray"),
				tokenSP,
				tokenNil,
				tokenSP,
				qString("gray"),
				tokenSP,
				qString("cac.washington.edu"),
				tokenCloseParen,
				tokenCloseParen,
				tokenSP,
				tokenOpenParen,
				tokenOpenParen,
				tokenNil,
				tokenSP,
				tokenNil,
				tokenSP,
				qString("imap"),
				tokenSP,
				qString("cac.washington.edu"),
				tokenCloseParen,
				tokenCloseParen,
				tokenSP,
				tokenOpenParen,
				tokenOpenParen,
				tokenNil,
				tokenSP,
				tokenNil,
				tokenSP,
				qString("minutes"),
				tokenSP,
				qString("CNRI.Reston.VA.US"),
				tokenCloseParen,
				tokenOpenParen,
				qString("John Klensin"),
				tokenSP,
				tokenNil,
				tokenSP,
				qString("KLENSIN"),
				tokenSP,
				qString("MIT.EDU"),
				tokenCloseParen,
				tokenCloseParen,
				tokenSP,
				tokenNil,
				tokenSP,
				tokenNil,
				tokenSP,
				qString("<B27397-0100000@cac.washington.edu>"),
				tokenCloseParen,
				tokenSP,
				atom("BODY"),
				tokenSP,
				tokenOpenParen,
				qString("TEXT"),
				tokenSP,
				qString("PLAIN"),
				tokenSP,
				tokenOpenParen,
				qString("CHARSET"),
				tokenSP,
				qString("US-ASCII"),
				tokenCloseParen,
				tokenSP,
				tokenNil,
				tokenSP,
				tokenNil,
				tokenSP,
				qString("7BIT"),
				tokenSP,
				num(3028),
				tokenSP,
				num(92),
				tokenCloseParen,
				tokenCloseParen,
				tokenCRLF,
			],
			parser: {
				content: {
					body: {
						header: {
							fields: new Map(),
							offset: undefined,
						},
						sections: [],
						structure: {
							mediaType: "TEXT",
							mediaSubType: "PLAIN",
							parameters: new Map([["CHARSET", "US-ASCII"]]),
							id: null,
							description: null,
							encoding: "7BIT",
							octets: 3028,
							lines: 92,
						},
					},
					date: new Date("1996-07-17T09:44:25.000Z"),
					envelope: {
						bcc: { list: [] },
						cc: {
							list: [
								{
									route: null,
									name: null,
									mailbox: "minutes",
									host: "CNRI.Reston.VA.US",
								},
								{
									route: null,
									name: "John Klensin",
									mailbox: "KLENSIN",
									host: "MIT.EDU",
								},
							],
						},
						date: "Wed, 17 Jul 1996 02:23:25 -0700 (PDT)",
						from: {
							list: [
								{
									name: "Terry Gray",
									mailbox: "gray",
									host: "cac.washington.edu",
									route: null,
								},
							],
						},
						inReplyTo: null,
						messageId: "<B27397-0100000@cac.washington.edu>",
						replyTo: {
							list: [
								{
									host: "cac.washington.edu",
									mailbox: "gray",
									name: "Terry Gray",
									route: null,
								},
							],
						},
						sender: {
							list: [
								{
									host: "cac.washington.edu",
									mailbox: "gray",
									name: "Terry Gray",
									route: null,
								},
							],
						},
						subject: "IMAP4rev1 WG mtg summary and minutes",
						to: {
							list: [
								{
									host: "cac.washington.edu",
									mailbox: "imap",
									name: null,
									route: null,
								},
							],
						},
					},
					flags: {
						flagMap: new Map([
							[
								"\\Seen",
								{
									isKnownName: true,
									isWildcard: false,
									name: "\\Seen",
								},
							],
						]),
						hasWildcard: false,
					},
					sequenceNumber: 12,
					size: 4286,
				},
				type: "FETCH",
			},
		},
	},
	{
		name: "Spec Example Fetch Header",
		input:
			[
				"* 12 FETCH (BODY[HEADER] {342}",
				"Date: Wed, 17 Jul 1996 02:23:25 -0700 (PDT)",
				"From: Terry Gray <gray@cac.washington.edu>",
				"Subject: IMAP4rev1 WG mtg summary and minutes",
				"To: imap@cac.washington.edu",
				"cc: minutes@CNRI.Reston.VA.US, John Klensin <KLENSIN@MIT.EDU>",
				"Message-Id: <B27397-0100000@cac.washington.edu>",
				"MIME-Version: 1.0",
				"Content-Type: TEXT/PLAIN; CHARSET=US-ASCII",
				"",
				")",
			].join(CRLF) + CRLF,
		results: {
			lexer: [
				tokenStar,
				tokenSP,
				num(12),
				tokenSP,
				atom("FETCH"),
				tokenSP,
				tokenOpenParen,
				atom("BODY"),
				tokenOpenBrack,
				atom("HEADER"),
				tokenCloseBrack,
				tokenSP,
				litString(`Date: Wed, 17 Jul 1996 02:23:25 -0700 (PDT)\r
From: Terry Gray <gray@cac.washington.edu>\r
Subject: IMAP4rev1 WG mtg summary and minutes\r
To: imap@cac.washington.edu\r
cc: minutes@CNRI.Reston.VA.US, John Klensin <KLENSIN@MIT.EDU>\r
Message-Id: <B27397-0100000@cac.washington.edu>\r
MIME-Version: 1.0\r
Content-Type: TEXT/PLAIN; CHARSET=US-ASCII\r
\r
`),
				tokenCloseParen,
				tokenCRLF,
			],
		},
	},
	{
		name: "CONDSTORE Fetch MODSEQ Spec Example #1",
		input: "* 7 FETCH (MODSEQ (12121231777))" + CRLF,
		results: {
			lexer: [
				tokenStar,
				tokenSP,
				num(7),
				tokenSP,
				atom("FETCH"),
				tokenSP,
				tokenOpenParen,
				atom("MODSEQ"),
				tokenSP,
				tokenOpenParen,
				bigInt(12121231777n),
				tokenCloseParen,
				tokenCloseParen,
				tokenCRLF,
			],
		},
	},
	{
		// From: https://www.atmail.com/blog/imap-101-manual-imap-sessions/
		name: "atmail IMAP 101 Example RFC822 Fetch",
		input:
			[
				// Had to modify the string length, not sure why
				// their value was so much longer. Maybe pulled
				// from a longer sample and forgot to change???
				"* 2 FETCH (FLAGS (Seen) RFC822 {2464}",
				"Return-Path: <someuser@example.atmailcloud.com>",
				"Delivered-To: someuser@example.atmailcloud.com",
				"Received: from us11-011ms.dh.atmailcloud.com",
				"	by us11-011ms.dh.atmailcloud.com (Dovecot) with LMTP id beGRJdw7F1xXTgAAsct0AA",
				"	for <someuser@example.atmailcloud.com>; Mon, 17 Dec 2018 16:02:32 +1000",
				"Received: from us11-010mrr.dh.atmailcloud.com ([10.10.5.20])",
				"	by us11-011ms.dh.atmailcloud.com with esmtp (Exim 4.90_1)",
				"	(envelope-from <someuser@example.atmailcloud.com>)",
				"	id 1gYlz6-0005Df-Hx",
				"	for someuser@example.atmailcloud.com; Mon, 17 Dec 2018 16:02:32 +1000",
				"Received: from us11-002mrs.dh.atmailcloud.com ([10.10.10.11])",
				"	by us11-010mrr.dh.atmailcloud.com with esmtp (Exim 4.90_1)",
				"	(envelope-from <someuser@example.atmailcloud.com>)",
				"	id 1gYlsn-00047x-0z",
				"	for someuser@example.atmailcloud.com; Mon, 17 Dec 2018 15:56:01 +1000",
				"Received: from us11-011mrc.dh.atmailcloud.com ([10.10.3.21])",
				"	by us11-002mrs.dh.atmailcloud.com with esmtp (Exim 4.84)",
				"	(envelope-from <someuser@example.atmailcloud.com>)",
				"	id 1gYlvd-0007o7-7L",
				"	for someuser@example.atmailcloud.com; Mon, 17 Dec 2018 15:58:57 +1000",
				"Received: from us11-011wui.dh.atmailcloud.com ([10.10.1.21] helo=localhost)",
				"	by us11-011mrc.dh.atmailcloud.com with esmtpa (Exim 4.90_1)",
				"	(envelope-from <someuser@example.atmailcloud.com>)",
				"	id 1gYluP-0005tV-1x",
				"	for someuser@example.atmailcloud.com; Mon, 17 Dec 2018 15:57:41 +1000",
				"To: <someuser@example.atmailcloud.com>",
				"Mime-Version: 1.0",
				'Reply-To: "Some User" <someuser@example.atmailcloud.com>',
				"X-Mailer: atmail api 8.4.1-202",
				"Message-Id: <cb6b04b3-b27b-41bb-b1b8-adc66e89fae6@localhost>",
				"Date: Mon, 17 Dec 2018 15:57:12 +1000",
				"Content-Type: multipart/alternative; boundary=5494146fa3cf177fb921d2cc0b347cd9cafaf36b1d18a797c5469f95440b",
				'From: "Some User" <someuser@example.atmailcloud.com>',
				"Subject: Test message 3",
				"X-Atmail-Id: someuser@example.atmailcloud.com",
				"X-atmail-spam-score: 0 ",
				"X-atmail-spam-bar: / ",
				"",
				"--5494146fa3cf177fb921d2cc0b347cd9cafaf36b1d18a797c5469f95440b",
				"Content-Transfer-Encoding: quoted-printable",
				"Content-Type: text/plain; charset=UTF-8",
				"",
				"t3",
				"--5494146fa3cf177fb921d2cc0b347cd9cafaf36b1d18a797c5469f95440b",
				"Content-Transfer-Encoding: quoted-printable",
				"Content-Type: text/html; charset=UTF-8",
				"",
				'<div>t3</div><div><br></div><div data-atmail-signature=3D"" class=3D"gmail_=',
				'signature" data-smartmail=3D"gmail_signature" style=3D""><br></div><div><br=',
				"></div>",
				"--5494146fa3cf177fb921d2cc0b347cd9cafaf36b1d18a797c5469f95440b--",
				")",
			].join(CRLF) + CRLF,
		results: {
			lexer: [
				tokenStar,
				tokenSP,
				num(2),
				tokenSP,
				atom("FETCH"),
				tokenSP,
				tokenOpenParen,
				atom("FLAGS"),
				tokenSP,
				tokenOpenParen,
				atom("Seen"),
				tokenCloseParen,
				tokenSP,
				atom("RFC822"),
				tokenSP,
				litString(`Return-Path: <someuser@example.atmailcloud.com>\r
Delivered-To: someuser@example.atmailcloud.com\r
Received: from us11-011ms.dh.atmailcloud.com\r
	by us11-011ms.dh.atmailcloud.com (Dovecot) with LMTP id beGRJdw7F1xXTgAAsct0AA\r
	for <someuser@example.atmailcloud.com>; Mon, 17 Dec 2018 16:02:32 +1000\r
Received: from us11-010mrr.dh.atmailcloud.com ([10.10.5.20])\r
	by us11-011ms.dh.atmailcloud.com with esmtp (Exim 4.90_1)\r
	(envelope-from <someuser@example.atmailcloud.com>)\r
	id 1gYlz6-0005Df-Hx\r
	for someuser@example.atmailcloud.com; Mon, 17 Dec 2018 16:02:32 +1000\r
Received: from us11-002mrs.dh.atmailcloud.com ([10.10.10.11])\r
	by us11-010mrr.dh.atmailcloud.com with esmtp (Exim 4.90_1)\r
	(envelope-from <someuser@example.atmailcloud.com>)\r
	id 1gYlsn-00047x-0z\r
	for someuser@example.atmailcloud.com; Mon, 17 Dec 2018 15:56:01 +1000\r
Received: from us11-011mrc.dh.atmailcloud.com ([10.10.3.21])\r
	by us11-002mrs.dh.atmailcloud.com with esmtp (Exim 4.84)\r
	(envelope-from <someuser@example.atmailcloud.com>)\r
	id 1gYlvd-0007o7-7L\r
	for someuser@example.atmailcloud.com; Mon, 17 Dec 2018 15:58:57 +1000\r
Received: from us11-011wui.dh.atmailcloud.com ([10.10.1.21] helo=localhost)\r
	by us11-011mrc.dh.atmailcloud.com with esmtpa (Exim 4.90_1)\r
	(envelope-from <someuser@example.atmailcloud.com>)\r
	id 1gYluP-0005tV-1x\r
	for someuser@example.atmailcloud.com; Mon, 17 Dec 2018 15:57:41 +1000\r
To: <someuser@example.atmailcloud.com>\r
Mime-Version: 1.0\r
Reply-To: "Some User" <someuser@example.atmailcloud.com>\r
X-Mailer: atmail api 8.4.1-202\r
Message-Id: <cb6b04b3-b27b-41bb-b1b8-adc66e89fae6@localhost>\r
Date: Mon, 17 Dec 2018 15:57:12 +1000\r
Content-Type: multipart/alternative; boundary=5494146fa3cf177fb921d2cc0b347cd9cafaf36b1d18a797c5469f95440b\r
From: "Some User" <someuser@example.atmailcloud.com>\r
Subject: Test message 3\r
X-Atmail-Id: someuser@example.atmailcloud.com\r
X-atmail-spam-score: 0 \r
X-atmail-spam-bar: / \r
\r
--5494146fa3cf177fb921d2cc0b347cd9cafaf36b1d18a797c5469f95440b\r
Content-Transfer-Encoding: quoted-printable\r
Content-Type: text/plain; charset=UTF-8\r
\r
t3\r
--5494146fa3cf177fb921d2cc0b347cd9cafaf36b1d18a797c5469f95440b\r
Content-Transfer-Encoding: quoted-printable\r
Content-Type: text/html; charset=UTF-8\r
\r
<div>t3</div><div><br></div><div data-atmail-signature=3D"" class=3D"gmail_=\r
signature" data-smartmail=3D"gmail_signature" style=3D""><br></div><div><br=\r
></div>\r
--5494146fa3cf177fb921d2cc0b347cd9cafaf36b1d18a797c5469f95440b--\r
`),
				tokenCloseParen,
				tokenCRLF,
			],
			parser: {
				content: {
					body: {
						header: {
							fields: new Map(
								Object.entries({
									"Return-Path":
										"<someuser@example.atmailcloud.com>",
									"Delivered-To":
										"someuser@example.atmailcloud.com",
									Received: [
										"from us11-011ms.dh.atmailcloud.com	by us11-011ms.dh.atmailcloud.com (Dovecot) with LMTP id beGRJdw7F1xXTgAAsct0AA	for <someuser@example.atmailcloud.com>; Mon, 17 Dec 2018 16:02:32 +1000",
										"from us11-010mrr.dh.atmailcloud.com ([10.10.5.20])	by us11-011ms.dh.atmailcloud.com with esmtp (Exim 4.90_1)	(envelope-from <someuser@example.atmailcloud.com>)	id 1gYlz6-0005Df-Hx	for someuser@example.atmailcloud.com; Mon, 17 Dec 2018 16:02:32 +1000",
										"from us11-002mrs.dh.atmailcloud.com ([10.10.10.11])	by us11-010mrr.dh.atmailcloud.com with esmtp (Exim 4.90_1)	(envelope-from <someuser@example.atmailcloud.com>)	id 1gYlsn-00047x-0z	for someuser@example.atmailcloud.com; Mon, 17 Dec 2018 15:56:01 +1000",
										"from us11-011mrc.dh.atmailcloud.com ([10.10.3.21])	by us11-002mrs.dh.atmailcloud.com with esmtp (Exim 4.84)	(envelope-from <someuser@example.atmailcloud.com>)	id 1gYlvd-0007o7-7L	for someuser@example.atmailcloud.com; Mon, 17 Dec 2018 15:58:57 +1000",
										"from us11-011wui.dh.atmailcloud.com ([10.10.1.21] helo=localhost)	by us11-011mrc.dh.atmailcloud.com with esmtpa (Exim 4.90_1)	(envelope-from <someuser@example.atmailcloud.com>)	id 1gYluP-0005tV-1x	for someuser@example.atmailcloud.com; Mon, 17 Dec 2018 15:57:41 +1000",
									],
									To: "<someuser@example.atmailcloud.com>",
									"Mime-Version": "1.0",
									"Reply-To":
										'"Some User" <someuser@example.atmailcloud.com>',
									"X-Mailer": "atmail api 8.4.1-202",
									"Message-Id":
										"<cb6b04b3-b27b-41bb-b1b8-adc66e89fae6@localhost>",
									Date: "Mon, 17 Dec 2018 15:57:12 +1000",
									"Content-Type":
										"multipart/alternative; boundary=5494146fa3cf177fb921d2cc0b347cd9cafaf36b1d18a797c5469f95440b",
									From:
										'"Some User" <someuser@example.atmailcloud.com>',
									Subject: "Test message 3",
									"X-Atmail-Id":
										"someuser@example.atmailcloud.com",
									"X-atmail-spam-score": "0",
									"X-atmail-spam-bar": "/",
								}),
							),
							offset: undefined,
						},
						sections: [
							{
								contents: `--5494146fa3cf177fb921d2cc0b347cd9cafaf36b1d18a797c5469f95440b\r
Content-Transfer-Encoding: quoted-printable\r
Content-Type: text/plain; charset=UTF-8\r
\r
t3\r
--5494146fa3cf177fb921d2cc0b347cd9cafaf36b1d18a797c5469f95440b\r
Content-Transfer-Encoding: quoted-printable\r
Content-Type: text/html; charset=UTF-8\r
\r
<div>t3</div><div><br></div><div data-atmail-signature=3D"" class=3D"gmail_=\r
signature" data-smartmail=3D"gmail_signature" style=3D""><br></div><div><br=\r
></div>\r
--5494146fa3cf177fb921d2cc0b347cd9cafaf36b1d18a797c5469f95440b--\r
`,
								kind: "TEXT",
								offset: undefined,
							},
						],
					},
					flags: {
						flagMap: new Map([
							[
								"Seen",
								{
									isKnownName: false,
									isWildcard: false,
									name: "Seen",
								},
							],
						]),
						hasWildcard: false,
					},
					sequenceNumber: 2,
				},
				type: "FETCH",
			},
		},
	},
	{
		name: "HBOMax Integration Test Email",
		input: `* 4 FETCH (BODY[] {7891}\r
Delivered-To: lovelyinbox@test.gmail.com\r
Received: by 2002:a54:284d:0:0:0:0:0 with SMTP id w13csp812689ecq;\r
        Thu, 17 Jun 2021 17:09:57 -0700 (PDT)\r
X-Google-Smtp-Source: ABdhPJxuy46qK1MUKED4CKfakO+mZnjg2I1dApg3FCAREoGFmsx2pkjCOjnSnEqtX6pYCHLxxphM\r
X-Received: by 2002:a17:903:188:b029:114:a132:1e9 with SMTP id z8-20020a1709030188b0290114a13201e9mr2145035plg.24.1623974996989;\r
        Thu, 17 Jun 2021 17:09:56 -0700 (PDT)\r
ARC-Seal: i=1; a=rsa-sha256; t=1623974996; cv=none;\r
        d=google.com; s=arc-20160816;\r
        b=WG1CwENlKIhd5qQ0p2bsB0fU3tyyjW3UhDs4w0fJBagBIRj8QlKjsyfsIul4ebAN+2\r
         imG+5Nz6h3Oc79CKbeTxjiMtN/O1Wq+IAcH3NZacxX3C2R9F3tPLKHNOcL7+pxoHoxwV\r
         b552USzOoHrIEdnrPaHYn+yqC71c3OufJBMS39jKennjvWOFlb9zS6tcxb79c7jEMDHi\r
         CY9o5VswkdgsRw87D1H0onEpC7ZUubi46X+CBl0B0yVwRlfX5NNh6D1R6usO2yr/zhey\r
         KoPAWl+qDC3mkhy6pywvP61R73PQ6GlIxScT9yzp1t/UnCocMmZyLbBCoAkGtq+y8CTp\r
         wyXw==\r
ARC-Message-Signature: i=1; a=rsa-sha256; c=relaxed/relaxed; d=google.com; s=arc-20160816;\r
        h=to:reply-to:subject:message-id:mime-version:from:date\r
         :dkim-signature:dkim-signature;\r
        bh=4++lc9CDGO3nKvvZSGhwaUmYvn/l9RJsMwJbrUa8Yd0=;\r
        b=Xj183p44md2nI21Zlghj29KDScC58ZJqWv8wwnGnIS6J6vXeY9HHUgB/FArtUVWzD2\r
         5x4Ahy8t2OdQSAptTcqsSy0/4UK1YnfiBmgnpaxc5vYN6FeElwfQacHU7OA19SfrVwl0\r
         x8hyY8McdymZ+c+/anfU5Ui1CpXPJ5ImebdqTxgVjlUH+jx9gWNO++vfXbXvK7024CiG\r
         OL9jEAY7I4gZ7qKxoMv0TBZOJA3DOWV6fYysl+0RxPY7PouPFhQVK74f9uy/HB0fzK0S\r
         5AbFYV9uz1dccHLG9U6a05vNtJwD/zl553xH16lMpCEEEnFz/eNGD19wzlNxoqYaJOdE\r
         iMxQ==\r
ARC-Authentication-Results: i=1; mx.google.com;\r
       dkim=pass header.i=@mail.hbomax.com header.s=s1 header.b=qFzFx0nv;\r
       dkim=pass header.i=@sendgrid.info header.s=smtpapi header.b="o5/9nKa+";\r
       spf=pass (google.com: domain of bounces+6146175-70a1-lovelyinbox=gmail.com@abmail.mail.hbomax.com designates 168.245.15.50 as permitted sender) smtp.mailfrom="bounces+6146175-70a1-lovelyinbox=gmail.com@abmail.mail.hbomax.com";\r
       dmarc=pass (p=QUARANTINE sp=QUARANTINE dis=NONE) header.from=hbomax.com\r
Return-Path: <bounces+6146175-70a1-lovelyinbox=gmail.com@abmail.mail.hbomax.com>\r
Received: from o3346.abmail.service.hbomax.com (o3346.abmail.service.hbomax.com. [168.245.15.50])\r
        by mx.google.com with ESMTPS id p12si8473459plr.261.2021.06.17.17.09.56\r
        for <lovelyinbox@gmail.com>\r
        (version=TLS1_3 cipher=TLS_AES_128_GCM_SHA256 bits=128/128);\r
        Thu, 17 Jun 2021 17:09:56 -0700 (PDT)\r
Received-SPF: pass (google.com: domain of bounces+6146175-70a1-lovelyinbox=gmail.com@abmail.mail.hbomax.com designates 168.245.15.50 as permitted sender) client-ip=168.245.15.50;\r
Authentication-Results: mx.google.com;\r
       dkim=pass header.i=@mail.hbomax.com header.s=s1 header.b=qFzFx0nv;\r
       dkim=pass header.i=@sendgrid.info header.s=smtpapi header.b="o5/9nKa+";\r
       spf=pass (google.com: domain of bounces+6146175-70a1-lovelyinbox=gmail.com@abmail.mail.hbomax.com designates 168.245.15.50 as permitted sender) smtp.mailfrom="bounces+6146175-70a1-lovelyinbox=gmail.com@abmail.mail.hbomax.com";\r
       dmarc=pass (p=QUARANTINE sp=QUARANTINE dis=NONE) header.from=hbomax.com\r
DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed; d=mail.hbomax.com;\r
	h=content-type:from:mime-version:subject:reply-to:x-feedback-id:to;\r
	s=s1; bh=4++lc9CDGO3nKvvZSGhwaUmYvn/l9RJsMwJbrUa8Yd0=;\r
	b=qFzFx0nvoKBhMKjQpAFQitFfj+OmQAzc0r+smas55PdtjdTgaoQaSuC6Yref4PIYsM3H\r
	XlY4Icq/mYWCXgNO7xgY7IYkYmMKtvqhRoogCWE/DXTrn+1ImVC0xLfWaa4RuakRQX16HN\r
	6KZ/rsxKd3nJoq6Sdoy39yca/d+PoBfxs=\r
DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed; d=sendgrid.info;\r
	h=content-type:from:mime-version:subject:reply-to:x-feedback-id:to;\r
	s=smtpapi; bh=4++lc9CDGO3nKvvZSGhwaUmYvn/l9RJsMwJbrUa8Yd0=;\r
	b=o5/9nKa++BriMGiR4PQxxIUIFHkOCtLJalm3j76Yhh+yCER8tX1Xc63iCwHC10xs6rVg\r
	f3rknRVql1rIOhOaZVj56OZNjcivhNObg0PyKmkv8yOmJwLgmiupPvdew0wGrD2t6/cfaX\r
	fLW7ByW9dbnfXyEeXg+UEmH18wARYOALI=\r
Received: by filterdrecv-65ddcfb76c-tw9n8 with SMTP id filterdrecv-65ddcfb76c-tw9n8-1-60CBE453-2E\r
        2021-06-18 00:09:55.216447137 +0000 UTC m=+1221404.619083768\r
Received: from NjE0NjE3NQ (unknown)\r
	by ismtpd0198p1mdw1.sendgrid.net (SG)\r
	with HTTP\r
	id gsQQ7dhGSqagIDEhdr51ZQ\r
	Fri, 18 Jun 2021 00:09:55.137 +0000 (UTC)\r
Content-Type: multipart/alternative; boundary=8f0685aa36495a8e169ac9645c24b03a421cd1021d3b4f2d2fb186785a3a\r
Date: Fri, 18 Jun 2021 00:09:56 +0000 (UTC)\r
From: HBO Max <HBOMax@mail.hbomax.com>\r
Mime-Version: 1.0\r
Message-ID: <gsQQ7dhGSqagIDEhdr51ZQ@ismtpd0198p1mdw1.sendgrid.net>\r
Subject: Integration Test Email #1\r
Reply-To: no-reply@hbomax.com\r
X-Feedback-ID: 6146175:SG\r
X-SG-EID: \r
 =?us-ascii?Q?3yT4WJv7EKAuJjOjMHtAOZG1X4or+nRAW+qIrxQUJmn052efbT=2FONz8JgJtCdm?=\r
 =?us-ascii?Q?f3p3wG=2FFTpFueRFgoptsd2qn5+qIs6IRLjEH49w?=\r
 =?us-ascii?Q?ckm23Rqdy3gO8t9Kh5oI6k85zDhJIVeWmmpF4+x?=\r
 =?us-ascii?Q?GEv7Ep9PBv80sM15jz2t=2F2gKFhB6tABnOUgSEOD?=\r
 =?us-ascii?Q?bW2u0e9e1c+zSszEyM=2FuK=2FFXvDTMx6y2C0pVnX1?=\r
 =?us-ascii?Q?B5ik2W7X1stC2PS9SY4L7pRwMeB3m+5DJyasMZ?=\r
X-SG-ID: \r
 =?us-ascii?Q?N2C25iY2uzGMFz6rgvQsb8raWjw0ZPf1VmjsCkspi=2FKvUYPFb2vwyNNeBc9bJi?=\r
 =?us-ascii?Q?ChCDubk7cyQP55+Dsvd5z3m+3Qw7EA8WQboLKVg?=\r
 =?us-ascii?Q?S3zfmn8lnEkSMbPnGCBL3ez1q=2FSWtrf27ZzggZW?=\r
 =?us-ascii?Q?WCgYfCJl0rgVKgSkpFfX6=2FCXvsAGB3mf0VCRHA8?=\r
 =?us-ascii?Q?0+cFvWivlWJpn+vcmyYYLCW6AE6ArdS2+AaJMCt?=\r
 =?us-ascii?Q?M8huMtygKCPnB7HtzhoqFjo5qnYinC0j8JgQdYm?=\r
 =?us-ascii?Q?ldE=2FS9QI3V+5qh2uk=2FnVZNg4KNE5E4H11uEHTgY?=\r
 =?us-ascii?Q?bRsD8AGrU133SetvHANdHSbErfPLP0RlbKKxCBR?=\r
 =?us-ascii?Q?=2FeyTA+VcwDn9PId1HD77sRXNbEGOnzMnzBvmvaG?=\r
 =?us-ascii?Q?1zqCZcTwCN0gaqzCrTC0U0jcYrK0aLQX2ptDrT=2F?=\r
 =?us-ascii?Q?hreXw8nC9Dd=2FwgeQ9gzNwZQOXCBdylx0IJYzXf1?=\r
 =?us-ascii?Q?IoahhlB4XZdjeouEbjxkG4uSNzv1jerHeXGsKzM?=\r
 =?us-ascii?Q?Oq=2FLYy59CcU1w6dAyfvBCdDTTbNNdP1ixfG0Z9V?=\r
 =?us-ascii?Q?ZzlWArmsZgoMdT1VRuup3Acs8=3D?=\r
To: lovelyinbox@gmail.com\r
X-Entity-ID: cCvtMaPaV56PEkSSWeCHsA==\r
\r
--8f0685aa36495a8e169ac9645c24b03a421cd1021d3b4f2d2fb186785a3a\r
Content-Transfer-Encoding: quoted-printable\r
Content-Type: text/plain; charset=us-ascii\r
Mime-Version: 1.0\r
\r
This template is used by integration tests only.\r
--8f0685aa36495a8e169ac9645c24b03a421cd1021d3b4f2d2fb186785a3a\r
Content-Transfer-Encoding: quoted-printable\r
Content-Type: text/html; charset=us-ascii\r
Mime-Version: 1.0\r
\r
<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.0 Transitional//EN" "http://www.w=\r
3.org/TR/REC-html40/loose.dtd">\r
<html><body><p>This template is used by integration tests only.</p><img src=\r
=3D"http://ablink.mail.hbomax.com/wf/open?upn=3DsY2vLsEKqW55viRwL1eH0gXPF1M=\r
9nSwfP2RKOAZR-2B1Jx7UVFhjqhNz4tPaLuo1srtCdSsNplg3swKpB6xh6-2FEEqznlXsKimPcI=\r
UFa3NaCkWn5lhbxuL6Bd3x1mO3Zxefpv7uAOjEgdGa6gJc0h-2BRq04Vw15QnyExT3hsyuCYcuh=\r
9-2F2JlIptiPcyoyQGeo0PlNxRt4swn4E-2BdQFU-2FbMUrVHx2lyvihTwmKOWvGwPiJe7zfP9H=\r
eIwqEqXRIrBGKP7RbttTMtLos-2BGkTKmyFjCWvxqQm2n22itFa7oB-2BnbwfVKy9JQ03Tuy45K=\r
wx1LLxPjc3mpxepLV6VmCk-2BGzDe-2BiUlEbQIdWklmnzHAsLZhVLCSz6nWYwA-2FLIOGwOrT6=\r
sNyp6QHRMmrmWd88WvEbmG1bkA-2BAh1DllxFIIpCEGBWPh7Fyonw6-2Bw5roHpRxwfoA7h149u=\r
EI7q-2BCjTByrEVo70pe0qScwZBvkYYuPZmgfDmkzZjK0ugyhVqS9Vk02xk5m5O4Ft1PMRq07pD=\r
-2FnFSK4f46yW1Rf12lD9l2ImqZ4MWNwosOyNP1kQfXwhR8ZoDjzfqV92KPDT9vnLiyPMqFd5du=\r
4xCDLOuujaYWvL8ArD-2FlkVJ8wXahNKK-2BNDGj7LOj8Oo38GxnI4ePGqQE0b6aHFutxGDfZMo=\r
h1CQ8yep88A88xcQEgdA4Jg77j6YeVNs3cdniTN-2BeGgvUb-2FxFbZ2A-2FZ8S-2FqUwOIRODc=\r
uuvhyiDNBCxk-3D" alt=3D"" width=3D"1" height=3D"1" border=3D"0" style=3D"he=\r
ight:1px !important;width:1px !important;border-width:0 !important;margin-t=\r
op:0 !important;margin-bottom:0 !important;margin-right:0 !important;margin=\r
-left:0 !important;padding-top:0 !important;padding-bottom:0 !important;pad=\r
ding-right:0 !important;padding-left:0 !important;"/></body></html>\r
\r
--8f0685aa36495a8e169ac9645c24b03a421cd1021d3b4f2d2fb186785a3a--\r
)\r
`,
		results: {
			lexer: [
				tokenStar,
				tokenSP,
				num(4),
				tokenSP,
				atom("FETCH"),
				tokenSP,
				tokenOpenParen,
				atom("BODY"),
				op("["),
				op("]"),
				tokenSP,
				litString(`Delivered-To: lovelyinbox@test.gmail.com\r
Received: by 2002:a54:284d:0:0:0:0:0 with SMTP id w13csp812689ecq;\r
        Thu, 17 Jun 2021 17:09:57 -0700 (PDT)\r
X-Google-Smtp-Source: ABdhPJxuy46qK1MUKED4CKfakO+mZnjg2I1dApg3FCAREoGFmsx2pkjCOjnSnEqtX6pYCHLxxphM\r
X-Received: by 2002:a17:903:188:b029:114:a132:1e9 with SMTP id z8-20020a1709030188b0290114a13201e9mr2145035plg.24.1623974996989;\r
        Thu, 17 Jun 2021 17:09:56 -0700 (PDT)\r
ARC-Seal: i=1; a=rsa-sha256; t=1623974996; cv=none;\r
        d=google.com; s=arc-20160816;\r
        b=WG1CwENlKIhd5qQ0p2bsB0fU3tyyjW3UhDs4w0fJBagBIRj8QlKjsyfsIul4ebAN+2\r
         imG+5Nz6h3Oc79CKbeTxjiMtN/O1Wq+IAcH3NZacxX3C2R9F3tPLKHNOcL7+pxoHoxwV\r
         b552USzOoHrIEdnrPaHYn+yqC71c3OufJBMS39jKennjvWOFlb9zS6tcxb79c7jEMDHi\r
         CY9o5VswkdgsRw87D1H0onEpC7ZUubi46X+CBl0B0yVwRlfX5NNh6D1R6usO2yr/zhey\r
         KoPAWl+qDC3mkhy6pywvP61R73PQ6GlIxScT9yzp1t/UnCocMmZyLbBCoAkGtq+y8CTp\r
         wyXw==\r
ARC-Message-Signature: i=1; a=rsa-sha256; c=relaxed/relaxed; d=google.com; s=arc-20160816;\r
        h=to:reply-to:subject:message-id:mime-version:from:date\r
         :dkim-signature:dkim-signature;\r
        bh=4++lc9CDGO3nKvvZSGhwaUmYvn/l9RJsMwJbrUa8Yd0=;\r
        b=Xj183p44md2nI21Zlghj29KDScC58ZJqWv8wwnGnIS6J6vXeY9HHUgB/FArtUVWzD2\r
         5x4Ahy8t2OdQSAptTcqsSy0/4UK1YnfiBmgnpaxc5vYN6FeElwfQacHU7OA19SfrVwl0\r
         x8hyY8McdymZ+c+/anfU5Ui1CpXPJ5ImebdqTxgVjlUH+jx9gWNO++vfXbXvK7024CiG\r
         OL9jEAY7I4gZ7qKxoMv0TBZOJA3DOWV6fYysl+0RxPY7PouPFhQVK74f9uy/HB0fzK0S\r
         5AbFYV9uz1dccHLG9U6a05vNtJwD/zl553xH16lMpCEEEnFz/eNGD19wzlNxoqYaJOdE\r
         iMxQ==\r
ARC-Authentication-Results: i=1; mx.google.com;\r
       dkim=pass header.i=@mail.hbomax.com header.s=s1 header.b=qFzFx0nv;\r
       dkim=pass header.i=@sendgrid.info header.s=smtpapi header.b=\"o5/9nKa+\";\r
       spf=pass (google.com: domain of bounces+6146175-70a1-lovelyinbox=gmail.com@abmail.mail.hbomax.com designates 168.245.15.50 as permitted sender) smtp.mailfrom=\"bounces+6146175-70a1-lovelyinbox=gmail.com@abmail.mail.hbomax.com\";\r
       dmarc=pass (p=QUARANTINE sp=QUARANTINE dis=NONE) header.from=hbomax.com\r
Return-Path: <bounces+6146175-70a1-lovelyinbox=gmail.com@abmail.mail.hbomax.com>\r
Received: from o3346.abmail.service.hbomax.com (o3346.abmail.service.hbomax.com. [168.245.15.50])\r
        by mx.google.com with ESMTPS id p12si8473459plr.261.2021.06.17.17.09.56\r
        for <lovelyinbox@gmail.com>\r
        (version=TLS1_3 cipher=TLS_AES_128_GCM_SHA256 bits=128/128);\r
        Thu, 17 Jun 2021 17:09:56 -0700 (PDT)\r
Received-SPF: pass (google.com: domain of bounces+6146175-70a1-lovelyinbox=gmail.com@abmail.mail.hbomax.com designates 168.245.15.50 as permitted sender) client-ip=168.245.15.50;\r
Authentication-Results: mx.google.com;\r
       dkim=pass header.i=@mail.hbomax.com header.s=s1 header.b=qFzFx0nv;\r
       dkim=pass header.i=@sendgrid.info header.s=smtpapi header.b=\"o5/9nKa+\";\r
       spf=pass (google.com: domain of bounces+6146175-70a1-lovelyinbox=gmail.com@abmail.mail.hbomax.com designates 168.245.15.50 as permitted sender) smtp.mailfrom=\"bounces+6146175-70a1-lovelyinbox=gmail.com@abmail.mail.hbomax.com\";\r
       dmarc=pass (p=QUARANTINE sp=QUARANTINE dis=NONE) header.from=hbomax.com\r
DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed; d=mail.hbomax.com;\r
\th=content-type:from:mime-version:subject:reply-to:x-feedback-id:to;\r
\ts=s1; bh=4++lc9CDGO3nKvvZSGhwaUmYvn/l9RJsMwJbrUa8Yd0=;\r
\tb=qFzFx0nvoKBhMKjQpAFQitFfj+OmQAzc0r+smas55PdtjdTgaoQaSuC6Yref4PIYsM3H\r
\tXlY4Icq/mYWCXgNO7xgY7IYkYmMKtvqhRoogCWE/DXTrn+1ImVC0xLfWaa4RuakRQX16HN\r
\t6KZ/rsxKd3nJoq6Sdoy39yca/d+PoBfxs=\r
DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed; d=sendgrid.info;\r
\th=content-type:from:mime-version:subject:reply-to:x-feedback-id:to;\r
\ts=smtpapi; bh=4++lc9CDGO3nKvvZSGhwaUmYvn/l9RJsMwJbrUa8Yd0=;\r
\tb=o5/9nKa++BriMGiR4PQxxIUIFHkOCtLJalm3j76Yhh+yCER8tX1Xc63iCwHC10xs6rVg\r
\tf3rknRVql1rIOhOaZVj56OZNjcivhNObg0PyKmkv8yOmJwLgmiupPvdew0wGrD2t6/cfaX\r
\tfLW7ByW9dbnfXyEeXg+UEmH18wARYOALI=\r
Received: by filterdrecv-65ddcfb76c-tw9n8 with SMTP id filterdrecv-65ddcfb76c-tw9n8-1-60CBE453-2E\r
        2021-06-18 00:09:55.216447137 +0000 UTC m=+1221404.619083768\r
Received: from NjE0NjE3NQ (unknown)\r
\tby ismtpd0198p1mdw1.sendgrid.net (SG)\r
\twith HTTP\r
\tid gsQQ7dhGSqagIDEhdr51ZQ\r
\tFri, 18 Jun 2021 00:09:55.137 +0000 (UTC)\r
Content-Type: multipart/alternative; boundary=8f0685aa36495a8e169ac9645c24b03a421cd1021d3b4f2d2fb186785a3a\r
Date: Fri, 18 Jun 2021 00:09:56 +0000 (UTC)\r
From: HBO Max <HBOMax@mail.hbomax.com>\r
Mime-Version: 1.0\r
Message-ID: <gsQQ7dhGSqagIDEhdr51ZQ@ismtpd0198p1mdw1.sendgrid.net>\r
Subject: Integration Test Email #1\r
Reply-To: no-reply@hbomax.com\r
X-Feedback-ID: 6146175:SG\r
X-SG-EID: \r
 =?us-ascii?Q?3yT4WJv7EKAuJjOjMHtAOZG1X4or+nRAW+qIrxQUJmn052efbT=2FONz8JgJtCdm?=\r
 =?us-ascii?Q?f3p3wG=2FFTpFueRFgoptsd2qn5+qIs6IRLjEH49w?=\r
 =?us-ascii?Q?ckm23Rqdy3gO8t9Kh5oI6k85zDhJIVeWmmpF4+x?=\r
 =?us-ascii?Q?GEv7Ep9PBv80sM15jz2t=2F2gKFhB6tABnOUgSEOD?=\r
 =?us-ascii?Q?bW2u0e9e1c+zSszEyM=2FuK=2FFXvDTMx6y2C0pVnX1?=\r
 =?us-ascii?Q?B5ik2W7X1stC2PS9SY4L7pRwMeB3m+5DJyasMZ?=\r
X-SG-ID: \r
 =?us-ascii?Q?N2C25iY2uzGMFz6rgvQsb8raWjw0ZPf1VmjsCkspi=2FKvUYPFb2vwyNNeBc9bJi?=\r
 =?us-ascii?Q?ChCDubk7cyQP55+Dsvd5z3m+3Qw7EA8WQboLKVg?=\r
 =?us-ascii?Q?S3zfmn8lnEkSMbPnGCBL3ez1q=2FSWtrf27ZzggZW?=\r
 =?us-ascii?Q?WCgYfCJl0rgVKgSkpFfX6=2FCXvsAGB3mf0VCRHA8?=\r
 =?us-ascii?Q?0+cFvWivlWJpn+vcmyYYLCW6AE6ArdS2+AaJMCt?=\r
 =?us-ascii?Q?M8huMtygKCPnB7HtzhoqFjo5qnYinC0j8JgQdYm?=\r
 =?us-ascii?Q?ldE=2FS9QI3V+5qh2uk=2FnVZNg4KNE5E4H11uEHTgY?=\r
 =?us-ascii?Q?bRsD8AGrU133SetvHANdHSbErfPLP0RlbKKxCBR?=\r
 =?us-ascii?Q?=2FeyTA+VcwDn9PId1HD77sRXNbEGOnzMnzBvmvaG?=\r
 =?us-ascii?Q?1zqCZcTwCN0gaqzCrTC0U0jcYrK0aLQX2ptDrT=2F?=\r
 =?us-ascii?Q?hreXw8nC9Dd=2FwgeQ9gzNwZQOXCBdylx0IJYzXf1?=\r
 =?us-ascii?Q?IoahhlB4XZdjeouEbjxkG4uSNzv1jerHeXGsKzM?=\r
 =?us-ascii?Q?Oq=2FLYy59CcU1w6dAyfvBCdDTTbNNdP1ixfG0Z9V?=\r
 =?us-ascii?Q?ZzlWArmsZgoMdT1VRuup3Acs8=3D?=\r
To: lovelyinbox@gmail.com\r
X-Entity-ID: cCvtMaPaV56PEkSSWeCHsA==\r
\r
--8f0685aa36495a8e169ac9645c24b03a421cd1021d3b4f2d2fb186785a3a\r
Content-Transfer-Encoding: quoted-printable\r
Content-Type: text/plain; charset=us-ascii\r
Mime-Version: 1.0\r
\r
This template is used by integration tests only.\r
--8f0685aa36495a8e169ac9645c24b03a421cd1021d3b4f2d2fb186785a3a\r
Content-Transfer-Encoding: quoted-printable\r
Content-Type: text/html; charset=us-ascii\r
Mime-Version: 1.0\r
\r
<!DOCTYPE html PUBLIC \"-//W3C//DTD HTML 4.0 Transitional//EN\" \"http://www.w=\r
3.org/TR/REC-html40/loose.dtd\">\r
<html><body><p>This template is used by integration tests only.</p><img src=\r
=3D\"http://ablink.mail.hbomax.com/wf/open?upn=3DsY2vLsEKqW55viRwL1eH0gXPF1M=\r
9nSwfP2RKOAZR-2B1Jx7UVFhjqhNz4tPaLuo1srtCdSsNplg3swKpB6xh6-2FEEqznlXsKimPcI=\r
UFa3NaCkWn5lhbxuL6Bd3x1mO3Zxefpv7uAOjEgdGa6gJc0h-2BRq04Vw15QnyExT3hsyuCYcuh=\r
9-2F2JlIptiPcyoyQGeo0PlNxRt4swn4E-2BdQFU-2FbMUrVHx2lyvihTwmKOWvGwPiJe7zfP9H=\r
eIwqEqXRIrBGKP7RbttTMtLos-2BGkTKmyFjCWvxqQm2n22itFa7oB-2BnbwfVKy9JQ03Tuy45K=\r
wx1LLxPjc3mpxepLV6VmCk-2BGzDe-2BiUlEbQIdWklmnzHAsLZhVLCSz6nWYwA-2FLIOGwOrT6=\r
sNyp6QHRMmrmWd88WvEbmG1bkA-2BAh1DllxFIIpCEGBWPh7Fyonw6-2Bw5roHpRxwfoA7h149u=\r
EI7q-2BCjTByrEVo70pe0qScwZBvkYYuPZmgfDmkzZjK0ugyhVqS9Vk02xk5m5O4Ft1PMRq07pD=\r
-2FnFSK4f46yW1Rf12lD9l2ImqZ4MWNwosOyNP1kQfXwhR8ZoDjzfqV92KPDT9vnLiyPMqFd5du=\r
4xCDLOuujaYWvL8ArD-2FlkVJ8wXahNKK-2BNDGj7LOj8Oo38GxnI4ePGqQE0b6aHFutxGDfZMo=\r
h1CQ8yep88A88xcQEgdA4Jg77j6YeVNs3cdniTN-2BeGgvUb-2FxFbZ2A-2FZ8S-2FqUwOIRODc=\r
uuvhyiDNBCxk-3D\" alt=3D\"\" width=3D\"1\" height=3D\"1\" border=3D\"0\" style=3D\"he=\r
ight:1px !important;width:1px !important;border-width:0 !important;margin-t=\r
op:0 !important;margin-bottom:0 !important;margin-right:0 !important;margin=\r
-left:0 !important;padding-top:0 !important;padding-bottom:0 !important;pad=\r
ding-right:0 !important;padding-left:0 !important;\"/></body></html>\r
\r
--8f0685aa36495a8e169ac9645c24b03a421cd1021d3b4f2d2fb186785a3a--\r
`),
				tokenCloseParen,
				tokenCRLF,
			],
			parser: {
				content: {
					sequenceNumber: 4,
					body: {
						header: {
							fields: new Map(
								Object.entries({
									"Delivered-To":
										"lovelyinbox@test.gmail.com",
									Received: [
										"by 2002:a54:284d:0:0:0:0:0 with SMTP id w13csp812689ecq;        Thu, 17 Jun 2021 17:09:57 -0700 (PDT)",
										"from o3346.abmail.service.hbomax.com (o3346.abmail.service.hbomax.com. [168.245.15.50])        by mx.google.com with ESMTPS id p12si8473459plr.261.2021.06.17.17.09.56        for <lovelyinbox@gmail.com>        (version=TLS1_3 cipher=TLS_AES_128_GCM_SHA256 bits=128/128);        Thu, 17 Jun 2021 17:09:56 -0700 (PDT)",
										"by filterdrecv-65ddcfb76c-tw9n8 with SMTP id filterdrecv-65ddcfb76c-tw9n8-1-60CBE453-2E        2021-06-18 00:09:55.216447137 +0000 UTC m=+1221404.619083768",
										"from NjE0NjE3NQ (unknown)\tby ismtpd0198p1mdw1.sendgrid.net (SG)\twith HTTP\tid gsQQ7dhGSqagIDEhdr51ZQ\tFri, 18 Jun 2021 00:09:55.137 +0000 (UTC)",
									],
									"X-Google-Smtp-Source":
										"ABdhPJxuy46qK1MUKED4CKfakO+mZnjg2I1dApg3FCAREoGFmsx2pkjCOjnSnEqtX6pYCHLxxphM",
									"X-Received":
										"by 2002:a17:903:188:b029:114:a132:1e9 with SMTP id z8-20020a1709030188b0290114a13201e9mr2145035plg.24.1623974996989;        Thu, 17 Jun 2021 17:09:56 -0700 (PDT)",
									"ARC-Seal":
										"i=1; a=rsa-sha256; t=1623974996; cv=none;        d=google.com; s=arc-20160816;        b=WG1CwENlKIhd5qQ0p2bsB0fU3tyyjW3UhDs4w0fJBagBIRj8QlKjsyfsIul4ebAN+2         imG+5Nz6h3Oc79CKbeTxjiMtN/O1Wq+IAcH3NZacxX3C2R9F3tPLKHNOcL7+pxoHoxwV         b552USzOoHrIEdnrPaHYn+yqC71c3OufJBMS39jKennjvWOFlb9zS6tcxb79c7jEMDHi         CY9o5VswkdgsRw87D1H0onEpC7ZUubi46X+CBl0B0yVwRlfX5NNh6D1R6usO2yr/zhey         KoPAWl+qDC3mkhy6pywvP61R73PQ6GlIxScT9yzp1t/UnCocMmZyLbBCoAkGtq+y8CTp         wyXw==",
									"ARC-Message-Signature":
										"i=1; a=rsa-sha256; c=relaxed/relaxed; d=google.com; s=arc-20160816;        h=to:reply-to:subject:message-id:mime-version:from:date         :dkim-signature:dkim-signature;        bh=4++lc9CDGO3nKvvZSGhwaUmYvn/l9RJsMwJbrUa8Yd0=;        b=Xj183p44md2nI21Zlghj29KDScC58ZJqWv8wwnGnIS6J6vXeY9HHUgB/FArtUVWzD2         5x4Ahy8t2OdQSAptTcqsSy0/4UK1YnfiBmgnpaxc5vYN6FeElwfQacHU7OA19SfrVwl0         x8hyY8McdymZ+c+/anfU5Ui1CpXPJ5ImebdqTxgVjlUH+jx9gWNO++vfXbXvK7024CiG         OL9jEAY7I4gZ7qKxoMv0TBZOJA3DOWV6fYysl+0RxPY7PouPFhQVK74f9uy/HB0fzK0S         5AbFYV9uz1dccHLG9U6a05vNtJwD/zl553xH16lMpCEEEnFz/eNGD19wzlNxoqYaJOdE         iMxQ==",
									"ARC-Authentication-Results":
										'i=1; mx.google.com;       dkim=pass header.i=@mail.hbomax.com header.s=s1 header.b=qFzFx0nv;       dkim=pass header.i=@sendgrid.info header.s=smtpapi header.b="o5/9nKa+";       spf=pass (google.com: domain of bounces+6146175-70a1-lovelyinbox=gmail.com@abmail.mail.hbomax.com designates 168.245.15.50 as permitted sender) smtp.mailfrom="bounces+6146175-70a1-lovelyinbox=gmail.com@abmail.mail.hbomax.com";       dmarc=pass (p=QUARANTINE sp=QUARANTINE dis=NONE) header.from=hbomax.com',
									"Return-Path":
										"<bounces+6146175-70a1-lovelyinbox=gmail.com@abmail.mail.hbomax.com>",
									"Received-SPF":
										"pass (google.com: domain of bounces+6146175-70a1-lovelyinbox=gmail.com@abmail.mail.hbomax.com designates 168.245.15.50 as permitted sender) client-ip=168.245.15.50;",
									"Authentication-Results":
										'mx.google.com;       dkim=pass header.i=@mail.hbomax.com header.s=s1 header.b=qFzFx0nv;       dkim=pass header.i=@sendgrid.info header.s=smtpapi header.b="o5/9nKa+";       spf=pass (google.com: domain of bounces+6146175-70a1-lovelyinbox=gmail.com@abmail.mail.hbomax.com designates 168.245.15.50 as permitted sender) smtp.mailfrom="bounces+6146175-70a1-lovelyinbox=gmail.com@abmail.mail.hbomax.com";       dmarc=pass (p=QUARANTINE sp=QUARANTINE dis=NONE) header.from=hbomax.com',
									"DKIM-Signature": [
										"v=1; a=rsa-sha256; c=relaxed/relaxed; d=mail.hbomax.com;	h=content-type:from:mime-version:subject:reply-to:x-feedback-id:to;	s=s1; bh=4++lc9CDGO3nKvvZSGhwaUmYvn/l9RJsMwJbrUa8Yd0=;	b=qFzFx0nvoKBhMKjQpAFQitFfj+OmQAzc0r+smas55PdtjdTgaoQaSuC6Yref4PIYsM3H	XlY4Icq/mYWCXgNO7xgY7IYkYmMKtvqhRoogCWE/DXTrn+1ImVC0xLfWaa4RuakRQX16HN	6KZ/rsxKd3nJoq6Sdoy39yca/d+PoBfxs=",
										"v=1; a=rsa-sha256; c=relaxed/relaxed; d=sendgrid.info;	h=content-type:from:mime-version:subject:reply-to:x-feedback-id:to;	s=smtpapi; bh=4++lc9CDGO3nKvvZSGhwaUmYvn/l9RJsMwJbrUa8Yd0=;	b=o5/9nKa++BriMGiR4PQxxIUIFHkOCtLJalm3j76Yhh+yCER8tX1Xc63iCwHC10xs6rVg	f3rknRVql1rIOhOaZVj56OZNjcivhNObg0PyKmkv8yOmJwLgmiupPvdew0wGrD2t6/cfaX	fLW7ByW9dbnfXyEeXg+UEmH18wARYOALI=",
									],
									"Content-Type":
										"multipart/alternative; boundary=8f0685aa36495a8e169ac9645c24b03a421cd1021d3b4f2d2fb186785a3a",
									Date:
										"Fri, 18 Jun 2021 00:09:56 +0000 (UTC)",
									From: "HBO Max <HBOMax@mail.hbomax.com>",
									"Mime-Version": "1.0",
									"Message-ID":
										"<gsQQ7dhGSqagIDEhdr51ZQ@ismtpd0198p1mdw1.sendgrid.net>",
									Subject: "Integration Test Email #1",
									"Reply-To": "no-reply@hbomax.com",
									"X-Feedback-ID": "6146175:SG",
									"X-SG-EID":
										"3yT4WJv7EKAuJjOjMHtAOZG1X4or+nRAW+qIrxQUJmn052efbT/ONz8JgJtCdmf3p3wG/FTpFueRFgoptsd2qn5+qIs6IRLjEH49wckm23Rqdy3gO8t9Kh5oI6k85zDhJIVeWmmpF4+xGEv7Ep9PBv80sM15jz2t/2gKFhB6tABnOUgSEODbW2u0e9e1c+zSszEyM/uK/FXvDTMx6y2C0pVnX1B5ik2W7X1stC2PS9SY4L7pRwMeB3m+5DJyasMZ",
									"X-SG-ID":
										"N2C25iY2uzGMFz6rgvQsb8raWjw0ZPf1VmjsCkspi/KvUYPFb2vwyNNeBc9bJiChCDubk7cyQP55+Dsvd5z3m+3Qw7EA8WQboLKVgS3zfmn8lnEkSMbPnGCBL3ez1q/SWtrf27ZzggZWWCgYfCJl0rgVKgSkpFfX6/CXvsAGB3mf0VCRHA80+cFvWivlWJpn+vcmyYYLCW6AE6ArdS2+AaJMCtM8huMtygKCPnB7HtzhoqFjo5qnYinC0j8JgQdYmldE/S9QI3V+5qh2uk/nVZNg4KNE5E4H11uEHTgYbRsD8AGrU133SetvHANdHSbErfPLP0RlbKKxCBR/eyTA+VcwDn9PId1HD77sRXNbEGOnzMnzBvmvaG1zqCZcTwCN0gaqzCrTC0U0jcYrK0aLQX2ptDrT/hreXw8nC9Dd/wgeQ9gzNwZQOXCBdylx0IJYzXf1IoahhlB4XZdjeouEbjxkG4uSNzv1jerHeXGsKzMOq/LYy59CcU1w6dAyfvBCdDTTbNNdP1ixfG0Z9VZzlWArmsZgoMdT1VRuup3Acs8=",
									To: "lovelyinbox@gmail.com",
									"X-Entity-ID": "cCvtMaPaV56PEkSSWeCHsA==",
								}),
							),
							offset: undefined,
						},
						sections: [
							{
								kind: "TEXT",
								offset: undefined,
								contents:
									'--8f0685aa36495a8e169ac9645c24b03a421cd1021d3b4f2d2fb186785a3a\r\nContent-Transfer-Encoding: quoted-printable\r\nContent-Type: text/plain; charset=us-ascii\r\nMime-Version: 1.0\r\n\r\nThis template is used by integration tests only.\r\n--8f0685aa36495a8e169ac9645c24b03a421cd1021d3b4f2d2fb186785a3a\r\nContent-Transfer-Encoding: quoted-printable\r\nContent-Type: text/html; charset=us-ascii\r\nMime-Version: 1.0\r\n\r\n<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.0 Transitional//EN" "http://www.w=\r\n3.org/TR/REC-html40/loose.dtd">\r\n<html><body><p>This template is used by integration tests only.</p><img src=\r\n=3D"http://ablink.mail.hbomax.com/wf/open?upn=3DsY2vLsEKqW55viRwL1eH0gXPF1M=\r\n9nSwfP2RKOAZR-2B1Jx7UVFhjqhNz4tPaLuo1srtCdSsNplg3swKpB6xh6-2FEEqznlXsKimPcI=\r\nUFa3NaCkWn5lhbxuL6Bd3x1mO3Zxefpv7uAOjEgdGa6gJc0h-2BRq04Vw15QnyExT3hsyuCYcuh=\r\n9-2F2JlIptiPcyoyQGeo0PlNxRt4swn4E-2BdQFU-2FbMUrVHx2lyvihTwmKOWvGwPiJe7zfP9H=\r\neIwqEqXRIrBGKP7RbttTMtLos-2BGkTKmyFjCWvxqQm2n22itFa7oB-2BnbwfVKy9JQ03Tuy45K=\r\nwx1LLxPjc3mpxepLV6VmCk-2BGzDe-2BiUlEbQIdWklmnzHAsLZhVLCSz6nWYwA-2FLIOGwOrT6=\r\nsNyp6QHRMmrmWd88WvEbmG1bkA-2BAh1DllxFIIpCEGBWPh7Fyonw6-2Bw5roHpRxwfoA7h149u=\r\nEI7q-2BCjTByrEVo70pe0qScwZBvkYYuPZmgfDmkzZjK0ugyhVqS9Vk02xk5m5O4Ft1PMRq07pD=\r\n-2FnFSK4f46yW1Rf12lD9l2ImqZ4MWNwosOyNP1kQfXwhR8ZoDjzfqV92KPDT9vnLiyPMqFd5du=\r\n4xCDLOuujaYWvL8ArD-2FlkVJ8wXahNKK-2BNDGj7LOj8Oo38GxnI4ePGqQE0b6aHFutxGDfZMo=\r\nh1CQ8yep88A88xcQEgdA4Jg77j6YeVNs3cdniTN-2BeGgvUb-2FxFbZ2A-2FZ8S-2FqUwOIRODc=\r\nuuvhyiDNBCxk-3D" alt=3D"" width=3D"1" height=3D"1" border=3D"0" style=3D"he=\r\night:1px !important;width:1px !important;border-width:0 !important;margin-t=\r\nop:0 !important;margin-bottom:0 !important;margin-right:0 !important;margin=\r\n-left:0 !important;padding-top:0 !important;padding-bottom:0 !important;pad=\r\nding-right:0 !important;padding-left:0 !important;"/></body></html>\r\n\r\n--8f0685aa36495a8e169ac9645c24b03a421cd1021d3b4f2d2fb186785a3a--\r\n',
							},
						],
					},
				},
				type: "FETCH",
			},
		},
	},
	{
		name: "Gmail Extensions (Labels, Message ID, Thread ID)",
		input: [
			`* 1 FETCH (X-GM-MSGID 1278455344230334865 `,
			`X-GM-THRID 1278455344230334865 X-GM-LABELS `,
			`(\\Inbox \\Sent Important "Muy Importante"))`,
			CRLF,
		].join(""),
		results: {
			lexer: [
				tokenStar,
				tokenSP,
				num(1),
				tokenSP,
				atom("FETCH"),
				tokenSP,
				tokenOpenParen,
				atom("X-GM-MSGID"),
				tokenSP,
				bigInt(1278455344230334865n),
				tokenSP,
				atom("X-GM-THRID"),
				tokenSP,
				bigInt(1278455344230334865n),
				tokenSP,
				atom("X-GM-LABELS"),
				tokenSP,
				tokenOpenParen,
				op("\\"),
				atom("Inbox"),
				tokenSP,
				op("\\"),
				atom("Sent"),
				tokenSP,
				atom("Important"),
				tokenSP,
				qString("Muy Importante"),
				tokenCloseParen,
				tokenCloseParen,
				tokenCRLF,
			],
			parser: {
				content: {
					extensions: new Map([
						[
							"X-GM-MSGID",
							{ type: "X-GM-MSGID", id: 1278455344230334865n },
						],
						[
							"X-GM-THRID",
							{ type: "X-GM-THRID", id: 1278455344230334865n },
						],
						[
							"X-GM-LABELS",
							{
								type: "X-GM-LABELS",
								labels: {
									flagMap: new Map([
										[
											"\\Inbox",
											{
												name: "\\Inbox",
												isKnownName: false,
												isWildcard: false,
											},
										],
										[
											"\\Sent",
											{
												name: "\\Sent",
												isKnownName: true,
												isWildcard: false,
											},
										],
										[
											"Important",
											{
												name: "Important",
												isKnownName: false,
												isWildcard: false,
											},
										],
										[
											"Muy Importante",
											{
												name: "Muy Importante",
												isKnownName: false,
												isWildcard: false,
											},
										],
									]),
									hasWildcard: false,
								},
							},
						],
					]),
					sequenceNumber: 1,
				},
				type: "FETCH",
			},
		},
	},
];

export default fetchSet;
