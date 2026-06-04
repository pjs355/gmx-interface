import React, { useMemo, useState } from "react";
import { useMedia } from "react-use";
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
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import {
	groupWinnerLegColor,
	groupWinnerLegLabel,
	orderGroupWinnerLegs,
} from "@/features/markets/listing/groupWinner";
import { getChartStrokeColorForDarkBg } from "@/features/markets/presentation/teamColors";
import { BRAND_NAME, clutchCometLogo } from "@/assets/brandLogo";
import type { TimeRange } from "./types";
import {
	useGroupWinnerChartData,
	type GroupWinnerChartPoint,
	type GroupWinnerLegInput,
} from "./useGroupWinnerChartData";
import "./PredictionMarketChart.scss";

export interface GroupWinnerChartProps {
	/** Umbrella display questions; the N team legs are derived from them. */
	legs: PredictionMarket[];
	/** Group title for the header, e.g. "Group A Winner". */
	title?: string;
	className?: string;
}

const TIME_RANGES: { key: TimeRange; label: string; seconds: number }[] = [
	{ key: "1h", label: "1H", seconds: 3600 },
	{ key: "1d", label: "1D", seconds: 86400 },
];

const CHART_HEIGHT_DESKTOP = 300;
const CHART_HEIGHT_MOBILE_LAYOUT = 220;

function formatXAxisTick(timestamp: number, timeRangeSeconds?: number): string {
	const date = new Date(timestamp * 1000);
	if (timeRangeSeconds && timeRangeSeconds <= 86400) {
		return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
	}
	return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function GroupWinnerTooltip({
	active,
	payload,
	teams,
}: {
	active?: boolean;
	payload?: Array<{ value?: number | null; dataKey?: string; payload?: GroupWinnerChartPoint }>;
	teams: { dataKey: string; label: string; color: string }[];
}) {
	if (!active || !payload || payload.length === 0) return null;
	const ts = payload[0]?.payload?.timestamp;
	const date = ts ? new Date(ts * 1000) : null;
	const byKey = new Map(teams.map((t) => [t.dataKey, t]));
	const rows = payload
		.filter((p) => p.value != null && Number.isFinite(p.value))
		.map((p) => ({ team: byKey.get(p.dataKey ?? ""), value: p.value as number }))
		.filter((r) => r.team)
		.sort((a, b) => b.value - a.value);
	if (rows.length === 0) return null;
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
			{rows.map((r) => (
				<div key={r.team!.dataKey} style={{ margin: "3px 0" }}>
					<span style={{ color: r.team!.color, fontWeight: 600 }}>{r.team!.label}</span>
					<span style={{ color: r.team!.color, marginLeft: 8 }}>{r.value.toFixed(1)}%</span>
				</div>
			))}
		</div>
	);
}

/**
 * N-line chart for a FIFA "Group X Winner" prop. Each line is one team's best-YES
 * across venues over time (data via {@link useGroupWinnerChartData}). The header
 * shows each team's flag, name, and latest YES%. Mirrors the moneyline chart shell
 * (time-range selector, brand logo) but renders N series instead of two.
 */
