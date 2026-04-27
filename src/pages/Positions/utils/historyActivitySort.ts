import type { VenuePosition } from "@/types/trading/venuePosition";

export type UnifiedHistoryBlockLike = {
	luMarkets: Array<{ market: { _id?: string; questionId?: string; marketId?: string } }>;
	venuePositions: VenuePosition[];
};

function venuePositionTimeMs(pos: VenuePosition): number {
	const s = pos.historyTradeAt?.trim();
	if (!s) return 0;
	const t = Date.parse(s);
	return Number.isFinite(t) ? t : 0;
}

function marketQuestionId(market: {
	_id?: string;
	questionId?: string;
	marketId?: string;
}): string | null {
	const id = market._id || market.questionId || market.marketId;
	return id ? String(id) : null;
}

/**
 * Latest activity timestamp (ms) for a History umbrella block: max of venue
 * history rows and LevelUp fills for markets in the block.
 */
export function blockLatestActivityMs(
	block: UnifiedHistoryBlockLike,
	orders: { questionId?: string; filled?: boolean; filledAt?: string | null; createdAt?: string }[],
): number {
	let max = 0;
	for (const pos of block.venuePositions) {
		max = Math.max(max, venuePositionTimeMs(pos));
	}
	for (const { market } of block.luMarkets) {
		const qid = marketQuestionId(market);
		if (!qid) continue;
		for (const o of orders) {
			if (!o.filled || o.questionId !== qid) continue;
			const raw = o.filledAt || o.createdAt;
			if (!raw) continue;
			const t = new Date(raw).getTime();
			if (Number.isFinite(t)) max = Math.max(max, t);
		}
	}
	return max;
}

/** Newest activity first (descending by {@link blockLatestActivityMs}). */
export function sortUnifiedHistoryBlocksByLatest<
	T extends UnifiedHistoryBlockLike,
>(blocks: T[], orders: Parameters<typeof blockLatestActivityMs>[1]): T[] {
	return [...blocks].sort(
		(a, b) => blockLatestActivityMs(b, orders) - blockLatestActivityMs(a, orders),
	);
}
