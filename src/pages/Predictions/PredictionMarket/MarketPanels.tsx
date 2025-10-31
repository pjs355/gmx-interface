import React, { useState } from "react";
import { useMedia } from "react-use";
import PredictionMarketChart from "../components/PredictionMarketChart";
import OrderbookDisplay from "components/OrderbookDisplay/OrderbookDisplay";
import PredictionMarketTradeBox from "../components/PredictionMarketTradeBox/PredictionMarketTradeBox";
import RulesSection from "components/RulesSection/RulesSection";
import { TwitchEmbed } from "./TwitchEmbed";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import { getMarketId } from "./utils";
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
}) => {
	useMedia("(max-width: 1100px)");

	// Track buy/sell side state
	const [tradeSide, setTradeSide] = useState<"buy" | "sell">("buy");

	// Check if we have questions (umbrella loaded)
	const hasQuestions = sortedQuestions && sortedQuestions.length > 0;

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

	return (
		<div className="prediction-market-content">
			{/* Desktop Layout */}
			<div className="desktop-layout">
				<div className="left-panel">
					{umbrella?.twitchEnabled && umbrella?.twitchChannel && (
						<div className="twitch-section">
							<TwitchEmbed channel={umbrella.twitchChannel} />
						</div>
					)}
					<div className="chart-section">
						{hasQuestions && orderbooksReady ? (
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
						) : (
							<ChartSkeleton />
						)}
					</div>

					<div className="orderbook-section">
						{hasQuestions && orderbooksReady ? (
							<>
								{sortedQuestions.map((question, index) => {
									if (!question) return null;
									const orderBookId =
										getMarketId(question) || `${index}`;
									return (
										<div
											key={orderBookId}
											className="question-orderbook"
										>
											<OrderbookDisplay
												orderbook={
													questionOrderbooks[
														orderBookId
													]
												}
												loading={
													!questionOrderbooks[
														orderBookId
													]
												}
												error={null}
												onRefresh={() =>
													fetchAllOrderbooks(
														sortedQuestions
													)
												}
												customTitle={
													question.displayName ||
													(question as any).question
												}
												market={
													{
														...(question as any),
														umbrellaChildrenCount:
															umbrella?.children
																?.length || 0,
													} as any
												}
												onMarketSwitch={onMarketSwitch}
												onMarketSwitchWithOrderbook={
													onMarketSwitchWithOrderbook
												}
												onOrderbookToggle={
													onOrderbookToggle
												}
												isActiveMarket={
													getMarketId(
														activeMarket
													) === getMarketId(question)
												}
												activePosition={activePosition}
												isCollapsed={
													openOrderbookId !==
													orderBookId
												}
												side={tradeSide}
											/>
										</div>
									);
								})}
								<RulesSection umbrella={umbrella} />
							</>
						) : (
							<>
								<OrderbookSkeleton />
								<OrderbookSkeleton />
							</>
						)}
					</div>
				</div>

				<div className="right-panel">
					{hasQuestions && orderbooksReady && activeMarket ? (
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
							initialPosition={activePosition}
							onPositionChange={onPositionChange}
							onSideChange={setTradeSide}
						/>
					) : (
						<TradeBoxSkeleton />
					)}
				</div>
			</div>

			{/* Mobile Layout */}
			<div className="mobile-layout">
				{umbrella?.twitchEnabled && umbrella?.twitchChannel && (
					<div className="twitch-section-mobile">
						<TwitchEmbed channel={umbrella.twitchChannel} />
					</div>
				)}
				<div className="chart-section-mobile">
					{hasQuestions && orderbooksReady ? (
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
					) : (
						<ChartSkeleton />
					)}
				</div>

				<div className="orderbook-section-mobile">
					{hasQuestions && orderbooksReady ? (
						<>
							{sortedQuestions.map((question, index) => {
								if (!question) return null;
								const orderBookId =
									getMarketId(question) || `${index}`;
								return (
									<div
										key={orderBookId}
										className="question-orderbook"
									>
										<OrderbookDisplay
											orderbook={
												questionOrderbooks[orderBookId]
											}
											loading={
												!questionOrderbooks[orderBookId]
											}
											error={null}
											onRefresh={() =>
												fetchAllOrderbooks(
													sortedQuestions
												)
											}
											customTitle={
												question.displayName ||
												(question as any).question
											}
											market={
												{
													...(question as any),
													umbrellaChildrenCount:
														umbrella?.children
															?.length || 0,
												} as any
											}
											onMarketSwitch={onMarketSwitch}
											onMarketSwitchWithOrderbook={
												onMarketSwitchWithOrderbook
											}
											onOrderbookToggle={
												onOrderbookToggle
											}
											isActiveMarket={
												getMarketId(activeMarket) ===
												getMarketId(question)
											}
											activePosition={activePosition}
											isCollapsed={
												openOrderbookId !== orderBookId
											}
											side={tradeSide}
										/>
									</div>
								);
							})}
							<RulesSection umbrella={umbrella} />
						</>
					) : (
						<>
							<OrderbookSkeleton />
							<OrderbookSkeleton />
						</>
					)}
				</div>

				{/* Mobile Trading Container - Fixed at bottom */}
				{hasQuestions && orderbooksReady && activeMarket ? (
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
							initialPosition={activePosition}
							onPositionChange={onPositionChange}
							onSideChange={setTradeSide}
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
