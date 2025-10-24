import React, { useState } from "react";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import { getFinalAmount } from "@/services/api/simplifiedOrderService";
import gtaIcon from "@/assets/img/ic_gtaVI_24.svg";
import {
	resolveLogoWithPriority,
	collectTagsFromUmbrella,
	resolveUmbrellaIconById,
} from "@/pages/Predictions/utils/gameLogoResolver";
import Tooltip from "components/Tooltip/Tooltip";
import ScrollableTable from "components/ScrollableTable/ScrollableTable";

// Component to handle image with proper fallback
function UmbrellaImage({ umbrella }: { umbrella: any }) {
	const [imageError, setImageError] = useState(false);
	const [currentSrc, setCurrentSrc] = useState<string | null>(null);

	// Priority 1: Check for server image (ic_{umbrellaID})
	const serverImage =
		umbrella && umbrella._id ? resolveUmbrellaIconById(umbrella._id) : null;

	// Priority 2: Check for game logo based on tags
	const gameLogo = resolveLogoWithPriority(
		umbrella,
		collectTagsFromUmbrella(umbrella)
	);

	// Priority 3: Fallback to game controller
	const fallbackLogo = gameLogo || gtaIcon;

	// Determine initial source
	const initialSrc = serverImage || fallbackLogo;

	const handleError = () => {
		if (!imageError && serverImage && gameLogo) {
			// If server image fails, fall back to game logo
			setImageError(true);
			setCurrentSrc(gameLogo);
		} else if (!imageError && serverImage && !gameLogo) {
			// If server image fails and no game logo, fall back to controller
			setImageError(true);
			setCurrentSrc(gtaIcon);
		}
	};

	return (
		<img
			src={currentSrc || initialSrc}
			alt="umbrella"
			width={48}
			height={48}
			style={{
				display: "block",
				background: "#000",
				borderRadius: 8,
				objectFit: "contain",
			}}
			onError={handleError}
		/>
	);
}

