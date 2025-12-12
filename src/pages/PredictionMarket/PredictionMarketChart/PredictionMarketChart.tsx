import React, { useState, useEffect, useMemo } from "react";
import { usePredictionChartData } from "./usePredictionChartData";
import { SeriesChart } from "./SeriesChart";
import { ChartTooltip } from "./ChartTooltip";
import levelUpLogo from "@/assets/img/LevelUp_Full.jpeg";
import "./PredictionMarketChart.scss";

// Display types handled in hook/types

interface PredictionMarketChartProps {
	questionId: string;
	activeMarket?: any;
	secondMarket?: any; // Add second market prop
	questionOrderbooks?: { [questionId: string]: any }; // Add orderbooks for live prices
	className?: string;
}

type TimeRange = "1h" | "1d" | "1w" | "all";

const TIME_RANGES: { key: TimeRange; label: string; seconds: number }[] = [
	{ key: "1h", label: "1H", seconds: 3600 },
	{ key: "1d", label: "1D", seconds: 86400 },
	{ key: "1w", label: "1W", seconds: 604800 },
	{ key: "all", label: "All", seconds: Infinity },
];

const PredictionMarketChartComponent: React.FC<PredictionMarketChartProps> = ({
	questionId,
	activeMarket,
	secondMarket,
	questionOrderbooks,
	className = "",
}) => {
	const [timeRange, setTimeRange] = useState<TimeRange>("1d");

	// Resolve question id from prop or activeMarket first
	const effectiveQuestionId = useMemo(
		() =>
			questionId ||
			activeMarket?._id ||
			activeMarket?.questionId ||
			activeMarket?.marketId ||
			"",
		[questionId, activeMarket]
	);

	// Detect single-market VS condition and derive team labels
	const isVsSingleMarket = useMemo(() => {
		const title = (
			activeMarket?.displayName ||
			activeMarket?.question ||
			""
		).trim();
		const hasVs = /\svs\.?\s/i.test(title);
		const single = (activeMarket as any)?.umbrellaChildrenCount === 1;
		return Boolean(single && hasVs);
	}, [activeMarket]);

	const {
		data: chartData,
		timeWindowStart,
		timeWindowEnd,
		setTimeWindowEnd,
	} = usePredictionChartData({
		questionId: effectiveQuestionId,
		activeMarket,
		secondMarket,
		questionOrderbooks,
		timeRange,
		isVsSingleMarket,
	});

	const { teamOneLabel, teamTwoLabel } = useMemo(() => {
		const title = (
			activeMarket?.displayName ||
			activeMarket?.question ||
			""
		).trim();
		const parts = title
			.split(/\s*vs\.?\s*/i)
			.map((s: string) => s.trim())
			.filter(Boolean);
		if (isVsSingleMarket && parts.length === 2) {
			return { teamOneLabel: parts[0], teamTwoLabel: parts[1] };
		}
		return { teamOneLabel: null as any, teamTwoLabel: null as any };
	}, [activeMarket, isVsSingleMarket]);

	const yesTeamColor: string = (activeMarket as any)?.yesColor || "#8b5cf6";
	const noTeamColor: string = (activeMarket as any)?.noColor || "#3b82f6";

	// Calculate data coverage from RAW historical data (not filtered chartData)
	// This ensures we know the full extent of data even when viewing shorter time ranges
	const dataSpan = useMemo(() => {
		// Get raw historical data from activeMarket
		const rawHistorical = activeMarket?.historicalPricesYes || [];
		if (rawHistorical.length < 2) return 0;

		const timestamps = rawHistorical
			.map((d: any) => {
				// Handle both ts (milliseconds) and timestamp (seconds) formats
				if (d.ts) return Math.floor(d.ts / 1000);
				if (d.timestamp) return d.timestamp;
				return null;
			})
			.filter((t: number | null) => t !== null && t !== undefined) as number[];

		if (timestamps.length < 2) return 0;
		const oldest = Math.min(...timestamps);
		const newest = Math.max(...timestamps);
		return newest - oldest; // in seconds
	}, [activeMarket?.historicalPricesYes]);

	// Determine which time ranges should be visible based on data coverage
	const availableTimeRanges = useMemo(() => {
		return TIME_RANGES.filter((range) => {
			// Always show 1H and 1D
			if (range.key === "1h" || range.key === "1d") return true;

			// For 1W, require at least 2 days of data (reasonable threshold to show weekly view)
			if (range.key === "1w") {
				const requiredSeconds = 2 * 86400; // 2 days minimum
				return dataSpan >= requiredSeconds;
			}

			// For All, require at least 1 week of data (otherwise it's redundant with 1W)
			if (range.key === "all") {
				const requiredSeconds = 7 * 86400; // 7 days minimum
				return dataSpan >= requiredSeconds;
			}

			return true;
		});
	}, [dataSpan]);

	// Remove container readiness check - charts should load immediately

	// Compute primary market best bid for synthesized NO live indicator
	const primaryLiveBestBid = null as number | null;

	// Derive live prices and timestamps directly from frozen orderbooks
	// Live UI indicators disabled for now
	const computedLiveBestAsk = null as number | null;

	const computedSecondLiveBestAsk = null as number | null;

	// Live price computations handled via useMemo from orderbooks above

	// Time window updates are handled in usePredictionChartData

	// Historical data refresh is handled in the hook

	// Chart data preparation handled in usePredictionChartData

	// Removed 30-second interval refresh - WebSocket updates provide real-time data
	// and the interval was causing unnecessary re-renders and chart animations

	// display time handled in hook

	const formatTooltipTime = (timestamp: number): string => {
		const date = new Date(timestamp * 1000);
		return date.toLocaleString("en-US", {
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
			hour12: true,
		});
	};

	// Tooltip content is created after titles are defined below

	// Handle time range changes - allow immediate switching
	const handleTimeRangeChange = (newTimeRange: TimeRange) => {
		if (newTimeRange !== timeRange) {
			setTimeRange(newTimeRange);
		}
	};

	const currentPrimaryPrice =
		chartData.length > 0
			? chartData.filter((d) => d.percentage !== null).slice(-1)[0]
					?.percentage || 0
			: 0;

	const currentSecondPrice =
		chartData.length > 0
			? chartData.filter((d) => d.secondPercentage !== null).slice(-1)[0]
					?.secondPercentage || 0
			: 0;

	const primaryMarketTitle =
		isVsSingleMarket && teamOneLabel
			? teamOneLabel
			: activeMarket?.displayName ||
			  activeMarket?.question ||
			  "Primary Market";
	const secondMarketTitle =
		(secondMarket
			? secondMarket?.displayName || secondMarket?.question
			: isVsSingleMarket && teamTwoLabel
			? teamTwoLabel
			: null) || "Second Market";

	const TooltipContent = ChartTooltip({
		primaryTitle: primaryMarketTitle,
		secondaryTitle: secondMarket ? secondMarketTitle : null,
		isVsSingleMarket,
		formatTime: formatTooltipTime,
	});

	// Guard: do not render chart until we have a valid question id and data
	if (!effectiveQuestionId) {
		return (
			<div className={`prediction-market-chart ${className}`}>
				<div className="chart-container" style={{ minHeight: 300 }}>
					<div className="no-data">
						<p>Select a market to load chart</p>
					</div>
				</div>
			</div>
		);
	}

	// Show chart even with 0 data points - let Recharts handle empty state gracefully
	// We only skip rendering if we don't have a valid question ID yet

	return (
		<div className={`prediction-market-chart ${className}`}>
			{/* Chart Header */}
			<div className="chart-header">
				<div className="chart-titles">
					<div className="market-info primary-market">
						<h3>{primaryMarketTitle}</h3>
						<div className="current-price">
							<span
								className="price-value primary-price"
								style={
									isVsSingleMarket
										? { color: yesTeamColor }
										: undefined
								}
							>
								{Math.round(currentPrimaryPrice)}%
							</span>
							{computedLiveBestAsk !== null && (
								<span
									className="live-indicator primary-indicator"
									style={
										isVsSingleMarket
											? { color: yesTeamColor }
											: undefined
									}
								>
									●
								</span>
							)}
						</div>
					</div>

					{(secondMarket || isVsSingleMarket) && (
						<div className="market-info second-market">
							<h3>{secondMarketTitle}</h3>
							<div className="current-price">
								<span
									className="price-value second-price"
									style={
										isVsSingleMarket
											? { color: noTeamColor }
											: undefined
									}
								>
									{Math.round(currentSecondPrice)}%
								</span>
								{(secondMarket
									? computedSecondLiveBestAsk !== null
									: primaryLiveBestBid !== null) && (
									<span
										className="live-indicator second-indicator"
										style={
											isVsSingleMarket
												? { color: noTeamColor }
												: undefined
										}
									>
										●
									</span>
								)}
							</div>
						</div>
					)}
				</div>
				<img src={levelUpLogo} alt="LevelUp" className="chart-logo" />
			</div>

			{/* Chart */}
			<div
				className="chart-container"
				style={{ minWidth: 0, minHeight: 280 }}
			>
				<SeriesChart
					data={chartData as any}
					yesTeamColor={yesTeamColor}
					noTeamColor={noTeamColor}
					isVsSingleMarket={isVsSingleMarket}
					tooltip={<TooltipContent />}
					height={
						typeof window !== "undefined" &&
						window.innerWidth <= 768
							? 240
							: 300
					}
					timeRangeSeconds={
						// For "all" time range, pass undefined to let the chart auto-scale
						timeRange === "all"
							? undefined
							: TIME_RANGES.find((r) => r.key === timeRange)?.seconds
					}
				/>

				{/* Time Range Selector - Bottom Right */}
				<div className="time-range-selector bottom-right">
					{availableTimeRanges.map((range) => (
						<button
							key={range.key}
							className={`time-range-btn ${
								timeRange === range.key ? "active" : ""
							}`}
							onClick={() => handleTimeRangeChange(range.key)}
						>
							{range.label}
						</button>
					))}
				</div>
			</div>
		</div>
	);
};

// Memoize to prevent re-renders when props haven't changed
const PredictionMarketChart = React.memo(
	PredictionMarketChartComponent,
	(prevProps, nextProps) => {
		// Only re-render if these specific values change
		const prevQuestionId =
			prevProps.questionId ||
			prevProps.activeMarket?._id ||
			prevProps.activeMarket?.questionId;
		const nextQuestionId =
			nextProps.questionId ||
			nextProps.activeMarket?._id ||
			nextProps.activeMarket?.questionId;

		const prevSecondId =
			prevProps.secondMarket?._id || prevProps.secondMarket?.questionId;
		const nextSecondId =
			nextProps.secondMarket?._id || nextProps.secondMarket?.questionId;

		if (prevQuestionId !== nextQuestionId) return false;
		if (prevSecondId !== nextSecondId) return false;

		// For orderbooks, only check if they exist, not their contents
		// The hook will handle orderbook updates internally
		if (!prevProps.questionOrderbooks && nextProps.questionOrderbooks)
			return false;

		return true; // Props are equal, skip re-render
	}
);

export default PredictionMarketChart;
