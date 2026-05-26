import type { VenuePosition } from "@/types/trading/venuePosition";
import { inferVenueHistoryYesNoSide } from "./historyOutcomeWinner";

/** History-only: set on rows when orphan REDEEM was attributed ~$0.50 per net outcome share (post-claim heuristic). */
export const POLYMARKET_SPLIT_SETTLEMENT_TOOLTIP_COPY = "Polymarket Settled 50 / 50";

export function polymarketSplitSettlementBadgeVisible(
	positions: VenuePosition[],
	rowSide: "Yes" | "No",
): boolean {
	return positions.some(
		(p) =>
			p.venue === "polymarket" &&
			p.polymarketSplitSettlementLikely === true &&
			inferVenueHistoryYesNoSide(p.marketTitle, p.outcome) === rowSide,
	);
}
