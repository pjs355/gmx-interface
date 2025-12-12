import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { predictionMarketDataService } from "@/services/api/predictionMarketDataService";
import type { ChartDataPoint, TimeRange } from "./types";

type UsePredictionChartDataArgs = {
	questionId: string;
	activeMarket?: any;
	secondMarket?: any;
	questionOrderbooks?: { [questionId: string]: any };
	timeRange: TimeRange;
	isVsSingleMarket?: boolean;
};

/**
 * Get the interval configuration for each time range
 * Returns: { intervalSeconds, maxPoints }
 */
function getIntervalConfig(timeRange: TimeRange): { intervalSeconds: number; maxPoints: number } {
	switch (timeRange) {
		case "1h":
			return { intervalSeconds: 60, maxPoints: 60 };        // Every minute, 60 points
		case "1d":
			return { intervalSeconds: 900, maxPoints: 96 };       // Every 15 minutes, 96 points
		case "1w":
			return { intervalSeconds: 7200, maxPoints: 84 };      // Every 2 hours, 84 points
		case "all":
			return { intervalSeconds: 86400, maxPoints: 365 };    // Daily, max 1 year
		default:
			return { intervalSeconds: 900, maxPoints: 96 };
	}
}

/**
 * Generate evenly-spaced timestamps for the given time range
 */
function generateEvenTimestamps(
	startTime: number,
	endTime: number,
	intervalSeconds: number,
	maxPoints: number
): number[] {
	const timestamps: number[] = [];
	
	// Start from the end and work backwards to ensure we always include "now"
	let current = endTime;
	while (current >= startTime && timestamps.length < maxPoints) {
		timestamps.unshift(current);
		current -= intervalSeconds;
	}
	
	return timestamps;
}

/**
 * Forward-fill: Find the most recent price at or before the given timestamp
 */
function findPriceAtOrBefore(
	sortedPrices: Array<{ ts: number; price: number }>,
	targetTimestamp: number
): number | null {
	let result: number | null = null;
	
	for (const point of sortedPrices) {
		if (point.ts <= targetTimestamp) {
			result = point.price;
		} else {
			break; // Since sorted, no need to continue
		}
	}
	
	return result;
}

