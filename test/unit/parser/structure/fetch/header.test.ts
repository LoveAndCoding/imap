import { MessageHeader } from "../../../../../src/parser/structure/fetch/header";

const CRLF = "\r\n";

const parsingTests = [
	{
		source: ["To: Foo", CRLF, " Bar Baz", CRLF],
		expected: new Map([["To", "Foo Bar Baz"]]),
		what: "Folded header value (plain -- space)",
	},
	{
		source: ["To: Foo", CRLF, "\tBar\tBaz", CRLF],
		expected: new Map([["To", "Foo\tBar\tBaz"]]),
		what: "Folded header value (plain -- tab)",
	},
	{
		source: ["Subject: =?iso-8859-1?Q?=A1Hola,_se=F1or!?=", CRLF],
		expected: new Map([["Subject", "¡Hola, señor!"]]),
		what: "MIME encoded-word in value",
	},
	{
		source: ["Subject: =?iso-8859-1*es?Q?=A1Hola,_se=F1or!?=", CRLF],
		expected: new Map([["Subject", "¡Hola, señor!"]]),
		what: "MIME encoded-word in value with language set (RFC2231)",
	},
	{
		source: ["Subject: =?iso-8859-1*?Q?=A1Hola,_se=F1or!?=", CRLF],
		expected: new Map([["Subject", "¡Hola, señor!"]]),
		what: "MIME encoded-word in value with empty language set",
	},
	{
		source: [
			"Subject: =?GB2312?Q?=B2=E2=CA=D4=CC=E2=C4=BF=D3=EB=D6=D0=B9=FA=D0=C5_long_subjects_are_not_OK_12?=",
			CRLF,
			" =?GB2312?Q?345678901234567890123456789012345678901234567890123456789012?=",
			CRLF,
			" =?GB2312?Q?345678901234567890?=",
			CRLF,
		],
		expected: new Map([
			[
				"Subject",
				"测试题目与中国信 long subjects are not OK 12345678901234567890123456789012345678901234567890123456789012345678901234567890",
			],
		]),
		what: "Folded header value (adjacent MIME encoded-words)",
	},
	{
		source: [
			"Subject: =?GB2312?Q?=B2=E2=CA=D4=CC=E2=C4=BF=D3=EB=D6=D0=B9=FA=D0=C5_long_subjects_are_not_OK_12?=",
			CRLF,
			" 3=?GB2312?Q?45678901234567890123456789012345678901234567890123456789012?=",
			CRLF,
			" 3=?GB2312?Q?45678901234567890?=",
			CRLF,
		],
		expected: new Map([
			[
				"Subject",
				"测试题目与中国信 long subjects are not OK 12 345678901234567890123456789012345678901234567890123456789012 345678901234567890",
			],
		]),
		what: "Folded header value (non-adjacent MIME encoded-words)",
	},
	{
		source: [
			"Subject: =?GB2312?Q?=B2=E2=CA=D4=CC=E2=C4=BF=D3=EB=D6=D0=B9=FA=D0=C5_long_subjects_are_not_OK_12?=",
			CRLF,
			" 3=?GB2312?Q?45678901234567890123456789012345678901234567890123456789012?=",
			CRLF,
			" =?GB2312?Q?345678901234567890?=",
			CRLF,
		],
		expected: new Map([
			[
				"Subject",
				"测试题目与中国信 long subjects are not OK 12 345678901234567890123456789012345678901234567890123456789012345678901234567890",
			],
		]),
		what:
			"Folded header value (one adjacent, one non-adjacent MIME encoded-words)",
	},
	{
		source: [
			"Subject: =?UTF-8?Q?=E0=B9=84=E0=B8=97=E0=B8=A2_=E0=B9=84?=",
			CRLF,
			"   ",
			CRLF,
			" =?UTF-8?Q?=E0=B8=97=E0=B8=A2_=E0=B9=84=E0=B8=97?=  =?UTF-8?Q?=E0=B8=A2?=",
			CRLF,
		],
		expected: new Map([["Subject", "ไทย ไทย ไทย"]]),
		what:
			"Folded header value (adjacent MIME encoded-words seperated by linear whitespace)",
	},
	{
		source: [
			"Subject: =?utf-8?Q?abcdefghij_=E0=B9=83=E0=B8=99_klmnopqr_=E0=B9=84=E0=B8=A1=E0=B9?=",
			CRLF,
			" =?utf-8?Q?=88=E0=B8=82=E0=B8=B6=E0=B9=89=E0=B8=99?=",
			CRLF,
		],
		expected: new Map([["Subject", "abcdefghij ใน klmnopqr ไม่ขึ้น"]]),
		what: "Folded header value (incomplete multi-byte character split)",
	},
	{
		source: [
			"Subject: =?utf-8?B?Rlc6IOC4quC4tOC5iOC4h+C4oeC4tQ==?=",
			CRLF,
			" =?utf-8?B?4LiK4Li14Lin4Li04LiV4Lir4LiZ4LmJ4Liy4LiV?=",
			CRLF,
			" =?utf-8?B?4Liy4LmB4Lib4Lil4LiBIOC5hiDguKPguK3=?=",
			CRLF,
			" =?utf-8?Q?=E0=B8=9A=E0=B9=82=E0=B8=A5=E0=B8=81?=",
			CRLF,
		],
		expected: new Map([["Subject", "FW: สิ่งมีชีวิตหน้าตาแปลก ๆ รอบโลก"]]),
		what: "Folded header value (consecutive complete base64-encoded words)",
	},
	{
		source: [
			"Subject: =?utf-8?B?4Lij4Li54Lib4Lig4Liy4Lie4LiX4Li14LmIIGVtYmVkIOC5g+C4meC5gOC4?=",
			CRLF,
			" =?utf-8?B?meC4t+C5ieC4reC5gOC4oeC4peC4peC5jOC5hOC4oeC5iOC5geC4quC4lOC4?=",
			CRLF,
			" =?utf-8?B?hw==?=",
			CRLF,
		],
		expected: new Map([["Subject", "รูปภาพที่ embed ในเนื้อเมลล์ไม่แสดง"]]),
		what: "Folded header value (consecutive partial base64-encoded words)",
	},
	{
		source: ["               ", CRLF, "To: Foo", CRLF],
		expected: new Map([["To", "Foo"]]),
		what: "Invalid first line",
	},
	// header with body
	{
		source: [
			"Subject: test subject",
			CRLF,
			"X-Another-Header: test",
			CRLF,
			CRLF,
			"This is body: Not a header",
			CRLF,
		],
		expected: new Map([
			["Subject", "test subject"],
			["X-Another-Header", "test"],
		]),
		what: "Header with the body",
	},
];

