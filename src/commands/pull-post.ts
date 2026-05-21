import { type App, Notice, type TFile } from "obsidian";
import type { ValeonApi } from "../api/client";
import type { FetchResponse } from "../api/types";
import { rewriteForPull } from "../lib/body-rewriter";
import { detectConflict } from "../lib/conflict";
import { rewriteCrossPostForPull } from "../lib/cross-post-refs";
import { type ValeonMeta, parseNote, stringifyNote } from "../lib/frontmatter";
import { extFromMime } from "../lib/lint";
import { sha256Hex } from "../lib/sha256";
import { type ConflictChoice, ConflictModal } from "../ui/conflict-modal";

/*
 * Pull flow: bring remote content into the local note.
 *
 *   include='draft' picks the draft buffer when present; 'published'
 *   picks the live row; 'both' (default) prefers draft.
 *
 * Conflict policy when local has unpushed edits:
 *   - 'auto-backup' (used by Sync vault): write a backup file, then
 *     overwrite.
 *   - 'prompt' (used by single-post pull): show the conflict modal.
 */

export type PullOptions = {
	include: "published" | "draft" | "both";
	conflictPolicy: "prompt" | "auto-backup";
};

export type PullOutcome =
	| { kind: "pulled" }
	| { kind: "up-to-date" }
	| { kind: "cancelled" }
	| { kind: "skipped"; reason: string };

export async function pullCurrentFile(args: {
	app: App;
	file: TFile;
	api: ValeonApi;
	options: PullOptions;
}): Promise<PullOutcome> {
	const { app, file, api, options } = args;
	const raw = await app.vault.read(file);
	const parsed = parseNote(raw);
	if (!parsed.valeon.postId) {
		new Notice("Valeon: not a linked post.");
		return { kind: "skipped", reason: "Not linked." };
	}

	const response = await api.fetchPost(parsed.valeon.postId, options.include);

	// Figure out which source applyPull will actually use so the
	// conflict detector can decide whether the prior-sync timestamp is
	// even comparable.
	const effectiveSource: "published" | "draft" =
		(options.include === "draft" || options.include === "both") &&
		response.draftBuffer
			? "draft"
			: "published";

	const localBodyHash = await sha256Hex(parsed.body);
	const decision = detectConflict({
		valeon: parsed.valeon,
		localBodyHash,
		remoteUpdatedAt: response.updatedAt,
		currentSource: effectiveSource,
	});
	if (decision.kind === "no-remote-changes") {
		return { kind: "up-to-date" };
	}

	if (decision.kind === "conflict") {
		const choice = await resolveConflict(
			app,
			file.path,
			options.conflictPolicy,
		);
		if (choice === "cancel") return { kind: "cancelled" };
		if (choice === "backup") {
			await writeBackup(app, file, raw);
		}
		// 'force' = no backup, just overwrite.
	}

	await applyPull(app, api, file, parsed.valeon, response, effectiveSource);
	return { kind: "pulled" };
}

async function resolveConflict(
	app: App,
	filePath: string,
	policy: "prompt" | "auto-backup",
): Promise<ConflictChoice> {
	if (policy === "auto-backup") return "backup";
	return new Promise((resolve) => {
		new ConflictModal(app, filePath, resolve).open();
	});
}

async function writeBackup(app: App, file: TFile, raw: string): Promise<void> {
	const ts = new Date().toISOString().replace(/[:.]/g, "-");
	const dir = file.parent?.path ?? "";
	const base = file.basename;
	const path = dir
		? `${dir}/${base}.local-backup-${ts}.md`
		: `${base}.local-backup-${ts}.md`;
	await app.vault.create(path, raw);
}

