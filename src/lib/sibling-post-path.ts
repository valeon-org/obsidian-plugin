/*
 * Vault path of a sibling post, for `../{folder}/post.md` cross-post
 * links. The target sits beside the source post's folder, i.e. under the
 * source file's grandparent.
 *
 * Obsidian reports the vault root's path as "/", so for posts at the root
 * a naive `${grandparent}/${folder}` join produced "//{folder}/post.md".
 * `vault.getAbstractFileByPath` never finds that, and publish silently
 * left those links unconverted. Kept free of runtime `obsidian` imports so
 * it can be unit-tested, and shared by publish and lint so the two can't
 * disagree again.
 */
export function siblingPostPath(
	grandparentPath: string | undefined,
	folderName: string,
): string {
	const base = (grandparentPath ?? "").replace(/^\/+|\/+$/g, "");
	return base ? `${base}/${folderName}/post.md` : `${folderName}/post.md`;
}
