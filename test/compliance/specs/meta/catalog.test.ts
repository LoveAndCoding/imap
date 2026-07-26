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

test("catalog contains the Phase 3 connection & security family sources", () => {
	const sources = allCatalogModules.map((m) => m.source);
	expect(sources).toEqual(
		expect.arrayContaining([
			"RFC8314",
			"RFC2595",
			"RFC7817",
			"RFC4422",
			"RFC4616",
			"RFC2195",
			"RFC7628",
			"XOAUTH2",
			"RFC4959",
			"RFC5161",
			"RFC4978",
			"RFC8437",
			"RFC7888",
			"RFC6855",
		]),
	);
});

test("catalog contains the Phase 4 mailbox/listing/metadata + message-ops family sources", () => {
	const sources = allCatalogModules.map((m) => m.source);
	expect(sources).toEqual(
		expect.arrayContaining([
			"RFC4315",
			"RFC6851",
			"RFC2342",
			"RFC5258",
			"RFC5819",
			"RFC6154",
			"RFC4314",
			"RFC9208",
			"RFC5464",
			"RFC8514",
			"RFC8474",
			"RFC3502",
			"RFC4469",
			"RFC3516",
			"RFC8508",
		]),
	);
});

test("catalog contains the Phase 5 search/sort/sync/events family sources", () => {
	const sources = allCatalogModules.map((m) => m.source);
	expect(sources).toEqual(
		expect.arrayContaining([
			"RFC7162",
			"RFC5256",
			"RFC5957",
			"RFC4731",
			"RFC5267",
			"RFC5182",
			"RFC6203",
			"RFC9394",
			"RFC2177",
			"RFC5465",
			"RFC5466",
			"RFC5032",
		]),
	);
});

test("catalog contains the Phase 6 i18n/misc/vendor family sources", () => {
	const sources = allCatalogModules.map((m) => m.source);
	expect(sources).toEqual(
		expect.arrayContaining([
			"RFC5255",
			"RFC5259",
			"RFC4467",
			"RFC5524",
			"RFC5802",
			"RFC7677",
			"RFC4505",
			"RFC2221",
			"RFC2193",
			"RFC3348",
			"X-GM-EXT-1",
		]),
	);
});

test("catalog contains the Phase 6 reconciliation-delta sources", () => {
	const sources = allCatalogModules.map((m) => m.source);
	expect(sources).toEqual(
		expect.arrayContaining([
			"RFC7889",
			"RFC8438",
			"RFC8440",
			"RFC8970",
			"RFC9585",
		]),
	);
});

test("catalog contains the M2 suite-growth sources", () => {
	// M2.12 (modern-API M2 mailbox-management milestone): RFC 3691 UNSELECT,
	// promoted from the registry-coverage out-of-scope borderline list.
	const sources = allCatalogModules.map((m) => m.source);
	expect(sources).toEqual(expect.arrayContaining(["RFC3691"]));
});

test("catalog contains the M5 suite-growth sources", () => {
	// M5.14 (modern-API M5 extension-families milestone): RFC 9586 UIDONLY,
	// promoted from the registry-coverage out-of-scope borderline list.
	const sources = allCatalogModules.map((m) => m.source);
	expect(sources).toEqual(expect.arrayContaining(["RFC9586"]));
});
