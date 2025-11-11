import React from "react";
import Button from "components/Button/Button";
import {
	calculateOrderbookPrices,
	toCentsString,
} from "@/helpers/predictionUtils";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import { usePredictionData } from "context/PredictionDataContext";

interface SingleMarketActionsProps {
	orderbook: any;
	onNavigate: (position: "yes" | "no") => void;
	question: PredictionMarket;
}

export const SingleMarketActions: React.FC<SingleMarketActionsProps> = ({
	orderbook,
	onNavigate,
	question,
}) => {
	const { allBooksPreview } = usePredictionData();
	const questionId = question.questionId;
	const preview = questionId ? allBooksPreview[questionId] : undefined;

	// Use preview data for prices (lowestAsk = Yes price, highestBid for No calculation)
	const yesPrice = preview?.lowestAsk;
	const noPrice =
		preview?.highestBid !== null && preview?.highestBid !== undefined
			? 1 - preview.highestBid
			: null;

	const yesPriceCents =
		yesPrice !== null && yesPrice !== undefined
			? toCentsString(yesPrice)
			: "—";
	const noPriceCents = noPrice !== null ? toCentsString(noPrice) : "—";

	const hexToRgba = (hex?: string, alpha: number = 0.3): string => {
		if (!hex) return `rgba(0,0,0,${alpha})`;
		const cleaned = hex.replace("#", "");
		const full =
			cleaned.length === 3
				? cleaned
						.split("")
						.map((c) => c + c)
						.join("")
				: cleaned;
		const r = parseInt(full.substring(0, 2), 16) || 0;
		const g = parseInt(full.substring(2, 4), 16) || 0;
		const b = parseInt(full.substring(4, 6), 16) || 0;
		return `rgba(${r}, ${g}, ${b}, ${alpha})`;
	};

	const getContrastingTextColor = (hex?: string): string => {
		if (!hex) return "#ffffff";
		let cleaned = hex.trim().replace("#", "");
		if (cleaned.length === 3) {
			cleaned = cleaned
				.split("")
				.map((c) => c + c)
				.join("");
		}
		if (cleaned.length !== 6) {
			return "#ffffff";
		}
		const r = parseInt(cleaned.substring(0, 2), 16) / 255;
		const g = parseInt(cleaned.substring(2, 4), 16) / 255;
		const b = parseInt(cleaned.substring(4, 6), 16) / 255;
		const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
		return luminance > 0.6 ? "#000000" : "#ffffff";
	};

	// Derive team labels for single-market umbrellas with "vs" in the title
	const deriveLabels = (): { yesLabel: string; noLabel: string } => {
		const raw = (
			question?.displayName ||
			(question as any)?.question ||
			""
		).trim();
		if (!raw) return { yesLabel: "Yes", noLabel: "No" };
		const parts = raw
			.split(/\s*vs\.?\s*/i)
			.map((s: any) => s.trim())
			.filter(Boolean);
		if (parts.length === 2) {
			return { yesLabel: parts[0], noLabel: parts[1] };
		}
		return { yesLabel: "Yes", noLabel: "No" };
	};

	const { yesLabel, noLabel } = deriveLabels();

	const isVsSingle = (() => {
		const raw = (
			question?.displayName ||
			(question as any)?.question ||
			""
		).trim();
		const parts = raw
			.split(/\s*vs\.?\s*/i)
			.map((s: any) => s.trim())
			.filter(Boolean);
		return Boolean(question && parts.length === 2);
	})();
	const yesColor = (question as any)?.yesColor || "#22c55e";
	const noColor = (question as any)?.noColor || "#ef4444";
	const yesTextColor = getContrastingTextColor(yesColor);
	const noTextColor = getContrastingTextColor(noColor);

	// Calculate payouts for $100 bet using preview data
	const betAmount = 100;
	const yesPayout =
		yesPrice !== null && yesPrice !== undefined && yesPrice > 0
			? Math.round(betAmount / yesPrice)
			: 0;
	const noPayout =
		preview?.highestBid !== null &&
		preview?.highestBid !== undefined &&
		preview.highestBid < 1
			? Math.round(betAmount / (1 - preview.highestBid))
			: 0;
	return (
		<div className="single-market-actions">
			<div className="single-market-buttons">
				<Button
					variant="secondary"
					className="action-button yes-button"
					onClick={() => onNavigate("yes")}
					style={{
						background: isVsSingle
							? yesColor
							: "rgba(34, 197, 94, 0.1)",
						color: isVsSingle ? yesTextColor : "#22c55e",
						border: `2px solid ${
							isVsSingle ? yesColor : "#22c55e"
						}`,
						fontSize: "16px",
						padding: "12px 24px",
						minHeight: "48px",
						width: "100%",
					}}
					onMouseEnter={(e) => {
						e.currentTarget.style.background = isVsSingle
							? yesColor
							: "rgba(34, 197, 94, 0.2)";
						e.currentTarget.style.transform = "translateY(-1px)";
						e.currentTarget.style.boxShadow = isVsSingle
							? `0 4px 8px ${hexToRgba(yesColor, 0.45)}`
							: "0 4px 8px rgba(34, 197, 94, 0.3)";
						if (isVsSingle) {
							e.currentTarget.style.color = yesTextColor;
						}
					}}
					onMouseLeave={(e) => {
						e.currentTarget.style.background = isVsSingle
							? yesColor
							: "rgba(34, 197, 94, 0.1)";
						e.currentTarget.style.transform = "translateY(0)";
						e.currentTarget.style.boxShadow = "none";
						if (isVsSingle) {
							e.currentTarget.style.color = yesTextColor;
						}
					}}
				>
					<strong>
						{yesLabel} {yesPriceCents}¢
					</strong>
				</Button>
				<Button
					variant="secondary"
					className="action-button no-button"
					onClick={() => onNavigate("no")}
					style={{
						background: isVsSingle
							? noColor
							: "rgba(239, 68, 68, 0.1)",
						color: isVsSingle ? noTextColor : "#ef4444",
						border: `2px solid ${isVsSingle ? noColor : "#ef4444"}`,
						fontSize: "16px",
						padding: "12px 24px",
						minHeight: "48px",
						width: "100%",
					}}
					onMouseEnter={(e) => {
						e.currentTarget.style.background = isVsSingle
							? noColor
							: "rgba(239, 68, 68, 0.2)";
						e.currentTarget.style.transform = "translateY(-1px)";
						e.currentTarget.style.boxShadow = isVsSingle
							? `0 4px 8px ${hexToRgba(noColor, 0.45)}`
							: "0 4px 8px rgba(239, 68, 68, 0.3)";
						if (isVsSingle) {
							e.currentTarget.style.color = noTextColor;
						}
					}}
					onMouseLeave={(e) => {
						e.currentTarget.style.background = isVsSingle
							? noColor
							: "rgba(239, 68, 68, 0.1)";
						e.currentTarget.style.transform = "translateY(0)";
						e.currentTarget.style.boxShadow = "none";
						if (isVsSingle) {
							e.currentTarget.style.color = noTextColor;
						}
					}}
				>
					<strong>
						{noLabel} {noPriceCents}¢
					</strong>
				</Button>
			</div>

	<div className="payout-info">
		<div className="payout-row">
			<span className="payout-label">
				$100 → <span style={{ color: "#22c55e" }}>${yesPayout}</span>
			</span>
		</div>
		<div className="payout-row">
			<span className="payout-label">
				$100 → <span style={{ color: "#22c55e" }}>${noPayout}</span>
			</span>
		</div>
	</div>
		</div>
	);
};
