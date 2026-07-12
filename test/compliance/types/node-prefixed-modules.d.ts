/**
 * The repo pins @types/node@12, which predates Node's `node:` specifier
 * prefix, so `import ... from "node:fs"` has no declaration. Runtime is
 * unaffected (Node and esbuild both resolve the prefix natively); these
 * re-export shims exist purely so `tsc -p test/compliance --noEmit`
 * type-checks the suite. Delete this file once @types/node is bumped to a
 * version (>=16) that declares the prefixed specifiers itself.
 */
declare module "node:crypto" {
	export * from "crypto";
}
declare module "node:fs" {
	export * from "fs";
}
declare module "node:net" {
	export * from "net";
}
declare module "node:os" {
	export * from "os";
}
declare module "node:path" {
	export * from "path";
}
declare module "node:tls" {
	export * from "tls";
}
declare module "node:url" {
	export * from "url";
}
