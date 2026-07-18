// M34 fix (second-review): src/commands/index.ts is the public "Layer-2
// escape hatch" barrel (package.json's "./commands" subpath export, per
// README's own "run(command: Command<T>) ... from @lovely-inbox/imap/
// commands" text) -- every command class should be reachable through it so
// a caller can hand-build one for `client.run()`. `ExpungeCommand` (and, in
// this same territory, `FetchCommand`) were missing even though every other
// sibling command was already exported. This test pins both as importable
// from the barrel so a regression (one of them silently dropping back out)
// fails immediately.
import { describe, expect, test } from "vitest";

import * as commandsBarrel from "../../../src/commands/index";

describe("M34 fix: src/commands/index.ts barrel exports every command class", () => {
	test("ExpungeCommand is importable from the barrel", () => {
		expect(commandsBarrel.ExpungeCommand).toBeDefined();
		expect(typeof commandsBarrel.ExpungeCommand).toBe("function");
	});

	test("FetchCommand is importable from the barrel", () => {
		expect(commandsBarrel.FetchCommand).toBeDefined();
		expect(typeof commandsBarrel.FetchCommand).toBe("function");
	});

	test("a hand-built ExpungeCommand from the barrel constructs successfully (the client.run() escape-hatch use case)", () => {
		const cmd = new commandsBarrel.ExpungeCommand(undefined, false);
		expect(cmd.verb).toBe("EXPUNGE");
	});
});
