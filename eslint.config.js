const js = require("@eslint/js");
const tseslint = require("typescript-eslint");
const prettier = require("eslint-config-prettier");

module.exports = tseslint.config(
	{
		ignores: [
			"dist/**",
			"coverage/**",
			"test/compliance/reports/**",
			"eslint.config.js",
		],
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		// Preserve the pre-existing severity for these two rules: they were
		// "warn" under the old @typescript-eslint v4 recommended config, and
		// v8's recommended config promotes them to "error" by default.
		rules: {
			"@typescript-eslint/no-explicit-any": "warn",
			"@typescript-eslint/no-unused-vars": "warn",
		},
	},
	prettier,
);
