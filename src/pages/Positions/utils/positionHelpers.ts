import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import {
	type ProcessedOrder,
	type OrderAggregates,
	getFinalAmount,
	normalizeOrderQuestionIdKey,
} from "@/services/api/simplifiedOrderService";
import type {
	VenueHistoryFill,
	VenueId,
	VenuePosition,
} from "@/types/trading/venuePosition";
import { venueDisplayLabel } from "@/types/trading/venuePosition";
import {
	inferVenueHistoryYesNoSide,
} from "@/pages/Positions/utils/historyOutcomeWinner";

export type MarketPosition = {
	market: PredictionMarket;
	yesBalance: number;
	noBalance: number;
	yesPrice: number | null;
	noPrice: number | null;
	yesValue: number;
	noValue: number;
	totalValue: number;
	orders: ProcessedOrder[];
	aggregates: OrderAggregates;
	venue?: VenueId;
	/**
	 * After {@link mergeMarketPositions}, `venue` is cleared — set when any merged leg was DFlow
	 * so Positions views still use {@link portfolioColumnTeamLabels} for Yes/No column headers.
	 */
	includesDflowVenue?: boolean;
	/**
	 * Same pattern as `includesDflowVenue`: merged rows lose `venue === "limitless"` but Positions
	 * table/card need catalog team labels for Yes/No buckets (dual CLOB → tokenIdA/B → columns).
	 */
	includesLimitlessVenue?: boolean;
	predictOutcomeLabelYes?: string;
	predictOutcomeLabelNo?: string;
};

export type UmbrellaPositions = {
	umbrella: Umbrella;
	markets: MarketPosition[];
};

const GENERIC_SUB_MARKET_TITLES = new Set([
	"match winner",
	"map winner",
	"winner",
	"over/under",
	"total",
	"moneyline",
]);

export function isGenericSubMarketTitle(title: string): boolean {
	return GENERIC_SUB_MARKET_TITLES.has(title.trim().toLowerCase());
}

/**
 * Green/red only for literal "Yes" / "No". Team or other outcome names use `neutralColor` (e.g. white).
 */
export function outcomeSideLabelColor(
	displayLabel: string | null | undefined,
	yesColor = "#16a34a",
	noColor = "#ef4444",
	neutralColor = "#ffffff",
): string {
	const t = displayLabel?.trim().toLowerCase();
	if (t === "yes") return yesColor;
	if (t === "no") return noColor;
	return neutralColor;
}

function dflowSyntheticPositionBucket(pos: VenuePosition): "Yes" | "No" {
	return pos.outcome.trim().toLowerCase() === "no" ? "No" : "Yes";
}

function syntheticOrderPositionFromVenue(pos: VenuePosition): "Yes" | "No" {
	if (pos.venue === "dflow") return dflowSyntheticPositionBucket(pos);
	return inferVenueHistoryYesNoSide(pos.marketTitle, pos.outcome);
}

/** History merged rows: same bucket rule as venue synthetic orders (DFlow uses catalog Yes/No). */
export function historyVenueRowPortfolioYesNoSide(pos: VenuePosition): "Yes" | "No" {
	return syntheticOrderPositionFromVenue(pos);
}

/**
 * Use FIFO remaining cost/shares from the same filled-order stream as expanded trade history,
 * when they match portfolio row shares (fixes mismatch vs venue aggregate cost).
 */
export function fifoAlignedBasisForPositionsRow(
	orders: ProcessedOrder[],
	candidateQuestionIds: readonly string[],
	side: "Yes" | "No",
	rowShares: number,
): { fifoCost: number | null; fifoAvgPrice: number | null } {
	if (!orders?.length || candidateQuestionIds.length === 0) {
		return { fifoCost: null, fifoAvgPrice: null };
	}
	const epsilon = Math.max(0.051, rowShares * 1e-6);
	const uniq = [...new Set(candidateQuestionIds)];
	for (const qid of uniq) {
		const fa = getFinalAmount(orders, qid);
		const fs = side === "Yes" ? fa.yesShares : fa.noShares;
		const fc = side === "Yes" ? fa.yesCost : fa.noCost;
		if (Math.abs(fs - rowShares) > epsilon) continue;
		if (!(fc >= 0) || !(fs >= 0)) continue;
		const fifoAvgPrice = fs > 0 ? fc / fs : null;
		return { fifoCost: fc, fifoAvgPrice };
	}
	return { fifoCost: null, fifoAvgPrice: null };
}

