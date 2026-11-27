import type { OnDarkTwin } from "../lib/on-dark-twins";

/*
 * Wire types for the Valeon Obsidian HTTP API. These mirror the
 * structures defined in valeon-blog/convex/obsidian.ts and
 * valeon-blog/convex/http.ts; keep them in sync when the server
 * surface changes.
 */

export type ObsidianFrontmatter = {
	title?: string;
	pubDate?: string;
	updatedDate?: string;
	excerpt?: string;
	cover?: string;
	coverAlt?: string;
	author?: string;
	series?: {
		slug?: string;
		title?: string;
		part?: number | string;
	};
	featured?: boolean;
	tts?: boolean;
	podcast?: boolean;
	/** Narration voice id. Absent means "use my default". Never null here. */
	voice?: string;
	/** Author-declared AI-assisted label. Send only when the note has the key. */
	aiAssisted?: boolean;
	/** Author-declared Polemic label. Send only when the note has the key. */
	polemic?: boolean;
	categories?: string[];
	tags?: string[];
	canonical?: string;
};

/**
 * What goes on the wire: the same as the note's frontmatter, except
 * `voice` may be `null`, which clears the post's override on the server.
 * Kept apart from `ObsidianFrontmatter` so a `null` can never reach a
 * note-side object (it would be written as a literal `voice: null`).
 */
export type WireFrontmatter = Omit<ObsidianFrontmatter, "voice"> & {
	voice?: string | null;
};

export type Whoami = {
	authorId: string;
	authorName: string;
	authorSlug: string;
	role: "admin" | "editor" | "author";
	canPublishDirectly: boolean;
	tokenName: string;
};

export type ServerSchema = {
	version: number;
	requiredKeys: string[];
	optionalKeys: string[];
	enums: {
		categories: string[];
	};
	constraints: {
		excerpt: { maxLength: number };
		slug: { pattern: string };
		tags?: { maxCount: number };
	};
	media: {
		maxSizeBytes: number;
		allowedMimeTypes: string[];
	};
	/** Schema v3+. `null` while the server has no voice catalogue yet. */
	voices?: {
		ids: string[];
		deprecated: { name: string; replacement: string }[];
	} | null;
};

export type Taxonomy = {
	categories: Array<{ slug: string; name: string }>;
	series: Array<{ slug: string; title: string }>;
	tags: Array<{ slug: string; name: string }>;
};

export type ListedPost = {
	postId: string;
	slug: string;
	title: string;
	status: string;
	publishedAt?: number;
	updatedAt: number;
};

export type ListResponse = { posts: ListedPost[] };

export type MatchResult = {
	slug: string;
	postId?: string;
	remoteFrontmatter?: {
		title: string;
		excerpt: string;
		canonical?: string;
		featured: boolean;
		tts?: boolean;
		podcast?: boolean;
		voice?: string;
		aiAssisted?: boolean;
		polemic?: boolean;
		/** Response-only: who last set the label. Never a note key; never sent. */
		polemicSetBy?: "author" | "reviewer";
		publishedAt?: string;
		updatedAt: string;
		readingTime?: number;
		wordCount?: number;
		audioUrl?: string;
	};
	conflict?: {
		type: "ambiguous_title" | "wrong_author";
		detail: string;
	};
};

export type MatchResponse = { matches: MatchResult[] };

/**
 * Frontmatter as the server returns it. `polemicSetBy` is response-only:
 * the push validator is strict, so it is never a note key and never sent.
 */
export type RemoteFrontmatter = ObsidianFrontmatter & {
	polemicSetBy?: "author" | "reviewer";
};

export type FetchResponse = {
	postId: string;
	slug: string;
	status:
		| "draft"
		| "submitted"
		| "changes_requested"
		| "approved"
		| "published"
		| "archived";
	published: {
		frontmatter: RemoteFrontmatter;
		markdown: string;
	} | null;
	draftBuffer: {
		frontmatter: RemoteFrontmatter;
		markdown: string;
	} | null;
	publishedAt?: number;
	updatedAt: number;
	renderStatus: string;
	audioStatus: string;
	coverStorageId?: string;
	/** On-dark figure twins; absent from servers older than blog v2.36.0. */
	onDarkTwins?: OnDarkTwin[];
	mediaRefs: Array<{
		storageId: string;
		sha256?: string;
		filename: string;
		mimeType: string;
		sizeBytes: number;
	}>;
};

export type PostMutationResponse = {
	postId: string;
	slug: string;
	status: string;
	publishedAt?: number;
	updatedAt: number;
	warnings?: Array<{ field: string; message: string }>;
};

