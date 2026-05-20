import process from "node:process";
import builtins from "builtin-modules";
import esbuild from "esbuild";

const prod = process.argv[2] === "production";

// Production defaults baked into the community-published build.
// Override via env vars for local development against a non-prod
// Valeon backend — see README's Development section.
const PROD_API_BASE = "https://giant-panther-407.eu-west-1.convex.site";
const PROD_DASHBOARD_BASE = "https://author.valeon.blog";

const context = await esbuild.context({
	entryPoints: ["src/main.ts"],
	bundle: true,
	external: [
		"obsidian",
		"electron",
		"@codemirror/autocomplete",
		"@codemirror/collab",
		"@codemirror/commands",
		"@codemirror/language",
		"@codemirror/lint",
		"@codemirror/search",
		"@codemirror/state",
		"@codemirror/view",
		"@lezer/common",
		"@lezer/highlight",
		"@lezer/lr",
		...builtins,
	],
	define: {
		__VALEON_API_BASE_URL__: JSON.stringify(
			process.env.VALEON_API_BASE_URL ?? PROD_API_BASE,
		),
		__VALEON_DASHBOARD_BASE_URL__: JSON.stringify(
			process.env.VALEON_DASHBOARD_BASE_URL ?? PROD_DASHBOARD_BASE,
		),
	},
	format: "cjs",
	target: "es2022",
	logLevel: "info",
	sourcemap: prod ? false : "inline",
	treeShaking: true,
	outfile: "main.js",
	minify: prod,
});

if (prod) {
	await context.rebuild();
	await context.dispose();
} else {
	await context.watch();
}
