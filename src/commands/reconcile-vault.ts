import { type App, Notice } from "obsidian";
import type { ValeonApi } from "../api/client";
import type { MatchResult } from "../api/types";
import { type ValeonMeta, parseNote, stringifyNote } from "../lib/frontmatter";
import { slugFromFolder } from "../lib/slug";

/*
 * `Valeon: Reconcile vault` — match local posts to remote, write the
 * `valeon.postId` and canonical metadata back into frontmatter.
 * Never touches the body.
 *
 * Run modes: `dry-run` (writes a report only) and `apply` (does both
 * the report and the writes). Idempotent — re-running skips posts
 * that already have a postId.
 */

export type ReconcileMode = "dry-run" | "apply";

export async function runReconcile(args: {
	app: App;
	api: ValeonApi;
	mode: ReconcileMode;
}) {
	const candidates = args.app.vault
		.getMarkdownFiles()
		.filter(
			(f) =>
				/^\d{4}-\d{2}-\d{2}-/.test(f.parent?.name ?? "") &&
				f.name === "post.md",
		);
	const unlinked: Array<{
		file: (typeof candidates)[number];
		slug: string;
		title: string;
		raw: string;
	}> = [];
	for (const file of candidates) {
		const raw = await args.app.vault.read(file);
		const parsed = parseNote(raw);
		if (parsed.valeon.postId) continue;
		const slug = slugFromFolder(file.parent?.name ?? "");
		unlinked.push({
			file,
			slug,
			title: parsed.frontmatter.title ?? "",
			raw,
		});
	}

	if (unlinked.length === 0) {
		new Notice("Valeon: all posts already linked.");
		return;
	}

	// Batch the matches in groups of 50.
	const batchSize = 50;
	const matches = new Map<string, MatchResult>();
	for (let i = 0; i < unlinked.length; i += batchSize) {
		const batch = unlinked.slice(i, i + batchSize);
		const response = await args.api.matchPosts(
			batch.map((u) => ({ slug: u.slug, title: u.title })),
		);
		for (const m of response.matches) matches.set(m.slug, m);
	}

	let matched = 0;
	let unmatched = 0;
	let conflictCount = 0;
	const log: string[] = [];
	const toApply: Array<{
		file: (typeof candidates)[number];
		match: MatchResult;
	}> = [];

	for (const u of unlinked) {
		const m = matches.get(u.slug);
		if (!m) {
			unmatched++;
			log.push(`- ❔ Unmatched: ${u.file.path}`);
			continue;
		}
		if (m.conflict) {
			conflictCount++;
			log.push(
				`- ⚠️  Conflict (${m.conflict.type}): ${u.file.path} — ${m.conflict.detail}`,
			);
			continue;
		}
		if (m.postId) {
			matched++;
			log.push(`- ✅ Matched: ${u.file.path} → ${m.postId}`);
			toApply.push({ file: u.file, match: m });
		} else {
			unmatched++;
			log.push(`- ❔ Unmatched: ${u.file.path}`);
		}
	}

	if (args.mode === "apply") {
		for (const { file, match } of toApply) {
			const raw = await args.app.vault.read(file);
			const parsed = parseNote(raw);
			const rfm = match.remoteFrontmatter;
			const nextValeon: ValeonMeta = {
				...parsed.valeon,
				postId: match.postId,
				publishedAt: rfm?.publishedAt,
				remoteUpdatedAt: rfm?.updatedAt,
				lastPushedAt: new Date().toISOString(),
				// We don't compute lastPushedBodyHash here — reconcile is
				// intentionally body-agnostic. The first push or pull will
				// populate it.
			};
			const next = stringifyNote(parsed.frontmatter, nextValeon, parsed.body);
			await args.app.vault.modify(file, next);
		}
	}

	const reportPath = await writeReport(args.app, args.mode, {
		matched,
		unmatched,
		conflicts: conflictCount,
		log,
	});

	new Notice(
		args.mode === "dry-run"
			? `Valeon reconcile preview: matched ${matched}, unmatched ${unmatched}, conflicts ${conflictCount}. Report: ${reportPath}`
			: `Valeon reconcile applied: linked ${matched} post${matched === 1 ? "" : "s"}. Report: ${reportPath}`,
		10000,
	);
}

async function writeReport(
	app: App,
	mode: ReconcileMode,
	stats: {
		matched: number;
		unmatched: number;
		conflicts: number;
		log: string[];
	},
): Promise<string> {
	const dir = "_reports";
	if (!(await app.vault.adapter.exists(dir))) {
		await app.vault.createFolder(dir);
	}
	const ts = new Date().toISOString().replace(/[:.]/g, "-");
	const path = `${dir}/valeon-reconcile-${mode === "dry-run" ? "preview-" : ""}${ts}.md`;
	const content = `# Valeon vault reconcile — ${mode} — ${new Date().toISOString()}

- Matched: ${stats.matched}
- Unmatched: ${stats.unmatched}
- Conflicts: ${stats.conflicts}

## Per-post

${stats.log.join("\n") || "_(no candidates)_"}
`;
	await app.vault.create(path, content);
	return path;
}
