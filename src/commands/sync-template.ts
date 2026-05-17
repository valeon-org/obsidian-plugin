import { type App, Notice } from "obsidian";
import type { ValeonApi } from "../api/client";
import type { SchemaCache } from "../api/schema-cache";

/*
 * `Valeon: Sync template from server` — refreshes the schema/taxonomy
 * cache and regenerates `_templates/post.frontmatter.template.md`.
 */

export async function runSyncTemplate(args: {
	app: App;
	api: ValeonApi;
	cache: SchemaCache;
	save: () => Promise<void>;
}) {
	await args.cache.refresh(args.api);
	await args.save();
	const path = await writeTemplate(args.app, args.cache);
	new Notice(`Valeon: template synced. Wrote ${path}.`);
}

async function writeTemplate(app: App, cache: SchemaCache): Promise<string> {
	const dir = "_templates";
	if (!(await app.vault.adapter.exists(dir))) {
		await app.vault.createFolder(dir);
	}
	const path = `${dir}/post.frontmatter.template.md`;

	const categoryLines =
		cache.taxonomy?.categories.map((c) => `  - ${c.slug}`).join("\n") ??
		"  - economy-and-finance";
	const author = cache.whoami?.authorSlug ?? "your-slug";

	const content = `---
# title — Required. Human-readable post title.
title: "The Journey Beyond"

# pubDate — Required (ISO 8601). Original publication datetime.
pubDate: 2025-01-01T00:00:00.000Z

# updatedDate — Optional (ISO 8601). Last updated datetime.
updatedDate: 2025-01-02T00:00:00.000Z

# excerpt — Required. 1–2 sentences. Used for cards/SEO.
excerpt: >-
  This is where you capture the essence of the post in a couple of lines.

# cover — Optional. Path to the cover image (relative to this folder).
cover: ./cover.png

# coverAlt — Optional. Short, descriptive alt text for the cover image.
coverAlt: "Illustration of the journey beyond"

# author — Optional. Author slug from /authors collection.
author: ${author}

# series — Optional. Link to a /series entry.
# series:
#   slug: understanding-market-mechanics
#   title: Understanding Market Mechanics
#   part: 3

# featured — Optional. Promotes the post on home/collections. Default: false.
featured: false

# tts — Optional. Enable TTS/podcast generation. Default: true.
tts: true

# podcast — Optional. Include in podcast feed. Forced false if tts=false.
podcast: true

# categories — Choose one or more from the live list:
categories:
${categoryLines}

# tags — Optional. Free-form labels (slugified by plugin).
tags: []

# canonical — Optional. Absolute canonical URL for cross-posts.
# canonical: https://valeon.blog/...
---
`;
	if (await app.vault.adapter.exists(path)) {
		const f = app.vault.getAbstractFileByPath(path);
		if (f && "stat" in f) {
			await app.vault.modify(f as never, content);
		} else {
			await app.vault.adapter.write(path, content);
		}
	} else {
		await app.vault.create(path, content);
	}
	return path;
}
