import type { CatalogModule } from "./types";
import rfc2971 from "./rfc2971";
import rfc3501 from "./rfc3501";
import rfc9051 from "./rfc9051";
import rfc9525 from "./rfc9525";

// Phase 3 — connection & security extension family (skeletons; extracted in Task 4).
import rfc8314 from "./ext/rfc8314";
import rfc2595 from "./ext/rfc2595";
import rfc7817 from "./ext/rfc7817";
import rfc4422 from "./ext/rfc4422";
import rfc4616 from "./ext/rfc4616";
import rfc2195 from "./ext/rfc2195";
import rfc7628 from "./ext/rfc7628";
import xoauth2 from "./ext/xoauth2";
import rfc4959 from "./ext/rfc4959";
import rfc5161 from "./ext/rfc5161";
import rfc4978 from "./ext/rfc4978";
import rfc8437 from "./ext/rfc8437";
import rfc7888 from "./ext/rfc7888";
import rfc6855 from "./ext/rfc6855";

export const allCatalogModules: CatalogModule[] = [
	rfc3501,
	rfc2971,
	rfc9525,
	rfc9051,
	// Phase 3 family
	rfc8314,
	rfc2595,
	rfc7817,
	rfc4422,
	rfc4616,
	rfc2195,
	rfc7628,
	xoauth2,
	rfc4959,
	rfc5161,
	rfc4978,
	rfc8437,
	rfc7888,
	rfc6855,
];

export function findRequirement(id: string) {
	for (const mod of allCatalogModules) {
		const req = mod.requirements.find((r) => r.id === id);
		if (req) return req;
	}
	return undefined;
}
