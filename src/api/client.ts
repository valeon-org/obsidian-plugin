import { requestUrl } from "obsidian";
import type {
	ApiError,
	FetchResponse,
	FinalizeResponse,
	ListResponse,
	MatchResponse,
	ObsidianFrontmatter,
	PostMutationResponse,
	ResolveRefsResponse,
	ResolveSlugResponse,
	ServerSchema,
	Taxonomy,
	UploadUrlResponse,
	Whoami,
} from "./types";

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
			let payload: ApiError = { error: `HTTP ${res.status}` };
			try {
				payload = res.json as ApiError;
			} catch {
				/* ignore non-JSON error body */
			}
			throw new ApiError_(res.status, payload);
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
