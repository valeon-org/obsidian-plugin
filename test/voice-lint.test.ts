/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import type { ServerSchema } from "../src/api/types";
import { voiceLintIssues } from "../src/lib/voiceLint";

const base: ServerSchema = {
	version: 3,
	requiredKeys: [],
	optionalKeys: [],
	enums: { categories: [] },
	constraints: { excerpt: { maxLength: 1 }, slug: { pattern: "" } },
	media: { maxSizeBytes: 1, allowedMimeTypes: [] },
};
const withVoices: ServerSchema = {
	...base,
	voices: {
		ids: ["basalt", "slate"],
		deprecated: [{ name: "onyx", replacement: "basalt" }],
	},
};

describe("voiceLintIssues", () => {
	test("errors on a retired voice, naming the replacement", () => {
		expect(voiceLintIssues({ voice: "onyx" }, withVoices)).toEqual([
			{
				severity: "error",
				field: "voice",
				message: '"onyx" is retired; use "basalt".',
			},
		]);
	});

	test("warns on an unknown voice", () => {
		expect(voiceLintIssues({ voice: "zzz" }, withVoices)).toEqual([
			{
				severity: "warning",
				field: "voice",
				message: 'Unknown voice "zzz" (the server will check it).',
			},
		]);
	});

	test("silent for a known voice, no voice, or no voice data", () => {
		expect(voiceLintIssues({ voice: "slate" }, withVoices)).toEqual([]);
		expect(voiceLintIssues({}, withVoices)).toEqual([]);
		expect(voiceLintIssues({ voice: "onyx" }, base)).toEqual([]);
		expect(
			voiceLintIssues({ voice: "onyx" }, { ...base, voices: null }),
		).toEqual([]);
	});
});
