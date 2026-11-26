/// <reference types="bun" />
import { describe, expect, mock, test } from "bun:test";

mock.module("obsidian", () => ({
	TFile: class TFile {},
	Notice: class Notice {},
	parseYaml: () => ({}),
	stringifyYaml: () => "",
}));
const { mergeRemoteMetadata } = await import("../src/commands/pull-metadata");

describe("mergeRemoteMetadata aiAssisted", () => {
	test("fills aiAssisted: true from remote when the note lacks it", () => {
		const { frontmatter, changes } = mergeRemoteMetadata(
			{ title: "T" },
			{ title: "T", aiAssisted: true },
		);
		expect(frontmatter.aiAssisted).toBe(true);
		expect(changes).toContain("aiAssisted");
	});

	test("never removes or overwrites a local value", () => {
		expect(
			mergeRemoteMetadata({ aiAssisted: true }, { aiAssisted: false })
				.frontmatter.aiAssisted,
		).toBe(true);
		expect(
			mergeRemoteMetadata({ aiAssisted: false }, { aiAssisted: true })
				.frontmatter.aiAssisted,
		).toBe(false);
		expect(
			mergeRemoteMetadata({ aiAssisted: true }, undefined).frontmatter
				.aiAssisted,
		).toBe(true);
	});

	test("leaves aiAssisted unset when remote does not have it", () => {
		const { frontmatter, changes } = mergeRemoteMetadata({}, { title: "T" });
		expect(frontmatter.aiAssisted).toBeUndefined();
		expect(changes).not.toContain("aiAssisted");
	});
});

describe("mergeRemoteMetadata polemic", () => {
	test("fills polemic: true from remote when the note lacks it", () => {
		const { frontmatter, changes } = mergeRemoteMetadata(
			{ title: "T" },
			{ title: "T", polemic: true },
		);
		expect(frontmatter.polemic).toBe(true);
		expect(changes).toContain("polemic");
	});

	test("never clobbers a local value when the author set it", () => {
		expect(
			mergeRemoteMetadata(
				{ polemic: false },
				{ polemic: true, polemicSetBy: "author" },
			).frontmatter.polemic,
		).toBe(false);
		expect(
			mergeRemoteMetadata({ polemic: true }, { polemic: false }).frontmatter
				.polemic,
		).toBe(true);
		expect(
			mergeRemoteMetadata({ polemic: true }, undefined).frontmatter.polemic,
		).toBe(true);
	});

	test("adopts an editor-set value that differs from the note", () => {
		const cleared = mergeRemoteMetadata(
			{ polemic: true },
			{ polemic: undefined, polemicSetBy: "reviewer" },
		);
		expect(cleared.frontmatter.polemic).toBe(false);
		expect(cleared.changes).toContain("polemic");
		const set = mergeRemoteMetadata(
			{ polemic: false },
			{ polemic: true, polemicSetBy: "reviewer" },
		);
		expect(set.frontmatter.polemic).toBe(true);
		expect(set.changes).toEqual(["polemic"]);
	});

	test("leaves a matching editor-set value alone", () => {
		const { frontmatter, changes } = mergeRemoteMetadata(
			{ polemic: true },
			{ polemic: true, polemicSetBy: "reviewer" },
		);
		expect(frontmatter.polemic).toBe(true);
		expect(changes).not.toContain("polemic");
	});

	test("never writes polemicSetBy into the note frontmatter", () => {
		const { frontmatter } = mergeRemoteMetadata(
			{},
			{ polemic: true, polemicSetBy: "reviewer" },
		);
		expect(frontmatter).not.toHaveProperty("polemicSetBy");
	});

	test("leaves polemic unset when remote does not have it", () => {
		const { frontmatter, changes } = mergeRemoteMetadata({}, { title: "T" });
		expect(frontmatter.polemic).toBeUndefined();
		expect(changes).not.toContain("polemic");
	});
});