export function buildSyntheticOrder(
	questionId: string,
	venue: string,
	position: "Yes" | "No",
	shares: number,
	avgPrice: number | null,
	cost: number | null,
	tradeAt?: string | null,
	positionDisplayLabel?: string,
): ProcessedOrder {
	const price = avgPrice ?? 0;
	const usdcValue = cost ?? shares * price;
	const at = tradeAt?.trim();
	return {
		orderId: `synthetic-${venue.toLowerCase()}-${questionId}-${position}`,
		questionId,
		tokenId: questionId,
		side: "buy",
		position,
		price,
		size: shares,
		filled: true,
		filledAt: at || null,
		createdAt: at || "",
		usdcValue,
		tokenValue: shares,
		venue,
		...(positionDisplayLabel?.trim()
			? { positionDisplayLabel: positionDisplayLabel.trim() }
			: {}),
	};
}

/**
 * Volume-weighted mark using only legs that have an explicit price. Avoids diluting
 * (e.g.) Polymarket `curPrice` with LevelUp shares that have no No-side quote (`noValue` 0).
 */
function shareWeightedMarkPrice(
	markets: MarketPosition[],
	leg: "yes" | "no",
): number | null {
	let sumPxSh = 0;
	let sumSh = 0;
	for (const mp of markets) {
		const shares = leg === "yes" ? mp.yesBalance : mp.noBalance;
		const price = leg === "yes" ? mp.yesPrice : mp.noPrice;
		if (shares <= 0) continue;
		if (price === null || price === undefined || !Number.isFinite(price)) continue;
		sumPxSh += shares * price;
		sumSh += shares;
	}
	if (sumSh <= 0) return null;
	return sumPxSh / sumSh;
}

export function mergeMarketPositions(markets: MarketPosition[]): MarketPosition[] {
	if (markets.length <= 1) return markets;

	const luMarket = markets.find((m) => m.venue === "levelup") ?? markets[0];
	const primaryMarket = luMarket.market;

	let totalYesShares = 0;
	let totalYesCost = 0;
	let totalNoShares = 0;
	let totalNoCost = 0;
	let bestYesPrice: number | null = null;
	let bestNoPrice: number | null = null;
	let yesValue = 0;
	let noValue = 0;
	const allOrders: ProcessedOrder[] = [];
	let predictOutcomeLabelYes: string | undefined;
	let predictOutcomeLabelNo: string | undefined;

	for (const mp of markets) {
		totalYesShares += mp.yesBalance;
		totalNoShares += mp.noBalance;
		totalYesCost += mp.aggregates.Yes.totalValue;
		totalNoCost += mp.aggregates.No.totalValue;
		yesValue += mp.yesValue;
		noValue += mp.noValue;

		if (mp.yesPrice !== null && bestYesPrice === null) bestYesPrice = mp.yesPrice;
		if (mp.noPrice !== null && bestNoPrice === null) bestNoPrice = mp.noPrice;

		allOrders.push(...mp.orders);

		if (mp.predictOutcomeLabelYes) predictOutcomeLabelYes = mp.predictOutcomeLabelYes;
		if (mp.predictOutcomeLabelNo) predictOutcomeLabelNo = mp.predictOutcomeLabelNo;
	}

	const yesAvg = totalYesShares > 0 ? totalYesCost / totalYesShares : null;
	const noAvg = totalNoShares > 0 ? totalNoCost / totalNoShares : null;

	const weightedYes = shareWeightedMarkPrice(markets, "yes");
	const weightedNo = shareWeightedMarkPrice(markets, "no");
	const impliedYesFromValue =
		totalYesShares > 0 && yesValue > 0 ? yesValue / totalYesShares : null;
	const impliedNoFromValue =
		totalNoShares > 0 && noValue > 0 ? noValue / totalNoShares : null;

	const blendedYesPrice = weightedYes ?? impliedYesFromValue ?? bestYesPrice;
	const blendedNoPrice = weightedNo ?? impliedNoFromValue ?? bestNoPrice;

	const includesDflowVenue = markets.some((m) => m.venue === "dflow");
	const includesLimitlessVenue = markets.some((m) => m.venue === "limitless");

	return [
		{
			market: primaryMarket,
			yesBalance: totalYesShares,
			noBalance: totalNoShares,
			yesPrice: blendedYesPrice,
			noPrice: blendedNoPrice,
			yesValue,
			noValue,
			totalValue: yesValue + noValue,
			orders: allOrders,
			aggregates: {
				Yes: { totalSize: totalYesShares, totalValue: totalYesCost, avgPrice: yesAvg, count: 0 },
				No: { totalSize: totalNoShares, totalValue: totalNoCost, avgPrice: noAvg, count: 0 },
			},
			venue: undefined,
			...(includesDflowVenue ? { includesDflowVenue: true } : {}),
			...(includesLimitlessVenue ? { includesLimitlessVenue: true } : {}),
			predictOutcomeLabelYes,
			predictOutcomeLabelNo,
		},
	];
}

