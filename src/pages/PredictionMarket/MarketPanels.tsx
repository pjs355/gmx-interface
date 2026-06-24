import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useMedia } from "react-use";
import { FaChartLine } from "react-icons/fa";
import PredictionMarketChart from "./PredictionMarketChart";
import OrderbookDisplay from "components/OrderbookDisplay/OrderbookDisplay";
import { UmbrellaTradeBoxPanel } from "./UmbrellaTradeBoxPanel";
// import RulesSection from "components/RulesSection/RulesSection"; // Hidden for now (Rules / Match Winner / Show More)
import { StreamEmbed } from "./StreamEmbed";
// import { Comments } from "./Comments/Comments"; // Hidden for now
import { EsportsVenueBooksPanel } from "@/components/EsportsVenueBooksPanel/EsportsVenueBooksPanel";
import { VenueOrderbooksPanel } from "@/components/VenueOrderbooksPanel/VenueOrderbooksPanel";
import { MarketHeader } from "./MarketHeader";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import type { TradingVenue } from "@/components/PredictionMarketTradeBox";
import type { SettledInfo } from "./useMatchSettled";
import { getMarketId, levelUpOrderbookHasRestingShares, resolveLevelUpOrderbookKey } from "./utils";
import { useUmbrellaTradePricing } from "./useUmbrellaTradePricing";
import {
	isThreeWayMoneylineQuestions,
	orderThreeWayLegs,
	threeWayLegColor,
	threeWayLegLabel,
} from "@/features/markets/listing/threeWayMoneyline";
import {
	isMultiLegBinaryUmbrella,
	multiLegLegColor,
	multiLegLegLabel,
	multiLegSegmentFromQuestions,
	multiLegUmbrellaShortTitle,
	orderMultiLegs,
	resolveMultiLegLayout,
} from "@/features/markets/listing/multiLegMarket";
import GroupWinnerChart from "./PredictionMarketChart/GroupWinnerChart";
import { MultiLegOutcomeAccordion } from "./MultiLegOutcomeAccordion";
import { ThreeWayVenueBooksPanel } from "./ThreeWayVenueBooksPanel";
import { ThreeWayLegSelector } from "./ThreeWayLegSelector";
import { GroupWinnerVenueBooksPanel } from "./GroupWinnerVenueBooksPanel";
import { GroupWinnerLegSelector } from "./GroupWinnerLegSelector";
import { resolveTeamLogoUrl } from "@/features/markets/assets/teamLogo";
import { resolveUmbrellaEventDate } from "@/pages/Predictions/utils/eventDates";
import {
	isPredictionPricingDebugEnabled,
	priceDebugLog,
} from "@/features/markets/odds-monitor/debugPredictionPricing";
import { ChartSkeleton, OrderbookSkeleton } from "./Skeletons";
import { formatUmbrellaTitleForTradingPage } from "@/features/markets/presentation/umbrellaDisplayName";
import { resolveUmbrellaVenueKey } from "@/features/markets/pricing/venueLookupKey";
import {
	buildMatchPropLadders,
	matchPropSelectionTitle,
} from "@/features/markets/listing/matchProps";
import { MatchPropsSection } from "./MatchPropsSection";
import { EsportsLegAccordion } from "./EsportsLegAccordion";
import type { EsportsLeg } from "@/features/markets/presentation/esportsLegs";
import { usePredictionData } from "@/context/PredictionDataContext";
import { useOddsMonitor } from "@/context/OddsMonitorContext";
import { listingBestYesNoFromMatched, findMatchedByPolymarketMarketId } from "@/features/markets/listing/listingVenuePrices";
import { isCategoryAccordionLayout } from "@/features/markets/presentation/matchMarketCategories";
import type { MatchMarketCategory } from "@/features/markets/presentation/matchMarketCategories";
import { MatchMarketCategoryAccordion } from "./MatchMarketCategoryAccordion";
import { MatchCategorySectionBody } from "./MatchCategorySectionBody";

type PanelsProps = {
	umbrella: Umbrella;
	titleRef: React.RefObject<HTMLHeadingElement>;
	sortedQuestions: PredictionMarket[];
	questionOrderbooks: Record<string, any>;
	orderbooksReady: boolean;
	activeMarket: PredictionMarket | null;
	activePosition: "yes" | "no";
	/** Prop ladder title ("Mexico +1.5") when a spread/total cell is active. */
	activeSelectionTitle?: string | null;
	onMarketSwitch: (q: PredictionMarket, p: "yes" | "no", selectionTitle?: string | null) => void;
	onMarketSwitchWithOrderbook: (
		q: PredictionMarket,
		p: "yes" | "no",
		selectionTitle?: string | null,
	) => void;
	onPositionChange: (p: "yes" | "no") => void;
	fetchAllOrderbooks: (qs: PredictionMarket[]) => Promise<void>;
	chartState: {
		isInitialized: boolean;
		primaryQuestionId: string;
		primaryMarket: any;
		secondaryMarket: any | null;
		frozenOrderbooks: Record<string, any>;
	};
	settledInfo?: SettledInfo | null;
	/**
	 * When provided (multi-leg Panda esports: series + map_1 + map_2 + ...), the
	 * "Moneyline odds" heading + cross-venue table slot below the chart is
	 * replaced with a vertical {@link EsportsLegAccordion}. The chart at the top
	 * and the trade box on the right keep their normal positions — only the
	 * orderbook section's heading/body swap. Undefined for FIFA, polymarket,
	 * single-question, and series-only esports umbrellas.
	 */
	esportsLegs?: EsportsLeg[];
	/**
	 * Spread / total questions for this match (trading-page-only). Rendered as
	 * the {@link MatchPropsSection} carousel below the moneyline odds; excluded
	 * from `sortedQuestions` so the moneyline pills / 3-way detection / chart
	 * stay untouched.
	 */
	matchProps?: PredictionMarket[];
};

