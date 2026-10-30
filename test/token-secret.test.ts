/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import {
	DEFAULT_TOKEN_SECRET,
	migrateLegacyToken,
	readToken,
	type SecretStore,
} from "../src/lib/token-secret";

function memoryStore(initial: Record<string, string> = {}): SecretStore & {
	data: Record<string, string>;
} {
	const data = { ...initial };
	return {
		data,
		getSecret: (id) => data[id] ?? null,
		setSecret: (id, secret) => {
			data[id] = secret;
		},
	};
}

describe("migrateLegacyToken", () => {
	test("moves a plaintext token into secret storage and blanks it", () => {
		const store = memoryStore();
		const out = migrateLegacyToken(
			{ apiTokenSecret: "", apiToken: "vln_abc" },
			store,
		);
		expect(out).toEqual({ apiTokenSecret: DEFAULT_TOKEN_SECRET, apiToken: "" });
		expect(store.data[DEFAULT_TOKEN_SECRET]).toBe("vln_abc");
	});

	test("is a no-op without a plaintext token (idempotent)", () => {
		const store = memoryStore({ [DEFAULT_TOKEN_SECRET]: "vln_abc" });
		expect(
			migrateLegacyToken(
				{ apiTokenSecret: DEFAULT_TOKEN_SECRET, apiToken: "" },
				store,
			),
		).toBeNull();
		expect(migrateLegacyToken({ apiTokenSecret: "" }, store)).toBeNull();
		expect(store.data).toEqual({ [DEFAULT_TOKEN_SECRET]: "vln_abc" });
	});

	test("reuses a secret that already holds the same token", () => {
		const store = memoryStore({ [DEFAULT_TOKEN_SECRET]: "vln_abc" });
		const out = migrateLegacyToken(
			{ apiTokenSecret: "", apiToken: "vln_abc" },
			store,
		);
		expect(out?.apiTokenSecret).toBe(DEFAULT_TOKEN_SECRET);
	});

	test("never overwrites a different secret under the same name", () => {
		const store = memoryStore({ [DEFAULT_TOKEN_SECRET]: "someone-else" });
		const out = migrateLegacyToken(
			{ apiTokenSecret: "", apiToken: "vln_abc" },
			store,
		);
		expect(out?.apiTokenSecret).toBe(`${DEFAULT_TOKEN_SECRET}-2`);
		expect(store.data[DEFAULT_TOKEN_SECRET]).toBe("someone-else");
		expect(store.data[`${DEFAULT_TOKEN_SECRET}-2`]).toBe("vln_abc");
	});

	test("keeps the plaintext token if the secret doesn't read back", () => {
		const store: SecretStore = { getSecret: () => null, setSecret: () => {} };
		expect(() =>
			migrateLegacyToken({ apiTokenSecret: "", apiToken: "vln_abc" }, store),
		).toThrow();
	});
});

describe("readToken", () => {
	test("reads the named secret, null when unset on this device", () => {
		const store = memoryStore({ mine: "vln_abc" });
		expect(readToken({ apiTokenSecret: "mine" }, store)).toBe("vln_abc");
		expect(readToken({ apiTokenSecret: "other" }, store)).toBeNull();
		expect(readToken({ apiTokenSecret: "" }, store)).toBeNull();
	});
});
