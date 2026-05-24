import { type App, Notice, type TFile } from "obsidian";
import type { ValeonApi } from "../api/client";
import { resolveInsideFolder } from "../lib/asset-resolver";
import { parseNote, stringifyNote } from "../lib/frontmatter";
import { mimeFromExt } from "../lib/lint";
import { sha256Hex } from "../lib/sha256";

/*
 * `Valeon: Suggest cover alt text` — run a vision pass over the active
 * note's cover image and write the suggestion into `coverAlt` (editable;
 * the author reviews). The cover is uploaded to obtain a storageId for the
 * vision call; the upload is sha256-deduped against the eventual publish.
 */
export async function runSuggestCoverAlt(args: {
	app: App;
	file: TFile;
	api: ValeonApi;
}) {
	const { app, file, api } = args;

	const folderPath = file.parent?.path ?? "";
	const parsed = parseNote(await app.vault.read(file));
	const cover = parsed.frontmatter.cover;
	if (!cover) {
		new Notice("Valeon: set a cover image first.");
		return;
	}
	const resolved = resolveInsideFolder(folderPath, cover);
	if (!resolved || !(await app.vault.adapter.exists(resolved))) {
		new Notice(`Valeon: cover image not found: ${cover}`);
		return;
	}
	const filename = resolved.split("/").pop() ?? "cover";
	const mimeType = mimeFromExt(filename.split(".").pop()?.toLowerCase());
	if (!mimeType) {
		new Notice(`Valeon: unsupported cover type for ${filename}.`);
		return;
	}

	new Notice("Valeon: suggesting cover alt text…");
	const bytes = await app.vault.adapter.readBinary(resolved);
	const { uploadUrl } = await api.uploadUrl();
	const storageId = await api.uploadBytes(uploadUrl, bytes, mimeType);
	const finalized = await api.finalize({
		storageId,
		filename,
		mimeType,
		sizeBytes: bytes.byteLength,
		sha256: await sha256Hex(bytes),
	});
	const { alt } = await api.suggestCoverAlt(finalized.storageId);

	const note = parseNote(await app.vault.read(file));
	note.frontmatter.coverAlt = alt;
	await app.vault.modify(
		file,
		stringifyNote(note.frontmatter, note.valeon, note.body),
	);

	new Notice("Valeon: cover alt suggested — review before publishing.");
}
