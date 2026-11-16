/// <reference types="bun" />
import { describe, expect, mock, test } from "bun:test";

// cross-post-refs imports `TFile` from the host-provided "obsidian" module,
// which does not exist under bun. A stub is enough: the code under test is
// the pure regex-driven `collectCrossPostRefs`.
mock.module("obsidian", () => ({
	TFile: class TFile {},
	parseYaml: () => ({}),
	stringifyYaml: () => "",
}));
const { collectCrossPostRefs } = await import("../src/lib/cross-post-refs");

const URL_ = "https://valeon.blog/2026/01/02/some-slug";

describe("inline footnotes vs markdown links (cross-post-refs)", () => {
	test("inline note is not a cross-post ref", () => {
		expect(collectCrossPostRefs(`^[note](${URL_})`)).toEqual([]);
		expect(collectCrossPostRefs(`x ^[note](${URL_})`)).toEqual([]);
	});

	test("plain link regression", () => {
		expect(collectCrossPostRefs(`[a](${URL_})`)).toHaveLength(1);
	});

	test("odd backslashes escape the caret: it is a link", () => {
		expect(collectCrossPostRefs(`\\^[a](${URL_})`)).toHaveLength(1);
	});

	test("even backslashes: inline note, not a link", () => {
		expect(collectCrossPostRefs(`\\\\^[a](${URL_})`)).toEqual([]);
	});
});
