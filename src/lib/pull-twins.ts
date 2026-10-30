import type { App } from "obsidian";
import type { ValeonApi } from "../api/client";
import type { FetchResponse } from "../api/types";
import { type OnDarkTwin, twinDownloadTargets } from "./on-dark-twins";
import { sha256Hex } from "./sha256";

/**
 * Write each on-dark twin next to its light file after a pull or
 * restore has placed the light files. Skips the download when the
 * same bytes are already at the target path. Records sha256 →
 * storageId in `mediaMap` like any other pulled asset.
 */
export async function writeOnDarkTwins(args: {
	app: App;
	api: ValeonApi;
	twins: readonly OnDarkTwin[];
	mediaRefs: FetchResponse["mediaRefs"];
	lightPathOf: (storageId: string) => string | undefined;
	mediaMap: Record<string, string>;
}): Promise<void> {
	const { app, api, mediaRefs, mediaMap } = args;
	for (const { onDarkStorageId, path } of twinDownloadTargets(
		args.twins,
		args.lightPathOf,
	)) {
		const ref = mediaRefs.find((r) => r.storageId === onDarkStorageId);
		if (ref?.sha256 && (await app.vault.adapter.exists(path))) {
			const local = await sha256Hex(await app.vault.adapter.readBinary(path));
			if (local === ref.sha256) {
				mediaMap[ref.sha256] = onDarkStorageId;
				continue;
			}
		}
		const bytes = await api.downloadMedia(onDarkStorageId);
		await app.vault.adapter.writeBinary(path, bytes);
		const hash = ref?.sha256 ?? (await sha256Hex(bytes));
		mediaMap[hash] = onDarkStorageId;
	}
}
