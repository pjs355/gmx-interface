import React, { useEffect, useMemo, useRef, useState } from "react";
import { useCurtainActions } from "@/components/PredictionMarketTradeBox";
import { useMatchVenuePrices, useOddsMonitor } from "@/context/OddsMonitorContext";
import { useVenuePandaSubscription } from "@/context/VenuePandaSubscriptionContext";
import { useOddsDisplay } from "@/context/OddsDisplayContext";
import { listingBestYesNoFromMatched } from "@/features/markets/listing/listingVenuePrices";
import { resolveOutcomeSideLabels } from "@/features/markets/presentation/outcomeSideLabels";
import { shortenTeamLabelForButton } from "@/features/markets/presentation/marketLabels";
import {
	getBorderColorForSelected,
	getContrastingTextColor,
	hexToRgba,
	mixHexOnBlack,
} from "@/features/markets/presentation/teamColors";
import type { EsportsLeg } from "@/features/markets/presentation/esportsLegs";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import { getMarketId } from "./utils";
import { MarketSectionAccordion } from "./MarketSectionAccordion";
import "./EsportsLegAccordion.scss";

export type EsportsLegAccordionProps = {
	umbrella: Umbrella;
	legs: EsportsLeg[];
	activeMarket: PredictionMarket | null;
	activePosition: "yes" | "no";
	onMarketSwitch: (question: PredictionMarket, position: "yes" | "no") => void;
	onPositionChange: (position: "yes" | "no") => void;
	/** Body for the currently expanded leg — the existing chart + orderbook + trade box trio. */
	children: React.ReactNode;
};

/**
 * Vertical accordion of legs for a Panda esports umbrella with `series + map_1 +
 * map_2 + ...` (multi-leg). Uses {@link MarketSectionAccordion} for expand/collapse.
 */
export function EsportsLegAccordion({
	umbrella,
	legs,
	activeMarket,
	activePosition,
	onMarketSwitch,
	onPositionChange,
	children,
}: EsportsLegAccordionProps) {
	const activeQuestionId = activeMarket ? getMarketId(activeMarket) : "";

	const [expandedWireKey, setExpandedWireKey] = useState<string | null>(() => {
		if (activeQuestionId) {
			const hit = legs.find((leg) => getMarketId(leg.question) === activeQuestionId);
			if (hit) return hit.wireKey;
		}
		return legs[0]?.wireKey ?? null;
	});

	const lastActiveQuestionId = useRef(activeQuestionId);
	useEffect(() => {
		if (!activeQuestionId) return;
		if (activeQuestionId === lastActiveQuestionId.current) return;
		lastActiveQuestionId.current = activeQuestionId;
		const hit = legs.find((leg) => getMarketId(leg.question) === activeQuestionId);
		if (hit) setExpandedWireKey(hit.wireKey);
	}, [activeQuestionId, legs]);

	const { openCurtain } = useCurtainActions();

	const handlePillClick = (leg: EsportsLeg, side: "yes" | "no") => {
		const legId = getMarketId(leg.question);
		setExpandedWireKey(leg.wireKey);
		if (activeQuestionId === legId) {
			if (side !== activePosition) onPositionChange(side);
		} else {
			onMarketSwitch(leg.question, side);
		}
		openCurtain();
	};

	const sections = legs.map((leg) => {
		const legId = getMarketId(leg.question);
		const isActiveLeg = Boolean(legId) && legId === activeQuestionId;
		return {
			id: leg.wireKey,
			ariaLabel: leg.label,
			header: (
				<EsportsLegHeaderContent
					umbrella={umbrella}
					leg={leg}
					isActiveLeg={isActiveLeg}
					activePosition={activePosition}
					onPillClick={(side) => handlePillClick(leg, side)}
				/>
			),
			body: children,
		};
	});

	return (
		<MarketSectionAccordion
			className="esports-leg-accordion"
			sections={sections}
			defaultExpandedId={legs[0]?.wireKey ?? "moneyline"}
			expandedId={expandedWireKey}
			onExpandedChange={setExpandedWireKey}
		/>
	);
}

type HeaderContentProps = {
	umbrella: Umbrella;
	leg: EsportsLeg;
	isActiveLeg: boolean;
	activePosition: "yes" | "no";
	onPillClick: (side: "yes" | "no") => void;
};

function EsportsLegHeaderContent({
	umbrella,
	leg,
	isActiveLeg,
	activePosition,
	onPillClick,
}: HeaderContentProps) {
	const { formatPrice } = useOddsDisplay();
	const { appState } = useOddsMonitor();
	const { subscribePandaMatchId, unsubscribePandaMatchId } = useVenuePandaSubscription();

	useEffect(() => {
		if (!leg.wireKey) return;
		subscribePandaMatchId(leg.wireKey);
		return () => unsubscribePandaMatchId(leg.wireKey);
	}, [leg.wireKey, subscribePandaMatchId, unsubscribePandaMatchId]);

	const matched = useMatchVenuePrices(leg.wireKey || null, null);
	const { yes, no } = useMemo(
		() => listingBestYesNoFromMatched(matched),
		[matched, appState?.timestamp],
	);

	const sideLabels = useMemo(
		() => resolveOutcomeSideLabels({ umbrella, market: leg.question }),
		[umbrella, leg.question],
	);

	const teamAColor = (leg.question as { yesColor?: string })?.yesColor || "#22c55e";
	const teamBColor = (leg.question as { noColor?: string })?.noColor || "#ef4444";
	const teamAName = shortenTeamLabelForButton(sideLabels.yesLabel);
	const teamBName = shortenTeamLabelForButton(sideLabels.noLabel);

	const yesCents = typeof yes === "number" && Number.isFinite(yes) ? formatPrice(yes) : "--";
	const noCents = typeof no === "number" && Number.isFinite(no) ? formatPrice(no) : "--";

	const yesActive = isActiveLeg && activePosition === "yes";
	const noActive = isActiveLeg && activePosition === "no";

	return (
		<>
			<span className="esports-leg-accordion__label">{leg.label}</span>
			<span className="esports-leg-accordion__odds-group">
				<TeamPill
					name={teamAName}
					title={sideLabels.yesLabel}
					price={yesCents}
					color={teamAColor}
					active={yesActive}
					onClick={() => onPillClick("yes")}
				/>
				<TeamPill
					name={teamBName}
					title={sideLabels.noLabel}
					price={noCents}
					color={teamBColor}
					active={noActive}
					onClick={() => onPillClick("no")}
				/>
			</span>
		</>
	);
}

type TeamPillProps = {
	name: string;
	title: string;
	price: string;
	color: string;
	active: boolean;
	onClick: () => void;
};

function TeamPill({ name, title, price, color, active, onClick }: TeamPillProps) {
	const [hovered, setHovered] = useState(false);
	const background = active ? color : hexToRgba(color, 0.35);
	const text = active
		? getContrastingTextColor(color)
		: getContrastingTextColor(mixHexOnBlack(color, 0.35));
	const borderColor = active
		? getBorderColorForSelected(color)
		: hovered
			? color
			: hexToRgba(color, 0.35);

	return (
		<button
			type="button"
			className={`esports-leg-accordion__odds-pill${
				active ? " esports-leg-accordion__odds-pill--active" : ""
			}`}
			title={title}
			onClick={(e) => {
				e.stopPropagation();
				onClick();
			}}
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
			style={{
				background,
				color: text,
				border: `2px solid ${borderColor}`,
			}}
		>
			<span className="esports-leg-accordion__odds-pill-team">{name}</span>
			<span className="esports-leg-accordion__odds-pill-price">{price}</span>
		</button>
	);
}
