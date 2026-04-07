import { sentryVitePlugin } from "@sentry/vite-plugin";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { lingui } from "@lingui/vite-plugin";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Dev-only: tunnels browser requests through Railway `/proxy` (EU egress).
 *
 * - `/polymarket-clob/*` → `https://clob.polymarket.com/*` (geo + CLOB signing)
 * - `/private-api-proxy/*` → **LIVE only**: `POST /api/predict/orders` to Railway EU upstream (default prod API).
 *   **TEST/DEV** (`VITE_ENVIRONMENT_MODE` testnet | local-production): order target defaults to local private API host.
 *   Client only uses this prefix in LIVE; Polymarket CLOB unchanged.
 *
 * Railway /proxy expects: POST { url, method, headers?, body? }
 * Railway /proxy returns: { status, data, ... }
 */
function railwayDevProxyPlugin(
	proxyUrl: string,
	proxyToken: string,
	levelupApiOrigin: string
): Plugin {
	const apiBase = levelupApiOrigin.replace(/\/$/, "");

	return {
		name: "railway-dev-proxy",
		configureServer(server) {
			server.middlewares.use((req, res, next) => {
				const url = req.url ?? "";

				const route =
					url.startsWith("/polymarket-clob")
						? {
								pathPrefix: "/polymarket-clob",
								upstreamOrigin: "https://clob.polymarket.com",
						  }
						: url.startsWith("/private-api-proxy")
						  ? {
									pathPrefix: "/private-api-proxy",
									upstreamOrigin: apiBase,
							  }
						  : null;

				if (!route) return next();

				const { pathPrefix, upstreamOrigin } = route;

				// CORS preflight
				if (req.method === "OPTIONS") {
					res.setHeader("Access-Control-Allow-Origin", "*");
					res.setHeader(
						"Access-Control-Allow-Methods",
						"GET, POST, PUT, DELETE, OPTIONS"
					);
					res.setHeader("Access-Control-Allow-Headers", "*");
					res.statusCode = 204;
					res.end();
					return;
				}

				const targetPath = url.replace(
					new RegExp(`^${pathPrefix}`),
					""
				);
				if (pathPrefix === "/private-api-proxy") {
					const tn =
						(targetPath.split("?")[0] ?? "").split("#")[0] ?? "";
					if (tn !== "/api/predict/orders") {
						res.statusCode = 404;
						res.setHeader("Content-Type", "application/json");
						res.end(
							JSON.stringify({
								error:
									"private-api-proxy only forwards POST /api/predict/orders (use direct private API host for reads)",
							})
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
						forwardHeaders[key] = Array.isArray(val)
							? val.join(", ")
							: val;
					}
				}

				// Buffer request body — preserve exact bytes for HMAC integrity
				const chunks: Buffer[] = [];
				req.on("data", (chunk: Buffer) => chunks.push(chunk));
				req.on("end", () => {
					const rawBody =
						chunks.length > 0
							? Buffer.concat(chunks).toString("utf8")
							: undefined;

				// Railway proxy expects `body` (not `data`) — must be the
				// raw string so the HMAC stays valid byte-for-byte.
				const envelope = JSON.stringify({
					url: targetUrl,
					method: req.method ?? "GET",
					headers: forwardHeaders,
					...(rawBody !== undefined
						? { body: rawBody }
						: {}),
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

					const transport =
						proxyParsed.protocol === "https:"
							? https
							: http;

					const proxyReq = transport.request(
						options,
						(proxyRes: http.IncomingMessage) => {
							const respChunks: Buffer[] = [];
							proxyRes.on("data", (c: Buffer) =>
								respChunks.push(c)
							);
							proxyRes.on("end", () => {
								const body = Buffer.concat(respChunks).toString(
									"utf8"
								);

								res.setHeader(
									"Access-Control-Allow-Origin",
									"*"
								);
								res.setHeader("Content-Type", "application/json");

								try {
									const wrapped = JSON.parse(body);
									// Unwrap: Railway returns { status, data, ... }
									res.statusCode = wrapped.status ?? 200;
									res.end(
										typeof wrapped.data === "string"
											? wrapped.data
											: JSON.stringify(wrapped.data)
									);
								} catch {
									// Non-JSON or unexpected — forward raw
									res.statusCode =
										proxyRes.statusCode ?? 502;
									res.end(body);
								}
							});
						}
					);

					proxyReq.on("error", (err: Error) => {
						console.error(
							"[railway-dev-proxy] upstream error:",
							err.message
						);
						res.statusCode = 502;
						res.end(
							JSON.stringify({
								error: `Proxy error: ${err.message}`,
							})
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
	const viteEnv = loadEnv(mode, process.cwd(), "VITE_");

	/** Must match client (`import.meta.env`): `.env` is in `viteEnv`, not always on `process.env`. */
	const clobProxyFlag =
		process.env.VITE_POLYMARKET_CLOB_PROXY ??
		viteEnv.VITE_POLYMARKET_CLOB_PROXY ??
		"";
	const clobProxyEnabled = String(clobProxyFlag).trim() === "true";
	const clobProxyUrl =
		process.env.VITE_POLY_PROXY_URL ||
		viteEnv.VITE_POLY_PROXY_URL ||
		"https://patriotic-sheepdog.up.railway.app/proxy";
	const clobProxyToken =
		process.env.VITE_POLY_PROXY_TOKEN ||
		viteEnv.VITE_POLY_PROXY_TOKEN ||
		"";

	const viteEnvMode = (
		process.env.VITE_ENVIRONMENT_MODE ||
		viteEnv.VITE_ENVIRONMENT_MODE ||
		""
	).trim();
	const isLocalOrderEnv =
		viteEnvMode === "testnet" || viteEnvMode === "local-production";

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
		(isLocalOrderEnv
			? privateApiHostDefault
			: "https://prediction-api-production.up.railway.app");

	return {
		plugins: [
			// Solana + transitive deps (e.g. readable-stream via hash-base) expect Node `Buffer` and `process`
			// (`process.version.slice` in _stream_writable.js when `process.version` is missing).
			nodePolyfills({
				// readable-stream@2 + hash-base need `global`, full `process`, and `Buffer` at module init
				globals: {
					Buffer: true,
					global: true,
					process: true,
				},
			}),
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
			...(clobProxyEnabled
				? [
						railwayDevProxyPlugin(
							clobProxyUrl,
							clobProxyToken,
							predictProxyTarget
						),
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
				// Lightweight browser shim: @polymarket/clob-client only needs crypto.createHmac
				crypto: path.resolve(__dirname, "./src/polyfills/crypto-hmac-shim.ts"),
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
						privy: ["@privy-io/react-auth"],
						charts: ["recharts"],
						"ethers-vendor": ["ethers"],
						"viem-vendor": ["viem"],
						"solana-vendor": ["@solana/web3.js", "@solana/spl-token"],
						"trading-sdks": ["@polymarket/clob-client", "@polymarket/builder-relayer-client", "@polymarket/builder-signing-sdk", "@predictdotfun/sdk"],
					},
					sourcemapExcludeSources: true,
				},
			},
		},
	};
});
