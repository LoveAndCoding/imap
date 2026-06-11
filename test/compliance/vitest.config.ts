import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

import ComplianceReporter from "./reporter/compliance-reporter";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	root: here,
	test: {
		include: [
			"specs/**/*.test.ts",
			"harness/__tests__/**/*.test.ts",
			"driver/__tests__/**/*.test.ts",
			"runner/__tests__/**/*.test.ts",
			"reporter/__tests__/**/*.test.ts",
		],
		testTimeout: 15000,
		hookTimeout: 15000,
		reporters: ["default", new ComplianceReporter()],
		// Known client bugs surface as process-level errors during honest
		// compliance failures (tracked in the catalog/report — not suite bugs).
		// Suppress ONLY these signatures; anything else still fails the run.
		onUnhandledError(error: unknown): boolean | void {
			// Normalize: vitest may wrap plain-string rejections as { message, name? }
			const parts: string[] = [String(error)];
			if (error && typeof error === "object") {
				const e = error as Record<string, unknown>;
				if (typeof e["message"] === "string") parts.push(e["message"]);
				if (typeof e["name"] === "string") parts.push(e["name"]);
			}
			const msg = parts.join(" ");
			const known = [
				/ERR_TLS_CERT_ALTNAME_INVALID/,
				/Hostname\/IP does not match certificate/,
				/Command canceled/,
			];
			if (known.some((re) => re.test(msg))) return false;
		},
	},
});
