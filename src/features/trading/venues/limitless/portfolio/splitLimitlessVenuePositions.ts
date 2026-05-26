import type { VenuePosition } from "@/types/trading/venuePosition";
import { isVenueMarketResolvedLike } from "@/types/trading/venuePosition";

export type LimitlessVenueBucket = "active" | "winnings" | "history";

export type LimitlessVenueSplit = {
	active: VenuePosition[];
	winnings: VenuePosition[];
	history: VenuePosition[];
};

/**
 * Same routing as {@link usePositionsData}: open positions vs Winnings vs History.
 * Used so portfolio MTM does not count settled History-bucket rows (often still carry cost-like notionals).
 */
export function getLimitlessVenueBucket(p: VenuePosition): LimitlessVenueBucket {
	if (p.marketClosed === false) {
		return "active";
	}
	if (isVenueMarketResolvedLike(p.marketStatus)) {
		if (p.redeemable === true && (p.currentValue ?? 0) > 0) {
			return "winnings";
		}
		return "history";
	}
	return "active";
}

export function splitLimitlessVenuePositions(
	positions: readonly VenuePosition[],
): LimitlessVenueSplit {
	const active: VenuePosition[] = [];
	const winnings: VenuePosition[] = [];
	const history: VenuePosition[] = [];
	for (const p of positions) {
		const b = getLimitlessVenueBucket(p);
		if (b === "active") active.push(p);
		else if (b === "winnings") winnings.push(p);
		else history.push(p);
	}
	return { active, winnings, history };
}

/**
 * Rows for the Winnings tab resolver: partner-redeemable (`split→winnings`) plus resolved
 * settlement-pending rows that live in the History split (`redeemPending`) so portfolio MTM
 * and Winnings stay aligned.
 */
export function limitlessVenueRowsForWinningsTab(
	winnings: readonly VenuePosition[],
	history: readonly VenuePosition[],
): VenuePosition[] {
	const tokens = new Set(winnings.map((p) => String(p.tokenId ?? "").trim()).filter(Boolean));
	const extra = history.filter(
		(p) =>
			p.venue === "limitless" &&
			p.redeemPending === true &&
			!tokens.has(String(p.tokenId ?? "").trim()),
	);
	return [...winnings, ...extra];
}
