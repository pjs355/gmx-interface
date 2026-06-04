import React, { useMemo, useState, useEffect } from "react";
import Button from "components/Button/Button";
import { hexToRgba, getContrastingTextColor } from "@/features/markets/presentation/teamColors";
import { oddsBarPercent } from "@/features/markets/pricing/orderbookDisplayPrices";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import { useMatchVenuePrices, useOddsMonitor } from "@/context/OddsMonitorContext";
import { listingBestYesNoFromMatched } from "@/features/markets/listing/listingVenuePrices";
import {
	groupWinnerLegColor,
	groupWinnerLegLabel,
	isGroupWinnerOtherLeg,
	orderGroupWinnerLegs,
} from "@/features/markets/listing/groupWinner";
import { useOddsDisplay } from "@/context/OddsDisplayContext";

interface GroupWinnerActionsProps {
	umbrellaId: string;
	multiMarketData: {
		[umbrellaId: string]: {
			questions: PredictionMarket[];
			orderbooks: { [questionId: string]: any };
		};
	};
	onNavigate: (question: PredictionMarket, position: "yes" | "no") => void;
}

/**
 * Home-card actions for a FIFA World Cup "Group X Winner" umbrella (N team legs,
 * no Draw). One outcome row per team (flag + name + YES price). Each leg is its
 * own binary Polymarket market, so each row looks up its own cross-venue YES
 * price by `polymarketMarketId`. Row click opens that leg's trade box.
 */
export const GroupWinnerActions: React.FC<GroupWinnerActionsProps> = ({
	umbrellaId,
	multiMarketData,
	onNavigate,
}) => {
	const data = multiMarketData[umbrellaId];
	const legs = useMemo(
		() => (data?.questions ? orderGroupWinnerLegs(data.questions) : []),
		[data?.questions],
	);

	return (
		<div className="single-market-actions single-market-actions--compact">
			<div className="prediction-card-outcome-rows">
				{legs.map((question, index) => (
					<GroupWinnerLegRow
						key={question._id || question.questionId || question.polymarketMarketId}
						question={question}
						index={index}
						onNavigate={onNavigate}
					/>
				))}
			</div>
		</div>
	);
};

interface GroupWinnerLegRowProps {
	question: PredictionMarket;
	index: number;
	onNavigate: (question: PredictionMarket, position: "yes" | "no") => void;
}

const GroupWinnerLegRow: React.FC<GroupWinnerLegRowProps> = ({ question, index, onNavigate }) => {
	const { formatPrice } = useOddsDisplay();
	const { appState } = useOddsMonitor();

	const legKey =
		typeof question.polymarketMarketId === "string" ? question.polymarketMarketId.trim() : "";
	// Per-leg lookup keyed solely by polymarketMarketId (no umbrellaId).
	const matched = useMatchVenuePrices(legKey || null, null);
	const { yes } = useMemo(
		() => listingBestYesNoFromMatched(matched),
		[matched, appState?.timestamp],
	);

	const yesPrice = typeof yes === "number" && Number.isFinite(yes) ? yes : null;
	const yesCents = yesPrice !== null ? formatPrice(yesPrice) : "--";

	const isOther = isGroupWinnerOtherLeg(question);
	const yesColor = groupWinnerLegColor(question, index);
	const yesTextColor = getContrastingTextColor(yesColor);

	const label = groupWinnerLegLabel(question);
	const yesBarPct = oddsBarPercent(yesPrice);
	const logoUrl =
		typeof question.image === "string" && question.image.trim() !== ""
			? question.image.trim()
			: null;

	return (
		<div className="prediction-card-outcome-row">
			<div className="prediction-card-outcome-logo">
				<OutcomeLogo src={logoUrl} alt={label} grey={isOther} />
			</div>
			<div className="prediction-card-outcome-middle">
				<span className="prediction-card-outcome-label">{label}</span>
				{yesBarPct !== null ? (
					<div className="prediction-card-outcome-odds-bar" aria-hidden>
						<div
							className="prediction-card-outcome-odds-bar__fill"
							style={{ width: `${yesBarPct}%`, backgroundColor: yesColor }}
						/>
					</div>
				) : null}
			</div>
			<Button
				variant="secondary"
				className="action-button yes-button"
				aria-label={`${label} ${yesCents}`}
				onClick={() => onNavigate(question, "yes")}
				style={{
					background: yesColor,
					color: yesTextColor,
					border: `2px solid ${yesColor}`,
					fontSize: "16px",
					padding: "10px 12px",
					minHeight: "44px",
					textAlign: "center",
				}}
				onMouseEnter={(e) => {
					e.currentTarget.style.transform = "translateY(-1px)";
					e.currentTarget.style.boxShadow = `0 4px 8px ${hexToRgba(yesColor, 0.45)}`;
					e.currentTarget.style.color = yesTextColor;
				}}
				onMouseLeave={(e) => {
					e.currentTarget.style.transform = "translateY(0)";
					e.currentTarget.style.boxShadow = "none";
					e.currentTarget.style.color = yesTextColor;
				}}
			>
				<strong>{yesCents}</strong>
			</Button>
		</div>
	);
};

const OutcomeLogo: React.FC<{ src: string | null; alt: string; grey?: boolean }> = ({
	src,
	alt,
	grey = false,
}) => {
	const [errored, setErrored] = useState(false);
	useEffect(() => {
		setErrored(false);
	}, [src]);
	if (!src || errored) return null;
	return (
		<img
			className={
				grey
					? "prediction-card-outcome-logo-img prediction-card-outcome-logo-img--draw"
					: "prediction-card-outcome-logo-img"
			}
			src={src}
			alt={alt}
			onError={() => setErrored(true)}
		/>
	);
};
