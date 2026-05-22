import { useQuery } from "@tanstack/react-query";
import type { VenueHistoryFill, VenuePosition } from "@/types/trading/venuePosition";

/** Public activity feed — not Polymarket CLOB V2 order/trade HTTP (`clob.polymarket.com`). */
const POLYMARKET_DATA_API = "https://data-api.polymarket.com";

/** Orphan-condition REDEEM (empty outcome) attributed per net outcome share (~UMA Unknown/50-50 economics). */
const SPLIT_PER_SHARE_LO = 0.42;
const SPLIT_PER_SHARE_HI = 0.58;

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
	outcomeIndex?: number;
}

function numFromApi(v: unknown): number {
	if (v === null || v === undefined || v === "") return 0;
	const n = typeof v === "string" ? Number.parseFloat(v) : Number(v);
	return Number.isFinite(n) ? n : 0;
}

/** Align TRADE vs REDEEM rows where API outcome casing differs — keys must match for redeemed detection */
function outcomeNorm(outcome: string | undefined | null): string {
	return String(outcome ?? "").trim().toLowerCase();
}

function aggOutcomeKey(conditionId: string, outcome: string): string {
	return `${conditionId.trim()}::${outcomeNorm(outcome)}`;
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
	/** Latest activity timestamp (ms) among TRADE + matching REDEEM rows for this leg */
	lastActivityMs: number | null;
	fills: VenueHistoryFill[];
	/** Set when orphan-condition REDEEM dollars / netShares ≈ $0.50 (History badge). */
	polymarketSplitSettlementLikely?: boolean;
}

/** Normalize Polymarket activity `timestamp` (seconds, ms, or ISO string). */
function activityTimestampMs(row: PolymarketActivityRow): number | null {
	const t = row.timestamp;
	if (t === null || t === undefined || t === "") return null;
	if (typeof t === "number" && Number.isFinite(t)) {
		return t > 1e12 ? Math.floor(t) : Math.floor(t * 1000);
	}
	const s = String(t).trim();
	if (!s) return null;
	const n = Number(s);
	if (Number.isFinite(n)) return n > 1e12 ? Math.floor(n) : Math.floor(n * 1000);
	const parsed = Date.parse(s);
	return Number.isFinite(parsed) ? parsed : null;
}

function bumpLastActivity(agg: AggregatedTrade, row: PolymarketActivityRow): void {
	const ms = activityTimestampMs(row);
	if (ms == null) return;
	if (agg.lastActivityMs == null || ms > agg.lastActivityMs) agg.lastActivityMs = ms;
}

function activityRowToFill(row: PolymarketActivityRow): VenueHistoryFill | null {
	const tok = activityShares(row);
	const usd = activityUsdc(row);
	if (tok <= 0 && usd <= 0) return null;
	const raw = row.side;
	const side: "buy" | "sell" = raw === "SELL" ? "sell" : "buy";
	const fillMs = activityTimestampMs(row);
	const tradedAt =
		fillMs != null ? new Date(fillMs).toISOString() : "";
	const r = row as unknown as Record<string, unknown>;
	const src =
		(typeof r.transactionHash === "string" && r.transactionHash.trim()) ||
		(typeof r.id === "string" && r.id.trim()) ||
		undefined;
	const pr = row.price != null ? numFromApi(row.price) : null;
	const price =
		pr != null && Number.isFinite(pr) && pr > 0 ? pr : null;
	return { side, shares: tok, usdc: usd, tradedAt, sourceId: src, price };
}

