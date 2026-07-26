import { CapabilityRegistry } from "../../../src/client/capabilities";
import { CapabilityList } from "../../../src/parser";
import Lexer from "../../../src/lexer/lexer";
import Parser from "../../../src/parser/parser";
import UntaggedResponse from "../../../src/parser/structure/untagged";

const CRLF = "\r\n";

/** Builds a real parsed `CapabilityList` from a raw `* CAPABILITY ...` line. */
function parseCapabilityList(line: string): CapabilityList {
	const lexer = new Lexer();
	const parser = new Parser();
	const resp = parser.parseTokens(lexer.tokenize(`* ${line}${CRLF}`));
	return (resp as UntaggedResponse).content as CapabilityList;
}

describe("CapabilityRegistry", () => {
	test("starts invalid, with an empty/false live view", () => {
		const registry = new CapabilityRegistry();

		expect(registry.isValid).toBe(false);
		expect(registry.view.has("IMAP4rev1")).toBe(false);
		expect(registry.view.all().size).toBe(0);
		expect(registry.view.authMechanisms()).toEqual([]);
	});

	describe("has() is case-insensitive", () => {
		test("via plain-string ingestion", () => {
			const registry = new CapabilityRegistry();
			registry.set(["IMAP4rev1", "STARTTLS", "IDLE"]);

			expect(registry.view.has("starttls")).toBe(true);
			expect(registry.view.has("StartTLS")).toBe(true);
			expect(registry.view.has("STARTTLS")).toBe(true);
			expect(registry.view.has("COMPRESS=DEFLATE")).toBe(false);
		});

		test("via CapabilityList ingestion", () => {
			const registry = new CapabilityRegistry();
			registry.set(
				parseCapabilityList("CAPABILITY IMAP4rev1 STARTTLS IDLE"),
			);

			expect(registry.view.has("idle")).toBe(true);
			expect(registry.view.has("IDLE")).toBe(true);
		});
	});

	describe("AUTH= parsing", () => {
		test("lowercase auth=plain surfaces as canonical \"PLAIN\" (plain-string ingestion)", () => {
			const registry = new CapabilityRegistry();
			registry.set(["IMAP4rev1", "auth=plain", "AUTH=SCRAM-SHA-256"]);

			expect(registry.view.authMechanisms().sort()).toEqual(
				["PLAIN", "SCRAM-SHA-256"].sort(),
			);
		});

		test("lowercase auth=plain surfaces as canonical \"PLAIN\" (CapabilityList ingestion)", () => {
			const registry = new CapabilityRegistry();
			registry.set(
				parseCapabilityList(
					"CAPABILITY IMAP4rev1 auth=plain AUTH=SCRAM-SHA-256",
				),
			);

			expect(registry.view.authMechanisms().sort()).toEqual(
				["PLAIN", "SCRAM-SHA-256"].sort(),
			);
		});

		test("non-AUTH capabilities never leak into authMechanisms()", () => {
			const registry = new CapabilityRegistry();
			registry.set(["IMAP4rev1", "STARTTLS", "AUTH=PLAIN"]);

			expect(registry.view.authMechanisms()).toEqual(["PLAIN"]);
		});
	});

	describe("all()", () => {
		test("returns the canonical upper-case capability set", () => {
			const registry = new CapabilityRegistry();
			registry.set(["imap4rev1", "starttls"]);

			const all = registry.view.all();
			expect(all.has("IMAP4REV1")).toBe(true);
			expect(all.has("STARTTLS")).toBe(true);
			expect(all.size).toBe(2);
		});
	});

	describe("live view semantics", () => {
		test("the same view instance reflects a subsequent set()", () => {
			const registry = new CapabilityRegistry();
			const view = registry.view;

			expect(view.has("IDLE")).toBe(false);

			registry.set(["IDLE"]);

			expect(view.has("IDLE")).toBe(true);
		});

		test("the same view instance reflects a subsequent invalidate()", () => {
			const registry = new CapabilityRegistry();
			const view = registry.view;
			registry.set(["IDLE"]);
			expect(view.has("IDLE")).toBe(true);

			registry.invalidate();

			expect(view.has("IDLE")).toBe(false);
			expect(view.all().size).toBe(0);
			expect(view.authMechanisms()).toEqual([]);
		});

		test("invalidate() never throws even when already invalid", () => {
			const registry = new CapabilityRegistry();
			expect(() => registry.invalidate()).not.toThrow();
			expect(registry.isValid).toBe(false);
		});

		test("a value set after invalidate() replaces the discarded one", () => {
			const registry = new CapabilityRegistry();
			registry.set(["PRE-TLS-ONLY"]);
			registry.invalidate();
			registry.set(["POST-TLS-ONLY"]);

			expect(registry.view.has("PRE-TLS-ONLY")).toBe(false);
			expect(registry.view.has("POST-TLS-ONLY")).toBe(true);
		});
	});

	describe("epoch", () => {
		test("starts at 0", () => {
			const registry = new CapabilityRegistry();
			expect(registry.view.epoch).toBe(0);
		});

		test("bumps on every set()", () => {
			const registry = new CapabilityRegistry();
			registry.set(["IDLE"]);
			expect(registry.view.epoch).toBe(1);
			registry.set(["IDLE", "STARTTLS"]);
			expect(registry.view.epoch).toBe(2);
		});

		test("bumps on every invalidate()", () => {
			const registry = new CapabilityRegistry();
			registry.set(["IDLE"]);
			expect(registry.view.epoch).toBe(1);
			registry.invalidate();
			expect(registry.view.epoch).toBe(2);
		});

		test("is monotonically increasing across a mixed set/invalidate sequence", () => {
			const registry = new CapabilityRegistry();
			const seen: number[] = [registry.view.epoch];

			registry.set(["IDLE"]);
			seen.push(registry.view.epoch);
			registry.set(["IDLE", "STARTTLS"]);
			seen.push(registry.view.epoch);
			registry.invalidate();
			seen.push(registry.view.epoch);
			registry.invalidate();
			seen.push(registry.view.epoch);
			registry.set(["STARTTLS"]);
			seen.push(registry.view.epoch);

			expect(seen).toEqual([0, 1, 2, 3, 4, 5]);
			for (let i = 1; i < seen.length; i++) {
				expect(seen[i]).toBeGreaterThan(seen[i - 1]);
			}
		});
	});

	describe("onChange()", () => {
		test("fires on set(), passing the live view", () => {
			const registry = new CapabilityRegistry();
			const cb = vi.fn();
			registry.onChange(cb);

			registry.set(["IDLE"]);

			expect(cb).toHaveBeenCalledTimes(1);
			expect(cb).toHaveBeenCalledWith(registry.view);
			expect(cb.mock.calls[0][0].has("IDLE")).toBe(true);
		});

		test("fires on invalidate()", () => {
			const registry = new CapabilityRegistry();
			registry.set(["IDLE"]);
			const cb = vi.fn();
			registry.onChange(cb);

			registry.invalidate();

			expect(cb).toHaveBeenCalledTimes(1);
			expect(cb).toHaveBeenCalledWith(registry.view);
		});

		test("unsubscribe stops further notifications", () => {
			const registry = new CapabilityRegistry();
			const cb = vi.fn();
			const unsubscribe = registry.onChange(cb);

			registry.set(["IDLE"]);
			expect(cb).toHaveBeenCalledTimes(1);

			unsubscribe();
			registry.set(["STARTTLS"]);
			registry.invalidate();

			expect(cb).toHaveBeenCalledTimes(1);
		});
	});

	describe("ingestion forms", () => {
		test("accepts a Set<string> (any Iterable<string>, not just Array)", () => {
			const registry = new CapabilityRegistry();
			registry.set(new Set(["IDLE", "AUTH=PLAIN"]));

			expect(registry.view.has("IDLE")).toBe(true);
			expect(registry.view.authMechanisms()).toEqual(["PLAIN"]);
		});

		test("accepts a parsed CapabilityList end-to-end", () => {
			const registry = new CapabilityRegistry();
			registry.set(
				parseCapabilityList(
					"CAPABILITY IMAP4rev1 STARTTLS AUTH=PLAIN LOGINDISABLED",
				),
			);

			expect(registry.view.has("IMAP4rev1")).toBe(true);
			expect(registry.view.has("LOGINDISABLED")).toBe(true);
			expect(registry.view.authMechanisms()).toEqual(["PLAIN"]);
		});
	});
});
