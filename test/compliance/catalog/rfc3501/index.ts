import type { CatalogModule } from "../types";
import * as s2 from "./s2-protocol";
import * as s4 from "./s4-data";
import * as s5 from "./s5-operational";
import * as s6any from "./s6-any-notauth";
import * as s6auth from "./s6-auth";
import * as s6sel from "./s6-selected";
import * as s7 from "./s7-responses";
import * as s9 from "./s9-syntax-security";

const parts = [s2, s4, s5, s6any, s6auth, s6sel, s7, s9];

const rfc3501: CatalogModule = {
	source: "RFC3501",
	extractionNote: parts.map((p) => p.note).join(" "),
	requirements: parts.flatMap((p) => p.requirements),
};

export default rfc3501;
