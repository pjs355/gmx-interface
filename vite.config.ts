import { sentryVitePlugin } from "@sentry/vite-plugin";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { lingui } from "@lingui/vite-plugin";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
	plugins: [
		react({
			babel: {
				plugins: ["macros"],
			},
		}),
		lingui(),
		// Only include Sentry plugin when building with sourcemaps
		...(mode === "sourcemaps"
			? [
					sentryVitePlugin({
						org: "prinx",
						project: "javascript-react",
						authToken: process.env.SENTRY_AUTH_TOKEN,
					}),
			  ]
			: []),
	],
	define: {
		global: "globalThis",
		"process.env": {},
	},
	optimizeDeps: {
		exclude: ["@base-org/account"],
	},
	esbuild: {
		target: "es2022",
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
			components: path.resolve(__dirname, "./src/components"),
			pages: path.resolve(__dirname, "./src/pages"),
			lib: path.resolve(__dirname, "./src/lib"),
			context: path.resolve(__dirname, "./src/context"),
			config: path.resolve(__dirname, "./src/config"),
			domain: path.resolve(__dirname, "./src/domain"),
			utils: path.resolve(__dirname, "./src/utils"),
			img: path.resolve(__dirname, "./src/img"),
			styles: path.resolve(__dirname, "./src/styles"),
		},
	},
	server: {
		port: 3010,
		proxy: {
			"/api": {
				target: "https://prediction-api-production.up.railway.app",
				changeOrigin: true,
				rewrite: (path) => path.replace(/^\/api/, ""),
			},
		},
		// Enable history fallback for client-side routing
		// This makes page reloads work properly with React Router
		historyApiFallback: true,
	},
	css: {
		preprocessorOptions: {
			scss: {
				api: "modern-compiler",
				silenceDeprecations: ["legacy-js-api"],
			},
		},
	},
	build: {
		outDir: "dist",
		sourcemap: mode === "sourcemaps" ? "hidden" : false,
		rollupOptions: {
			output: {
				manualChunks: {
					"react-vendor": ["react", "react-dom", "react-router-dom"],
					privy: ["@privy-io/react-auth"],
					charts: ["recharts"],
				},
				sourcemapExcludeSources: true,
			},
		},
	},
}));
