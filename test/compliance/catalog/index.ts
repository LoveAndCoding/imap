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

// Phase 4 — mailbox/listing/metadata + message operations (skeletons; extracted in Task 4).
import rfc4315 from "./ext/rfc4315";
import rfc6851 from "./ext/rfc6851";
import rfc2342 from "./ext/rfc2342";
import rfc5258 from "./ext/rfc5258";
import rfc5819 from "./ext/rfc5819";
import rfc6154 from "./ext/rfc6154";
import rfc4314 from "./ext/rfc4314";
import rfc9208 from "./ext/rfc9208";
import rfc5464 from "./ext/rfc5464";
import rfc8514 from "./ext/rfc8514";
import rfc8474 from "./ext/rfc8474";
import rfc3502 from "./ext/rfc3502";
import rfc4469 from "./ext/rfc4469";
import rfc3516 from "./ext/rfc3516";
import rfc8508 from "./ext/rfc8508";

// Phase 5 — search/sort/sync/events (skeletons; extracted in Task 4).
import rfc7162 from "./ext/rfc7162";
import rfc5256 from "./ext/rfc5256";
import rfc5957 from "./ext/rfc5957";
import rfc4731 from "./ext/rfc4731";
import rfc5267 from "./ext/rfc5267";
import rfc5182 from "./ext/rfc5182";
import rfc6203 from "./ext/rfc6203";
import rfc9394 from "./ext/rfc9394";
import rfc2177 from "./ext/rfc2177";
import rfc5465 from "./ext/rfc5465";
import rfc5466 from "./ext/rfc5466";
import rfc5032 from "./ext/rfc5032";

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
	// Phase 4 — mailbox/listing/metadata + message operations
	rfc4315,
	rfc6851,
	rfc2342,
	rfc5258,
	rfc5819,
	rfc6154,
	rfc4314,
	rfc9208,
	rfc5464,
	rfc8514,
	rfc8474,
	rfc3502,
	rfc4469,
	rfc3516,
	rfc8508,
	// Phase 5 — search/sort/sync/events
	rfc7162,
	rfc5256,
	rfc5957,
	rfc4731,
	rfc5267,
	rfc5182,
	rfc6203,
	rfc9394,
	rfc2177,
	rfc5465,
	rfc5466,
	rfc5032,
];

export function findRequirement(id: string) {
	for (const mod of allCatalogModules) {
		const req = mod.requirements.find((r) => r.id === id);
		if (req) return req;
	}
	return undefined;
}
