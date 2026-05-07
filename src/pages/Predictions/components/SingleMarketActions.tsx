import React, { useEffect } from "react";
import Button from "components/Button/Button";
import {
	shortenTeamLabelForButton,
	hexToRgba,
	getContrastingTextColor,
	oddsBarPercent,
} from "@/helpers/predictionUtils";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import {
	isPredictionPricingDebugEnabled,
	priceDebugLog,
} from "@/utils/debugPredictionPricing";
import { useOddsDisplay } from "@/context/OddsDisplayContext";

interface SingleMarketActionsProps {
	orderbook: any;
	onNavigate: (position: "yes" | "no") => void;
	question: PredictionMarket;
	isDailyPlayerCount?: boolean;
	umbrellaDisplayName?: string;
	/** When set from OddsMonitor venue-prices, overrides listing preview for that side */
	liveVenueYesPrice?: number | null;
	liveVenueNoPrice?: number | null;
	/** Compact list card: stacked rows, logo + name + price-only button */
	compact?: boolean;
	yesLogoSlot?: React.ReactNode;
	noLogoSlot?: React.ReactNode;
	/** Match-winner vs row: odds bar uses white fill when logo uses CSS invert on dark BG */
	yesInvertLogo?: boolean;
	noInvertLogo?: boolean;
}

export const SingleMarketActions: React.FC<SingleMarketActionsProps> = ({
	orderbook,
	onNavigate,
	question,
	isDailyPlayerCount = false,
	umbrellaDisplayName,
	liveVenueYesPrice,
	liveVenueNoPrice,
	compact = false,
	yesLogoSlot,
	noLogoSlot,
	yesInvertLogo = false,
	noInvertLogo = false,
}) => {
	const { formatPrice } = useOddsDisplay();
	const lookupKey = question?.questionId ?? question?._id;

	const yesPrice =
		typeof liveVenueYesPrice === "number" && Number.isFinite(liveVenueYesPrice)
			? liveVenueYesPrice
			: null;
	const noPrice =
		typeof liveVenueNoPrice === "number" && Number.isFinite(liveVenueNoPrice)
			? liveVenueNoPrice
			: null;

	const yesSource: "live_ws" | "none" =
		typeof liveVenueYesPrice === "number" && Number.isFinite(liveVenueYesPrice)
			? "live_ws"
			: "none";
	const noSource: "live_ws" | "none" =
		typeof liveVenueNoPrice === "number" && Number.isFinite(liveVenueNoPrice)
			? "live_ws"
			: "none";

	useEffect(() => {
		if (!isPredictionPricingDebugEnabled()) return;
		priceDebugLog("homepage SingleMarketActions displayed prices", {
			marketName: question?.displayName || question?.question,
			previewLookupKey: lookupKey ?? null,
			questionIdField: question?.questionId ?? null,
			mongoId: question?._id ?? null,
			dataSource: "venue-prices WS → MatchedMarket → listingBestYesNoFromMatched (PredictionCard)",
			liveVenueYesPrice: liveVenueYesPrice ?? null,
			liveVenueNoPrice: liveVenueNoPrice ?? null,
			finalYesPrice: yesPrice ?? null,
			finalNoPrice: noPrice ?? null,
			yesSource,
			noSource,
		});
	}, [
		lookupKey,
		question?.questionId,
		question?._id,
		question?.displayName,
		question?.question,
		liveVenueYesPrice,
		liveVenueNoPrice,
		yesPrice,
		noPrice,
		yesSource,
		noSource,
	]);

	const yesPriceCents =
		yesPrice !== null && yesPrice !== undefined ? formatPrice(yesPrice) : "--";
	const noPriceCents =
		noPrice !== null && noPrice !== undefined ? formatPrice(noPrice) : "--";

	const deriveLabels = (): {
		yesLabel: string;
		noLabel: string;
		settlementNumber: string | null;
	} => {
		if (isDailyPlayerCount) {
			const questionDisplay = (
				question?.displayName ||
				(question as any)?.question ||
				""
			).trim();
			const settlementNum = questionDisplay
				.replace(/^(Over|Under)\s*/i, "")
				.trim();
			return {
				yesLabel: "Over",
				noLabel: "Under",
				settlementNumber: settlementNum || null,
			};
		}

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

	const yesRowLabel = yesLabel;
	const noRowLabel = noLabel;

	const yesAriaLabel = `${yesLabel} ${yesPriceCents}`;
	const noAriaLabel = `${noLabel} ${noPriceCents}`;

	const settlementBlock =
		settlementNumber !== null ? (
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
		) : null;

	if (compact) {
		const yesBarPct = oddsBarPercent(yesPrice);
		const noBarPct = oddsBarPercent(noPrice);
		const yesBarColor = isVsSingle
			? yesInvertLogo
				? "#ffffff"
				: yesColor
			: "#22c55e";
		const noBarColor = isVsSingle
			? noInvertLogo
				? "#ffffff"
				: noColor
			: "#ef4444";

		return (
			<div className="single-market-actions single-market-actions--compact">
				{settlementBlock}
				<div className="prediction-card-outcome-rows">
					<div className="prediction-card-outcome-row">
						<div className="prediction-card-outcome-logo">
							{yesLogoSlot}
						</div>
						<div className="prediction-card-outcome-middle">
							<span className="prediction-card-outcome-label">
								{yesRowLabel}
							</span>
							{yesBarPct !== null ? (
								<div
									className="prediction-card-outcome-odds-bar"
									aria-hidden
								>
									<div
										className="prediction-card-outcome-odds-bar__fill"
										style={{
											width: `${yesBarPct}%`,
											backgroundColor: yesBarColor,
										}}
									/>
								</div>
							) : null}
						</div>
						<Button
							variant="secondary"
							className="action-button yes-button"
							aria-label={yesAriaLabel}
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
								padding: "10px 12px",
								minHeight: "44px",
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
							<strong>{yesPriceCents}</strong>
						</Button>
					</div>
					<div className="prediction-card-outcome-row">
						<div className="prediction-card-outcome-logo">
							{noLogoSlot}
						</div>
						<div className="prediction-card-outcome-middle">
							<span className="prediction-card-outcome-label">
								{noRowLabel}
							</span>
							{noBarPct !== null ? (
								<div
									className="prediction-card-outcome-odds-bar"
									aria-hidden
								>
									<div
										className="prediction-card-outcome-odds-bar__fill"
										style={{
											width: `${noBarPct}%`,
											backgroundColor: noBarColor,
										}}
									/>
								</div>
							) : null}
						</div>
						<Button
							variant="secondary"
							className="action-button no-button"
							aria-label={noAriaLabel}
							onClick={() => onNavigate("no")}
							style={{
								background: isVsSingle
									? noColor
									: "rgba(239, 68, 68, 0.1)",
								color: isVsSingle ? noTextColor : "#ef4444",
								border: `2px solid ${isVsSingle ? noColor : "#ef4444"}`,
								fontSize: "16px",
								padding: "10px 12px",
								minHeight: "44px",
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
							<strong>{noPriceCents}</strong>
						</Button>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="single-market-actions">
			{settlementBlock}
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
