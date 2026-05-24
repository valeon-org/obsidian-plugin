import { type App, Notice, type TFile } from "obsidian";
import type { ValeonApi } from "../api/client";
import { parseNote, stringifyNote } from "../lib/frontmatter";

/*
 * `Valeon: Suggest excerpt` — generate an excerpt from the active note's
 * body and write it into the `excerpt` frontmatter (editable; the author
 * reviews before publishing).
 */
export async function runSuggestExcerpt(args: {
	app: App;
	file: TFile;
	api: ValeonApi;
}) {
	const { app, file, api } = args;

	const parsed = parseNote(await app.vault.read(file));
	if (!parsed.body.trim()) {
		new Notice("Valeon: note has no content to summarize.");
		return;
	}

	new Notice("Valeon: suggesting excerpt…");
	const { excerpt } = await api.suggestExcerpt(parsed.body);

	// Re-read in case the note changed during the call.
	const note = parseNote(await app.vault.read(file));
	note.frontmatter.excerpt = excerpt;
	await app.vault.modify(
		file,
		stringifyNote(note.frontmatter, note.valeon, note.body),
	);

	new Notice("Valeon: excerpt suggested — review before publishing.");
}
