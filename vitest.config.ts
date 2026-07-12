import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		clearMocks: true,
		include: [
			"test/unit/**/*.test.ts",
			"test/integration/**/*.test.ts",
			"test/e2e/**/*.test.ts",
		],
		coverage: {
			provider: "v8",
			reporter: ["lcov"],
			reportsDirectory: "coverage",
			exclude: ["node_modules/**", "test/**"],
			// Jest always wrote a coverage report regardless of test
			// failures; vitest defaults to skipping it on failure, which
			// would silently starve the CI Coveralls step.
			reportOnFailure: true,
		},
	},
});
