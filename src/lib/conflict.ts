import type { ValeonMeta } from "./frontmatter";

/*
 * Conflict detection for the pull flow.
 *
 * Decides whether pulling remote content over local is safe, a no-op,
 * or requires user intervention.
 *
 * The detector is source-aware: pulling `published` after the local
 * body was last synced from `draft` (or vice versa) is NEVER a no-op,
 * even if the source-specific timestamp hasn't moved — the user is
 * deliberately switching between two distinct versions of the post.
 */

export type PullSource = "published" | "draft";

export type ConflictDecision =
	| { kind: "no-remote-changes" }
	| { kind: "safe" }
	| { kind: "conflict" };

export function detectConflict(args: {
	valeon: ValeonMeta;
	localBodyHash: string;
	remoteUpdatedAt: number;
	currentSource: PullSource;
}): ConflictDecision {
	const lastSyncedAt = parseIso(args.valeon.remoteUpdatedAt);
	const sourcesMatch = isCompatibleSource(
		args.valeon.lastSyncedFrom,
		args.currentSource,
	);

	if (
		sourcesMatch &&
		lastSyncedAt !== null &&
		args.remoteUpdatedAt <= lastSyncedAt
	) {
		return { kind: "no-remote-changes" };
	}
	const lastPushedHash = args.valeon.lastPushedBodyHash;
	if (!lastPushedHash || lastPushedHash === args.localBodyHash) {
		return { kind: "safe" };
	}
	return { kind: "conflict" };
}

/**
 * Source compatibility for conflict detection.
 *
 *   - Pull (published) is compatible with a prior `push` or `published`
 *     sync because the local body matches the live row in both cases.
 *   - Pull (draft) is compatible only with a prior `draft` sync.
 */
function isCompatibleSource(
	lastSyncedFrom: ValeonMeta["lastSyncedFrom"],
	currentSource: PullSource,
): boolean {
	if (!lastSyncedFrom) return false;
	if (currentSource === "published") {
		return lastSyncedFrom === "published" || lastSyncedFrom === "push";
	}
	return lastSyncedFrom === "draft";
}

function parseIso(s: string | undefined): number | null {
	if (!s) return null;
	const t = Date.parse(s);
	return Number.isNaN(t) ? null : t;
}
