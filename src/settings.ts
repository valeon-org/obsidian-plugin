import { type App, Notice, PluginSettingTab, Setting } from "obsidian";
import type ValeonPlugin from "./main";

export type ValeonSettings = {
	apiToken: string;
};

export const DEFAULT_SETTINGS: ValeonSettings = {
	apiToken: "",
};

export class ValeonSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: ValeonPlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		new Setting(containerEl).setName("Valeon publishing").setHeading();

		new Setting(containerEl)
			.setName("API token")
			.setDesc(
				"Paste once — only the prefix is displayed afterwards. Create one at /settings/api-keys on the dashboard.",
			)
			.addText((t) => {
				t.setPlaceholder("vln_...");
				const current = this.plugin.settings.apiToken;
				if (current) {
					t.inputEl.type = "password";
					t.setValue(current);
				}
				t.onChange(async (v) => {
					this.plugin.settings.apiToken = v.trim();
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Test connection")
			.setDesc("Calls /whoami to verify the token works.")
			.addButton((b) =>
				b.setButtonText("Test").onClick(async () => {
					try {
						const api = this.plugin.getApi();
						const who = await api.whoami();
						new Notice(
							`Connected as ${who.authorName} (${who.authorSlug}) — token "${who.tokenName}".`,
							8000,
						);
					} catch (err) {
						new Notice(
							`Connection failed: ${err instanceof Error ? err.message : String(err)}`,
							8000,
						);
					}
				}),
			);
	}
}
