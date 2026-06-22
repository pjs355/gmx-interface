import React, { useMemo, useRef } from "react";
import {
	LineChart,
	Line,
	XAxis,
	YAxis,
	CartesianGrid,
	ReferenceLine,
	ResponsiveContainer,
	Tooltip,
} from "recharts";
import type { ChartDataPoint, MergedExchangePoint } from "./types";
import { isValidChartDisplayPct } from "@/features/markets/chart/chartDisplayPrice";

export const VENUE_COLORS: Record<string, string> = {
	levelUp: "#ffffff",
	polymarket: "#3b82f6",
	kalshi: "#10b981",
	predictFun: "var(--brand-primary)",
	limitless: "#f97316",
	bestOdds: "#06b6d4",
};

export const VENUE_LABELS: Record<string, string> = {
	levelUp: "LevelUp",
	polymarket: "Polymarket",
	kalshi: "Kalshi",
	predictFun: "Predict",
	limitless: "Limitless",
	bestOdds: "Best Odds",
};

function useTimeDomain(data: any[], timeRangeSeconds?: number) {
	return useMemo(() => {
		const now = Math.floor(Date.now() / 1000);

		if (timeRangeSeconds) {
			const start = now - timeRangeSeconds;
			const tickCount = 5;
			const tickInterval = timeRangeSeconds / (tickCount - 1);
			const tickPositions = Array.from({ length: tickCount }, (_, i) =>
				Math.floor(start + i * tickInterval),
			);
			return { domainStart: start, domainEnd: now, ticks: tickPositions };
		}

		if (data.length > 0) {
			const timestamps = data.map((d: any) => d.timestamp as number).filter((t) => t > 0);
			if (timestamps.length === 0)
				return { domainStart: now - 86400, domainEnd: now, ticks: undefined };
			const start = Math.min(...timestamps);
			const end = Math.max(...timestamps);
			const range = end - start;
			const tickCount = 5;
			const tickInterval = range / (tickCount - 1);
			const tickPositions = Array.from({ length: tickCount }, (_, i) =>
				Math.floor(start + i * tickInterval),
			);
			return { domainStart: start, domainEnd: end, ticks: tickPositions };
		}

		return { domainStart: now - 86400, domainEnd: now, ticks: undefined };
	}, [data, timeRangeSeconds]);
}

