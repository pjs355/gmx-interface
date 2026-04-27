import type { VenuePosition } from "@/types/trading/venuePosition";

export type LimitlessVenueBucket = "active" | "winnings" | "history";

export type LimitlessVenueSplit = {
	active: VenuePosition[];
	winnings: VenuePosition[];
	history: VenuePosition[];
};

const st = (s: string | undefined) => (s ?? "").toUpperCase().trim();

/**
 * Same routing as {@link usePositionsData}: open positions vs Winnings vs History.
 * Used so portfolio MTM does not count settled History-bucket rows (often still carry cost-like notionals).
 */
export function getLimitlessVenueBucket(p: VenuePosition): LimitlessVenueBucket {
	const status = st(p.marketStatus);
	const resolved =
		status === "RESOLVED" ||
		status === "CLOSED" ||
		status === "SETTLED" ||
		status === "FINALIZED";
	if (p.marketClosed === false) {
		return "active";
	}
	if (resolved) {
		if (p.redeemable && (p.currentValue ?? 0) > 0) {
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

/** Rows whose `currentValue` feeds portfolio header MTM — mirrors active + Winnings tab, not History. */
export function limitlessPositionsForPortfolioMtm(
	positions: readonly VenuePosition[],
): VenuePosition[] {
	const { active, winnings } = splitLimitlessVenuePositions(positions);
	return [...active, ...winnings];
}
