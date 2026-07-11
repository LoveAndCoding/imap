# Review Findings Template

Shared output format for review findings. Used by `review-runner` (per-group
findings) and by `review-orchestrator` (assembling the final cross-group
report). This file is the single source of truth for the format — do not
paste a divergent copy of it into another agent's instructions; reference
this file instead.

## Usage rules

- One `### Finding NNN: {title}` block per finding, in the exact field order
  shown below.
- `NNN` is a zero-padded sequence number (`001`, `002`, ...) that is unique
  *within the document being produced*. `review-runner` numbers findings
  sequentially within its own group's report. `review-orchestrator`
  re-numbers sequentially across the whole assembled report when it merges
  multiple groups' findings — it does not preserve each group's original
  numbering, since those numbers can collide across groups.
- Title is 4-6 words, specific enough to scan in a list (not "Bug in file.ts").
- `Category` is a short free-text label, not a fixed enum — pick whatever
  best describes the finding: `Bug`, `Improvement`, `Gap`, `Uncertainty`,
  `Assumption`, `Security`, `Test Coverage`, etc.
- `Priority` is one of exactly: `Critical`, `High`, `Medium`, `Low`.
- Every field is required. If a field is genuinely not applicable, write
  `N/A` and say why in one clause — never omit the field.

## Format

```
# Review Findings

{One line summary of findings}

## Findings

### Finding 001: {4-6 word title for finding}
**Category:** {Category for the finding; Bug, Improvement, Gap, Uncertainty, Assumption, etc.}
**Priority:** {Suggested priority of addressing this finding: Critical, High, Medium, Low}
**Description:** {Description of the finding}
**Impact:** {Impact of the finding on the changeset and in the codebase}
**Recommendation:** {Recommendation for what action to take as a result of this finding}

### Finding 002: {4-6 word title for finding}
**Category:** {Category for the finding; Bug, Improvement, Gap, Uncertainty, Assumption, etc.}
**Priority:** {Suggested priority of addressing this finding: Critical, High, Medium, Low}
**Description:** {Description of the finding}
**Impact:** {Impact of the finding on the changeset and in the codebase}
**Recommendation:** {Recommendation for what action to take as a result of this finding}

{... Repeat section for each finding ...}
```

If there are zero findings, still emit the `# Review Findings` header and
summary line, followed by `## Findings\n\nNone.` — do not omit the document.
