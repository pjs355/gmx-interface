import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useMedia } from "react-use";
import { usePredictionChartData } from "./usePredictionChartData";
import {
	attachBestOddsToMergedPoint,
	useMultiExchangeChartData,
} from "./useMultiExchangeChartData";
import { ExchangeOverlayChart, VENUE_COLORS, VENUE_LABELS } from "./SeriesChart";
import { getYesNoTeamLabels } from "@/features/trading/trade-box/teamLabels";
import { threeWayLegLabel } from "@/features/markets/listing/threeWayMoneyline";
import { getChartStrokeColorForDarkBg } from "@/features/markets/presentation/teamColors";
import type { TimeRange } from "./types";
import type { MergedExchangePoint } from "./types";
import { BRAND_NAME, clutchCometLogo } from "@/assets/brandLogo";
import MarketLogo from "@/components/MarketLogo/MarketLogo";
import EventStartStatus from "@/components/EventStartStatus/EventStartStatus";
import { resolveMarketLogo } from "@/features/markets/assets/marketLogoResolver";
import "./PredictionMarketChart.scss";
import {
	isPredictionPricingDebugEnabled,
	priceDebugLog,
} from "@/features/markets/odds-monitor/debugPredictionPricing";
import type { UmbrellaExchangeMatchingLimitless } from "@/services/api/umbrellaDataService";
import { isValidChartDisplayPct } from "@/features/markets/chart/chartDisplayPrice";

export interface PredictionMarketChartProps {
	questionId: string;
	umbrellaId?: string;
	/** PandaScore match id for live venue BBO overlay on the chart */
	pandaMatchId?: string;
	limitlessFromUmbrella?: UmbrellaExchangeMatchingLimitless | null;
	umbrellaDisplayName?: string;
	activeMarket?: any;
	secondMarket?: any;
	questionOrderbooks?: { [questionId: string]: any };
	className?: string;
	/** Primary chart market orderbook has resting size; drives LevelUp series + toggles on Recharts. */
	levelUpOrderbookHasRestingShares: boolean;
	/** Team A (home / YES) logo or flag for the centered match header. */
	teamALogoUrl?: string | null;
	/** Team B (away / NO) logo or flag for the centered match header. */
	teamBLogoUrl?: string | null;
	/** Kickoff time (ms) — drives the centered header's date / LIVE state. */
	eventDateMs?: number;
}

/** Same 4h post-kickoff window as the home cards / calendar. */
const LIVE_WINDOW_MS = 4 * 60 * 60 * 1000;

const TIME_RANGES: { key: TimeRange; label: string; seconds: number }[] = [
	{ key: "1h", label: "1H", seconds: 3600 },
	{ key: "1d", label: "1D", seconds: 86400 },
	// { key: "all", label: "All", seconds: Infinity }, // disabled for now — too much data
];

const CHART_HEIGHT_DESKTOP = 300;
const CHART_HEIGHT_MOBILE_LAYOUT = 220;

const DEFAULT_ENABLED = new Set(["bestOdds"]);

