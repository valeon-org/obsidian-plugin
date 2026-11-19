/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { errorPayload } from "../src/api/error-payload";

describe("errorPayload", () => {
	test("passes a JSON error body through", () => {
		const body = {
			error: "Slug taken",
			errors: [{ field: "slug", message: "x" }],
		};
		expect(errorPayload(400, () => body)).toEqual(body);
	});

	test("falls back to the status for a body that isn't an error object", () => {
		for (const body of [null, "oops", 7, ["a"], undefined]) {
			expect(errorPayload(502, () => body)).toEqual({ error: "HTTP 502" });
		}
	});

	test("falls back to the status when the body isn't JSON", () => {
		expect(
			errorPayload(500, () => {
				throw new SyntaxError("Unexpected token <");
			}),
		).toEqual({ error: "HTTP 500" });
	});

	test("fills in a missing or non-string error field", () => {
		expect(errorPayload(404, () => ({ error: 3 }))).toEqual({
			error: "HTTP 404",
		});
		expect(errorPayload(404, () => ({}))).toEqual({ error: "HTTP 404" });
	});
});