async function applyPull(
	app: App,
	api: ValeonApi,
	file: TFile,
	prevValeon: ValeonMeta,
	response: FetchResponse,
	effectiveSource: "published" | "draft",
) {
	const source =
		effectiveSource === "draft" && response.draftBuffer
			? response.draftBuffer
			: response.published;
	if (!source) {
		new Notice("Valeon: no content available on remote.");
		return;
	}

	const folderPath = file.parent?.path ?? "";

	// Build a sha256 → local-path index over the post folder + ./assets/
	// so we can reuse byte-identical files instead of re-downloading. Cheap
	// for typical post folders (cover + a handful of inline assets).
	const localSha256Index = await buildLocalSha256Index(app, folderPath);

	// Download any media we don't have locally.
	const mediaMap: Record<string, string> = { ...(prevValeon.media ?? {}) };
	const storageToFilename: Record<string, string> = {};
	for (const ref of response.mediaRefs) {
		// Dedup: same bytes already on disk → reuse the local path. Avoids
		// the 1-2 MB cover re-download on every Pull post of an unchanged
		// post, and keeps the frontmatter cover ref stable.
		if (ref.sha256) {
			const localPath = localSha256Index.get(ref.sha256);
			if (localPath) {
				storageToFilename[ref.storageId] = localPath;
				mediaMap[ref.sha256] = ref.storageId;
				continue;
			}
		}
		// Download.
		const isCover = isCoverStorage(response.coverStorageId, ref.storageId);
		const subdir = isCover ? folderPath : `${folderPath}/assets`;
		if (!(await app.vault.adapter.exists(subdir))) {
			await app.vault.createFolder(subdir);
		}
		// Covers always land at `cover.<ext>` to match restore-vault's
		// naming convention; without this the cover frontmatter ref
		// churns between pulls (pickLocalFilename uses whatever name the
		// server's media row stored, often a generated `post-cover-{id}`
		// from the dashboard upload form).
		const filename = isCover
			? `cover.${extFromMime(ref.mimeType)}`
			: pickLocalFilename(ref.filename, ref.mimeType, subdir);
		const bytes = await api.downloadMedia(ref.storageId);
		const path = `${subdir}/${filename}`;
		await app.vault.adapter.writeBinary(path, bytes);
		storageToFilename[ref.storageId] = path;
		if (ref.sha256) mediaMap[ref.sha256] = ref.storageId;
	}

	// Rewrite the markdown body. Two passes — assets first
	// (/m/{storageId} → ./assets/filename), then cross-post refs
	// (valeon:post:{id} → ../folder/post.md or canonical URL).
	// Passes operate on disjoint URL spaces; order doesn't matter
	// for correctness.
	const assetRewritten = rewriteForPull(source.markdown, (storageId) => {
		const path = storageToFilename[storageId];
		if (!path) return null;
		if (path.startsWith(`${folderPath}/`)) {
			return `./${path.slice(folderPath.length + 1)}`;
		}
		return null;
	});
	const localBody = await rewriteCrossPostForPull(
		assetRewritten,
		app.vault,
		api,
	);

	// Construct the new frontmatter. Server's frontmatter is canonical;
	// preserve the local cover path if we had one (we don't store
	// /m/{...} in cover locally).
	const frontmatter = { ...source.frontmatter };
	const coverPath = response.coverStorageId
		? storageToFilename[response.coverStorageId]
		: undefined;
	if (coverPath?.startsWith(`${folderPath}/`)) {
		frontmatter.cover = `./${coverPath.slice(folderPath.length + 1)}`;
	}

	const nextValeon: ValeonMeta = {
		...prevValeon,
		postId: response.postId,
		publishedAt: response.publishedAt
			? new Date(response.publishedAt).toISOString()
			: prevValeon.publishedAt,
		lastPushedAt: new Date().toISOString(),
		lastPushedBodyHash: await sha256Hex(localBody),
		remoteUpdatedAt: new Date(response.updatedAt).toISOString(),
		lastSyncedFrom: effectiveSource,
		media: mediaMap,
	};

	const next = stringifyNote(frontmatter, nextValeon, localBody);
	await app.vault.modify(file, next);
}

function isCoverStorage(cover: string | undefined, storageId: string): boolean {
	return cover === storageId;
}

function pickLocalFilename(
	preferred: string,
	mimeType: string,
	dir: string,
): string {
	const ext = extFromMime(mimeType);
	const base =
		preferred.replace(/^.*\//, "").replace(/[^A-Za-z0-9._-]+/g, "-") ||
		`asset.${ext}`;
	// Don't bother with collision avoidance — Obsidian's vault.adapter
	// will overwrite. Filenames coming from the media table are stable.
	return base.includes(".") ? base : `${base}.${ext}`;
}

/**
 * Walk the post folder + ./assets/ subfolder, compute sha256 of each
 * file, and return a `sha256 → vault-path` index. Used by the pull
 * dedup pass to reuse byte-identical local files instead of
 * re-downloading.
 *
 * Cheap in practice: covers + a handful of inline assets per post.
 * Unreadable files (permission, broken symlink) are skipped.
 */
async function buildLocalSha256Index(
	app: App,
	folderPath: string,
): Promise<Map<string, string>> {
	const out = new Map<string, string>();
	if (!folderPath) return out;
	for (const dir of [folderPath, `${folderPath}/assets`]) {
		if (!(await app.vault.adapter.exists(dir))) continue;
		const list = await app.vault.adapter.list(dir);
		for (const filePath of list.files) {
			try {
				const bytes = await app.vault.adapter.readBinary(filePath);
				const hash = await sha256Hex(bytes);
				out.set(hash, filePath);
			} catch {
				// Unreadable file — skip and let the download path handle it.
			}
		}
	}
	return out;
}