export default function HistoryView({
	umbrellaBalances,
	returnsByQid,
	orders,
	resolvedMarketsByUmbrella,
}: {
	umbrellaBalances: any[];
	returnsByQid: Record<string, { Yes: number; No: number }>;
	orders: any[];
	resolvedMarketsByUmbrella: Record<string, any[]>;
}) {
	// Filter resolved markets to only show those where user has trading history
	const filteredResolvedMarkets = React.useMemo(() => {
		const filtered: Array<{ umbrella: any; markets: any[] }> = [];

		console.log(
			"🔍 HISTORY DEBUG: Processing resolved markets for history tab..."
		);
		console.log(
			"🔍 HISTORY DEBUG: resolvedMarketsByUmbrella:",
			resolvedMarketsByUmbrella
		);

		Object.entries(resolvedMarketsByUmbrella).forEach(
			([umbrellaId, resolvedMarkets]) => {
				console.log(
					`🔍 HISTORY DEBUG: Processing umbrella ${umbrellaId} with ${resolvedMarkets.length} resolved markets`
				);

				const marketsWithHistory: any[] = [];

				resolvedMarkets.forEach((market) => {
					const marketId =
						market._id || market.questionId || market.marketId;
					if (!marketId) return;

					// Check if user has any trading history for this market
					const finalAmounts = getFinalAmount(orders, marketId);
					const hasTradingHistory =
						finalAmounts.yesShares > 0 || finalAmounts.noShares > 0;

					console.log(
						`🔍 HISTORY DEBUG: Market ${market.displayName} - hasTradingHistory: ${hasTradingHistory}, yesShares: ${finalAmounts.yesShares}, noShares: ${finalAmounts.noShares}`
					);

					if (hasTradingHistory) {
						// Create market data in the format expected by the component
						const yesShares = finalAmounts.yesShares;
						const noShares = finalAmounts.noShares;

						marketsWithHistory.push({
							market,
							yes: yesShares.toString(),
							no: noShares.toString(),
						});
					}
				});

				if (marketsWithHistory.length > 0) {
					// Create umbrella object
					const umbrella = {
						_id: umbrellaId,
						displayName:
							resolvedMarkets[0]?.umbrellaName ||
							resolvedMarkets[0]?.displayName ||
							`Umbrella ${umbrellaId}`,
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString(),
						__v: 0,
					};

					filtered.push({ umbrella, markets: marketsWithHistory });
					console.log(
						`🔍 HISTORY DEBUG: Added umbrella ${umbrella.displayName} with ${marketsWithHistory.length} markets with history`
					);
				}
			}
		);

		console.log(
			"🔍 HISTORY DEBUG: Final filtered resolved markets:",
			filtered
		);
		return filtered;
	}, [resolvedMarketsByUmbrella, orders]);

	return (
		<div className="flex flex-col gap-8">
			{filteredResolvedMarkets.length === 0 ? (
				<div
					style={{
						textAlign: "center",
						padding: "40px",
						color: "#888",
					}}
				>
					<p>No resolved markets with trading history found.</p>
					<p style={{ fontSize: "14px", marginTop: "8px" }}>
						Only resolved markets where you have trading history
						will appear here.
					</p>
				</div>
			) : (
				<ScrollableTable minWidth="700px">
					<div
						className="grid items-center px-12 py-10"
						style={{
							gridTemplateColumns:
								"minmax(200px, 2fr) repeat(5, 1fr)",
							borderBottom: "1px solid #333333",
							color: "#888",
							fontSize: 12,
							textTransform: "uppercase",
							letterSpacing: 0.6,
						}}
					>
						<div>Market</div>
						<div style={{ textAlign: "center" }}>
							Final Position
						</div>
						<div style={{ textAlign: "center" }}>
							Settlement Payout
						</div>
						<div style={{ textAlign: "center" }}>Total Cost</div>
						<div style={{ textAlign: "center" }}>Total Payout</div>
						<div style={{ textAlign: "center" }}>
							<Tooltip
								content="Total return includes total payout of current positions and any past gains you have bought or sold."
								position="top"
							>
								Total Return
							</Tooltip>
						</div>
					</div>

					<div className="flex flex-col">
						{filteredResolvedMarkets.map(
							({ umbrella, markets }) => (
								<div
									key={umbrella._id}
									className="umbrella-block"
								>
									<div
										className="grid px-12 py-10"
										style={{
											gridTemplateColumns:
												"minmax(200px, 2fr) repeat(5, 1fr)",
											background: "#000000",
											borderBottom: "1px solid #1f1f1f",
											paddingTop: 16,
											paddingBottom: 16,
										}}
									>
										<div
											style={{
												gridColumn: "1 / -1",
												fontWeight: 700,
												color: "#dedede",
												fontSize: 20,
												display: "flex",
												alignItems: "center",
												gap: "12px",
											}}
										>
											<UmbrellaImage
												umbrella={umbrella}
											/>
											{umbrella.displayName}
										</div>
									</div>

									{markets.map(({ market, yes, no }) => {
										const yesNum = Number(yes);
										const noNum = Number(no);
										const qid =
											market._id ||
											market.questionId ||
											market.marketId;

										// Calculate final amounts for this market
										const finalAmounts = qid
											? getFinalAmount(orders, qid)
											: {
													yesShares: 0,
													noShares: 0,
													yesCost: 0,
													noCost: 0,
											  };

										// Get the resolved outcome to determine if user was correct
										const resolvedOutcome = String(
											(market as any).resolvedOutcome ||
												""
										).toLowerCase();

										const rows: {
											side: "Yes" | "No";
											amount: string;
										}[] = [];
										if (yesNum > 0)
											rows.push({
												side: "Yes",
												amount: yes,
											});
										if (noNum > 0)
											rows.push({
												side: "No",
												amount: no,
											});

										return rows.map(({ side, amount }) => {
											// Get final position and cost for this leg
											const finalShares =
												side === "Yes"
													? finalAmounts.yesShares
													: finalAmounts.noShares;
											const finalCost =
												side === "Yes"
													? finalAmounts.yesCost
													: finalAmounts.noCost;

											// Format shares - remove unnecessary decimals; show just the number (no label)
											const finalPositionText =
												finalShares > 0
													? `${
															finalShares % 1 ===
															0
																? finalShares.toFixed(
																		0
																  )
																: finalShares.toFixed(
																		2
																  )
													  }`
													: "—";

											// Format USDC cost - remove unnecessary decimals
											const totalCostText =
												finalCost > 0
													? `$${
															finalCost % 1 === 0
																? finalCost.toFixed(
																		0
																  )
																: finalCost.toFixed(
																		2
																  )
													  }`
													: "—";

											// Calculate settlement payout: $1 if user was correct, $0 if wrong
											const wasCorrect =
												(side === "Yes" &&
													resolvedOutcome ===
														"yes") ||
												(side === "No" &&
													resolvedOutcome === "no");
											const settlementPayout = wasCorrect
												? 1
												: 0;
											const settlementPayoutText =
												settlementPayout === 1
													? "$1"
													: "$0";

											// Calculate total payout: Final Position × Settlement Payout
											const totalPayout =
												finalShares * settlementPayout;
											const totalPayoutText =
												totalPayout > 0
													? `$${
															totalPayout % 1 ===
															0
																? totalPayout.toFixed(
																		0
																  )
																: totalPayout.toFixed(
																		2
																  )
													  }`
													: "$0";
											const totalPayoutColor =
												totalPayout > 0
													? "#16a34a"
													: "#fff"; // Green if positive, white if $0

											// Calculate total return using same logic as positions tab
											// baseReturn = totalPayout - effectiveCost (totalPayout is like marketValue)
											const effectiveCost = finalCost;
											const baseReturn =
												totalPayout === null ||
												effectiveCost === null
													? null
													: totalPayout -
													  effectiveCost;
											const realizedLegPnl = (() => {
												if (!qid) return 0;
												const legPnls =
													returnsByQid[qid];
												if (!legPnls) return 0;
												return side === "Yes"
													? legPnls.Yes || 0
													: legPnls.No || 0;
											})();
											const totalReturn =
												baseReturn === null
													? null
													: baseReturn +
													  realizedLegPnl;
											const totalReturnPct =
												totalReturn !== null &&
												effectiveCost &&
												effectiveCost > 0
													? (totalReturn /
															effectiveCost) *
													  100
													: null;
											const totalReturnColor =
												totalReturn === null
													? "#fff"
													: totalReturn >= 0
													? "#16a34a"
													: "#ef4444";
											const totalReturnText = (() => {
												if (
													totalReturn === null ||
													!isFinite(totalReturn)
												)
													return "—";
												const signUsd =
													totalReturn >= 0
														? "+"
														: "-";
												const usdPart = `$${
													Math.abs(totalReturn) %
														1 ===
													0
														? Math.abs(
																totalReturn
														  ).toFixed(0)
														: Math.abs(
																totalReturn
														  ).toFixed(2)
												}`;
												if (
													totalReturnPct === null ||
													!isFinite(totalReturnPct)
												) {
													return `${signUsd}${usdPart}`;
												}
												const signPct =
													totalReturnPct >= 0
														? "+"
														: "-";
												const pctPart = `${Math.round(
													Math.abs(totalReturnPct)
												)}%`;
												return `${signUsd}${usdPart} (${signPct}${pctPart})`;
											})();

											const title = (
												market?.displayName ||
												(market as any)?.question ||
												""
											).trim();
											const parts = title
												.split(/\s*vs\.?\s*/i)
												.map((s: string) => s.trim())
												.filter(Boolean);
											const isVs = parts.length === 2;
											return (
												<div
													key={`${
														market._id
													}-${side.toLowerCase()}`}
													className="grid items-center px-12 py-12"
													style={{
														gridTemplateColumns:
															"minmax(200px, 2fr) repeat(5, 1fr)",
														borderBottom:
															"1px solid #1f1f1f",
														fontSize: 16,
													}}
												>
													<div
														style={{
															color: "#fff",
															fontWeight: 600,
														}}
													>
														{isVs ? (
															<span>
																{side === "Yes"
																	? parts[0]
																	: parts[1]}
															</span>
														) : (
															<>
																<span>
																	{market.displayName ||
																		market.question}{" "}
																</span>
																<span
																	style={{
																		color:
																			side ===
																			"Yes"
																				? "#16a34a"
																				: "#ef4444",
																	}}
																>
																	{side}
																</span>
															</>
														)}
													</div>
													<div
														style={{
															textAlign: "center",
															color: "#fff",
														}}
													>
														{finalPositionText}
													</div>
													<div
														style={{
															textAlign: "center",
															color: "#fff",
														}}
													>
														{settlementPayoutText}
													</div>
													<div
														style={{
															textAlign: "center",
															color: "#fff",
														}}
													>
														{totalCostText}
													</div>
													<div
														style={{
															textAlign: "center",
															color: totalPayoutColor,
														}}
													>
														{totalPayoutText}
													</div>
													<div
														style={{
															textAlign: "center",
															color: totalReturnColor,
															fontWeight: "bold",
														}}
													>
														{totalReturnText}
													</div>
												</div>
											);
										});
									})}
								</div>
							)
						)}
					</div>
				</ScrollableTable>
			)}
		</div>
	);
}
