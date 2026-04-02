import React, { useEffect, useMemo, useState } from "react";
import {
	LineChart,
	Line,
	XAxis,
	YAxis,
	CartesianGrid,
	ReferenceLine,
	ResponsiveContainer,
	Tooltip,
	Legend,
} from "recharts";
import {
	type PricePoint,
	type TimeRange,
	fetchPolymarketPriceHistory,
	fetchKalshiPriceHistory,
	fetchPredictFunPriceHistory,
} from "@/services/api/exchangePriceHistoryService";
import {
	type MatchedMarketExchange,
	findMatchedMarketByConditionId,
} from "@/services/api/matchDataService";
import "./ExchangePriceChart.scss";

interface ExchangePriceChartProps {
	conditionId?: string;
}

interface MergedPoint {
	timestamp: number;
	polymarket?: number;
	kalshi?: number;
	predictFun?: number;
}

const EXCHANGE_COLORS = {
	polymarket: "#8b5cf6",
	kalshi: "#10b981",
	predictFun: "#f59e0b",
} as const;

const TIME_RANGES: { label: string; value: TimeRange }[] = [
	{ label: "1H", value: "1h" },
	{ label: "6H", value: "6h" },
	{ label: "1D", value: "1d" },
	{ label: "1W", value: "1w" },
	{ label: "All", value: "all" },
];

function mergeTimeSeries(
	poly: PricePoint[],
	kalshi: PricePoint[],
	predict: PricePoint[],
): MergedPoint[] {
	const map = new Map<number, MergedPoint>();

	const bucket = (ts: number) => Math.floor(ts / 60) * 60;

	for (const p of poly) {
		const t = bucket(p.timestamp);
		const existing = map.get(t);
		if (existing) {
			existing.polymarket = p.price * 100;
		} else {
			map.set(t, { timestamp: t, polymarket: p.price * 100 });
		}
	}
	for (const p of kalshi) {
		const t = bucket(p.timestamp);
		const existing = map.get(t);
		if (existing) {
			existing.kalshi = p.price * 100;
		} else {
			map.set(t, { timestamp: t, kalshi: p.price * 100 });
		}
	}
	for (const p of predict) {
		const t = bucket(p.timestamp);
		const existing = map.get(t);
		if (existing) {
			existing.predictFun = p.price * 100;
		} else {
			map.set(t, { timestamp: t, predictFun: p.price * 100 });
		}
	}

	return Array.from(map.values()).sort((a, b) => a.timestamp - b.timestamp);
}

