/**
 * Shared Polygon mainnet viem client for read-only calls (balances, allowances, LI.FI probes).
 * Uses {@link getPolygonHttpRpcEndpoints} + `fallback` so one flaky public endpoint does not
 * spam the console with N parallel `readContract` retries (common with publicnode).
 */
import { createPublicClient, fallback, http } from "viem";
import { polygon } from "viem/chains";
import { getPolygonHttpRpcEndpoints } from "@/config/rpc";

let cached: ReturnType<typeof createPolygonPublicClientInner> | null = null;

function createPolygonPublicClientInner() {
	const urls = getPolygonHttpRpcEndpoints();
	return createPublicClient({
		chain: polygon,
		transport: fallback(
			urls.map((url) =>
				http(url, {
					/** Free tiers often kill idle sockets — fail fast and try the next URL in `fallback`. */
					timeout: 15_000,
					retryCount: 1,
				}),
			),
			{ rank: false },
		),
	});
}

export function getPolygonPublicClient() {
	if (!cached) {
		cached = createPolygonPublicClientInner();
	}
	return cached;
}
