import { type App, Notice, type TFile } from "obsidian";
import type { SchemaCache } from "../api/schema-cache";
import { parseNote } from "../lib/frontmatter";
import { lintPost } from "../lib/lint";
import { slugFromFolder } from "../lib/slug";
import { LintPanel } from "../ui/lint-panel";

export async function runLint(args: {
	app: App;
	file: TFile;
	cache: SchemaCache;
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
	});
	new LintPanel(args.app, args.file.path, issues).open();
}
