import React, { useState } from "react";
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
import { getMarketId } from "./utils";
import { useOddsMonitor } from "@/context/OddsMonitorContext";
import { useDirectVenueBooks } from "@/trading/venue-books";
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
	orderbooksReady: boolean;
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
	orderbooksReady,
	settledInfo,
}) => {
	useMedia("(max-width: 1100px)");

	// Track buy/sell side state
	const [tradeSide, setTradeSide] = useState<"buy" | "sell">("buy");
	const [activeTab, setActiveTab] = useState<"basic" | "orderbooks">("basic");
	const [venueForTradeBox, setVenueForTradeBox] = useState<TradingVenue | undefined>(undefined);

	// Direct venue WS connections (Polymarket + DFlow from browser)
	const { appState: oddsAppState } = useOddsMonitor();
	const matchedForVenueBooks = React.useMemo(() => {
		const pandaId = typeof umbrella?.pandascore_matchId === "string" ? umbrella.pandascore_matchId.trim() : "";
		if (!pandaId || !oddsAppState?.markets?.length) return null;
		return oddsAppState.markets.find((m) => String(m.pandaMatchId) === pandaId) ?? null;
	}, [oddsAppState?.markets, umbrella?.pandascore_matchId]);
	const directBooks = useDirectVenueBooks(matchedForVenueBooks);

	// Check if we have questions (umbrella loaded)
	const hasQuestions = sortedQuestions && sortedQuestions.length > 0;
	const settledView = Boolean(settledInfo);
	const pandascoreMatchId =
		typeof umbrella?.pandascore_matchId === "string"
			? umbrella.pandascore_matchId.trim()
			: "";
	const showCrossVenueBooks = Boolean(pandascoreMatchId);
	const streamUrl =
		typeof umbrella?.streamUrl === "string" ? umbrella.streamUrl : "";
	const showStream = Boolean(umbrella?.streamEnabled) && streamUrl.length > 0;

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

	const firstQuestion = sortedQuestions[0] ?? null;
	const firstQuestionId = firstQuestion ? (getMarketId(firstQuestion) || "0") : "";
	const levelUpOrderbook = firstQuestionId ? questionOrderbooks[firstQuestionId] : null;

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
						pandascoreMatchId={pandascoreMatchId}
						levelUpOrderbook={levelUpOrderbook}
						directBooks={directBooks}
					/>
				</div>
				<RulesSection umbrella={umbrella} />
			</>
		) : (
			<>
				<VenueOrderbooksPanel
					pandascoreMatchId={pandascoreMatchId}
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
		settledView || (hasQuestions && orderbooksReady) ? (
			orderbookColumnContent
		) : (
			<>
				<OrderbookSkeleton />
				<OrderbookSkeleton />
			</>
		);

	// Chart only needs active markets + orderbooks; settledView does not change this condition
	const showChartBlock = hasQuestions && orderbooksReady;
	const showChartPlaceholder =
		!showChartBlock && !(settledView && !hasQuestions);

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
					<div className="chart-section">
						{showChartBlock ? (
							<div
								className="ExchangeChart"
								style={{
									display: "flex",
									flexDirection: "column",
									minHeight: 300,
								}}
							>
								<div
									className="flex grow flex-col overflow-visible rounded-4 bg-black"
									style={{ minHeight: 300 }}
								>
									<PredictionMarketChart
										questionId={
											chartState.primaryQuestionId ||
											chartState.primaryMarket?._id ||
											chartState.primaryMarket
												?.questionId ||
											chartState.primaryMarket
												?.marketId ||
											""
										}
										activeMarket={chartPrimaryMarket}
										secondMarket={chartSecondaryMarket}
										questionOrderbooks={questionOrderbooks}
									/>
								</div>
							</div>
						) : showChartPlaceholder ? (
							<ChartSkeleton />
						) : null}
					</div>

					<div className="venue-books-container">
						{tabSwitcher}
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
				) : hasQuestions && orderbooksReady && activeMarket ? (
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
						umbrellaDisplayName={umbrella.displayName}
						initialPosition={activePosition}
						onPositionChange={onPositionChange}
						onSideChange={setTradeSide}
						venueOverride={venueForTradeBox}
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
				<div className="chart-section-mobile">
					{showChartBlock ? (
						<div
							className="ExchangeChart"
							style={{
								display: "flex",
								flexDirection: "column",
								minHeight: 300,
							}}
						>
							<div
								className="flex grow flex-col overflow-visible rounded-4 bg-black"
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
									activeMarket={chartPrimaryMarket}
									secondMarket={chartSecondaryMarket}
									questionOrderbooks={questionOrderbooks}
								/>
							</div>
						</div>
					) : showChartPlaceholder ? (
						<ChartSkeleton />
					) : null}
				</div>

				<div className="venue-books-container">
					{tabSwitcher}
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
			) : hasQuestions && orderbooksReady && activeMarket ? (
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
						umbrellaDisplayName={umbrella.displayName}
						initialPosition={activePosition}
						onPositionChange={onPositionChange}
						onSideChange={setTradeSide}
						venueOverride={venueForTradeBox}
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