export function usePredictionChartData({
	questionId,
	activeMarket,
	secondMarket,
	questionOrderbooks,
	timeRange,
	isVsSingleMarket,
}: UsePredictionChartDataArgs) {
	const [data, setData] = useState<ChartDataPoint[]>([]);
	// Use -1 as sentinel for "not initialized" vs 0 for "all time"
	const [timeWindowStart, setTimeWindowStart] = useState<number>(-1);
	const [timeWindowEnd, setTimeWindowEnd] = useState<number>(-1);

	// Live orderbook logic disabled: focus on historical only

	useEffect(() => {
		const now = Math.floor(Date.now() / 1000);
		
		if (timeRange === "all") {
			// For "all", find the earliest data point
			const rawHistorical = activeMarket?.historicalPricesYes || [];
			let earliestTimestamp = now - 30 * 86400; // Default to 30 days ago
			
			for (const point of rawHistorical) {
				const ts = point.ts ? Math.floor(point.ts / 1000) : point.timestamp;
				if (ts && ts < earliestTimestamp) {
					earliestTimestamp = ts;
				}
			}
			
			setTimeWindowEnd(now);
			setTimeWindowStart(earliestTimestamp);
		} else {
			const seconds =
				timeRange === "1h"
					? 3600
					: timeRange === "1d"
					? 86400
					: timeRange === "1w"
					? 604800
					: 86400; // default to 1d
			setTimeWindowEnd(now);
			setTimeWindowStart(now - seconds);
		}
	}, [timeRange, activeMarket?.historicalPricesYes]);

	// Memoize ONLY the historical data processing (no orderbooks)
	const historicalData = useMemo(() => {
		// Use -1 as sentinel for "not initialized"
		if (!questionId || timeWindowStart === -1 || timeWindowEnd === -1) {
			return [];
		}

		try {
			// Get historical data - prefer from activeMarket.historicalPricesYes, fallback to service
			const primaryHistorical =
				activeMarket?.historicalPricesYes ||
				predictionMarketDataService.getHistoricalPrices(questionId) ||
				[];
			const secondId = secondMarket?._id || secondMarket?.questionId;
			const secondHistorical =
				secondId && !isVsSingleMarket
					? secondMarket?.historicalPricesYes ||
					  predictionMarketDataService.getHistoricalPrices(
							secondId
					  ) ||
					  []
					: [];

			// Normalize and sort historical data (convert ms to seconds)
			const normalizePrices = (prices: any[]): Array<{ ts: number; price: number }> => {
				return prices
					.map((p) => ({
						ts: p.ts ? Math.floor(p.ts / 1000) : p.timestamp,
						price: p.price,
					}))
					.filter((p) => p.ts && typeof p.price === "number")
					.sort((a, b) => a.ts - b.ts);
			};

			const primarySorted = normalizePrices(primaryHistorical);
			let secondSorted = normalizePrices(secondHistorical);

			// Derive NO side for VS single market (invert YES prices)
			if (isVsSingleMarket && primarySorted.length > 0) {
				secondSorted = primarySorted.map((p) => ({
					ts: p.ts,
					price: 1 - p.price,
				}));
			}

			// Get interval configuration for this time range
			const { intervalSeconds, maxPoints } = getIntervalConfig(timeRange);

			// Generate evenly-spaced timestamps
			const evenTimestamps = generateEvenTimestamps(
				timeWindowStart,
				timeWindowEnd,
				intervalSeconds,
				maxPoints
			);

			// If no data exists, return empty
			if (primarySorted.length === 0 && secondSorted.length === 0) {
				return [];
			}

			// Build chart data with forward-filled prices
			const out: ChartDataPoint[] = [];

			for (const ts of evenTimestamps) {
				const date = new Date(ts * 1000);
				
				// Forward-fill: find most recent price at or before this timestamp
				const primaryPrice = findPriceAtOrBefore(primarySorted, ts);
				const secondPrice = findPriceAtOrBefore(secondSorted, ts);

				// Only include points where we have at least one price
				// (forward-fill ensures continuity once data starts)
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
			console.error("📊 Chart data calculation error:", e);
			return [];
		}
	}, [
		questionId,
		timeRange,
		timeWindowStart,
		timeWindowEnd,
		activeMarket?.historicalPricesYes,
		secondMarket,
		isVsSingleMarket,
	]);

	// Update data when historical data changes - instant loading
	useEffect(() => {
		setData(historicalData);
	}, [historicalData]);

	// Separate effect to update ONLY the live price point when orderbooks change
	// This prevents recalculating the entire historical dataset
	const orderbooksRef = useRef(questionOrderbooks);
	orderbooksRef.current = questionOrderbooks;

	useEffect(() => {
		if (!orderbooksRef.current) return;

		// Get current live best ask prices
		const getCurrentLivePrice = (qId: string): number | null => {
			try {
				const orderbook = orderbooksRef.current?.[qId];
				if (
					!orderbook?.asks ||
					!Array.isArray(orderbook.asks) ||
					orderbook.asks.length === 0
				) {
					return null;
				}

				const bestAsk = orderbook.asks.reduce(
					(best: any, current: any) => {
						const currentPrice = parseFloat(
							current.price || current[0] || "0"
						);
						const bestPrice = parseFloat(
							best.price || best[0] || "0"
						);
						return currentPrice < bestPrice ? current : best;
					}
				);

				const price = parseFloat(bestAsk.price || bestAsk[0] || "0");
				return isNaN(price) || price <= 0 ? null : price;
			} catch {
				return null;
			}
		};

		const currentLivePrice = getCurrentLivePrice(questionId);
		const secondId = secondMarket?._id || secondMarket?.questionId;
		let currentSecondLivePrice = secondId
			? getCurrentLivePrice(secondId)
			: null;

		// For VS single market, derive NO price from YES price
		if (isVsSingleMarket && currentLivePrice !== null) {
			currentSecondLivePrice = 1 - currentLivePrice;
		}

		// Only update if we have live prices
		if (currentLivePrice === null && currentSecondLivePrice === null) {
			return;
		}

		// Update the last data point with live prices
		setData((prevData) => {
			if (prevData.length === 0) return prevData;

			const lastPoint = prevData[prevData.length - 1];

			const updatedLastPoint = {
				...lastPoint,
				price: currentLivePrice ?? lastPoint.price,
				percentage:
					currentLivePrice !== null
						? currentLivePrice * 100
						: lastPoint.percentage,
				secondPrice: currentSecondLivePrice ?? lastPoint.secondPrice,
				secondPercentage:
					currentSecondLivePrice !== null
						? currentSecondLivePrice * 100
						: lastPoint.secondPercentage,
				isLive: currentLivePrice !== null,
				secondIsLive: currentSecondLivePrice !== null,
			};

			return [...prevData.slice(0, -1), updatedLastPoint];
		});
	}, [questionOrderbooks, questionId, secondMarket, isVsSingleMarket]);

	// Consolidated cache monitoring - check once when questionId changes and periodically
	useEffect(() => {
		if (!questionId) return;

		const checkCacheAndRefresh = () => {
			const cachedData =
				predictionMarketDataService.getCachedMarketData(questionId);
			if (!cachedData) {
				// Cache expired, trigger refresh (silent background update)
				predictionMarketDataService
					.refreshHistoricalData(questionId)
					.catch(console.warn);
			}
		};

		// Check immediately when questionId changes
		checkCacheAndRefresh();

		// Set up periodic cache monitoring (every 5 minutes to reduce update frequency)
		const interval = setInterval(checkCacheAndRefresh, 5 * 60 * 1000);

		return () => clearInterval(interval);
	}, [questionId]);

	return {
		data,
		timeWindowStart,
		timeWindowEnd,
		setTimeWindowEnd,
	} as const;
}

function formatDisplayTime(date: Date, range: TimeRange): string {
	switch (range) {
		case "1h":
			return date.toLocaleTimeString("en-US", {
				hour: "numeric",
				minute: "2-digit",
				hour12: true,
			});
		case "1d":
			return date.toLocaleTimeString("en-US", {
				hour: "numeric",
				minute: "2-digit",
				hour12: true,
			});
		case "1w":
			return date.toLocaleDateString("en-US", {
				weekday: "short",
				month: "numeric",
				day: "numeric",
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
