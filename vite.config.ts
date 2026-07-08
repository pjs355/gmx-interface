import { sentryVitePlugin } from "@sentry/vite-plugin";
import { createLogger, defineConfig, loadEnv, type Logger, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { lingui } from "@lingui/vite-plugin";
import path from "path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import https from "node:https";
import { contentBuildPlugin } from "./scripts/contentBuildPlugin";
import { siteMetadataHtmlPlugin } from "./scripts/viteSiteMetadataHtml";
import { spaEntryManifestPlugin } from "./scripts/spaEntryManifestPlugin";

/** Config file directory — use for .env + aliases so behavior matches other laptops regardless of `process.cwd()`. */
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/** `@base-org/account` ships sourcemaps that reference unpublished `.ts` paths; Vite logs each via `warnOnce`. */
function createViteLoggerWithoutBaseOrgSourcemapNoise(): Logger {
	const logger = createLogger();
	const warnOnce = logger.warnOnce.bind(logger);
	logger.warnOnce = (msg, options) => {
		if (msg.includes("Sourcemap for") && msg.includes("@base-org/account")) {
			return;
		}
		warnOnce(msg, options);
	};
	return logger;
}

/**
 * Dev-only: tunnels browser requests through Railway `/proxy` (same `VITE_POLY_PROXY_URL` / token as other routes).
 *
 * - `/polymarket-clob/*` → `https://clob.polymarket.com/*` (geo + CLOB signing)
 * - `/private-api-proxy/*` → `POST /api/predict/orders` to Railway EU upstream (`predictProxyTarget`)
 * - `/limitless-exchange-proxy/*` → `https://api.limitless.exchange/*` (Limitless public GETs, e.g. orderbook)
 *
 * Limitless `api.limitless.exchange` blocks browser CORS. Without CLOB proxy: optional same-origin
 * `/__limitless-api/...` → direct Node `https.get` (legacy fallbacks).
 *
 * Railway /proxy expects: POST { url, method, headers?, body? }
 * Railway /proxy returns: { status, data, ... }
 */
function installLimitlessExchangeProxy(middlewares: import("connect").Server): void {
	middlewares.use((req, res, next) => {
		const raw = req.url ?? "";
		const pathOnly = raw.split("?")[0] ?? "";
		if (!pathOnly.startsWith("/__limitless-api/")) return next();

		if (req.method === "OPTIONS") {
			res.setHeader("Access-Control-Allow-Origin", "*");
			res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
			res.setHeader("Access-Control-Allow-Headers", "*");
			res.statusCode = 204;
			res.end();
			return;
		}
		if (req.method !== "GET") {
			res.statusCode = 405;
			res.setHeader("Content-Type", "application/json");
			res.end(JSON.stringify({ error: "Method not allowed" }));
			return;
		}

		const upstreamPath = pathOnly.replace(/^\/__limitless-api/, "") || "/";
		const target = `https://api.limitless.exchange${upstreamPath}`;

		https
			.get(
				target,
				{
					headers: { Accept: "application/json" },
				},
				(up) => {
					res.setHeader("Access-Control-Allow-Origin", "*");
					const ct = up.headers["content-type"];
					if (ct) {
						res.setHeader("Content-Type", Array.isArray(ct) ? ct[0] : ct);
					}
					res.statusCode = up.statusCode ?? 502;
					up.pipe(res);
				},
			)
			.on("error", (err: Error) => {
				res.statusCode = 502;
				res.setHeader("Access-Control-Allow-Origin", "*");
				res.setHeader("Content-Type", "application/json");
				res.end(JSON.stringify({ error: err.message }));
			});
	});
}

function limitlessExchangeDevProxyPlugin(): Plugin {
	return {
		name: "limitless-exchange-dev-proxy",
		configureServer(server) {
			installLimitlessExchangeProxy(server.middlewares);
		},
		configurePreviewServer(server) {
			installLimitlessExchangeProxy(server.middlewares);
		},
	};
}

function railwayDevProxyPlugin(
	proxyUrl: string,
	proxyToken: string,
	levelupApiOrigin: string,
): Plugin {
	const apiBase = levelupApiOrigin.replace(/\/$/, "");

	return {
		name: "railway-dev-proxy",
		configureServer(server) {
			server.middlewares.use((req, res, next) => {
				const url = req.url ?? "";

				const route = url.startsWith("/polymarket-clob")
					? {
							pathPrefix: "/polymarket-clob",
							upstreamOrigin: "https://clob.polymarket.com",
						}
					: url.startsWith("/private-api-proxy")
						? {
								pathPrefix: "/private-api-proxy",
								upstreamOrigin: apiBase,
							}
						: url.startsWith("/limitless-exchange-proxy")
							? {
									pathPrefix: "/limitless-exchange-proxy",
									upstreamOrigin: "https://api.limitless.exchange",
								}
							: null;

				if (!route) return next();

				const { pathPrefix, upstreamOrigin } = route;

				// CORS preflight
				if (req.method === "OPTIONS") {
					res.setHeader("Access-Control-Allow-Origin", "*");
					res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
					res.setHeader("Access-Control-Allow-Headers", "*");
					res.statusCode = 204;
					res.end();
					return;
				}

				const targetPath = url.replace(new RegExp(`^${pathPrefix}`), "");
				if (pathPrefix === "/private-api-proxy") {
					const tn = (targetPath.split("?")[0] ?? "").split("#")[0] ?? "";
					if (tn !== "/api/predict/orders") {
						res.statusCode = 404;
						res.setHeader("Content-Type", "application/json");
						res.end(
							JSON.stringify({
								error:
									"private-api-proxy only forwards POST /api/predict/orders (use direct private API host for reads)",
							}),
						);
						return;
					}
				}
				const targetUrl = `${upstreamOrigin}${targetPath || "/"}`;

				const forwardHeaders: Record<string, string> = {};
				for (const [key, val] of Object.entries(req.headers)) {
					if (!val) continue;
					const lower = key.toLowerCase();
					if (
						lower.startsWith("poly_") ||
						lower === "content-type" ||
						lower === "accept" ||
						lower === "authorization"
					) {
						forwardHeaders[key] = Array.isArray(val) ? val.join(", ") : val;
					}
				}

				// Buffer request body — preserve exact bytes for HMAC integrity
				const chunks: Buffer[] = [];
				req.on("data", (chunk: Buffer) => chunks.push(chunk));
				req.on("end", () => {
					const rawBody = chunks.length > 0 ? Buffer.concat(chunks).toString("utf8") : undefined;

					// Railway proxy expects `body` (not `data`) — must be the
					// raw string so the HMAC stays valid byte-for-byte.
					const envelope = JSON.stringify({
						url: targetUrl,
						method: req.method ?? "GET",
						headers: forwardHeaders,
						...(rawBody !== undefined ? { body: rawBody } : {}),
					});

					const proxyParsed = new URL(proxyUrl);
					const options: http.RequestOptions = {
						hostname: proxyParsed.hostname,
						port: proxyParsed.port || 443,
						path: proxyParsed.pathname,
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							Authorization: `Bearer ${proxyToken}`,
							"Content-Length": Buffer.byteLength(envelope),
						},
					};

					const transport = proxyParsed.protocol === "https:" ? https : http;

					const proxyReq = transport.request(options, (proxyRes: http.IncomingMessage) => {
						const respChunks: Buffer[] = [];
						proxyRes.on("data", (c: Buffer) => respChunks.push(c));
						proxyRes.on("end", () => {
							const body = Buffer.concat(respChunks).toString("utf8");

							res.setHeader("Access-Control-Allow-Origin", "*");
							res.setHeader("Content-Type", "application/json");

							try {
								const wrapped = JSON.parse(body);
								// Unwrap: Railway returns { status, data, ... }
								res.statusCode = wrapped.status ?? 200;
								res.end(
									typeof wrapped.data === "string" ? wrapped.data : JSON.stringify(wrapped.data),
								);
							} catch {
								// Non-JSON or unexpected — forward raw
								res.statusCode = proxyRes.statusCode ?? 502;
								res.end(body);
							}
						});
					});

					proxyReq.on("error", (err: Error) => {
						console.error("[railway-dev-proxy] upstream error:", err.message);
						res.statusCode = 502;
						res.end(
							JSON.stringify({
								error: `Proxy error: ${err.message}`,
							}),
						);
					});

					proxyReq.write(envelope);
					proxyReq.end();
				});
			});
		},
	};
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
	const viteEnv = loadEnv(mode, projectRoot, "VITE_");

	/** Must match client (`import.meta.env`): `.env` is in `viteEnv`, not always on `process.env`. */
	const clobProxyFlag =
		process.env.VITE_POLYMARKET_CLOB_PROXY ?? viteEnv.VITE_POLYMARKET_CLOB_PROXY ?? "";
	const clobProxyEnabled = String(clobProxyFlag).trim() === "true";
	const clobProxyUrl =
		process.env.VITE_POLY_PROXY_URL ||
		viteEnv.VITE_POLY_PROXY_URL ||
		"https://patriotic-sheepdog.up.railway.app/proxy";
	const clobProxyToken = process.env.VITE_POLY_PROXY_TOKEN || viteEnv.VITE_POLY_PROXY_TOKEN || "";

	const viteEnvMode = (
		process.env.VITE_ENVIRONMENT_MODE ||
		viteEnv.VITE_ENVIRONMENT_MODE ||
		""
	).trim();
	const isLocalOrderEnv =
		viteEnvMode === "local" || viteEnvMode === "local-production" || viteEnvMode === "testnet";

	const privateApiHostDefault =
		(process.env.VITE_PRIVATE_API_BASE || viteEnv.VITE_PRIVATE_API_BASE || "")
			.trim()
			.replace(/\/$/, "") || "http://localhost:8080";

	const predictProxyExplicit = (
		process.env.VITE_AMSTERDAM_PROXY_LEVELUP_API_URL ||
		viteEnv.VITE_AMSTERDAM_PROXY_LEVELUP_API_URL ||
		""
	)
		.trim()
		.replace(/\/$/, "");

	/** Predict order POST upstream for Railway proxy; LIVE defaults to prod Railway unless overridden. */
	const predictProxyTarget =
		predictProxyExplicit ||
		(isLocalOrderEnv ? privateApiHostDefault : "https://prediction-api-production.up.railway.app");

	const limitlessLegacyClientFallbacks =
		process.env.VITE_LIMITLESS_LEGACY_CLIENT_FALLBACKS === "true" ||
		viteEnv.VITE_LIMITLESS_LEGACY_CLIENT_FALLBACKS === "true";

	return {
		customLogger: createViteLoggerWithoutBaseOrgSourcemapNoise(),
		plugins: [
			siteMetadataHtmlPlugin(),
			contentBuildPlugin(projectRoot),
			spaEntryManifestPlugin(),
			react({
				babel: {
					plugins: ["macros"],
				},
			}),
			...(limitlessLegacyClientFallbacks ? [limitlessExchangeDevProxyPlugin()] : []),
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
			...(clobProxyEnabled
				? [railwayDevProxyPlugin(clobProxyUrl, clobProxyToken, predictProxyTarget)]
				: []),
		],
		define: {},
		optimizeDeps: {
			// Must stay excluded: dist uses `import … with { type: 'json' }`, which Vite 4's esbuild cannot pre-bundle.
			exclude: ["@base-org/account"],
			// eventemitter3 ships ESM entry (index.mjs) that default-imports CJS index.js;
			// without pre-bundling, the browser sees "no default export" (Privy / walletconnect chain).
			include: [
				"eventemitter3",
				"@privy-io/react-auth",
				"@privy-io/react-auth/internal",
				// Admin (and others) import Firebase; eager pre-bundle reduces
				// `504 (Outdated Optimize Dep)` / stale `node_modules/.vite/deps/*` URLs after HMR or server restarts.
				"firebase/app",
				"firebase/storage",
				// Only the lazy-loaded trader profile route imports recharts; without
				// eager pre-bundling, first navigation to /traders/:address triggers
				// on-demand optimization and the dynamic import can fail (504) until
				// a hard reload.
				"recharts",
				// Same failure mode for the copy trading setup modal: it pulls the
				// Polymarket CLOB client into the lazy trader-profile/copy chunks.
				"@polymarket/clob-client-v2",
			],
		},
		esbuild: {
			target: "es2022",
		},
		resolve: {
			dedupe: ["react", "react-dom"],
			alias: {
				"@": path.resolve(projectRoot, "./src"),
				components: path.resolve(projectRoot, "./src/components"),
				pages: path.resolve(projectRoot, "./src/pages"),
				context: path.resolve(projectRoot, "./src/context"),
				config: path.resolve(projectRoot, "./src/config"),
				domain: path.resolve(projectRoot, "./src/domain"),
				img: path.resolve(projectRoot, "./src/img"),
				styles: path.resolve(projectRoot, "./src/styles"),
				crypto: path.resolve(projectRoot, "./src/polyfills/crypto-hmac-shim.ts"),
				"node:crypto": path.resolve(projectRoot, "./src/polyfills/crypto-hmac-shim.ts"),
			},
		},
		css: {
			preprocessorOptions: {
				scss: {
					api: "modern-compiler",
					silenceDeprecations: ["legacy-js-api"],
					includePaths: [path.join(projectRoot, "src/styles")],
					additionalData: `@use "themes/scss/fonts" as *;\n@use "themes/scss/colors" as *;\n`,
				},
			},
		},
		server: {
			port: 3010,
			proxy: {
				"/api/predict": {
					target: "http://127.0.0.1:8080",
					changeOrigin: true,
				},
			},
		},
		preview: {
			port: 3010,
		},
		build: {
			outDir: "dist",
			sourcemap: mode === "sourcemaps" ? "hidden" : false,
			rollupOptions: {
				output: {
					manualChunks(id) {
						if (id.includes("@privy-io")) return "privy";
						if (id.includes("node_modules/viem") || id.includes("@walletconnect")) return "viem";
						if (id.includes("@sentry")) return "sentry";
					},
				},
			},
		},
	};
});
