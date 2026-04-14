import { useEffect, useRef, useState, useMemo } from "react";
import { predictionMarketDataService } from "@/services/api/predictionMarketDataService";
import { isPredictionPricingDebugEnabled, priceDebugLog } from "@/utils/debugPredictionPricing";
import type { ChartDataPoint, TimeRange } from "./types";

type UsePredictionChartDataArgs = {
	questionId: string;
	activeMarket?: any;
	secondMarket?: any;
	questionOrderbooks?: { [questionId: string]: any };
	timeRange: TimeRange;
	isVsSingleMarket?: boolean;
};

function getIntervalConfig(timeRange: TimeRange): { intervalSeconds: number; maxPoints: number } {
	switch (timeRange) {
		case "1h":
			return { intervalSeconds: 60, maxPoints: 60 };
		case "1d":
			return { intervalSeconds: 900, maxPoints: 96 };
		case "all":
			return { intervalSeconds: 86400, maxPoints: 365 };
		default:
			return { intervalSeconds: 900, maxPoints: 96 };
	}
}

function generateEvenTimestamps(
	startTime: number,
	endTime: number,
	intervalSeconds: number,
	maxPoints: number,
): number[] {
	const timestamps: number[] = [];
	let current = endTime;
	while (current >= startTime && timestamps.length < maxPoints) {
		timestamps.unshift(current);
		current -= intervalSeconds;
	}
	return timestamps;
}

function findPriceAtOrBefore(
	sortedPrices: Array<{ ts: number; price: number }>,
	targetTimestamp: number,
): number | null {
	let result: number | null = null;
	for (const point of sortedPrices) {
		if (point.ts <= targetTimestamp) {
			result = point.price;
		} else {
			break;
		}
	}
	return result;
}

function normalizePrices(prices: any[]): Array<{ ts: number; price: number }> {
	return prices
		.map((p: any) => ({
			ts: p.ts ? Math.floor(p.ts / 1000) : p.timestamp,
			price: p.price,
		}))
		.filter((p: { ts: number; price: number }) => p.ts && typeof p.price === "number")
		.sort((a: { ts: number }, b: { ts: number }) => a.ts - b.ts);
}

function getLivePrice(qId: string, orderbooks: { [questionId: string]: any } | undefined): number | null {
	try {
		const orderbook = orderbooks?.[qId];
		if (!orderbook?.asks || !Array.isArray(orderbook.asks) || orderbook.asks.length === 0) {
			return null;
		}
		const bestAsk = orderbook.asks.reduce((best: any, current: any) => {
			const currentPrice = parseFloat(current.price || current[0] || "0");
			const bestPrice = parseFloat(best.price || best[0] || "0");
			return currentPrice < bestPrice ? current : best;
		});
		const price = parseFloat(bestAsk.price || bestAsk[0] || "0");
		return isNaN(price) || price <= 0 ? null : price;
	} catch {
		return null;
	}
}

function formatDisplayTime(date: Date, range: TimeRange): string {
	switch (range) {
		case "1h":
		case "1d":
			return date.toLocaleTimeString("en-US", {
				hour: "numeric",
				minute: "2-digit",
				hour12: true,
			});
		case "all":
			return date.toLocaleDateString("en-US", {
				month: "short",
				day: "numeric",
			});
		default:
			return date.toLocaleTimeString("en-US", {
				hour: "numeric",
				minute: "2-digit",
				hour12: true,
			});
	}
}

