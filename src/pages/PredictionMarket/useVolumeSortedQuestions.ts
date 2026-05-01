import { useCallback, useMemo } from "react";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";

/** Same volume-based sort as `PredictionMarketContent` for default market selection. */
export function useVolumeSortedQuestions(
	questions: PredictionMarket[],
	questionOrderbooks: Record<string, any>,
	orderbooksReady: boolean,
): PredictionMarket[] {
	const getTotalVolume = useCallback(
		(questionId: string) => {
			const orderbook = questionOrderbooks[questionId];
			if (!orderbook) return 0;

			let totalVolume = 0;

			if (orderbook.asks && Array.isArray(orderbook.asks)) {
				for (const ask of orderbook.asks) {
					if (typeof ask.size === "number") {
						totalVolume += ask.size;
					}
				}
			}

			if (orderbook.bids && Array.isArray(orderbook.bids)) {
				for (const bid of orderbook.bids) {
					if (typeof bid.size === "number") {
						totalVolume += bid.size;
					}
				}
			}

			return totalVolume;
		},
		[questionOrderbooks],
	);

	return useMemo(() => {
		const sorted = [...questions].sort((a, b) => {
			const questionIdA = a._id || a.questionId || a.marketId;
			const questionIdB = b._id || b.questionId || b.marketId;
			const volumeA = getTotalVolume(String(questionIdA));
			const volumeB = getTotalVolume(String(questionIdB));
			return volumeB - volumeA;
		});
		return sorted;
	}, [questions, orderbooksReady, getTotalVolume]);
}
