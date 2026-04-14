import React, { useState, useEffect } from "react";
import { useMedia } from "react-use";
import PredictionMarketChart from "./PredictionMarketChart";
import OrderbookDisplay from "components/OrderbookDisplay/OrderbookDisplay";
import PredictionMarketTradeBox from "./PredictionMarketTradeBox/PredictionMarketTradeBox";
import RulesSection from "components/RulesSection/RulesSection";
import { StreamEmbed } from "./StreamEmbed";
import { Comments } from "./Comments/Comments";
import { EsportsVenueBooksPanel } from "@/components/EsportsVenueBooksPanel/EsportsVenueBooksPanel";
import { VenueOrderbooksPanel } from "@/components/VenueOrderbooksPanel/VenueOrderbooksPanel";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import type { TradingVenue } from "./PredictionMarketTradeBox/types";
import type { SettledInfo } from "./useMatchSettled";
import { getMarketId, hasUsableOrderbookSnapshot } from "./utils";
import { useOddsMonitor } from "@/context/OddsMonitorContext";
import { useVenuePandaSubscription } from "@/context/VenuePandaSubscriptionContext";
import { useDirectVenueBooks } from "@/trading/venue-books";
import { getDflowKalshiMonitorLink } from "@/trading/dflow/monitorDflowBooks";
import type { OrderbookData } from "@/types/odds-monitor";
import { useTradingPagePrices } from "@/hooks/useTradingPagePrices";
import { findOddsMatchedMarket } from "@/utils/findOddsMatchedMarket";
import { isPredictionPricingDebugEnabled, priceDebugLog } from "@/utils/debugPredictionPricing";
import {
	ChartSkeleton,
	TradeBoxSkeleton,
	OrderbookSkeleton,
} from "./Skeletons";

