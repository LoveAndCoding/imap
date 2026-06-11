import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

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
	},
});
