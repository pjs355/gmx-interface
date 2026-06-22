import React, { useMemo, useState, useEffect } from "react";
import Button from "components/Button/Button";
import { hexToRgba, getContrastingTextColor } from "@/features/markets/presentation/teamColors";
import { oddsBarPercent } from "@/features/markets/pricing/orderbookDisplayPrices";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import { useMatchVenuePrices, useOddsMonitor } from "@/context/OddsMonitorContext";
import { listingBestYesNoFromMatched, findMatchedByPolymarketMarketId } from "@/features/markets/listing/listingVenuePrices";
import {
	isMultiLegOtherLeg,
	multiLegLegColor,
	multiLegLegImage,
	multiLegLegLabel,
	orderMultiLegs,
	resolveTopN,
	type MultiLegLayoutProfile,
} from "@/features/markets/listing/multiLegMarket";
import type { UmbrellaTeamMapping } from "@/services/api/umbrellaDataService";
import { useOddsDisplay } from "@/context/OddsDisplayContext";
import { usePredictionData } from "@/context/PredictionDataContext";

interface MultiLegHomeActionsProps {
	umbrellaId: string;
	layout: MultiLegLayoutProfile;
	teamMappings?: UmbrellaTeamMapping[] | null;
	multiMarketData: {
		[umbrellaId: string]: {
			questions: PredictionMarket[];
			orderbooks: { [questionId: string]: unknown };
		};
	};
	onNavigate: (question: PredictionMarket, position: "yes" | "no") => void;
}

export const MultiLegHomeActions: React.FC<MultiLegHomeActionsProps> = ({
	umbrellaId,
	layout,
	teamMappings,
	multiMarketData,
	onNavigate,
}) => {
	const { fifaGameTeamColorBySlug } = usePredictionData();
	const { appState } = useOddsMonitor();
	const data = multiMarketData[umbrellaId];

	const { ordered, visible, hiddenCount } = useMemo(() => {
		const questions = data?.questions ?? [];
		const yesPriceByMarketId = new Map<string, number>();
		for (const q of questions) {
			const id = typeof q.polymarketMarketId === "string" ? q.polymarketMarketId.trim() : "";
			if (!id) continue;
			const matched = findMatchedByPolymarketMarketId(appState?.markets, id);
			if (!matched) continue;
			const { yes } = listingBestYesNoFromMatched(matched);
			if (typeof yes === "number" && Number.isFinite(yes)) {
				yesPriceByMarketId.set(id, yes);
			}
		}
		const orderedLegs = orderMultiLegs(questions, layout, yesPriceByMarketId);
		const topN = resolveTopN(layout.homeTopN, orderedLegs.length);
		return {
			ordered: orderedLegs,
			visible: orderedLegs.slice(0, topN),
			hiddenCount: Math.max(0, orderedLegs.length - topN),
		};
	}, [data?.questions, layout, appState?.markets]);

	return (
		<div className="single-market-actions single-market-actions--compact">
			<div className="prediction-card-outcome-rows">
				{visible.map((question, index) => (
					<MultiLegHomeRow
						key={question._id || question.questionId || question.polymarketMarketId}
						question={question}
						index={index}
						layout={layout}
						teamMappings={teamMappings}
						gameTeamColorBySlug={fifaGameTeamColorBySlug}
						onNavigate={onNavigate}
					/>
				))}
				{hiddenCount > 0 ? (
					<div className="prediction-card-outcome-row prediction-card-outcome-row--more">
						<span className="prediction-card-outcome-label">{hiddenCount} more outcomes</span>
					</div>
				) : null}
			</div>
		</div>
	);
};

interface MultiLegHomeRowProps {
	question: PredictionMarket;
	index: number;
	layout: MultiLegLayoutProfile;
	teamMappings?: UmbrellaTeamMapping[] | null;
	gameTeamColorBySlug?: Record<string, string> | null;
	onNavigate: (question: PredictionMarket, position: "yes" | "no") => void;
}

const MultiLegHomeRow: React.FC<MultiLegHomeRowProps> = ({
	question,
	index,
	layout,
	teamMappings,
	gameTeamColorBySlug,
	onNavigate,
}) => {
	const { formatPrice } = useOddsDisplay();
	const { appState } = useOddsMonitor();

	const legKey =
		typeof question.polymarketMarketId === "string" ? question.polymarketMarketId.trim() : "";
	const matched = useMatchVenuePrices(legKey || null, null);
	const { yes } = useMemo(
		() => listingBestYesNoFromMatched(matched),
		[matched, appState?.timestamp],
	);

	const yesPrice = typeof yes === "number" && Number.isFinite(yes) ? yes : null;
	const yesCents = yesPrice !== null ? formatPrice(yesPrice) : "--";

	const isOther = isMultiLegOtherLeg(question);
	const yesColor = multiLegLegColor(question, index, teamMappings, gameTeamColorBySlug);
	const yesTextColor = getContrastingTextColor(yesColor);
	const label = multiLegLegLabel(question);
	const yesBarPct = oddsBarPercent(yesPrice);
	const logoUrl = multiLegLegImage(question, layout);
	const [showLogo, setShowLogo] = useState(Boolean(logoUrl));
	useEffect(() => {
		setShowLogo(Boolean(logoUrl));
	}, [logoUrl]);

	return (
		<div className="prediction-card-outcome-row">
			{showLogo && logoUrl ? (
				<div className="prediction-card-outcome-logo">
					<img
						className={
							isOther
								? "prediction-card-outcome-logo-img prediction-card-outcome-logo-img--draw"
								: "prediction-card-outcome-logo-img"
						}
						src={logoUrl}
						alt={label}
						onError={() => setShowLogo(false)}
					/>
				</div>
			) : null}
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

/** @deprecated Use MultiLegHomeActions */
export const GroupWinnerActions = MultiLegHomeActions;
