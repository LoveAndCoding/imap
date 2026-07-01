import type { CatalogModule } from "../types";
import * as s2 from "./s2-protocol";
import * as s4 from "./s4-data";
import * as s5 from "./s5-operational";
import * as s6any from "./s6-any-notauth";
import * as s6authA from "./s6-auth-a";
import * as s6authB from "./s6-auth-b";
import * as s6sel from "./s6-selected";
import * as s7a from "./s7-responses-a";
import * as s7b from "./s7-responses-b";
import * as s9 from "./s9-syntax-security";
import * as sA from "./sA-appendices";

const parts = [s2, s4, s5, s6any, s6authA, s6authB, s6sel, s7a, s7b, s9, sA];

const rfc9051: CatalogModule = {
	source: "RFC9051",
	extractionNote: parts.map((p) => p.note).join(" "),
	requirements: parts.flatMap((p) => p.requirements),
};

export default rfc9051;
