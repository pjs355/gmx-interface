import React from "react";
import Button from "components/Button/Button";
import {
	toCentsString,
	shortenTeamLabelForButton,
	hexToRgba,
	getContrastingTextColor,
} from "@/helpers/predictionUtils";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import { usePredictionData } from "context/PredictionDataContext";

interface SingleMarketActionsProps {
	orderbook: any;
	onNavigate: (position: "yes" | "no") => void;
	question: PredictionMarket;
	isDailyPlayerCount?: boolean;
	umbrellaDisplayName?: string;
	/** When set from OddsMonitor venue-prices, overrides listing preview for that side */
	liveVenueYesPrice?: number | null;
	liveVenueNoPrice?: number | null;
}

export const SingleMarketActions: React.FC<SingleMarketActionsProps> = ({
	orderbook,
	onNavigate,
	question,
	isDailyPlayerCount = false,
	umbrellaDisplayName,
	liveVenueYesPrice,
	liveVenueNoPrice,
}) => {
	const { allBooksPreview } = usePredictionData();
	const questionId = question?.questionId;
	const preview = questionId ? allBooksPreview[questionId] : undefined;

	const yesPrice =
		typeof liveVenueYesPrice === "number" && Number.isFinite(liveVenueYesPrice)
			? liveVenueYesPrice
			: (preview?.bestYesPrice ?? preview?.lowestAsk ?? null);
	const noPrice =
		typeof liveVenueNoPrice === "number" && Number.isFinite(liveVenueNoPrice)
			? liveVenueNoPrice
			: (preview?.bestNoPrice ?? null);

	const yesPriceCents =
		yesPrice !== null && yesPrice !== undefined
			? `${toCentsString(yesPrice)}¢`
			: "--";
	const noPriceCents = noPrice !== null ? `${toCentsString(noPrice)}¢` : "--";

	// Derive team labels for single-market umbrellas with "vs" in the title
	const deriveLabels = (): {
		yesLabel: string;
		noLabel: string;
		settlementNumber: string | null;
	} => {
		// For daily player count markets, use Over/Under
		if (isDailyPlayerCount) {
			const questionDisplay = (
				question?.displayName ||
				(question as any)?.question ||
				""
			).trim();
			// Strip "Over" or "Under" prefix from the settlement number
			const settlementNum = questionDisplay
				.replace(/^(Over|Under)\s*/i, "")
				.trim();
			return {
				yesLabel: "Over",
				noLabel: "Under",
				settlementNumber: settlementNum || null,
			};
		}

		// Try umbrella name first (strip trailing " - Match Winner" etc.), then question name
		const umbrellaCleaned = (umbrellaDisplayName || "")
			.replace(/\s*-\s*Match Winner$/i, "")
			.trim();
		const raw =
			umbrellaCleaned ||
			(
				question?.displayName ||
				(question as any)?.question ||
				""
			).trim();
		if (!raw)
			return { yesLabel: "Yes", noLabel: "No", settlementNumber: null };
		const parts = raw
			.split(/\s*vs\.?\s*/i)
			.map((s: any) => s.trim())
			.filter(Boolean);
		if (parts.length === 2) {
			return {
				yesLabel: parts[0],
				noLabel: parts[1],
				settlementNumber: null,
			};
		}
		return { yesLabel: "Yes", noLabel: "No", settlementNumber: null };
	};

	const { yesLabel, noLabel, settlementNumber } = deriveLabels();

	const isVsSingle = (() => {
		const umbrellaCleaned = (umbrellaDisplayName || "")
			.replace(/\s*-\s*Match Winner$/i, "")
			.trim();
		const raw =
			umbrellaCleaned ||
			(
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

	const yesDisplayLabel = isVsSingle
		? shortenTeamLabelForButton(yesLabel)
		: yesLabel;
	const noDisplayLabel = isVsSingle
		? shortenTeamLabelForButton(noLabel)
		: noLabel;

	return (
		<div className="single-market-actions">
			{settlementNumber && (
				<div
					className="settlement-number"
					style={{
						textAlign: "center",
						marginBottom: "8px",
						fontSize: "20px",
						fontWeight: 600,
						color: "#ffffff",
					}}
				>
					{settlementNumber} Players
				</div>
			)}
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
					<strong
						style={{
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							gap: "6px",
							width: "100%",
							minWidth: 0,
						}}
					>
						<span
							style={{
								minWidth: 0,
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap",
							}}
						>
							{yesDisplayLabel}
						</span>
						<span style={{ flexShrink: 0 }}>{yesPriceCents}</span>
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
					<strong
						style={{
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							gap: "6px",
							width: "100%",
							minWidth: 0,
						}}
					>
						<span
							style={{
								minWidth: 0,
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap",
							}}
						>
							{noDisplayLabel}
						</span>
						<span style={{ flexShrink: 0 }}>{noPriceCents}</span>
					</strong>
				</Button>
			</div>
		</div>
	);
};
