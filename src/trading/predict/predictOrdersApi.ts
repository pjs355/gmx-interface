import type { VenueOrder } from "@/types/trading/venuePosition";

/** Raw row returned from GET /v1/orders (proxied via backend). */
export type PredictOrderRow = {
	id: string;
	marketId: number;
	currency: string;
	amount: string;
	amountFilled: string;
	isNegRisk: boolean;
	isYieldBearing: boolean;
	strategy: "LIMIT" | "MARKET";
	status: "OPEN" | "FILLED" | "EXPIRED" | "CANCELLED" | "INVALIDATED";
	rewardEarningRate: number;
	order: {
		hash?: string;
		salt: string;
		maker: string;
		signer: string;
		taker: string;
		tokenId: string;
		makerAmount: string;
		takerAmount: string;
		expiration: string | number;
		nonce: string;
		feeRateBps: string;
		side: 0 | 1; // 0 = BUY, 1 = SELL
		signatureType: number;
		signature: string;
	};
};

export type PredictOrdersResponse = {
	success: boolean;
	cursor: string | null;
	data: PredictOrderRow[];
};

export type TokenCostEntry = {
	totalCost: number;
	totalShares: number;
	avgPrice: number;
};

/** Canonical token id string for Map keys (matches positions `onChainId` ↔ orders `tokenId`). */
export function normalizePredictTokenId(
	tokenId: string | number | bigint | undefined | null
): string {
	if (tokenId === undefined || tokenId === null) return "";
	const s = String(tokenId).trim();
	if (!s) return "";
	try {
		return BigInt(s).toString();
	} catch {
		return s.toLowerCase();
	}
}

export function isPredictBuySide(side: unknown): boolean {
	if (side === 0 || side === "0") return true;
	const n = typeof side === "string" ? Number(side) : Number(side);
	if (n === 0) return true;
	if (typeof side === "string" && side.toUpperCase() === "BUY") return true;
	return false;
}

/**
 * Cost lookup using the same key normalization as {@link computePredictCostByToken}.
 */
export function getPredictCostForToken(
	map: Map<string, TokenCostEntry>,
	tokenId: string | undefined | null
): TokenCostEntry | undefined {
	const k = normalizePredictTokenId(tokenId ?? "");
	if (!k) return undefined;
	return map.get(k);
}

/**
 * From a list of FILLED BUY orders, compute per-tokenId cost basis.
 * BUY: side=0, makerAmount=USDT spent (wei), takerAmount=shares received (wei).
 */
export function computePredictCostByToken(
	filledOrders: PredictOrderRow[]
): Map<string, TokenCostEntry> {
	const map = new Map<string, TokenCostEntry>();

	for (const row of filledOrders) {
		if (!row?.order) continue;
		if (!isPredictBuySide(row.order.side)) continue;
		const tokenId = normalizePredictTokenId(row.order.tokenId);
		if (!tokenId) continue;
		const cost = Number(row.order.makerAmount) / 1e18;
		const shares = Number(row.order.takerAmount) / 1e18;
		if (!Number.isFinite(cost) || !Number.isFinite(shares) || shares <= 0) continue;

		const existing = map.get(tokenId);
		if (existing) {
			existing.totalCost += cost;
			existing.totalShares += shares;
			existing.avgPrice = existing.totalCost / existing.totalShares;
		} else {
			map.set(tokenId, { totalCost: cost, totalShares: shares, avgPrice: cost / shares });
		}
	}

	return map;
}

/**
 * Normalize Predict.fun orders into venue-agnostic VenueOrder[].
 * `marketTitleLookup` maps Predict numeric marketId -> title string.
 * `outcomeLookup` maps tokenId -> outcome name (e.g. "Team A", "Yes").
 */
export function mapPredictOrdersToVenueOrders(
	rows: PredictOrderRow[],
	marketTitleLookup: Map<number, string>,
	outcomeLookup: Map<string, string>
): VenueOrder[] {
	return rows.map((row) => {
		const isBuy = isPredictBuySide(row.order.side);
		const makerAmt = Number(row.order.makerAmount) / 1e18;
		const takerAmt = Number(row.order.takerAmount) / 1e18;
		const price = isBuy
			? takerAmt > 0 ? makerAmt / takerAmt : 0
			: makerAmt > 0 ? takerAmt / makerAmt : 0;
		const size = isBuy ? takerAmt : makerAmt;

		const tid = normalizePredictTokenId(row.order.tokenId);
		const outcomeName = outcomeLookup.get(tid) ?? outcomeLookup.get(row.order.tokenId) ?? "Yes";
		const position: "Yes" | "No" =
			outcomeName.toLowerCase() === "no" ? "No" : "Yes";

		return {
			venue: "predictfun" as const,
			orderId: row.id,
			marketTitle: marketTitleLookup.get(row.marketId) ?? `Market #${row.marketId}`,
			side: isBuy ? "buy" : "sell",
			position,
			price,
			size,
			filled: row.status === "FILLED",
			tokenId: normalizePredictTokenId(row.order.tokenId) || row.order.tokenId,
			marketId: String(row.marketId),
			rawOrder: row.order,
		};
	});
}
