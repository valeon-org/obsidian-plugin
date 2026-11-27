import { type App, Notice, type TFile } from "obsidian";
import type { ValeonApi } from "../api/client";
import type { SchemaCache } from "../api/schema-cache";
import { parseNote, stringifyNote } from "../lib/frontmatter";
import { VoicePickerModal } from "../ui/voice-picker-modal";

/*
 * `Valeon: Choose narration voice` — pick the voice for this post's next
 * narration. Writes (or removes) the `voice:` frontmatter key; the
 * choice reaches the server on the next publish and never starts a
 * narration by itself.
 */
export async function runChooseVoice(args: {
	app: App;
	file: TFile;
	api: ValeonApi;
	cache: SchemaCache;
	save: () => Promise<void>;
}) {
	const { app, file, api, cache, save } = args;
	const list = await api.listNarrationVoices();
	if (!list.available) {
		new Notice("Valeon: Voice list unavailable, try again.");
		return;
	}
	const current = parseNote(await app.vault.read(file)).frontmatter.voice;

	new VoicePickerModal(app, list, current, (choice) => {
		void applyVoice(app, file, choice)
			.then(async () => {
				// Refresh so lint knows a voice just picked from the live list.
				// Lint only warns on unknown voices, so a failure is ignored.
				try {
					await cache.refresh(api);
					await save();
				} catch {
					/* ignore */
				}
			})
			.catch((err: unknown) => {
				new Notice(
					`Valeon: couldn't set the voice — ${err instanceof Error ? err.message : String(err)}`,
				);
			});
	}).open();
}

async function applyVoice(app: App, file: TFile, choice: string | null) {
	// Re-read: the note may have changed while the picker was open.
	const note = parseNote(await app.vault.read(file));
	if (choice === null) note.frontmatter.voice = undefined;
	else note.frontmatter.voice = choice;
	await app.vault.modify(
		file,
		stringifyNote(note.frontmatter, note.valeon, note.body),
	);
	new Notice(
		choice === null
			? "Valeon: Narration voice reset to your default."
			: `Valeon: Narration voice set to ${choice}. It applies to the next narration.`,
	);
}
