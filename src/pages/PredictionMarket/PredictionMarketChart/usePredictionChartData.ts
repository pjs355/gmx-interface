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
			// For "all", set timeWindowStart to 0 to include all historical data
			setTimeWindowEnd(now);
			setTimeWindowStart(0);
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
	}, [timeRange]);

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

			// Create maps
			const primaryMap = new Map<
				number,
				{ price: number; isLive?: boolean }
			>();
			const secondMap = new Map<
				number,
				{ price: number; isLive?: boolean }
			>();

			// Sort and populate maps
			// Historical data uses 'ts' (in milliseconds), convert to seconds
			const primarySeries = [...primaryHistorical].sort(
				(a, b) => (a.ts || a.timestamp) - (b.ts || b.timestamp)
			);
			const secondSeries = [...secondHistorical].sort(
				(a, b) => (a.ts || a.timestamp) - (b.ts || b.timestamp)
			);

			primarySeries.forEach((p) => {
				const timestampSeconds = p.ts
					? Math.floor(p.ts / 1000) // Convert ms to seconds
					: p.timestamp;
				primaryMap.set(timestampSeconds, { price: p.price });
			});
			secondSeries.forEach((p) => {
				const timestampSeconds = p.ts
					? Math.floor(p.ts / 1000) // Convert ms to seconds
					: p.timestamp;
				secondMap.set(timestampSeconds, { price: p.price });
			});

			// No backfill - use only actual historical prices and live orderbook data

			// Derive NO side for VS single market
			if (isVsSingleMarket) {
				for (const [ts, val] of primaryMap.entries()) {
					const inv =
						1 - (typeof val.price === "number" ? val.price : 0.5);
					secondMap.set(ts, { price: inv });
				}
			}

			// Filter to time window
			let allTimestamps = Array.from(
				new Set([...primaryMap.keys(), ...secondMap.keys()])
			)
				.filter((t) => t >= timeWindowStart && t <= timeWindowEnd)
				.sort((a, b) => a - b);

			// Front-fill logic - use last historical price only (no live prices yet)
			const findLastAtOrBefore = (
				map: Map<number, { price: number }>,
				cutoff: number
			) => {
				let bestTs = -Infinity;
				let bestPrice: number | null = null;
				for (const [ts, val] of map.entries()) {
					if (ts <= cutoff && ts > bestTs) {
						bestTs = ts;
						bestPrice = val.price;
					}
				}
				return bestPrice === null
					? null
					: { ts: bestTs, price: bestPrice };
			};

			if (allTimestamps.length === 0) {
				// Use last historical price only
				const primaryPrice = findLastAtOrBefore(
					primaryMap,
					timeWindowEnd
				)?.price;
				const secondPrice = findLastAtOrBefore(
					secondMap,
					timeWindowEnd
				)?.price;

				if (primaryPrice || secondPrice) {
					allTimestamps = [timeWindowStart, timeWindowEnd];
					if (primaryPrice) {
						primaryMap.set(timeWindowStart, {
							price: primaryPrice,
						});
						primaryMap.set(timeWindowEnd, { price: primaryPrice });
					}
					if (secondPrice) {
						secondMap.set(timeWindowStart, { price: secondPrice });
						secondMap.set(timeWindowEnd, { price: secondPrice });
					}
				}
			} else {
				const now = Math.floor(Date.now() / 1000);
				if (timeWindowEnd >= now) {
					allTimestamps = [...allTimestamps, timeWindowEnd];
					// Use last historical price only
					const primaryPrice = findLastAtOrBefore(
						primaryMap,
						timeWindowEnd
					)?.price;
					const secondPrice = findLastAtOrBefore(
						secondMap,
						timeWindowEnd
					)?.price;

					if (primaryPrice)
						primaryMap.set(timeWindowEnd, { price: primaryPrice });
					if (secondPrice)
						secondMap.set(timeWindowEnd, { price: secondPrice });
				}
			}

			// Build chart data
			const out: ChartDataPoint[] = [];
			const primaryKeys = Array.from(primaryMap.keys()).sort(
				(a, b) => a - b
			);
			const secondKeys = Array.from(secondMap.keys()).sort(
				(a, b) => a - b
			);
			const lastPrimaryBeforeIdx =
				primaryKeys.findIndex((t) => t > timeWindowStart) - 1;
			const lastSecondBeforeIdx =
				secondKeys.findIndex((t) => t > timeWindowStart) - 1;
			let lastPrimary: { price: number; isLive?: boolean } | null =
				lastPrimaryBeforeIdx >= 0
					? primaryMap.get(primaryKeys[lastPrimaryBeforeIdx]) || null
					: null;
			let lastSecond: { price: number; isLive?: boolean } | null =
				lastSecondBeforeIdx >= 0
					? secondMap.get(secondKeys[lastSecondBeforeIdx]) || null
					: null;

			for (const ts of allTimestamps) {
				const date = new Date(ts * 1000);
				const p = primaryMap.get(ts) ?? lastPrimary;
				const s = secondMap.get(ts) ?? lastSecond;
				const primaryPct = p ? p.price * 100 : null;
				const secondPct = s ? s.price * 100 : null;
				out.push({
					timestamp: ts,
					price: p ? p.price : null,
					secondPrice: s ? s.price : null,
					date: date.toISOString(),
					displayTime: formatDisplayTime(date, timeRange),
					percentage: primaryPct,
					secondPercentage: secondPct,
					isLive: p ? Boolean(p.isLive) : false,
					secondIsLive: s ? Boolean(s.isLive) : false,
				});
				if (primaryMap.has(ts))
					lastPrimary = primaryMap.get(ts) || lastPrimary;
				if (secondMap.has(ts))
					lastSecond = secondMap.get(ts) || lastSecond;
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
		const currentSecondLivePrice = secondId
			? getCurrentLivePrice(secondId)
			: null;

		// Only update if we have live prices
		if (currentLivePrice === null && currentSecondLivePrice === null) {
			return;
		}

		// Update or create data point with live prices
		setData((prevData) => {
			const now = Math.floor(Date.now() / 1000);

			// If no data yet, create initial data point from live prices
			if (prevData.length === 0) {
				if (currentLivePrice === null) return prevData;

				const dateObj = new Date(now * 1000);
				const date = dateObj.toLocaleDateString("en-US");
				const displayTime = dateObj.toLocaleTimeString("en-US", {
					hour: "numeric",
					minute: "2-digit",
					hour12: true,
				});

				return [
					{
						timestamp: now,
						date,
						displayTime,
						price: currentLivePrice,
						percentage: currentLivePrice * 100,
						secondPrice: currentSecondLivePrice,
						secondPercentage: currentSecondLivePrice
							? currentSecondLivePrice * 100
							: null,
						isLive: true,
						secondIsLive: currentSecondLivePrice !== null,
					},
				];
			}

			const lastPoint = prevData[prevData.length - 1];

			// Only update if the last point is recent (within 5 minutes)
			if (Math.abs(lastPoint.timestamp - now) > 300) {
				return prevData;
			}

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
	}, [questionOrderbooks]);

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
