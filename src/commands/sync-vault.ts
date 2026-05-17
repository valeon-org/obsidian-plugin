import { type App, Notice, type TFile } from "obsidian";
import type { ValeonApi } from "../api/client";
import { parseNote } from "../lib/frontmatter";
import { pullCurrentFile } from "./pull-post";

/*
 * `Valeon: Sync vault` — for every linked note where the server's
 * updatedAt is newer than our `valeon.remoteUpdatedAt`, pull. Auto-
 * backups on conflict. Writes a markdown report into `_reports/`.
 */

export async function runSyncVault(args: { app: App; api: ValeonApi }) {
	const files = args.app.vault
		.getMarkdownFiles()
		.filter(
			(f) =>
				/^\d{4}-\d{2}-\d{2}-/.test(f.parent?.name ?? "") &&
				f.name === "post.md",
		);

	let pulled = 0;
	let upToDate = 0;
	let conflicts = 0;
	let skipped = 0;
	const log: string[] = [];

	for (const file of files) {
		const raw = await args.app.vault.read(file);
		const parsed = parseNote(raw);
		if (!parsed.valeon.postId) {
			skipped++;
			continue;
		}
		try {
			const result = await pullCurrentFile({
				app: args.app,
				file,
				api: args.api,
				options: { include: "both", conflictPolicy: "auto-backup" },
			});
			if (result.kind === "pulled") {
				pulled++;
				log.push(`- ✅ Pulled: ${file.path}`);
			} else if (result.kind === "up-to-date") {
				upToDate++;
			} else if (result.kind === "cancelled") {
				conflicts++;
				log.push(`- ⚠️  Conflict (backed up): ${file.path}`);
			} else {
				skipped++;
				log.push(`- ⏭  Skipped (${result.reason}): ${file.path}`);
			}
		} catch (err) {
			log.push(
				`- ❌ Error: ${file.path} — ${err instanceof Error ? err.message : String(err)}`,
			);
			skipped++;
		}
	}

	const reportPath = await writeReport(args.app, {
		pulled,
		upToDate,
		conflicts,
		skipped,
		log,
	});
	new Notice(
		`Valeon: sync complete. Pulled ${pulled}, up-to-date ${upToDate}, skipped ${skipped}. Report: ${reportPath}`,
		10000,
	);
}

async function writeReport(
	app: App,
	stats: {
		pulled: number;
		upToDate: number;
		conflicts: number;
		skipped: number;
		log: string[];
	},
): Promise<string> {
	const reportsDir = "_reports";
	if (!(await app.vault.adapter.exists(reportsDir))) {
		await app.vault.createFolder(reportsDir);
	}
	const ts = new Date().toISOString().replace(/[:.]/g, "-");
	const path = `${reportsDir}/valeon-sync-${ts}.md`;
	const content = `# Valeon vault sync — ${new Date().toISOString()}

- Pulled: ${stats.pulled}
- Up to date: ${stats.upToDate}
- Conflicts (auto-backed up): ${stats.conflicts}
- Skipped: ${stats.skipped}

## Per-file activity

${stats.log.join("\n") || "_(no changes)_"}
`;
	await app.vault.create(path, content);
	return path;
}
