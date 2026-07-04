import { expect, test } from "vitest";

import { allCatalogModules } from "../../catalog";
import { registryCoverage } from "../../catalog/registry-coverage";
import { ianaImapCapabilities } from "../../catalog/iana-snapshot";

// LIVE IANA CROSS-CHECK (design spec §"Registry-coverage checklist", completed at
// the Phase 6 wrap). The committed `iana-snapshot.ts` holds every token from the
// IANA "IMAP Capabilities" registry as of its dated fetch, so the cross-check runs
// deterministically in-suite with no network dependency. These tests assert that
// EVERY registry token is accounted for with an honest status, that every
// `cataloged` entry resolves to a real catalog module that actually carries
// requirements, and structural consistency. Refreshing the snapshot is a
// documented maintenance task (see iana-snapshot.ts / registry-coverage.ts headers).

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

test("every cataloged entry names a module that exists AND carries requirements", () => {
	// Stronger than "source exists": a `cataloged` claim is only honest if the
	// named module actually contains extracted requirements (an empty skeleton
	// does not count as coverage).
	const withReqs = new Map(allCatalogModules.map((m) => [m.source, m.requirements.length]));
	const bad = registryCoverage
		.filter((e) => e.status === "cataloged")
		.filter((e) => {
			const n = e.source ? withReqs.get(e.source) : undefined;
			return n === undefined || n === 0;
		})
		.map((e) => `${e.capability} -> ${e.source ?? "<none>"} (${e.source ? withReqs.get(e.source) ?? "missing" : "no source"})`);
	expect(bad).toEqual([]);
});

test("every non-cataloged registry entry carries an explanatory note", () => {
	// no-client-requirements / obsoleted-by / out-of-scope decisions must be
	// justified in-line so the checklist stays auditable.
	const undocumented = registryCoverage
		.filter((e) => e.status !== "cataloged")
		.filter((e) => !e.note?.trim())
		.map((e) => `${e.capability} (${e.status})`);
	expect(undocumented).toEqual([]);
});

// IMAP capability tokens are case-insensitive by protocol (RFC 3501/9051), and
// the registry renders a few historical names in a different case than this
// checklist uses (e.g. IANA "IMAP4REV1" vs the conventional "IMAP4rev1"). Match
// case-insensitively so the cross-check tracks token identity, not rendering.
const norm = (s: string) => s.toUpperCase();

test("LIVE cross-check: every IANA registry token has a coverage entry", () => {
	// The core completeness guarantee — no IANA "IMAP Capabilities" token is
	// silently dropped. Every snapshot token must appear in registryCoverage.
	const covered = new Set(registryCoverage.map((e) => norm(e.capability)));
	const missing = ianaImapCapabilities
		.map((c) => c.token)
		.filter((token) => !covered.has(norm(token)));
	expect(missing).toEqual([]);
});

test("LIVE cross-check: the snapshot is non-empty and the checklist covers it fully", () => {
	// Guards against an accidentally-empty snapshot silently passing the
	// completeness test above.
	expect(ianaImapCapabilities.length).toBeGreaterThan(50);
	const coveredTokens = new Set(registryCoverage.map((e) => norm(e.capability)));
	const snapshotTokens = new Set(ianaImapCapabilities.map((c) => norm(c.token)));
	const coveredFromSnapshot = [...snapshotTokens].filter((t) => coveredTokens.has(t));
	expect(coveredFromSnapshot.length).toBe(snapshotTokens.size);
});
