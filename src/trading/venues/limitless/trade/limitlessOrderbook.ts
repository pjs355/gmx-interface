import type { MatchedMarket, OrderbookData } from "@/types/odds-monitor";

function norm(s: string): string {
	return s.trim().toLowerCase();
}

export function limitlessOutcomeSide(
	matched: MatchedMarket,
	position: "yes" | "no",
	yesTeamLabel: string,
	noTeamLabel: string,
): "A" | "B" {
	const label = norm(position === "yes" ? yesTeamLabel : noTeamLabel);
	const a = norm(matched.pandaTeamA);
	const b = norm(matched.pandaTeamB);

	if (label === a) return "A";
	if (label === b) return "B";

	return position === "yes" ? "A" : "B";
}

export function limitlessOrderbookForPosition(
	matched: MatchedMarket,
	position: "yes" | "no",
	yesTeamLabel: string,
	noTeamLabel: string,
): OrderbookData | null {
	if (!matched.limitless) return null;
	const side = limitlessOutcomeSide(matched, position, yesTeamLabel, noTeamLabel);
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
	const side = limitlessOutcomeSide(matched, position, yesTeamLabel, noTeamLabel);
	return side === "A" ? matched.limitless.tokenIdA : matched.limitless.tokenIdB;
}
