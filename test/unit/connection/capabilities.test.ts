import { CapabilityRegistry } from "../../../src/connection/capabilities";
import type { CapabilityList } from "../../../src/parser";

describe("CapabilityRegistry", () => {
	test("starts invalid with a null value", () => {
		// Arrange / Act
		const registry = new CapabilityRegistry();

		// Assert
		expect(registry.isValid).toBe(false);
		expect(registry.value).toBeNull();
	});

	test("set() records the capability list and marks the registry valid", () => {
		// Arrange
		const registry = new CapabilityRegistry();
		const caps: any = { has: (c: string) => c === "STARTTLS" };

		// Act
		registry.set(caps);

		// Assert
		expect(registry.isValid).toBe(true);
		expect(registry.value).toBe(caps);
	});

	test("invalidate() drops the cached value (I-2)", () => {
		// Arrange
		const registry = new CapabilityRegistry();
		const preTls: any = { has: (c: string) => c === "PRE-TLS-ONLY" };
		registry.set(preTls);

		// Act
		registry.invalidate();

		// Assert
		expect(registry.isValid).toBe(false);
		expect(registry.value).toBeNull();
	});

	test("a value set after invalidate() replaces the discarded one — pre-TLS data never resurfaces", () => {
		// Arrange: simulate the STARTTLS sequence — a pre-TLS capability list
		// is cached, the handshake succeeds and invalidates it, then the
		// post-TLS CAPABILITY round trip sets the real current value.
		const registry = new CapabilityRegistry();
		const preTls: any = { has: (c: string) => c === "PRE-TLS-ONLY" };
		const postTls: any = { has: (c: string) => c === "POST-TLS-ONLY" };
		registry.set(preTls);

		// Act
		registry.invalidate();
		registry.set(postTls);

		// Assert: only the post-TLS value is observable; the pre-TLS list is
		// gone, not merely shadowed.
		expect(registry.value).toBe(postTls);
		expect(registry.value).not.toBe(preTls);
		expect((registry.value as CapabilityList).has("PRE-TLS-ONLY")).toBe(false);
		expect((registry.value as CapabilityList).has("POST-TLS-ONLY")).toBe(true);
	});
});
