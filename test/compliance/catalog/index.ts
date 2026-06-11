import type { CatalogModule } from "./types";
import rfc2971 from "./rfc2971";
import rfc3501 from "./rfc3501";
import rfc9525 from "./rfc9525";

export const allCatalogModules: CatalogModule[] = [rfc3501, rfc2971, rfc9525];

export function findRequirement(id: string) {
	for (const mod of allCatalogModules) {
		const req = mod.requirements.find((r) => r.id === id);
		if (req) return req;
	}
	return undefined;
}
