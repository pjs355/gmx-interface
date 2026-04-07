import { useQuery } from "@tanstack/react-query";
import type { VenuePosition } from "@/types/trading/venuePosition";

const POLYMARKET_DATA_API = "https://data-api.polymarket.com";

/**
 * Polymarket Data API `/activity` rows are not uniformly typed across TRADE vs REDEEM.
 * As of 2025–2026, TRADE events commonly use `size` (shares) and `usdcSize` (USDC notional),
 * not the older `tokens` / `cash` names our code originally assumed — reading the wrong
 * fields produced all zeros (cost=0, shares=0, avgPrice=null).
 *
 * @see Example TRADE shape logged from production API:
 * `{ size, usdcSize, price, side, outcome, conditionId, asset, title, ... }`
 */
interface PolymarketActivityRow {
	id?: string;
	type?: string;
	proxyWallet?: string;
	side?: "BUY" | "SELL";
	conditionId: string;
	asset?: string;
	outcome: string;
	title?: string;
	slug?: string;
	icon?: string;
	eventSlug?: string;
	/** Legacy / alternate field names */
	tokens?: number;
	cash?: number;
	/** Current API: conditional outcome token amount */
	size?: number;
	/** Current API: USDC leg of the fill */
	usdcSize?: number;
	price?: number;
	timestamp?: number | string;
	transactionHash?: string;
}

function numFromApi(v: unknown): number {
	if (v === null || v === undefined || v === "") return 0;
	const n = typeof v === "string" ? Number.parseFloat(v) : Number(v);
	return Number.isFinite(n) ? n : 0;
}

/** Shares (outcome tokens) for a TRADE or REDEEM activity row */
function activityShares(row: PolymarketActivityRow): number {
	const r = row as unknown as Record<string, unknown>;
	return (
		numFromApi(r.size) ||
		numFromApi(r.tokens) ||
		numFromApi(r.amount)
	);
}

/** USDC moved in the activity (spent/received/redeemed) */
function activityUsdc(row: PolymarketActivityRow): number {
	const r = row as unknown as Record<string, unknown>;
	return (
		numFromApi(r.usdcSize) ||
		numFromApi(r.cash) ||
		numFromApi(r.usdc)
	);
}

interface AggregatedTrade {
	conditionId: string;
	asset: string;
	title: string;
	outcome: string;
	eventSlug: string;
	icon: string;
	totalBought: number;
	totalSold: number;
	totalSpent: number;
	totalReceived: number;
	netShares: number;
	redeemed: boolean;
	redeemCash: number;
}

async function fetchActivityPage(
	safeAddress: string,
	type: string,
	limit: number,
	maxPages: number
): Promise<PolymarketActivityRow[]> {
	const all: PolymarketActivityRow[] = [];
	let offset = 0;
	for (let page = 0; page < maxPages; page++) {
		const url = `${POLYMARKET_DATA_API}/activity?user=${safeAddress}&type=${type}&limit=${limit}&offset=${offset}`;
		const res = await fetch(url);
		if (!res.ok) break;
		const rows: PolymarketActivityRow[] = await res.json();
		if (!Array.isArray(rows) || rows.length === 0) break;
		all.push(...rows);
		if (rows.length < limit) break;
		offset += limit;
	}
	return all;
}

/**
 * Fetches TRADE + REDEEM activity for a Polymarket Safe wallet and aggregates
 * into per-market history entries. REDEEM presence determines win status.
 */
async function fetchPolymarketTradeHistory(
	safeAddress: string
): Promise<VenuePosition[]> {
	const [trades, redeems] = await Promise.all([
		fetchActivityPage(safeAddress, "TRADE", 500, 10),
		fetchActivityPage(safeAddress, "REDEEM", 500, 5),
	]);

	if (trades.length === 0 && redeems.length === 0) return [];

	// Track which conditionId+outcome had a REDEEM (user won and redeemed)
	const redeemedKeys = new Map<string, number>();
	for (const r of redeems) {
		const key = `${r.conditionId}::${r.outcome}`;
		redeemedKeys.set(key, (redeemedKeys.get(key) ?? 0) + activityUsdc(r));
	}

	const byKey = new Map<string, AggregatedTrade>();
	for (const row of trades) {
		const key = `${row.conditionId}::${row.outcome}`;
		const tok = activityShares(row);
		const usd = activityUsdc(row);
		let agg = byKey.get(key);
		if (!agg) {
			agg = {
				conditionId: row.conditionId,
				asset: row.asset ?? "",
				title: row.title ?? "",
				outcome: row.outcome,
				eventSlug: row.eventSlug ?? "",
				icon: row.icon ?? "",
				totalBought: 0,
				totalSold: 0,
				totalSpent: 0,
				totalReceived: 0,
				netShares: 0,
				redeemed: redeemedKeys.has(key),
				redeemCash: redeemedKeys.get(key) ?? 0,
			};
			byKey.set(key, agg);
		}
		if (row.side === "BUY") {
			agg!.totalBought += tok;
			agg!.totalSpent += usd;
			agg!.netShares += tok;
		} else {
			agg!.totalSold += tok;
			agg!.totalReceived += usd;
			agg!.netShares -= tok;
		}
	}

	const results = Array.from(byKey.values()).map((agg): VenuePosition => {
		const avgPrice =
			agg.totalBought > 0 ? agg.totalSpent / agg.totalBought : null;
		const totalPayout = agg.totalReceived + agg.redeemCash;
		const pnl = totalPayout - agg.totalSpent;

		return {
			venue: "polymarket",
			marketTitle: agg.title,
			outcome: agg.outcome,
			/** Total outcome tokens bought (pairs with `cost` = sum of buy notionals) */
			shares: agg.totalBought,
			avgPrice,
			currentPrice: null,
			cost: agg.totalSpent,
			currentValue: 0,
			pnl,
			pnlPercent:
				agg.totalSpent > 0 ? (pnl / agg.totalSpent) * 100 : null,
			tokenId: agg.asset,
			conditionId: agg.conditionId,
			eventSlug: agg.eventSlug,
			iconUrl: agg.icon,
			outcomeResult: agg.redeemed ? "WON" : null,
			marketStatus: "RESOLVED",
		};
	});

	return results;
}

/**
 * Fetches comprehensive Polymarket trade history via the public Activity API.
 * Returns aggregated trade data per conditionId+outcome, covering settled
 * markets that no longer appear in the positions endpoint.
 */
export function usePolymarketTradeHistory(
	safeAddress: string | undefined | null
) {
	return useQuery<VenuePosition[]>({
		queryKey: ["polymarket-trade-history", safeAddress?.toLowerCase() ?? null],
		enabled: Boolean(safeAddress),
		staleTime: 120_000,
		queryFn: () => fetchPolymarketTradeHistory(safeAddress!),
	});
}
