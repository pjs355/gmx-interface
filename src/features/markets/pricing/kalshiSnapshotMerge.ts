import type { OrderbookData } from "@/types/odds-monitor";

/** BBO-only WS ticks omit depth; keep ladder when scalars refresh on an existing book. */
export function mergeKalshiBboOnlyUpdate(
	prev: OrderbookData | null | undefined,
	incoming: OrderbookData,
): OrderbookData {
	const incomingHasDepth =
		(incoming.bids?.length ?? 0) > 0 || (incoming.asks?.length ?? 0) > 0;
	if (incomingHasDepth) return incoming;
	const prevHasDepth =
		prev != null &&
		((prev.bids?.length ?? 0) > 0 || (prev.asks?.length ?? 0) > 0);
	if (!prevHasDepth) return incoming;
	return {
		...prev,
		bestBid: incoming.bestBid,
		bestAsk: incoming.bestAsk,
		snapshotStatus: incoming.snapshotStatus ?? prev.snapshotStatus,
		lastUpdated: incoming.lastUpdated,
	};
}

export function applyKalshiVenueSnapshotMerge(
	prevA: OrderbookData | null | undefined,
	prevB: OrderbookData | null | undefined,
	incomingA: OrderbookData,
	incomingB: OrderbookData,
): { assignA: OrderbookData; assignB: OrderbookData } {
	return {
		assignA: mergeKalshiBboOnlyUpdate(prevA, incomingA),
		assignB: mergeKalshiBboOnlyUpdate(prevB, incomingB),
	};
}
