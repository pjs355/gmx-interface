import React, { useState, useEffect, useCallback } from "react";
import { useMedia } from "react-use";
import { FaChartLine } from "react-icons/fa";
import PredictionMarketChart from "./PredictionMarketChart";
import OrderbookDisplay from "components/OrderbookDisplay/OrderbookDisplay";
import { UmbrellaTradeBoxPanel } from "./UmbrellaTradeBoxPanel";
// import RulesSection from "components/RulesSection/RulesSection"; // Hidden for now (Rules / Match Winner / Show More)
import { StreamEmbed } from "./StreamEmbed";
import { Comments } from "./Comments/Comments";
import { EsportsVenueBooksPanel } from "@/components/EsportsVenueBooksPanel/EsportsVenueBooksPanel";
import { VenueOrderbooksPanel } from "@/components/VenueOrderbooksPanel/VenueOrderbooksPanel";
import { MarketHeader } from "./MarketHeader";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import type { TradingVenue } from "@/components/PredictionMarketTradeBox";
import type { SettledInfo } from "./useMatchSettled";
import {
	getMarketId,
	hasUsableOrderbookSnapshot,
	levelUpOrderbookHasRestingShares,
	resolveLevelUpOrderbookKey,
} from "./utils";
import { useUmbrellaTradePricing } from "./useUmbrellaTradePricing";
import {
	isPredictionPricingDebugEnabled,
	priceDebugLog,
} from "@/features/markets/odds-monitor/debugPredictionPricing";
import { ChartSkeleton, OrderbookSkeleton } from "./Skeletons";

type PanelsProps = {
	umbrella: Umbrella;
	titleRef: React.RefObject<HTMLHeadingElement>;
	sortedQuestions: PredictionMarket[];
	questionOrderbooks: Record<string, any>;
	activeMarket: PredictionMarket | null;
	activePosition: "yes" | "no";
	onMarketSwitch: (q: PredictionMarket, p: "yes" | "no") => void;
	onMarketSwitchWithOrderbook: (q: PredictionMarket, p: "yes" | "no") => void;
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
};

