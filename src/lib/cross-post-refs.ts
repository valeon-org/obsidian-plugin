import { TFile, type Vault } from "obsidian";
import type { ValeonApi } from "../api/client";
import { parseNote } from "./frontmatter";

/*
 * Cross-post link translation. Lives in its own pass alongside (not
 * inside) the existing `body-rewriter.ts`, which handles
 * `/m/{storageId}` asset URLs. Cross-post URIs (`valeon:post:{id}`)
 * and asset URLs occupy disjoint URL spaces, so the two passes don't
 * collide.
 *
 * Push direction (authored body → Convex wire form):
 *   `../YYYY-MM-DD-slug/post.md`        → `valeon:post:{id}`  (resolved via local file's frontmatter)
 *   `https://valeon.blog/Y/M/D/{slug}`  → `valeon:post:{id}`  (resolved via api.resolveSlugToId)
 *
 * Pull direction (Convex wire form → local body):
 *   `valeon:post:{id}` for an id that maps to a file in the local vault
 *     → `../{folder-name}/post.md`
 *   `valeon:post:{id}` for a foreign id whose target is published
 *     → `https://valeon.blog/Y/M/D/{slug}`
 *   `valeon:post:{id}` for a foreign id whose target is draft / missing
 *     → leave the URI verbatim (round-trips fine on next push)
 *
 * Fragments (`#anchor`) and query strings (`?ref=card`) are preserved
 * end-to-end in both directions.
 */

