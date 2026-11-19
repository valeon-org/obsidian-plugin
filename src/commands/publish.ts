import { type App, Notice, type TFile } from "obsidian";
import { ApiError_, type ValeonApi } from "../api/client";
import type { SchemaCache } from "../api/schema-cache";
import { resolveInsideFolder } from "../lib/asset-resolver";
import { collectLocalAssetPaths, rewriteForPush } from "../lib/body-rewriter";
import { rewriteCrossPostForPush } from "../lib/cross-post-refs";
import { parseNote, stringifyNote, type ValeonMeta } from "../lib/frontmatter";
import { lintPost, mimeFromExt } from "../lib/lint";
import { resolveStorageIds } from "../lib/media-cache";
import { onDarkTwinPath, pairOnDarkTwins } from "../lib/on-dark-twins";
import { sha256Hex } from "../lib/sha256";
import { slugFromFolder } from "../lib/slug";

/*
 * `Valeon: Publish` — full push pipeline.
 *
 *   1. Parse note (frontmatter + body + valeon meta).
 *   2. Derive slug from folder name.
 *   3. Lint against cached schema/taxonomy. Block on errors.
 *   4. Hash every local asset; re-check cached ids with the server
 *      and upload new or missing ones; build sha256 → storageId map.
 *   5. Rewrite body (transport copy only) to /m/{storageId}.
 *   6. POST create or update.
 *   7. Write returned IDs + canonical metadata back into the
 *      note's `valeon:` frontmatter block.
 */

