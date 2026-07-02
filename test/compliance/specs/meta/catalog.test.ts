import { expect, test } from "vitest";

import { allCatalogModules } from "../../catalog";
import { validateCatalog } from "../../catalog/types";

test("catalog modules are schema-valid with unique, stable ids", () => {
	const problems = validateCatalog(allCatalogModules);
	expect(problems).toEqual([]);
});

test("catalog contains the Phase 0 seed modules", () => {
	const sources = allCatalogModules.map((m) => m.source);
	expect(sources).toEqual(expect.arrayContaining(["RFC3501", "RFC2971", "RFC9525", "RFC9051"]));
});

test("catalog contains the Phase 3 connection & security family sources", () => {
	const sources = allCatalogModules.map((m) => m.source);
	expect(sources).toEqual(
		expect.arrayContaining([
			"RFC8314",
			"RFC2595",
			"RFC7817",
			"RFC4422",
			"RFC4616",
			"RFC2195",
			"RFC7628",
			"XOAUTH2",
			"RFC4959",
			"RFC5161",
			"RFC4978",
			"RFC8437",
			"RFC7888",
			"RFC6855",
		]),
	);
});
