import type { ApiError } from "./types";

/**
 * The error payload for a failed response. `readJson` reads the body as
 * JSON and may throw (non-JSON body) or yield anything (`null`, a string,
 * an object without `error`); every such body falls back to `HTTP <status>`
 * so the caller always gets a usable ApiError rather than a TypeError.
 */
export function errorPayload(
	status: number,
	readJson: () => unknown,
): ApiError {
	const fallback = `HTTP ${status}`;
	let body: unknown;
	try {
		body = readJson();
	} catch {
		return { error: fallback };
	}
	if (typeof body !== "object" || body === null || Array.isArray(body)) {
		return { error: fallback };
	}
	const payload = body as Partial<ApiError>;
	return typeof payload.error === "string" && payload.error !== ""
		? (payload as ApiError)
		: { ...payload, error: fallback };
}
