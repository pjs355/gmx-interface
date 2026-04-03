import { sentryVitePlugin } from "@sentry/vite-plugin";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { lingui } from "@lingui/vite-plugin";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
						project: "levelup-interface",
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
		entries: ["index.html"],
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
			crypto: path.resolve(__dirname, "./src/polyfills/crypto-hmac-shim.ts"),
			"node:crypto": path.resolve(__dirname, "./src/polyfills/crypto-hmac-shim.ts"),
		},
	},
	server: {
		port: 3010,
		host: "0.0.0.0",
		strictPort: false,
		hmr: false,
		allowedHosts: [
			"7b9a7d18e56b.ngrok-free.app",
			".ngrok-free.app",
			".ngrok.io",
			"localhost",
		],
		proxy: {
			"/api": {
				target: "https://prediction-api-production.up.railway.app",
				changeOrigin: true,
				rewrite: (path) => path.replace(/^\/api/, ""),
			},
		},
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
					firebase: ["firebase/app", "firebase/storage"],
					ethers: ["ethers"],
					crypto: ["viem", "@noble/curves", "@noble/hashes"],
				},
				sourcemapExcludeSources: true,
			},
		},
	},
}));
