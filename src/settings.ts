import {
	type App,
	Notice,
	PluginSettingTab,
	Setting,
	type SettingDefinitionItem,
} from "obsidian";
import type ValeonPlugin from "./main";

export type ValeonSettings = {
	apiToken: string;
};

export const DEFAULT_SETTINGS: ValeonSettings = {
	apiToken: "",
};

const TOKEN_NAME = "API token";
const TOKEN_DESC =
	"Paste once — only the prefix is displayed afterwards. Create one at /settings/api-keys on the dashboard.";
const TEST_NAME = "Test connection";
const TEST_DESC = "Calls /whoami to verify the token works.";

export class ValeonSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: ValeonPlugin,
	) {
		super(app, plugin);
	}

	/**
	 * Declarative settings (Obsidian 1.13+), so the rows show up in
	 * settings search. Both rows render imperatively: the token input
	 * must stay a password field, which no declarative control offers.
	 */
	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				type: "group",
				heading: "Publishing",
				items: [
					{
						name: TOKEN_NAME,
						desc: TOKEN_DESC,
						aliases: ["token", "key", "api key"],
						render: (setting) => this.tokenInput(setting),
					},
					{
						name: TEST_NAME,
						desc: TEST_DESC,
						aliases: ["whoami", "connection"],
						render: (setting) => this.testButton(setting),
					},
				],
			},
		];
	}

	/** Fallback for Obsidian before 1.13, which has no declarative settings. */
	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		new Setting(containerEl).setName("Publishing").setHeading();
		this.tokenInput(
			new Setting(containerEl).setName(TOKEN_NAME).setDesc(TOKEN_DESC),
		);
		this.testButton(
			new Setting(containerEl).setName(TEST_NAME).setDesc(TEST_DESC),
		);
	}

	private tokenInput(setting: Setting): void {
		setting.addText((t) => {
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
	}

	private testButton(setting: Setting): void {
		setting.addButton((b) =>
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
