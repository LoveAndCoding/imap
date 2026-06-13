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
