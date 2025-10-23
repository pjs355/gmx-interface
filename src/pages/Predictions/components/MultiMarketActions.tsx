import React from "react";
import Button from "components/Button/Button";
import {
	calculateOrderbookPrices,
	toCentsString,
	getTopTwoMarkets,
	truncateMarketName,
} from "../utils/predictionUtils";
import type { PredictionMarket } from "lib/predictionMarketDataService";

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
	const topMarkets = getTopTwoMarkets(umbrellaId, multiMarketData);

	return (
		<div className="multi-market-actions">
			{topMarkets.map((marketData, index) => {
				const { question } = marketData;
				const yesHistoricalPrices = question.historicalPricesYes;

				const noHistoricalPrices = question.historicalPricesNo;

				const lastYes =
					yesHistoricalPrices[yesHistoricalPrices.length - 1];
				const lastNo =
					noHistoricalPrices[noHistoricalPrices.length - 1];
				const yesCents = toCentsString(lastYes?.price || 0);
				const noCents = toCentsString(lastNo?.price || 0);

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
