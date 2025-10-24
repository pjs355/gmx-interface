import { useMemo, useState, useCallback } from "react";
import { useMedia } from "react-use";
import { useSignerContext } from "context/SignerContext";
import { type PredictionMarket } from "@/services/api/predictionMarketDataService";
import { type Umbrella } from "@/services/api/umbrellaDataService";
import {
	getOrderAggregates,
	getTradingReturns,
	type ProcessedOrder,
	type OrderAggregates,
} from "@/services/api/simplifiedOrderService";
import { useUserData } from "context/UserDataContext";
import { usePredictionData } from "context/PredictionDataContext";
import "./Positions.scss";
import PositionsHeader from "./components/PositionsHeader";
import { usePortfolio } from "context/PortfolioContext";
import PositionsTabs from "./components/PositionsTabs";
import PositionsTableView from "./components/PositionsTableView";
import PositionsCardView from "./components/PositionsCardView";
import ResolvedPositionsTable from "./components/ResolvedPositionsTable";
import OrdersView from "./components/OrdersView";
import OrdersCardView from "./components/OrdersCardView";
import HistoryView from "./components/HistoryView";
import HistoryCardView from "./components/HistoryCardView";
import Footer from "components/Footer/Footer";

type MarketPosition = {
	market: PredictionMarket;
	yesBalance: number;
	noBalance: number;
	yesPrice: number | null;
	noPrice: number | null;
	yesValue: number;
	noValue: number;
	totalValue: number;
	orders: ProcessedOrder[];
	aggregates: OrderAggregates;
};

type UmbrellaPositions = {
	umbrella: Umbrella;
	markets: MarketPosition[];
};

