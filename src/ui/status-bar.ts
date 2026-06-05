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
	el.removeClasses([
		"valeon-status--muted",
		"valeon-status--success",
		"valeon-status--warning",
	]);
	const dot = el.createSpan({ text: "●", cls: "valeon-status-dot" });
	switch (state.kind) {
		case "no-file":
			el.addClass("valeon-status--muted");
			el.appendText("Valeon");
			return;
		case "unlinked":
			dot.addClass("valeon-status--muted");
			el.appendText("Unlinked");
			return;
		case "synced":
			dot.addClass("valeon-status--success");
			el.appendText("Linked");
			return;
		case "local-newer":
			dot.addClass("valeon-status--warning");
			el.appendText("Local edits unsaved");
			return;
		case "remote-newer":
			dot.addClass("valeon-status--warning");
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
