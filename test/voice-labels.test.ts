/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { defaultRowLabel, previewAriaLabel } from "../src/lib/voiceLabels";

const voices = [{ id: "slate", displayName: "Slate" }];

describe("defaultRowLabel", () => {
	test("plain label when the default is listed", () => {
		expect(
			defaultRowLabel({ voices, authorVoice: "slate", platformVoice: "x" }),
		).toBe("Use my default (slate)");
	});
	test("falls back to the platform voice", () => {
		expect(
			defaultRowLabel({ voices, authorVoice: null, platformVoice: "slate" }),
		).toBe("Use my default (slate)");
	});
	test("flags a default that is no longer listed", () => {
		expect(
			defaultRowLabel({ voices, authorVoice: "gone", platformVoice: "slate" }),
		).toBe("Use my default (gone, no longer available)");
	});
});

describe("previewAriaLabel", () => {
	test("switches between play and stop", () => {
		expect(previewAriaLabel("Slate", false)).toBe("Play Slate preview");
		expect(previewAriaLabel("Slate", true)).toBe("Stop Slate preview");
	});
});
