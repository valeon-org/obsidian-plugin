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
