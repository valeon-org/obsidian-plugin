import { type App, Modal } from "obsidian";

export type ConflictChoice = "backup" | "force" | "cancel";

export class ConflictModal extends Modal {
	private resolved = false;
	constructor(
		app: App,
		private readonly filePath: string,
		private readonly onResolve: (choice: ConflictChoice) => void,
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Valeon: Pull conflict" });
		contentEl.createEl("p", { text: this.filePath });
		contentEl.createEl("p", {
			text: "This file has local edits that haven't been pushed AND the remote has newer changes. Choose how to proceed.",
		});

		const buttonRow = contentEl.createDiv({ cls: "valeon-conflict-buttons" });
		buttonRow.style.display = "flex";
		buttonRow.style.gap = "8px";
		buttonRow.style.marginTop = "16px";
		buttonRow.style.justifyContent = "flex-end";

		this.button(buttonRow, "Cancel", "cancel");
		this.button(buttonRow, "Force pull, discard local", "force", "destructive");
		this.button(buttonRow, "Save local as backup & pull", "backup", "primary");
	}

	private button(
		parent: HTMLElement,
		label: string,
		choice: ConflictChoice,
		emphasis?: "primary" | "destructive",
	) {
		const btn = parent.createEl("button", { text: label });
		if (emphasis === "primary") btn.classList.add("mod-cta");
		if (emphasis === "destructive") btn.classList.add("mod-warning");
		btn.addEventListener("click", () => {
			if (this.resolved) return;
			this.resolved = true;
			this.onResolve(choice);
			this.close();
		});
	}

	onClose() {
		this.contentEl.empty();
		if (!this.resolved) {
			this.resolved = true;
			this.onResolve("cancel");
		}
	}
}
