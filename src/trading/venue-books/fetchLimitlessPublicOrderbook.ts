import type { OrderbookSnapshot } from "@/services/api/orderbookService";
import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";
import { LIMITLESS_LEGACY_CLIENT_FALLBACKS } from "@/config/limitlessLegacyClientFallbacks";
import { isClobProxyEnabled } from "@/config/privateApiBase";

/**
 * Limitless REST does not send `Access-Control-Allow-Origin`, so the browser cannot call
 * `https://api.limitless.exchange/...` directly.
 *
 * - **Dev + CLOB proxy (`VITE_POLYMARKET_CLOB_PROXY=true`):** same-origin `/limitless-exchange-proxy/...`
 *   → Vite `railwayDevProxyPlugin` → Railway `/proxy` → `api.limitless.exchange` (same URL/token as Polymarket/Predict).
 * - **Dev with legacy fallbacks only:** same-origin `/__limitless-api/...` (Vite direct Node → Limitless).
 * - **Production and default dev:** prediction API `GET /api/public/limitless-orderbook?slug=`
 *   (server forward + CORS on the predictions host).
 */
function limitlessOrderbookRequestUrl(slug: string): string {
	const enc = encodeURIComponent(slug.trim());
	if (!import.meta.env.PROD && isClobProxyEnabled()) {
		return `/limitless-exchange-proxy/markets/${enc}/orderbook`;
	}
	if (!import.meta.env.PROD && LIMITLESS_LEGACY_CLIENT_FALLBACKS) {
		return `/__limitless-api/markets/${enc}/orderbook`;
	}
	const base = getPredictionApiBaseUrl().replace(/\/$/, "");
	return `${base}/api/public/limitless-orderbook?slug=${enc}`;
}

type LxLevel = { price?: number; size?: number; side?: string };

function parseLevels(levels: LxLevel[] | undefined, kind: "asks" | "bids"): OrderbookSnapshot["asks"] {
	if (!levels?.length) return [];
	const rows = levels
		.filter((l) => {
			const p = l.price;
			const sz = l.size;
			return typeof p === "number" && Number.isFinite(p) && typeof sz === "number" && Number.isFinite(sz) && sz > 0;
		})
		.sort((a, b) => (kind === "asks" ? a.price! - b.price! : b.price! - a.price!));
	return rows.map((l, i) => ({
		price: l.price!,
		size: l.size!,
		id: `lx-${kind}-${i}`,
	}));
}

/**
 * Public GET — no API key. Same source Limitless UI uses; mirrors the Polymarket "direct book"
 * path when venue-prices WS does not populate limitlessPriceA/B.
 */
export async function fetchLimitlessOrderbookSnapshotBySlug(slug: string): Promise<OrderbookSnapshot | null> {
	const s = slug.trim();
	if (!s) return null;
	const url = limitlessOrderbookRequestUrl(s);
	try {
		const res = await fetch(url);
		if (!res.ok) return null;
		const json = (await res.json()) as { bids?: LxLevel[]; asks?: LxLevel[] };
		const asks = parseLevels(json.asks, "asks");
		const bids = parseLevels(json.bids, "bids");
		if (asks.length === 0 && bids.length === 0) return null;
		return {
			asks,
			bids,
			stopBook: { asks: [], bids: [] },
			ts: Date.now(),
			lastOp: 0,
		};
	} catch {
		return null;
	}
}
