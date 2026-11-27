/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { parseVoiceList } from "../src/api/types";

const good = {
	available: true,
	voices: [
		{
			id: "slate",
			displayName: "Slate",
			description: "Calm",
			tags: { gender: "female", accent: "british" },
			previewUrl: "https://x.test/slate.mp3",
		},
	],
	authorVoice: null,
	platformVoice: "basalt",
};

describe("parseVoiceList", () => {
	test("accepts a well-formed body with object tags", () => {
		const r = parseVoiceList(good);
		expect(r.voices[0]?.id).toBe("slate");
		expect(r.platformVoice).toBe("basalt");
		expect(r.authorVoice).toBeNull();
	});

	test("accepts an unavailable empty list", () => {
		expect(
			parseVoiceList({ ...good, available: false, voices: [] }).available,
		).toBe(false);
	});

	test("rejects malformed bodies", () => {
		for (const bad of [
			null,
			"x",
			{},
			{ ...good, voices: "nope" },
			{ ...good, available: "yes" },
			{ ...good, platformVoice: 3 },
			{ ...good, authorVoice: 3 },
			{ ...good, voices: [{ displayName: "x" }] },
		]) {
			expect(() => parseVoiceList(bad)).toThrow(/Update the plugin/);
		}
	});
});