export const MarketPanels: React.FC<PanelsProps> = ({
	umbrella,
	titleRef,
	sortedQuestions,
	questionOrderbooks,
	activeMarket,
	activePosition,
	onMarketSwitch,
	onMarketSwitchWithOrderbook,
	onPositionChange,
	fetchAllOrderbooks,
	chartState,
	settledInfo,
}) => {
	/*
	 * Drives single-instance rendering of `<UmbrellaTradeBoxPanel>` below.
	 * Both layouts (`.desktop-layout` / `.mobile-layout`) live in the tree
	 * for CSS layout reasons, but the trade box renders a `Portal` curtain
	 * that escapes `display:none`, so mounting both at once stacks two
	 * curtains on the body. Render only the active viewport's instance.
	 */
	const isMobileViewport = useMedia("(max-width: 1100px)");

	// Track buy/sell side state
	const [tradeSide] = useState<"buy" | "sell">("buy");
	const [activeTab, setActiveTab] = useState<"basic" | "orderbooks">("basic");
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

	const { tradingPagePrices, pandascoreMatchId } = useUmbrellaTradePricing({
		umbrella,
	});

	const umbrellaLimitless = umbrella?.exchangeMatching?.limitless;

	const firstQuestion = sortedQuestions[0] ?? null;
	/** `PredictionMarket` `activeMarket` can lag one frame; trade box skeletons forever on null. */
	const tradeBoxActiveMarket = activeMarket ?? firstQuestion;
	const hasQuestions = sortedQuestions && sortedQuestions.length > 0;
	const settledView = Boolean(settledInfo);
	/** Same key as chart + `primaryChartOrderbook` (multiplex map); not always `resolveLevelUpOrderbookKey`. */
	const chartQuestionId =
		chartState.primaryQuestionId ||
		getMarketId(chartState.primaryMarket) ||
		(hasQuestions ? getMarketId(sortedQuestions[0]) : "");
	const primaryChartOrderbook = chartQuestionId ? questionOrderbooks[chartQuestionId] : undefined;
	const levelUpOrderbookKey = resolveLevelUpOrderbookKey(
		sortedQuestions,
		(umbrella?.exchangeMatching as { levelup?: { questionId?: string } } | undefined)?.levelup
			?.questionId ?? null,
	);
	const levelUpOrderbook = levelUpOrderbookKey
		? (questionOrderbooks[levelUpOrderbookKey] ?? null)
		: null;
	/** LevelUp line on the chart when the LevelUp book has resting shares. */
	const chartLevelUpBookHasRestingShares = levelUpOrderbookHasRestingShares(levelUpOrderbook);
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

	const defaultOrderbookContent = (
		<>
			{sortedQuestions.length > 1 && (
				<div
					className="venue-orderbooks-pill-strip venue-tab-switcher orderbook-question-pill-strip"
					role="tablist"
					aria-label="Markets"
				>
					{sortedQuestions.map((question) => {
						if (!question) return null;
						const qid = getMarketId(question) || "";
						const isActive = Boolean(activeMarket) && getMarketId(activeMarket) === qid;
						return (
							<button
								key={qid}
								type="button"
								role="tab"
								aria-selected={isActive}
								className={`venue-tab-btn${isActive ? " venue-tab-btn--active" : ""}`}
								onClick={() => onMarketSwitch(question, activePosition)}
							>
								{question.displayName || (question as any).question || "Market"}
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
						customTitle={bookMarket.displayName || (bookMarket as any).question}
						market={
							{
								...(bookMarket as any),
								umbrellaChildrenCount: umbrella?.children?.length || 0,
							} as any
						}
						umbrellaDisplayName={umbrella.displayName}
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
					<EsportsVenueBooksPanel tradingPagePrices={tradingPagePrices} />
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
						levelUpContextMarket
							? ({
									...(levelUpContextMarket as any),
									umbrellaChildrenCount: umbrella?.children?.length || 0,
								} as any)
							: undefined
					}
					umbrellaDisplayName={umbrella.displayName}
					onMarketSwitch={onMarketSwitch}
					onVenueSelect={setVenueForTradeBox}
					activePosition={activePosition}
					side={tradeSide}
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

	// Chart only needs a usable snapshot for the primary chart market; settledView does not change this condition
	const showChartBlock = hasQuestions && hasUsableOrderbookSnapshot(primaryChartOrderbook);
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
				<PredictionMarketChart
					questionId={chartQuestionId}
					umbrellaId={umbrella?._id}
					pandaMatchId={pandascoreMatchId || undefined}
					limitlessFromUmbrella={umbrellaLimitless}
					levelUpOrderbookHasRestingShares={chartLevelUpBookHasRestingShares}
					umbrellaDisplayName={umbrella?.displayName}
					activeMarket={chartPrimaryMarket}
					secondMarket={chartSecondaryMarket}
					questionOrderbooks={questionOrderbooks}
				/>
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

	const venueBooksSectionTitle =
		showCrossVenueBooks && activeTab === "orderbooks"
			? "Prediction Market Orderbooks"
			: "Prediction Market Odds";

	const predictionMarketOddsHeading =
		showChartBlock || showChartPlaceholder ? (
			<h3 className="prediction-market-odds-heading">{venueBooksSectionTitle}</h3>
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

					<div className="venue-books-container">
						{mediaTabSwitcher}
						{mediaTab === "livestream" && showStream ? streamBlock : chartAtTopOfVenueBooks}
						{tabSwitcher}
						{predictionMarketOddsHeading}
						<div className="orderbook-section">{orderbookSectionBody}</div>
					</div>

					{/* Comments Section */}
					{umbrella && (
						<Comments umbrellaId={umbrella._id} markets={sortedQuestions as PredictionMarket[]} />
					)}
				</div>

				<div className="right-panel">
					{!isMobileViewport && (
						<UmbrellaTradeBoxPanel
							umbrella={umbrella}
							questionOrderbooks={questionOrderbooks}
							activeMarket={tradeBoxActiveMarket}
							activePosition={activePosition}
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

				<div className="venue-books-container">
					{/* Chart / Livestream tab sits above the chart so users can
					    opt in to the stream rather than auto-loading it. */}
					{mediaTabSwitcher}
					{mediaTab === "livestream" && showStream ? streamBlock : chartAtTopOfVenueBooks}
					{tabSwitcher}
					{predictionMarketOddsHeading}
					<div className="orderbook-section-mobile">{orderbookSectionBody}</div>
				</div>

				{/* Comments Section */}
				{umbrella && (
					<Comments umbrellaId={umbrella._id} markets={sortedQuestions as PredictionMarket[]} />
				)}

				{/* Mobile Trading Container - Fixed at bottom */}
				<div className="mobile-trading-container">
					{isMobileViewport && (
						<UmbrellaTradeBoxPanel
							umbrella={umbrella}
							questionOrderbooks={questionOrderbooks}
							activeMarket={tradeBoxActiveMarket}
							activePosition={activePosition}
							onPositionChange={onPositionChange}
							settledInfo={settledInfo ?? null}
							tradingPagePrices={tradingPagePrices}
							venueOverride={venueForTradeBox}
						/>
					)}
				</div>
			</div>
		</div>
	);
};
