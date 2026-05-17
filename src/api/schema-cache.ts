import type { ValeonApi } from "./client";
import type { ServerSchema, Taxonomy, Whoami } from "./types";

/*
 * In-memory cache for the server's schema + taxonomy + identity.
 * Persisted to plugin storage between sessions so commands work
 * offline (lint, slugify, new-post) when the server is unreachable.
 *
 * The plugin refreshes the cache on:
 *   - startup (if last refresh > REFRESH_INTERVAL)
 *   - explicit "Sync template from server" command
 *   - whoami test in settings
 */

export type PersistedCache = {
	schema?: ServerSchema;
	taxonomy?: Taxonomy;
	whoami?: Whoami;
	refreshedAt?: number;
};

const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h

export class SchemaCache {
	private state: PersistedCache;

	constructor(initial: PersistedCache | null | undefined) {
		this.state = initial ?? {};
	}

	getPersisted(): PersistedCache {
		return this.state;
	}

	get schema(): ServerSchema | undefined {
		return this.state.schema;
	}
	get taxonomy(): Taxonomy | undefined {
		return this.state.taxonomy;
	}
	get whoami(): Whoami | undefined {
		return this.state.whoami;
	}

	needsRefresh(): boolean {
		if (!this.state.schema || !this.state.taxonomy) return true;
		const age = Date.now() - (this.state.refreshedAt ?? 0);
		return age > REFRESH_INTERVAL_MS;
	}

	async refresh(api: ValeonApi): Promise<void> {
		const [schema, taxonomy, whoami] = await Promise.all([
			api.schema(),
			api.taxonomy(),
			api.whoami(),
		]);
		this.state = {
			schema,
			taxonomy,
			whoami,
			refreshedAt: Date.now(),
		};
	}
}
