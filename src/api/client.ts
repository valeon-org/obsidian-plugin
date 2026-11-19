import { requestUrl } from "obsidian";
import type { OnDarkTwin } from "../lib/on-dark-twins";
import { errorPayload } from "./error-payload";
import type {
	ApiError,
	Coordinate,
	CoverAxesResponse,
	FetchResponse,
	FinalizeResponse,
	GenerateCoverResponse,
	ListResponse,
	MatchResponse,
	MissingMediaResponse,
	ObsidianFrontmatter,
	PostMutationResponse,
	ResolveRefsResponse,
	ResolveSlugResponse,
	ServerSchema,
	SuggestCoverAltResponse,
	SuggestExcerptResponse,
	SuggestTagsResponse,
	Taxonomy,
	UploadUrlResponse,
	Whoami,
} from "./types";
import { parseCoverAxes } from "./types";

/** The `media/exists` route accepts at most this many ids per call. */
const MEDIA_EXISTS_MAX = 500;

/*
 * Thin HTTP client for the Valeon Obsidian endpoints. Uses Obsidian's
 * `requestUrl` so the same code works in the desktop and mobile
 * runtimes (mobile lacks the standard `fetch` for cross-origin calls
 * to non-https-on-default hosts).
 */

export class ApiError_ extends Error {
	readonly status: number;
	readonly fields?: Array<{ field: string; message: string }>;
	readonly warnings?: Array<{ field: string; message: string }>;
	constructor(status: number, payload: ApiError) {
		super(payload.error || `Request failed (HTTP ${status})`);
		this.status = status;
		this.fields = payload.errors;
		this.warnings = payload.warnings;
	}
}

export type ApiSettings = {
	baseUrl: string;
	token: string;
};

export class ValeonApi {
	constructor(private readonly settings: ApiSettings) {}

	private async request<T>(path: string, body?: unknown): Promise<T> {
		if (!this.settings.token) {
			throw new Error("No API token configured.");
		}
		const url = joinUrl(this.settings.baseUrl, path);
		const res = await requestUrl({
			url,
			method: "POST",
			headers: {
				authorization: `Bearer ${this.settings.token}`,
				"content-type": "application/json",
			},
			body: body !== undefined ? JSON.stringify(body) : "{}",
			throw: false,
		});
		if (res.status >= 400) {
			throw new ApiError_(
				res.status,
				errorPayload(res.status, () => res.json),
			);
		}
		return res.json as T;
	}

	whoami() {
		return this.request<Whoami>("/api/obsidian/whoami");
	}

	schema() {
		return this.request<ServerSchema>("/api/obsidian/schema");
	}

	taxonomy() {
		return this.request<Taxonomy>("/api/obsidian/taxonomy");
	}

	listPosts(args: { includeArchived?: boolean } = {}) {
		return this.request<ListResponse>("/api/obsidian/posts/list", args);
	}

	matchPosts(candidates: Array<{ slug: string; title?: string }>) {
		return this.request<MatchResponse>("/api/obsidian/posts/match", {
			candidates,
		});
	}

	fetchPost(postId: string, include?: "published" | "draft" | "both") {
		return this.request<FetchResponse>("/api/obsidian/posts/fetch", {
			postId,
			include,
		});
	}

	createPost(args: {
		slug: string;
		frontmatter: ObsidianFrontmatter;
		markdown: string;
		coverStorageId?: string;
		coverAlt?: string;
		onDarkTwins: OnDarkTwin[];
	}) {
		return this.request<PostMutationResponse>(
			"/api/obsidian/posts/create",
			args,
		);
	}

	updatePost(args: {
		postId: string;
		slug: string;
		frontmatter: ObsidianFrontmatter;
		markdown: string;
		coverStorageId?: string;
		coverAlt?: string;
		onDarkTwins: OnDarkTwin[];
	}) {
		return this.request<PostMutationResponse>(
			"/api/obsidian/posts/update",
			args,
		);
	}

	resolveSlugToId(slug: string) {
		return this.request<ResolveSlugResponse>(
			"/api/obsidian/posts/resolve-slug",
			{ slug },
		);
	}

	resolveReferenceTargets(ids: string[]) {
		return this.request<ResolveRefsResponse>(
			"/api/obsidian/posts/resolve-refs",
			{ ids },
		);
	}

	/**
	 * Fetch the cover axis catalogue (labels and option ids only — never
	 * the prompt fragments). Validated at the boundary so a stale plugin
	 * meeting a newer API fails with a message rather than an empty
	 * picker.
	 */
	async listCoverAxes(): Promise<CoverAxesResponse> {
		const raw = await this.request<unknown>("/api/obsidian/covers/styles");
		return parseCoverAxes(raw);
	}

