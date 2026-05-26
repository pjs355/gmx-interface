/** @type {import("eslint").Linter.Config} */
module.exports = {
	root: true,
	env: {
		browser: true,
		es2020: true,
	},
	ignorePatterns: ["dist", "node_modules", "build", "coverage", "src/locales/**", "**/*.min.js"],
	parser: "@typescript-eslint/parser",
	parserOptions: {
		ecmaVersion: "latest",
		sourceType: "module",
		ecmaFeatures: { jsx: true },
	},
	plugins: ["@typescript-eslint", "react-hooks", "react-refresh"],
	extends: [
		"eslint:recommended",
		"plugin:@typescript-eslint/recommended",
		"plugin:react-hooks/recommended",
		"prettier",
	],
	rules: {
		// tsc: noUnusedLocals + noUnusedParameters
		"@typescript-eslint/no-unused-vars": "off",
		"@typescript-eslint/no-explicit-any": "off",
		"@typescript-eslint/no-non-null-assertion": "off",
		"react-refresh/only-export-components": "off",
		"react-hooks/exhaustive-deps": "off",
		"no-empty": "off",
		"no-constant-condition": "off",
		"no-case-declarations": "off",
		"no-empty-pattern": "off",
		"no-inner-declarations": "off",
		"no-useless-escape": "off",
		"@typescript-eslint/ban-ts-comment": "off",
		"@typescript-eslint/ban-types": "off",
	},
};