type PanelsProps = {
	umbrella: Umbrella;
	sortedQuestions: PredictionMarket[];
	questionOrderbooks: Record<string, any>;
	activeMarket: PredictionMarket | null;
	activePosition: "yes" | "no";
	openOrderbookId: string | null;
	onMarketSwitch: (q: PredictionMarket, p: "yes" | "no") => void;
	onMarketSwitchWithOrderbook: (q: PredictionMarket, p: "yes" | "no") => void;
	onOrderbookToggle: (marketId: string) => void;
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
	sortedQuestions,
	questionOrderbooks,
	activeMarket,
	activePosition,
	openOrderbookId,
	onMarketSwitch,
	onMarketSwitchWithOrderbook,
	onOrderbookToggle,
	onPositionChange,
	fetchAllOrderbooks,
	chartState,
	settledInfo,
}) => {
	useMedia("(max-width: 1100px)");

	// Track buy/sell side state
	const [tradeSide, setTradeSide] = useState<"buy" | "sell">("buy");
	const [activeTab, setActiveTab] = useState<"basic" | "orderbooks">("basic");
	const [venueForTradeBox, setVenueForTradeBox] = useState<TradingVenue | undefined>(undefined);

	const pandascoreMatchId =
		typeof umbrella?.pandascore_matchId === "string"
			? umbrella.pandascore_matchId.trim()
			: "";

	const { subscribePandaMatchId, unsubscribePandaMatchId } =
		useVenuePandaSubscription();
	useEffect(() => {
		if (!pandascoreMatchId) return;
		subscribePandaMatchId(pandascoreMatchId);
		return () => unsubscribePandaMatchId(pandascoreMatchId);
	}, [pandascoreMatchId, subscribePandaMatchId, unsubscribePandaMatchId]);

	function orderbookDataHasDepth(book: OrderbookData | null | undefined): boolean {
		if (!book) return false;
		const asks = book.asks?.some((a) => (a.size ?? 0) > 0);
		const bids = book.bids?.some((b) => (b.size ?? 0) > 0);
		return Boolean(asks || bids);
	}

	// Direct venue WS connections (Polymarket + DFlow from browser)
	const { appState: oddsAppState } = useOddsMonitor();
	const matchedForVenueBooks = React.useMemo(() => {
		return findOddsMatchedMarket(
			oddsAppState?.markets,
			pandascoreMatchId,
			umbrella?._id,
		);
	}, [oddsAppState?.markets, pandascoreMatchId, umbrella?._id]);

	const serverVenueDepthParity = React.useMemo(() => {
		const m = matchedForVenueBooks;
		if (!m) return false;
		const polyLinked = Boolean(m.polyConditionId || m.polyTokenIdA);
		const polyOk =
			!polyLinked ||
			(orderbookDataHasDepth(m.polyPriceA) && orderbookDataHasDepth(m.polyPriceB));
		const dflowLinked = Boolean(getDflowKalshiMonitorLink(m));
		const dflowOk =
			!dflowLinked ||
			(orderbookDataHasDepth(m.dflowPriceA ?? m.kalshiPriceA) &&
				orderbookDataHasDepth(m.dflowPriceB ?? m.kalshiPriceB));
		return polyOk && dflowOk;
	}, [matchedForVenueBooks]);

	const directBooks = useDirectVenueBooks(matchedForVenueBooks, {
		disabled: serverVenueDepthParity,
	});

	const firstQuestion = sortedQuestions[0] ?? null;
	const firstQuestionId = firstQuestion ? (getMarketId(firstQuestion) || "0") : "";
	const levelUpOrderbook = firstQuestionId ? questionOrderbooks[firstQuestionId] : null;

	const tradingPagePrices = useTradingPagePrices(
		pandascoreMatchId,
		levelUpOrderbook,
		directBooks,
		umbrella?._id,
	);

	// Check if we have questions (umbrella loaded)
	const hasQuestions = sortedQuestions && sortedQuestions.length > 0;
	const settledView = Boolean(settledInfo);
	const showCrossVenueBooks = Boolean(pandascoreMatchId);
	const streamUrl =
		typeof umbrella?.streamUrl === "string" ? umbrella.streamUrl : "";
	const showStream = Boolean(umbrella?.streamEnabled) && streamUrl.length > 0;

	useEffect(() => {
		if (!isPredictionPricingDebugEnabled()) return;
		priceDebugLog("MarketPanels venue / tab state", {
			pandascoreMatchId: pandascoreMatchId || null,
			activeTab,
			showCrossVenueBooks,
			serverVenueDepthParity,
			directBooks: directBooks
				? {
						polyFailed: directBooks.polyFailed,
						dflowFallback: directBooks.dflowFallback,
						hasPolyA: Boolean(directBooks.polyBookA),
						hasPolyB: Boolean(directBooks.polyBookB),
						hasDflowA: Boolean(directBooks.dflowBookA),
						hasDflowB: Boolean(directBooks.dflowBookB),
					}
				: null,
			tradingPageSource: tradingPagePrices.source,
			tradingPageBestYes: tradingPagePrices.bestYesPrice,
			tradingPageBestNo: tradingPagePrices.bestNoPrice,
			note: "Basic tab = EsportsVenueBooksPanel; Orderbooks = VenueOrderbooksPanel (MatchedMarket + directBooks + LevelUp REST snapshot).",
		});
	}, [
		pandascoreMatchId,
		activeTab,
		showCrossVenueBooks,
		serverVenueDepthParity,
		directBooks,
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

	const tabSwitcher = showCrossVenueBooks && !settledView ? (
		<div className="venue-tab-switcher">
			<button
				className={`venue-tab-btn${activeTab === "basic" ? " venue-tab-btn--active" : ""}`}
				onClick={() => setActiveTab("basic")}
			>
				Basic
			</button>
			<button
				className={`venue-tab-btn${activeTab === "orderbooks" ? " venue-tab-btn--active" : ""}`}
				onClick={() => setActiveTab("orderbooks")}
			>
				Orderbooks
			</button>
		</div>
	) : null;

	const defaultOrderbookContent = (
		<>
			{sortedQuestions.map((question, index) => {
				if (!question) return null;
				const orderBookId = getMarketId(question) || `${index}`;
				return (
					<div key={orderBookId} className="question-orderbook">
						<OrderbookDisplay
							orderbook={questionOrderbooks[orderBookId]}
							loading={!questionOrderbooks[orderBookId]}
							error={null}
							onRefresh={() => fetchAllOrderbooks(sortedQuestions)}
							customTitle={
								question.displayName || (question as any).question
							}
							market={
								{
									...(question as any),
									umbrellaChildrenCount: umbrella?.children?.length || 0,
								} as any
							}
							umbrellaDisplayName={umbrella.displayName}
							onMarketSwitch={onMarketSwitch}
							onMarketSwitchWithOrderbook={onMarketSwitchWithOrderbook}
							onOrderbookToggle={onOrderbookToggle}
							isActiveMarket={
								getMarketId(activeMarket) === getMarketId(question)
							}
							activePosition={activePosition}
							isCollapsed={openOrderbookId !== orderBookId}
							side={tradeSide}
						/>
					</div>
				);
			})}
			<RulesSection umbrella={umbrella} />
		</>
	);

	const orderbookColumnContent = settledView ? (
		<RulesSection umbrella={umbrella} />
	) : showCrossVenueBooks ? (
		activeTab === "basic" ? (
			<>
				<div className="orderbook-section__cross-venue">
					<EsportsVenueBooksPanel
						tradingPagePrices={tradingPagePrices}
					/>
				</div>
				<RulesSection umbrella={umbrella} />
			</>
		) : (
			<>
				<VenueOrderbooksPanel
					pandascoreMatchId={pandascoreMatchId}
					umbrellaId={umbrella._id}
					levelUpOrderbook={levelUpOrderbook}
					market={firstQuestion ? {
						...(firstQuestion as any),
						umbrellaChildrenCount: umbrella?.children?.length || 0,
					} as any : undefined}
					umbrellaDisplayName={umbrella.displayName}
					onMarketSwitch={onMarketSwitch}
					onVenueSelect={setVenueForTradeBox}
					activePosition={activePosition}
					side={tradeSide}
					directBooks={directBooks}
				/>
				<RulesSection umbrella={umbrella} />
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

	const chartQuestionId =
		chartState.primaryQuestionId ||
		getMarketId(chartState.primaryMarket) ||
		(hasQuestions ? getMarketId(sortedQuestions[0]) : "");
	const primaryChartOrderbook = chartQuestionId
		? questionOrderbooks[chartQuestionId]
		: undefined;
	// Chart only needs a usable snapshot for the primary chart market; settledView does not change this condition
	const showChartBlock =
		hasQuestions && hasUsableOrderbookSnapshot(primaryChartOrderbook);
	const showChartPlaceholder =
		!showChartBlock && !(settledView && !hasQuestions);

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
					questionId={
						chartState.primaryQuestionId ||
						chartState.primaryMarket?._id ||
						chartState.primaryMarket?.questionId ||
						chartState.primaryMarket?.marketId ||
						""
					}
					umbrellaId={umbrella?._id}
					pandaMatchId={pandascoreMatchId || undefined}
					umbrellaDisplayName={umbrella?.displayName}
					activeMarket={chartPrimaryMarket}
					secondMarket={chartSecondaryMarket}
					questionOrderbooks={questionOrderbooks}
				/>
			</div>
		</div>
	) : showChartPlaceholder ? (
		<div className="venue-books-chart-skeleton">
			<ChartSkeleton />
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

	return (
		<div className="prediction-market-content">
			{/* Desktop Layout */}
			<div className="desktop-layout">
				<div className="left-panel">
					{showStream && (
						<div className="stream-section">
							<StreamEmbed streamUrl={streamUrl} height="720" />
						</div>
					)}

					<div className="venue-books-container">
						{chartAtTopOfVenueBooks}
						{tabSwitcher}
						{predictionMarketOddsHeading}
						<div className="orderbook-section">{orderbookSectionBody}</div>
					</div>

					{/* Comments Section */}
					{umbrella && (
						<Comments
							umbrellaId={umbrella._id}
							markets={sortedQuestions as PredictionMarket[]}
						/>
					)}
				</div>

			<div className="right-panel">
				{settledInfo ? (
					<div className="prediction-market-tradebox match-settled-banner">
						<div className="match-settled-banner__content">
							<div className="match-settled-banner__winner">
								{settledInfo.winnerName} has won!
							</div>
						</div>
					</div>
				) : activeMarket &&
				  hasUsableOrderbookSnapshot(
						questionOrderbooks[getMarketId(activeMarket)],
				  ) ? (
					<PredictionMarketTradeBox
						market={
							{
								...(activeMarket as any),
								umbrellaChildrenCount:
									umbrella?.children?.length || 0,
							} as any
						}
						orderbook={
							questionOrderbooks[getMarketId(activeMarket)]
						}
						pandascoreMatchId={
							pandascoreMatchId || undefined
						}
						umbrellaId={umbrella._id}
						umbrellaDisplayName={umbrella.displayName}
						initialPosition={activePosition}
						onPositionChange={onPositionChange}
						onSideChange={setTradeSide}
						venueOverride={venueForTradeBox}
						crossBuyYes={tradingPagePrices.bestYesPrice}
						crossBuyNo={tradingPagePrices.bestNoPrice}
					/>
				) : (
					<TradeBoxSkeleton />
				)}
			</div>
			</div>

			{/* Mobile Layout */}
			<div className="mobile-layout">
				{showStream && (
					<div className="stream-section-mobile">
						<StreamEmbed streamUrl={streamUrl} height="360" />
					</div>
				)}
				<div className="venue-books-container">
					{chartAtTopOfVenueBooks}
					{tabSwitcher}
					{predictionMarketOddsHeading}
					<div className="orderbook-section-mobile">{orderbookSectionBody}</div>
				</div>

				{/* Comments Section */}
				{umbrella && (
					<Comments
						umbrellaId={umbrella._id}
						markets={sortedQuestions as PredictionMarket[]}
					/>
				)}

			{/* Mobile Trading Container - Fixed at bottom */}
			{settledInfo ? (
				<div className="mobile-trading-container">
					<div className="prediction-market-tradebox match-settled-banner">
						<div className="match-settled-banner__content">
							<div className="match-settled-banner__winner">
								{settledInfo.winnerName} has won!
							</div>
						</div>
					</div>
				</div>
			) : activeMarket &&
			  hasUsableOrderbookSnapshot(
					questionOrderbooks[getMarketId(activeMarket)],
			  ) ? (
				<div className="mobile-trading-container">
					<PredictionMarketTradeBox
						market={
							{
								...(activeMarket as any),
								umbrellaChildrenCount:
									umbrella?.children?.length || 0,
							} as any
						}
						orderbook={
							questionOrderbooks[getMarketId(activeMarket)]
						}
						pandascoreMatchId={
							pandascoreMatchId || undefined
						}
						umbrellaId={umbrella._id}
						umbrellaDisplayName={umbrella.displayName}
						initialPosition={activePosition}
						onPositionChange={onPositionChange}
						onSideChange={setTradeSide}
						venueOverride={venueForTradeBox}
						crossBuyYes={tradingPagePrices.bestYesPrice}
						crossBuyNo={tradingPagePrices.bestNoPrice}
					/>
				</div>
			) : (
				<div className="mobile-trading-container">
					<TradeBoxSkeleton />
				</div>
			)}
			</div>
		</div>
	);
};
