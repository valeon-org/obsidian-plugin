import {
	type App,
	Notice,
	PluginSettingTab,
	SecretComponent,
	Setting,
	type SettingDefinitionItem,
} from "obsidian";
import type { TokenSettings } from "./lib/token-secret";
import type ValeonPlugin from "./main";

export type ValeonSettings = TokenSettings;

export const DEFAULT_SETTINGS: ValeonSettings = {
	apiTokenSecret: "",
};

const TOKEN_NAME = "API token";
const TOKEN_DESC =
	"Pick or create the secret that holds your API token. Create a token at /settings/api-keys on the dashboard. Secrets live in Obsidian's secret storage on this device, not in your vault.";
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
	 * settings search. Both rows render imperatively: the token is a
	 * SecretComponent and the test is a button, neither of which has a
	 * declarative control.
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
						aliases: ["token", "key", "api key", "secret"],
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

	/** Fallback for Obsidian 1.11.4–1.12, which has no declarative settings. */
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
		setting.addComponent((el) =>
			new SecretComponent(this.app, el)
				.setValue(this.plugin.settings.apiTokenSecret)
				.onChange(async (name) => {
					this.plugin.settings.apiTokenSecret = name;
					await this.plugin.saveSettings();
				}),
		);
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
