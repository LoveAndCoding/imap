import {
	Address,
	AddressList,
} from "../../../../../src/parser/structure/fetch/address";
import {
	getNStringValue,
	splitUnseparatedListofLists,
	splitSpaceSeparatedList,
} from "../../../../../src/parser/utility";

jest.mock("../../../../../src/parser/utility");

const addressParsingTests = [
	{
		source: ["Terry Gray", null, "gray", "cac.washington.edu"],
		expected: {
			name: "Terry Gray",
			route: null,
			mailbox: "gray",
			host: "cac.washington.edu",
		},
		what: "RFC3501 example #1",
	},
	{
		source: [null, null, "imap", "cac.washington.edu"],
		expected: {
			name: null,
			route: null,
			mailbox: "imap",
			host: "cac.washington.edu",
		},
		what: "RFC3501 example #2",
	},
	{
		source: [
			"=?utf-8?Q?=C2=A9=C2=AEAZ=C2=A5?=",
			null,
			"crazy",
			"example.org",
		],
		expected: {
			name: "©®AZ¥",
			route: null,
			mailbox: "crazy",
			host: "example.org",
		},
		what: "Name with encoded word(s)",
	},
];

describe("Address", () => {
	test.each(addressParsingTests)(
		"Parsing Test: $what",
		({ source, expected }) => {
			// Arrange
			const splitSpaceSeparatedListMock = splitSpaceSeparatedList as jest.MockedFunction<
				typeof splitSpaceSeparatedList
			>;
			splitSpaceSeparatedListMock.mockReturnValue(source as any);
			const getNStringValueMock = getNStringValue as jest.MockedFunction<
				typeof getNStringValue
			>;
			getNStringValueMock.mockImplementation(
				(val: any): null | string => val as null | string,
			);

			// Act
			const addr = new Address([]);

			// Assert
			expect(addr).toEqual(expected);
		},
	);
});

const addressListParsingTests = [
	{
		source: [
			[null, null, "imap", null],
			[null, null, null, null],
		],
		expected: [{ name: "imap", list: [] }],
		what: "Zero-length group",
	},
	{
		source: [
			[null, null, "imap", null],
			["Terry Gray", null, "gray", "cac.washington.edu"],
			[null, null, null, null],
		],
		expected: [
			{
				name: "imap",
				list: [
					{
						name: "Terry Gray",
						route: null,
						mailbox: "gray",
						host: "cac.washington.edu",
					},
				],
			},
		],
		what: "One-length group",
	},
	{
		source: [
			[null, null, "imap", null],
			["Terry Gray", null, "gray", "cac.washington.edu"],
			[null, null, null, null],
			[null, null, "imap", "cac.washington.edu"],
		],
		expected: [
			{
				name: "imap",
				list: [
					{
						name: "Terry Gray",
						route: null,
						mailbox: "gray",
						host: "cac.washington.edu",
					},
				],
			},
			{
				name: null,
				route: null,
				mailbox: "imap",
				host: "cac.washington.edu",
			},
		],
		what: "One-length group and address",
	},
	{
		source: [
			[null, null, "imap", null],
			["Terry Gray", null, "gray", "cac.washington.edu"],
		],
		expected: [
			{
				name: "imap",
				list: [
					{
						name: "Terry Gray",
						route: null,
						mailbox: "gray",
						host: "cac.washington.edu",
					},
				],
			},
		],
		what: "Implicit group end",
	},
	{
		source: [
			["Terry Gray", null, "gray", "cac.washington.edu"],
			[null, null, null, null],
		],
		expected: [
			{
				name: "Terry Gray",
				route: null,
				mailbox: "gray",
				host: "cac.washington.edu",
			},
		],
		what: "Group end without start",
	},
];

describe("AddressList", () => {
	test.each(addressListParsingTests)(
		"Parsing Test: $what",
		({ source, expected }) => {
			// Arrange
			const splitUnseparatedListofListsMock = splitUnseparatedListofLists as jest.MockedFunction<
				typeof splitUnseparatedListofLists
			>;
			splitUnseparatedListofListsMock.mockReturnValue(source as any);
			const splitSpaceSeparatedListMock = splitSpaceSeparatedList as jest.MockedFunction<
				typeof splitSpaceSeparatedList
			>;
			splitSpaceSeparatedListMock.mockImplementation((val: any) => val);
			const getNStringValueMock = getNStringValue as jest.MockedFunction<
				typeof getNStringValue
			>;
			getNStringValueMock.mockImplementation(
				(val: any): null | string => val as null | string,
			);

			// Act
			const addrList = new AddressList(source as any);

			// Assert
			expect(addrList.list).toEqual(expected);
		},
	);
});