export type UploadUrlResponse = { uploadUrl: string };

/** `POST /api/obsidian/media/exists` (blog v2.45.0+): ids absent or not the caller's. */
export type MissingMediaResponse = { missing: string[] };

export type FinalizeResponse = {
	mediaId: string;
	storageId: string;
	deduped: boolean;
};

export type ApiError = {
	error: string;
	errors?: Array<{ field: string; message: string }>;
	warnings?: Array<{ field: string; message: string }>;
};

export type ResolveSlugResponse = { postId: string | null };

export type ReferenceTarget = {
	id: string;
	slug: string;
	status:
		| "draft"
		| "submitted"
		| "changes_requested"
		| "approved"
		| "published"
		| "archived";
	publishedAt: number | null;
};

export type ResolveRefsResponse = {
	targets: Array<ReferenceTarget | null>;
};

// AI cover image generation. Mirrors the /api/obsidian/covers/* routes
// in valeon-blog/convex/http.ts.
//
// These types are hand-maintained on purpose. This repository is public,
// so it carries the minimal subset of Valeon's contract that the plugin
// actually needs rather than importing the server's own definitions. The
// prompt fragments each axis id resolves to never cross this boundary —
// only the ids and their display labels do.
//
// A cover is a coordinate in four independent axes rather than a named
// style: two posts sharing a style used to differ only in their props.

export type AxisOption = { id: string; name: string };

export type AxisCatalog = {
	palettes: AxisOption[];
	techniques: AxisOption[];
	compositions: AxisOption[];
	treatments: AxisOption[];
};

export type Coordinate = {
	palette: string;
	technique: string;
	composition: string;
	treatment: string;
};

export type PresetMeta = {
	id: string;
	name: string;
	note: string;
	coordinate: Coordinate;
};

export type CoverAxesResponse = { axes: AxisCatalog; presets: PresetMeta[] };

export type GenerateCoverResponse = { storageId: string };

/**
 * Validate a catalogue payload at the boundary.
 *
 * The backend deploys with the blog, so an installed plugin build can
 * meet a newer API than it was written against. There is no
 * compatibility shim by design — this turns that mismatch into a message
 * telling the author to update, instead of a picker that renders empty
 * and looks broken for no stated reason.
 */
export function parseCoverAxes(raw: unknown): CoverAxesResponse {
	const value = raw as Partial<CoverAxesResponse> | null;
	const axes = value?.axes;
	const wellFormed =
		!!axes &&
		Array.isArray(axes.palettes) &&
		Array.isArray(axes.techniques) &&
		Array.isArray(axes.compositions) &&
		Array.isArray(axes.treatments) &&
		Array.isArray(value?.presets);
	if (!wellFormed) {
		throw new Error(
			"Valeon: unrecognised cover style catalogue. Update the plugin to match the site.",
		);
	}
	return value as CoverAxesResponse;
}

// Narration voices. Mirrors POST /api/obsidian/narration/voices.

export type VoiceTags = {
	gender?: string;
	age?: string;
	character?: string;
	accent?: string;
};

export type NarrationVoice = {
	id: string;
	displayName: string;
	description: string;
	tags: VoiceTags;
	previewUrl?: string;
};

export type VoiceListResponse = {
	available: boolean;
	voices: NarrationVoice[];
	authorVoice: string | null;
	platformVoice: string;
};

/** Validate a voice list at the boundary, like `parseCoverAxes`. */
export function parseVoiceList(raw: unknown): VoiceListResponse {
	const value = raw as Partial<VoiceListResponse> | null;
	const wellFormed =
		!!value &&
		typeof value === "object" &&
		typeof value.available === "boolean" &&
		Array.isArray(value.voices) &&
		value.voices.every(
			(v) =>
				!!v &&
				typeof v === "object" &&
				typeof v.id === "string" &&
				typeof v.displayName === "string",
		) &&
		(value.authorVoice === null || typeof value.authorVoice === "string") &&
		typeof value.platformVoice === "string";
	if (!wellFormed) {
		throw new Error(
			"Valeon: unrecognised narration voice list. Update the plugin to match the site.",
		);
	}
	return value as VoiceListResponse;
}

// AI authoring suggestions (AI-backed). Both pre-fill editable
// frontmatter; the author reviews before publishing.
export type SuggestExcerptResponse = { excerpt: string };

export type SuggestCoverAltResponse = { alt: string };

export type SuggestTagsResponse = {
	existing: Array<{ _id: string; slug: string; name: string }>;
	new: Array<{ slug: string; name: string }>;
};
