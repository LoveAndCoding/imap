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

// Phase 6 — i18n + misc + vendor + registry completion (skeletons; extracted in Task 4).
import rfc5255 from "./ext/rfc5255";
import rfc5259 from "./ext/rfc5259";
import rfc4467 from "./ext/rfc4467";
import rfc5524 from "./ext/rfc5524";
import rfc5802 from "./ext/rfc5802";
import rfc7677 from "./ext/rfc7677";
import rfc4505 from "./ext/rfc4505";
import rfc2221 from "./ext/rfc2221";
import rfc2193 from "./ext/rfc2193";
import rfc3348 from "./ext/rfc3348";
import xgmext1 from "./ext/xgmext1";

// Phase 6 — reconciliation-delta sources (registry-discovered tokens with
// genuine client-binding duties; skeletons, extracted in Task 4 alongside
// the scope-table family above).
import rfc7889 from "./ext/rfc7889";
import rfc8438 from "./ext/rfc8438";
import rfc8440 from "./ext/rfc8440";
import rfc8970 from "./ext/rfc8970";
import rfc9585 from "./ext/rfc9585";

// M2 (modern-API milestone 2) — suite growth: RFC 3691 UNSELECT (M2.12),
// promoted from the registry-coverage out-of-scope borderline list (Phase 6).
import rfc3691 from "./ext/rfc3691";

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
	// Phase 6
	rfc5255,
	rfc5259,
	rfc4467,
	rfc5524,
	rfc5802,
	rfc7677,
	rfc4505,
	rfc2221,
	rfc2193,
	rfc3348,
	xgmext1,
	// Phase 6 — reconciliation-delta sources
	rfc7889,
	rfc8438,
	rfc8440,
	rfc8970,
	rfc9585,
	// M2 — suite growth (M2.12)
	rfc3691,
];

export function findRequirement(id: string) {
	for (const mod of allCatalogModules) {
		const req = mod.requirements.find((r) => r.id === id);
		if (req) return req;
	}
	return undefined;
}
