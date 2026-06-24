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
		"no-restricted-syntax": [
			"error",
			{
				selector:
					"MemberExpression[property.name='dflowPriceA']:not([object.type='ThisExpression'])",
				message:
					"Use kalshiLegYesBook / dflowPriceAdapter.books() — raw dflowPriceA reads bypass away-leg routing.",
			},
			{
				selector:
					"MemberExpression[property.name='kalshiPriceA']:not([object.type='ThisExpression'])",
				message:
					"Use kalshiLegYesBook — raw kalshiPriceA reads bypass away-leg routing.",
			},
		],
	},
	overrides: [
		{
			files: [
				"src/features/markets/pricing/kalshiLegYesBook.ts",
				"src/features/markets/pricing/kalshiSnapshotMerge.ts",
				"src/features/markets/pricing/venuePriceAdapters/dflow.ts",
				"src/features/trading/venues/dflow/catalog/monitorDflowBooks.ts",
				"src/components/VenueOrderbooksPanel/**",
				"src/services/venuePricesClient.ts",
				"src/features/all-odds/venueSnapshotMerge.ts",
				"src/pages/PredictionMarket/PredictionMarketChart/useMultiExchangeChartData.ts",
				"**/*.test.ts",
				"**/*.test.tsx",
			],
			rules: {
				"no-restricted-syntax": "off",
			},
		},
	],
};
