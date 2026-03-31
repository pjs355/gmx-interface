import type { MatchedMarket, OrderbookData } from "@/types/odds-monitor";

function norm(s: string): string {
	return s.trim().toLowerCase();
}

/** Map YES/NO display to Predict side A/B (same PandaScore team mapping as Polymarket). */
export function predictOutcomeSide(
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

export function predictOrderbookForPosition(
	matched: MatchedMarket,
	position: "yes" | "no",
	yesTeamLabel: string,
	noTeamLabel: string
): OrderbookData | null {
	if (!matched.predictFun) return null;
	const side = predictOutcomeSide(
		matched,
		position,
		yesTeamLabel,
		noTeamLabel
	);
	const book = side === "A" ? matched.predictFunPriceA : matched.predictFunPriceB;
	return book ?? null;
}

/** Numeric Predict market id from the monitor row for the selected outcome. */
export function predictMarketNumericId(
	matched: MatchedMarket,
	position: "yes" | "no",
	yesTeamLabel: string,
	noTeamLabel: string
): number | null {
	const pf = matched.predictFun;
	if (!pf) return null;
	const side = predictOutcomeSide(matched, position, yesTeamLabel, noTeamLabel);
	const raw =
		side === "A" ? pf.marketIdA : pf.marketIdB ?? pf.marketIdA;
	if (raw === undefined || raw === null || raw === "") return null;
	const n = Number(raw);
	return Number.isFinite(n) ? n : null;
}
