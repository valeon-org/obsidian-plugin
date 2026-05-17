import { type App, Notice, type TFile } from "obsidian";
import { parseNote } from "../lib/frontmatter";

export async function runOpenInDashboard(args: {
	app: App;
	file: TFile;
	dashboardBaseUrl: string;
}) {
	const raw = await args.app.vault.read(args.file);
	const parsed = parseNote(raw);
	if (!parsed.valeon.postId) {
		new Notice("Valeon: this post is not linked yet.");
		return;
	}
	const base = args.dashboardBaseUrl.replace(/\/+$/, "");
	window.open(`${base}/posts/${parsed.valeon.postId}`, "_blank");
}
