import { type App, Modal } from "obsidian";
import type { NarrationVoice, VoiceListResponse } from "../api/types";

/*
 * Modal for the "Choose narration voice" command. The first row resets to
 * the author's default (`null`); each voice row has its description, tags
 * and a play/stop button for the server-hosted preview. One audio element
 * serves every row and is stopped when the modal closes.
 */
export class VoicePickerModal extends Modal {
	private audio: HTMLAudioElement | null = null;
	private playingId: string | null = null;
	private readonly buttons = new Map<string, HTMLButtonElement>();

	constructor(
		app: App,
		private readonly list: VoiceListResponse,
		private readonly current: string | undefined,
		private readonly onChoose: (voice: string | null) => void,
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Choose narration voice" });
		contentEl.createEl("p", {
			text: "Applies to this post's next narration. Publish to send it.",
			cls: "setting-item-description",
		});

		const defaultVoice = this.list.authorVoice ?? this.list.platformVoice;
		const listEl = contentEl.createDiv({ cls: "valeon-voice-list" });

		const reset = listEl.createDiv({
			cls: `valeon-voice-row${this.current === undefined ? " is-current" : ""}`,
		});
		const resetMain = reset.createDiv({ cls: "valeon-voice-main" });
		resetMain.createDiv({
			cls: "valeon-voice-name",
			text: `Use my default (${defaultVoice})`,
		});
		reset
			.createEl("button", { text: "Select" })
			.addEventListener("click", () => {
				this.choose(null);
			});

		for (const voice of this.list.voices) {
			this.renderVoice(listEl, voice);
		}
	}

	private renderVoice(listEl: HTMLElement, voice: NarrationVoice) {
		const row = listEl.createDiv({
			cls: `valeon-voice-row${this.current === voice.id ? " is-current" : ""}`,
		});
		const main = row.createDiv({ cls: "valeon-voice-main" });
		main.createDiv({ cls: "valeon-voice-name", text: voice.displayName });
		if (voice.description) {
			main.createDiv({
				cls: "valeon-voice-desc setting-item-description",
				text: voice.description,
			});
		}
		const tags = Object.values(voice.tags ?? {}).filter(
			(t): t is string => typeof t === "string" && t !== "",
		);
		if (tags.length > 0) {
			main.createDiv({
				cls: "valeon-voice-tags setting-item-description",
				text: tags.join(" · "),
			});
		}
		if (voice.previewUrl) {
			const url = voice.previewUrl;
			const play = row.createEl("button", {
				text: "▶",
				attr: { "aria-label": `Preview ${voice.displayName}` },
			});
			this.buttons.set(voice.id, play);
			play.addEventListener("click", () => {
				this.togglePreview(voice.id, url);
			});
		}
		row
			.createEl("button", { text: "Select", cls: "mod-cta" })
			.addEventListener("click", () => {
				this.choose(voice.id);
			});
	}

	private togglePreview(id: string, url: string) {
		const wasPlaying = this.playingId === id;
		this.stopPreview();
		if (wasPlaying) return;
		const audio = this.audio ?? new Audio();
		this.audio = audio;
		audio.src = url;
		audio.onended = () => {
			this.stopPreview();
		};
		this.playingId = id;
		this.setButton(id, "■");
		void audio.play().catch(() => {
			// A superseded play() rejects with AbortError; only reset if this
			// preview is still the current one.
			if (this.playingId === id) this.stopPreview();
		});
	}

	private stopPreview() {
		if (this.audio) {
			this.audio.pause();
			this.audio.onended = null;
		}
		if (this.playingId) this.setButton(this.playingId, "▶");
		this.playingId = null;
	}

	private setButton(id: string, glyph: string) {
		this.buttons.get(id)?.setText(glyph);
	}

	private choose(voice: string | null) {
		this.close();
		this.onChoose(voice);
	}

	onClose() {
		this.stopPreview();
		this.audio = null;
		this.buttons.clear();
		this.contentEl.empty();
	}
}
