import { describe, expect, test } from "vitest";

import { renderMarkdown } from "../render";
import type { ComplianceReportData } from "../aggregate";

// Fix 2: test that titles/texts with pipes and newlines are safely escaped in Markdown table output.
const dataWithPipesAndNewlines: ComplianceReportData = {
	requirements: [
		{
			req: {
				id: "RFCTEST-1.1-1",
				source: "RFCTEST",
				section: "1.1",
				title: "title with | pipe and\nnewline",
				text: "The client MUST do A | B and\nalso C.",
				level: "MUST",
				applicability: "always",
				profiles: ["rev1"],
				testability: "testable",
			},
			byProfile: {
				rev1: {
					status: "fail",
					failureKind: "violation",
					tests: ["some test"],
				},
			},
		},
		{
			req: {
				id: "RFCTEST-1.2-1",
				source: "RFCTEST",
				section: "1.2",
				title: "untestable with | rationale",
				text: "The client MUST NOT do internal things.",
				level: "MUST NOT",
				applicability: "always",
				profiles: ["rev1"],
				testability: "untestable",
				untestableRationale: "not observable | at the protocol\nlayer",
			},
			byProfile: {
				rev1: {
					status: "untestable",
					tests: [],
				},
			},
		},
	],
	summary: [
		{
			source: "RFCTEST",
			profile: "rev1",
			level: "MUST",
			counts: { pass: 0, violation: 1, unimplemented: 0, untested: 0, untestable: 0 },
			score: 0,
		},
		{
			source: "RFCTEST",
			profile: "rev1",
			level: "MUST NOT",
			counts: { pass: 0, violation: 0, unimplemented: 0, untested: 0, untestable: 1 },
			score: null,
		},
	],
	problems: [],
};

describe("renderMarkdown", () => {
	test("table rows: no raw unescaped pipe characters survive from title or text content", () => {
		const md = renderMarkdown(dataWithPipesAndNewlines);
		const lines = md.split("\n");

		// Find requirement table rows (lines after the requirements header separator).
		// A valid Markdown table data row starts and ends with `|`.
		const reqTableRows = lines.filter((line, i) => {
			// Skip header and separator lines in the requirements section
			return (
				line.startsWith("|") &&
				!line.startsWith("|---") &&
				line.includes("RFCTEST-1.1-1")
			);
		});

		// There should be exactly one row for RFCTEST-1.1-1.
		expect(reqTableRows.length).toBe(1);
		const row = reqTableRows[0];

		// The row must not contain raw newlines (already excluded by splitting on \n),
		// and the title's "|" must be escaped as "\|", not raw "|" that would break the table.
		// Split by unescaped `|` (not preceded by `\`): if the pipe from the title were raw,
		// we'd see extra columns beyond the expected 6 (| id—title | level | profile | status | detail |).
		// Count unescaped pipes: replace escaped ones first.
		const withEscapedPipesRemoved = row.replace(/\\\|/g, "");
		const unescapedPipeCount = (withEscapedPipesRemoved.match(/\|/g) ?? []).length;

		// A valid row with 5 columns has exactly 6 unescaped pipes (one at each boundary).
		expect(unescapedPipeCount).toBe(6);
	});

	test("table rows: no raw unescaped pipe in untestable rationale", () => {
		const md = renderMarkdown(dataWithPipesAndNewlines);
		const lines = md.split("\n");

		const untestableRow = lines.find((line) => line.includes("RFCTEST-1.2-1"));
		expect(untestableRow).toBeDefined();

		const withEscapedPipesRemoved = untestableRow!.replace(/\\\|/g, "");
		const unescapedPipeCount = (withEscapedPipesRemoved.match(/\|/g) ?? []).length;
		expect(unescapedPipeCount).toBe(6);
	});

	test("table rows: newlines in title and text are collapsed to spaces", () => {
		const md = renderMarkdown(dataWithPipesAndNewlines);
		// The rendered markdown should not have embedded literal newlines within a cell value
		// (they would break the table). Since we split on "\n" and check row content, the
		// title "title with | pipe and\nnewline" should appear on a single line with a space.
		const lines = md.split("\n");
		const titleRow = lines.find((line) => line.includes("RFCTEST-1.1-1"));
		expect(titleRow).toBeDefined();
		// "and\nnewline" should have become "and newline" — verify the newline is gone.
		expect(titleRow).toContain("and newline");
		// verify the text newline is also collapsed in the detail cell
		expect(titleRow).toContain("also C");
	});

	test("truncation: appends ellipsis only when text exceeds 160 characters", () => {
		const shortText = "Short requirement text.";
		const longText = "A".repeat(170);

		const makeData = (text: string): ComplianceReportData => ({
			requirements: [
				{
					req: {
						id: "RFCTEST-2.1-1",
						source: "RFCTEST",
						section: "2.1",
						title: "trunc test",
						text,
						level: "MUST",
						applicability: "always",
						profiles: ["rev1"],
						testability: "testable",
					},
					byProfile: {
						rev1: { status: "fail", failureKind: "violation", tests: [] },
					},
				},
			],
			summary: [],
			problems: [],
		});

		const shortMd = renderMarkdown(makeData(shortText));
		const longMd = renderMarkdown(makeData(longText));

		const shortRow = shortMd.split("\n").find((l) => l.includes("RFCTEST-2.1-1"))!;
		const longRow = longMd.split("\n").find((l) => l.includes("RFCTEST-2.1-1"))!;

		// Short text: no ellipsis appended
		expect(shortRow).not.toContain("…");
		// Long text: ellipsis must appear after 160 chars of text
		expect(longRow).toContain("…");
		// Long text: must not include the 161st character 'A' directly before ellipsis
		// (i.e. content is sliced at 160)
		const detailMatch = longRow.match(/violation: (.+?) \|/);
		expect(detailMatch).not.toBeNull();
		const detail = detailMatch![1];
		expect(detail.length).toBeLessThanOrEqual(160 + 1 /* the … char itself */);
	});

	test("pct: score of 0.995 renders as 99%, not 100%", () => {
		const data: ComplianceReportData = {
			requirements: [],
			summary: [
				{
					source: "RFC",
					profile: "rev1",
					level: "MUST",
					counts: { pass: 199, violation: 1, unimplemented: 0, untested: 0, untestable: 0 },
					score: 0.995,
				},
			],
			problems: [],
		};
		const md = renderMarkdown(data);
		// The summary row should show 99%, not 100%.
		expect(md).toContain("99%");
		expect(md).not.toMatch(/\b100%/);
	});
});