export const MarketPanels: React.FC<PanelsProps> = ({
	umbrella,
	titleRef,
	sortedQuestions,
	questionOrderbooks,
	orderbooksReady,
	activeMarket,
	activePosition,
	activeSelectionTitle,
	onMarketSwitch,
	onMarketSwitchWithOrderbook,
	onPositionChange,
	fetchAllOrderbooks,
	chartState,
	settledInfo,
	esportsLegs,
	matchProps,
}) => {
	const { fifaGameTeamColorBySlug } = usePredictionData();
	const { appState } = useOddsMonitor();
	/**
	 * True when this umbrella renders the multi-leg esports accordion (series +
	 * 1+ map legs). The accordion replaces only the moneyline-odds slot below
	 * the chart; everything else (chart, trade box, comments) stays in place.
	 */
	const isMultiLegEsports = Array.isArray(esportsLegs) && esportsLegs.length > 1;
	/*
	 * Drives single-instance rendering of `<UmbrellaTradeBoxPanel>` below.
	 * Both layouts (`.desktop-layout` / `.mobile-layout`) live in the tree
	 * for CSS layout reasons, but the trade box renders a `Portal` curtain
	 * that escapes `display:none`, so mounting both at once stacks two
	 * curtains on the body. Render only the active viewport's instance.
	 */
	const isMobileViewport = useMedia("(max-width: 1100px)");

	const umbrellaTradingTitle = useMemo(
		() => formatUmbrellaTitleForTradingPage(umbrella),
		[umbrella.displayName, umbrella.game],
	);

	// Track buy/sell side state
	const [tradeSide] = useState<"buy" | "sell">("buy");
	const [activeTab, setActiveTab] = useState<"basic" | "orderbooks">("basic");
	const [categoryTabs, setCategoryTabs] = useState<
		Record<MatchMarketCategory, "basic" | "orderbooks">
	>({
		moneyline: "basic",
		spread: "basic",
		total: "basic",
	});
	const [venueForTradeBox, setVenueForTradeBox] = useState<TradingVenue | undefined>(undefined);
	/** Default to chart so the stream iframe doesn't auto-load on page open.
	 * The embed only mounts when the user selects Livestream (desktop + mobile). */
	const [mediaTab, setMediaTab] = useState<"chart" | "livestream">("chart");

	const selectVenueBooksTab = useCallback((tab: "basic" | "orderbooks") => {
		setActiveTab(tab);
		if (tab === "basic") {
			setVenueForTradeBox("all");
		}
	}, []);

	const umbrellaLimitless = umbrella?.exchangeMatching?.limitless;

	const firstQuestion = sortedQuestions[0] ?? null;
	/** `PredictionMarket` `activeMarket` can lag one frame; trade box skeletons forever on null. */
	const tradeBoxActiveMarket = activeMarket ?? firstQuestion;

	const chartPinnedPrimaryMarket = chartState.primaryMarket as PredictionMarket | null | undefined;
	/** Chart venue key is pinned to the moneyline home/series leg — never the active pill. */
	const chartVenueKey = useMemo(
		() => resolveUmbrellaVenueKey(umbrella, chartPinnedPrimaryMarket ?? null),
		[umbrella, chartState.primaryQuestionId],
	);

	const { tradingPagePrices, pandascoreMatchId } = useUmbrellaTradePricing({
		umbrella,
		activeQuestion: tradeBoxActiveMarket,
	});
	const hasQuestions = sortedQuestions && sortedQuestions.length > 0;
	const settledView = Boolean(settledInfo);
	/** Same key as chart multiplex map; not always `resolveLevelUpOrderbookKey`. */
	const chartQuestionId =
		chartState.primaryQuestionId ||
		getMarketId(chartState.primaryMarket) ||
		(hasQuestions ? getMarketId(sortedQuestions[0]) : "");
	const exchangeMatchingLevelupQuestionId =
		(umbrella?.exchangeMatching as { levelup?: { questionId?: string } } | undefined)?.levelup
			?.questionId ?? null;
	const levelUpOrderbookKey = resolveLevelUpOrderbookKey(
		sortedQuestions,
		exchangeMatchingLevelupQuestionId,
	);
	const levelUpOrderbook = levelUpOrderbookKey
		? (questionOrderbooks[levelUpOrderbookKey] ?? null)
		: null;
	/** Chart pins to moneyline markets from `chartState`, not the active map/prop leg. */
	const chartMarketsForLevelUp = useMemo(() => {
		const markets: PredictionMarket[] = [];
		if (chartState.primaryMarket) markets.push(chartState.primaryMarket as PredictionMarket);
		if (chartState.secondaryMarket) markets.push(chartState.secondaryMarket as PredictionMarket);
		return markets.length > 0 ? markets : sortedQuestions;
	}, [chartState.primaryMarket, chartState.secondaryMarket, sortedQuestions]);
	const chartLevelUpOrderbookKey = resolveLevelUpOrderbookKey(
		chartMarketsForLevelUp,
		exchangeMatchingLevelupQuestionId,
	);
	const chartLevelUpOrderbook = chartLevelUpOrderbookKey
		? (questionOrderbooks[chartLevelUpOrderbookKey] ?? null)
		: null;
	/** LevelUp line on the chart when the moneyline LevelUp book has resting shares. */
	const chartLevelUpBookHasRestingShares = levelUpOrderbookHasRestingShares(chartLevelUpOrderbook);
	const levelUpContextMarket =
		(levelUpOrderbookKey
			? sortedQuestions.find((q) => getMarketId(q) === levelUpOrderbookKey)
			: null) ?? firstQuestion;
	const showCrossVenueBooks = Boolean(pandascoreMatchId);
	const streamUrl = typeof umbrella?.streamUrl === "string" ? umbrella.streamUrl : "";
	const showStream = Boolean(umbrella?.streamEnabled) && streamUrl.length > 0;

	useEffect(() => {
		if (!isPredictionPricingDebugEnabled()) return;
		priceDebugLog("MarketPanels venue / tab state", {
			pandascoreMatchId: pandascoreMatchId || null,
			activeTab,
			showCrossVenueBooks,
			tradingPageSource: tradingPagePrices.source,
			tradingPageBestYes: tradingPagePrices.bestYesPrice,
			tradingPageBestNo: tradingPagePrices.bestNoPrice,
			note: "Basic tab = EsportsVenueBooksPanel; Orderbooks = VenueOrderbooksPanel (MatchedMarket + multiplex LevelUp orderbook).",
		});
	}, [
		pandascoreMatchId,
		activeTab,
		showCrossVenueBooks,
		tradingPagePrices.source,
		tradingPagePrices.bestYesPrice,
		tradingPagePrices.bestNoPrice,
	]);

	// Debug: Uncomment to track MarketPanels re-renders
	// console.log("🎬 MarketPanels rendering", {
	// 	chartPrimaryId: chartState.primaryQuestionId,
	// 	sortedQuestionsLength: sortedQuestions?.length || 0,
	// 	hasQuestions,
	// });

	// Memoize the chart market objects to prevent recreating them on every render
	const chartPrimaryMarket = React.useMemo(() => {
		return chartState.primaryMarket
			? {
					...(chartState.primaryMarket as any),
					umbrellaChildrenCount: umbrella?.children?.length || 0,
				}
			: undefined;
	}, [chartState.primaryMarket, umbrella?.children?.length]);

	const chartSecondaryMarket = React.useMemo(() => {
		return chartState.secondaryMarket
			? {
					...(chartState.secondaryMarket as any),
					umbrellaChildrenCount: umbrella?.children?.length || 0,
				}
			: undefined;
	}, [chartState.secondaryMarket, umbrella?.children?.length]);

	const chartSecondaryQuestionId =
		chartState.secondaryQuestionId ||
		(chartSecondaryMarket ? getMarketId(chartSecondaryMarket) : "");

	/** Only moneyline chart markets — spread clicks must not pass the full orderbook map. */
	const chartPinnedOrderbooks = React.useMemo(() => {
		const pinned: Record<string, unknown> = {};
		if (chartQuestionId && questionOrderbooks[chartQuestionId] != null) {
			pinned[chartQuestionId] = questionOrderbooks[chartQuestionId];
		}
		if (chartSecondaryQuestionId && questionOrderbooks[chartSecondaryQuestionId] != null) {
			pinned[chartSecondaryQuestionId] = questionOrderbooks[chartSecondaryQuestionId];
		}
		return pinned;
	}, [
		chartQuestionId,
		chartSecondaryQuestionId,
		questionOrderbooks[chartQuestionId],
		questionOrderbooks[chartSecondaryQuestionId],
	]);

	/**
	 * Team visuals + kickoff for the centered chart match header (logo · date ·
	 * logo). 3-way (FIFA) legs carry their own flag on `question.image`; esports
	 * "vs" markets resolve from the umbrella's team mappings (mapping[0] = YES =
	 * team A, mapping[1] = NO = team B), matching the chart's Yes/No labels.
	 */
	const chartHeaderTeams = React.useMemo(() => {
		const isThreeWay = isThreeWayMoneylineQuestions(sortedQuestions);
		let teamALogoUrl: string | null = null;
		let teamBLogoUrl: string | null = null;
		if (isThreeWay) {
			const a = (chartPrimaryMarket as { image?: unknown } | undefined)?.image;
			const b = (chartSecondaryMarket as { image?: unknown } | undefined)?.image;
			teamALogoUrl = typeof a === "string" && a.trim() !== "" ? a.trim() : null;
			teamBLogoUrl = typeof b === "string" && b.trim() !== "" ? b.trim() : null;
		} else {
			const mappings = umbrella?.teamMappings;
			if (Array.isArray(mappings)) {
				teamALogoUrl = resolveTeamLogoUrl(mappings[0]) ?? null;
				teamBLogoUrl = resolveTeamLogoUrl(mappings[1]) ?? null;
			}
		}
		const eventDate = umbrella ? resolveUmbrellaEventDate(umbrella) : null;
		return {
			teamALogoUrl,
			teamBLogoUrl,
			eventDateMs: eventDate ? eventDate.getTime() : null,
		};
	}, [sortedQuestions, chartPrimaryMarket, chartSecondaryMarket, umbrella]);

	const tabSwitcher =
		showCrossVenueBooks && !settledView ? (
			<div className="venue-tab-switcher">
				<button
					className={`venue-tab-btn${activeTab === "basic" ? " venue-tab-btn--active" : ""}`}
					onClick={() => selectVenueBooksTab("basic")}
				>
					Basic
				</button>
				<button
					className={`venue-tab-btn${activeTab === "orderbooks" ? " venue-tab-btn--active" : ""}`}
					onClick={() => selectVenueBooksTab("orderbooks")}
				>
					Orderbooks
				</button>
			</div>
		) : null;

	const bookMarket = activeMarket ?? sortedQuestions[0] ?? null;
	const bookMarketId = bookMarket ? getMarketId(bookMarket) || "" : "";

	/** Spread / totals ladders for the carousel below the moneyline section. */
	const matchPropLadders = useMemo(
		() => buildMatchPropLadders(matchProps ?? [], umbrella?.teamMappings),
		[matchProps, umbrella?.teamMappings],
	);

	const useCategoryAccordion = isCategoryAccordionLayout(
		sortedQuestions,
		matchPropLadders,
		isMultiLegEsports,
	);

	/** 3-way moneyline (FIFA): order the order-book tabs home/away/draw and label
	 * each by its short outcome name ("Korea" / "Czechia" / "Draw"). */
	const isThreeWay = isThreeWayMoneylineQuestions(sortedQuestions);
	/** FIFA NegRisk multi-outcome (groups, futures, awards). */
	const isMultiLegNegRisk = isMultiLegBinaryUmbrella(sortedQuestions);
	const multiLegSegment = multiLegSegmentFromQuestions(sortedQuestions);
	const multiLegLayout = multiLegSegment ? resolveMultiLegLayout(multiLegSegment) : undefined;
	const useMultiLegAccordion =
		isMultiLegNegRisk && multiLegLayout !== undefined && multiLegLayout.homeTopN !== "all";

	/** Futures/awards accordion: chart + Basic odds follow the active leg only. */
	const multiLegActiveChartQuestionId =
		useMultiLegAccordion && bookMarketId ? bookMarketId : chartQuestionId;
	const multiLegActiveChartVenueKey = useMemo(
		() => (useMultiLegAccordion ? resolveUmbrellaVenueKey(umbrella, bookMarket) : chartVenueKey),
		[useMultiLegAccordion, umbrella, bookMarket, bookMarketId, chartVenueKey],
	);
	const multiLegActiveChartOrderbooks = useMemo(() => {
		if (!useMultiLegAccordion || !multiLegActiveChartQuestionId) return chartPinnedOrderbooks;
		const ob = questionOrderbooks[multiLegActiveChartQuestionId];
		return ob != null ? { [multiLegActiveChartQuestionId]: ob } : {};
	}, [
		useMultiLegAccordion,
		multiLegActiveChartQuestionId,
		questionOrderbooks,
		chartPinnedOrderbooks,
	]);
	const multiLegActiveChartMarket = useMemo(() => {
		if (!useMultiLegAccordion || !bookMarket) return chartPrimaryMarket;
		return {
			...(bookMarket as any),
			umbrellaChildrenCount: umbrella?.children?.length || 0,
		};
	}, [useMultiLegAccordion, bookMarket, chartPrimaryMarket, umbrella?.children?.length]);

	/** Both 3-way moneyline and NegRisk share the multi-leg YES UI. */
	const isMultiLeg = isThreeWay || isMultiLegNegRisk;
	const pillQuestions = useMemo(() => {
		if (isMultiLegNegRisk && multiLegLayout) {
			const yesPriceByMarketId = new Map<string, number>();
			for (const q of sortedQuestions) {
				const id = typeof q.polymarketMarketId === "string" ? q.polymarketMarketId.trim() : "";
				if (!id) continue;
				const matched = findMatchedByPolymarketMarketId(appState?.markets, id);
				if (!matched) continue;
				const { yes } = listingBestYesNoFromMatched(matched);
				if (typeof yes === "number" && Number.isFinite(yes)) {
					yesPriceByMarketId.set(id, yes);
				}
			}
			return orderMultiLegs(sortedQuestions, multiLegLayout, yesPriceByMarketId);
		}
		if (isThreeWay) return orderThreeWayLegs(sortedQuestions);
		return sortedQuestions;
	}, [isMultiLegNegRisk, multiLegLayout, sortedQuestions, isThreeWay, appState?.markets]);

	const legLabelFor = (question: PredictionMarket, _index: number): string =>
		isMultiLegNegRisk ? multiLegLegLabel(question) : threeWayLegLabel(question);
	const legColorFor = (question: PredictionMarket, index: number): string =>
		isMultiLegNegRisk
			? multiLegLegColor(question, index, umbrella.teamMappings, fifaGameTeamColorBySlug)
			: threeWayLegColor(question, fifaGameTeamColorBySlug);

	/** Multi-leg (FIFA) leg selector for the Orderbooks tab: per-outcome buttons
	 * that replace the orderbook's Yes/No tabs. Selecting a leg switches the active
	 * market to that leg's YES book (and YES bet in the trade box). */
	const multiLegOutcomeTabs =
		isMultiLeg && !useMultiLegAccordion && pillQuestions.length > 1
			? pillQuestions
					.filter((q): q is PredictionMarket => Boolean(q))
					.map((question, index) => {
						const qid = getMarketId(question) || "";
						return {
							id: qid,
							label: legLabelFor(question, index),
							active: qid === bookMarketId,
							onSelect: () => onMarketSwitch(question, "yes"),
							color: legColorFor(question, index),
						};
					})
			: undefined;

	const defaultOrderbookContent = (
		<>
			{sortedQuestions.length > 1 && (
				<div
					className="venue-orderbooks-pill-strip venue-tab-switcher orderbook-question-pill-strip"
					role="tablist"
					aria-label="Markets"
				>
					{pillQuestions.map((question, index) => {
						if (!question) return null;
						const qid = getMarketId(question) || "";
						const isActive = Boolean(activeMarket) && getMarketId(activeMarket) === qid;
						const pillLabel = isMultiLeg
							? legLabelFor(question, index)
							: question.displayName || (question as any).question || "Market";
						return (
							<button
								key={qid}
								type="button"
								role="tab"
								aria-selected={isActive}
								className={`venue-tab-btn${isActive ? " venue-tab-btn--active" : ""}`}
								onClick={() => onMarketSwitch(question, activePosition)}
							>
								{pillLabel}
							</button>
						);
					})}
				</div>
			)}
			{bookMarket && (
				<div key={bookMarketId} className="question-orderbook">
					<OrderbookDisplay
						layout="embedded"
						orderbook={questionOrderbooks[bookMarketId]}
						loading={!questionOrderbooks[bookMarketId]}
						error={null}
						onRefresh={() => fetchAllOrderbooks(sortedQuestions)}
						customTitle={
							(bookMarket as { marketType?: unknown }).marketType === "spread" ||
							(bookMarket as { marketType?: unknown }).marketType === "total"
								? matchPropSelectionTitle(bookMarket, activePosition, umbrella?.teamMappings)
								: activeSelectionTitle?.trim() ||
									(isMultiLeg
										? legLabelFor(bookMarket, 0)
										: bookMarket.displayName || (bookMarket as any).question)
						}
						umbrellaTeamMappings={umbrella?.teamMappings}
						market={
							{
								...(bookMarket as any),
								umbrellaChildrenCount: umbrella?.children?.length || 0,
							} as any
						}
						umbrellaDisplayName={umbrellaTradingTitle}
						onMarketSwitch={onMarketSwitch}
						onMarketSwitchWithOrderbook={onMarketSwitchWithOrderbook}
						isActiveMarket
						activePosition={activePosition}
						isCollapsed={false}
						side={tradeSide}
						wholeContractRestingBook
					/>
				</div>
			)}
		</>
	);

	const orderbookColumnContent = settledView ? null : showCrossVenueBooks ? ( // <RulesSection umbrella={umbrella} />
		activeTab === "basic" ? (
			<>
				<div className="orderbook-section__cross-venue">
					{isMultiLegNegRisk ? (
						useMultiLegAccordion ? (
							<EsportsVenueBooksPanel
								tradingPagePrices={tradingPagePrices}
								teamAOverride={bookMarket ? multiLegLegLabel(bookMarket) : undefined}
								teamBOverride="No"
							/>
						) : (
							<GroupWinnerVenueBooksPanel
								legs={pillQuestions}
								teamMappings={umbrella.teamMappings}
								gameTeamColorBySlug={fifaGameTeamColorBySlug}
							/>
						)
					) : isThreeWay ? (
						/* FIFA 3-way: esports Basic table with a third outcome column
						   (Team A / Team B / Draw), each venue's best YES per leg. */
						<ThreeWayVenueBooksPanel legs={pillQuestions} teamMappings={umbrella.teamMappings} />
					) : (
						<EsportsVenueBooksPanel tradingPagePrices={tradingPagePrices} />
					)}
				</div>
				{/* <RulesSection umbrella={umbrella} /> */}
			</>
		) : (
			<>
				<VenueOrderbooksPanel
					pandascoreMatchId={pandascoreMatchId}
					umbrellaId={umbrella._id}
					limitlessFromUmbrella={umbrellaLimitless}
					levelUpOrderbook={levelUpOrderbook}
					market={
						bookMarket
							? ({
									...(bookMarket as any),
									umbrellaChildrenCount: umbrella?.children?.length || 0,
								} as any)
							: undefined
					}
					umbrellaDisplayName={umbrellaTradingTitle}
					umbrellaTeamMappings={umbrella?.teamMappings}
					onMarketSwitch={onMarketSwitch}
					onVenueSelect={setVenueForTradeBox}
					activePosition={activePosition}
					side={tradeSide}
					outcomeTabs={multiLegOutcomeTabs}
					hideOutcomeTabs={isMultiLegEsports || useMultiLegAccordion}
				/>
				{/* <RulesSection umbrella={umbrella} /> */}
			</>
		)
	) : (
		defaultOrderbookContent
	);

	const orderbookSectionBody =
		settledView || hasQuestions ? (
			orderbookColumnContent
		) : (
			<>
				<OrderbookSkeleton />
				<OrderbookSkeleton />
			</>
		);

	// Latch chart visibility once multiplex WS is ready — prop/spread selection must not flash skeleton.
	const chartVisibleLatchRef = React.useRef(false);
	const chartLatchKeyRef = React.useRef("");
	const chartLatchKey = useMultiLegAccordion
		? `${umbrella?._id ?? ""}:${multiLegActiveChartQuestionId}`
		: `${umbrella?._id ?? ""}:${chartQuestionId}`;
	if (chartLatchKeyRef.current !== chartLatchKey) {
		chartLatchKeyRef.current = chartLatchKey;
		chartVisibleLatchRef.current = false;
	}
	if (hasQuestions && orderbooksReady) {
		chartVisibleLatchRef.current = true;
	}
	const showChartBlock =
		hasQuestions && (chartVisibleLatchRef.current || orderbooksReady);
	const showChartPlaceholder = !showChartBlock && !(settledView && !hasQuestions);

	// Order inside .venue-books-container: chart → tabs → "Prediction Market Odds" → tab body (e.g. esports table).
	const chartAtTopOfVenueBooks = showChartBlock ? (
		<div
			className="ExchangeChart venue-books-chart"
			style={{
				display: "flex",
				flexDirection: "column",
				minHeight: 300,
			}}
		>
			<div
				className="prediction-market-chart-shell flex grow flex-col overflow-visible rounded-4 bg-black"
				style={{ minHeight: 300 }}
			>
				{isMultiLegNegRisk ? (
					useMultiLegAccordion && bookMarket ? (
						<PredictionMarketChart
							questionId={multiLegActiveChartQuestionId}
							umbrellaId={umbrella?._id}
							pandaMatchId={multiLegActiveChartVenueKey || undefined}
							limitlessFromUmbrella={umbrellaLimitless}
							levelUpOrderbookHasRestingShares={false}
							umbrellaDisplayName={umbrellaTradingTitle}
							activeMarket={multiLegActiveChartMarket}
							secondMarket={null}
							questionOrderbooks={multiLegActiveChartOrderbooks}
						/>
					) : (
						<GroupWinnerChart
							legs={pillQuestions}
							teamMappings={umbrella.teamMappings}
							gameTeamColorBySlug={fifaGameTeamColorBySlug}
							chartTopN={multiLegLayout?.chartTopN ?? "all"}
							title={(() => {
								const short = multiLegUmbrellaShortTitle(pillQuestions);
								if (!short) return undefined;
								return multiLegSegment?.startsWith("group_") ? `${short} Winner` : short;
							})()}
						/>
					)
				) : (
					<PredictionMarketChart
						questionId={chartQuestionId}
						umbrellaId={umbrella?._id}
						pandaMatchId={chartVenueKey || undefined}
						limitlessFromUmbrella={umbrellaLimitless}
						levelUpOrderbookHasRestingShares={chartLevelUpBookHasRestingShares}
						umbrellaDisplayName={umbrellaTradingTitle}
						activeMarket={chartPrimaryMarket}
						secondMarket={chartSecondaryMarket}
						questionOrderbooks={chartPinnedOrderbooks}
						teamALogoUrl={chartHeaderTeams.teamALogoUrl}
						teamBLogoUrl={chartHeaderTeams.teamBLogoUrl}
						eventDateMs={chartHeaderTeams.eventDateMs ?? undefined}
					/>
				)}
			</div>
		</div>
	) : showChartPlaceholder ? (
		<div
			className="ExchangeChart venue-books-chart venue-books-chart-skeleton"
			style={{
				display: "flex",
				flexDirection: "column",
				minHeight: 300,
			}}
		>
			<div
				className="prediction-market-chart-shell flex grow flex-col overflow-visible rounded-4 bg-black"
				style={{ minHeight: 300 }}
			>
				<ChartSkeleton />
			</div>
		</div>
	) : null;

	const venueBooksOddsNoun = isMultiLegNegRisk ? "Outcomes" : "Moneyline";
	const venueBooksSectionTitle =
		showCrossVenueBooks && activeTab === "orderbooks"
			? `${venueBooksOddsNoun} orderbooks`
			: `${venueBooksOddsNoun} odds`;

	/** Multi-leg (FIFA) Basic view: inline outcome selector beside the heading so
	 * the user can flip outcomes without opening the Orderbooks tab. */
	const showMultiLegBasicSelector = isMultiLeg && activeTab === "basic" && pillQuestions.length > 1;

	const predictionMarketOddsHeading =
		showChartBlock || showChartPlaceholder ? (
			showMultiLegBasicSelector ? (
				<div className="prediction-market-odds-heading-row">
					<h3 className="prediction-market-odds-heading">{venueBooksSectionTitle}</h3>
					{isMultiLegNegRisk && !useMultiLegAccordion ? (
						<GroupWinnerLegSelector
							legs={pillQuestions}
							teamMappings={umbrella.teamMappings}
							gameTeamColorBySlug={fifaGameTeamColorBySlug}
							activeMarketId={bookMarketId}
							onSelect={(q) => onMarketSwitch(q, "yes")}
						/>
					) : (
						<ThreeWayLegSelector
							legs={pillQuestions}
							activeMarketId={bookMarketId}
							onSelect={(q) => onMarketSwitch(q, "yes")}
							teamMappings={umbrella.teamMappings}
						/>
					)}
				</div>
			) : // Multi-leg esports mode renders the accordion which already shows
			// the leg label in its section header, so the duplicate
			// "Moneyline odds" h3 inside the body is suppressed.
			isMultiLegEsports ? null : (
				<h3 className="prediction-market-odds-heading">{venueBooksSectionTitle}</h3>
			)
		) : null;

	/* Chart / Livestream toggle when this umbrella has a stream URL. */
	const mediaTabSwitcher = showStream ? (
		<div className="media-tab-switcher" role="tablist" aria-label="Chart or livestream">
			<button
				type="button"
				role="tab"
				aria-selected={mediaTab === "chart"}
				className={`media-tab-btn${mediaTab === "chart" ? " media-tab-btn--active" : ""}`}
				onClick={() => setMediaTab("chart")}
			>
				<FaChartLine className="media-tab-btn__icon" aria-hidden="true" />
				<span>Chart</span>
			</button>
			<button
				type="button"
				role="tab"
				aria-selected={mediaTab === "livestream"}
				className={`media-tab-btn${mediaTab === "livestream" ? " media-tab-btn--active" : ""}`}
				onClick={() => setMediaTab("livestream")}
			>
				<span className="media-tab-btn__live-dot" aria-hidden="true" />
				<span>Livestream</span>
			</button>
		</div>
	) : null;

	const streamBlock = showStream ? (
		<div className="venue-books-stream">
			<StreamEmbed streamUrl={streamUrl} height={isMobileViewport ? "360" : "720"} />
		</div>
	) : null;

	const renderCategorySectionBody = useCallback(
		(category: MatchMarketCategory) => (
			<MatchCategorySectionBody
				category={category}
				umbrella={umbrella}
				umbrellaTradingTitle={umbrellaTradingTitle}
				moneylineLegs={pillQuestions}
				ladders={matchPropLadders}
				sortedQuestions={sortedQuestions}
				questionOrderbooks={questionOrderbooks}
				activeMarket={activeMarket}
				activePosition={activePosition}
				activeSelectionTitle={activeSelectionTitle}
				activeTab={categoryTabs[category]}
				onTabChange={(tab) => setCategoryTabs((prev) => ({ ...prev, [category]: tab }))}
				onMarketSwitch={onMarketSwitch}
				onMarketSwitchWithOrderbook={onMarketSwitchWithOrderbook}
				fetchAllOrderbooks={fetchAllOrderbooks}
				settledView={settledView}
				fifaGameTeamColorBySlug={fifaGameTeamColorBySlug}
				onVenueSelect={setVenueForTradeBox}
			/>
		),
		[
			umbrella,
			umbrellaTradingTitle,
			pillQuestions,
			matchPropLadders,
			sortedQuestions,
			questionOrderbooks,
			activeMarket,
			activePosition,
			activeSelectionTitle,
			categoryTabs,
			onMarketSwitch,
			onMarketSwitchWithOrderbook,
			fetchAllOrderbooks,
			settledView,
			fifaGameTeamColorBySlug,
		],
	);

	const renderVenueBooksContainer = (orderbookSectionClass: string) => (
		<div className="venue-books-container">
			{mediaTabSwitcher}
			{mediaTab === "livestream" && showStream ? streamBlock : chartAtTopOfVenueBooks}
			{useCategoryAccordion ? (
				<MatchMarketCategoryAccordion
					moneylineLegs={pillQuestions}
					ladders={matchPropLadders}
					teamMappings={umbrella?.teamMappings}
					activeMarket={activeMarket}
					activeMarketId={bookMarketId}
					activePosition={activePosition}
					onMoneylineSelect={(q) => onMarketSwitch(q, "yes")}
					onPropSelect={onMarketSwitch}
					renderSectionBody={renderCategorySectionBody}
				/>
			) : useMultiLegAccordion && multiLegLayout ? (
				<MultiLegOutcomeAccordion
					umbrella={umbrella}
					legs={pillQuestions}
					layout={multiLegLayout}
					teamMappings={umbrella?.teamMappings}
					gameTeamColorBySlug={fifaGameTeamColorBySlug}
					activeMarket={activeMarket}
					activePosition={activePosition}
					onMarketSwitch={onMarketSwitch}
					onPositionChange={onPositionChange}
				>
					{tabSwitcher}
					{predictionMarketOddsHeading}
					<div className={orderbookSectionClass}>{orderbookSectionBody}</div>
				</MultiLegOutcomeAccordion>
			) : isMultiLegEsports && esportsLegs ? (
				/*
				 * Multi-leg esports: render the vertical leg accordion in the same
				 * slot where the moneyline-odds heading + cross-venue table would
				 * normally live. The chart above stays on series moneyline odds;
				 * the trade box on the right follows the expanded leg. Each
				 * accordion section's expanded body re-renders the standard
				 * orderbook section (Basic/Orderbooks tabs + body) for the
				 * currently active leg.
				 */
				<EsportsLegAccordion
					umbrella={umbrella}
					legs={esportsLegs}
					activeMarket={activeMarket}
					activePosition={activePosition}
					onMarketSwitch={onMarketSwitch}
					onPositionChange={onPositionChange}
				>
					{tabSwitcher}
					{predictionMarketOddsHeading}
					<div className={orderbookSectionClass}>{orderbookSectionBody}</div>
				</EsportsLegAccordion>
			) : (
				<>
					{tabSwitcher}
					{predictionMarketOddsHeading}
					<div className={orderbookSectionClass}>{orderbookSectionBody}</div>
					{/* Spreads + goal totals carousel — selecting a cell routes that
					    market + side into the trade box exactly like a moneyline leg. */}
					{!settledView && matchPropLadders.length > 0 ? (
						<MatchPropsSection
							ladders={matchPropLadders}
							activeMarketId={bookMarketId}
							activePosition={activePosition}
							onSelect={onMarketSwitch}
						/>
					) : null}
				</>
			)}
		</div>
	);

	return (
		<div className="prediction-market-content">
			{/* Desktop Layout */}
			<div className="desktop-layout">
				<div className="left-panel">
					{/* Sit the umbrella header inside the left column so the
					    sticky trade box on the right starts at the same Y as
					    the header (matches the home-page layout) instead of
					    being pushed down by a full-width black bar. */}
					{umbrella && <MarketHeader umbrella={umbrella} titleRef={titleRef} />}

					{renderVenueBooksContainer("orderbook-section")}

					{/* Comments Section — hidden for now
					{umbrella && (
						<Comments umbrellaId={umbrella._id} markets={sortedQuestions as PredictionMarket[]} />
					)}
					*/}
				</div>

				<div className="right-panel">
					{!isMobileViewport && (
						<UmbrellaTradeBoxPanel
							umbrella={umbrella}
							questionOrderbooks={questionOrderbooks}
							activeMarket={tradeBoxActiveMarket}
							activePosition={activePosition}
							selectionTitleOverride={activeSelectionTitle}
							onPositionChange={onPositionChange}
							settledInfo={settledInfo ?? null}
							tradingPagePrices={tradingPagePrices}
							venueOverride={venueForTradeBox}
						/>
					)}
				</div>
			</div>

			{/* Mobile Layout */}
			<div className="mobile-layout">
				{/* Single-column on mobile, so the header sits at the very top
				    of the stack as the page title. */}
				{umbrella && <MarketHeader umbrella={umbrella} titleRef={titleRef} />}

				{/* Chart / Livestream tab sits above the chart so users can
				    opt in to the stream rather than auto-loading it. */}
				{renderVenueBooksContainer("orderbook-section-mobile")}

				{/* Comments Section — hidden for now
				{umbrella && (
					<Comments umbrellaId={umbrella._id} markets={sortedQuestions as PredictionMarket[]} />
				)}
				*/}

				{/* Mobile Trading Container - Fixed at bottom */}
				<div
					className={`mobile-trading-container${isThreeWay ? " mobile-trading-container--peek-hidden" : ""}`}
				>
					{isMobileViewport && (
						<UmbrellaTradeBoxPanel
							umbrella={umbrella}
							questionOrderbooks={questionOrderbooks}
							activeMarket={tradeBoxActiveMarket}
							activePosition={activePosition}
							selectionTitleOverride={activeSelectionTitle}
							onPositionChange={onPositionChange}
							settledInfo={settledInfo ?? null}
							tradingPagePrices={tradingPagePrices}
							venueOverride={venueForTradeBox}
							mobilePeekBar={isThreeWay ? "hidden" : "default"}
						/>
					)}
				</div>
			</div>
		</div>
	);
};
