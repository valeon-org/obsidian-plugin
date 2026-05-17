import { isExternalUrl, resolveInsideFolder } from "./asset-resolver";

/*
 * Body rewriting: walks the markdown body and applies a transform to
 * every image (`![](path)`) and link (`[](path)`) target.
 *
 * Used in two directions:
 *   - Push: local relative paths → /m/{storageId} (transport copy)
 *   - Pull: /m/{storageId} → local relative paths (when applying
 *     pulled content back to the vault)
 *
 * Wiki-link syntax (`![[asset]]`, `[[asset]]`) is detected and
 * converted to standard markdown syntax during push. The vault uses
 * standard markdown by default but mobile paste can introduce wiki-
 * links, so we handle them defensively.
 */

const MARKDOWN_IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g;
const MARKDOWN_LINK_RE = /(^|[^!])\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g;
const WIKI_IMAGE_RE = /!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
const WIKI_LINK_RE = /(^|[^!])\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

export type LocalAssetResolver = (resolvedVaultPath: string) => {
	storageId: string;
	filename: string;
	mimeType: string;
	sha256: string;
} | null;

export type Rewriter = (
	body: string,
	folderPath: string,
	resolve: LocalAssetResolver,
) => string;

/**
 * Push direction: rewrite every local asset reference in `body` to
 * `/m/{storageId}` using the result of `resolve`. Wiki-links are
 * normalised to standard markdown along the way.
 */
export const rewriteForPush: Rewriter = (body, folderPath, resolve) => {
	// 1. Wiki-link images → standard markdown image.
	let out = body.replace(WIKI_IMAGE_RE, (full, target, alias) => {
		const linkPath = `./${target.trim()}`;
		const resolved = resolveInsideFolder(folderPath, linkPath);
		if (!resolved) return full; // not a local asset, leave as-is
		const hit = resolve(resolved);
		if (!hit) return full;
		const alt = alias ? alias.trim() : target.trim();
		return `![${alt}](/m/${hit.storageId})`;
	});

	// 2. Wiki-link non-image → standard markdown link.
	out = out.replace(WIKI_LINK_RE, (full, prefix, target, alias) => {
		const linkPath = `./${target.trim()}`;
		const resolved = resolveInsideFolder(folderPath, linkPath);
		if (!resolved) return full;
		const hit = resolve(resolved);
		if (!hit) return full;
		const label = alias ? alias.trim() : target.trim();
		return `${prefix}[${label}](/m/${hit.storageId})`;
	});

	// 3. Standard markdown images.
	out = out.replace(MARKDOWN_IMAGE_RE, (full, alt, target, title) => {
		if (isExternalUrl(target)) return full;
		const resolved = resolveInsideFolder(folderPath, target);
		if (!resolved) return full;
		const hit = resolve(resolved);
		if (!hit) return full;
		const t = title ? ` "${title}"` : "";
		return `![${alt}](/m/${hit.storageId}${t})`;
	});

	// 4. Standard markdown links (non-image).
	out = out.replace(MARKDOWN_LINK_RE, (full, prefix, label, target, title) => {
		if (isExternalUrl(target)) return full;
		const resolved = resolveInsideFolder(folderPath, target);
		if (!resolved) return full;
		const hit = resolve(resolved);
		if (!hit) return full;
		const t = title ? ` "${title}"` : "";
		return `${prefix}[${label}](/m/${hit.storageId}${t})`;
	});

	return out;
};

/**
 * Pull direction: rewrite every `/m/{storageId}` reference to a
 * folder-relative path using `resolve`.
 */
export type PullResolver = (storageId: string) => string | null;

export function rewriteForPull(body: string, resolve: PullResolver): string {
	let out = body.replace(MARKDOWN_IMAGE_RE, (full, alt, target, title) => {
		const m = target.match(/^\/m\/([A-Za-z0-9_-]+)$/);
		if (!m) return full;
		const relPath = resolve(m[1]);
		if (!relPath) return full;
		const t = title ? ` "${title}"` : "";
		return `![${alt}](${relPath}${t})`;
	});
	out = out.replace(MARKDOWN_LINK_RE, (full, prefix, label, target, title) => {
		const m = target.match(/^\/m\/([A-Za-z0-9_-]+)$/);
		if (!m) return full;
		const relPath = resolve(m[1]);
		if (!relPath) return full;
		const t = title ? ` "${title}"` : "";
		return `${prefix}[${label}](${relPath}${t})`;
	});
	return out;
}

/**
 * Enumerate every local asset path referenced in `body`. Returns
 * resolved vault paths (de-duplicated). Used by the lint + publish
 * flows to know what to read/hash.
 */
export function collectLocalAssetPaths(
	body: string,
	folderPath: string,
): string[] {
	const out = new Set<string>();
	const add = (linkPath: string) => {
		if (isExternalUrl(linkPath)) return;
		const resolved = resolveInsideFolder(folderPath, linkPath);
		if (resolved) out.add(resolved);
	};

	for (const m of body.matchAll(MARKDOWN_IMAGE_RE)) add(m[2]);
	for (const m of body.matchAll(MARKDOWN_LINK_RE)) add(m[3]);
	for (const m of body.matchAll(WIKI_IMAGE_RE)) add(`./${m[1].trim()}`);
	for (const m of body.matchAll(WIKI_LINK_RE)) add(`./${m[2].trim()}`);

	return Array.from(out);
}

/** Enumerate every `/m/{storageId}` reference in `body`. */
export function collectMediaRefs(body: string): string[] {
	const out = new Set<string>();
	for (const m of body.matchAll(/\/m\/([A-Za-z0-9_-]+)/g)) {
		out.add(m[1]);
	}
	return Array.from(out);
}
