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
}

export const MultiMarketActions: React.FC<MultiMarketActionsProps> = ({
	umbrellaId,
	multiMarketData,
	onNavigate,
}) => {
	const { allBooksPreview } = usePredictionData();
	
	// Helper to get lowestAsk from WebSocket orderbook data
	const getLowestAsk = React.useCallback((questionId: string, orderbooks: any) => {
		const orderbook = orderbooks[questionId];
		if (!orderbook?.asks || orderbook.asks.length === 0) return null;
		return Math.min(...orderbook.asks.map((a: any) => a.price));
	}, []);
	
	// Get top 2 markets using allBooksPreview with WebSocket fallback
	const data = multiMarketData[umbrellaId];
	const topMarkets = React.useMemo(() => {
		if (!data) return [];
		
		const { questions, orderbooks } = data;
		
		// Calculate Yes prices from allBooksPreview (with WebSocket fallback) and sort by highest
		const marketsWithPrices = questions.map(question => {
			const questionId = question.questionId || question._id;
			const preview = questionId ? allBooksPreview[questionId] : undefined;
			// Try allBooksPreview first, fallback to WebSocket orderbook
			const yesPrice = preview?.lowestAsk ?? getLowestAsk(questionId, orderbooks);
			
			return {
				question,
				yesPrice,
			};
		}).sort((a, b) => {
			// Sort by highest Yes price first, handle nulls by putting them at the end
			if (a.yesPrice === null && b.yesPrice === null) return 0;
			if (a.yesPrice === null) return 1;
			if (b.yesPrice === null) return -1;
			return b.yesPrice - a.yesPrice;
		});
		
		return marketsWithPrices.slice(0, 2); // Return top 2
	}, [data, allBooksPreview, getLowestAsk]);

	return (
		<div className="multi-market-actions">
			{topMarkets.map((marketData, index) => {
				const { question } = marketData;
				const questionId = question.questionId || question._id;
				const preview = questionId
					? allBooksPreview[questionId]
					: undefined;

				// Use preview data for prices (lowestAsk = Yes price, highestBid for No calculation)
				const yesPrice = preview?.lowestAsk;
				const noPrice =
					preview?.highestBid !== null &&
					preview?.highestBid !== undefined
						? 1 - preview.highestBid
						: null;

				const yesCents =
					yesPrice !== null && yesPrice !== undefined
						? toCentsString(yesPrice)
						: "—";
				const noCents = noPrice !== null ? toCentsString(noPrice) : "—";

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
								<strong>Yes {yesCents}¢</strong>
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
								<strong>No {noCents}¢</strong>
							</Button>
						</div>
					</div>
				);
			})}
		</div>
	);
};
