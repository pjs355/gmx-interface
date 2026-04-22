import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import type { ProcessedOrder, OrderAggregates } from "@/services/api/simplifiedOrderService";
import type { VenueId } from "@/types/trading/venuePosition";

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

export function buildSyntheticOrder(
	questionId: string,
	venue: string,
	position: "Yes" | "No",
	shares: number,
	avgPrice: number | null,
	cost: number | null,
): ProcessedOrder {
	const price = avgPrice ?? 0;
	const usdcValue = cost ?? shares * price;
	return {
		orderId: `synthetic-${venue.toLowerCase()}-${questionId}-${position}`,
		questionId,
		tokenId: questionId,
		side: "buy",
		position,
		price,
		size: shares,
		filled: true,
		filledAt: null,
		createdAt: new Date().toISOString(),
		usdcValue,
		tokenValue: shares,
		venue,
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
			predictOutcomeLabelYes,
			predictOutcomeLabelNo,
		},
	];
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
	return orders.filter((order) => {
		if (order.questionId !== marketId || !order.filled) return false;
		if (position && order.position?.toLowerCase() !== position.toLowerCase()) return false;
		return true;
	}).length;
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
