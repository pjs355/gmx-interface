import type { VenueHistoryFill, VenueOrder } from "@/types/trading/venuePosition";

/** Raw row returned from GET /v1/orders (proxied via backend). */
export type PredictOrderRow = {
	id: string;
	/** Injected by LevelUp private API from Mongo `exchangeMatching.predictFun`. */
	levelUpUmbrellaId?: string;
	levelUpUmbrellaDisplayName?: string;
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
	/** Latest FILLED BUY leg time from the orders payload when the API exposes a timestamp */
	lastTradeAtMs: number | null;
};

/** Best-effort: Predict order rows may include timestamps under varying keys. */
function predictOrderRowTimeMs(row: PredictOrderRow): number | null {
	const r = row as Record<string, unknown>;
	const keys = [
		"createdAt",
		"updatedAt",
		"filledAt",
		"timestamp",
		"created_at",
		"filled_at",
	] as const;
	for (const k of keys) {
		const v = r[k];
		if (v === null || v === undefined || v === "") continue;
		if (typeof v === "number" && Number.isFinite(v)) {
			return v > 1e12 ? Math.floor(v) : Math.floor(v * 1000);
		}
		if (typeof v === "string") {
			const n = Number(v);
			if (Number.isFinite(n)) {
				return n > 1e12 ? Math.floor(n) : Math.floor(n * 1000);
			}
			const d = Date.parse(v);
			if (Number.isFinite(d)) return d;
		}
	}
	return null;
}

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

		const fillMs = predictOrderRowTimeMs(row);
		const existing = map.get(tokenId);
		if (existing) {
			existing.totalCost += cost;
			existing.totalShares += shares;
			existing.avgPrice = existing.totalCost / existing.totalShares;
			if (fillMs != null) {
				if (
					existing.lastTradeAtMs == null ||
					fillMs > existing.lastTradeAtMs
				) {
					existing.lastTradeAtMs = fillMs;
				}
			}
		} else {
			map.set(tokenId, {
				totalCost: cost,
				totalShares: shares,
				avgPrice: cost / shares,
				lastTradeAtMs: fillMs,
			});
		}
	}

	return map;
}

/**
 * Combine REST order costs with match-event costs. Orders win on duplicate tokens (same fills should not double-count).
 */
export function mergePredictCostMaps(
	fromOrders: Map<string, TokenCostEntry>,
	fromMatches: Map<string, TokenCostEntry>,
): Map<string, TokenCostEntry> {
	const out = new Map<string, TokenCostEntry>();
	for (const [k, v] of fromOrders) {
		out.set(k, {
			totalCost: v.totalCost,
			totalShares: v.totalShares,
			avgPrice: v.avgPrice,
			lastTradeAtMs: v.lastTradeAtMs ?? null,
		});
	}
	for (const [tid, entry] of fromMatches) {
		if (!out.has(tid)) {
			out.set(tid, {
				totalCost: entry.totalCost,
				totalShares: entry.totalShares,
				avgPrice: entry.avgPrice,
				lastTradeAtMs: entry.lastTradeAtMs ?? null,
			});
		}
	}
	return out;
}

function pushPredictFill(
	byMint: Map<string, VenueHistoryFill[]>,
	tokenId: string,
	fill: VenueHistoryFill,
): void {
	const arr = byMint.get(tokenId) ?? [];
	arr.push(fill);
	byMint.set(tokenId, arr);
}

function predictProbPriceFromLeg(usdc: number, shares: number): number | null {
	if (shares > 0 && usdc > 0) {
		const p = usdc / shares;
		if (p > 0 && p <= 1) return p;
		if (p > 1 && p <= 100) return p / 100;
	}
	return null;
}

/**
 * Per-outcome fills from FILLED Predict orders (buys and sells) for History expansion.
 */
export function buildPredictHistoryFillsFromFilledOrders(
	rows: PredictOrderRow[],
): Map<string, VenueHistoryFill[]> {
	const byMint = new Map<string, VenueHistoryFill[]>();
	for (const row of rows) {
		if (row.status !== "FILLED" || !row?.order) continue;
		const tokenId = normalizePredictTokenId(row.order.tokenId);
		if (!tokenId) continue;
		const makerAmt = Number(row.order.makerAmount) / 1e18;
		const takerAmt = Number(row.order.takerAmount) / 1e18;
		if (!Number.isFinite(makerAmt) || !Number.isFinite(takerAmt)) continue;
		const isBuy = isPredictBuySide(row.order.side);
		const fillMs = predictOrderRowTimeMs(row);
		const tradedAt = fillMs != null ? new Date(fillMs).toISOString() : "";
		const hash = row.order.hash?.trim();
		const src = hash || row.id;
		if (isBuy) {
			const shares = takerAmt;
			const usdc = makerAmt;
			if (!(shares > 0 || usdc > 0)) continue;
			pushPredictFill(byMint, tokenId, {
				side: "buy",
				shares: Math.max(shares, 0),
				usdc: Math.max(usdc, 0),
				tradedAt,
				sourceId: `${src}:buy`,
				price: predictProbPriceFromLeg(usdc, shares),
			});
		} else {
			const shares = makerAmt;
			const usdc = takerAmt;
			if (!(shares > 0 || usdc > 0)) continue;
			pushPredictFill(byMint, tokenId, {
				side: "sell",
				shares: Math.max(shares, 0),
				usdc: Math.max(usdc, 0),
				tradedAt,
				sourceId: `${src}:sell`,
				price: predictProbPriceFromLeg(usdc, shares),
			});
		}
	}
	for (const fills of byMint.values()) {
		fills.sort(
			(a, b) =>
				Date.parse(a.tradedAt || "0") - Date.parse(b.tradedAt || "0"),
		);
	}
	return byMint;
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