export function usePredictionChartData({
	questionId,
	activeMarket,
	secondMarket,
	questionOrderbooks,
	timeRange,
	isVsSingleMarket,
}: UsePredictionChartDataArgs) {
	const [cacheVersion, setCacheVersion] = useState(0);
	const lastCacheCountRef = useRef<number>(0);
	const lastSecondCacheCountRef = useRef<number>(0);

	const secondId = secondMarket?._id || secondMarket?.questionId;

	// Single memo: compute time window + historical data inline (no intermediate state)
	const historicalData = useMemo((): ChartDataPoint[] => {
		if (!questionId) return [];

		try {
			const now = Math.floor(Date.now() / 1000);
			let windowStart: number;
			const windowEnd = now;

			if (timeRange === "all") {
				const rawHistorical =
					(activeMarket?.historicalPricesYes?.length ? activeMarket.historicalPricesYes : null) ??
					(activeMarket?.historicalPrices?.length ? activeMarket.historicalPrices : null) ??
					[];
				windowStart = now - 30 * 86400;
				for (const point of rawHistorical) {
					const ts = point.ts ? Math.floor(point.ts / 1000) : point.timestamp;
					if (ts && ts < windowStart) windowStart = ts;
				}
			} else {
				windowStart = now - (timeRange === "1h" ? 3600 : 86400);
			}

			const marketHistorical =
				(activeMarket?.historicalPricesYes?.length ? activeMarket.historicalPricesYes : null) ??
				(activeMarket?.historicalPrices?.length ? activeMarket.historicalPrices : null) ??
				[];
			const cachedHistorical = predictionMarketDataService.getHistoricalPrices(questionId) || [];
			const primaryHistorical =
				cachedHistorical.length >= marketHistorical.length ? cachedHistorical : marketHistorical;

			const marketNoHistorical =
				(activeMarket?.historicalPricesNo?.length ? activeMarket.historicalPricesNo : null) ?? [];
			const cachedMarketForPrimary = predictionMarketDataService.getCachedMarketData(questionId);
			const cachedNoHistorical =
				(cachedMarketForPrimary?.historicalPricesNo?.length
					? cachedMarketForPrimary.historicalPricesNo
					: null) ?? [];

			const secondMarketHistorical =
				(secondMarket?.historicalPricesYes?.length ? secondMarket.historicalPricesYes : null) ??
				(secondMarket?.historicalPrices?.length ? secondMarket.historicalPrices : null) ??
				[];
			const secondCachedHistorical =
				secondId && !isVsSingleMarket
					? predictionMarketDataService.getHistoricalPrices(secondId) || []
					: [];
			const secondHistorical = isVsSingleMarket
				? cachedNoHistorical.length >= marketNoHistorical.length
					? cachedNoHistorical
					: marketNoHistorical
				: secondId
					? secondCachedHistorical.length >= secondMarketHistorical.length
						? secondCachedHistorical
						: secondMarketHistorical
					: [];

			const primarySorted = normalizePrices(primaryHistorical);
			const secondSorted = normalizePrices(secondHistorical);

			const { intervalSeconds, maxPoints } = getIntervalConfig(timeRange);
			const evenTimestamps = generateEvenTimestamps(windowStart, windowEnd, intervalSeconds, maxPoints);

			if (primarySorted.length === 0 && secondSorted.length === 0) return [];

			const out: ChartDataPoint[] = [];
			for (const ts of evenTimestamps) {
				const date = new Date(ts * 1000);
				const primaryPrice = findPriceAtOrBefore(primarySorted, ts);
				const secondPrice = findPriceAtOrBefore(secondSorted, ts);

				if (primaryPrice !== null || secondPrice !== null) {
					out.push({
						timestamp: ts,
						price: primaryPrice,
						secondPrice: secondPrice,
						date: date.toISOString(),
						displayTime: formatDisplayTime(date, timeRange),
						percentage: primaryPrice !== null ? primaryPrice * 100 : null,
						secondPercentage: secondPrice !== null ? secondPrice * 100 : null,
						isLive: false,
						secondIsLive: false,
					});
				}
			}

			return out;
		} catch (e) {
			console.error("Chart data calculation error:", e);
			return [];
		}
	}, [
		questionId,
		timeRange,
		activeMarket?.historicalPricesYes,
		activeMarket?.historicalPrices,
		activeMarket?.historicalPricesNo,
		secondMarket,
		isVsSingleMarket,
		cacheVersion,
	]);

	// Derive live-adjusted data from historicalData + orderbooks (no state needed)
	const data = useMemo((): ChartDataPoint[] => {
		if (historicalData.length === 0 || !questionOrderbooks) return historicalData;

		const livePrice = getLivePrice(questionId, questionOrderbooks);
		const liveSecondPrice = secondId ? getLivePrice(secondId, questionOrderbooks) : null;

		if (livePrice === null && liveSecondPrice === null) return historicalData;

		const lastPoint = historicalData[historicalData.length - 1];
		const updatedLast: ChartDataPoint = {
			...lastPoint,
			price: livePrice ?? lastPoint.price,
			percentage: livePrice !== null ? livePrice * 100 : lastPoint.percentage,
			secondPrice: liveSecondPrice ?? lastPoint.secondPrice,
			secondPercentage: liveSecondPrice !== null ? liveSecondPrice * 100 : lastPoint.secondPercentage,
			isLive: livePrice !== null,
			secondIsLive: liveSecondPrice !== null,
		};

		return [...historicalData.slice(0, -1), updatedLast];
	}, [historicalData, questionOrderbooks, questionId, secondId, secondMarket]);

	useEffect(() => {
		if (!isPredictionPricingDebugEnabled()) return;
		const livePrice = questionOrderbooks
			? getLivePrice(questionId, questionOrderbooks)
			: null;
		const liveSecond =
			secondId && questionOrderbooks
				? getLivePrice(secondId, questionOrderbooks)
				: null;
		const last = data[data.length - 1];
		priceDebugLog("usePredictionChartData LevelUp series + live orderbook tick", {
			questionId,
			secondId: secondId ?? null,
			historicalPoints: historicalData.length,
			outputPoints: data.length,
			liveFromOrderbookPrimary: livePrice,
			liveFromOrderbookSecondary: liveSecond,
			lastPointLiveFlags: last
				? { isLive: last.isLive, secondIsLive: last.secondIsLive }
				: null,
			dataSource:
				"History: market payload + predictionMarketCache (GET getPredictionApiBaseUrl()/questions/:id); live: min ask from questionOrderbooks on trading page",
		});
	}, [
		data,
		historicalData.length,
		questionId,
		secondId,
		questionOrderbooks,
	]);

	// Cache refresh interval: only bumps cacheVersion when data count actually grows
	useEffect(() => {
		if (!questionId) return;

		const checkCacheAndRefresh = async () => {
			const cachedData = predictionMarketDataService.getCachedMarketData(questionId);
			const cachedHistorical = predictionMarketDataService.getHistoricalPrices(questionId) || [];
			const currentCacheCount = cachedHistorical.length;

			if (currentCacheCount > lastCacheCountRef.current) {
				lastCacheCountRef.current = currentCacheCount;
				setCacheVersion((v) => v + 1);
			}

			if (!cachedData) {
				try {
					await predictionMarketDataService.refreshHistoricalData(questionId);
					const newCachedHistorical = predictionMarketDataService.getHistoricalPrices(questionId) || [];
					if (newCachedHistorical.length > lastCacheCountRef.current) {
						lastCacheCountRef.current = newCachedHistorical.length;
						setCacheVersion((v) => v + 1);
					}
				} catch {
					// Cache refresh failed silently
				}
			}
		};

		lastCacheCountRef.current = 0;
		checkCacheAndRefresh();
		const interval = setInterval(checkCacheAndRefresh, 10_000);
		return () => clearInterval(interval);
	}, [questionId]);

	useEffect(() => {
		if (!secondId || isVsSingleMarket) return;

		const checkSecondCacheAndRefresh = async () => {
			const cachedHistorical = predictionMarketDataService.getHistoricalPrices(secondId) || [];
			const currentCacheCount = cachedHistorical.length;

			if (currentCacheCount > lastSecondCacheCountRef.current) {
				lastSecondCacheCountRef.current = currentCacheCount;
				setCacheVersion((v) => v + 1);
			}

			const cachedData = predictionMarketDataService.getCachedMarketData(secondId);
			if (!cachedData) {
				try {
					await predictionMarketDataService.refreshHistoricalData(secondId);
					const newCachedHistorical =
						predictionMarketDataService.getHistoricalPrices(secondId) || [];
					if (newCachedHistorical.length > lastSecondCacheCountRef.current) {
						lastSecondCacheCountRef.current = newCachedHistorical.length;
						setCacheVersion((v) => v + 1);
					}
				} catch {
					// Cache refresh failed silently
				}
			}
		};

		lastSecondCacheCountRef.current = 0;
		checkSecondCacheAndRefresh();
		const interval = setInterval(checkSecondCacheAndRefresh, 10_000);
		return () => clearInterval(interval);
	}, [secondId, isVsSingleMarket]);

	return { data } as const;
}
