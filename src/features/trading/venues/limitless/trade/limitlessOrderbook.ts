import type { MatchedMarket, OrderbookData } from "@/types/odds-monitor";
import { pandaOutcomeSide } from "@/features/markets/odds-monitor/pandaOutcomeSide";

export function limitlessOrderbookForPosition(
	matched: MatchedMarket,
	position: "yes" | "no",
	yesTeamLabel: string,
	noTeamLabel: string,
): OrderbookData | null {
	if (!matched.limitless) return null;
	const side = pandaOutcomeSide(matched, position, yesTeamLabel, noTeamLabel);
	const book = side === "A" ? matched.limitlessPriceA : matched.limitlessPriceB;
	return book ?? null;
}

export function limitlessOutcomeTokenId(
	matched: MatchedMarket,
	position: "yes" | "no",
	yesTeamLabel: string,
	noTeamLabel: string,
): string | null {
	if (!matched.limitless) return null;
	const side = pandaOutcomeSide(matched, position, yesTeamLabel, noTeamLabel);
	return side === "A" ? matched.limitless.tokenIdA : matched.limitless.tokenIdB;
}
