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