	/**
	 * Ask the server for a coordinate for this note, avoiding what the
	 * publication has used lately. Selection lives server-side so the
	 * plugin and dashboard cannot drift apart on it.
	 */
	proposeCoverCoordinate(seed: string, preferTreatments?: string[]) {
		return this.request<Coordinate>("/api/obsidian/covers/propose", {
			seed,
			preferTreatments,
		});
	}

	/**
	 * Generate an AI cover image. Returns the storageId of the stored PNG;
	 * the caller downloads it via `downloadMedia`. Note this is a slow
	 * (up to a minute) call — the image request runs synchronously.
	 */
	generateCover(args: {
		subject: string;
		palette: string;
		technique: string;
		composition: string;
		treatment: string;
		presetId?: string;
	}) {
		return this.request<GenerateCoverResponse>(
			"/api/obsidian/covers/generate",
			args,
		);
	}

	/** Suggest a post excerpt from its markdown body (AI-backed). */
	suggestExcerpt(markdown: string) {
		return this.request<SuggestExcerptResponse>(
			"/api/obsidian/suggest/excerpt",
			{ markdown },
		);
	}

	/** Suggest cover alt text via a vision pass over the uploaded cover. */
	suggestCoverAlt(storageId: string) {
		return this.request<SuggestCoverAltResponse>(
			"/api/obsidian/suggest/cover-alt",
			{ storageId },
		);
	}

	/** Suggest tags for the post; returns reusable existing tags + proposed new ones. */
	suggestTags(title: string, markdown: string, currentSlugs: string[]) {
		return this.request<SuggestTagsResponse>("/api/obsidian/suggest/tags", {
			title,
			markdown,
			currentSlugs,
		});
	}

	uploadUrl() {
		return this.request<UploadUrlResponse>("/api/obsidian/media/upload-url");
	}

	finalize(args: {
		storageId: string;
		filename: string;
		mimeType: string;
		sizeBytes: number;
		sha256?: string;
	}) {
		return this.request<FinalizeResponse>("/api/obsidian/media/finalize", args);
	}

	/** PUT raw bytes to a Convex storage upload URL. Returns the storageId. */
	async uploadBytes(uploadUrl: string, bytes: ArrayBuffer, mimeType: string) {
		const res = await requestUrl({
			url: uploadUrl,
			method: "POST",
			headers: { "content-type": mimeType },
			body: bytes,
			throw: false,
		});
		if (res.status >= 400) {
			throw new Error(`Upload failed (HTTP ${res.status})`);
		}
		// Convex upload URLs return JSON with `{ storageId }`.
		try {
			const parsed = res.json as { storageId?: string };
			if (parsed.storageId) return parsed.storageId;
		} catch {
			/* fall through */
		}
		throw new Error("Upload returned no storageId.");
	}

	/**
	 * Which of these storageIds the server lacks or doesn't count as the
	 * caller's. With `postId`, covers already on that post count as
	 * present. Returns null on 404: an older server without the route
	 * (the route itself never 404s). Chunked to the route's 500-id cap.
	 */
	async missingMedia(
		storageIds: string[],
		postId?: string,
	): Promise<string[] | null> {
		const missing: string[] = [];
		for (let i = 0; i < storageIds.length; i += MEDIA_EXISTS_MAX) {
			try {
				const res = await this.request<MissingMediaResponse>(
					"/api/obsidian/media/exists",
					{ storageIds: storageIds.slice(i, i + MEDIA_EXISTS_MAX), postId },
				);
				missing.push(...res.missing);
			} catch (err) {
				if (err instanceof ApiError_ && err.status === 404) return null;
				throw err;
			}
		}
		return missing;
	}

	/**
	 * Download a media asset by storageId. Used by the pull flow.
	 * Resolves the storageId to a signed URL via the API, then fetches
	 * the bytes from that URL directly.
	 */
	async downloadMedia(storageId: string): Promise<ArrayBuffer> {
		const { url } = await this.request<{ url: string }>(
			"/api/obsidian/media/url",
			{ storageId },
		);
		const res = await requestUrl({ url, method: "GET", throw: false });
		if (res.status >= 400) {
			throw new Error(`Download failed (HTTP ${res.status})`);
		}
		return res.arrayBuffer;
	}
}

function joinUrl(base: string, path: string): string {
	const b = base.replace(/\/+$/, "");
	const p = path.startsWith("/") ? path : `/${path}`;
	return `${b}${p}`;
}
