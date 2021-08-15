import { decodeWords } from "../../../src/parser/encoding";

describe("decodeWords", () => {
	test("MIME encoded-word in value", () => {
		// Arrange
		const str = "=?iso-8859-1?Q?=A1Hola,_se=F1or!?=";

		// Act
		const decoded = decodeWords(str);

		// Assert
		expect(decoded).toBe("¡Hola, señor!");
	});

	test("MIME encoded-word in value with language set (RFC2231)", () => {
		// Arrange
		const str = "=?iso-8859-1*es?Q?=A1Hola,_se=F1or!?=";

		// Act
		const decoded = decodeWords(str);

		// Assert
		expect(decoded).toBe("¡Hola, señor!");
	});

	test("MIME encoded-word in value with empty language set", () => {
		// Arrange
		const str = "=?iso-8859-1*?Q?=A1Hola,_se=F1or!?=";

		// Act
		const decoded = decodeWords(str);

		// Assert
		expect(decoded).toBe("¡Hola, señor!");
	});
});