const GroupWinnerChartComponent: React.FC<GroupWinnerChartProps> = ({ legs, title, className = "" }) => {
	const isTradingMobileLayout = useMedia("(max-width: 1100px)");
	const chartHeight = isTradingMobileLayout ? CHART_HEIGHT_MOBILE_LAYOUT : CHART_HEIGHT_DESKTOP;
	const [timeRange, setTimeRange] = useState<TimeRange>("1d");

	const ordered = useMemo(() => orderGroupWinnerLegs(legs), [legs]);

	const legInputs = useMemo<GroupWinnerLegInput[]>(
		() =>
			ordered.map((leg, index) => {
				const key =
					(typeof leg.polymarketMarketId === "string" && leg.polymarketMarketId.trim()) ||
					(typeof leg.conditionId === "string" && leg.conditionId.trim()) ||
					leg._id ||
					`leg-${index}`;
				const flag =
					typeof leg.image === "string" && leg.image.trim() !== "" ? leg.image.trim() : null;
				return {
					key,
					conditionId:
						typeof leg.conditionId === "string" ? leg.conditionId : undefined,
					polymarketMarketId:
						typeof leg.polymarketMarketId === "string" ? leg.polymarketMarketId : undefined,
					label: groupWinnerLegLabel(leg),
					color: getChartStrokeColorForDarkBg(groupWinnerLegColor(leg, index)),
					flagUrl: flag,
				};
			}),
		[ordered],
	);

	const { data, teams, loading, error } = useGroupWinnerChartData(legInputs, timeRange);

	const { domainStart, domainEnd, ticks } = useMemo(() => {
		const now = Math.floor(Date.now() / 1000);
		const seconds = TIME_RANGES.find((r) => r.key === timeRange)?.seconds ?? 86400;
		const start = now - seconds;
		const tickCount = 5;
		const interval = seconds / (tickCount - 1);
		const tickPositions = Array.from({ length: tickCount }, (_, i) => Math.floor(start + i * interval));
		return { domainStart: start, domainEnd: now, ticks: tickPositions };
	}, [timeRange]);

	const timeRangeSeconds = TIME_RANGES.find((r) => r.key === timeRange)?.seconds;

	const hasData = data.length > 0 && teams.some((t) => t.latest != null);

	return (
		<div className={`prediction-market-chart ${className}`}>
			<div className="chart-header chart-header--group-winner">
				<div className="group-winner-chart-header">
					{title ? <span className="group-winner-chart-header__title">{title}</span> : null}
					<div className="group-winner-chart-header__teams">
						{teams.map((team) => (
							<div key={team.dataKey} className="group-winner-chart-team">
								{team.flagUrl ? (
									<img
										className="group-winner-chart-team__flag"
										src={team.flagUrl}
										alt={team.label}
										loading="lazy"
									/>
								) : (
									<span
										className="group-winner-chart-team__dot"
										style={{ backgroundColor: team.color }}
									/>
								)}
								<span className="group-winner-chart-team__name">{team.label}</span>
								{team.latest != null ? (
									<span
										className="group-winner-chart-team__odds"
										style={{ color: team.color }}
									>
										{Math.round(team.latest)}%
									</span>
								) : null}
							</div>
						))}
					</div>
				</div>
				<div className="chart-header-right">
					<img src={clutchCometLogo} alt={BRAND_NAME} className="chart-logo" />
				</div>
			</div>

			<div className="chart-container" style={{ minWidth: 0, minHeight: 280 }}>
				<div className="chart-plot-area">
					{loading && (
						<div className="chart-spinner-overlay">
							<div className="chart-spinner" />
						</div>
					)}
					{error && !loading && !hasData && (
						<div className="exchange-chart-empty">{error}</div>
					)}
					{hasData && (
						<ResponsiveContainer width="100%" height={chartHeight}>
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
								<Tooltip content={<GroupWinnerTooltip teams={teams} />} />
								<ReferenceLine
									yAxisId="right"
									y={50}
									stroke="rgba(255, 255, 255, 0.2)"
									strokeDasharray="2 2"
								/>
								{teams.map((team) => (
									<Line
										key={team.dataKey}
										yAxisId="right"
										type="monotone"
										dataKey={team.dataKey}
										stroke={team.color}
										strokeWidth={2}
										dot={false}
										connectNulls
										isAnimationActive={false}
										activeDot={{ r: 3, stroke: "#fff", strokeWidth: 1 }}
									/>
								))}
							</LineChart>
						</ResponsiveContainer>
					)}

					<div className="time-range-selector bottom-right">
						{TIME_RANGES.map((range) => (
							<button
								key={range.key}
								className={`time-range-btn ${timeRange === range.key ? "active" : ""}`}
								onClick={() => setTimeRange(range.key)}
							>
								{range.label}
							</button>
						))}
					</div>
				</div>
			</div>
		</div>
	);
};

const GroupWinnerChart = React.memo(GroupWinnerChartComponent);
export default GroupWinnerChart;