export async function runPublish(args: {
	app: App;
	file: TFile;
	api: ValeonApi;
	cache: SchemaCache;
}) {
	const { app, file, api, cache } = args;

	if (!cache.schema || !cache.taxonomy || !cache.whoami) {
		new Notice(
			"Valeon: cache not initialised. Run 'Sync template from server' first.",
		);
		return;
	}

	const folderPath = file.parent?.path ?? "";
	if (!folderPath) {
		new Notice("Valeon: post must live inside a folder.");
		return;
	}
	const folderName = folderPath.split("/").pop() ?? folderPath;
	const slug = slugFromFolder(folderName);

	const raw = await app.vault.read(file);
	const parsed = parseNote(raw);

	// Lint.
	const issues = await lintPost({
		folderPath,
		frontmatter: parsed.frontmatter,
		slug,
		body: parsed.body,
		schema: cache.schema,
		taxonomy: cache.taxonomy,
		vault: app.vault,
		sourceFile: file,
		api,
	});
	const errors = issues.filter((i) => i.severity === "error");
	if (errors.length > 0) {
		new Notice(
			`Valeon: lint failed (${errors.length} error${errors.length === 1 ? "" : "s"}). Run 'Lint post' for details.`,
		);
		return;
	}

	// Resolve assets (body + cover) in three passes: read and hash every
	// file, resolve each hash to a storageId (re-checking cached ids and
	// uploading what's uncached or gone), then index by vault path.
	const valeon = parsed.valeon;

	// Pass 1: collect the cover, inline-asset and on-dark-twin paths.
	// Twins: `./assets/x.on-dark.svg` next to a referenced `./assets/x.svg`.
	// The body never links it, so upload it here and send the pairing —
	// the server can't see `valeon.media`.
	const coverPath = parsed.frontmatter.cover
		? resolveInsideFolder(folderPath, parsed.frontmatter.cover)
		: null;
	const assetPaths = collectLocalAssetPaths(parsed.body, folderPath);
	const twinPaths: Array<[string, string]> = [];
	for (const path of assetPaths) {
		const twin = onDarkTwinPath(path);
		if (twin && (await app.vault.adapter.exists(twin))) {
			twinPaths.push([path, twin]);
		}
	}
	const paths = new Set([
		...(coverPath ? [coverPath] : []),
		...assetPaths,
		...twinPaths.map(([, twin]) => twin),
	]);

	type LocalFile = { filename: string; mimeType: string; sha256: string };
	const files = new Map<string, LocalFile>();
	const bytesByHash = new Map<
		string,
		{ bytes: ArrayBuffer; filename: string; mimeType: string }
	>();
	for (const vaultPath of paths) {
		const bytes = await app.vault.adapter.readBinary(vaultPath);
		const hash = await sha256Hex(bytes);
		const filename = vaultPath.split("/").pop() ?? vaultPath;
		const ext = filename.split(".").pop()?.toLowerCase();
		const mimeType = mimeFromExt(ext);
		if (!mimeType) {
			throw new Error(`Cannot infer MIME type for ${vaultPath}`);
		}
		files.set(vaultPath, { filename, mimeType, sha256: hash });
		if (!bytesByHash.has(hash)) {
			bytesByHash.set(hash, { bytes, filename, mimeType });
		}
	}

	// Pass 2: hash → storageId.
	const mediaMap = await resolveStorageIds({
		hashes: [...bytesByHash.keys()],
		mediaMap: valeon.media ?? {},
		missing: (ids) =>
			api
				.missingMedia(ids, valeon.postId)
				.then((gone) => (gone ? new Set(gone) : null)),
		upload: async (hash) => {
			const file = bytesByHash.get(hash);
			if (!file) throw new Error(`No local file for media ${hash}`);
			const { uploadUrl } = await api.uploadUrl();
			const storageId = await api.uploadBytes(
				uploadUrl,
				file.bytes,
				file.mimeType,
			);
			const finalized = await api.finalize({
				storageId,
				filename: file.filename,
				mimeType: file.mimeType,
				sizeBytes: file.bytes.byteLength,
				sha256: hash,
			});
			// finalize may return a deduped storageId from a prior upload.
			return finalized.storageId;
		},
	});

	// Pass 3: index by vault path.
	const resolverIndex: Record<
		string,
		{
			storageId: string;
			filename: string;
			mimeType: string;
			sha256: string;
		}
	> = {};
	for (const [vaultPath, file] of files) {
		const storageId = mediaMap[file.sha256];
		if (storageId) resolverIndex[vaultPath] = { storageId, ...file };
	}
	const coverStorageId = coverPath
		? resolverIndex[coverPath]?.storageId
		: undefined;
	const onDarkTwins = pairOnDarkTwins(
		twinPaths,
		(path) => resolverIndex[path]?.storageId,
	);

	// Rewrite body. Two passes — cross-post refs first (folder paths
	// and blog URLs → valeon:post:{id} URIs), then assets
	// (/m/{storageId}). The passes operate on disjoint URL spaces.
	const crossPostBody = await rewriteCrossPostForPush(
		parsed.body,
		file,
		app.vault,
		api,
	);
	const transportBody = rewriteForPush(
		crossPostBody,
		folderPath,
		(resolvedVaultPath) => resolverIndex[resolvedVaultPath] ?? null,
	);
	const bodyHash = await sha256Hex(parsed.body);

	// Strip `cover` from frontmatter on the wire — the cover is sent
	// separately as coverStorageId. Strip pubDate/updatedDate (server
	// owns these). Strip valeon block (it's local-only).
	const wireFrontmatter = { ...parsed.frontmatter };
	wireFrontmatter.cover = undefined;

	// Push.
	try {
		const response = valeon.postId
			? await api.updatePost({
					postId: valeon.postId,
					slug,
					frontmatter: wireFrontmatter,
					markdown: transportBody,
					coverStorageId,
					coverAlt: parsed.frontmatter.coverAlt,
					onDarkTwins,
				})
			: await api.createPost({
					slug,
					frontmatter: wireFrontmatter,
					markdown: transportBody,
					coverStorageId,
					coverAlt: parsed.frontmatter.coverAlt,
					onDarkTwins,
				});

		// Write back valeon block.
		const nextValeon: ValeonMeta = {
			...valeon,
			postId: response.postId,
			publishedAt: response.publishedAt
				? new Date(response.publishedAt).toISOString()
				: valeon.publishedAt,
			lastPushedAt: new Date().toISOString(),
			lastPushedBodyHash: bodyHash,
			remoteUpdatedAt: new Date(response.updatedAt).toISOString(),
			lastSyncedFrom: "push",
			schemaVersion: cache.schema.version,
			media: mediaMap,
		};
		const next = stringifyNote(parsed.frontmatter, nextValeon, parsed.body);
		await app.vault.modify(file, next);

		if (response.warnings && response.warnings.length > 0) {
			new Notice(
				`Valeon: published with ${response.warnings.length} warning(s). ${response.warnings.map((w) => `${w.field}: ${w.message}`).join("; ")}`,
				8000,
			);
		} else {
			new Notice(
				`Valeon: ${response.status === "published" ? "published" : "saved"} ${response.slug}`,
			);
		}
	} catch (err) {
		if (err instanceof ApiError_) {
			const detail = err.fields
				?.map((f) => `${f.field}: ${f.message}`)
				.join("; ");
			new Notice(
				`Valeon: publish failed — ${err.message}${detail ? ` (${detail})` : ""}`,
				10000,
			);
		} else {
			new Notice(
				`Valeon: publish failed — ${err instanceof Error ? err.message : String(err)}`,
				10000,
			);
		}
	}
}
