import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test } from "vitest";

import { allCatalogModules } from "../../catalog";
import type { CatalogModule } from "../../catalog/types";

const here = path.dirname(fileURLToPath(import.meta.url));
const catalogDir = path.join(here, "..", "..", "catalog");

// Machinery files in catalog/ that are not CatalogModule definitions.
const NON_MODULE_FILES = new Set([
	"index.ts",
	"types.ts",
	"iana-snapshot.ts",
	"registry-coverage.ts",
]);

/**
 * Every catalog module entry point on disk: top-level `<name>.ts` files,
 * `<name>/index.ts` directories, and everything in `ext/`.
 */
function listCatalogModuleFiles(): string[] {
	const out: string[] = [];
	for (const entry of fs.readdirSync(catalogDir, { withFileTypes: true })) {
		if (entry.isDirectory()) {
			if (entry.name === "ext") {
				for (const f of fs.readdirSync(path.join(catalogDir, "ext"))) {
					if (f.endsWith(".ts")) out.push(path.join(catalogDir, "ext", f));
				}
			} else {
				out.push(path.join(catalogDir, entry.name, "index.ts"));
			}
		} else if (entry.name.endsWith(".ts") && !NON_MODULE_FILES.has(entry.name)) {
			out.push(path.join(catalogDir, entry.name));
		}
	}
	return out;
}

// A catalog file that exists on disk but is missing from allCatalogModules is
// silently unscored: its requirements appear in no report, so a whole source
// can drop out of the scoreboard without any test failing. Enforce that every
// module file's default export is registered, exactly once.
test("every catalog module file on disk is registered in allCatalogModules", async () => {
	const files = listCatalogModuleFiles();
	expect(files.length).toBeGreaterThan(0);

	const registered = new Set<CatalogModule>(allCatalogModules);
	for (const file of files) {
		const imported = (await import(pathToFileURL(file).href)) as {
			default?: CatalogModule;
		};
		expect(imported.default, `${file} has no default CatalogModule export`).toBeDefined();
		expect(
			registered.has(imported.default as CatalogModule),
			`catalog module ${path.relative(catalogDir, file)} is not registered in allCatalogModules`,
		).toBe(true);
	}

	// No duplicates and nothing registered that has no file.
	expect(allCatalogModules.length).toBe(new Set(allCatalogModules).size);
	expect(allCatalogModules.length).toBe(files.length);
});

test("catalog sources are unique", () => {
	const sources = allCatalogModules.map((m) => m.source);
	expect(new Set(sources).size).toBe(sources.length);
});
