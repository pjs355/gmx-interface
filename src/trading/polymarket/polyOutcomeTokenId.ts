import type { MatchedMarket, OrderbookData } from "@/types/odds-monitor";

function norm(s: string): string {
	return s.trim().toLowerCase();
}

/** Which PandaScore side (A or B) the YES/NO pick maps to for Poly token + book. */
export function polyOutcomeSide(
	matched: MatchedMarket,
	position: "yes" | "no",
	yesTeamLabel: string,
	noTeamLabel: string
): "A" | "B" {
	const label = norm(position === "yes" ? yesTeamLabel : noTeamLabel);
	const a = norm(matched.pandaTeamA);
	const b = norm(matched.pandaTeamB);

	if (label === a) return "A";
	if (label === b) return "B";

	return position === "yes" ? "A" : "B";
}

/**
 * Polymarket CLOB orderbook for the selected outcome (`polyPriceA` / `polyPriceB`).
 */
export function polyOrderbookForPosition(
	matched: MatchedMarket,
	position: "yes" | "no",
	yesTeamLabel: string,
	noTeamLabel: string
): OrderbookData | null {
	const side = polyOutcomeSide(matched, position, yesTeamLabel, noTeamLabel);
	const book = side === "A" ? matched.polyPriceA : matched.polyPriceB;
	return book ?? null;
}

/**
 * Maps YES / NO (with the same display labels as the trade box) to the correct
 * `polyTokenId*` for this UIServer matched row.
 */
export function polyOutcomeTokenId(
	matched: MatchedMarket,
	position: "yes" | "no",
	yesTeamLabel: string,
	noTeamLabel: string
): string {
	const side = polyOutcomeSide(matched, position, yesTeamLabel, noTeamLabel);

	const tokenForTeamA = matched.sidesSwapped
		? matched.polyTokenIdB
		: matched.polyTokenIdA;
	const tokenForTeamB = matched.sidesSwapped
		? matched.polyTokenIdA
		: matched.polyTokenIdB;

	return side === "A" ? tokenForTeamA : tokenForTeamB;
}
