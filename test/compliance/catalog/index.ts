import type { CatalogModule } from "./types";

// Modules are added as catalog extraction lands (rfc3501 etc. in Task 9).
export const allCatalogModules: CatalogModule[] = [];

export function findRequirement(id: string) {
	for (const mod of allCatalogModules) {
		const req = mod.requirements.find((r) => r.id === id);
		if (req) return req;
	}
	return undefined;
}
