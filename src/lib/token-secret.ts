/*
 * The API token lives in Obsidian's secret storage (1.11.4+), not in
 * the plugin's data.json, which sits inside the vault and syncs with
 * it. Settings hold only the secret's name; any plugin can reference a
 * secret by name, and the user picks or creates it with a
 * SecretComponent.
 *
 * Installs from before 1.8.0 kept the token itself in
 * `settings.apiToken`. `migrateLegacyToken` moves it once.
 */

/** The subset of Obsidian's SecretStorage this module uses. */
export type SecretStore = {
	getSecret(id: string): string | null;
	setSecret(id: string, secret: string): void;
};

/** Name the migrated token is saved under (lowercase, dashes: Obsidian's id rule). */
export const DEFAULT_TOKEN_SECRET = "valeon-api-token";

export type TokenSettings = {
	/** Name of the secret holding the API token. */
	apiTokenSecret: string;
	/** Pre-1.8.0 plaintext token; blank once migrated. */
	apiToken?: string;
};

/**
 * Move a plaintext token from settings into secret storage. Writes to
 * a free name (never overwriting a different secret), and only blanks
 * the plaintext copy after reading the secret back. Idempotent: with no
 * plaintext token it changes nothing. Returns the settings to persist,
 * or null when there was nothing to migrate.
 */
export function migrateLegacyToken<T extends TokenSettings>(
	settings: T,
	store: SecretStore,
): T | null {
	const legacy = settings.apiToken?.trim();
	if (!legacy) return null;

	const base = settings.apiTokenSecret || DEFAULT_TOKEN_SECRET;
	let id = base;
	for (let n = 2; ; n++) {
		const existing = store.getSecret(id);
		if (!existing || existing === legacy) break;
		id = `${base}-${n}`;
	}
	if (store.getSecret(id) !== legacy) store.setSecret(id, legacy);
	if (store.getSecret(id) !== legacy) {
		throw new Error("The API token could not be saved to secret storage.");
	}
	return { ...settings, apiTokenSecret: id, apiToken: "" };
}

/** The token named by settings, or null if none is set on this device. */
export function readToken(
	settings: TokenSettings,
	store: SecretStore,
): string | null {
	if (!settings.apiTokenSecret) return null;
	return store.getSecret(settings.apiTokenSecret)?.trim() || null;
}
