import { type App, Notice } from "obsidian";
import type { SchemaCache } from "../api/schema-cache";
import { makeDatedFolder, todayUtc } from "../lib/slug";

/*
 * `Valeon: New post` — replaces createDatedPostFolder.js.
 *
 * Prompts for a title, creates `YYYY-MM-DD-{slug}/post.md`, populates
 * the frontmatter from the cached server schema (so newly added
 * required fields automatically appear in new posts), and opens it.
 */

export async function runNewPost(args: {
	app: App;
	cache: SchemaCache;
	getTitle: () => Promise<string | null>;
}) {
	const title = await args.getTitle();
	if (!title || !title.trim()) return;

	const folder = makeDatedFolder(title.trim());
	const filePath = `${folder}/post.md`;

	const vault = args.app.vault;
	if (!(await vault.adapter.exists(folder))) {
		await vault.createFolder(folder);
	}

	if (vault.getAbstractFileByPath(filePath)) {
		new Notice(`Post already exists: ${filePath}`);
		const f = vault.getAbstractFileByPath(filePath);
		if (f && "stat" in f)
			await args.app.workspace.getLeaf(true).openFile(f as never);
		return;
	}

	const initial = renderTemplate(title.trim(), args.cache);
	await vault.create(filePath, initial);
	const f = vault.getAbstractFileByPath(filePath);
	if (f && "stat" in f) {
		await args.app.workspace.getLeaf(true).openFile(f as never);
	}
}

function renderTemplate(title: string, cache: SchemaCache): string {
	const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
	const date = todayUtc();
	const categories = cache.taxonomy?.categories.map((c) => `  - ${c.slug}`) ?? [
		"  - economy-and-finance",
	];
	return `---
title: "${title.replace(/"/g, '\\"')}"
pubDate: ${now}
updatedDate: ${now}
excerpt: >-
  Write a 1–2 sentence summary here.
cover: ./cover.png
coverAlt: ""
author: ${cache.whoami?.authorSlug ?? "sayed-hamid-fatimi"}
featured: false
tts: true
categories:
${categories.join("\n")}
tags: []
---

`;
}
