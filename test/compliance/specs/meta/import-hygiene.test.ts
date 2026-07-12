import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const complianceRoot = path.join(here, "..", "..");

function walk(dir: string): string[] {
	const out: string[] = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) out.push(...walk(full));
		else if (entry.name.endsWith(".ts")) out.push(full);
	}
	return out;
}

const IMPORT_RE = /(?:from\s+|require\(\s*|import\(\s*|^import\s+)["']([^"']+)["']/gm;

// The public package surface is the spec §1.1 exports map: "." (src/index),
// "./commands" (src/commands), and "./sasl" (src/sasl). The compliance suite
// may consume exactly those entry points and nothing deeper — deep imports
// would let tests couple to internals the package doesn't ship.
const PUBLIC_ENTRY_RE = /\/src\/(?:index|sasl|commands)$/;

test("compliance suite only touches the client via its public entry points", () => {
	const offenders: string[] = [];
	for (const sub of ["specs", "driver", "runner", "harness", "reporter", "catalog"]) {
		for (const file of walk(path.join(complianceRoot, sub))) {
			const content = fs.readFileSync(file, "utf8");
			for (const m of content.matchAll(IMPORT_RE)) {
				const spec = m[1];
				if (/\/src(\/|$)/.test(spec) && !PUBLIC_ENTRY_RE.test(spec)) {
					offenders.push(`${path.relative(complianceRoot, file)} imports ${spec}`);
				}
			}
		}
	}
	expect(offenders).toEqual([]);
});

test("only the driver imports the client at all", () => {
	const offenders: string[] = [];
	for (const sub of ["specs", "runner", "harness", "reporter", "catalog"]) {
		for (const file of walk(path.join(complianceRoot, sub))) {
			const content = fs.readFileSync(file, "utf8");
			const matches = [...content.matchAll(IMPORT_RE)];
			if (matches.some((m) => PUBLIC_ENTRY_RE.test(m[1]))) {
				offenders.push(path.relative(complianceRoot, file));
			}
		}
	}
	expect(offenders).toEqual([]);
});
