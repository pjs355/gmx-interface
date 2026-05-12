/**
 * Shared resting-depth normalization for {@link OrderbookDisplay}:
 * merge Polymarket-style `orders[]`, drop dust / non-whole rows, and drive BBO from the same lists as the ladder.
 */

export type ConsolidatedRestingLevel = {
	price: number;
	size: number;
	id: string;
};

const DEFAULT_FRACTIONAL_MIN_SIZE = 1e-6;
const WHOLE_CONTRACT_MIN = 1 - 1e-9;

export function safeOrderbookNumber(value: unknown): number {
	if (typeof value === "number" && !Number.isNaN(value) && Number.isFinite(value)) {
		return value;
	}
	if (typeof value === "string") {
		const parsed = parseFloat(value);
		if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
			return parsed;
		}
	}
	return 0;
}

function restingSizeFromNestedOrder(order: Record<string, unknown>): number {
	const s = order.size;
	const a = order.amount;
	let raw: unknown;
	if (s !== undefined && s !== null) raw = s;
	else if (a !== undefined && a !== null) raw = a;
	else raw = 1;
	return safeOrderbookNumber(raw);
}

function restingSizeFromDirectLevel(level: Record<string, unknown>): number {
	const s = level.size;
	const a = level.amount;
	let raw: unknown;
	if (s !== undefined && s !== null) raw = s;
	else if (a !== undefined && a !== null) raw = a;
	else raw = 1;
	return safeOrderbookNumber(raw);
}

/**
 * Merge nested CLOB `orders[]` and consolidate duplicate prices.
 */
export function flattenAndConsolidateRestingLevels(
	priceLevels: unknown[] | null | undefined,
): ConsolidatedRestingLevel[] {
	const priceMap = new Map<number, { size: number; id: string }>();

	priceLevels?.forEach((level, levelIndex) => {
		if (!level || typeof level !== "object" || Array.isArray(level)) return;
		const rec = level as Record<string, unknown>;
		if (rec.price === undefined) return;
		const price = safeOrderbookNumber(rec.price);
		if (!(price > 0)) return;

		if (Array.isArray(rec.orders) && rec.orders.length > 0) {
			(rec.orders as unknown[]).forEach((order, orderIndex) => {
				if (!order || typeof order !== "object" || Array.isArray(order)) return;
				const size = restingSizeFromNestedOrder(order as Record<string, unknown>);
				if (size > 0) {
					const o = order as Record<string, unknown>;
					const id =
						(typeof o.id === "string" && o.id) ||
						(typeof o.salt === "string" && o.salt) ||
						`level-${levelIndex}-order-${orderIndex}`;
					if (priceMap.has(price)) {
						priceMap.get(price)!.size += size;
					} else {
						priceMap.set(price, { size, id });
					}
				}
			});
			return;
		}

		const size = restingSizeFromDirectLevel(rec);
		if (size > 0) {
			const id =
				(typeof rec.id === "string" && rec.id) ||
				(typeof rec.salt === "string" && rec.salt) ||
				`level-${levelIndex}`;
			if (priceMap.has(price)) {
				priceMap.get(price)!.size += size;
			} else {
				priceMap.set(price, { size, id });
			}
		}
	});

	const consolidated: ConsolidatedRestingLevel[] = [];
	priceMap.forEach((value, p) => {
		consolidated.push({ price: p, size: value.size, id: value.id });
	});
	return consolidated;
}

export function filterRestingLevelsByMinSize(
	levels: ConsolidatedRestingLevel[],
	minSize: number,
): ConsolidatedRestingLevel[] {
	if (!Number.isFinite(minSize) || minSize <= 0) return levels;
	return levels.filter((l) => l.size >= minSize);
}

/**
 * Minimum resting size shown in the ladder and used for BBO.
 * Whole-contract venues (LevelUp on-chain, Kalshi/DFlow) use ≥ ~1 contract.
 * Fractional venues default to 1e-6 to drop float dust while keeping typical Poly sizes.
 */
export function effectiveMinDisplayableRestingSize(
	wholeContractRestingBook: boolean | undefined,
	minDisplayableRestingSize: number | undefined,
): number {
	if (wholeContractRestingBook) {
		const floor = WHOLE_CONTRACT_MIN;
		if (minDisplayableRestingSize === undefined) return floor;
		return Math.max(floor, minDisplayableRestingSize);
	}
	if (minDisplayableRestingSize !== undefined) return minDisplayableRestingSize;
	return DEFAULT_FRACTIONAL_MIN_SIZE;
}

export function bestBidAskFromConsolidatedSides(
	asks: ConsolidatedRestingLevel[],
	bids: ConsolidatedRestingLevel[],
): { bestAsk: number | null; bestBid: number | null } {
	const bestAsk =
		asks.length > 0 ? Math.min(...asks.map((a) => a.price)) : null;
	const bestBid =
		bids.length > 0 ? Math.max(...bids.map((b) => b.price)) : null;
	return { bestAsk, bestBid };
}