function normalizeVenueHistorySynthPrice(
	avg: number | null | undefined,
	cost: number | null | undefined,
	shares: number,
): number {
	let p = avg != null && Number.isFinite(avg) ? avg : 0;
	if (p > 1 && p <= 100) p /= 100;
	if (p <= 0 && cost != null && cost > 0 && shares > 0) p = cost / shares;
	if (p > 1 && p <= 100) p /= 100;
	return p > 0 && p <= 1 ? p : 0;
}

/**
 * Magnitude string for History return % (avoids showing −1% when the value is about −0.6%).
 * Sign is applied by the caller (`+` / `−`).
 */
export function formatHistoryReturnPctAbs(pct: number): string {
	const a = Math.abs(pct);
	if (!Number.isFinite(a)) return "0";
	if (a >= 10) return String(Math.round(a));
	const s = a.toFixed(1);
	if (s === "0.0") return "0";
	return s.endsWith(".0") ? s.slice(0, -2) : s;
}

function venueHistoryFillToSyntheticOrder(
	pos: VenuePosition,
	f: VenueHistoryFill,
	index: number,
): ProcessedOrder | null {
	if (!(f.usdc > 0 || f.shares > 0)) return null;
	const position = syntheticOrderPositionFromVenue(pos);
	const positionDisplayLabel =
		pos.venue === "dflow" && pos.dflowTradeSideLabel?.trim()
			? pos.dflowTradeSideLabel.trim()
			: undefined;
	const shares = Math.max(f.shares, 0);
	const probPrice =
		shares > 0
			? normalizeVenueHistorySynthPrice(f.price ?? null, f.usdc, shares)
			: normalizeVenueHistorySynthPrice(f.price ?? null, null, 1);
	const oid =
		f.sourceId?.trim()
			? `synth-vh-fill-${pos.venue}-${f.sourceId.trim().slice(0, 48)}-${index}`
			: `synth-vh-fill-${pos.tokenId}-${index}-${f.side}-${f.tradedAt}`;
	const ts = f.tradedAt?.trim() ?? "";
	return {
		orderId: oid,
		questionId: pos.tokenId,
		tokenId: pos.tokenId,
		side: f.side,
		position,
		price: probPrice,
		size: shares,
		filled: true,
		filledAt: ts || null,
		createdAt: ts,
		usdcValue: f.usdc,
		tokenValue: shares,
		venue: venueDisplayLabel(pos.venue),
		...(positionDisplayLabel ? { positionDisplayLabel } : {}),
	};
}

/** Map a venue history {@link VenuePosition} to a filled {@link ProcessedOrder} for History tables. */
export function venueHistoryRowToSyntheticOrder(pos: VenuePosition): ProcessedOrder | null {
	if (pos.historyFills?.length) return null;
	if (pos.shares <= 0) {
		const c = pos.cost;
		if (c == null || c <= 0) return null;
	}
	const position = syntheticOrderPositionFromVenue(pos);
	const positionDisplayLabel =
		pos.venue === "dflow" && pos.dflowTradeSideLabel?.trim()
			? pos.dflowTradeSideLabel.trim()
			: undefined;
	const effShares =
		pos.shares > 0
			? pos.shares
			: pos.avgPrice != null &&
					Number.isFinite(pos.avgPrice) &&
					pos.avgPrice > 0 &&
					pos.cost != null &&
					pos.cost > 0
				? pos.cost /
					(pos.avgPrice > 1 && pos.avgPrice <= 100
						? pos.avgPrice / 100
						: pos.avgPrice)
				: 0;
	const probPrice = normalizeVenueHistorySynthPrice(
		pos.avgPrice,
		pos.cost,
		effShares > 0 ? effShares : pos.shares,
	);
	const usdcValue =
		pos.cost != null && pos.cost > 0 ? pos.cost : probPrice > 0 ? probPrice * effShares : 0;
	const oid = pos.historySourceId?.trim()
		? `synth-vh-${pos.historySourceId.trim()}`
		: `synth-vh-${pos.tokenId}-${pos.venue}-${effShares}-${probPrice}-${usdcValue}`;
	const side = pos.historyTradeSide === "sell" ? "sell" : "buy";
	const ts = pos.historyTradeAt?.trim() ?? "";
	return {
		orderId: oid,
		questionId: pos.tokenId,
		tokenId: pos.tokenId,
		side,
		position,
		price: probPrice,
		size: effShares,
		filled: true,
		filledAt: ts || null,
		createdAt: ts,
		usdcValue,
		tokenValue: effShares,
		venue: venueDisplayLabel(pos.venue),
		...(positionDisplayLabel ? { positionDisplayLabel } : {}),
	};
}

