/// <reference types="bun" />
import { beforeEach, describe, expect, mock, test } from "bun:test";

// Stub every export the imported modules use; mock.module is shared across
// test files in the process, so it must be a superset of what others need.
let parsedFixture: unknown = {};
let stringified: unknown;
mock.module("obsidian", () => ({
	TFile: class TFile {},
	Notice: class Notice {},
	parseYaml: () => parsedFixture,
	stringifyYaml: (value: unknown) => {
		stringified = value;
		return "";
	},
}));
const { parseNote, stringifyNote } = await import("../src/lib/frontmatter");

beforeEach(() => {
	parsedFixture = {};
	stringified = undefined;
});

describe("aiAssisted frontmatter key", () => {
	test("stringifyNote puts aiAssisted right after podcast", () => {
		stringifyNote(
			{
				title: "T",
				tts: true,
				podcast: true,
				aiAssisted: true,
				categories: ["a"],
				tags: [],
				canonical: "https://x.test",
			},
			{},
			"body",
		);
		const keys = Object.keys(stringified as Record<string, unknown>);
		expect(keys.indexOf("aiAssisted")).toBe(keys.indexOf("podcast") + 1);
		expect((stringified as Record<string, unknown>).aiAssisted).toBe(true);
	});

	test("stringifyNote omits aiAssisted when undefined, keeps explicit false", () => {
		stringifyNote({ title: "T" }, {}, "b");
		expect(stringified as object).not.toHaveProperty("aiAssisted");
		stringifyNote({ title: "T", aiAssisted: false }, {}, "b");
		expect((stringified as Record<string, unknown>).aiAssisted).toBe(false);
	});

	test("parseNote without the key gives undefined", () => {
		parsedFixture = { title: "T" };
		const parsed = parseNote("---\ntitle: T\n---\nbody\n");
		expect(parsed.frontmatter.aiAssisted).toBeUndefined();
	});

	test("parseNote reads true and false", () => {
		parsedFixture = { aiAssisted: true };
		expect(parseNote("---\na: 1\n---\nb").frontmatter.aiAssisted).toBe(true);
		parsedFixture = { aiAssisted: false };
		expect(parseNote("---\na: 1\n---\nb").frontmatter.aiAssisted).toBe(false);
	});
});

describe("polemic frontmatter key", () => {
	test("stringifyNote puts polemic right after aiAssisted", () => {
		stringifyNote(
			{
				title: "T",
				podcast: true,
				aiAssisted: true,
				polemic: true,
				categories: ["a"],
			},
			{},
			"body",
		);
		const keys = Object.keys(stringified as Record<string, unknown>);
		expect(keys.indexOf("polemic")).toBe(keys.indexOf("aiAssisted") + 1);
		expect((stringified as Record<string, unknown>).polemic).toBe(true);
	});

	test("stringifyNote omits polemic when undefined, keeps explicit false", () => {
		stringifyNote({ title: "T" }, {}, "b");
		expect(stringified as object).not.toHaveProperty("polemic");
		stringifyNote({ title: "T", polemic: false }, {}, "b");
		expect((stringified as Record<string, unknown>).polemic).toBe(false);
	});

	test("stringifyNote never writes polemicSetBy", () => {
		stringifyNote(
			{ title: "T", polemic: true, polemicSetBy: "reviewer" } as never,
			{},
			"b",
		);
		expect(stringified as object).not.toHaveProperty("polemicSetBy");
	});

	test("parseNote reads true, false and absent", () => {
		parsedFixture = { title: "T" };
		expect(
			parseNote("---\ntitle: T\n---\nb").frontmatter.polemic,
		).toBeUndefined();
		parsedFixture = { polemic: true };
		expect(parseNote("---\na: 1\n---\nb").frontmatter.polemic).toBe(true);
		parsedFixture = { polemic: false };
		expect(parseNote("---\na: 1\n---\nb").frontmatter.polemic).toBe(false);
	});
});
