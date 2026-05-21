import { type App, Notice } from "obsidian";
import type { ValeonApi } from "../api/client";
import type { ListedPost, ObsidianFrontmatter } from "../api/types";
import { rewriteForPull } from "../lib/body-rewriter";
import { rewriteCrossPostForPull } from "../lib/cross-post-refs";
import { type ValeonMeta, stringifyNote } from "../lib/frontmatter";
import { extFromMime } from "../lib/lint";
import { sha256Hex } from "../lib/sha256";

/*
 * `Valeon: Restore vault from server` — reconstructs the local vault
 * from the server's published posts. Intended use:
 *
 *   1. Empty the vault (or accept that existing folders are kept).
 *   2. Point the plugin at prod's Convex URL and configure a prod
 *      API token.
 *   3. Run this command. Every post the author can read is fetched;
 *      a `YYYY-MM-DD-{slug}/post.md` folder is created from
 *      `publishedAt + slug`, the cover and inline assets are
 *      downloaded into `./cover.*` and `./assets/`, and the body is
 *      rewritten with local paths.
 *
 * Idempotent: skips posts whose target folder already exists. Run
 * multiple times safely.
 *
 * Drafts (status='draft' / 'submitted' / 'changes_requested') are
 * skipped — they don't have a publishedAt to derive a folder name
 * from, and the published flow is what we're restoring. Archived
 * posts are excluded by default.
 */

type Stats = {
	created: number;
	skipped: number;
	failed: number;
	log: string[];
};

export async function runRestoreVault(args: { app: App; api: ValeonApi }) {
	const { app, api } = args;
	const list = await api.listPosts({ includeArchived: false });
	if (list.posts.length === 0) {
		new Notice("Valeon: server has no posts.");
		return;
	}

	const stats: Stats = { created: 0, skipped: 0, failed: 0, log: [] };

	for (const post of list.posts) {
		try {
			await restoreOne(app, api, post, stats);
		} catch (err) {
			stats.failed++;
			stats.log.push(
				`- ❌ ${post.slug} — ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}

	const reportPath = await writeReport(app, stats);
	new Notice(
		`Valeon: restore complete. Created ${stats.created}, skipped ${stats.skipped}, failed ${stats.failed}. Report: ${reportPath}`,
		10000,
	);
}

async function restoreOne(
	app: App,
	api: ValeonApi,
	post: ListedPost,
	stats: Stats,
) {
	if (post.status !== "published") {
		stats.skipped++;
		stats.log.push(`- ⏭  ${post.slug} (status=${post.status})`);
		return;
	}
	if (!post.publishedAt) {
		stats.skipped++;
		stats.log.push(`- ⏭  ${post.slug} (no publishedAt)`);
		return;
	}

	const date = isoDate(post.publishedAt);
	const folderName = `${date}-${post.slug}`;

	if (await app.vault.adapter.exists(folderName)) {
		stats.skipped++;
		stats.log.push(`- ⏭  ${folderName}/ already exists`);
		return;
	}

	const response = await api.fetchPost(post.postId, "published");
	const source = response.published;
	if (!source) {
		stats.failed++;
		stats.log.push(`- ❌ ${folderName} — server returned no published content`);
		return;
	}

	await app.vault.createFolder(folderName);

	// Download media. Track storageId → local relative path so we can
	// rewrite the body afterwards.
	const mediaMap: Record<string, string> = {};
	const storageToFolderRelPath: Record<string, string> = {};

	for (const ref of response.mediaRefs) {
		const isCover = response.coverStorageId === ref.storageId;
		const subdir = isCover ? folderName : `${folderName}/assets`;
		if (!isCover && !(await app.vault.adapter.exists(subdir))) {
			await app.vault.createFolder(subdir);
		}
		const filename = isCover
			? `cover.${extFromMime(ref.mimeType)}`
			: pickAssetFilename(ref.filename, ref.mimeType);
		const path = `${subdir}/${filename}`;
		const bytes = await api.downloadMedia(ref.storageId);
		await app.vault.adapter.writeBinary(path, bytes);

		const relPath = `./${path.slice(folderName.length + 1)}`;
		storageToFolderRelPath[ref.storageId] = relPath;
		if (ref.sha256) mediaMap[ref.sha256] = ref.storageId;
	}

	// Rewrite the body so /m/{storageId} references point at the local
	// files we just wrote, and `valeon:post:{id}` URIs become either
	// folder-relative paths (for posts already in the vault, which
	// during a full restore means earlier-iteration posts) or canonical
	// blog URLs (for foreign or not-yet-restored posts).
	const assetRewritten = rewriteForPull(source.markdown, (storageId) => {
		return storageToFolderRelPath[storageId] ?? null;
	});
	const body = await rewriteCrossPostForPull(assetRewritten, app.vault, api);

	// Set the top-level `cover` field from the cover's local path if
	// we downloaded one.
	const frontmatter: ObsidianFrontmatter = { ...source.frontmatter };
	if (response.coverStorageId) {
		const coverRel = storageToFolderRelPath[response.coverStorageId];
		if (coverRel) frontmatter.cover = coverRel;
	}

	const valeon: ValeonMeta = {
		postId: response.postId,
		publishedAt: response.publishedAt
			? new Date(response.publishedAt).toISOString()
			: undefined,
		lastPushedAt: new Date().toISOString(),
		lastPushedBodyHash: await sha256Hex(body),
		remoteUpdatedAt: new Date(response.updatedAt).toISOString(),
		lastSyncedFrom: "published",
		media: Object.keys(mediaMap).length > 0 ? mediaMap : undefined,
	};

	const filePath = `${folderName}/post.md`;
	await app.vault.create(filePath, stringifyNote(frontmatter, valeon, body));
	stats.created++;
	stats.log.push(`- ✅ ${filePath}`);
}

function isoDate(ms: number): string {
	const d = new Date(ms);
	const yyyy = d.getUTCFullYear();
	const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
	const dd = String(d.getUTCDate()).padStart(2, "0");
	return `${yyyy}-${mm}-${dd}`;
}

function pickAssetFilename(preferred: string, mimeType: string): string {
	const safe =
		preferred.replace(/^.*\//, "").replace(/[^A-Za-z0-9._-]+/g, "-") || "asset";
	if (safe.includes(".")) return safe;
	return `${safe}.${extFromMime(mimeType)}`;
}

async function writeReport(app: App, stats: Stats): Promise<string> {
	const dir = "_reports";
	if (!(await app.vault.adapter.exists(dir))) {
		await app.vault.createFolder(dir);
	}
	const ts = new Date().toISOString().replace(/[:.]/g, "-");
	const path = `${dir}/valeon-restore-${ts}.md`;
	const content = `# Valeon vault restore — ${new Date().toISOString()}

- Created: ${stats.created}
- Skipped: ${stats.skipped}
- Failed: ${stats.failed}

## Per-post

${stats.log.join("\n") || "_(no posts)_"}
`;
	await app.vault.create(path, content);
	return path;
}
