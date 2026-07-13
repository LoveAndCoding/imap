import { describe, expect, test } from "vitest";

import { ResponseCollector, toTypedResponseCode } from "../../../src/commands/collector";
import Lexer from "../../../src/lexer/lexer";
import Parser from "../../../src/parser/parser";
import { StatusResponse } from "../../../src/parser/structure/status";
import TaggedResponse from "../../../src/parser/structure/tagged";
import UntaggedResponse from "../../../src/parser/structure/untagged";

const CRLF = "\r\n";

function parseLine(line: string) {
	const lexer = new Lexer();
	const parser = new Parser();
	return parser.parseTokens(lexer.tokenize(line));
}

/** Extracts the resp-text-code from an untagged "* OK/NO [...] text" line. */
function untaggedCode(line: string) {
	const resp = parseLine(line) as UntaggedResponse;
	const status = resp.content as StatusResponse;
	return status.text?.code;
}

describe("ResponseCollector (spec §7.3)", () => {
	test("untagged() returns every claimed response in arrival order", () => {
		const claimed = [
			parseLine(`* 1 FETCH (FLAGS (\\Seen))${CRLF}`) as UntaggedResponse,
			parseLine(`* 2 FETCH (FLAGS (\\Answered))${CRLF}`) as UntaggedResponse,
		];
		const tagged = parseLine(`A1 OK done${CRLF}`) as TaggedResponse;
		const c = new ResponseCollector(claimed, tagged);

		expect(c.untagged()).toHaveLength(2);
		expect(c.untagged()).toEqual(claimed);
	});

	test("untagged(type) filters by type, case-insensitively normalized", () => {
		const claimed = [
			parseLine(`* CAPABILITY IMAP4rev1${CRLF}`) as UntaggedResponse,
			parseLine(`* 1 EXISTS${CRLF}`) as UntaggedResponse,
		];
		const tagged = parseLine(`A1 OK done${CRLF}`) as TaggedResponse;
		const c = new ResponseCollector(claimed, tagged);

		expect(c.untagged("CAPABILITY")).toEqual([claimed[0]]);
		expect(c.untagged("capability")).toEqual([claimed[0]]);
		expect(c.untagged("EXISTS")).toEqual([claimed[1]]);
		expect(c.untagged("BOGUS")).toEqual([]);
	});

	test("first(type) returns the first match or undefined", () => {
		const claimed = [
			parseLine(`* 1 FETCH (FLAGS (\\Seen))${CRLF}`) as UntaggedResponse,
			parseLine(`* 2 FETCH (FLAGS (\\Answered))${CRLF}`) as UntaggedResponse,
		];
		const tagged = parseLine(`A1 OK done${CRLF}`) as TaggedResponse;
		const c = new ResponseCollector(claimed, tagged);

		expect(c.first("FETCH")).toBe(claimed[0]);
		expect(c.first("SEARCH")).toBeUndefined();
	});

	test("tagged() returns the completing tagged response", () => {
		const tagged = parseLine(`A1 OK done${CRLF}`) as TaggedResponse;
		const c = new ResponseCollector([], tagged);
		expect(c.tagged()).toBe(tagged);
	});

	test("codes() collects typed codes from claimed status responses AND the tagged line, in order", () => {
		const claimed = [
			parseLine(`* OK [PERMANENTFLAGS (\\Seen \\Deleted)] flags${CRLF}`) as UntaggedResponse,
		];
		const tagged = parseLine(`A1 OK [READ-WRITE] done${CRLF}`) as TaggedResponse;
		const c = new ResponseCollector(claimed, tagged);

		const codes = c.codes();
		expect(codes).toHaveLength(2);
		expect(codes[0].name).toBe("PERMANENTFLAGS");
		expect(codes[1].name).toBe("READ-WRITE");
	});

	test("codes() is empty when nothing carries a response code", () => {
		const claimed = [parseLine(`* 1 EXISTS${CRLF}`) as UntaggedResponse];
		const tagged = parseLine(`A1 OK done${CRLF}`) as TaggedResponse;
		const c = new ResponseCollector(claimed, tagged);
		expect(c.codes()).toEqual([]);
	});
});

const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve));

