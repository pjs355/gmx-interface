import type { MatchedMarket, OrderbookData } from "@/types/odds-monitor";
import { pandaOutcomeSide } from "@/features/markets/odds-monitor/pandaOutcomeSide";

/**
 * Polymarket CLOB orderbook for the selected outcome (`polyPriceA` / `polyPriceB`).
 */
export function polyOrderbookForPosition(
	matched: MatchedMarket,
	position: "yes" | "no",
	yesTeamLabel: string,
	noTeamLabel: string,
): OrderbookData | null {
	const side = pandaOutcomeSide(matched, position, yesTeamLabel, noTeamLabel);
	const book = side === "A" ? matched.polyPriceA : matched.polyPriceB;
	return book ?? null;
}

/** LevelUp venue book on the monitor for the selected YES/NO side (Panda A vs B). */
export function levelUpMonitorBookForPosition(
	matched: MatchedMarket,
	position: "yes" | "no",
	yesTeamLabel: string,
	noTeamLabel: string,
): OrderbookData | null {
	const side = pandaOutcomeSide(matched, position, yesTeamLabel, noTeamLabel);
	return side === "A" ? (matched.levelUpPriceA ?? null) : (matched.levelUpPriceB ?? null);
}

/**
 * Maps YES / NO (with the same display labels as the trade box) to the correct
 * `polyTokenId*` for this UIServer matched row.
 */
export function polyOutcomeTokenId(
	matched: MatchedMarket,
	position: "yes" | "no",
	yesTeamLabel: string,
	noTeamLabel: string,
): string {
	const side = pandaOutcomeSide(matched, position, yesTeamLabel, noTeamLabel);

	const tokenForTeamA = matched.sidesSwapped ? matched.polyTokenIdB : matched.polyTokenIdA;
	const tokenForTeamB = matched.sidesSwapped ? matched.polyTokenIdA : matched.polyTokenIdB;

	return side === "A" ? tokenForTeamA : tokenForTeamB;
}
