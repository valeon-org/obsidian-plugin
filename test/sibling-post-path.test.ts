/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { siblingPostPath } from "../src/lib/sibling-post-path";

/*
 * `../{folder}/post.md` cross-post links resolve against the source post's
 * grandparent folder. Obsidian reports the vault root's path as "/", so for
 * posts at the root a naive join produced "//{folder}/post.md", which
 * `vault.getAbstractFileByPath` never finds — publish then left the link
 * unconverted and it 404'd on the blog.
 */
describe("siblingPostPath", () => {
	test("posts at the vault root ('/' grandparent) resolve without a leading slash", () => {
		expect(siblingPostPath("/", "2026-05-25-the-question")).toBe(
			"2026-05-25-the-question/post.md",
		);
	});

	test("an empty or missing grandparent also means the root", () => {
		expect(siblingPostPath("", "2026-05-25-a")).toBe("2026-05-25-a/post.md");
		expect(siblingPostPath(undefined, "2026-05-25-a")).toBe(
			"2026-05-25-a/post.md",
		);
	});

	test("posts inside a folder resolve beside each other", () => {
		expect(siblingPostPath("Valeon/posts", "2026-05-25-a")).toBe(
			"Valeon/posts/2026-05-25-a/post.md",
		);
	});

	test("a trailing slash on the grandparent doesn't double up", () => {
		expect(siblingPostPath("Valeon/posts/", "2026-05-25-a")).toBe(
			"Valeon/posts/2026-05-25-a/post.md",
		);
	});
});