const MARKDOWN_LINK_RE = /(^|[^!])\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g;
const FOLDER_PATH_RE =
	/^\.\.\/(\d{4}-\d{2}-\d{2}-[^/]+)\/post\.md(\?[^#)]*)?(#[^)]*)?$/;
const BLOG_URL_RE =
	/^https:\/\/valeon\.blog\/\d{4}\/\d{2}\/\d{2}\/([^/?#)]+)\/?(\?[^#)]*)?(#[^)]*)?$/;
const VALEON_URI_RE = /^valeon:post:([a-z0-9]+)(\?[^#)]*)?(#[^)]*)?$/;

/**
 * Push direction. Translates the two author-facing forms to
 * `valeon:post:{id}` URIs. Lint should have already validated that
 * every cross-post ref resolves; if a ref slips through unresolvable,
 * we leave it alone (best-effort) and the rendered link will be
 * broken on the blog.
 */
export async function rewriteCrossPostForPush(
	body: string,
	sourceFile: TFile,
	vault: Vault,
	api: ValeonApi,
): Promise<string> {
	const folderNames = new Set<string>();
	const urlSlugs = new Set<string>();
	for (const m of body.matchAll(MARKDOWN_LINK_RE)) {
		const target = m[3];
		const fp = target.match(FOLDER_PATH_RE);
		if (fp) {
			folderNames.add(fp[1]);
			continue;
		}
		const u = target.match(BLOG_URL_RE);
		if (u) urlSlugs.add(u[1]);
	}

	const folderToId = new Map<string, string>();
	for (const folderName of folderNames) {
		const id = await readPostIdFromFolder(vault, sourceFile, folderName);
		if (id) folderToId.set(folderName, id);
	}
	// Resolve serially via the API to avoid hammering Convex; usually the
	// blog-URL form is rare relative to folder paths.
	const slugToId = new Map<string, string>();
	for (const slug of urlSlugs) {
		const r = await api.resolveSlugToId(slug);
		if (r.postId) slugToId.set(slug, r.postId);
	}

	return body.replace(
		MARKDOWN_LINK_RE,
		(full, prefix: string, label: string, target: string, title?: string) => {
			const fp = target.match(FOLDER_PATH_RE);
			if (fp) {
				const id = folderToId.get(fp[1]);
				if (!id) return full;
				return composeLink(prefix, label, id, fp[2], fp[3], title);
			}
			const u = target.match(BLOG_URL_RE);
			if (u) {
				const id = slugToId.get(u[1]);
				if (!id) return full;
				return composeLink(prefix, label, id, u[2], u[3], title);
			}
			return full;
		},
	);
}

/**
 * Pull direction. Translates `valeon:post:{id}` URIs back to either
 * a local folder-relative path (if the vault has the post) or the
 * canonical blog URL (if foreign and published). Leaves the URI
 * verbatim for foreign + draft/missing targets.
 */
export async function rewriteCrossPostForPull(
	body: string,
	vault: Vault,
	api: ValeonApi,
): Promise<string> {
	const allIds = new Set<string>();
	for (const m of body.matchAll(MARKDOWN_LINK_RE)) {
		const uri = m[3].match(VALEON_URI_RE);
		if (uri) allIds.add(uri[1]);
	}
	if (allIds.size === 0) return body;

	const localIndex = await buildLocalPostIdIndex(vault);
	const foreignIds = Array.from(allIds).filter((id) => !localIndex.has(id));

	const foreignToUrl = new Map<string, string>();
	if (foreignIds.length > 0) {
		const result = await api.resolveReferenceTargets(foreignIds);
		for (const t of result.targets) {
			if (!t || t.status !== "published" || !t.publishedAt) continue;
			foreignToUrl.set(t.id, buildCanonicalUrl(t.slug, t.publishedAt));
		}
	}

	return body.replace(
		MARKDOWN_LINK_RE,
		(full, prefix: string, label: string, target: string, title?: string) => {
			const uri = target.match(VALEON_URI_RE);
			if (!uri) return full;
			const id = uri[1];
			const query = uri[2] ?? "";
			const fragment = uri[3] ?? "";
			const t = title ? ` "${title}"` : "";
			const localFolder = localIndex.get(id);
			if (localFolder) {
				return `${prefix}[${label}](../${localFolder}/post.md${query}${fragment}${t})`;
			}
			const foreignUrl = foreignToUrl.get(id);
			if (foreignUrl) {
				return `${prefix}[${label}](${foreignUrl}${query}${fragment}${t})`;
			}
			return full;
		},
	);
}

function composeLink(
	prefix: string,
	label: string,
	postId: string,
	query: string | undefined,
	fragment: string | undefined,
	title: string | undefined,
): string {
	const q = query ?? "";
	const f = fragment ?? "";
	const t = title ? ` "${title}"` : "";
	return `${prefix}[${label}](valeon:post:${postId}${q}${f}${t})`;
}

function buildCanonicalUrl(slug: string, publishedAt: number): string {
	const d = new Date(publishedAt);
	const year = d.getUTCFullYear();
	const month = String(d.getUTCMonth() + 1).padStart(2, "0");
	const day = String(d.getUTCDate()).padStart(2, "0");
	return `https://valeon.blog/${year}/${month}/${day}/${slug}`;
}

async function readPostIdFromFolder(
	vault: Vault,
	sourceFile: TFile,
	folderName: string,
): Promise<string | null> {
	// `../{folder}/post.md` resolves relative to the source post's parent
	// folder. Source is at `<grandparent>/<sourceFolder>/post.md`; target
	// is at `<grandparent>/<folderName>/post.md`.
	const grandparent = sourceFile.parent?.parent?.path ?? "";
	const path = grandparent
		? `${grandparent}/${folderName}/post.md`
		: `${folderName}/post.md`;
	const f = vault.getAbstractFileByPath(path);
	if (!f || !(f instanceof TFile)) return null;
	const raw = await vault.read(f);
	const parsed = parseNote(raw);
	return parsed.valeon.postId ?? null;
}

/**
 * Walk every dated `post.md` in the vault, parse frontmatter, and
 * build `postId → folder-name` for the pull path. Cheap at the
 * vault sizes we care about (tens to low hundreds of posts).
 */
async function buildLocalPostIdIndex(
	vault: Vault,
): Promise<Map<string, string>> {
	const out = new Map<string, string>();
	const files = vault
		.getMarkdownFiles()
		.filter(
			(f) =>
				f.name === "post.md" &&
				/^\d{4}-\d{2}-\d{2}-/.test(f.parent?.name ?? ""),
		);
	for (const f of files) {
		const raw = await vault.read(f);
		const parsed = parseNote(raw);
		if (parsed.valeon.postId && f.parent?.name) {
			out.set(parsed.valeon.postId, f.parent.name);
		}
	}
	return out;
}

/**
 * Enumerate every cross-post link reference in the body for lint.
 * Returns one entry per match with the form classification so the
 * lint caller can route each to the right resolver.
 */
export type CrossPostRef =
	| { kind: "folder"; folderName: string; raw: string }
	| { kind: "url"; slug: string; raw: string }
	| { kind: "uri"; postId: string; raw: string };

export function collectCrossPostRefs(body: string): CrossPostRef[] {
	const out: CrossPostRef[] = [];
	for (const m of body.matchAll(MARKDOWN_LINK_RE)) {
		const target = m[3];
		const fp = target.match(FOLDER_PATH_RE);
		if (fp) {
			out.push({ kind: "folder", folderName: fp[1], raw: target });
			continue;
		}
		const u = target.match(BLOG_URL_RE);
		if (u) {
			out.push({ kind: "url", slug: u[1], raw: target });
			continue;
		}
		const uri = target.match(VALEON_URI_RE);
		if (uri) {
			out.push({ kind: "uri", postId: uri[1], raw: target });
		}
	}
	return out;
}
