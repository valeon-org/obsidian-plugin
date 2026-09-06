import { type App, Modal, Notice, Setting } from "obsidian";
import type { AxisCatalog, Coordinate, PresetMeta } from "../api/types";

export type GenerateCoverResult = Coordinate & {
	subject: string;
	presetId?: string;
};

/*
 * Modal for the "Generate cover with AI" command.
 *
 * A cover is a coordinate in four axes rather than a named style, so all
 * four dropdowns are always present — the old conditional sub-control
 * (variant for some styles, hue for one) has no equivalent here, and
 * with it goes the divergence where this modal used `else if` while the
 * dashboard rendered both.
 *
 * The modal opens on a coordinate the server proposed, avoiding the
 * publication's recent covers. Presets set all four axes at once for an
 * author who wants one of the old looks back.
 */
export class GenerateCoverModal extends Modal {
	private resolved = false;
	private subject: string;
	private coordinate: Coordinate;
	private presetId = "";
	private axisRowsEl: HTMLElement | null = null;

	constructor(
		app: App,
		private readonly axes: AxisCatalog,
		private readonly presets: PresetMeta[],
		defaultSubject: string,
		proposed: Coordinate,
		private readonly onResolve: (result: GenerateCoverResult | null) => void,
	) {
		super(app);
		this.subject = defaultSubject;
		this.coordinate = { ...proposed };
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Generate cover image" });
		contentEl.createEl("p", {
			text: 'Describe the subject. The four axes govern only how it is drawn — they never add objects of their own. "No text" is enforced automatically.',
			cls: "setting-item-description",
		});

		new Setting(contentEl)
			.setName("Subject")
			.setDesc("What the cover is about, in a sentence.")
			.addTextArea((ta) => {
				ta.setValue(this.subject);
				ta.onChange((v) => {
					this.subject = v;
				});
				ta.inputEl.rows = 3;
				ta.inputEl.addClass("valeon-full-width");
			});

		contentEl.createEl("p", {
			text: "Proposed for you, avoiding recent covers.",
			cls: "setting-item-description",
		});

		this.axisRowsEl = contentEl.createDiv();
		this.renderAxisRows();

		if (this.presets.length > 0) {
			new Setting(contentEl)
				.setName("Or start from a preset")
				.setDesc("Sets all four axes at once.")
				.addDropdown((dd) => {
					dd.addOption("", "None — use the axes above");
					for (const p of this.presets) dd.addOption(p.id, p.name);
					dd.setValue(this.presetId);
					dd.onChange((id) => {
						this.presetId = id;
						const preset = this.presets.find((p) => p.id === id);
						if (preset) {
							this.coordinate = { ...preset.coordinate };
							this.renderAxisRows();
						}
					});
				});
		}

		const row = contentEl.createDiv({ cls: "valeon-modal-button-row" });
		const cancel = row.createEl("button", { text: "Cancel" });
		cancel.addEventListener("click", () => this.cancel());
		const ok = row.createEl("button", { text: "Generate" });
		ok.classList.add("mod-cta");
		ok.addEventListener("click", () => this.commit());
	}

	/** Re-rendered wholesale when a preset changes all four at once. */
	private renderAxisRows() {
		if (!this.axisRowsEl) return;
		this.axisRowsEl.empty();
		const rows: { key: keyof Coordinate; label: string }[] = [
			{ key: "palette", label: "Palette" },
			{ key: "technique", label: "Technique" },
			{ key: "composition", label: "Composition" },
			{ key: "treatment", label: "Treatment" },
		];
		const options: Record<keyof Coordinate, { id: string; name: string }[]> = {
			palette: this.axes.palettes,
			technique: this.axes.techniques,
			composition: this.axes.compositions,
			treatment: this.axes.treatments,
		};
		for (const { key, label } of rows) {
			new Setting(this.axisRowsEl).setName(label).addDropdown((dd) => {
				for (const o of options[key]) dd.addOption(o.id, o.name);
				dd.setValue(this.coordinate[key]);
				dd.onChange((value) => {
					this.coordinate[key] = value;
					// Editing an axis breaks the preset, so stop claiming one.
					this.presetId = "";
				});
			});
		}
	}

	private commit() {
		if (this.resolved) return;
		const subject = this.subject.trim();
		if (!subject) {
			new Notice("Valeon: a subject is required.");
			return;
		}
		const missing = (
			["palette", "technique", "composition", "treatment"] as const
		).filter((key) => !this.coordinate[key]);
		if (missing.length > 0) {
			new Notice(`Valeon: choose a ${missing[0]}.`);
			return;
		}
		this.resolved = true;
		this.onResolve({
			subject,
			...this.coordinate,
			presetId: this.presetId || undefined,
		});
		this.close();
	}

	private cancel() {
		if (this.resolved) return;
		this.resolved = true;
		this.onResolve(null);
		this.close();
	}

	onClose() {
		this.contentEl.empty();
		if (!this.resolved) {
			this.resolved = true;
			this.onResolve(null);
		}
	}
}
