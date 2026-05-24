import { type App, Modal, Notice, Setting } from "obsidian";
import type { CoverStyleMeta } from "../api/types";

export type GenerateCoverResult = {
	prompt: string;
	styleCode: string;
	variantId?: string;
	hue?: string;
};

/*
 * Modal for the "Generate cover with AI" command. Mirrors the dashboard's
 * picker: a subject box, a style dropdown, and a conditional sub-control
 * (variant for multi-variant styles, hue for V07). Resolves the selection
 * via the onResolve callback (null on cancel).
 */
export class GenerateCoverModal extends Modal {
	private resolved = false;
	private prompt: string;
	private styleCode: string;
	private variantId = "";
	private hue = "";
	private helperEl: HTMLElement | null = null;
	private subControlEl: HTMLElement | null = null;

	constructor(
		app: App,
		private readonly styles: CoverStyleMeta[],
		defaultSubject: string,
		private readonly onResolve: (result: GenerateCoverResult | null) => void,
	) {
		super(app);
		this.prompt = defaultSubject;
		this.styleCode = styles[0]?.code ?? "";
		this.syncSubDefaults();
	}

	private selectedStyle(): CoverStyleMeta | undefined {
		return this.styles.find((s) => s.code === this.styleCode);
	}

	/** Reset variant/hue to the first option of the current style. */
	private syncSubDefaults() {
		const style = this.selectedStyle();
		this.variantId = style?.variants[0]?.id ?? "";
		this.hue = style?.hues[0]?.id ?? "";
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Generate cover image" });
		contentEl.createEl("p", {
			text: 'Describe the subject; the chosen style governs the look. "No text" is enforced automatically.',
			cls: "setting-item-description",
		});

		new Setting(contentEl)
			.setName("Subject")
			.setDesc("What the cover should depict.")
			.addTextArea((ta) => {
				ta.setValue(this.prompt);
				ta.onChange((v) => {
					this.prompt = v;
				});
				ta.inputEl.rows = 3;
				ta.inputEl.style.width = "100%";
			});

		new Setting(contentEl).setName("Style").addDropdown((dd) => {
			for (const s of this.styles) {
				dd.addOption(s.code, `${s.code} · ${s.name}`);
			}
			dd.setValue(this.styleCode);
			dd.onChange((v) => {
				this.styleCode = v;
				this.syncSubDefaults();
				this.renderHelper();
				this.renderSubControl();
			});
		});

		this.helperEl = contentEl.createEl("p", {
			cls: "setting-item-description",
		});
		this.renderHelper();

		this.subControlEl = contentEl.createDiv();
		this.renderSubControl();

		const row = contentEl.createDiv();
		row.style.marginTop = "16px";
		row.style.display = "flex";
		row.style.justifyContent = "flex-end";
		row.style.gap = "8px";
		const cancel = row.createEl("button", { text: "Cancel" });
		cancel.addEventListener("click", () => this.cancel());
		const ok = row.createEl("button", { text: "Generate" });
		ok.classList.add("mod-cta");
		ok.addEventListener("click", () => this.commit());
	}

	private renderHelper() {
		if (!this.helperEl) return;
		const style = this.selectedStyle();
		this.helperEl.setText(
			style ? `${style.register} · ${style.primaryUse}` : "",
		);
	}

	private renderSubControl() {
		if (!this.subControlEl) return;
		this.subControlEl.empty();
		const style = this.selectedStyle();
		if (!style) return;
		if (style.variants.length > 0) {
			new Setting(this.subControlEl).setName("Variant").addDropdown((dd) => {
				for (const v of style.variants) dd.addOption(v.id, v.name);
				dd.setValue(this.variantId);
				dd.onChange((val) => {
					this.variantId = val;
				});
			});
		} else if (style.hues.length > 0) {
			new Setting(this.subControlEl).setName("Hue").addDropdown((dd) => {
				for (const h of style.hues) dd.addOption(h.id, h.name);
				dd.setValue(this.hue);
				dd.onChange((val) => {
					this.hue = val;
				});
			});
		}
	}

	private commit() {
		if (this.resolved) return;
		const prompt = this.prompt.trim();
		if (!prompt || !this.styleCode) {
			new Notice("Valeon: subject and style are required.");
			return;
		}
		const style = this.selectedStyle();
		this.resolved = true;
		this.onResolve({
			prompt,
			styleCode: this.styleCode,
			variantId:
				style && style.variants.length > 0 ? this.variantId : undefined,
			hue: style && style.hues.length > 0 ? this.hue : undefined,
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
