/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { resolveStorageIds } from "../src/lib/media-cache";

type Fakes = {
	missingCalls: string[][];
	uploadCalls: string[];
	missing: (ids: string[]) => Promise<Set<string> | null>;
	upload: (hash: string) => Promise<string>;
};

/** Fakes: `gone` lists ids the server reports missing; null = no route. */
function fakes(gone: string[] | null): Fakes {
	const f: Fakes = {
		missingCalls: [],
		uploadCalls: [],
		missing: (ids) => {
			f.missingCalls.push(ids);
			return Promise.resolve(gone === null ? null : new Set(gone));
		},
		upload: (hash) => {
			f.uploadCalls.push(hash);
			return Promise.resolve(`new-${hash}`);
		},
	};
	return f;
}

describe("resolveStorageIds", () => {
	test("reuses a cached id the server still has", async () => {
		const f = fakes([]);
		const out = await resolveStorageIds({
			hashes: ["h1"],
			mediaMap: { h1: "id1" },
			missing: f.missing,
			upload: f.upload,
		});
		expect(out).toEqual({ h1: "id1" });
		expect(f.missingCalls).toEqual([["id1"]]);
		expect(f.uploadCalls).toEqual([]);
	});

	test("re-uploads when the cached id is gone and never returns it", async () => {
		const f = fakes(["id1"]);
		const out = await resolveStorageIds({
			hashes: ["h1", "h2"],
			mediaMap: { h1: "id1", h2: "id2" },
			missing: f.missing,
			upload: f.upload,
		});
		expect(out).toEqual({ h1: "new-h1", h2: "id2" });
		expect(Object.values(out)).not.toContain("id1");
		expect(f.uploadCalls).toEqual(["h1"]);
	});

	test("uploads an uncached hash without checking it", async () => {
		const f = fakes([]);
		const out = await resolveStorageIds({
			hashes: ["h1", "h2"],
			mediaMap: { h1: "id1" },
			missing: f.missing,
			upload: f.upload,
		});
		expect(out).toEqual({ h1: "id1", h2: "new-h2" });
		expect(f.missingCalls).toEqual([["id1"]]);
		expect(f.uploadCalls).toEqual(["h2"]);
	});

	test("skips the check when no hash has a cached id", async () => {
		const f = fakes([]);
		const out = await resolveStorageIds({
			hashes: ["h1"],
			mediaMap: { other: "idX" },
			missing: f.missing,
			upload: f.upload,
		});
		expect(out).toEqual({ other: "idX", h1: "new-h1" });
		expect(f.missingCalls).toEqual([]);
		expect(f.uploadCalls).toEqual(["h1"]);
	});

	test("reuses cached ids when the check is unavailable (older server)", async () => {
		const f = fakes(null);
		const out = await resolveStorageIds({
			hashes: ["h1"],
			mediaMap: { h1: "id1" },
			missing: f.missing,
			upload: f.upload,
		});
		expect(out).toEqual({ h1: "id1" });
		expect(f.missingCalls).toEqual([["id1"]]);
		expect(f.uploadCalls).toEqual([]);
	});

	test("propagates a failed check without uploading or touching the map", async () => {
		const f = fakes([]);
		const mediaMap = { h1: "id1" };
		await expect(
			resolveStorageIds({
				hashes: ["h1", "h2"],
				mediaMap,
				missing: () => Promise.reject(new Error("HTTP 500")),
				upload: f.upload,
			}),
		).rejects.toThrow("HTTP 500");
		expect(f.uploadCalls).toEqual([]);
		expect(mediaMap).toEqual({ h1: "id1" });
	});

	test("checks an id shared by two hashes once", async () => {
		const f = fakes([]);
		await resolveStorageIds({
			hashes: ["h1", "h2", "h1"],
			mediaMap: { h1: "id1", h2: "id1" },
			missing: f.missing,
			upload: f.upload,
		});
		expect(f.missingCalls).toEqual([["id1"]]);
	});

	test("uploads a repeated missing hash once", async () => {
		const f = fakes(["id1"]);
		const out = await resolveStorageIds({
			hashes: ["h1", "h1"],
			mediaMap: { h1: "id1" },
			missing: f.missing,
			upload: f.upload,
		});
		expect(out).toEqual({ h1: "new-h1" });
		expect(f.uploadCalls).toEqual(["h1"]);
	});

	test("leaves entries for hashes this publish doesn't use untouched", async () => {
		const f = fakes(["idOld"]);
		const out = await resolveStorageIds({
			hashes: ["h1"],
			mediaMap: { h1: "id1", unused: "idOld" },
			missing: f.missing,
			upload: f.upload,
		});
		expect(out).toEqual({ h1: "id1", unused: "idOld" });
		expect(f.missingCalls).toEqual([["id1"]]);
		expect(f.uploadCalls).toEqual([]);
	});
});