function redeemRowToFill(r: PolymarketActivityRow): VenueHistoryFill | null {
	const tok = activityShares(r);
	const usd = activityUsdc(r);
	if (tok <= 0 && usd <= 0) return null;
	const fillMs = activityTimestampMs(r);
	const tradedAt =
		fillMs != null ? new Date(fillMs).toISOString() : "";
	const ro = r as unknown as Record<string, unknown>;
	const src =
		(typeof ro.transactionHash === "string" && ro.transactionHash.trim()) ||
		(typeof ro.id === "string" && ro.id.trim()) ||
		undefined;
	const price =
		tok > 0 && usd > 0 ? usd / tok : null;
	/** Settlement / redemption: cash in, token burn — show as sell in cash-flow math */
	return {
		side: "sell",
		shares: tok,
		usdc: usd,
		tradedAt,
		sourceId: src,
		price,
	};
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

type OrphanTotals = Map<string, { usdcSum: number; lastActivityMs: number | null }>;

function accumulateOrphanRedeemTotals(redeems: PolymarketActivityRow[]): OrphanTotals {
	const totals: OrphanTotals = new Map();
	for (const r of redeems) {
		const cid = r.conditionId?.trim();
		if (!cid) continue;
		if (outcomeNorm(r.outcome) !== "") continue;
		const usd = activityUsdc(r);
		if (usd <= 0) continue;
		const ms = activityTimestampMs(r);
		const cur =
			totals.get(cid) ?? { usdcSum: 0, lastActivityMs: null };
		cur.usdcSum += usd;
		if (ms != null && (cur.lastActivityMs == null || ms > cur.lastActivityMs)) {
			cur.lastActivityMs = ms;
		}
		totals.set(cid, cur);
	}
	return totals;
}

/**
 * Attach condition-level orphan REDEEM cash to outcome legs (+ synthetic redeem fills aligned
 * with `netShares` so History cash-flow totals match redeemed USDC).
 */
function distributeOrphanPolymarketRedeems(
	byKey: Map<string, AggregatedTrade>,
	redeems: PolymarketActivityRow[],
	orphanTotals: OrphanTotals,
): void {
	for (const [cid, { usdcSum, lastActivityMs }] of orphanTotals) {
		if (usdcSum <= 1e-9) continue;

		const cands = [...byKey.entries()].filter(
			([, agg]) =>
				agg.conditionId.trim() === cid.trim() &&
				agg.netShares > 1e-9 &&
				outcomeNorm(agg.outcome) !== "",
		);

		if (cands.length === 0) {
			const r0 =
				redeems.find((r) => {
					const c = r.conditionId?.trim();
					return !!(c && c === cid.trim() && outcomeNorm(r.outcome) === "");
				}) ?? null;
			if (!r0) continue;
			const key = aggOutcomeKey(cid, r0.outcome);
			let agg = byKey.get(key);
			if (!agg) {
				agg = {
					conditionId: cid,
					asset: r0.asset ?? "",
					title: r0.title ?? "",
					outcome: r0.outcome,
					eventSlug: r0.eventSlug ?? "",
					icon: r0.icon ?? "",
					totalBought: 0,
					totalSold: 0,
					totalSpent: 0,
					totalReceived: 0,
					netShares: 0,
					redeemed: true,
					redeemCash: usdcSum,
					lastActivityMs: null,
					fills: [],
				};
				bumpLastActivity(agg, r0);
				byKey.set(key, agg);
			} else {
				agg.redeemCash += usdcSum;
				agg.redeemed = true;
			}
			const rf = redeemRowToFill({
				...r0,
				usdcSize: usdcSum,
				size: activityShares(r0) || undefined,
			});
			if (rf) {
				agg.fills.push(rf);
				if (rf.shares > 1e-9) {
					const ps = rf.usdc / rf.shares;
					if (ps >= SPLIT_PER_SHARE_LO && ps <= SPLIT_PER_SHARE_HI) {
						agg.polymarketSplitSettlementLikely = true;
					}
				}
			}
			continue;
		}

		let shareDenom = 0;
		for (const [, a] of cands) {
			shareDenom += a.netShares;
		}
		if (!(shareDenom > 1e-9)) continue;

		const tradedAtIso =
			lastActivityMs != null
				? new Date(lastActivityMs).toISOString()
				: "";

		for (const [mapKey, agg] of cands) {
			const attrib = usdcSum * (agg.netShares / shareDenom);
			if (!(attrib > 1e-9)) continue;
			agg.redeemCash += attrib;
			agg.redeemed = true;
			const perShare = attrib / agg.netShares;
			if (perShare >= SPLIT_PER_SHARE_LO && perShare <= SPLIT_PER_SHARE_HI) {
				agg.polymarketSplitSettlementLikely = true;
			}
			const price = perShare > 0 ? perShare : null;
			agg.fills.push({
				side: "sell",
				shares: agg.netShares,
				usdc: attrib,
				tradedAt: tradedAtIso,
				sourceId: `polymarket-orphan-redeem:${cid}:${mapKey}`,
				price,
			});
			if (lastActivityMs != null) {
				if (agg.lastActivityMs == null || lastActivityMs > agg.lastActivityMs) {
					agg.lastActivityMs = lastActivityMs;
				}
			}
		}
	}
}

/**
 * Fetches TRADE + REDEEM activity for a Polymarket Safe wallet and aggregates
 * into per-market history entries. REDEEM presence determines win status.
 */
async function fetchPolymarketTradeHistory(
	safeAddress: string
): Promise<VenuePosition[]> {
	const [trades, redeems] = await Promise.all([
		fetchActivityPage(safeAddress, "TRADE", 500, 40),
		fetchActivityPage(safeAddress, "REDEEM", 500, 24),
	]);

	if (trades.length === 0 && redeems.length === 0) return [];

	const orphanTotals = accumulateOrphanRedeemTotals(redeems);

	const redeemedKeys = new Map<string, number>();
	for (const r of redeems) {
		const rk = r.conditionId?.trim();
		if (!rk) continue;
		if (outcomeNorm(r.outcome) === "") continue;
		const key = aggOutcomeKey(rk, r.outcome);
		redeemedKeys.set(key, (redeemedKeys.get(key) ?? 0) + activityUsdc(r));
	}

	const byKey = new Map<string, AggregatedTrade>();
	for (const row of trades) {
		const cid = row.conditionId?.trim();
		if (!cid) continue;
		const key = aggOutcomeKey(cid, row.outcome);
		const tok = activityShares(row);
		const usd = activityUsdc(row);
		let agg = byKey.get(key);
		if (!agg) {
			agg = {
				conditionId: cid,
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
				lastActivityMs: null,
				fills: [],
			};
			byKey.set(key, agg);
		}
		bumpLastActivity(agg!, row);
		const tradeFill = activityRowToFill(row);
		if (tradeFill) agg!.fills.push(tradeFill);
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

	for (const r of redeems) {
		if (outcomeNorm(r.outcome) === "") continue;
		const rcid = r.conditionId?.trim();
		if (!rcid) continue;
		const key = aggOutcomeKey(rcid, r.outcome);
		let agg = byKey.get(key);
		if (!agg) {
			agg = {
				conditionId: rcid,
				asset: r.asset ?? "",
				title: r.title ?? "",
				outcome: r.outcome,
				eventSlug: r.eventSlug ?? "",
				icon: r.icon ?? "",
				totalBought: 0,
				totalSold: 0,
				totalSpent: 0,
				totalReceived: 0,
				netShares: 0,
				redeemed: true,
				redeemCash: redeemedKeys.get(key) ?? 0,
				lastActivityMs: null,
				fills: [],
			};
			byKey.set(key, agg);
		}
		bumpLastActivity(agg, r);
		const rf = redeemRowToFill(r);
		if (rf) agg.fills.push(rf);
	}

	distributeOrphanPolymarketRedeems(byKey, redeems, orphanTotals);

	for (const agg of byKey.values()) {
		agg.fills.sort(
			(a, b) =>
				Date.parse(a.tradedAt || "0") - Date.parse(b.tradedAt || "0"),
		);
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
			...(agg.polymarketSplitSettlementLikely === true
				? { polymarketSplitSettlementLikely: true }
				: {}),
			...(agg.lastActivityMs != null
				? { historyTradeAt: new Date(agg.lastActivityMs).toISOString() }
				: {}),
			...(agg.fills.length > 0 ? { historyFills: agg.fills } : {}),
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
