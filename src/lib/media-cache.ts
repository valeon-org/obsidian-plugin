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

/**
 * Reads `valeon.media` as an author may have left it. Frontmatter is
 * hand-editable, so the value can be a string, list, null or number:
 * spreading a string would write `{0: "t", 1: "e", …}` back. Anything but a
 * plain object is an empty map; inside a map only non-empty string ids are
 * kept (so non-string and empty entries are dropped from what is written back).
 */
export function cachedMediaMap(raw: unknown): Record<string, string> {
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
	const proto: unknown = Object.getPrototypeOf(raw);
	if (proto !== Object.prototype && proto !== null) return {};
	const out: Record<string, string> = {};
	for (const [hash, id] of Object.entries(raw)) {
		if (typeof id === "string" && id !== "") out[hash] = id;
	}
	return out;
}

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

	// `valeon.media` is frontmatter an author can edit by hand: anything but a
	// non-empty string counts as uncached and is uploaded again.
	const cachedId = (hash: string): string | null => {
		const id: unknown = mediaMap[hash];
		return typeof id === "string" && id !== "" ? id : null;
	};

	const cachedIds = [
		...new Set(
			hashes.flatMap((hash) => {
				const id = cachedId(hash);
				return id ? [id] : [];
			}),
		),
	];
	// null = check unavailable: cached ids are reused as before it existed.
	const gone = cachedIds.length > 0 ? await missing(cachedIds) : null;

	const next: Record<string, string> = { ...mediaMap };
	for (const hash of hashes) {
		const cached = cachedId(hash);
		if (cached && !gone?.has(cached)) continue;
		next[hash] = await upload(hash);
	}
	return next;
}
