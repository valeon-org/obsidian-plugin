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
	categories?: string[];
	tags?: string[];
	canonical?: string;
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
		frontmatter: ObsidianFrontmatter;
		markdown: string;
	} | null;
	draftBuffer: {
		frontmatter: ObsidianFrontmatter;
		markdown: string;
	} | null;
	publishedAt?: number;
	updatedAt: number;
	renderStatus: string;
	audioStatus: string;
	coverStorageId?: string;
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

// AI authoring suggestions (OpenAI-backed). Both pre-fill editable
// frontmatter; the author reviews before publishing.
export type SuggestExcerptResponse = { excerpt: string };

export type SuggestCoverAltResponse = { alt: string };

export type SuggestTagsResponse = {
	existing: Array<{ _id: string; slug: string; name: string }>;
	new: Array<{ slug: string; name: string }>;
};
