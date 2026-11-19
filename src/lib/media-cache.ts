/*
 * Cached media ids (`valeon.media`, sha256 → storageId).
 *
 * A cached id can outlive its blob: the dashboard deletes unused media,
 * and a vault synced from another author's machine carries ids that
 * aren't this author's. Publish therefore re-checks the cached ids it is
 * about to reuse and re-uploads any the server reports missing.
 *
 * No pruning: once ids are checked before reuse, stale entries for
 * files this publish doesn't touch are harmless, and dropping them would
 * make a re-added file upload again and orphan a blob.
 *
 * No runtime imports, so `bun test` can load the module (no `obsidian`).
 */

export async function resolveStorageIds(args: {
	/** Hashes of the files this publish uses (duplicates allowed). */
	hashes: readonly string[];
	mediaMap: Readonly<Record<string, string>>;
	/** Ids the server lacks, or null when the check is unavailable (older server). */
	missing: (ids: string[]) => Promise<Set<string> | null>;
	/** Uploads the file with this hash and returns its storageId. */
	upload: (hash: string) => Promise<string>;
}): Promise<Record<string, string>> {
	const { mediaMap, missing, upload } = args;
	const hashes = [...new Set(args.hashes)];

	const cachedIds = [
		...new Set(
			hashes.flatMap((hash) => {
				const id = mediaMap[hash];
				return id ? [id] : [];
			}),
		),
	];
	// null = check unavailable: cached ids are reused as before it existed.
	const gone = cachedIds.length > 0 ? await missing(cachedIds) : null;

	const next: Record<string, string> = { ...mediaMap };
	for (const hash of hashes) {
		const cached = mediaMap[hash];
		if (cached && !gone?.has(cached)) continue;
		next[hash] = await upload(hash);
	}
	return next;
}
