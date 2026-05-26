import React, { useEffect } from "react";
import Button from "components/Button/Button";
import { truncateMarketName } from "@/features/markets/presentation/marketLabels";
import {
	hexToRgba,
	getContrastingTextColor,
	mixHexOnBlack,
} from "@/features/markets/presentation/teamColors";
import { oddsBarPercent } from "@/features/markets/pricing/orderbookDisplayPrices";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import {
	isPredictionPricingDebugEnabled,
	priceDebugLog,
} from "@/features/markets/odds-monitor/debugPredictionPricing";
import { useOddsDisplay } from "@/context/OddsDisplayContext";

interface MultiMarketActionsProps {
	umbrellaId: string;
	multiMarketData: {
		[umbrellaId: string]: {
			questions: PredictionMarket[];
			orderbooks: { [questionId: string]: any };
		};
	};
	onNavigate: (question: PredictionMarket, position: "yes" | "no") => void;
	onNavigateToUmbrella?: () => void;
	/** When set from OddsMonitor venue-prices, overrides listing preview for both rows */
	liveVenueYesPrice?: number | null;
	liveVenueNoPrice?: number | null;
	compact?: boolean;
}

export const MultiMarketActions: React.FC<MultiMarketActionsProps> = ({
	umbrellaId,
	multiMarketData,
	onNavigate,
	onNavigateToUmbrella,
	liveVenueYesPrice,
	liveVenueNoPrice,
	compact = false,
}) => {
	const { formatPrice } = useOddsDisplay();

	// Helper to calculate total volume from orderbook data
	// Volume = sum of all sizes in bids + asks
	const getTotalVolume = React.useCallback((questionId: string, orderbooks: any) => {
		const orderbook = orderbooks[questionId];
		if (!orderbook) return 0;

		let totalVolume = 0;

		// Sum ask sizes
		if (orderbook.asks && Array.isArray(orderbook.asks)) {
			for (const ask of orderbook.asks) {
				if (typeof ask.size === "number") {
					totalVolume += ask.size;
				}
			}
		}

		// Sum bid sizes
		if (orderbook.bids && Array.isArray(orderbook.bids)) {
			for (const bid of orderbook.bids) {
				if (typeof bid.size === "number") {
					totalVolume += bid.size;
				}
			}
		}

		return totalVolume;
	}, []);

	// Get top 2 markets by highest trading volume
	const data = multiMarketData[umbrellaId];
	const topMarkets = React.useMemo(() => {
		if (!data) return [];

		const { questions, orderbooks } = data;

		// Calculate volume and sort by highest volume first
		const marketsWithVolume = questions
			.map((question) => {
				const questionId = question.questionId || question._id;
				const volume = getTotalVolume(questionId, orderbooks);

				return {
					question,
					volume,
				};
			})
			.sort((a, b) => {
				// Sort by highest volume first (descending order)
				return b.volume - a.volume;
			});

		return marketsWithVolume.slice(0, 2); // Return top 2
	}, [data, getTotalVolume]);

	const totalMarkets = data?.questions?.length || 0;
	const hasMoreMarkets = totalMarkets > 2;

	const liveYesFinite = typeof liveVenueYesPrice === "number" && Number.isFinite(liveVenueYesPrice);
	const liveNoFinite = typeof liveVenueNoPrice === "number" && Number.isFinite(liveVenueNoPrice);

	useEffect(() => {
		if (!isPredictionPricingDebugEnabled()) return;
		topMarkets.forEach((marketData, index) => {
			const { question } = marketData;
			const qid = question.questionId || question._id;
			const yesPrice = liveYesFinite ? liveVenueYesPrice! : null;
			const noPrice = liveNoFinite ? liveVenueNoPrice! : null;
			priceDebugLog(`homepage MultiMarketActions row ${index}`, {
				umbrellaId,
				marketName: question.displayName || question.question,
				lookupQuestionId: qid ?? null,
				mongoId: question._id ?? null,
				liveWsOverridesBothRows: liveYesFinite || liveNoFinite,
				noteWhenLive:
					"When live WS YES/NO are set, the same values apply to every top-2 row (match-level best, not per-question).",
				dataSource:
					"venue-prices WS → MatchedMarket → listingBestYesNoFromMatched (PredictionCard)",
				liveVenueYesPrice: liveVenueYesPrice ?? null,
				liveVenueNoPrice: liveVenueNoPrice ?? null,
				finalYesPrice: yesPrice ?? null,
				finalNoPrice: noPrice ?? null,
				yesSource: liveYesFinite ? "live_ws" : "none",
				noSource: liveNoFinite ? "live_ws" : "none",
			});
		});
	}, [umbrellaId, topMarkets, liveVenueYesPrice, liveVenueNoPrice, liveYesFinite, liveNoFinite]);

	return (
		<div
			className={
				compact ? "multi-market-actions multi-market-actions--compact" : "multi-market-actions"
			}
		>
			{topMarkets.map((marketData, index) => {
				const { question } = marketData;

				const yesPrice =
					typeof liveVenueYesPrice === "number" && Number.isFinite(liveVenueYesPrice)
						? liveVenueYesPrice
						: null;
				const noPrice =
					typeof liveVenueNoPrice === "number" && Number.isFinite(liveVenueNoPrice)
						? liveVenueNoPrice
						: null;

				const yesCents = yesPrice !== null && yesPrice !== undefined ? formatPrice(yesPrice) : "--";
				const noCents = noPrice !== null && noPrice !== undefined ? formatPrice(noPrice) : "--";

				const rawYes = (question as any)?.yesColor;
				const rawNo = (question as any)?.noColor;
				const yesColor =
					typeof rawYes === "string" && rawYes.trim() !== "" ? rawYes.trim() : "#22c55e";
				const noColor = typeof rawNo === "string" && rawNo.trim() !== "" ? rawNo.trim() : "#ef4444";
				const yesTextIdle = getContrastingTextColor(mixHexOnBlack(yesColor, 0.1));
				const yesTextHover = getContrastingTextColor(mixHexOnBlack(yesColor, 0.2));
				const noTextIdle = getContrastingTextColor(mixHexOnBlack(noColor, 0.1));
				const noTextHover = getContrastingTextColor(mixHexOnBlack(noColor, 0.2));

				const marketTitle = truncateMarketName(question.displayName || question.question);

				if (compact) {
					const yesAria = `Yes ${marketTitle} ${yesCents}`;
					const noAria = `No ${marketTitle} ${noCents}`;
					const yesBarPct = oddsBarPercent(yesPrice);
					const noBarPct = oddsBarPercent(noPrice);
					return (
						<div key={question._id || question.questionId || index} className="multi-market-block">
							<div className="multi-market-actions__market-title">{marketTitle}</div>
							<div className="prediction-card-outcome-rows">
								<div className="prediction-card-outcome-row">
									<div className="prediction-card-outcome-logo" />
									<div className="prediction-card-outcome-middle">
										<span className="prediction-card-outcome-label">Yes</span>
										{yesBarPct !== null ? (
											<div className="prediction-card-outcome-odds-bar" aria-hidden>
												<div
													className="prediction-card-outcome-odds-bar__fill"
													style={{
														width: `${yesBarPct}%`,
														backgroundColor: yesColor,
													}}
												/>
											</div>
										) : null}
									</div>
									<Button
										variant="secondary"
										className="action-button yes-button"
										aria-label={yesAria}
										onClick={() => onNavigate(question, "yes")}
										style={{
											background: hexToRgba(yesColor, 0.1),
											color: yesTextIdle,
											border: `2px solid ${yesColor}`,
											fontSize: "16px",
											padding: "10px 12px",
											minHeight: "44px",
											textAlign: "center",
										}}
										onMouseEnter={(e) => {
											e.currentTarget.style.background = hexToRgba(yesColor, 0.2);
											e.currentTarget.style.color = yesTextHover;
											e.currentTarget.style.transform = "translateY(-1px)";
											e.currentTarget.style.boxShadow = `0 4px 8px ${hexToRgba(yesColor, 0.3)}`;
										}}
										onMouseLeave={(e) => {
											e.currentTarget.style.background = hexToRgba(yesColor, 0.1);
											e.currentTarget.style.color = yesTextIdle;
											e.currentTarget.style.transform = "translateY(0)";
											e.currentTarget.style.boxShadow = "none";
										}}
									>
										<strong>{yesCents}</strong>
									</Button>
								</div>
								<div className="prediction-card-outcome-row">
									<div className="prediction-card-outcome-logo" />
									<div className="prediction-card-outcome-middle">
										<span className="prediction-card-outcome-label">No</span>
										{noBarPct !== null ? (
											<div className="prediction-card-outcome-odds-bar" aria-hidden>
												<div
													className="prediction-card-outcome-odds-bar__fill"
													style={{
														width: `${noBarPct}%`,
														backgroundColor: noColor,
													}}
												/>
											</div>
										) : null}
									</div>
									<Button
										variant="secondary"
										className="action-button no-button"
										aria-label={noAria}
										onClick={() => onNavigate(question, "no")}
										style={{
											background: hexToRgba(noColor, 0.1),
											color: noTextIdle,
											border: `2px solid ${noColor}`,
											fontSize: "16px",
											padding: "10px 12px",
											minHeight: "44px",
											textAlign: "center",
										}}
										onMouseEnter={(e) => {
											e.currentTarget.style.background = hexToRgba(noColor, 0.2);
											e.currentTarget.style.color = noTextHover;
											e.currentTarget.style.transform = "translateY(-1px)";
											e.currentTarget.style.boxShadow = `0 4px 8px ${hexToRgba(noColor, 0.3)}`;
										}}
										onMouseLeave={(e) => {
											e.currentTarget.style.background = hexToRgba(noColor, 0.1);
											e.currentTarget.style.color = noTextIdle;
											e.currentTarget.style.transform = "translateY(0)";
											e.currentTarget.style.boxShadow = "none";
										}}
									>
										<strong>{noCents}</strong>
									</Button>
								</div>
							</div>
						</div>
					);
				}

				return (
					<div key={question._id || question.questionId || index} className="market-row">
						<div className="market-info">
							<span className="market-name">{marketTitle}</span>
						</div>
						<div className="market-buttons">
							<Button
								variant="secondary"
								className="action-button yes-button"
								onClick={() => onNavigate(question, "yes")}
								style={{
									background: hexToRgba(yesColor, 0.1),
									color: yesTextIdle,
									border: `2px solid ${yesColor}`,
									marginRight: "8px",
									fontSize: "16px",
									padding: "10px 16px",
									minHeight: "42px",
									width: "100px",
									flex: "0 0 100px",
									textAlign: "center",
								}}
								onMouseEnter={(e) => {
									e.currentTarget.style.background = hexToRgba(yesColor, 0.2);
									e.currentTarget.style.color = yesTextHover;
									e.currentTarget.style.transform = "translateY(-1px)";
									e.currentTarget.style.boxShadow = `0 4px 8px ${hexToRgba(yesColor, 0.3)}`;
								}}
								onMouseLeave={(e) => {
									e.currentTarget.style.background = hexToRgba(yesColor, 0.1);
									e.currentTarget.style.color = yesTextIdle;
									e.currentTarget.style.transform = "translateY(0)";
									e.currentTarget.style.boxShadow = "none";
								}}
							>
								<strong>Yes {yesCents}</strong>
							</Button>
							<Button
								variant="secondary"
								className="action-button no-button"
								onClick={() => onNavigate(question, "no")}
								style={{
									background: hexToRgba(noColor, 0.1),
									color: noTextIdle,
									border: `2px solid ${noColor}`,
									fontSize: "16px",
									padding: "10px 16px",
									minHeight: "42px",
									width: "100px",
									flex: "0 0 100px",
									textAlign: "center",
								}}
								onMouseEnter={(e) => {
									e.currentTarget.style.background = hexToRgba(noColor, 0.2);
									e.currentTarget.style.color = noTextHover;
									e.currentTarget.style.transform = "translateY(-1px)";
									e.currentTarget.style.boxShadow = `0 4px 8px ${hexToRgba(noColor, 0.3)}`;
								}}
								onMouseLeave={(e) => {
									e.currentTarget.style.background = hexToRgba(noColor, 0.1);
									e.currentTarget.style.color = noTextIdle;
									e.currentTarget.style.transform = "translateY(0)";
									e.currentTarget.style.boxShadow = "none";
								}}
							>
								<strong>No {noCents}</strong>
							</Button>
						</div>
					</div>
				);
			})}

			{hasMoreMarkets && onNavigateToUmbrella && (
				<div
					className="view-more-markets"
					onClick={(e) => {
						e.stopPropagation();
						onNavigateToUmbrella();
					}}
				>
					<span>View more</span>
					<svg
						width="12"
						height="12"
						viewBox="0 0 12 12"
						fill="none"
						xmlns="http://www.w3.org/2000/svg"
					>
						<path
							d="M3 4.5L6 7.5L9 4.5"
							stroke="currentColor"
							strokeWidth="1.5"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					</svg>
				</div>
			)}
		</div>
	);
};
