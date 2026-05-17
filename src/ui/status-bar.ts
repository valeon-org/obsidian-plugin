import type { TFile } from "obsidian";
import type { ValeonMeta } from "../lib/frontmatter";

/*
 * Status bar renderer. Reflects the current note's link state:
 *   ● Unlinked
 *   ● Linked: published
 *   ● Linked: edits unsaved
 *   ● Linked: remote newer
 */

export type StatusState =
	| { kind: "no-file" }
	| { kind: "unlinked" }
	| { kind: "synced" }
	| { kind: "local-newer" }
	| { kind: "remote-newer" };

export function renderStatus(el: HTMLElement, state: StatusState) {
	el.empty();
	const dot = el.createSpan({ text: "●" });
	dot.style.marginRight = "4px";
	switch (state.kind) {
		case "no-file":
			el.style.color = "var(--text-muted)";
			el.appendText("Valeon");
			return;
		case "unlinked":
			dot.style.color = "var(--text-muted)";
			el.appendText("Unlinked");
			return;
		case "synced":
			dot.style.color = "var(--text-success, #2ea043)";
			el.appendText("Linked");
			return;
		case "local-newer":
			dot.style.color = "var(--text-warning, #f0b72f)";
			el.appendText("Local edits unsaved");
			return;
		case "remote-newer":
			dot.style.color = "var(--text-warning, #f0b72f)";
			el.appendText("Remote has newer");
			return;
	}
}

export function computeStatus(args: {
	file: TFile | null;
	valeon: ValeonMeta | undefined;
	localBodyHash: string | null;
}): StatusState {
	if (!args.file) return { kind: "no-file" };
	const v = args.valeon;
	if (!v?.postId) return { kind: "unlinked" };
	if (
		args.localBodyHash &&
		v.lastPushedBodyHash &&
		args.localBodyHash !== v.lastPushedBodyHash
	) {
		return { kind: "local-newer" };
	}
	return { kind: "synced" };
}
