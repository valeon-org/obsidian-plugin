/*
 * On-dark figure twins.
 *
 * A figure can ship as two SVGs side by side: `<id>.svg`, a dark plate
 * for light pages (and anywhere without a theme swap: RSS, link
 * previews), and `<id>.on-dark.svg`, a light plate for dark pages.
 * valeon.blog's dark mode is a class toggle an <img> can't see, so the
 * blog renders both and lets CSS pick one.
 *
 * The markdown only ever links the plain file; the twin is found by
 * name next to it. Push uploads it and sends the pairing to the server
 * (the server never sees `valeon.media`); pull / restore write it back
 * next to its light file.
 */

/** A figure's light-page image and its dark-page twin, as Convex _storage ids. */
export type OnDarkTwin = { storageId: string; onDarkStorageId: string };

const SVG_RE = /\.svg$/i;
const ON_DARK_RE = /\.on-dark\.svg$/i;

/**
 * The twin's path for a light image path: `…/x.svg` → `…/x.on-dark.svg`.
 * Null for anything that isn't an SVG, or is already a twin.
 */
export function onDarkTwinPath(path: string): string | null {
	if (!SVG_RE.test(path) || ON_DARK_RE.test(path)) return null;
	return path.replace(SVG_RE, ".on-dark.svg");
}

/**
 * Pair uploaded light images with their uploaded twins. `pairs` maps a
 * light vault path to its twin's vault path; `storageIdOf` resolves an
 * uploaded path. Pairs that dedupe onto one storage id (byte-identical
 * files) are dropped, and each light image keeps its first twin.
 */
export function pairOnDarkTwins(
	pairs: Iterable<[lightPath: string, twinPath: string]>,
	storageIdOf: (path: string) => string | undefined,
): OnDarkTwin[] {
	const out: OnDarkTwin[] = [];
	const seen = new Set<string>();
	for (const [lightPath, twinPath] of pairs) {
		const storageId = storageIdOf(lightPath);
		const onDarkStorageId = storageIdOf(twinPath);
		if (!storageId || !onDarkStorageId) continue;
		if (storageId === onDarkStorageId || seen.has(storageId)) continue;
		seen.add(storageId);
		out.push({ storageId, onDarkStorageId });
	}
	return out;
}

/**
 * Where each twin goes on pull / restore: next to the local file its
 * light image landed in, named from that file (never from the server's
 * media filename, which sha256 dedupe can make a different name).
 */
export function twinDownloadTargets(
	twins: readonly OnDarkTwin[],
	lightPathOf: (storageId: string) => string | undefined,
): Array<{ onDarkStorageId: string; path: string }> {
	const out: Array<{ onDarkStorageId: string; path: string }> = [];
	for (const t of twins) {
		const lightPath = lightPathOf(t.storageId);
		const path = lightPath ? onDarkTwinPath(lightPath) : null;
		if (path) out.push({ onDarkStorageId: t.onDarkStorageId, path });
	}
	return out;
}

/**
 * Storage ids to leave out of the generic media download: twins are
 * named from their light file instead. A twin the body also links
 * directly stays in the generic pass.
 */
export function twinOnlyStorageIds(
	twins: readonly OnDarkTwin[],
	markdown: string,
): Set<string> {
	return new Set(
		twins
			.map((t) => t.onDarkStorageId)
			.filter((id) => !markdown.includes(`/m/${id}`)),
	);
}
