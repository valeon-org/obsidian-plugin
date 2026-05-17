/*
 * Slugification that matches both the existing
 * `valeon-posts/_scripts/createDatedPostFolder.js` (folder names) and
 * `slugifyFrontmatterTags.js` (tag slugs). Both share this transform.
 */

export function slugify(input: string): string {
	return input
		.normalize("NFKD")
		.replace(/\p{M}/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

/** Derive a post slug from its folder name (YYYY-MM-DD-{slug}). */
export function slugFromFolder(folder: string): string {
	const m = folder.match(/^\d{4}-\d{2}-\d{2}-(.+)$/);
	return m ? m[1] : folder;
}

/** Today's date as YYYY-MM-DD in UTC. */
export function todayUtc(): string {
	const d = new Date();
	const yyyy = d.getUTCFullYear();
	const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
	const dd = String(d.getUTCDate()).padStart(2, "0");
	return `${yyyy}-${mm}-${dd}`;
}

/** Compose the dated folder name from a title. */
export function makeDatedFolder(title: string, date = todayUtc()): string {
	return `${date}-${slugify(title)}`;
}
