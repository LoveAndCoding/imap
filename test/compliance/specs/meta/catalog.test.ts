import { expect, test } from "vitest";

import { allCatalogModules } from "../../catalog";
import { validateCatalog } from "../../catalog/types";

test("catalog modules are schema-valid with unique, stable ids", () => {
	const problems = validateCatalog(allCatalogModules);
	expect(problems).toEqual([]);
});
