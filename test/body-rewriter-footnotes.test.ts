/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import {
	collectLocalAssetPaths,
	rewriteForPush,
} from "../src/lib/body-rewriter";

/*
 * `^[` opens an Obsidian inline footnote, not a link. The guard uses the same
 * escape rule as the blog/dashboard normaliser: a `^` preceded by an ODD
 * number of backslashes is escaped (a literal caret), so `\^[x](y)` is a link
 * after a literal caret, while `\\^[x](y)` is an inline note.
 */
const resolver = () => ({
	storageId: "s1",
	filename: "a.pdf",
	mimeType: "application/pdf",
	sha256: "x",
});

describe("inline footnotes vs markdown links (body-rewriter)", () => {
	test("inline note is left untouched", () => {
		const s = "Claim ^[note](./a.pdf) end";
		expect(rewriteForPush(s, "posts/p", resolver)).toBe(s);
	});

	test("a real link inside a note still rewrites", () => {
		expect(
			rewriteForPush("Claim ^[see [doc](./a.pdf)] end", "posts/p", resolver),
		).toBe("Claim ^[see [doc](/m/s1)] end");
	});

	test("plain link regression", () => {
		expect(rewriteForPush("[doc](./a.pdf)", "posts/p", resolver)).toBe(
			"[doc](/m/s1)",
		);
	});

	test("collectLocalAssetPaths ignores an inline note", () => {
		expect(collectLocalAssetPaths("^[note](./a.pdf)", "posts/p")).toEqual([]);
	});

	test("escaped caret (odd backslashes) is a literal caret then a link", () => {
		expect(rewriteForPush("\\^[doc](./a.pdf)", "posts/p", resolver)).toBe(
			"\\^[doc](/m/s1)",
		);
		expect(collectLocalAssetPaths("\\^[doc](./a.pdf)", "posts/p").length).toBe(
			1,
		);
		expect(rewriteForPush("\\\\\\^[doc](./a.pdf)", "posts/p", resolver)).toBe(
			"\\\\\\^[doc](/m/s1)",
		);
	});

	test("escaped caret mid-sentence is a link", () => {
		expect(rewriteForPush("a \\^[doc](./a.pdf) b", "posts/p", resolver)).toBe(
			"a \\^[doc](/m/s1) b",
		);
	});

	test("even backslashes before the caret leave it an inline note", () => {
		const s = "\\\\^[note](./a.pdf)";
		expect(rewriteForPush(s, "posts/p", resolver)).toBe(s);
		expect(collectLocalAssetPaths(s, "posts/p")).toEqual([]);
	});
});
