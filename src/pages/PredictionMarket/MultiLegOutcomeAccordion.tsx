import React, { useEffect, useMemo, useRef, useState } from "react";
import { useCurtainActions } from "@/components/PredictionMarketTradeBox";
import { useMatchVenuePrices, useOddsMonitor } from "@/context/OddsMonitorContext";
import { useVenuePandaSubscription } from "@/context/VenuePandaSubscriptionContext";
import { useOddsDisplay } from "@/context/OddsDisplayContext";
import { listingBestYesNoFromMatched } from "@/features/markets/listing/listingVenuePrices";
import {
	multiLegLegColor,
	multiLegLegImage,
	multiLegLegLabel,
	type MultiLegLayoutProfile,
} from "@/features/markets/listing/multiLegMarket";
import { resolveOutcomeSideLabels } from "@/features/markets/presentation/outcomeSideLabels";
import {
	getBorderColorForSelected,
	getContrastingTextColor,
	hexToRgba,
	mixHexOnBlack,
} from "@/features/markets/presentation/teamColors";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type { Umbrella, UmbrellaTeamMapping } from "@/services/api/umbrellaDataService";
import { getMarketId } from "./utils";
import { MarketSectionAccordion } from "./MarketSectionAccordion";
import "./EsportsLegAccordion.scss";

function MultiLegVenueSubscription({ marketId }: { marketId: string }) {
	const { subscribePandaMatchId, unsubscribePandaMatchId } = useVenuePandaSubscription();
	useEffect(() => {
		if (!marketId) return;
		subscribePandaMatchId(marketId);
		return () => unsubscribePandaMatchId(marketId);
	}, [marketId, subscribePandaMatchId, unsubscribePandaMatchId]);
	return null;
}

export type MultiLegOutcomeAccordionProps = {
	umbrella: Umbrella;
	legs: PredictionMarket[];
	layout: MultiLegLayoutProfile;
	teamMappings?: UmbrellaTeamMapping[] | null;
	gameTeamColorBySlug?: Record<string, string> | null;
	activeMarket: PredictionMarket | null;
	activePosition: "yes" | "no";
	onMarketSwitch: (question: PredictionMarket, position: "yes" | "no") => void;
	onPositionChange: (position: "yes" | "no") => void;
	children: React.ReactNode;
};

export function MultiLegOutcomeAccordion({
	umbrella,
	legs,
	layout,
	teamMappings,
	gameTeamColorBySlug,
	activeMarket,
	activePosition,
	onMarketSwitch,
	onPositionChange,
	children,
}: MultiLegOutcomeAccordionProps) {
	const activeQuestionId = activeMarket ? getMarketId(activeMarket) : "";

	const [expandedId, setExpandedId] = useState<string | null>(() => {
		if (activeQuestionId) {
			const hit = legs.find((leg) => getMarketId(leg) === activeQuestionId);
			if (hit) return getMarketId(hit);
		}
		return legs[0] ? getMarketId(legs[0]) : null;
	});

	const lastActiveQuestionId = useRef(activeQuestionId);
	useEffect(() => {
		if (!activeQuestionId) return;
		if (activeQuestionId === lastActiveQuestionId.current) return;
		lastActiveQuestionId.current = activeQuestionId;
		const hit = legs.find((leg) => getMarketId(leg) === activeQuestionId);
		if (hit) setExpandedId(getMarketId(hit));
	}, [activeQuestionId, legs]);

	const { openCurtain } = useCurtainActions();

	const handlePillClick = (leg: PredictionMarket, side: "yes" | "no") => {
		const legId = getMarketId(leg);
		setExpandedId(legId);
		if (activeQuestionId === legId) {
			if (side !== activePosition) onPositionChange(side);
		} else {
			onMarketSwitch(leg, side);
		}
		openCurtain();
	};

	const handleExpandedChange = (id: string | null) => {
		setExpandedId(id);
		if (id === null) return;
		const leg = legs.find((candidate) => getMarketId(candidate) === id);
		if (!leg) return;
		const legId = getMarketId(leg);
		if (legId === activeQuestionId) return;
		onMarketSwitch(leg, activePosition);
	};

	const sections = legs.map((leg, index) => {
		const legId = getMarketId(leg);
		const isActiveLeg = Boolean(legId) && legId === activeQuestionId;
		const label = multiLegLegLabel(leg);
		return {
			id: legId,
			ariaLabel: label,
			header: (
				<MultiLegHeaderContent
					umbrella={umbrella}
					leg={leg}
					index={index}
					layout={layout}
					teamMappings={teamMappings}
					gameTeamColorBySlug={gameTeamColorBySlug}
					isActiveLeg={isActiveLeg}
					activePosition={activePosition}
					onPillClick={(side) => handlePillClick(leg, side)}
				/>
			),
			body: children,
		};
	});

	return (
		<>
			{legs.map((leg) => {
				const polyId =
					typeof leg.polymarketMarketId === "string" ? leg.polymarketMarketId.trim() : "";
				return polyId ? <MultiLegVenueSubscription key={polyId} marketId={polyId} /> : null;
			})}
			<MarketSectionAccordion
			className="esports-leg-accordion multi-leg-outcome-accordion"
			sections={sections}
			defaultExpandedId={legs[0] ? getMarketId(legs[0]) : undefined}
			expandedId={expandedId}
			onExpandedChange={handleExpandedChange}
		/>
		</>
	);
}