function formatXAxisTick(timestamp: number, timeRangeSeconds?: number): string {
	const date = new Date(timestamp * 1000);
	if (timeRangeSeconds && timeRangeSeconds <= 86400) {
		return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
	}
	return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── Standard LevelUp chart (team A vs team B) ───────────────────

export function SeriesChart({
	data,
	yesTeamColor,
	noTeamColor,
	isVsSingleMarket,
	tooltip,
	height = 300,
	timeRangeSeconds,
}: {
	data: ChartDataPoint[];
	yesTeamColor: string;
	noTeamColor: string;
	isVsSingleMarket: boolean;
	tooltip: React.ReactElement | any;
	height?: number;
	timeRangeSeconds?: number;
}) {
	const { domainStart, domainEnd, ticks } = useTimeDomain(data, timeRangeSeconds);

	const prevYDomainRef = useRef<{ min: number; max: number; ticks: number[] }>({
		min: 0,
		max: 100,
		ticks: [0, 25, 50, 75, 100],
	});

	const yAxisConfig = useMemo(() => {
		if (!data || data.length === 0) return prevYDomainRef.current;

		let maxValue = 0;
		let minValue = 100;
		for (const point of data) {
			if (point.percentage !== null && isValidChartDisplayPct(point.percentage)) {
				if (point.percentage > maxValue) maxValue = point.percentage;
				if (point.percentage < minValue) minValue = point.percentage;
			}
			if (point.secondPercentage !== null && isValidChartDisplayPct(point.secondPercentage)) {
				if (point.secondPercentage > maxValue) maxValue = point.secondPercentage;
				if (point.secondPercentage < minValue) minValue = point.secondPercentage;
			}
		}

		const range = maxValue - minValue;
		const buffer = Math.max(range * 0.1, 2);
		const bufferedMax = maxValue + buffer;
		const roundedMax = Math.ceil(bufferedMax / 5) * 5;
		const bufferedMin = minValue - buffer;
		const roundedMin = Math.floor(bufferedMin / 5) * 5;
		const finalMax = Math.min(100, roundedMax);
		const finalMin = Math.max(0, roundedMin);
		const finalRange = finalMax - finalMin;
		let adjustedMin = finalMin;
		let adjustedMax = finalMax;
		if (finalRange < 10) {
			const midpoint = (finalMin + finalMax) / 2;
			adjustedMin = Math.max(0, Math.floor((midpoint - 5) / 5) * 5);
			adjustedMax = Math.min(100, Math.ceil((midpoint + 5) / 5) * 5);
		}
		const yTicks: number[] = [];
		for (let i = adjustedMin; i <= adjustedMax; i += 5) yTicks.push(i);
		const result = { min: adjustedMin, max: adjustedMax, ticks: yTicks };
		prevYDomainRef.current = result;
		return result;
	}, [data]);

	const referenceLines = useMemo(() => {
		const lines: { y: number; opacity: number }[] = [];
		const { min, max } = yAxisConfig;
		if (min <= 50 && max >= 50) lines.push({ y: 50, opacity: 0.3 });
		if (min <= 25 && max >= 25) lines.push({ y: 25, opacity: 0.1 });
		if (min <= 75 && max >= 75) lines.push({ y: 75, opacity: 0.1 });
		if (lines.length === 0) {
			const midpoint = Math.round((min + max) / 2 / 5) * 5;
			if (midpoint > min && midpoint < max) lines.push({ y: midpoint, opacity: 0.2 });
		}
		return lines;
	}, [yAxisConfig]);

	return (
		<div style={{ width: "100%" }}>
			<ResponsiveContainer width="100%" height={height}>
				<LineChart data={data} margin={{ top: 12, right: 12, left: 30, bottom: 48 }}>
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
						tickFormatter={(ts) => formatXAxisTick(ts, timeRangeSeconds)}
						height={40}
						angle={0}
						textAnchor="middle"
						padding={{ left: 10, right: 10 }}
					/>
					<YAxis
						yAxisId="right"
						orientation="right"
						domain={[yAxisConfig.min, yAxisConfig.max]}
						ticks={yAxisConfig.ticks}
						axisLine={false}
						tickLine={false}
						tick={{ fill: "#ffffff", fontSize: 11 }}
						tickFormatter={(value) => `${value}%`}
						width={40}
					/>
					<Tooltip content={tooltip} />
					{referenceLines.map((line, idx) => (
						<ReferenceLine
							key={idx}
							yAxisId="right"
							y={line.y}
							stroke={`rgba(255, 255, 255, ${line.opacity})`}
							strokeDasharray={line.opacity >= 0.3 ? "2 2" : "1 1"}
						/>
					))}
					<Line
						yAxisId="right"
						type="monotone"
						dataKey="percentage"
						stroke={isVsSingleMarket ? yesTeamColor : "var(--brand-primary)"}
						strokeWidth={2}
						dot={false}
						connectNulls
						animationDuration={500}
						animationEasing="ease-out"
						activeDot={{
							r: 4,
							fill: isVsSingleMarket ? yesTeamColor : "var(--brand-primary)",
							stroke: "#ffffff",
							strokeWidth: 2,
						}}
					/>
					<Line
						yAxisId="right"
						type="monotone"
						dataKey="secondPercentage"
						stroke={isVsSingleMarket ? noTeamColor : "#3b82f6"}
						strokeWidth={2}
						dot={false}
						connectNulls
						animationDuration={500}
						animationEasing="ease-out"
						activeDot={{
							r: 4,
							fill: isVsSingleMarket ? noTeamColor : "#3b82f6",
							stroke: "#ffffff",
							strokeWidth: 2,
						}}
					/>
				</LineChart>
			</ResponsiveContainer>
		</div>
	);
}

// ─── Multi-exchange overlay chart ─────────────────────────────────

interface ExchangeOverlayChartProps {
	data: MergedExchangePoint[];
	enabledVenues: Set<string>;
	teamAName: string;
	teamBName: string;
	teamAColor: string;
	teamBColor: string;
	height?: number;
	timeRangeSeconds?: number;
}

const TEAM_B_SUFFIX = "B";

function teamBKey(venue: string): string {
	return venue + TEAM_B_SUFFIX;
}

function baseVenueFromKey(dataKey: string): string {
	if (dataKey.endsWith(TEAM_B_SUFFIX)) return dataKey.slice(0, -1);
	return dataKey;
}

function ExchangeTooltipContent({
	active,
	payload,
	teamAName,
	teamBName,
	teamAColor,
	teamBColor,
}: any) {
	if (!active || !payload || payload.length === 0) return null;
	const ts = payload[0]?.payload?.timestamp;
	const date = ts ? new Date(ts * 1000) : null;

	const grouped = new Map<string, { a?: number; b?: number; colorA: string; colorB: string }>();
	for (const entry of payload) {
		if (entry.value == null || !isValidChartDisplayPct(Number(entry.value))) continue;
		const key = entry.dataKey as string;
		const base = baseVenueFromKey(key);
		const isB = key !== base;
		const isBestOdds = base === "bestOdds";
		const venueColor = VENUE_COLORS[base] ?? entry.color;
		if (!grouped.has(base)) {
			grouped.set(base, {
				colorA: isBestOdds ? (teamAColor ?? venueColor) : venueColor,
				colorB: isBestOdds ? (teamBColor ?? venueColor) : venueColor,
			});
		}
		const g = grouped.get(base)!;
		if (isB) g.b = entry.value;
		else g.a = entry.value;
	}

	return (
		<div
			style={{
				backgroundColor: "rgba(17, 17, 17, 0.95)",
				border: "1px solid rgba(255,255,255,0.15)",
				borderRadius: 8,
				padding: "8px 12px",
				fontSize: 12,
				color: "#fff",
			}}
		>
			{date && (
				<p style={{ margin: "0 0 6px", opacity: 0.6 }}>
					{date.toLocaleString("en-US", {
						month: "short",
						day: "numeric",
						hour: "2-digit",
						minute: "2-digit",
					})}
				</p>
			)}
			{Array.from(grouped.entries()).map(([venue, g]) => {
				const label = VENUE_LABELS[venue] ?? venue;
				return (
					<div key={venue} style={{ margin: "3px 0" }}>
						<span style={{ color: g.colorA, fontWeight: 600 }}>{label}</span>
						{g.a != null && (
							<span style={{ color: g.colorA, marginLeft: 8, opacity: 1 }}>
								{teamAName}: {Number(g.a).toFixed(1)}%
							</span>
						)}
						{g.b != null && (
							<span style={{ color: g.colorB, marginLeft: 8, opacity: 0.92 }}>
								{teamBName}: {Number(g.b).toFixed(1)}%
							</span>
						)}
					</div>
				);
			})}
		</div>
	);
}

export function ExchangeOverlayChart({
	data,
	enabledVenues,
	teamAName,
	teamBName,
	teamAColor,
	teamBColor,
	height = 300,
	timeRangeSeconds,
}: ExchangeOverlayChartProps) {
	const { domainStart, domainEnd, ticks } = useTimeDomain(data, timeRangeSeconds);

	// Detect which venues have real B-side data
	const venuesWithBData = useMemo(() => {
		const bKeys: Record<string, keyof MergedExchangePoint> = {
			levelUp: "levelUpB",
			polymarket: "polymarketB",
			kalshi: "kalshiB",
			predictFun: "predictFunB",
			limitless: "limitlessB",
			bestOdds: "bestOddsB",
		};
		const result = new Set<string>();
		for (const [venue, field] of Object.entries(bKeys)) {
			if (data.some((pt) => pt[field] != null)) {
				result.add(venue);
			}
		}
		return result;
	}, [data]);

	const lines = useMemo(() => {
		const out: { key: string; dataKey: string; color: string; width: number; dash?: string }[] = [];
		const venues = Array.from(enabledVenues);
		for (const venue of venues) {
			const isBestOdds = venue === "bestOdds";
			const colorA = isBestOdds ? teamAColor : (VENUE_COLORS[venue] ?? "#888");
			const colorB = isBestOdds ? teamBColor : (VENUE_COLORS[venue] ?? "#888");
			const width = isBestOdds ? 2.5 : 2;

			out.push({ key: `${venue}-a`, dataKey: venue, color: colorA, width });

			if (venuesWithBData.has(venue)) {
				out.push({
					key: `${venue}-b`,
					dataKey: teamBKey(venue),
					color: colorB,
					width,
					dash: "6 3",
				});
			}
		}
		return out;
	}, [enabledVenues, venuesWithBData, teamAColor, teamBColor]);

	return (
		<div style={{ width: "100%" }}>
			<ResponsiveContainer width="100%" height={height}>
				<LineChart data={data} margin={{ top: 12, right: 12, left: 30, bottom: 48 }}>
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
						tickFormatter={(ts) => formatXAxisTick(ts, timeRangeSeconds)}
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
						tickFormatter={(v) => `${v}%`}
						width={40}
					/>
					<Tooltip
						content={
							<ExchangeTooltipContent
								teamAName={teamAName}
								teamBName={teamBName}
								teamAColor={teamAColor}
								teamBColor={teamBColor}
							/>
						}
					/>
					<ReferenceLine
						yAxisId="right"
						y={50}
						stroke="rgba(255, 255, 255, 0.3)"
						strokeDasharray="2 2"
					/>
					{lines.map((l) => (
						<Line
							key={l.key}
							yAxisId="right"
							type="monotone"
							dataKey={l.dataKey}
							stroke={l.color}
							strokeWidth={l.width}
							strokeDasharray={l.dash}
							dot={false}
							connectNulls
							isAnimationActive={false}
							activeDot={{ r: 3, stroke: "#fff", strokeWidth: 1 }}
						/>
					))}
				</LineChart>
			</ResponsiveContainer>
		</div>
	);
}