export function ExchangePriceChart({ conditionId }: ExchangePriceChartProps) {
	const [range, setRange] = useState<TimeRange>("all");
	const [matchedMarket, setMatchedMarket] = useState<MatchedMarketExchange | null>(null);
	const [polyData, setPolyData] = useState<PricePoint[]>([]);
	const [kalshiData, setKalshiData] = useState<PricePoint[]>([]);
	const [predictData, setPredictData] = useState<PricePoint[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!conditionId) return;
		let cancelled = false;

		async function loadMarket() {
			try {
				const market = await findMatchedMarketByConditionId(conditionId!);
				if (!cancelled && market) {
					setMatchedMarket(market);
				}
			} catch (err) {
				console.error("error", err);
				if (!cancelled) setError("Failed to load market data");
			}
		}

		loadMarket();
		return () => { cancelled = true; };
	}, [conditionId]);

	useEffect(() => {
		if (!matchedMarket) return;
		let cancelled = false;

		async function loadPrices() {
			setLoading(true);
			setError(null);

			const results = await Promise.allSettled([
				fetchPolymarketPriceHistory(matchedMarket!.polyTokenIdA, range),
				matchedMarket!.kalshi
					? fetchKalshiPriceHistory(
							matchedMarket!.kalshi.eventTicker,
							matchedMarket!.kalshi.tickerA,
							range,
						)
					: Promise.resolve([]),
				matchedMarket!.predictFun?.marketIdA
					? fetchPredictFunPriceHistory(matchedMarket!.predictFun.marketIdA, range)
					: Promise.resolve([]),
			]);

			if (cancelled) return;

			const poly = results[0].status === "fulfilled" ? results[0].value : [];
			const kalshi = results[1].status === "fulfilled" ? results[1].value : [];
			const predict = results[2].status === "fulfilled" ? results[2].value : [];

			if (results[0].status === "rejected") {
				console.error("error", results[0].reason);
			}

			setPolyData(poly);
			setKalshiData(kalshi);
			setPredictData(predict);
			setLoading(false);

			if (poly.length === 0 && kalshi.length === 0 && predict.length === 0) {
				setError("No price data available from any exchange");
			}
		}

		loadPrices();
		return () => { cancelled = true; };
	}, [matchedMarket, range]);

	const merged = useMemo(
		() => mergeTimeSeries(polyData, kalshiData, predictData),
		[polyData, kalshiData, predictData],
	);

	const hasKalshi = kalshiData.length > 0;
	const hasPredictFun = predictData.length > 0;
	const hasPoly = polyData.length > 0;

	const timeRangeSeconds: Record<TimeRange, number | undefined> = {
		"1h": 3600,
		"6h": 21600,
		"1d": 86400,
		"1w": 604800,
		all: undefined,
	};

	const { domainStart, domainEnd, ticks } = useMemo(() => {
		const now = Math.floor(Date.now() / 1000);
		const rangeSec = timeRangeSeconds[range];

		if (rangeSec) {
			const start = now - rangeSec;
			const tickCount = 5;
			const tickInterval = rangeSec / (tickCount - 1);
			const tickPositions = Array.from({ length: tickCount }, (_, i) =>
				Math.floor(start + i * tickInterval),
			);
			return { domainStart: start, domainEnd: now, ticks: tickPositions };
		}

		if (merged.length > 0) {
			const timestamps = merged.map((d) => d.timestamp);
			const start = Math.min(...timestamps);
			const end = Math.max(...timestamps);
			const r = end - start;
			const tickCount = 5;
			const tickInterval = r / (tickCount - 1);
			const tickPositions = Array.from({ length: tickCount }, (_, i) =>
				Math.floor(start + i * tickInterval),
			);
			return { domainStart: start, domainEnd: end, ticks: tickPositions };
		}

		return { domainStart: now - 86400, domainEnd: now, ticks: undefined };
	}, [merged, range]);

	if (!conditionId) {
		return null;
	}

	return (
		<div className="exchange-price-chart">
			<div className="exchange-price-chart__header">
				<h3 className="exchange-price-chart__title">Exchange Prices</h3>
				<div className="exchange-price-chart__ranges">
					{TIME_RANGES.map((tr) => (
						<button
							key={tr.value}
							className={`exchange-price-chart__range-btn ${range === tr.value ? "exchange-price-chart__range-btn--active" : ""}`}
							onClick={() => setRange(tr.value)}
						>
							{tr.label}
						</button>
					))}
				</div>
			</div>

			{loading && (
				<div className="exchange-price-chart__loading">Loading exchange data...</div>
			)}

			{error && !loading && (
				<div className="exchange-price-chart__empty">{error}</div>
			)}

			{!loading && !error && merged.length > 0 && (
				<ResponsiveContainer width="100%" height={260}>
					<LineChart data={merged} margin={{ top: 12, right: 12, left: 30, bottom: 48 }}>
						<CartesianGrid
							strokeDasharray="3 3"
							stroke="rgba(255, 255, 255, 0.1)"
							horizontal
							vertical={false}
						/>
						<XAxis
							dataKey="timestamp"
							type="number"
							domain={[domainStart, domainEnd]}
							ticks={ticks}
							scale="linear"
							allowDataOverflow={false}
							axisLine={false}
							tickLine={false}
							tick={{ fill: "#ffffff", fontSize: 10 }}
							tickFormatter={(ts: number) => {
								const date = new Date(ts * 1000);
								const rs = timeRangeSeconds[range];
								if (rs && rs <= 86400) {
									return date.toLocaleTimeString("en-US", {
										hour: "2-digit",
										minute: "2-digit",
										hour12: false,
									});
								}
								if (rs && rs <= 604800) {
									return date.toLocaleDateString("en-US", {
										weekday: "short",
										hour: "2-digit",
										minute: "2-digit",
										hour12: false,
									});
								}
								return date.toLocaleDateString("en-US", {
									month: "short",
									day: "numeric",
								});
							}}
							height={40}
							angle={0}
							textAnchor="middle"
							padding={{ left: 10, right: 10 }}
						/>
						<YAxis
							yAxisId="right"
							orientation="right"
							domain={[0, 100]}
							ticks={[0, 25, 50, 75, 100]}
							axisLine={false}
							tickLine={false}
							tick={{ fill: "#ffffff", fontSize: 11 }}
							tickFormatter={(v: number) => `${v}%`}
							width={40}
						/>
						<Tooltip
							contentStyle={{
								backgroundColor: "rgba(17, 17, 17, 0.95)",
								border: "1px solid rgba(255,255,255,0.15)",
								borderRadius: 8,
								fontSize: 12,
								color: "#fff",
							}}
							labelFormatter={(ts: number) => {
								const d = new Date(ts * 1000);
								return d.toLocaleString("en-US", {
									month: "short",
									day: "numeric",
									hour: "2-digit",
									minute: "2-digit",
								});
							}}
							formatter={(value: number, name: string) => {
								const labels: Record<string, string> = {
									polymarket: "Polymarket",
									kalshi: "Kalshi",
									predictFun: "Predict.fun",
								};
								return [`${value.toFixed(1)}%`, labels[name] ?? name];
							}}
						/>
						<ReferenceLine
							yAxisId="right"
							y={50}
							stroke="rgba(255, 255, 255, 0.3)"
							strokeDasharray="2 2"
						/>
						<Legend
							verticalAlign="top"
							height={28}
							formatter={(value: string) => {
								const labels: Record<string, string> = {
									polymarket: "Polymarket",
									kalshi: "Kalshi",
									predictFun: "Predict.fun",
								};
								return labels[value] ?? value;
							}}
						/>
						{hasPoly && (
							<Line
								yAxisId="right"
								type="monotone"
								dataKey="polymarket"
								stroke={EXCHANGE_COLORS.polymarket}
								strokeWidth={2}
								dot={false}
								connectNulls
								animationDuration={500}
								activeDot={{ r: 3, stroke: "#fff", strokeWidth: 1 }}
							/>
						)}
						{hasKalshi && (
							<Line
								yAxisId="right"
								type="monotone"
								dataKey="kalshi"
								stroke={EXCHANGE_COLORS.kalshi}
								strokeWidth={2}
								dot={false}
								connectNulls
								animationDuration={500}
								activeDot={{ r: 3, stroke: "#fff", strokeWidth: 1 }}
							/>
						)}
						{hasPredictFun && (
							<Line
								yAxisId="right"
								type="monotone"
								dataKey="predictFun"
								stroke={EXCHANGE_COLORS.predictFun}
								strokeWidth={2}
								dot={false}
								connectNulls
								animationDuration={500}
								activeDot={{ r: 3, stroke: "#fff", strokeWidth: 1 }}
							/>
						)}
					</LineChart>
				</ResponsiveContainer>
			)}
		</div>
	);
}
