import { normalizeEventDateInput } from "@/pages/Predictions/utils/eventDates";
import type { AllOddsMarket } from "./types";

/** Hide scheduled matches this long after kickoff (local time). */
export const ALL_ODDS_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export function isPastAllOddsDisplayCutoff(
	eventDate: string | undefined,
	nowMs = Date.now(),
): boolean {
	const start = normalizeEventDateInput(eventDate);
	if (start === null) return false;
	return start.getTime() + ALL_ODDS_STALE_AFTER_MS < nowMs;
}

export function isActiveAllOddsMarket(market: AllOddsMarket, nowMs = Date.now()): boolean {
	return !isPastAllOddsDisplayCutoff(market.eventDate, nowMs);
}
