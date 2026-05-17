import { Notice, type TFile, type Vault } from "obsidian";
import { slugify } from "../lib/slug";

/*
 * `Valeon: Slugify tags` — kebab-cases all tag values in the
 * frontmatter `tags:` block of the current file (or vault-wide).
 *
 * Operates on raw text so it preserves linter-mandated key order and
 * any block-vs-inline array style choices. Tags are de-duplicated and
 * sorted only if they were already in block list form (single-line
 * inline `tags: [a, b]` is preserved as-is to avoid rewriting style).
 */

export function slugifyTagsInText(raw: string): {
	changed: boolean;
	out: string;
} {
	const lines = raw.split("\n");
	// Find frontmatter block.
	if (lines[0]?.trim() !== "---") return { changed: false, out: raw };
	let end = -1;
	for (let i = 1; i < lines.length; i++) {
		if (lines[i].trim() === "---") {
			end = i;
			break;
		}
	}
	if (end === -1) return { changed: false, out: raw };

	// Look for tags: line.
	let tagsLineIdx = -1;
	for (let i = 1; i < end; i++) {
		if (/^tags\s*:/.test(lines[i])) {
			tagsLineIdx = i;
			break;
		}
	}
	if (tagsLineIdx === -1) return { changed: false, out: raw };

	const tagsLine = lines[tagsLineIdx];
	const afterColon = tagsLine.replace(/^tags\s*:\s*/, "");

	if (afterColon.trim().startsWith("[")) {
		// Inline array. Slugify each item.
		const m = afterColon.match(/^\[(.*)\](\s*)$/);
		if (!m) return { changed: false, out: raw };
		const items = m[1]
			.split(",")
			.map((s) => s.trim().replace(/^["']|["']$/g, ""))
			.filter(Boolean)
			.map(slugify)
			.filter(Boolean);
		const uniq = Array.from(new Set(items));
		const replacement = `tags: [${uniq.join(", ")}]`;
		if (replacement === tagsLine) return { changed: false, out: raw };
		lines[tagsLineIdx] = replacement;
		return { changed: true, out: lines.join("\n") };
	}

	if (afterColon.trim() === "" || afterColon.trim() === "[]") {
		// Block list follows OR empty inline. Look for following `- ` lines.
		const blockLines: number[] = [];
		for (let i = tagsLineIdx + 1; i < end; i++) {
			if (/^\s*-\s+/.test(lines[i])) {
				blockLines.push(i);
				continue;
			}
			if (/^\s*$/.test(lines[i])) continue;
			break;
		}
		if (blockLines.length === 0) {
			// Empty or `[]`. Nothing to slugify.
			return { changed: false, out: raw };
		}
		const seen = new Set<string>();
		let changed = false;
		const newLines: string[] = [];
		for (const idx of blockLines) {
			const rawItem = lines[idx].replace(/^\s*-\s+/, "").trim();
			const cleaned = rawItem.replace(/^["']|["']$/g, "");
			const slug = slugify(cleaned);
			if (!slug || seen.has(slug)) {
				changed = true;
				continue;
			}
			seen.add(slug);
			const fresh = `  - ${slug}`;
			if (fresh !== lines[idx]) changed = true;
			newLines.push(fresh);
		}
		if (!changed && newLines.length === blockLines.length) {
			return { changed: false, out: raw };
		}
		const head = lines.slice(0, tagsLineIdx + 1);
		const tail = lines.slice(blockLines[blockLines.length - 1] + 1);
		return {
			changed: true,
			out: [...head, ...newLines, ...tail].join("\n"),
		};
	}

	return { changed: false, out: raw };
}

export async function runSlugifyCurrent(args: {
	vault: Vault;
	file: TFile;
}): Promise<void> {
	const raw = await args.vault.read(args.file);
	const result = slugifyTagsInText(raw);
	if (!result.changed) {
		new Notice("Tags already slugified.");
		return;
	}
	await args.vault.modify(args.file, result.out);
	new Notice("Slugified tags.");
}

export async function runSlugifyVault(args: { vault: Vault }): Promise<void> {
	const files = args.vault.getMarkdownFiles();
	let touched = 0;
	for (const file of files) {
		const raw = await args.vault.read(file);
		const result = slugifyTagsInText(raw);
		if (result.changed) {
			await args.vault.modify(file, result.out);
			touched++;
		}
	}
	new Notice(`Slugified tags in ${touched} file${touched === 1 ? "" : "s"}.`);
}
