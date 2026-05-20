import { Modal, Notice, Plugin, TFile } from "obsidian";
import { ValeonApi } from "./api/client";

declare const __VALEON_API_BASE_URL__: string;
declare const __VALEON_DASHBOARD_BASE_URL__: string;
import { type PersistedCache, SchemaCache } from "./api/schema-cache";
import { runLint } from "./commands/lint-post";
import { runNewPost } from "./commands/new-post";
import { runOpenInDashboard } from "./commands/open-in-dashboard";
import { runPublish } from "./commands/publish";
import {
	runPullMetadata,
	runPullMetadataVault,
} from "./commands/pull-metadata";
import { pullCurrentFile } from "./commands/pull-post";
import { runReconcile } from "./commands/reconcile-vault";
import { runRestoreVault } from "./commands/restore-vault";
import { runSlugifyCurrent, runSlugifyVault } from "./commands/slugify-tags";
import { runSyncTemplate } from "./commands/sync-template";
import { runSyncVault } from "./commands/sync-vault";
import { parseNote } from "./lib/frontmatter";
import { sha256Hex } from "./lib/sha256";
import {
	DEFAULT_SETTINGS,
	ValeonSettingTab,
	type ValeonSettings,
} from "./settings";
import { computeStatus, renderStatus } from "./ui/status-bar";

type PersistedData = {
	settings: ValeonSettings;
	cache: PersistedCache;
};

export default class ValeonPlugin extends Plugin {
	settings: ValeonSettings = DEFAULT_SETTINGS;
	cache: SchemaCache = new SchemaCache(null);
	private statusBarEl: HTMLElement | null = null;

