export type Profile = "rev1" | "rev2";

export type Rfc2119Level = "MUST" | "MUST NOT" | "SHOULD" | "SHOULD NOT" | "MAY";

export interface SpecRequirement {
	/** `${source}-${section}-${ordinal}` — append-only, never renumbered. */
	id: string;
	/** e.g. 'RFC3501', 'RFC2971', 'XOAUTH2', 'X-GM-EXT-1' */
	source: string;
	/** RFC section, e.g. '6.2.1' */
	section: string;
	/** Short paraphrase for reports. */
	title: string;
	/** Verbatim normative sentence(s) from the spec. */
	text: string;
	level: Rfc2119Level;
	/** 'conditional' = binds only if the client uses the feature. */
	applicability: "always" | "conditional";
	profiles: Profile[];
	testability: "testable" | "untestable";
	/** Required when testability === 'untestable'. */
	untestableRationale?: string;
	/**
	 * Shared-theme tag for untestable entries. The canonical, append-only
	 * taxonomy lives in docs/superpowers/specs/2026-06-12-untestability-themes.md
	 * — consult it before tagging; propose new themes there, not ad hoc.
	 * Required whenever testability === 'untestable'.
	 */
	untestableTheme?: string;
	/** e.g. judgment call on a lowercase-keyword pre-8174 sentence. */
	notes?: string;
}

export interface CatalogModule {
	source: string;
	requirements: SpecRequirement[];
	/** Sections reviewed + sections with no client-binding requirements. */
	extractionNote: string;
}

const LEVELS: ReadonlySet<string> = new Set([
	"MUST",
	"MUST NOT",
	"SHOULD",
	"SHOULD NOT",
	"MAY",
]);
const PROFILES: ReadonlySet<string> = new Set(["rev1", "rev2"]);

export function validateCatalog(modules: CatalogModule[]): string[] {
	const problems: string[] = [];
	const seenIds = new Set<string>();

	for (const mod of modules) {
		if (!mod.source) problems.push("module with empty source");
		if (!mod.extractionNote || mod.extractionNote.trim().length < 20) {
			problems.push(`${mod.source}: extractionNote missing or too thin`);
		}
		for (const req of mod.requirements) {
			const where = req.id || `${mod.source}-<missing id>`;
			if (seenIds.has(req.id)) problems.push(`duplicate id: ${req.id}`);
			seenIds.add(req.id);
			if (req.source !== mod.source) {
				problems.push(`${where}: source '${req.source}' != module '${mod.source}'`);
			}
			if (!req.id.startsWith(`${req.source}-${req.section}-`)) {
				problems.push(`${where}: id must be '<source>-<section>-<ordinal>'`);
			}
			if (!/^[1-9]\d*$/.test(req.id.slice(`${req.source}-${req.section}-`.length))) {
				problems.push(`${where}: ordinal must be a positive integer`);
			}
			if (!req.section.trim()) problems.push(`${where}: empty section`);
			if (!req.title.trim()) problems.push(`${where}: empty title`);
			if (!req.text.trim()) problems.push(`${where}: empty text`);
			if (!LEVELS.has(req.level)) problems.push(`${where}: bad level '${req.level}'`);
			if (req.applicability !== "always" && req.applicability !== "conditional") {
				problems.push(`${where}: bad applicability`);
			}
			if (!req.profiles.length || req.profiles.some((p) => !PROFILES.has(p))) {
				problems.push(`${where}: bad profiles [${req.profiles.join(",")}]`);
			}
			if (req.testability === "untestable" && !req.untestableRationale?.trim()) {
				problems.push(`${where}: untestable without rationale`);
			}
			if (req.testability === "untestable" && !req.untestableTheme?.trim()) {
				problems.push(`${where}: untestable without untestableTheme`);
			}
			if (req.testability === "testable" && req.untestableTheme) {
				problems.push(`${where}: untestableTheme on a testable entry`);
			}
			if (req.testability !== "testable" && req.testability !== "untestable") {
				problems.push(`${where}: bad testability`);
			}
		}
	}
	return problems;
}
