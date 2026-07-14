import { describe, expect, test } from "vitest";

import type { ImapClientConfig } from "../../../src/client/config";
import { validateConfig } from "../../../src/client/config";

describe("validateConfig (spec §2)", () => {
	describe("validation rules", () => {
		test("throws when host is missing", () => {
			expect(() => validateConfig({} as ImapClientConfig)).toThrow(TypeError);
		});

		test("throws when host is not a string", () => {
			expect(() =>
				validateConfig({ host: 42 } as unknown as ImapClientConfig),
			).toThrow(TypeError);
		});

		test("throws when host is empty", () => {
			expect(() => validateConfig({ host: "" })).toThrow(RangeError);
		});

		test("throws when host is blank (whitespace-only)", () => {
			expect(() => validateConfig({ host: "   " })).toThrow(RangeError);
		});

		test("throws when port is not an integer (float)", () => {
			expect(() => validateConfig({ host: "h", port: 143.5 })).toThrow(
				TypeError,
			);
		});

		test("throws when port is not a number", () => {
			expect(() =>
				validateConfig({ host: "h", port: "143" as unknown as number }),
			).toThrow(TypeError);
		});

		test("throws when port is < 1", () => {
			expect(() => validateConfig({ host: "h", port: 0 })).toThrow(RangeError);
		});

		test("throws when port is > 65535", () => {
			expect(() => validateConfig({ host: "h", port: 65536 })).toThrow(
				RangeError,
			);
		});

		test("accepts boundary ports 1 and 65535", () => {
			expect(validateConfig({ host: "h", port: 1 }).port).toBe(1);
			expect(validateConfig({ host: "h", port: 65535 }).port).toBe(65535);
		});

		test("throws on an unknown tls mode", () => {
			expect(() =>
				validateConfig({ host: "h", tls: "maybe" as unknown as "on" }),
			).toThrow(TypeError);
		});

		test("throws when auth has neither pass nor accessToken", () => {
			expect(() =>
				validateConfig({ host: "h", auth: { user: "u" } }),
			).toThrow(TypeError);
		});

		test("throws when auth.user is missing", () => {
			expect(() =>
				validateConfig({
					host: "h",
					auth: { pass: "p" } as unknown as ImapClientConfig["auth"],
				}),
			).toThrow(TypeError);
		});

		test("accepts auth with pass only", () => {
			expect(() =>
				validateConfig({ host: "h", auth: { user: "u", pass: "p" } }),
			).not.toThrow();
		});

		test("accepts auth with accessToken only", () => {
			expect(() =>
				validateConfig({ host: "h", auth: { user: "u", accessToken: "t" } }),
			).not.toThrow();
		});

		describe("negative timeouts", () => {
			for (const field of [
				"connect",
				"greeting",
				"command",
				"idleRenew",
				"noopFallbackInterval",
			] as const) {
				test(`throws when timeouts.${field} is negative`, () => {
					expect(() =>
						validateConfig({ host: "h", timeouts: { [field]: -1 } }),
					).toThrow(RangeError);
				});
			}
		});

		test("throws when timeouts is not an object", () => {
			expect(() =>
				validateConfig({
					host: "h",
					timeouts: 5 as unknown as ImapClientConfig["timeouts"],
				}),
			).toThrow(TypeError);
		});

		test("throws when maxInlineSize is negative", () => {
			expect(() => validateConfig({ host: "h", maxInlineSize: -1 })).toThrow(
				RangeError,
			);
		});

		test("throws when compress is an invalid value", () => {
			expect(() =>
				validateConfig({
					host: "h",
					compress: "always" as unknown as "auto",
				}),
			).toThrow(TypeError);
		});

		test("throws when extensions is an invalid value", () => {
			expect(() =>
				validateConfig({
					host: "h",
					extensions: "always" as unknown as "auto",
				}),
			).toThrow(TypeError);
		});

		test("throws when extensions array contains a non-string", () => {
			expect(() =>
				validateConfig({
					host: "h",
					extensions: [1] as unknown as string[],
				}),
			).toThrow(TypeError);
		});

		test("throws when id is neither an object nor false", () => {
			expect(() =>
				validateConfig({ host: "h", id: 5 as unknown as false }),
			).toThrow(TypeError);
		});

		test("throws when logger is not a function", () => {
			expect(() =>
				validateConfig({
					host: "h",
					logger: "nope" as unknown as ImapClientConfig["logger"],
				}),
			).toThrow(TypeError);
		});
	});

	describe("default resolution matrix", () => {
		test("tls defaults to 'on', port defaults to 993", () => {
			const resolved = validateConfig({ host: "h" });
			expect(resolved.tls).toBe("on");
			expect(resolved.port).toBe(993);
		});

		test("tls:'starttls' defaults port to 143", () => {
			const resolved = validateConfig({ host: "h", tls: "starttls" });
			expect(resolved.port).toBe(143);
		});

		test("tls:'opportunistic' defaults port to 143", () => {
			const resolved = validateConfig({ host: "h", tls: "opportunistic" });
			expect(resolved.port).toBe(143);
		});

		test("tls:'off' defaults port to 143", () => {
			const resolved = validateConfig({ host: "h", tls: "off" });
			expect(resolved.port).toBe(143);
		});

		test("an explicit port always wins over the tls-based default", () => {
			const resolved = validateConfig({ host: "h", tls: "on", port: 143 });
			expect(resolved.port).toBe(143);
		});

		test("timeouts default per spec §2", () => {
			const resolved = validateConfig({ host: "h" });
			expect(resolved.timeouts).toEqual({
				connect: 10_000,
				greeting: 10_000,
				command: 0,
				idleRenew: 28 * 60_000,
				noopFallbackInterval: 30_000,
			});
		});

		test("a partial timeouts object fills in the rest with defaults", () => {
			const resolved = validateConfig({ host: "h", timeouts: { connect: 5_000 } });
			expect(resolved.timeouts.connect).toBe(5_000);
			expect(resolved.timeouts.greeting).toBe(10_000);
		});

		test("id defaults to undefined (library default), false stays false", () => {
			expect(validateConfig({ host: "h" }).id).toBeUndefined();
			expect(validateConfig({ host: "h", id: false }).id).toBe(false);
			expect(
				validateConfig({ host: "h", id: { name: "custom" } }).id,
			).toEqual({ name: "custom" });
		});

		test("extensions defaults to 'auto'", () => {
			expect(validateConfig({ host: "h" }).extensions).toBe("auto");
		});

		test("compress defaults to 'auto' (M5.9: default flipped false -> 'auto')", () => {
			expect(validateConfig({ host: "h" }).compress).toBe("auto");
		});

		test("compress: false is honored (never negotiates)", () => {
			expect(validateConfig({ host: "h", compress: false }).compress).toBe(false);
		});

		test("maxInlineSize defaults to 1 MiB", () => {
			expect(validateConfig({ host: "h" }).maxInlineSize).toBe(1024 * 1024);
		});

		test("allowInsecureAuth defaults to false", () => {
			expect(validateConfig({ host: "h" }).allowInsecureAuth).toBe(false);
		});
	});

	describe("copy-on-construct immunity", () => {
		test("mutating the original top-level config object after validation has no effect", () => {
			const original: ImapClientConfig = { host: "h", port: 143 };
			const resolved = validateConfig(original);

			original.host = "other";
			original.port = 999;

			expect(resolved.host).toBe("h");
			expect(resolved.port).toBe(143);
		});

		test("mutating the original nested auth object after validation has no effect", () => {
			const auth = { user: "u", pass: "p" };
			const original: ImapClientConfig = { host: "h", auth };
			const resolved = validateConfig(original);

			auth.pass = "changed";
			auth.user = "changed";

			expect(resolved.auth).toEqual({
				user: "u",
				pass: "p",
				accessToken: undefined,
				mechanisms: undefined,
			});
		});

		test("mutating the original nested timeouts object after validation has no effect", () => {
			const timeouts = { connect: 5_000 };
			const original: ImapClientConfig = { host: "h", timeouts };
			const resolved = validateConfig(original);

			timeouts.connect = 1;

			expect(resolved.timeouts.connect).toBe(5_000);
		});

		test("mutating the original nested tlsOptions object after validation has no effect", () => {
			const tlsOptions = { minVersion: "TLSv1.2" as const };
			const original: ImapClientConfig = { host: "h", tlsOptions };
			const resolved = validateConfig(original);

			tlsOptions.minVersion = "TLSv1.3";

			expect(resolved.tlsOptions?.minVersion).toBe("TLSv1.2");
		});

		test("mutating the original nested id object after validation has no effect", () => {
			const id = { name: "custom" };
			const original: ImapClientConfig = { host: "h", id };
			const resolved = validateConfig(original);

			id.name = "changed";

			expect(resolved.id).toEqual({ name: "custom" });
		});

		test("mutating the original extensions array after validation has no effect", () => {
			const extensions = ["UTF8=ACCEPT"];
			const original: ImapClientConfig = { host: "h", extensions };
			const resolved = validateConfig(original);

			extensions.push("QRESYNC");

			expect(resolved.extensions).toEqual(["UTF8=ACCEPT"]);
		});
	});
});
