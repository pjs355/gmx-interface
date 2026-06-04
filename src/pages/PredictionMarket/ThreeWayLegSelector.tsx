import { useEffect, useMemo } from "react";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import { useMatchVenuePrices, useOddsMonitor } from "@/context/OddsMonitorContext";
import { useVenuePandaSubscription } from "@/context/VenuePandaSubscriptionContext";
import { listingBestYesNoFromMatched } from "@/features/markets/listing/listingVenuePrices";
import {
	orderThreeWayLegs,
	threeWayLegColor,
	threeWayLegLabel,
} from "@/features/markets/listing/threeWayMoneyline";
import { getContrastingTextColor } from "@/features/markets/presentation/teamColors";
import { useOddsDisplay } from "@/context/OddsDisplayContext";
import { getMarketId } from "./utils";
import "./ThreeWayLegSelector.scss";

type Props = {
	/** Umbrella display questions; the three moneyline legs are derived from them. */
	legs: PredictionMarket[];
	/** Market id of the currently active leg (drives the highlighted button). */
	activeMarketId: string;
	/** Switch the active market to the selected leg's YES book. */
	onSelect: (question: PredictionMarket) => void;
};

/**
 * Inline outcome selector for the Basic tab of a 3-way moneyline (FIFA). One
 * button per leg (Team A / Team B / Draw) with the cross-venue best YES price,
 * colored by team (Draw stays neutral grey). Selecting a leg switches the active
 * market to that leg's YES book — the only way to flip outcomes from the Basic
 * view without opening the Orderbooks tab. Read path matches the home cards
 * exactly (`listingBestYesNoFromMatched`).
 */
export function ThreeWayLegSelector({ legs, activeMarketId, onSelect }: Props) {
	const ordered = useMemo(() => orderThreeWayLegs(legs), [legs]);
	return (
		<div className="three-way-leg-selector" role="tablist" aria-label="Outcome">
			{ordered.map((question) => (
				<ThreeWayLegButton
					key={getMarketId(question) || question.polymarketMarketId}
					question={question}
					active={(getMarketId(question) || "") === activeMarketId}
					onSelect={onSelect}
				/>
			))}
		</div>
	);
}

function ThreeWayLegButton({
	question,
	active,
	onSelect,
}: {
	question: PredictionMarket;
	active: boolean;
	onSelect: (q: PredictionMarket) => void;
}) {
	const { formatPrice } = useOddsDisplay();
	const { appState } = useOddsMonitor();
	const { subscribePandaMatchId, unsubscribePandaMatchId } = useVenuePandaSubscription();

	const legKey =
		typeof question.polymarketMarketId === "string" ? question.polymarketMarketId.trim() : "";

	// Ref-counted subscription so each leg has prices even before its Orderbook
	// tab opens (deduped with the Basic table's own subscriptions).
	useEffect(() => {
		if (!legKey) return;
		subscribePandaMatchId(legKey);
		return () => unsubscribePandaMatchId(legKey);
	}, [legKey, subscribePandaMatchId, unsubscribePandaMatchId]);

	const matched = useMatchVenuePrices(legKey || null, null);
	const { yes } = useMemo(
		// `matched` is mutated in place on WS ticks; `appState.timestamp` forces recompute.
		() => listingBestYesNoFromMatched(matched),
		[matched, appState?.timestamp],
	);
	const yesPrice = typeof yes === "number" && Number.isFinite(yes) ? yes : null;
	const cents = yesPrice !== null ? formatPrice(yesPrice) : "--";

	const color = threeWayLegColor(question);
	const label = threeWayLegLabel(question);

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