/**
 * Synthetic orders for History: one row per {@link VenuePosition.historyFills} entry when set,
 * otherwise a single aggregate row from {@link venueHistoryRowToSyntheticOrder}.
 */
export function venueHistoryPositionToSyntheticOrders(
	pos: VenuePosition,
): ProcessedOrder[] {
	const fills = pos.historyFills;
	if (fills?.length) {
		const out: ProcessedOrder[] = [];
		for (let i = 0; i < fills.length; i++) {
			const o = venueHistoryFillToSyntheticOrder(pos, fills[i]!, i);
			if (o) out.push(o);
		}
		return out;
	}
	const one = venueHistoryRowToSyntheticOrder(pos);
	return one ? [one] : [];
}

export function buildSyntheticUmbrella(
	idPrefix: string,
	displayName: string,
	extras?: Record<string, any>,
): Umbrella {
	return {
		_id: idPrefix,
		displayName,
		children: [],
		originalChildren: [],
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		__v: 0,
		...extras,
	} as unknown as Umbrella;
}

export function getTradeCount(
	orders: ProcessedOrder[],
	marketId: string,
	position?: "Yes" | "No",
): number {
	const want = normalizeOrderQuestionIdKey(marketId);
	return orders.filter((order) => {
		if (!order.filled) return false;
		if (normalizeOrderQuestionIdKey(String(order.questionId ?? "")) !== want) {
			return false;
		}
		if (position && order.position?.toLowerCase() !== position.toLowerCase()) return false;
		return true;
	}).length;
}

/** FNV-1a 32-bit — deterministic short id for synthetic History blocks. */
function fnv1a32Hex(input: string): string {
	let h = 2166136261 >>> 0;
	for (let i = 0; i < input.length; i++) {
		h ^= input.charCodeAt(i);
		h = Math.imul(h, 16777619) >>> 0;
	}
	return h.toString(16).padStart(8, "0");
}

/**
 * Stable id for unmatched venue-history umbrella blocks.
 * Avoids collisions from `title.slice(0, 20)` (e.g. "Counter-Strike: Keyd vs Legacy" vs "…Crashers").
 */
export function venueHistorySyntheticUmbrellaId(
	title: string,
	positions: VenuePosition[],
): string {
	const p0 = positions[0];
	const anchor = [
		p0?.venue ?? "",
		p0?.conditionId ?? "",
		p0?.numericMarketId != null ? String(p0.numericMarketId) : "",
		p0?.eventSlug ?? "",
		p0?.tokenId ?? "",
	].join("|");
	const h = fnv1a32Hex(`${title}\n${anchor}`);
	return `venue-hist-${h}`;
}

export function getNetCashFlow(
	orders: ProcessedOrder[],
	marketId: string,
	side: "Yes" | "No",
): number {
	const sideOrders = orders.filter(
		(order) =>
			order.questionId === marketId &&
			order.filled &&
			order.position?.toLowerCase() === side.toLowerCase(),
	);
	const cashOut = sideOrders
		.filter((o) => o.side === "buy")
		.reduce((sum, o) => sum + (o.usdcValue || 0), 0);
	const cashIn = sideOrders
		.filter((o) => o.side === "sell")
		.reduce((sum, o) => sum + (o.usdcValue || 0), 0);
	return cashIn - cashOut;
}
