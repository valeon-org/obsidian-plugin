import { type App, Notice, type TFile } from "obsidian";
import type { ValeonApi } from "../api/client";
import type { ObsidianFrontmatter } from "../api/types";
import { type ValeonMeta, parseNote, stringifyNote } from "../lib/frontmatter";

/*
 * `Valeon: Pull metadata (current note)` — refresh server-derived
 * fields from the live `posts` row WITHOUT touching the body.
 *
 * Restores:
 *   - top-level `pubDate` from server `publishedAt`
 *   - top-level `updatedDate` from server `updatedAt`
 *   - `valeon.publishedAt` + `valeon.remoteUpdatedAt`
 *
 * Top-level dates are only WRITTEN when missing locally — if you've
 * intentionally set a different pubDate locally we don't clobber it.
 *
 * Useful for: post-reconcile recovery of dates, refreshing
 * publishedAt after a first publish, picking up server-computed
 * fields like readingTime / wordCount (once those are surfaced).
 */

export async function runPullMetadata(args: {
	app: App;
	file: TFile;
	api: ValeonApi;
}) {
	const raw = await args.app.vault.read(args.file);
	const parsed = parseNote(raw);
	if (!parsed.valeon.postId) {
		new Notice("Valeon: not a linked post.");
		return;
	}
	const result = await pullMetadataInto(parsed, args.api);
	if (!result) return;
	await args.app.vault.modify(args.file, result.next);
	new Notice(
		`Valeon: metadata synced for ${result.label}${result.changes.length ? ` (${result.changes.join(", ")})` : ""}`,
	);
}

/**
 * Vault-wide variant: iterate every linked post and pull metadata.
 * Useful right after a fresh reconcile when local dates were dropped
 * by a prior parser bug and need to be re-hydrated from the server.
 */
export async function runPullMetadataVault(args: {
	app: App;
	api: ValeonApi;
}) {
	const files = args.app.vault
		.getMarkdownFiles()
		.filter(
			(f) =>
				f.name === "post.md" &&
				/^\d{4}-\d{2}-\d{2}-/.test(f.parent?.name ?? ""),
		);
	let updated = 0;
	let skipped = 0;
	let failed = 0;
	for (const file of files) {
		try {
			const raw = await args.app.vault.read(file);
			const parsed = parseNote(raw);
			if (!parsed.valeon.postId) {
				skipped++;
				continue;
			}
			const result = await pullMetadataInto(parsed, args.api);
			if (!result) {
				skipped++;
				continue;
			}
			await args.app.vault.modify(file, result.next);
			updated++;
		} catch {
			failed++;
		}
	}
	new Notice(
		`Valeon: metadata pulled — updated ${updated}, skipped ${skipped}, failed ${failed}.`,
		8000,
	);
}

async function pullMetadataInto(
	parsed: ReturnType<typeof parseNote>,
	api: ValeonApi,
): Promise<{ next: string; label: string; changes: string[] } | null> {
	if (!parsed.valeon.postId) return null;
	const response = await api.fetchPost(parsed.valeon.postId, "published");

	const changes: string[] = [];
	const nextFrontmatter: ObsidianFrontmatter = { ...parsed.frontmatter };

	if (!nextFrontmatter.pubDate && response.publishedAt) {
		nextFrontmatter.pubDate = new Date(response.publishedAt).toISOString();
		changes.push("pubDate");
	}
	if (!nextFrontmatter.updatedDate && response.updatedAt) {
		nextFrontmatter.updatedDate = new Date(response.updatedAt).toISOString();
		changes.push("updatedDate");
	}

	const nextValeon: ValeonMeta = {
		...parsed.valeon,
		publishedAt: response.publishedAt
			? new Date(response.publishedAt).toISOString()
			: parsed.valeon.publishedAt,
		remoteUpdatedAt: new Date(response.updatedAt).toISOString(),
		// Pull metadata fetches the published row; mark the local note
		// as in-sync with that source so future conflict detection works.
		// (Does not touch body, so this is purely a tracking hint.)
		lastSyncedFrom: "published",
	};

	return {
		next: stringifyNote(nextFrontmatter, nextValeon, parsed.body),
		label: parsed.frontmatter.title ?? parsed.valeon.postId,
		changes,
	};
}