	async onload() {
		await this.loadData_();
		this.statusBarEl = this.addStatusBarItem();
		this.statusBarEl.addClass("valeon-status");

		this.addSettingTab(new ValeonSettingTab(this.app, this));
		this.registerCommands();

		this.registerEvent(
			this.app.workspace.on("file-open", () => this.refreshStatus()),
		);
		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (
					file instanceof TFile &&
					file === this.app.workspace.getActiveFile()
				) {
					this.refreshStatus();
				}
			}),
		);
		this.refreshStatus();
	}

	onunload() {
		this.statusBarEl?.remove();
		this.statusBarEl = null;
	}

	async loadData_() {
		const data = ((await this.loadData()) ?? {}) as Partial<PersistedData>;
		this.settings = { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) };
		this.cache = new SchemaCache(data.cache ?? null);
	}

	async saveSettings() {
		await this.saveData({
			settings: this.settings,
			cache: this.cache.getPersisted(),
		});
	}

	async saveCache() {
		await this.saveData({
			settings: this.settings,
			cache: this.cache.getPersisted(),
		});
	}

	getApi(): ValeonApi {
		if (!this.settings.apiToken) {
			throw new Error("Set the API token in Valeon settings.");
		}
		return new ValeonApi({
			baseUrl: __VALEON_API_BASE_URL__,
			token: this.settings.apiToken,
		});
	}

	private registerCommands() {
		this.addCommand({
			id: "new-post",
			name: "New post",
			callback: () => {
				runNewPost({
					app: this.app,
					cache: this.cache,
					getTitle: () => promptForText(this.app, "New post title"),
				});
			},
		});

		this.addCommand({
			id: "lint-post",
			name: "Lint post",
			checkCallback: (checking) => {
				const file = this.activeMarkdownFile();
				if (!file) return false;
				if (!checking) {
					runLint({ app: this.app, file, cache: this.cache });
				}
				return true;
			},
		});

		this.addCommand({
			id: "slugify-tags-current",
			name: "Slugify tags (current file)",
			checkCallback: (checking) => {
				const file = this.activeMarkdownFile();
				if (!file) return false;
				if (!checking) {
					runSlugifyCurrent({ vault: this.app.vault, file });
				}
				return true;
			},
		});

		this.addCommand({
			id: "slugify-tags-vault",
			name: "Slugify tags (vault)",
			callback: () => {
				runSlugifyVault({ vault: this.app.vault });
			},
		});

		this.addCommand({
			id: "publish",
			name: "Publish",
			checkCallback: (checking) => {
				const file = this.activeMarkdownFile();
				if (!file) return false;
				if (!checking) {
					this.safeRun(() =>
						runPublish({
							app: this.app,
							file,
							api: this.getApi(),
							cache: this.cache,
						}).then(() => this.refreshStatus()),
					);
				}
				return true;
			},
		});

		this.addCommand({
			id: "pull-post-published",
			name: "Pull post (published)",
			checkCallback: (checking) => {
				const file = this.activeMarkdownFile();
				if (!file) return false;
				if (!checking) {
					this.safeRun(() =>
						pullCurrentFile({
							app: this.app,
							file,
							api: this.getApi(),
							options: { include: "published", conflictPolicy: "prompt" },
						}).then((r) => this.afterPull(r)),
					);
				}
				return true;
			},
		});

		this.addCommand({
			id: "pull-post-draft",
			name: "Pull post (draft buffer)",
			checkCallback: (checking) => {
				const file = this.activeMarkdownFile();
				if (!file) return false;
				if (!checking) {
					this.safeRun(() =>
						pullCurrentFile({
							app: this.app,
							file,
							api: this.getApi(),
							options: { include: "draft", conflictPolicy: "prompt" },
						}).then((r) => this.afterPull(r)),
					);
				}
				return true;
			},
		});

		this.addCommand({
			id: "pull-metadata",
			name: "Pull metadata",
			checkCallback: (checking) => {
				const file = this.activeMarkdownFile();
				if (!file) return false;
				if (!checking) {
					this.safeRun(() =>
						runPullMetadata({
							app: this.app,
							file,
							api: this.getApi(),
						}).then(() => this.refreshStatus()),
					);
				}
				return true;
			},
		});

		this.addCommand({
			id: "sync-vault",
			name: "Sync vault",
			callback: () => {
				this.safeRun(() =>
					runSyncVault({ app: this.app, api: this.getApi() }).then(() =>
						this.refreshStatus(),
					),
				);
			},
		});

		this.addCommand({
			id: "sync-template",
			name: "Sync template from server",
			callback: () => {
				this.safeRun(() =>
					runSyncTemplate({
						app: this.app,
						api: this.getApi(),
						cache: this.cache,
						save: () => this.saveCache(),
					}),
				);
			},
		});

		this.addCommand({
			id: "reconcile-vault-dry-run",
			name: "Reconcile vault (preview)",
			callback: () => {
				this.safeRun(() =>
					runReconcile({
						app: this.app,
						api: this.getApi(),
						mode: "dry-run",
					}),
				);
			},
		});

		this.addCommand({
			id: "reconcile-vault-apply",
			name: "Reconcile vault (apply)",
			callback: () => {
				this.safeRun(() =>
					runReconcile({
						app: this.app,
						api: this.getApi(),
						mode: "apply",
					}).then(() => this.refreshStatus()),
				);
			},
		});

		this.addCommand({
			id: "restore-vault",
			name: "Restore vault from server",
			callback: () => {
				this.safeRun(() =>
					runRestoreVault({ app: this.app, api: this.getApi() }).then(() =>
						this.refreshStatus(),
					),
				);
			},
		});

		this.addCommand({
			id: "pull-metadata-vault",
			name: "Pull metadata (vault)",
			callback: () => {
				this.safeRun(() =>
					runPullMetadataVault({
						app: this.app,
						api: this.getApi(),
					}).then(() => this.refreshStatus()),
				);
			},
		});

		this.addCommand({
			id: "open-in-dashboard",
			name: "Open in dashboard",
			checkCallback: (checking) => {
				const file = this.activeMarkdownFile();
				if (!file) return false;
				if (!checking) {
					runOpenInDashboard({
						app: this.app,
						file,
						dashboardBaseUrl: __VALEON_DASHBOARD_BASE_URL__,
					});
				}
				return true;
			},
		});
	}

	private activeMarkdownFile(): TFile | null {
		const f = this.app.workspace.getActiveFile();
		return f && f.extension === "md" ? f : null;
	}

	private async afterPull(result: { kind: string }) {
		if (result.kind === "up-to-date") new Notice("Valeon: already up to date.");
		this.refreshStatus();
	}

	private safeRun(task: () => Promise<unknown>) {
		task().catch((err) => {
			new Notice(
				`Valeon: ${err instanceof Error ? err.message : String(err)}`,
				10000,
			);
		});
	}

	private async refreshStatus() {
		if (!this.statusBarEl) return;
		const file = this.activeMarkdownFile();
		if (!file) {
			renderStatus(this.statusBarEl, { kind: "no-file" });
			return;
		}
		try {
			const raw = await this.app.vault.read(file);
			const parsed = parseNote(raw);
			const bodyHash = await sha256Hex(parsed.body);
			renderStatus(
				this.statusBarEl,
				computeStatus({
					file,
					valeon: parsed.valeon,
					localBodyHash: bodyHash,
				}),
			);
		} catch {
			renderStatus(this.statusBarEl, { kind: "no-file" });
		}
	}
}

function promptForText(app: App_, label: string): Promise<string | null> {
	return new Promise((resolve) => {
		const modal = new PromptModal(app, label, resolve);
		modal.open();
	});
}

type App_ = ConstructorParameters<typeof Modal>[0];

class PromptModal extends Modal {
	private value = "";
	private resolved = false;
	constructor(
		app: App_,
		private readonly label: string,
		private readonly onResolve: (text: string | null) => void,
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: this.label });
		const input = contentEl.createEl("input", { type: "text" });
		input.style.width = "100%";
		input.style.padding = "8px";
		input.addEventListener("input", (e) => {
			this.value = (e.target as HTMLInputElement).value;
		});
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") this.commit();
			if (e.key === "Escape") this.cancel();
		});
		setTimeout(() => input.focus(), 50);

		const row = contentEl.createDiv();
		row.style.marginTop = "12px";
		row.style.display = "flex";
		row.style.justifyContent = "flex-end";
		row.style.gap = "8px";
		const cancel = row.createEl("button", { text: "Cancel" });
		cancel.addEventListener("click", () => this.cancel());
		const ok = row.createEl("button", { text: "Create" });
		ok.classList.add("mod-cta");
		ok.addEventListener("click", () => this.commit());
	}

	private commit() {
		if (this.resolved) return;
		this.resolved = true;
		this.onResolve(this.value.trim() || null);
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
