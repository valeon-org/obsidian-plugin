/*
 * Hex-encoded sha256. Works in Obsidian's runtime (which provides
 * Web Crypto via `crypto.subtle`) on both desktop and mobile.
 */
export async function sha256Hex(bytes: ArrayBuffer | string): Promise<string> {
	const buf =
		typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
	const digest = await crypto.subtle.digest("SHA-256", buf);
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}