describe("ResponseCollector live/incremental bridge (M3.4, spec §7.3)", () => {
	test("the legacy two-arg constructor is immediately settled -- byte-identical to pre-M3.4 behavior", () => {
		const claimed = [parseLine(`* 1 FETCH (FLAGS (\\Seen))${CRLF}`) as UntaggedResponse];
		const tagged = parseLine(`A1 OK done${CRLF}`) as TaggedResponse;
		const c = new ResponseCollector(claimed, tagged);

		expect(c.settled).toBe(true);
		expect(c.untagged()).toEqual(claimed);
		expect(c.tagged()).toBe(tagged);
	});

	test("live() replays everything already pushed before settle(), in push order, then completes", async () => {
		const a = parseLine(`* 1 FETCH (FLAGS (\\Seen))${CRLF}`) as UntaggedResponse;
		const b = parseLine(`* 2 FETCH (FLAGS (\\Answered))${CRLF}`) as UntaggedResponse;
		const tagged = parseLine(`A1 OK done${CRLF}`) as TaggedResponse;

		const c = new ResponseCollector();
		expect(c.settled).toBe(false);
		c.push(a);
		c.push(b);
		c.settle(tagged);

		const seen: UntaggedResponse[] = [];
		for await (const resp of c.live()) {
			seen.push(resp);
		}
		expect(seen).toEqual([a, b]);
	});

	test("a live() consumer awaiting the next claim resolves the instant push() is called -- BEFORE settle()", async () => {
		const a = parseLine(`* 1 FETCH (FLAGS (\\Seen))${CRLF}`) as UntaggedResponse;
		const c = new ResponseCollector();

		const iter = c.live();
		const pending = iter.next();
		let settledFlag = false;
		void pending.then(() => {
			settledFlag = true;
		});

		// Nothing pushed yet -- the generator must still be suspended.
		await flushMicrotasks();
		await flushMicrotasks();
		expect(settledFlag).toBe(false);
		expect(c.settled).toBe(false);

		c.push(a);
		const result = await pending;
		expect(result).toEqual({ value: a, done: false });
		// Still not settled -- push() alone never settles the collector.
		expect(c.settled).toBe(false);
	});

	test("settle() ends live() once every buffered claim has been yielded, rather than hanging forever", async () => {
		const a = parseLine(`* 1 FETCH (FLAGS (\\Seen))${CRLF}`) as UntaggedResponse;
		const tagged = parseLine(`A1 OK done${CRLF}`) as TaggedResponse;
		const c = new ResponseCollector();
		c.push(a);

		const seen: UntaggedResponse[] = [];
		let finished = false;
		const consuming = (async () => {
			for await (const resp of c.live()) {
				seen.push(resp);
			}
			finished = true;
		})();

		await flushMicrotasks();
		await flushMicrotasks();
		// The one buffered claim was yielded already, but the generator is
		// now blocked awaiting either the next push() or settle().
		expect(seen).toEqual([a]);
		expect(finished).toBe(false);

		c.settle(tagged);
		await consuming;
		expect(finished).toBe(true);
		expect(seen).toEqual([a]);
	});

	test("live(type) filters incrementally, matching untagged(type)'s case-insensitive semantics", async () => {
		const fetchResp = parseLine(`* 1 FETCH (FLAGS (\\Seen))${CRLF}`) as UntaggedResponse;
		const capResp = parseLine(`* CAPABILITY IMAP4rev1${CRLF}`) as UntaggedResponse;
		const tagged = parseLine(`A1 OK done${CRLF}`) as TaggedResponse;

		const c = new ResponseCollector();
		c.push(capResp);
		c.push(fetchResp);
		c.settle(tagged);

		const seen: UntaggedResponse[] = [];
		for await (const resp of c.live("fetch")) {
			seen.push(resp);
		}
		expect(seen).toEqual([fetchResp]);
	});

	test("multiple concurrent live() iterators each independently observe every push (fan-out, not a single-reader queue)", async () => {
		const a = parseLine(`* 1 FETCH (FLAGS (\\Seen))${CRLF}`) as UntaggedResponse;
		const b = parseLine(`* 2 FETCH (FLAGS (\\Answered))${CRLF}`) as UntaggedResponse;
		const tagged = parseLine(`A1 OK done${CRLF}`) as TaggedResponse;

		const c = new ResponseCollector();
		const collectAll = async () => {
			const out: UntaggedResponse[] = [];
			for await (const resp of c.live()) {
				out.push(resp);
			}
			return out;
		};
		const first = collectAll();
		const second = collectAll();

		await flushMicrotasks();
		c.push(a);
		c.push(b);
		c.settle(tagged);

		expect(await first).toEqual([a, b]);
		expect(await second).toEqual([a, b]);
	});

	test("push() after settle() is tolerated, never throws (I-6 tolerance posture)", () => {
		const tagged = parseLine(`A1 OK done${CRLF}`) as TaggedResponse;
		const late = parseLine(`* 9 EXISTS${CRLF}`) as UntaggedResponse;
		const c = new ResponseCollector();
		c.settle(tagged);

		expect(() => c.push(late)).not.toThrow();
		expect(c.untagged()).toEqual([late]);
	});

	test("tagged() throws if called before settle() -- a defensive assertion no shipped accept() can trigger", () => {
		const c = new ResponseCollector();
		expect(() => c.tagged()).toThrow(/tagged response arrived/);
	});

	test("codes() reads whatever has been pushed so far when called before settle() (no tagged-line code yet)", () => {
		const statusResp = parseLine(
			`* OK [PERMANENTFLAGS (\\Seen \\Deleted)] flags${CRLF}`,
		) as UntaggedResponse;
		const c = new ResponseCollector();
		c.push(statusResp);

		const codes = c.codes();
		expect(codes).toHaveLength(1);
		expect(codes[0].name).toBe("PERMANENTFLAGS");
	});
});

