/*
 * Path resolution for asset references inside a post body.
 *
 * Rule for "is this a local asset to upload?":
 *   - external URLs (http://, https://) → no
 *   - absolute paths (starting with /) → no (cross-post)
 *   - relative paths that resolve inside the current post's own
 *     folder → YES, this is a local asset
 *   - relative paths that escape the folder → no (cross-post)
 *
 * Cross-post references stay as-is so they resolve at runtime on the
 * blog. Plugin neither uploads nor rewrites them.
 */

export function isExternalUrl(linkPath: string): boolean {
	return /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(linkPath);
}

export function isAbsolutePath(linkPath: string): boolean {
	return linkPath.startsWith("/");
}

/**
 * Normalises a relative path against a base folder, eliminating
 * leading "./" and resolving "../" segments. Returns null if the
 * resolution escapes the base.
 */
export function resolveInsideFolder(
	folderPath: string,
	linkPath: string,
): string | null {
	if (!linkPath || isExternalUrl(linkPath) || isAbsolutePath(linkPath)) {
		return null;
	}
	const baseParts = folderPath.split("/").filter(Boolean);
	const relParts = linkPath
		.replace(/^\.\//, "")
		.split("/")
		.filter((p) => p.length > 0);
	const stack = [...baseParts];
	for (const part of relParts) {
		if (part === ".") continue;
		if (part === "..") {
			if (stack.length <= baseParts.length - baseParts.length) return null;
			if (stack.length === 0) return null;
			stack.pop();
			continue;
		}
		stack.push(part);
	}
	const resolved = stack.join("/");
	const base = baseParts.join("/");
	if (!resolved.startsWith(`${base}/`) && resolved !== base) return null;
	return resolved;
}

export function isLocalAsset(folderPath: string, linkPath: string): boolean {
	return resolveInsideFolder(folderPath, linkPath) !== null;
}

/**
 * Convert a local resolved vault path back to a folder-relative path
 * (e.g., `2026-05-17-foo/assets/x.png` against folder
 * `2026-05-17-foo` → `./assets/x.png`).
 */
export function toFolderRelative(folderPath: string, resolved: string): string {
	if (resolved === folderPath) return "./";
	const prefix = `${folderPath}/`;
	if (resolved.startsWith(prefix)) {
		return `./${resolved.slice(prefix.length)}`;
	}
	return resolved;
}
