import { parseYaml, stringifyYaml } from "obsidian";
import type { ObsidianFrontmatter } from "../api/types";

/*
 * YAML frontmatter handling that preserves the obsidian-linter key
 * order convention (title, pubDate, updatedDate, excerpt, cover,
 * coverAlt, author, series, featured, tts, podcast, categories, tags,
 * canonical) AND keeps the plugin-managed `valeon:` block at the very
 * end. Uses Obsidian's built-in parseYaml / stringifyYaml — pure JS,
 * works on both desktop and mobile.
 */

export type ValeonMeta = {
	postId?: string;
	publishedAt?: string;
	lastPushedAt?: string;
	lastPushedBodyHash?: string;
	remoteUpdatedAt?: string;
	// Which source the local body was last synced from. Used by the
	// conflict detector so that pulling a different source (e.g.
	// `published` after a prior `draft` pull) bypasses the
	// "no-remote-changes" check — they describe different versions of
	// the post, so equal timestamps don't mean nothing changed.
	//   "push"      — local was just pushed (body == published version)
	//   "published" — local was just pulled from the published row
	//   "draft"     — local was just pulled from the draft buffer
	lastSyncedFrom?: "published" | "draft" | "push";
	schemaVersion?: number;
	media?: Record<string, string>; // sha256 → storageId
};

export type ParsedNote = {
	frontmatter: ObsidianFrontmatter;
	valeon: ValeonMeta;
	body: string;
};

const VALEON_KEY = "valeon";

const KEY_ORDER = [
	"title",
	"pubDate",
	"updatedDate",
	"excerpt",
	"cover",
	"coverAlt",
	"author",
	"series",
	"featured",
	"tts",
	"podcast",
	"categories",
	"tags",
	"canonical",
];

// Matches a YAML frontmatter block at the very start of the file:
// "---\n" + YAML body + "\n---\n" (or trailing EOF after the close).
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function parseNote(raw: string): ParsedNote {
	const match = raw.match(FRONTMATTER_RE);
	let data: Record<string, unknown> = {};
	let body = raw;
	if (match) {
		const yamlText = match[1];
		body = raw.slice(match[0].length);
		const parsed = parseYaml(yamlText);
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			data = parsed as Record<string, unknown>;
		}
	}
	const valeon = (data[VALEON_KEY] as ValeonMeta | undefined) ?? {};
	const frontmatter: ObsidianFrontmatter = {
		title: stringOr(data.title),
		pubDate: stringOr(data.pubDate),
		updatedDate: stringOr(data.updatedDate),
		excerpt: stringOr(data.excerpt),
		cover: stringOr(data.cover),
		coverAlt: stringOr(data.coverAlt),
		author: stringOr(data.author),
		series: parseSeries(data.series),
		featured: boolOr(data.featured),
		tts: boolOr(data.tts),
		podcast: boolOr(data.podcast),
		categories: stringArrayOr(data.categories),
		tags: stringArrayOr(data.tags),
		canonical: stringOr(data.canonical),
	};
	return {
		frontmatter,
		valeon,
		body: body.trimStart(),
	};
}

export function stringifyNote(
	frontmatter: ObsidianFrontmatter,
	valeon: ValeonMeta,
	body: string,
): string {
	const ordered: Record<string, unknown> = {};
	for (const key of KEY_ORDER) {
		const cleaned = stripUndefined(
			(frontmatter as Record<string, unknown>)[key],
		);
		if (cleaned !== undefined) ordered[key] = cleaned;
	}
	const cleanedValeon = stripUndefined(valeon);
	if (
		cleanedValeon !== undefined &&
		Object.keys(cleanedValeon as Record<string, unknown>).length > 0
	) {
		ordered[VALEON_KEY] = cleanedValeon;
	}
	const yaml = stringifyYaml(ordered);
	const bodyOut = body.endsWith("\n") ? body : `${body}\n`;
	return `---\n${yaml}---\n${bodyOut}`;
}

/**
 * Recursively strip `undefined` values from objects and arrays.
 * stringifyYaml throws on undefined, so every object handed to it
 * must be cleaned first.
 */
function stripUndefined(value: unknown): unknown {
	if (value === undefined) return undefined;
	if (Array.isArray(value)) {
		const arr = value.map(stripUndefined).filter((v) => v !== undefined);
		return arr;
	}
	if (value !== null && typeof value === "object") {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
			const c = stripUndefined(v);
			if (c !== undefined) out[k] = c;
		}
		return out;
	}
	return value;
}

function stringOr(v: unknown): string | undefined {
	if (typeof v === "string") return v.trim() ? v.trim() : undefined;
	// Defensive: if any YAML parser ever returns a Date object for a
	// timestamp scalar, coerce back to ISO so downstream callers see a
	// consistent shape.
	if (v instanceof Date && !Number.isNaN(v.getTime())) {
		return v.toISOString();
	}
	if (typeof v === "number" && Number.isFinite(v)) return String(v);
	return undefined;
}

function boolOr(v: unknown): boolean | undefined {
	return typeof v === "boolean" ? v : undefined;
}

function stringArrayOr(v: unknown): string[] | undefined {
	if (!Array.isArray(v)) return undefined;
	const out: string[] = [];
	for (const item of v) {
		if (typeof item === "string" && item.trim()) out.push(item.trim());
	}
	return out.length > 0 ? out : undefined;
}

function parseSeries(v: unknown): ObsidianFrontmatter["series"] | undefined {
	if (!v || typeof v !== "object") return undefined;
	const o = v as Record<string, unknown>;
	const slug = stringOr(o.slug);
	if (!slug) return undefined;
	const title = stringOr(o.title);
	let part: number | string | undefined;
	if (typeof o.part === "number") part = o.part;
	else if (typeof o.part === "string" && o.part.trim()) part = o.part.trim();
	return { slug, title, part };
}
