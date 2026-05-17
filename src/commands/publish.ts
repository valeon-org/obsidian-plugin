import { type App, Notice, type TFile } from "obsidian";
import { ApiError_, type ValeonApi } from "../api/client";
import type { SchemaCache } from "../api/schema-cache";
import { resolveInsideFolder } from "../lib/asset-resolver";
import { collectLocalAssetPaths, rewriteForPush } from "../lib/body-rewriter";
import { type ValeonMeta, parseNote, stringifyNote } from "../lib/frontmatter";
import { lintPost, mimeFromExt } from "../lib/lint";
import { sha256Hex } from "../lib/sha256";
import { slugFromFolder } from "../lib/slug";

/*
 * `Valeon: Publish` — full push pipeline.
 *
 *   1. Parse note (frontmatter + body + valeon meta).
 *   2. Derive slug from folder name.
 *   3. Lint against cached schema/taxonomy. Block on errors.
 *   4. Hash every local asset; upload new ones via API; build
 *      sha256 → storageId map.
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
	});
	const errors = issues.filter((i) => i.severity === "error");
	if (errors.length > 0) {
		new Notice(
			`Valeon: lint failed (${errors.length} error${errors.length === 1 ? "" : "s"}). Run 'Lint post' for details.`,
		);
		return;
	}

	// Resolve assets (body + cover).
	const valeon = parsed.valeon;
	const mediaMap: Record<string, string> = { ...(valeon.media ?? {}) };
	const knownStorageIds = new Set(Object.values(mediaMap));
	const resolverIndex: Record<
		string,
		{
			storageId: string;
			filename: string;
			mimeType: string;
			sha256: string;
		}
	> = {};

	async function ensureUploaded(vaultPath: string): Promise<string | null> {
		const bytes = await app.vault.adapter.readBinary(vaultPath);
		const hash = await sha256Hex(bytes);
		const filename = vaultPath.split("/").pop() ?? vaultPath;
		const ext = filename.split(".").pop()?.toLowerCase();
		const mimeType = mimeFromExt(ext);
		if (!mimeType) {
			throw new Error(`Cannot infer MIME type for ${vaultPath}`);
		}
		let storageId = mediaMap[hash];
		if (!storageId) {
			const { uploadUrl } = await api.uploadUrl();
			storageId = await api.uploadBytes(uploadUrl, bytes, mimeType);
			const finalized = await api.finalize({
				storageId,
				filename,
				mimeType,
				sizeBytes: bytes.byteLength,
				sha256: hash,
			});
			// finalize may return a deduped storageId from a prior upload.
			storageId = finalized.storageId;
			mediaMap[hash] = storageId;
		}
		knownStorageIds.add(storageId);
		resolverIndex[vaultPath] = { storageId, filename, mimeType, sha256: hash };
		return storageId;
	}

	// Cover.
	let coverStorageId: string | undefined = undefined;
	if (parsed.frontmatter.cover) {
		const resolved = resolveInsideFolder(folderPath, parsed.frontmatter.cover);
		if (resolved) {
			coverStorageId = (await ensureUploaded(resolved)) ?? undefined;
		}
	}

	// Inline assets.
	for (const path of collectLocalAssetPaths(parsed.body, folderPath)) {
		await ensureUploaded(path);
	}

	// Rewrite body.
	const transportBody = rewriteForPush(
		parsed.body,
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
				})
			: await api.createPost({
					slug,
					frontmatter: wireFrontmatter,
					markdown: transportBody,
					coverStorageId,
					coverAlt: parsed.frontmatter.coverAlt,
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
