import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/**
 * Standalone Vitest config. Kept separate from `vite.config.ts` to avoid
 * pulling the SCSS / lingui / sentry / node-polyfill plugin stack into the
 * test process — those plugins are wired for the production bundle and
 * noticeably slow test boot. Aliases mirror the bundler config so imports
 * like `@/features/trading/polymarket/...` resolve identically in tests.
 */
export default defineConfig({
	resolve: {
		alias: {
			"@": path.resolve(projectRoot, "./src"),
			components: path.resolve(projectRoot, "./src/components"),
			pages: path.resolve(projectRoot, "./src/pages"),
			context: path.resolve(projectRoot, "./src/context"),
			config: path.resolve(projectRoot, "./src/config"),
			domain: path.resolve(projectRoot, "./src/domain"),
			styles: path.resolve(projectRoot, "./src/styles"),
		},
	},
	test: {
		environment: "jsdom",
		globals: true,
		include: ["src/**/*.{test,spec}.{ts,tsx}"],
		clearMocks: true,
	},
});
