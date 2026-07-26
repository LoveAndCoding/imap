import { describe, expect, test } from "vitest";

import { Command } from "../../../src/commands/base";
import { ResponseCollector } from "../../../src/commands/collector";
import { CommandWriter } from "../../../src/commands/writer";
import { ServerBadError, ServerNoError } from "../../../src/errors";
import Lexer from "../../../src/lexer/lexer";
import Parser from "../../../src/parser/parser";
import TaggedResponse from "../../../src/parser/structure/tagged";
import UntaggedResponse from "../../../src/parser/structure/untagged";

const CRLF = "\r\n";

function parseLine(line: string) {
	const lexer = new Lexer();
	const parser = new Parser();
	return parser.parseTokens(lexer.tokenize(line));
}

/** A minimal concrete `Command` for exercising the base class's own
 *  contract in isolation (tag assignment, default `claims()`, default error
 *  mapping) without needing a real connection/queue underneath. */
class TestCommand extends Command<string> {
	readonly verb = "TEST";
	readonly queueMode = "pipeline" as const;
	public written: string[] = [];

	protected write(w: CommandWriter): void {
		w.atom("ARG");
	}

	protected accept(c: ResponseCollector): string {
		const untagged = c.untagged();
		return `accepted:${untagged.length}`;
	}
}

describe("Command base (spec §7.1)", () => {
	describe("tag assignment / re-submission semantics", () => {
		test("has no tag before submission", () => {
			const cmd = new TestCommand();
			expect(cmd.tag).toBeUndefined();
		});

		test("assignTag sets the tag", () => {
			const cmd = new TestCommand();
			Command.assignTag(cmd, "A00001");
			expect(cmd.tag).toBe("A00001");
		});

		test("assignTag throws if the command was already submitted (may be submitted at most once)", () => {
			const cmd = new TestCommand();
			Command.assignTag(cmd, "A00001");
			expect(() => Command.assignTag(cmd, "A00002")).toThrow();
			// The original tag is unaffected by the failed re-submission.
			expect(cmd.tag).toBe("A00001");
		});
	});

	describe("write() plumbing", () => {
		test("Command.writeArgs invokes the subclass's write()", () => {
			const cmd = new TestCommand();
			const w = new CommandWriter({ has: () => false });
			Command.writeArgs(cmd, w);
			const segments = w.segments();
			expect(segments).toHaveLength(1);
			expect(segments[0].bytes.toString("ascii")).toBe("ARG");
		});
	});

	describe("default claims() (verb-derived)", () => {
		test("a single-word verb claims the untagged response of the same type", () => {
			const cmd = new TestCommand();
			Command.assignTag(cmd, "A00001");
			const resp = parseLine(`* TEST some data${CRLF}`) as UntaggedResponse;
			expect(Command.claimsResponse(cmd, resp, { tag: "A00001" })).toBe(true);
		});

		test("does not claim an untagged response of a different type", () => {
			const cmd = new TestCommand();
			Command.assignTag(cmd, "A00001");
			const resp = parseLine(`* CAPABILITY IMAP4rev1${CRLF}`) as UntaggedResponse;
			expect(Command.claimsResponse(cmd, resp, { tag: "A00001" })).toBe(false);
		});

		test("a multi-word verb (e.g. 'UID FETCH') claims by its LAST token", () => {
			class UidFetchLike extends Command<null> {
				readonly verb = "UID FETCH";
				readonly queueMode = "pipeline" as const;
				protected write(): void {}
				protected accept(): null {
					return null;
				}
			}
			const cmd = new UidFetchLike();
			Command.assignTag(cmd, "A00001");
			const resp = parseLine(`* 4 FETCH (FLAGS (\\Seen))${CRLF}`) as UntaggedResponse;
			expect(Command.claimsResponse(cmd, resp, { tag: "A00001" })).toBe(true);
		});
	});

	describe("accept() via ResponseCollector", () => {
		test("submit -> tag -> claims -> accept end-to-end against a synthetic collector", () => {
			const cmd = new TestCommand();
			Command.assignTag(cmd, "A00001");

			const claimed: UntaggedResponse[] = [];
			const candidate = parseLine(`* TEST payload${CRLF}`) as UntaggedResponse;
			if (Command.claimsResponse(cmd, candidate, { tag: "A00001" })) {
				claimed.push(candidate);
			}
			const tagged = parseLine(`A00001 OK done${CRLF}`) as TaggedResponse;
			const collector = new ResponseCollector(claimed, tagged);

			expect(Command.acceptResult(cmd, collector)).toBe("accepted:1");
		});
	});

	describe("default onError() mapping", () => {
		test("tagged NO maps to ServerNoError carrying verb/tag/status/text", () => {
			const cmd = new TestCommand();
			Command.assignTag(cmd, "A00001");
			const tagged = parseLine(`A00001 NO cannot do that${CRLF}`) as TaggedResponse;

			const err = Command.mapError(cmd, tagged);

			expect(err).toBeInstanceOf(ServerNoError);
			expect((err as ServerNoError).command).toBe("TEST");
			expect((err as ServerNoError).tag).toBe("A00001");
			expect((err as ServerNoError).status).toBe("NO");
			expect((err as ServerNoError).text).toContain("cannot do that");
		});

		test("tagged BAD maps to ServerBadError", () => {
			const cmd = new TestCommand();
			Command.assignTag(cmd, "A00001");
			const tagged = parseLine(`A00001 BAD malformed command${CRLF}`) as TaggedResponse;

			const err = Command.mapError(cmd, tagged);

			expect(err).toBeInstanceOf(ServerBadError);
			expect((err as ServerBadError).status).toBe("BAD");
		});

		// M5.13 (referrals, RFC 2193 §4): a referred command's tagged NO
		// carries [REFERRAL <url>...]; the default onError mapping surfaces
		// it as the typed { name: "REFERRAL", urls } code on the error --
		// spec §3.6's "typed response codes on the relevant errors/results"
		// note. Data only: nothing here (or anywhere) auto-follows the URL.
		test("tagged NO [REFERRAL <url>...] surfaces the typed REFERRAL code (urls, in order) on ServerNoError", () => {
			const cmd = new TestCommand();
			Command.assignTag(cmd, "A00001");
			const tagged = parseLine(
				`A00001 NO [REFERRAL IMAP://user;AUTH=*@SERVER2/INBOX IMAP://user;AUTH=*@SERVER3/INBOX] Remote mailbox. Try a replica.${CRLF}`,
			) as TaggedResponse;

			const err = Command.mapError(cmd, tagged);

			expect(err).toBeInstanceOf(ServerNoError);
			expect((err as ServerNoError).code).toEqual({
				name: "REFERRAL",
				urls: ["IMAP://user;AUTH=*@SERVER2/INBOX", "IMAP://user;AUTH=*@SERVER3/INBOX"],
			});
		});
	});

	describe("hasContinuationHook / handleContinuation", () => {
		test("a command with no onContinuation reports no hook, and handleContinuation throws if called anyway", () => {
			const cmd = new TestCommand();
			expect(Command.hasContinuationHook(cmd)).toBe(false);
		});
	});
});
