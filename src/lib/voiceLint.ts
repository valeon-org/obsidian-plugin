import type { ObsidianFrontmatter, ServerSchema } from "../api/types";
import type { LintIssue } from "./lint";

/**
 * Lint a note's `voice` against the cached schema's voice catalogue.
 * Silent when the schema has no catalogue (older server, or none cached
 * yet). A retired voice is an error (aliases only grow, so the cache
 * cannot be stale here); an unknown one only warns, because the cache
 * refreshes every 24 h and a newly added voice must not block publish.
 */
export function voiceLintIssues(
	frontmatter: Pick<ObsidianFrontmatter, "voice">,
	schema: { voices?: ServerSchema["voices"] },
): LintIssue[] {
	const id = frontmatter.voice;
	const voices = schema.voices;
	if (id === undefined || voices == null) return [];
	const retired = voices.deprecated.find((d) => d.name === id);
	if (retired) {
		return [
			{
				severity: "error",
				field: "voice",
				message: `"${id}" is retired; use "${retired.replacement}".`,
			},
		];
	}
	if (!voices.ids.includes(id)) {
		return [
			{
				severity: "warning",
				field: "voice",
				message: `Unknown voice "${id}" (the server will check it).`,
			},
		];
	}
	return [];
}