const PredictionMarketChartComponent: React.FC<PredictionMarketChartProps> = ({
	questionId,
	umbrellaId,
	pandaMatchId,
	limitlessFromUmbrella: _limitlessFromUmbrella,
	umbrellaDisplayName,
	activeMarket,
	secondMarket,
	questionOrderbooks,
	className = "",
	levelUpOrderbookHasRestingShares,
	teamALogoUrl,
	teamBLogoUrl,
	eventDateMs,
}) => {
	const isTradingMobileLayout = useMedia("(max-width: 1100px)");
	const chartHeight = isTradingMobileLayout ? CHART_HEIGHT_MOBILE_LAYOUT : CHART_HEIGHT_DESKTOP;

	const [timeRange, setTimeRange] = useState<TimeRange>("1d");
	const [enabledVenues, setEnabledVenues] = useState<Set<string>>(DEFAULT_ENABLED);

	const toggleVenue = useCallback((venue: string) => {
		setEnabledVenues((prev) => {
			const next = new Set(prev);
			if (next.has(venue)) next.delete(venue);
			else next.add(venue);
			return next;
		});
	}, []);

	const effectiveQuestionId = useMemo(
		() =>
			questionId || activeMarket?._id || activeMarket?.questionId || activeMarket?.marketId || "",
		[questionId, activeMarket],
	);

	const conditionId = activeMarket?.conditionId as string | undefined;

	/**
	 * 3-way moneyline (FIFA): team-B is the away leg's own YES, not the home market's
	 * NO complement. Pass the away leg's conditionId so the chart sources a second
	 * matched-market batch for the team-B series.
	 */
	const awayConditionId = useMemo<string | undefined>(() => {
		if (secondMarket?.moneylineLeg === "away") {
			const cid = (secondMarket as { conditionId?: unknown })?.conditionId;
			return typeof cid === "string" && cid.trim() !== "" ? cid : undefined;
		}
		return undefined;
	}, [secondMarket]);

	const isVsSingleMarket = useMemo(() => {
		const title = (activeMarket?.displayName || activeMarket?.question || "").trim();
		const hasVs = /\svs\.?\s/i.test(title);
		const single = (activeMarket as any)?.umbrellaChildrenCount === 1;
		return Boolean(single && hasVs);
	}, [activeMarket]);

	const { yesTeamLabel: teamAName, noTeamLabel: teamBName } = useMemo(() => {
		// 3-way moneyline (FIFA): the two lines are the home + away legs' YES series,
		// so label them by each leg's team name ("Mexico" / "South Africa"). The
		// generic Yes/No label path returns "Yes"/"No" for moneyline legs.
		if (activeMarket?.moneylineLeg === "home" && secondMarket?.moneylineLeg === "away") {
			return {
				yesTeamLabel: threeWayLegLabel(activeMarket),
				noTeamLabel: threeWayLegLabel(secondMarket),
			};
		}
		return getYesNoTeamLabels(activeMarket, umbrellaDisplayName);
	}, [activeMarket, secondMarket, umbrellaDisplayName]);

	const teamAColor: string = (activeMarket as any)?.yesColor || "#22c55e";
	const teamBColor: string =
		secondMarket?.moneylineLeg === "away"
			? ((secondMarket as any)?.yesColor as string | undefined) || "#ef4444"
			: (activeMarket as any)?.noColor || "#ef4444";

	const chartTeamAColor = useMemo(() => getChartStrokeColorForDarkBg(teamAColor), [teamAColor]);
	const chartTeamBColor = useMemo(() => getChartStrokeColorForDarkBg(teamBColor), [teamBColor]);

	const { data: levelUpChartData } = usePredictionChartData({
		questionId: effectiveQuestionId,
		activeMarket,
		secondMarket,
		questionOrderbooks,
		timeRange,
		isVsSingleMarket,
	});

	const exchangeChart = useMultiExchangeChartData({
		conditionId,
		umbrellaId,
		pandaMatchId,
		levelUpChartData,
		timeRange,
		includeLevelUp: levelUpOrderbookHasRestingShares,
		awayConditionId,
	});

	useEffect(() => {
		if (!isPredictionPricingDebugEnabled()) return;
		priceDebugLog("PredictionMarketChart", {
			effectiveQuestionId,
			umbrellaId: umbrellaId ?? null,
			pandaMatchId: pandaMatchId ?? null,
			timeRange,
			levelUpPoints: levelUpChartData.length,
			exchangeMergedPoints: exchangeChart.data.length,
			exchangeLoading: exchangeChart.loading,
			exchangeError: exchangeChart.error,
			hasLevelUp: exchangeChart.hasLevelUp,
			hasPolymarket: exchangeChart.hasPolymarket,
			hasKalshi: exchangeChart.hasKalshi,
			hasPredictFun: exchangeChart.hasPredictFun,
			hasLimitless: exchangeChart.hasLimitless,
			note: "LevelUp line: usePredictionChartData. Multi-venue / best-odds: useMultiExchangeChartData (server batch + exchange APIs + WS live overlay).",
		});
	}, [
		effectiveQuestionId,
		umbrellaId,
		pandaMatchId,
		timeRange,
		levelUpChartData.length,
		exchangeChart.data.length,
		exchangeChart.loading,
		exchangeChart.error,
		exchangeChart.hasLevelUp,
		exchangeChart.hasPolymarket,
		exchangeChart.hasKalshi,
		exchangeChart.hasPredictFun,
		exchangeChart.hasLimitless,
	]);

	useEffect(() => {
		if (levelUpOrderbookHasRestingShares) return;
		setEnabledVenues((prev) => {
			if (!prev.has("levelUp")) return prev;
			const next = new Set(prev);
			next.delete("levelUp");
			return next;
		});
	}, [levelUpOrderbookHasRestingShares]);

	useEffect(() => {
		if (!levelUpOrderbookHasRestingShares) return;
		setEnabledVenues((prev) => {
			if (prev.has("levelUp")) return prev;
			const next = new Set(prev);
			next.add("levelUp");
			return next;
		});
	}, [levelUpOrderbookHasRestingShares]);

	// Stale-while-loading: keep showing previous data while new range loads
	const staleRef = useRef<{ data: MergedExchangePoint[] }>({ data: [] });

	if (!exchangeChart.loading && exchangeChart.data.length > 0) {
		staleRef.current = { data: exchangeChart.data };
	}

	const displayData = useMemo(() => {
		const raw = exchangeChart.data.length > 0 ? exchangeChart.data : staleRef.current.data;
		return raw.map((p) => {
			if (levelUpOrderbookHasRestingShares) {
				return attachBestOddsToMergedPoint(p, true);
			}
			const { levelUp: _lu, levelUpB: _lub, ...rest } = p;
			return attachBestOddsToMergedPoint(rest as MergedExchangePoint, false);
		});
	}, [exchangeChart.data, exchangeChart.loading, levelUpOrderbookHasRestingShares]);

	/** Best odds per side (merged min-YES like the chart); fill A/B independently, then LevelUp fallback. */
	const headerBestOdds = useMemo(() => {
		let teamA: number | null = null;
		let teamB: number | null = null;
		const merged = displayData;
		for (let i = merged.length - 1; i >= 0; i--) {
			const p = merged[i];
			if (teamA === null && p?.bestOdds != null && isValidChartDisplayPct(p.bestOdds)) {
				teamA = p.bestOdds;
			}
			if (teamB === null && p?.bestOddsB != null && isValidChartDisplayPct(p.bestOddsB)) {
				teamB = p.bestOddsB;
			}
			if (teamA !== null && teamB !== null) break;
		}
		if (!levelUpOrderbookHasRestingShares) {
			return { teamA, teamB };
		}
		const lu = levelUpChartData;
		for (let i = lu.length - 1; i >= 0; i--) {
			const p = lu[i];
			if (teamA === null && p?.percentage != null && isValidChartDisplayPct(p.percentage)) {
				teamA = p.percentage;
			}
			if (teamB === null && p?.secondPercentage != null && isValidChartDisplayPct(p.secondPercentage)) {
				teamB = p.secondPercentage;
			}
			if (teamA !== null && teamB !== null) break;
		}
		return { teamA, teamB };
	}, [displayData, levelUpChartData, levelUpOrderbookHasRestingShares]);

	const availableVenues = useMemo(() => {
		const venues: string[] = ["bestOdds"];
		if (exchangeChart.hasLevelUp) venues.push("levelUp");
		if (exchangeChart.hasPolymarket) venues.push("polymarket");
		if (exchangeChart.hasKalshi) venues.push("kalshi");
		if (exchangeChart.hasPredictFun) venues.push("predictFun");
		if (exchangeChart.hasLimitless) venues.push("limitless");
		return venues;
	}, [
		exchangeChart.hasLevelUp,
		exchangeChart.hasPolymarket,
		exchangeChart.hasKalshi,
		exchangeChart.hasPredictFun,
		exchangeChart.hasLimitless,
	]);

	const marketTitle = activeMarket?.displayName || activeMarket?.question || "Market";

	/** Two-team (esports "vs" / 3-way FIFA) markets get the centered logo · date · logo header. */
	const showMatchHeader =
		Boolean(activeMarket?.moneylineLeg === "home" && secondMarket?.moneylineLeg === "away") ||
		isVsSingleMarket ||
		Boolean(secondMarket);

	const isLive = useMemo(() => {
		if (eventDateMs == null || !Number.isFinite(eventDateMs)) return false;
		const now = Date.now();
		return now >= eventDateMs && now - eventDateMs <= LIVE_WINDOW_MS;
	}, [eventDateMs]);

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

	const timeRangeSecondsForChart =
		timeRange === "all" ? undefined : TIME_RANGES.find((r) => r.key === timeRange)?.seconds;

	return (
		<div className={`prediction-market-chart ${className}`}>
			<div className={`chart-header${showMatchHeader ? " chart-header--match" : ""}`}>
				{showMatchHeader ? (
					<div className="chart-match-header">
						<div className="chart-match-team chart-match-team--a">
							{teamALogoUrl ? (
								<img
									className="chart-match-team__logo"
									src={teamALogoUrl}
									alt={teamAName}
									loading="lazy"
								/>
							) : null}
							<span className="chart-match-team__name">{teamAName}</span>
						</div>
						<div className="chart-match-center">
							{isLive ? (
								<span className="chart-match-live">
									<span className="chart-match-live__dot" />
									LIVE
								</span>
							) : eventDateMs != null && Number.isFinite(eventDateMs) ? (
								<EventStartStatus
									target={eventDateMs}
									className="chart-match-time"
									prefix="Starts In:"
									expiredLabel="Ended"
									showZeroDays={false}
									whenPast="date"
								/>
							) : null}
						</div>
						<div className="chart-match-team chart-match-team--b">
							{teamBLogoUrl ? (
								<img
									className="chart-match-team__logo"
									src={teamBLogoUrl}
									alt={teamBName}
									loading="lazy"
								/>
							) : null}
							<span className="chart-match-team__name">{teamBName}</span>
						</div>
					</div>
				) : (
					<div className="chart-titles">
						<div className="market-info primary-market">
							<h3>{marketTitle}</h3>
							{headerBestOdds.teamA != null && (
								<div className="current-price">
									<span className="price-value primary-price">
										{Math.round(headerBestOdds.teamA)}%
									</span>
								</div>
							)}
						</div>
					</div>
				)}

				<div className="chart-header-right">
					<img src={clutchCometLogo} alt={BRAND_NAME} className="chart-logo" />
				</div>
			</div>

			<div className="chart-container" style={{ minWidth: 0, minHeight: 280 }}>
				<div className="chart-plot-area">
					{exchangeChart.loading && displayData.length === 0 && (
						<div className="chart-spinner-overlay">
							<div className="chart-spinner" />
						</div>
					)}
					{exchangeChart.error && !exchangeChart.loading && displayData.length === 0 && (
						<div className="exchange-chart-empty">{exchangeChart.error}</div>
					)}
					{displayData.length > 0 && (
						<ExchangeOverlayChart
							data={displayData}
							enabledVenues={enabledVenues}
							teamAName={teamAName}
							teamBName={teamBName}
							teamAColor={chartTeamAColor}
							teamBColor={chartTeamBColor}
							height={chartHeight}
							timeRangeSeconds={timeRangeSecondsForChart}
						/>
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

				<div className="venue-checkbox-bar">
					{availableVenues.map((venue) => {
						const logoUrl = resolveMarketLogo(venue);
						const dotStyle =
							venue === "bestOdds"
								? {
										background: `linear-gradient(135deg, ${chartTeamAColor} 50%, ${chartTeamBColor} 50%)`,
									}
								: { backgroundColor: VENUE_COLORS[venue] };
						return (
							<button
								key={venue}
								className={`venue-chip${enabledVenues.has(venue) ? " active" : ""}`}
								onClick={() => toggleVenue(venue)}
							>
								{logoUrl ? (
									<MarketLogo venue={venue} size={14} className="venue-logo" />
								) : (
									<span className="venue-dot" style={dotStyle} />
								)}
								{VENUE_LABELS[venue] ?? venue}
							</button>
						);
					})}
				</div>
			</div>
		</div>
	);
};

const PredictionMarketChart = React.memo<PredictionMarketChartProps>(
	PredictionMarketChartComponent,
	(prevProps, nextProps) => {
		const prevQuestionId =
			prevProps.questionId || prevProps.activeMarket?._id || prevProps.activeMarket?.questionId;
		const nextQuestionId =
			nextProps.questionId || nextProps.activeMarket?._id || nextProps.activeMarket?.questionId;

		if (prevQuestionId !== nextQuestionId) return false;

		if (prevProps.umbrellaId !== nextProps.umbrellaId) return false;

		if (prevProps.pandaMatchId !== nextProps.pandaMatchId) return false;

		if (prevProps.levelUpOrderbookHasRestingShares !== nextProps.levelUpOrderbookHasRestingShares) {
			return false;
		}

		if (prevProps.limitlessFromUmbrella !== nextProps.limitlessFromUmbrella) return false;

		if (prevProps.activeMarket?.conditionId !== nextProps.activeMarket?.conditionId) {
			return false;
		}

		const prevSecondId = prevProps.secondMarket?._id || prevProps.secondMarket?.questionId;
		const nextSecondId = nextProps.secondMarket?._id || nextProps.secondMarket?.questionId;
		if (prevSecondId !== nextSecondId) return false;

		// Live orderbook updates drive chart tail; reference change must re-render.
		if (prevProps.questionOrderbooks !== nextProps.questionOrderbooks) return false;

		const prevHistoricalLength =
			(prevProps.activeMarket?.historicalPricesYes?.length ?? 0) ||
			(prevProps.activeMarket?.historicalPrices?.length ?? 0);
		const nextHistoricalLength =
			(nextProps.activeMarket?.historicalPricesYes?.length ?? 0) ||
			(nextProps.activeMarket?.historicalPrices?.length ?? 0);
		if (prevHistoricalLength !== nextHistoricalLength) return false;

		if (prevHistoricalLength > 0 && nextHistoricalLength > 0) {
			const prevArr =
				prevProps.activeMarket?.historicalPricesYes ?? prevProps.activeMarket?.historicalPrices;
			const nextArr =
				nextProps.activeMarket?.historicalPricesYes ?? nextProps.activeMarket?.historicalPrices;
			const prevLatest = prevArr?.[prevHistoricalLength - 1];
			const nextLatest = nextArr?.[nextHistoricalLength - 1];
			if (prevLatest?.price !== nextLatest?.price) return false;
			if (prevLatest?.ts !== nextLatest?.ts) return false;
		}

		const prevSecondHist =
			(prevProps.secondMarket?.historicalPricesYes?.length ?? 0) ||
			(prevProps.secondMarket?.historicalPrices?.length ?? 0);
		const nextSecondHist =
			(nextProps.secondMarket?.historicalPricesYes?.length ?? 0) ||
			(nextProps.secondMarket?.historicalPrices?.length ?? 0);
		if (prevSecondHist !== nextSecondHist) return false;

		if (prevSecondHist > 0 && nextSecondHist > 0) {
			const prevArr =
				prevProps.secondMarket?.historicalPricesYes ?? prevProps.secondMarket?.historicalPrices;
			const nextArr =
				nextProps.secondMarket?.historicalPricesYes ?? nextProps.secondMarket?.historicalPrices;
			const prevLatest = prevArr?.[prevSecondHist - 1];
			const nextLatest = nextArr?.[nextSecondHist - 1];
			if (prevLatest?.price !== nextLatest?.price) return false;
			if (prevLatest?.ts !== nextLatest?.ts) return false;
		}

		return true;
	},
);

export default PredictionMarketChart;
