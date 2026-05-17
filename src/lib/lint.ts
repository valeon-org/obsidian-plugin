import type { Vault } from "obsidian";
import type { ObsidianFrontmatter, ServerSchema, Taxonomy } from "../api/types";
import { resolveInsideFolder } from "./asset-resolver";
import { collectLocalAssetPaths } from "./body-rewriter";

/*
 * Lint a parsed note against the cached server schema + taxonomy.
 * Returns errors (block publish) and warnings (informational).
 *
 * Schema and taxonomy are passed in rather than fetched here so the
 * caller can reuse a single cache snapshot across multiple lint runs
 * (Sync vault, Reconcile, etc.).
 */

export type LintIssue = {
	severity: "error" | "warning";
	field: string;
	message: string;
};

export type LintInput = {
	folderPath: string;
	frontmatter: ObsidianFrontmatter;
	slug: string;
	body: string;
	schema: ServerSchema;
	taxonomy: Taxonomy;
	vault: Vault;
};

export async function lintPost(input: LintInput): Promise<LintIssue[]> {
	const issues: LintIssue[] = [];
	const { frontmatter, body, schema, taxonomy, slug, folderPath, vault } =
		input;

	// Required keys.
	for (const key of schema.requiredKeys) {
		const value = (frontmatter as Record<string, unknown>)[key];
		if (value === undefined || value === null || value === "") {
			issues.push({
				severity: "error",
				field: key,
				message: `Required field "${key}" is missing.`,
			});
		}
	}

	// Slug.
	const slugPattern = new RegExp(schema.constraints.slug.pattern);
	if (!slugPattern.test(slug)) {
		issues.push({
			severity: "error",
			field: "slug",
			message: `Slug "${slug}" must match ${schema.constraints.slug.pattern}.`,
		});
	}

	// Excerpt length.
	if (
		typeof frontmatter.excerpt === "string" &&
		frontmatter.excerpt.length > schema.constraints.excerpt.maxLength
	) {
		issues.push({
			severity: "error",
			field: "excerpt",
			message: `Excerpt is ${frontmatter.excerpt.length} chars; max is ${schema.constraints.excerpt.maxLength}.`,
		});
	}

	// tts → podcast invariant.
	if (frontmatter.tts === false && frontmatter.podcast === true) {
		issues.push({
			severity: "error",
			field: "podcast",
			message: "podcast must be false when tts is false.",
		});
	}

	// Canonical URL.
	if (frontmatter.canonical && !/^https?:\/\//.test(frontmatter.canonical)) {
		issues.push({
			severity: "error",
			field: "canonical",
			message: "canonical must start with http:// or https://.",
		});
	}

	// Categories — must exist in taxonomy.
	const knownCategorySlugs = new Set(taxonomy.categories.map((c) => c.slug));
	for (const slug of frontmatter.categories ?? []) {
		if (!knownCategorySlugs.has(slug)) {
			issues.push({
				severity: "error",
				field: "categories",
				message: `Unknown category "${slug}". Add it via the dashboard first.`,
			});
		}
	}

	// Series — must exist.
	const knownSeriesSlugs = new Set(taxonomy.series.map((s) => s.slug));
	if (
		frontmatter.series?.slug &&
		!knownSeriesSlugs.has(frontmatter.series.slug)
	) {
		issues.push({
			severity: "error",
			field: "series",
			message: `Unknown series "${frontmatter.series.slug}". Add it via the dashboard first.`,
		});
	}
	if (
		frontmatter.series?.part !== undefined &&
		typeof frontmatter.series.part !== "number"
	) {
		issues.push({
			severity: "warning",
			field: "series.part",
			message: `series.part is "${frontmatter.series.part}" (non-numeric); it will be skipped.`,
		});
	}

	// Cover image existence.
	if (frontmatter.cover) {
		const resolved = resolveInsideFolder(folderPath, frontmatter.cover);
		if (!resolved) {
			issues.push({
				severity: "warning",
				field: "cover",
				message: `cover path "${frontmatter.cover}" is outside the post folder; it will be ignored.`,
			});
		} else if (!(await vault.adapter.exists(resolved))) {
			issues.push({
				severity: "error",
				field: "cover",
				message: `Cover image not found: ${resolved}`,
			});
		}
	}

	// Body asset references — existence + MIME allowed.
	const allowedMimes = new Set(schema.media.allowedMimeTypes);
	for (const path of collectLocalAssetPaths(body, folderPath)) {
		if (!(await vault.adapter.exists(path))) {
			issues.push({
				severity: "error",
				field: "asset",
				message: `Referenced asset not found: ${path}`,
			});
			continue;
		}
		const ext = path.split(".").pop()?.toLowerCase();
		const mime = mimeFromExt(ext);
		if (!mime) {
			issues.push({
				severity: "error",
				field: "asset",
				message: `Cannot infer MIME type for "${path}" (extension ".${ext}"); upload will be rejected.`,
			});
			continue;
		}
		if (!allowedMimes.has(mime)) {
			issues.push({
				severity: "error",
				field: "asset",
				message: `Asset "${path}" has unsupported MIME type "${mime}".`,
			});
		}
	}

	return issues;
}

const MIME_BY_EXT: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	webp: "image/webp",
	gif: "image/gif",
	svg: "image/svg+xml",
	pdf: "application/pdf",
	txt: "text/plain",
	md: "text/markdown",
	rtf: "application/rtf",
	doc: "application/msword",
	docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	xls: "application/vnd.ms-excel",
	xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export function mimeFromExt(ext: string | undefined): string | null {
	if (!ext) return null;
	return MIME_BY_EXT[ext.toLowerCase()] ?? null;
}

export function extFromMime(mime: string): string {
	for (const [ext, m] of Object.entries(MIME_BY_EXT)) {
		if (m === mime) return ext;
	}
	return "bin";
}
