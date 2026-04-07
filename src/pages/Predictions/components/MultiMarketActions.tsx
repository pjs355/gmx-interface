import React from "react";
import Button from "components/Button/Button";
import {
	toCentsString,
	truncateMarketName,
} from "@/helpers/predictionUtils";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import { usePredictionData } from "context/PredictionDataContext";

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
}

export const MultiMarketActions: React.FC<MultiMarketActionsProps> = ({
	umbrellaId,
	multiMarketData,
	onNavigate,
	onNavigateToUmbrella,
}) => {
	const { allBooksPreview } = usePredictionData();
	
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
		const marketsWithVolume = questions.map(question => {
			const questionId = question.questionId || question._id;
			const volume = getTotalVolume(questionId, orderbooks);
			
			return {
				question,
				volume,
			};
		}).sort((a, b) => {
			// Sort by highest volume first (descending order)
			return b.volume - a.volume;
		});
		
		return marketsWithVolume.slice(0, 2); // Return top 2
	}, [data, getTotalVolume]);

	const totalMarkets = data?.questions?.length || 0;
	const hasMoreMarkets = totalMarkets > 2;

	return (
		<div className="multi-market-actions">
			{topMarkets.map((marketData, index) => {
				const { question } = marketData;
				const questionId = question.questionId || question._id;
				const preview = questionId
					? allBooksPreview[questionId]
					: undefined;

			// Best price across all venues, falling back to LevelUp-only orderbook price
			const yesPrice =
				preview?.bestYesPrice ??
				preview?.lowestAsk ??
				(preview?.bestNoPrice != null ? 1 - preview.bestNoPrice : null);
			const noPrice =
				preview?.bestNoPrice ??
				(yesPrice != null ? 1 - yesPrice : null);

				const yesCents =
					yesPrice !== null && yesPrice !== undefined
						? `${toCentsString(yesPrice)}¢`
						: "--";
				const noCents = noPrice !== null ? `${toCentsString(noPrice)}¢` : "--";

				return (
					<div
						key={question._id || question.questionId || index}
						className="market-row"
					>
						<div className="market-info">
							<span className="market-name">
								{truncateMarketName(
									question.displayName || question.question
								)}
							</span>
						</div>
						<div className="market-buttons">
							<Button
								variant="secondary"
								className="action-button yes-button"
								onClick={() => onNavigate(question, "yes")}
								style={{
									background: "rgba(34, 197, 94, 0.1)",
									color: "#22c55e",
									border: "2px solid #22c55e",
									marginRight: "8px",
									fontSize: "16px",
									padding: "10px 16px",
									minHeight: "42px",
									width: "100px",
									flex: "0 0 100px",
									textAlign: "center",
								}}
								onMouseEnter={(e) => {
									e.currentTarget.style.background =
										"rgba(34, 197, 94, 0.2)";
									e.currentTarget.style.transform =
										"translateY(-1px)";
									e.currentTarget.style.boxShadow =
										"0 4px 8px rgba(34, 197, 94, 0.3)";
								}}
								onMouseLeave={(e) => {
									e.currentTarget.style.background =
										"rgba(34, 197, 94, 0.1)";
									e.currentTarget.style.transform =
										"translateY(0)";
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
									background: "rgba(239, 68, 68, 0.1)",
									color: "#ef4444",
									border: "2px solid #ef4444",
									fontSize: "16px",
									padding: "10px 16px",
									minHeight: "42px",
									width: "100px",
									flex: "0 0 100px",
									textAlign: "center",
								}}
								onMouseEnter={(e) => {
									e.currentTarget.style.background =
										"rgba(239, 68, 68, 0.2)";
									e.currentTarget.style.transform =
										"translateY(-1px)";
									e.currentTarget.style.boxShadow =
										"0 4px 8px rgba(239, 68, 68, 0.3)";
								}}
								onMouseLeave={(e) => {
									e.currentTarget.style.background =
										"rgba(239, 68, 68, 0.1)";
									e.currentTarget.style.transform =
										"translateY(0)";
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
					onClick={onNavigateToUmbrella}
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
