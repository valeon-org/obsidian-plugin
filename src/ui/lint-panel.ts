import { type App, Modal } from "obsidian";
import type { LintIssue } from "../lib/lint";

export class LintPanel extends Modal {
	constructor(
		app: App,
		private readonly filePath: string,
		private readonly issues: LintIssue[],
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Valeon: Lint results" });
		contentEl.createEl("p", {
			text: this.filePath,
			cls: "valeon-lint-file",
		});

		if (this.issues.length === 0) {
			contentEl.createEl("p", {
				text: "No issues — ready to publish.",
				cls: "valeon-lint-ok",
			});
			return;
		}

		const errors = this.issues.filter((i) => i.severity === "error");
		const warnings = this.issues.filter((i) => i.severity === "warning");

		if (errors.length > 0) {
			contentEl.createEl("h3", {
				text: `Errors (${errors.length})`,
				cls: "valeon-lint-error-heading",
			});
			const ul = contentEl.createEl("ul");
			for (const issue of errors) {
				const li = ul.createEl("li");
				li.createEl("strong", { text: `${issue.field}: ` });
				li.appendText(issue.message);
			}
		}

		if (warnings.length > 0) {
			contentEl.createEl("h3", {
				text: `Warnings (${warnings.length})`,
				cls: "valeon-lint-warning-heading",
			});
			const ul = contentEl.createEl("ul");
			for (const issue of warnings) {
				const li = ul.createEl("li");
				li.createEl("strong", { text: `${issue.field}: ` });
				li.appendText(issue.message);
			}
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}
