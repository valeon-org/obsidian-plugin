import { type App, Notice, type TFile } from "obsidian";
import type { ValeonApi } from "../api/client";
import { parseNote, stringifyNote } from "../lib/frontmatter";

/*
 * `Valeon: Suggest tags` — suggest tags from the active note's body and
 * merge the suggested slugs into the `tags` frontmatter (editable; the
 * author reviews before publishing). Existing tags are preserved and
 * ordered first; new suggestions are appended, de-duplicated.
 */
export async function runSuggestTags(args: {
	app: App;
	file: TFile;
	api: ValeonApi;
}) {
	const { app, file, api } = args;

	const parsed = parseNote(await app.vault.read(file));
	if (!parsed.body.trim()) {
		new Notice("Valeon: note has no content to tag.");
		return;
	}

	const title = parsed.frontmatter.title ?? file.basename;
	const currentTags = parsed.frontmatter.tags ?? [];

	new Notice("Valeon: suggesting tags…");
	const result = await api.suggestTags(title, parsed.body, currentTags);

	const suggestedSlugs = [
		...result.existing.map((e) => e.slug),
		...result.new.map((n) => n.slug),
	];

	// Re-read in case the note changed during the call.
	const note = parseNote(await app.vault.read(file));
	const base = note.frontmatter.tags ?? [];
	const merged: string[] = [];
	const seen = new Set<string>();
	for (const slug of [...base, ...suggestedSlugs]) {
		if (!seen.has(slug)) {
			seen.add(slug);
			merged.push(slug);
		}
	}
	const added = merged.length - new Set(base).size;

	note.frontmatter.tags = merged;
	await app.vault.modify(
		file,
		stringifyNote(note.frontmatter, note.valeon, note.body),
	);

	new Notice(
		`Valeon: tags suggested (${added} added) — review before publishing.`,
	);
}