export default function Positions() {
	const isMobile = useMedia("(max-width: 768px)");
	const { account } = useSignerContext();
	// unified balances via PortfolioContext
	const {
		portfolioTotal: portfolioTotalCtx,
		cashBalance: cashBalanceCtx,
		loading: portfolioLoading,
	} = usePortfolio();
	const {
		orders,
		tokenBalances,
		loading: userDataLoading,
		refresh: refreshUserData,
	} = useUserData();
	const {
		umbrellas,
		getQuestionsForUmbrella,
		getAllQuestionsForUmbrella,
		resolvedMarketsByUmbrella,
		loading: predictionLoading,
		allBooksPreview,
		booksPreviewLoading,
	} = usePredictionData();

	// Check if all data is loaded before showing resolved positions
	const isDataFullyLoaded =
		!predictionLoading &&
		!userDataLoading &&
		!portfolioLoading &&
		!booksPreviewLoading;
	// removed setPortfolioTotal – portfolio is computed in context

	const [loading] = useState(false);
	const [error] = useState<string | null>(null);
	const [activeTab, setActiveTab] = useState<
		"positions" | "orders" | "history"
	>("positions");
	const [claimedMarkets, setClaimedMarkets] = useState<Set<string>>(
		new Set()
	);
	const allUmbrellas = useMemo(() => {
		return umbrellas.map((umb) => ({
			umbrella: umb,
			markets:
				(getAllQuestionsForUmbrella(umb._id) as PredictionMarket[]) ||
				[],
		}));
	}, [umbrellas, getAllQuestionsForUmbrella]);

	// Effective account comes from unified resolver (smart -> embedded -> external)
	const effectiveAccount = account || null;

	// Callback to handle successful claims
	const handleClaimSuccess = useCallback(
		(marketId: string, umbrellaId: string) => {
			console.log(
				"🎉 CLAIM SUCCESS CALLBACK: Removing market",
				marketId,
				"from umbrella",
				umbrellaId
			);
			setClaimedMarkets((prev) => {
				const newSet = new Set([...prev, marketId]);
				console.log(
					"📝 CLAIMED MARKETS: Updated set:",
					Array.from(newSet)
				);
				return newSet;
			});

			// Refresh user data to update cash balance
			console.log("💰 REFRESHING: User data to update cash balance");
			refreshUserData();
		},
		[refreshUserData]
	);

	// derive active positions
	const umbrellaPositions: UmbrellaPositions[] = useMemo(() => {
		if (!effectiveAccount) return [];

		return umbrellas
			.map((umbrella) => {
				const markets =
					(getQuestionsForUmbrella(
						umbrella._id
					) as PredictionMarket[]) || [];
				const processedMarkets: MarketPosition[] = markets
					.map((market) => {
						// TWO DIFFERENT IDS:
						// 1. MongoDB _id for tokenBalances lookup
						const balanceId = market._id;
						// 2. Transaction hash questionId for price lookup
						const priceId = market.questionId || market._id;
						
						// Get balances using MongoDB _id
						const tb = balanceId
							? tokenBalances.get(balanceId)
							: undefined;
						const yesBalance = tb ? Number(tb.yesBalance) : 0;
						const noBalance = tb ? Number(tb.noBalance) : 0;

						// Get prices using questionId (transaction hash) - EXACTLY like home page
						const preview = priceId
							? allBooksPreview[priceId]
							: undefined;
						const yesPrice = preview?.lowestAsk ?? null; // Yes price = lowestAsk
						const noPrice =
							preview?.highestBid !== null &&
							preview?.highestBid !== undefined
								? 1 - preview.highestBid // No price = 1 - highestBid
								: null;

						const yesValue = yesPrice ? yesBalance * yesPrice : 0;
						const noValue = noPrice ? noBalance * noPrice : 0;
						const totalValue = yesValue + noValue;
						
						// Orders might use either ID, so check both
						const marketOrders = (orders || []).filter(
							(order) => order.questionId === priceId || order.questionId === balanceId
						);
						const aggregates = getOrderAggregates(
							orders || [],
							balanceId // Use balance ID for order lookups
						);
						
						return {
							market,
							yesBalance,
							noBalance,
							yesPrice,
							noPrice,
							yesValue,
							noValue,
							totalValue,
							orders: marketOrders,
							aggregates,
						};
					})
					.filter(
						(market) =>
							market.yesBalance > 0 || market.noBalance > 0
					);
				const activeMarkets = processedMarkets.filter(
					(mp) => (mp.market as any).status !== "resolved"
				);
				return { umbrella, markets: activeMarkets };
			})
			.filter((umbrella) => umbrella.markets.length > 0);
	}, [
		effectiveAccount,
		umbrellas,
		getQuestionsForUmbrella,
		tokenBalances,
		orders,
		allBooksPreview,
	]);

	// derive resolved winnings using dedicated resolved markets storage
	const resolvedUmbrellaPositions: UmbrellaPositions[] = useMemo(() => {
		if (!effectiveAccount) {
			console.log(
				"🔍 DEBUG: No effective account, returning empty resolved positions"
			);
			return [];
		}
		const resolved: UmbrellaPositions[] = [];

		console.log(
			"🔍 DEBUG: Checking for resolved markets using dedicated storage..."
		);
		console.log(
			"🔍 DEBUG: resolvedMarketsByUmbrella:",
			resolvedMarketsByUmbrella
		);
		console.log(
			"🔍 DEBUG: Object.keys(resolvedMarketsByUmbrella):",
			Object.keys(resolvedMarketsByUmbrella)
		);

		// Process all umbrellas that have resolved markets
		Object.entries(resolvedMarketsByUmbrella).forEach(
			([umbrellaId, resolvedMarkets]) => {
				console.log(
					`🔍 DEBUG: Processing umbrella ID: ${umbrellaId} with ${resolvedMarkets.length} resolved markets`
				);
				console.log(
					`🔍 DEBUG: Resolved markets data:`,
					resolvedMarkets
				);

				if (resolvedMarkets.length > 0) {
					// Find the umbrella object for this ID
					let umbrella = umbrellas.find((u) => u._id === umbrellaId);

					// If not found in umbrellas array, create a basic umbrella object from the resolved market data
					if (!umbrella) {
						console.log(
							`🔍 DEBUG: No umbrella found for ID ${umbrellaId}, creating basic umbrella object`
						);
						// Get the first resolved market to extract umbrella info
						const firstMarket = resolvedMarkets[0];
						umbrella = {
							_id: umbrellaId,
							displayName:
								firstMarket?.umbrellaName ||
								firstMarket?.displayName ||
								`Umbrella ${umbrellaId}`,
							children: resolvedMarkets,
							createdAt: new Date().toISOString(),
							updatedAt: new Date().toISOString(),
							__v: 0,
						} as Umbrella;
					}

					console.log(
						`🔍 DEBUG: Processing ${resolvedMarkets.length} resolved markets for ${umbrella.displayName}`
					);
					const res = resolvedMarkets
						.map((m) => {
							// Use MongoDB _id for balance lookup
							const balanceId = (m as any)._id;
							const tb = balanceId
								? tokenBalances.get(balanceId)
								: undefined;
							const yesBalance = tb ? Number(tb.yesBalance) : 0;
							const noBalance = tb ? Number(tb.noBalance) : 0;
							console.log(
								`🔍 DEBUG: Market ${m?.displayName} - balanceId: ${balanceId}, yesBalance: ${yesBalance}, noBalance: ${noBalance}`
							);
							return { market: m, yesBalance, noBalance } as any;
						})
						// Filter to only show markets where user has winning positions AND haven't been claimed
						.filter((mp: any) => {
							// Use MongoDB _id for claimed check
							const balanceId = (mp.market as any)._id;
							const isClaimed = claimedMarkets.has(balanceId);

							if (isClaimed) {
								console.log(
									`🔍 DEBUG: Market ${mp.market?.displayName} - ALREADY CLAIMED, filtering out`
								);
								return false;
							}

							const outcome = String(
								(mp.market as any).resolvedOutcome || ""
							).toLowerCase();
							const hasWinningYes =
								outcome === "yes" && mp.yesBalance > 0;
							const hasWinningNo =
								outcome === "no" && mp.noBalance > 0;
							const hasWinningPosition =
								hasWinningYes || hasWinningNo;
							console.log(
								`🔍 DEBUG: Market ${mp.market?.displayName} - outcome: ${outcome}, hasWinningYes: ${hasWinningYes}, hasWinningNo: ${hasWinningNo}, hasWinningPosition: ${hasWinningPosition}`
							);
							return hasWinningPosition;
						})
						.map(
							(mp: any) =>
								({
									market: mp.market,
									yesBalance: mp.yesBalance,
									noBalance: mp.noBalance,
									yesPrice: null,
									noPrice: null,
									yesValue: 0,
									noValue: 0,
									totalValue: 0,
									orders: [],
									aggregates: {
										Yes: {
											totalSize: 0,
											totalValue: 0,
											avgPrice: null,
											count: 0,
										},
										No: {
											totalSize: 0,
											totalValue: 0,
											avgPrice: null,
											count: 0,
										},
									},
								} as MarketPosition)
						);

					console.log(
						`🔍 DEBUG: Adding ${res.length} resolved markets to table for ${umbrella.displayName}`
					);
					console.log(`🔍 DEBUG: Processed markets data:`, res);

					// Only add umbrella if it has qualifying markets (user has winning positions)
					if (res.length > 0) {
						resolved.push({ umbrella, markets: res });
					} else {
						console.log(
							`🔍 DEBUG: Skipping umbrella ${umbrella.displayName} - no winning positions found`
						);
					}
				}
			}
		);

		console.log("🔍 DEBUG: Final resolvedUmbrellaPositions:", resolved);
		console.log(
			"🔍 DEBUG: Final resolvedUmbrellaPositions.length:",
			resolved.length
		);
		return resolved;
	}, [
		effectiveAccount,
		resolvedMarketsByUmbrella,
		umbrellas,
		tokenBalances,
		claimedMarkets,
	]);

	// Calculate totals
	const positionsTotalValue = useMemo(() => {
		return umbrellaPositions.reduce((total, umbrella) => {
			return (
				total +
				umbrella.markets.reduce((umbrellaTotal, market) => {
					return umbrellaTotal + market.totalValue;
				}, 0)
			);
		}, 0);
	}, [umbrellaPositions]);

	// Portfolio totals are sourced from PortfolioContext to avoid flicker/duplication

	// Helper functions for display
	const toCentsString = (value?: number | null): string => {
		if (value === undefined || value === null || !isFinite(value))
			return "--";
		return `${Math.round(value * 100)}¢`;
	};

	const getCurrentPriceForSide = (
		market: PredictionMarket,
		side: "Yes" | "No"
	): number | null => {
		// USE questionId for price lookups (transaction hash) - EXACTLY like home page
		const questionId = market.questionId || market._id;
		if (!questionId) return null;

		// Get prices from allBooksPreview (EXACTLY like home page cards)
		const preview = questionId ? allBooksPreview[questionId] : undefined;

		if (side === "Yes") {
			return preview?.lowestAsk ?? null; // Yes price = lowestAsk
		} else {
			return preview?.highestBid !== null &&
				preview?.highestBid !== undefined
				? 1 - preview.highestBid // No price = 1 - highestBid
				: null;
		}
	};

	// Convert to old format for compatibility with existing components
	// For Positions tab (only markets with positions)
	const umbrellaBalancesPositions = umbrellaPositions.map((up) => ({
		umbrella: up.umbrella,
		markets: up.markets.map((mp) => ({
			market: mp.market,
			yes: mp.yesBalance.toString(),
			no: mp.noBalance.toString(),
		})),
	}));

	// For Orders tab (all markets under umbrellas; OrdersView will filter to those that have open orders)
	const umbrellaBalancesOrders = allUmbrellas.map(
		({ umbrella, markets }) => ({
			umbrella,
			markets: markets.map((market) => ({
				market,
				yes: "0",
				no: "0",
			})),
		})
	);

	const returnsByQid = useMemo(() => {
		const map: Record<string, { Yes: number; No: number }> = {};
		umbrellaPositions.forEach((up) => {
			up.markets.forEach((mp) => {
				// Use MongoDB _id for order/return lookups
				const balanceId = mp.market._id;
				if (balanceId) {
					try {
						const returns = getTradingReturns(
							orders || [],
							balanceId
						);
						map[balanceId] = {
							Yes: returns.yesPnL,
							No: returns.noPnL,
						};
					} catch {}
				}
			});
		});

		return map;
	}, [umbrellaPositions, orders]);

	const aggregates = umbrellaPositions.reduce((acc, up) => {
		up.markets.forEach((mp) => {
			// Use MongoDB _id for aggregate lookups
			const balanceId = mp.market._id;
			if (balanceId) {
				// Convert to the format expected by PositionsTableView
				acc[balanceId] = {
					Yes: {
						avgPrice: mp.aggregates.Yes.avgPrice,
						cost: mp.aggregates.Yes.totalValue,
					},
					No: {
						avgPrice: mp.aggregates.No.avgPrice,
						cost: mp.aggregates.No.totalValue,
					},
				};
			}
		});
		return acc;
	}, {} as Record<string, any>);

	const spentByQid = umbrellaPositions.reduce((acc, up) => {
		up.markets.forEach((mp) => {
			// Use MongoDB _id for spent lookups
			const balanceId = mp.market._id;
			if (balanceId) {
				acc[balanceId] = {
					Yes: mp.aggregates.Yes.totalValue,
					No: mp.aggregates.No.totalValue,
				};
			}
		});
		return acc;
	}, {} as Record<string, { Yes: number; No: number }>);

	return (
		<div className="default-container page-layout">
			<div>
				{/* Spacer bar for proper spacing - responsive */}
				{isMobile ? (
					<div style={{ height: "4px", width: "100%" }}></div>
				) : (
					<div style={{ height: "36px", width: "100%" }}></div>
				)}

				<PositionsHeader
					portfolioTotal={
						portfolioTotalCtx ??
						cashBalanceCtx + positionsTotalValue
					}
					positionsTotalValue={positionsTotalValue}
					usdcBalance={Number(cashBalanceCtx)}
					softLoading={
						loading ||
						predictionLoading ||
						userDataLoading ||
						portfolioLoading ||
						booksPreviewLoading
					}
				/>

				<PositionsTabs
					activeTab={activeTab}
					setActiveTab={setActiveTab}
				/>

				{!account && (
					<p className="text-body">Log in to view balances.</p>
				)}
				{account && (
					<div className="mt-12">
						{error ? (
							<p className="error-message">{error}</p>
						) : (
							(() => {
								const softLoading =
									loading ||
									predictionLoading ||
									userDataLoading ||
									booksPreviewLoading;
								const hasPositions =
									umbrellaPositions.length > 0;
								if (!hasPositions && !softLoading) {
									return (
										<p className="text-body">
											No positions found.
										</p>
									);
								}
								if (activeTab === "positions") {
									console.log(
										"🔍 DEBUG: In positions tab, resolvedUmbrellaPositions.length:",
										resolvedUmbrellaPositions.length
									);
									console.log(
										"🔍 DEBUG: resolvedUmbrellaPositions:",
										resolvedUmbrellaPositions
									);

									return (
										<>
											{isDataFullyLoaded &&
												resolvedUmbrellaPositions.length >
													0 && (
													<div className="mb-24">
														<h3
															className="mb-6 text-20 font-bold"
															style={{
																color: "#ffffff",
																fontSize: 34,
															}}
														>
															Winnings
														</h3>
														{(() => {
															const transformedData =
																resolvedUmbrellaPositions.map(
																	(up) => ({
																		umbrella:
																			up.umbrella,
																		markets:
																			up.markets.map(
																				(
																					mp
																				) => {
																					const outcome =
																						String(
																							(
																								mp.market as any
																							)
																								.resolvedOutcome ||
																								""
																						).toLowerCase();
																					const yes =
																						outcome ===
																						"yes"
																							? mp.yesBalance.toString()
																							: "0";
																					const no =
																						outcome ===
																						"no"
																							? mp.noBalance.toString()
																							: "0";
																					console.log(
																						`🔍 DEBUG: Transformed market ${mp.market?.displayName} - outcome: ${outcome}, yes: ${yes}, no: ${no}`
																					);
																					return {
																						market: mp.market,
																						yes,
																						no,
																					};
																				}
																			),
																	})
																);
															console.log(
																"🔍 DEBUG: Transformed data for ResolvedPositionsTable:",
																transformedData
															);
															return (
																<ResolvedPositionsTable
																	umbrellaBalances={
																		transformedData
																	}
																	toCentsString={
																		toCentsString
																	}
																	softLoading={
																		softLoading
																	}
																	onClaimSuccess={
																		handleClaimSuccess
																	}
																/>
															);
														})()}
													</div>
												)}
											{isDataFullyLoaded &&
												resolvedUmbrellaPositions.length >
													0 && (
													<h3
														className="mb-6 text-20 font-bold"
														style={{
															color: "#ffffff",
															fontSize: 34,
															marginTop: 40,
														}}
													>
														Positions
													</h3>
												)}
											{!isMobile ? (
												<PositionsTableView
													umbrellaBalances={
														umbrellaBalancesPositions
													}
													aggregates={aggregates}
													spentByQid={spentByQid}
													returnsByQid={returnsByQid}
													getCurrentPriceForSide={
														getCurrentPriceForSide
													}
													toCentsString={
														toCentsString
													}
													softLoading={softLoading}
												/>
											) : (
												<PositionsCardView
													umbrellaBalances={
														umbrellaBalancesPositions
													}
													aggregates={aggregates}
													spentByQid={spentByQid}
													returnsByQid={returnsByQid}
													getCurrentPriceForSide={
														getCurrentPriceForSide
													}
													toCentsString={
														toCentsString
													}
													softLoading={softLoading}
												/>
											)}
										</>
									);
								}
								if (activeTab === "orders") {
									return !isMobile ? (
										<OrdersView
											umbrellaBalances={
												umbrellaBalancesOrders
											}
											orders={orders || []}
										/>
									) : (
										<OrdersCardView
											umbrellaBalances={
												umbrellaBalancesOrders
											}
											orders={orders || []}
										/>
									);
								}
								return !isMobile ? (
									<HistoryView
										umbrellaBalances={
											umbrellaBalancesPositions
										}
										returnsByQid={returnsByQid}
										orders={orders || []}
										resolvedMarketsByUmbrella={
											resolvedMarketsByUmbrella
										}
									/>
								) : (
									<HistoryCardView
										returnsByQid={returnsByQid}
										orders={orders || []}
										resolvedMarketsByUmbrella={
											resolvedMarketsByUmbrella
										}
									/>
								);
							})()
						)}
					</div>
				)}
			</div>
			<Footer />
		</div>
	);
}
