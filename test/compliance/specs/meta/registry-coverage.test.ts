import { expect, test } from "vitest";

import { allCatalogModules } from "../../catalog";
import { registryCoverage } from "../../catalog/registry-coverage";

// DOCUMENTED CHOICE (design spec §"Registry-coverage checklist"): the live IANA
// cross-check — asserting that EVERY registry entry appears in registryCoverage —
// is deferred to the Phase 6 completion task, which can fetch the registry
// snapshot deterministically as part of its dedicated scope. In-suite tests do
// NOT reach the network, so here we assert INTERNAL CONSISTENCY only: structural
// validity, no duplicate capability, and that every `cataloged` entry resolves to
// a real catalog source. This keeps the checklist trustworthy as it is filled in
// incrementally across Phases 3–5 without a flaky network dependency.

test("registry entries are structurally valid", () => {
	const problems: string[] = [];
	const validStatuses = new Set([
		"cataloged",
		"no-client-requirements",
		"obsoleted-by",
		"out-of-scope",
	]);
	for (const entry of registryCoverage) {
		if (!entry.capability.trim()) problems.push("entry with empty capability");
		if (!validStatuses.has(entry.status)) {
			problems.push(`${entry.capability}: bad status '${entry.status}'`);
		}
		if (entry.status === "cataloged" && !entry.source?.trim()) {
			problems.push(`${entry.capability}: cataloged without source`);
		}
	}
	expect(problems).toEqual([]);
});

test("no capability is listed more than once", () => {
	const seen = new Set<string>();
	const dups: string[] = [];
	for (const entry of registryCoverage) {
		if (seen.has(entry.capability)) dups.push(entry.capability);
		seen.add(entry.capability);
	}
	expect(dups).toEqual([]);
});

test("every cataloged entry names a source present in allCatalogModules", () => {
	const known = new Set(allCatalogModules.map((m) => m.source));
	const dangling = registryCoverage
		.filter((e) => e.status === "cataloged")
		.filter((e) => !e.source || !known.has(e.source))
		.map((e) => `${e.capability} -> ${e.source ?? "<none>"}`);
	expect(dangling).toEqual([]);
});