type HeaderContentProps = {
	umbrella: Umbrella;
	leg: PredictionMarket;
	index: number;
	layout: MultiLegLayoutProfile;
	teamMappings?: UmbrellaTeamMapping[] | null;
	gameTeamColorBySlug?: Record<string, string> | null;
	isActiveLeg: boolean;
	activePosition: "yes" | "no";
	onPillClick: (side: "yes" | "no") => void;
};

function MultiLegHeaderContent({
	umbrella,
	leg,
	index,
	layout,
	teamMappings,
	gameTeamColorBySlug,
	isActiveLeg,
	activePosition,
	onPillClick,
}: HeaderContentProps) {
	const { formatPrice } = useOddsDisplay();
	const { appState } = useOddsMonitor();
	const legKey = typeof leg.polymarketMarketId === "string" ? leg.polymarketMarketId.trim() : "";
	const matched = useMatchVenuePrices(legKey || null, null);
	const { yes, no } = useMemo(
		() => listingBestYesNoFromMatched(matched),
		[matched, appState?.timestamp],
	);

	const label = multiLegLegLabel(leg);
	const color = multiLegLegColor(leg, index, teamMappings, gameTeamColorBySlug);
	const imageUrl = multiLegLegImage(leg, layout);
	const sideLabels = resolveOutcomeSideLabels({ market: leg, umbrella });

	const yesPrice = typeof yes === "number" && Number.isFinite(yes) ? yes : null;
	const noPrice = typeof no === "number" && Number.isFinite(no) ? no : null;

	const yesSelected = isActiveLeg && activePosition === "yes";
	const noSelected = isActiveLeg && activePosition === "no";

	return (
		<div className="esports-leg-header multi-leg-outcome-header">
			<div className="esports-leg-header__leading">
				{imageUrl ? (
					<img className="esports-leg-header__logo" src={imageUrl} alt={label} loading="lazy" />
				) : (
					<span className="esports-leg-header__dot" style={{ backgroundColor: color }} />
				)}
				<span className="esports-leg-header__label">{label}</span>
			</div>
			<div className="esports-leg-header__pills">
				<button
					type="button"
					className={`esports-leg-pill${yesSelected ? " esports-leg-pill--selected" : ""}`}
					style={{
						backgroundColor: yesSelected ? color : mixHexOnBlack(color, 0.35),
						borderColor: yesSelected ? getBorderColorForSelected(color) : "transparent",
						color: getContrastingTextColor(yesSelected ? color : mixHexOnBlack(color, 0.35)),
					}}
					onClick={(e) => {
						e.stopPropagation();
						onPillClick("yes");
					}}
				>
					{sideLabels.yes} {yesPrice !== null ? formatPrice(yesPrice) : "--"}
				</button>
				<button
					type="button"
					className={`esports-leg-pill${noSelected ? " esports-leg-pill--selected" : ""}`}
					style={{
						backgroundColor: noSelected ? "#374151" : mixHexOnBlack("#374151", 0.35),
						borderColor: noSelected ? hexToRgba("#fff", 0.3) : "transparent",
						color: getContrastingTextColor(noSelected ? "#374151" : mixHexOnBlack("#374151", 0.35)),
					}}
					onClick={(e) => {
						e.stopPropagation();
						onPillClick("no");
					}}
				>
					{sideLabels.no} {noPrice !== null ? formatPrice(noPrice) : "--"}
				</button>
			</div>
		</div>
	);
}
