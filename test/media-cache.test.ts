/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { cachedMediaMap, resolveStorageIds } from "../src/lib/media-cache";

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

	test("treats a hand-edited non-string cached value as uncached", async () => {
		const f = fakes([]);
		// `valeon.media` is frontmatter the author can edit by hand.
		const mediaMap = {
			h1: 42,
			h2: "",
			h3: { id: "x" },
			h4: null,
			h5: "id5",
		} as unknown as Record<string, string>;
		const out = await resolveStorageIds({
			hashes: ["h1", "h2", "h3", "h4", "h5"],
			mediaMap,
			missing: f.missing,
			upload: f.upload,
		});
		expect(f.missingCalls).toEqual([["id5"]]);
		expect(f.uploadCalls).toEqual(["h1", "h2", "h3", "h4"]);
		expect(out).toEqual({
			h1: "new-h1",
			h2: "new-h2",
			h3: "new-h3",
			h4: "new-h4",
			h5: "id5",
		});
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

	test("a null check result still uploads uncached hashes", async () => {
		const f = fakes(null);
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

describe("cachedMediaMap", () => {
	test("a string is not a map", () => {
		expect(cachedMediaMap("text")).toEqual({});
	});

	test("an array, null, a number and undefined are not maps", () => {
		expect(cachedMediaMap(["a"])).toEqual({});
		expect(cachedMediaMap(null)).toEqual({});
		expect(cachedMediaMap(undefined)).toEqual({});
		expect(cachedMediaMap(7)).toEqual({});
	});

	test("keeps only entries whose value is a non-empty string", () => {
		expect(cachedMediaMap({ h1: "id", h2: 5, h3: "" })).toEqual({ h1: "id" });
	});

	test("resolveStorageIds on a non-map uploads every hash and writes no index keys", async () => {
		const f = fakes([]);
		const out = await resolveStorageIds({
			hashes: ["h1", "h2"],
			mediaMap: cachedMediaMap("text"),
			missing: f.missing,
			upload: f.upload,
		});
		expect(out).toEqual({ h1: "new-h1", h2: "new-h2" });
		expect(f.uploadCalls).toEqual(["h1", "h2"]);
	});
});