describe("MessageHeader", () => {
	test.each(parsingTests)("Parsing Test: $what", ({ source, expected }) => {
		// Arrange
		const headerStr = source.join("");

		// Act
		const header = new MessageHeader(headerStr);

		// Assert
		expect(header.fields).toEqual(expected);
	});
});

// H13 fix: `mergeIn` used to do
// `withHeader.fields.forEach(([key, val]) => this.fields.set(key, val))`.
// `Map.prototype.forEach`'s callback signature is `(value, key, map)`, NOT
// `([key, value])`, so the destructuring above pulled the FIELD NAME out of
// the VALUE (array-destructuring a string spreads its characters; for a
// >1-value array field, it grabbed the first two array entries instead of
// the real key), discarding the actual field name entirely. Direct
// `mergeIn` coverage in both directions, independent of the higher
// FETCH/Fetch-merge call sites.
describe("MessageHeader.mergeIn", () => {
	test("merges a single-valued field from another header, preserving the real field name", () => {
		const target = new MessageHeader();
		const incoming = new MessageHeader("Subject: hello world\r\n");

		target.mergeIn(incoming);

		expect(target.fields.get("Subject")).toBe("hello world");
		expect(target.fields.size).toBe(1);
	});

	test("merges a multi-valued (repeated) field from another header intact", () => {
		const target = new MessageHeader();
		const incoming = new MessageHeader(
			"Received: first\r\nReceived: second\r\n",
		);

		target.mergeIn(incoming);

		expect(target.fields.get("Received")).toEqual(["first", "second"]);
	});

	test("merges several distinct fields from another header without dropping any names", () => {
		const target = new MessageHeader();
		const incoming = new MessageHeader(
			"Subject: hi\r\nFrom: a@b.com\r\nTo: c@d.com\r\n",
		);

		target.mergeIn(incoming);

		expect(target.fields.get("Subject")).toBe("hi");
		expect(target.fields.get("From")).toBe("a@b.com");
		expect(target.fields.get("To")).toBe("c@d.com");
		expect(target.fields.size).toBe(3);
	});

	test("a later mergeIn overrides an earlier value for the same field name (last wins)", () => {
		const target = new MessageHeader("Subject: original\r\n");
		const incoming = new MessageHeader("Subject: replaced\r\n");

		target.mergeIn(incoming);

		expect(target.fields.get("Subject")).toBe("replaced");
	});

	test("merging in both directions preserves every field from both sides", () => {
		const a = new MessageHeader("Subject: hi\r\n");
		const b = new MessageHeader("From: a@b.com\r\n");

		a.mergeIn(b);
		expect(a.fields.get("Subject")).toBe("hi");
		expect(a.fields.get("From")).toBe("a@b.com");

		const c = new MessageHeader("Subject: hi\r\n");
		b.mergeIn(c);
		expect(b.fields.get("From")).toBe("a@b.com");
		expect(b.fields.get("Subject")).toBe("hi");
	});
});