describe("toTypedResponseCode (spec §5.5)", () => {
	test("null/undefined code maps to null", () => {
		expect(toTypedResponseCode(undefined)).toBeNull();
		expect(toTypedResponseCode(null)).toBeNull();
	});

	test("an unknown atom code surfaces as { name, args: null } (I-6: never an error)", () => {
		const tagged = parseLine(`A1 OK [SOMENEWCODE] done${CRLF}`) as TaggedResponse;
		const code = toTypedResponseCode(tagged.status.text?.code);
		expect(code).toEqual({ name: "SOMENEWCODE", args: null });
	});

	test("a numeric code without a dedicated variant yet (e.g. UNSEEN) renders its value as args", () => {
		const tagged = parseLine(`A1 OK [UNSEEN 123] done${CRLF}`) as TaggedResponse;
		const code = toTypedResponseCode(tagged.status.text?.code);
		expect(code).toEqual({ name: "UNSEEN", args: "123" });
	});

	// M2.2 (SELECT/EXAMINE): the first typed variants this union grows,
	// exactly the codes that command's response family emits.
	test("UIDVALIDITY/UIDNEXT get a typed numeric `value` field", () => {
		const uidValidity = parseLine(`A1 OK [UIDVALIDITY 42] valid${CRLF}`) as TaggedResponse;
		expect(toTypedResponseCode(uidValidity.status.text?.code)).toEqual({
			name: "UIDVALIDITY",
			value: 42,
		});
		const uidNext = parseLine(`A1 OK [UIDNEXT 4] next${CRLF}`) as TaggedResponse;
		expect(toTypedResponseCode(uidNext.status.text?.code)).toEqual({
			name: "UIDNEXT",
			value: 4,
		});
	});

	test("HIGHESTMODSEQ gets a typed bigint `value` field", () => {
		const tagged = parseLine(`A1 OK [HIGHESTMODSEQ 715194045007] highest${CRLF}`) as TaggedResponse;
		expect(toTypedResponseCode(tagged.status.text?.code)).toEqual({
			name: "HIGHESTMODSEQ",
			value: 715194045007n,
		});
	});

	test("PERMANENTFLAGS carries a typed `flags` array", () => {
		const code = untaggedCode(`* OK [PERMANENTFLAGS (\\Deleted \\Seen \\*)] limited${CRLF}`);
		expect(toTypedResponseCode(code)).toEqual({
			name: "PERMANENTFLAGS",
			flags: ["\\Deleted", "\\Seen", "\\*"],
		});
	});

	test("CLOSED/NOMODSEQ/UIDNOTSTICKY are argument-less typed variants", () => {
		expect(
			toTypedResponseCode(untaggedCode(`* OK [CLOSED] previous mailbox closed${CRLF}`)),
		).toEqual({ name: "CLOSED" });
		expect(
			toTypedResponseCode(untaggedCode(`* OK [NOMODSEQ] no mod-sequences${CRLF}`)),
		).toEqual({ name: "NOMODSEQ" });
		expect(
			toTypedResponseCode(untaggedCode(`* OK [UIDNOTSTICKY] non-permanent${CRLF}`)),
		).toEqual({ name: "UIDNOTSTICKY" });
	});

	test("MAILBOXID carries a typed `value` string", () => {
		const tagged = parseLine(`A1 OK [MAILBOXID (F123abc)] created${CRLF}`) as TaggedResponse;
		expect(toTypedResponseCode(tagged.status.text?.code)).toEqual({
			name: "MAILBOXID",
			value: "F123abc",
		});
	});

	// M2.11 (APPEND): APPENDUID (RFC 4315 UIDPLUS), TOOBIG/BADURL (RFC 4469/7889).
	test("APPENDUID carries typed uidValidity/uid numbers", () => {
		const tagged = parseLine(`A1 OK [APPENDUID 38505 3955] APPEND completed${CRLF}`) as TaggedResponse;
		expect(toTypedResponseCode(tagged.status.text?.code)).toEqual({
			name: "APPENDUID",
			uidValidity: 38505,
			uid: 3955,
			uids: [3955],
		});
	});

	// M3.10 (MULTIAPPEND): a set-valued APPENDUID (RFC 4315 §3's widened
	// `uid-set`, RFC3502-uidplus-1) expands to every appended UID, ascending.
	test("APPENDUID set-valued (MULTIAPPEND) carries the full ascending uids array", () => {
		const tagged = parseLine(
			`A1 OK [APPENDUID 38505 2:4] APPEND completed${CRLF}`,
		) as TaggedResponse;
		expect(toTypedResponseCode(tagged.status.text?.code)).toEqual({
			name: "APPENDUID",
			uidValidity: 38505,
			uid: 2,
			uids: [2, 3, 4],
		});
	});

	test("TOOBIG is an argument-less typed variant", () => {
		const tagged = parseLine(`A1 NO [TOOBIG] Message too large${CRLF}`) as TaggedResponse;
		expect(toTypedResponseCode(tagged.status.text?.code)).toEqual({ name: "TOOBIG" });
	});

	test("BADURL carries the offending URL, quotes stripped", () => {
		const tagged = parseLine(
			`A1 NO [BADURL "/Sent;UIDVALIDITY=385759045/;UID=20"] append failed${CRLF}`,
		) as TaggedResponse;
		expect(toTypedResponseCode(tagged.status.text?.code)).toEqual({
			name: "BADURL",
			url: "/Sent;UIDVALIDITY=385759045/;UID=20",
		});
	});

	// M3.11 (§7 resp-code sweep): MODIFIED (RFC 7162 §3.2.5.1) gets a typed
	// variant so the GENERIC paths (this function, `ResponseCollector.codes()`,
	// `Command`'s `defaultOnError` building `ServerNoError`/`ServerBadError.code`)
	// render the same structured `uids` array that `commands/store.ts`'s own
	// direct `instanceof ModifiedTextCode` read already produces -- MODIFIED
	// previously fell through to the open `{name, args: null}` fallback here,
	// silently losing the failed-message uid-set for every consumer except
	// `StoreCommand.accept()` itself.
	test("MODIFIED carries a typed ascending `uids` array (single uid)", () => {
		const tagged = parseLine(`A1 OK [MODIFIED 7] Conditional STORE failed${CRLF}`) as TaggedResponse;
		expect(toTypedResponseCode(tagged.status.text?.code)).toEqual({
			name: "MODIFIED",
			uids: [7],
		});
	});

	test("MODIFIED expands a mixed range/singleton uid-set, ascending", () => {
		const tagged = parseLine(
			`A1 OK [MODIFIED 2:4,7] Conditional STORE failed${CRLF}`,
		) as TaggedResponse;
		expect(toTypedResponseCode(tagged.status.text?.code)).toEqual({
			name: "MODIFIED",
			uids: [2, 3, 4, 7],
		});
	});

	test("MODIFIED on a tagged NO (defensive/non-conformant-server shape) still renders typed uids", () => {
		// RFC 7162 documents MODIFIED riding a tagged OK for CONDSTORE's
		// partial-failure case; this exercises the code path a
		// `ServerNoError`/`ServerBadError.code` would see if a server ever
		// sent it on a NO/BAD instead -- tolerated data either way (I-6).
		const tagged = parseLine(`A1 NO [MODIFIED 1,3,5] Conditional STORE failed${CRLF}`) as TaggedResponse;
		expect(toTypedResponseCode(tagged.status.text?.code)).toEqual({
			name: "MODIFIED",
			uids: [1, 3, 5],
		});
	});

	// M3.11 sweep: UNKNOWN-CTE (RFC 3516) and EXPUNGEISSUED (RFC 5530) were
	// audited against spec §5.5 and the compliance catalog
	// (test/compliance/catalog/ext/rfc3516.ts, rfc9051/s7-responses-a.ts) and
	// deliberately left WITHOUT a dedicated typed variant: neither carries a
	// structured or client-actionable argument, and each catalog's own
	// adjudication says the client's only duty is to tolerate/ignore the
	// code (RFC 3501/9051 §7.1's "ignore unrecognized response codes").
	// These tests are the evidence that the generic fallback still parses
	// each of them through end-to-end without error.
	test("UNKNOWN-CTE (RFC 3516) is an argument-less generic fallback, not a dedicated variant", () => {
		const tagged = parseLine(`A1 NO [UNKNOWN-CTE] Unknown content-transfer-encoding${CRLF}`) as TaggedResponse;
		expect(toTypedResponseCode(tagged.status.text?.code)).toEqual({
			name: "UNKNOWN-CTE",
			args: null,
		});
	});

	test("EXPUNGEISSUED (RFC 5530) is an argument-less generic fallback, not a dedicated variant", () => {
		const tagged = parseLine(
			`A1 OK [EXPUNGEISSUED] Messages expunged by another session${CRLF}`,
		) as TaggedResponse;
		expect(toTypedResponseCode(tagged.status.text?.code)).toEqual({
			name: "EXPUNGEISSUED",
			args: null,
		});
	});
});
