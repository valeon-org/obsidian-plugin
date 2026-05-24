import { type App, Notice, type TFile } from "obsidian";
import type { ValeonApi } from "../api/client";
import { parseNote, stringifyNote } from "../lib/frontmatter";
import {
	GenerateCoverModal,
	type GenerateCoverResult,
} from "../ui/generate-cover-modal";

/*
 * `Valeon: Generate cover with AI` — generate a styled cover for the
 * active note.
 *
 *   1. Fetch the style catalog and open the picker (subject + style +
 *      conditional variant/hue).
 *   2. Call the API to generate (slow, ~10-30s) → storageId.
 *   3. Download the PNG and write it to ./cover.png in the note folder.
 *   4. Set the cover/coverAlt frontmatter. The user publishes as normal;
 *      the existing publish pipeline uploads it (sha256-deduped).
 */
export async function runGenerateCover(args: {
	app: App;
	file: TFile;
	api: ValeonApi;
}) {
	const { app, file, api } = args;

	const folderPath = file.parent?.path ?? "";
	if (!folderPath) {
		new Notice("Valeon: post must live inside a folder.");
		return;
	}

	const { styles } = await api.listCoverStyles();
	if (styles.length === 0) {
		new Notice("Valeon: no cover styles available.");
		return;
	}

	const parsed = parseNote(await app.vault.read(file));
	const defaultSubject =
		parsed.frontmatter.excerpt || parsed.frontmatter.title || "";

	const choice = await new Promise<GenerateCoverResult | null>((resolve) => {
		new GenerateCoverModal(app, styles, defaultSubject, resolve).open();
	});
	if (!choice) return;

	new Notice("Valeon: generating cover (10–30s)…");
	const { storageId } = await api.generateCover(choice);
	const bytes = await api.downloadMedia(storageId);

	// Generated covers are always PNG. Write to ./cover.png, matching the
	// pull flow's cover naming so the frontmatter ref stays stable.
	const coverPath = `${folderPath}/cover.png`;
	await app.vault.adapter.writeBinary(coverPath, bytes);

	// Re-read in case the note changed during the slow generation, then
	// set the cover frontmatter and write back. coverAlt is intentionally
	// left for the author: auto-filling it from the prompt produces
	// inaccurate alt text that silently looks finished.
	const note = parseNote(await app.vault.read(file));
	note.frontmatter.cover = "./cover.png";
	await app.vault.modify(
		file,
		stringifyNote(note.frontmatter, note.valeon, note.body),
	);

	new Notice(
		"Valeon: cover generated → ./cover.png. Add coverAlt before publishing.",
	);
}
