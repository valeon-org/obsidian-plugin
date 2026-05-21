import { type App, Notice, type TFile } from "obsidian";
import type { ValeonApi } from "../api/client";
import type { SchemaCache } from "../api/schema-cache";
import { parseNote } from "../lib/frontmatter";
import { lintPost } from "../lib/lint";
import { slugFromFolder } from "../lib/slug";
import { LintPanel } from "../ui/lint-panel";

export async function runLint(args: {
	app: App;
	file: TFile;
	cache: SchemaCache;
	// Optional: when present, lint validates cross-post blog-URL refs
	// against the server. When absent (e.g. user invokes lint without
	// having configured an API token), the URL/URI checks are skipped
	// but folder-path refs are still validated locally.
	api?: ValeonApi | null;
}) {
	if (!args.cache.schema || !args.cache.taxonomy) {
		new Notice("Valeon: schema cache empty. Run 'Sync template from server'.");
		return;
	}
	const folderPath = args.file.parent?.path ?? "";
	const folderName = folderPath.split("/").pop() ?? folderPath;
	const slug = slugFromFolder(folderName);
	const raw = await args.app.vault.read(args.file);
	const parsed = parseNote(raw);
	const issues = await lintPost({
		folderPath,
		frontmatter: parsed.frontmatter,
		slug,
		body: parsed.body,
		schema: args.cache.schema,
		taxonomy: args.cache.taxonomy,
		vault: args.app.vault,
		sourceFile: args.file,
		api: args.api ?? null,
	});
	new LintPanel(args.app, args.file.path, issues).open();
}
