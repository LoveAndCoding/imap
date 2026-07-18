import { decodeBytes, decodeWords } from "../../../src/parser/encoding";
import { IState } from "../../../src/parser/types";

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

// LOW fix: a hard (non-partial) decode failure must clear any dangling
// partial-decode state left over from a PRIOR word, the same way a
// successful decode (or a non-consecutive/different-encoding new word)
// already does. Otherwise a stale `state.buffer`/`curReplace` survives this
// word's failure, and a LATER, unrelated consecutive word (same encoding)
// can wrongly get concatenated with those stale bytes -- silently skipping
// over the word that just failed and corrupting the eventual replacement
// offsets/content.
describe("decodeBytes: partial-decode state cleanup on a hard failure", () => {
	function makeState(overrides: Partial<IState> = {}): IState {
		return {
			buffer: undefined,
			consecutive: false,
			curReplace: undefined,
			encoding: undefined,
			remainder: undefined,
			replaces: [],
			...overrides,
		};
	}

	test("clears a dangling prior partial (buffer/encoding/curReplace) after a hard failure for the current word", () => {
		// Arrange: simulate a PRIOR word ("A") that was left mid-join --
		// `state.buffer`/`state.encoding`/`state.curReplace` all still set,
		// as `decodeBytes` leaves them when `isPartial` is true.
		const stalePlaceholder = {
			fromOffset: 0,
			toOffset: 5,
			val: "�����",
		};
		const state = makeState({
			buffer: Buffer.from("stale-partial-bytes"),
			consecutive: true,
			curReplace: [stalePlaceholder],
			encoding: "utf-8",
		});
		state.replaces.push(state.curReplace as unknown as never);

		// Act: the CURRENT word ("B") declares an encoding this library
		// doesn't support at all -- `encodingExists()` is false, so
		// `decodeBytes` falls straight to the "unexpected error or
		// unsupported encoding" raw-bytes fallback without ever touching the
		// `if (state.buffer !== undefined)` join logic above it.
		decodeBytes(
			Buffer.from("bytes"),
			"this-is-not-a-real-encoding",
			10,
			5,
			0,
			state,
			undefined,
		);

		// Assert: the dangling prior-word state must be gone -- a THIRD
		// word can no longer wrongly join with it.
		expect(state.buffer).toBeUndefined();
		expect(state.encoding).toBeUndefined();
		expect(state.curReplace).toBeUndefined();
	});

	test("a hard failure with no prior partial state leaves state cleared (no regression)", () => {
		const state = makeState();

		decodeBytes(
			Buffer.from("bytes"),
			"this-is-not-a-real-encoding",
			0,
			5,
			0,
			state,
			undefined,
		);

		expect(state.buffer).toBeUndefined();
		expect(state.encoding).toBeUndefined();
		expect(state.curReplace).toBeUndefined();
		// The raw-bytes substitution was still recorded.
		expect(state.replaces).toHaveLength(1);
	});
});
