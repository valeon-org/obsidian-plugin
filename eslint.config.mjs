import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";

export default tseslint.config(
	{
		ignores: ["main.js", "node_modules/**", "dist/**"],
	},
	...obsidianmd.configs.recommended,
	...tseslint.configs.recommendedTypeChecked,
	{
		files: ["src/**/*.ts"],
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			// The recommended `ui/sentence-case` autofix has no awareness of
			// technical tokens: it would corrupt URL paths
			// (/settings/api-keys -> /settings/API-keys), the API-token prefix
			// (vln_ -> Vln_), code identifiers (coverAlt -> coveralt), and
			// quoted command names. These strings are already correct sentence
			// case for human-readable content, so the rule only fires false
			// positives here. Disabled to avoid breaking user-facing text.
			"obsidianmd/ui/sentence-case": "off",
		},
	},
);
