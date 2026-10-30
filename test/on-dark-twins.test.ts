/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import {
	onDarkTwinPath,
	pairOnDarkTwins,
	twinDownloadTargets,
	twinOnlyStorageIds,
} from "../src/lib/on-dark-twins";

describe("onDarkTwinPath", () => {
	test("maps x.svg to x.on-dark.svg", () => {
		expect(onDarkTwinPath("post/assets/T01-F4.svg")).toBe(
			"post/assets/T01-F4.on-dark.svg",
		);
	});

	test("matches .svg case-insensitively", () => {
		expect(onDarkTwinPath("post/assets/x.SVG")).toBe(
			"post/assets/x.on-dark.svg",
		);
	});

	test("ignores non-SVGs and twins themselves", () => {
		expect(onDarkTwinPath("post/assets/x.png")).toBeNull();
		expect(onDarkTwinPath("post/assets/x.on-dark.svg")).toBeNull();
		expect(onDarkTwinPath("post/assets/x.svg.bak")).toBeNull();
	});
});

describe("pairOnDarkTwins", () => {
	const ids: Record<string, string> = {
		"p/a.svg": "L1",
		"p/a.on-dark.svg": "D1",
		"p/b.svg": "L2",
		"p/b.on-dark.svg": "L2",
	};
	const idOf = (p: string) => ids[p];

	test("pairs uploaded light images with their twins", () => {
		expect(pairOnDarkTwins([["p/a.svg", "p/a.on-dark.svg"]], idOf)).toEqual([
			{ storageId: "L1", onDarkStorageId: "D1" },
		]);
	});

	test("drops byte-identical pairs, unresolved paths and repeats", () => {
		expect(
			pairOnDarkTwins(
				[
					["p/b.svg", "p/b.on-dark.svg"],
					["p/missing.svg", "p/missing.on-dark.svg"],
					["p/a.svg", "p/a.on-dark.svg"],
					["p/a.svg", "p/a.on-dark.svg"],
				],
				idOf,
			),
		).toEqual([{ storageId: "L1", onDarkStorageId: "D1" }]);
	});
});

describe("pull helpers", () => {
	const twins = [
		{ storageId: "L1", onDarkStorageId: "D1" },
		{ storageId: "L2", onDarkStorageId: "D2" },
	];

	test("twins land next to their light file, named from it", () => {
		const local: Record<string, string> = { L1: "p/assets/fig.svg" };
		expect(twinDownloadTargets(twins, (id) => local[id])).toEqual([
			{ onDarkStorageId: "D1", path: "p/assets/fig.on-dark.svg" },
		]);
	});

	test("twin-only ids exclude a twin the body links directly", () => {
		expect([...twinOnlyStorageIds(twins, "![x](/m/L1) ![y](/m/D2)")]).toEqual([
			"D1",
		]);
	});
});
