import { useEffect, useMemo } from "react";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type { UmbrellaTeamMapping } from "@/services/api/umbrellaDataService";
import { useMatchVenuePrices, useOddsMonitor } from "@/context/OddsMonitorContext";
import { useVenuePandaSubscription } from "@/context/VenuePandaSubscriptionContext";
import { listingBestYesNoFromMatched } from "@/features/markets/listing/listingVenuePrices";
import {
	groupWinnerLegColor,
	groupWinnerLegLabel,
	orderGroupWinnerLegs,
} from "@/features/markets/listing/groupWinner";
import { getContrastingTextColor } from "@/features/markets/presentation/teamColors";
import { useOddsDisplay } from "@/context/OddsDisplayContext";
import { getMarketId } from "./utils";
import "./ThreeWayLegSelector.scss";

type Props = {
	/** Umbrella display questions; the N team legs are derived from them. */
	legs: PredictionMarket[];
	teamMappings?: UmbrellaTeamMapping[] | null;
	gameTeamColorBySlug?: Record<string, string> | null;
	/** Market id of the currently active leg (drives the highlighted button). */
	activeMarketId: string;
	/** Switch the active market to the selected leg's YES book. */
	onSelect: (question: PredictionMarket) => void;
};

/**
 * Inline outcome selector for the Basic tab of a FIFA "Group X Winner" prop.
 * Generalizes {@link ThreeWayLegSelector} to N team buttons (no Draw), each with
 * the cross-venue best YES price, colored like the same team on moneyline games.
 */
export function GroupWinnerLegSelector({
	legs,
	teamMappings,
	gameTeamColorBySlug,
	activeMarketId,
	onSelect,
}: Props) {
	const ordered = useMemo(() => orderGroupWinnerLegs(legs), [legs]);
	return (
		<div className="three-way-leg-selector" role="tablist" aria-label="Outcome">
			{ordered.map((question, index) => (
				<GroupWinnerLegButton
					key={getMarketId(question) || question.polymarketMarketId}
					question={question}
					index={index}
					teamMappings={teamMappings}
					gameTeamColorBySlug={gameTeamColorBySlug}
					active={(getMarketId(question) || "") === activeMarketId}
					onSelect={onSelect}
				/>
			))}
		</div>
	);
}

function GroupWinnerLegButton({
	question,
	index,
	teamMappings,
	gameTeamColorBySlug,
	active,
	onSelect,
}: {
	question: PredictionMarket;
	index: number;
	teamMappings?: UmbrellaTeamMapping[] | null;
	gameTeamColorBySlug?: Record<string, string> | null;
	active: boolean;
	onSelect: (q: PredictionMarket) => void;
}) {
	const { formatPrice } = useOddsDisplay();
	const { appState } = useOddsMonitor();
	const { subscribePandaMatchId, unsubscribePandaMatchId } = useVenuePandaSubscription();

	const legKey =
		typeof question.polymarketMarketId === "string" ? question.polymarketMarketId.trim() : "";

	useEffect(() => {
		if (!legKey) return;
		subscribePandaMatchId(legKey);
		return () => unsubscribePandaMatchId(legKey);
	}, [legKey, subscribePandaMatchId, unsubscribePandaMatchId]);

	const matched = useMatchVenuePrices(legKey || null, null);
	const { yes } = useMemo(
		() => listingBestYesNoFromMatched(matched),
		[matched, appState?.timestamp],
	);
	const yesPrice = typeof yes === "number" && Number.isFinite(yes) ? yes : null;
	const cents = yesPrice !== null ? formatPrice(yesPrice) : "--";

	const color = groupWinnerLegColor(question, index, teamMappings, gameTeamColorBySlug);
	const label = groupWinnerLegLabel(question);

	return (
		<button
			type="button"
			role="tab"
			aria-selected={active}
			className={`three-way-leg-selector__btn${active ? " three-way-leg-selector__btn--active" : ""}`}
			onClick={() => onSelect(question)}
			style={{
				// Solid team-color fill like the home-page outcome buttons. The
				// unselected legs are simply dimmed — no grey tint, outline, or glow.
				background: color,
				border: `2px solid ${color}`,
				color: getContrastingTextColor(color),
				opacity: active ? 1 : 0.45,
			}}
		>
			<span className="three-way-leg-selector__label">{label}</span>
			<span className="three-way-leg-selector__odds">{cents}</span>
		</button>
	);
}
