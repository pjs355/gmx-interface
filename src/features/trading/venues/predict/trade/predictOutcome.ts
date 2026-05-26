import type { MatchedMarket, OrderbookData } from "@/types/odds-monitor";
import { pandaOutcomeSide } from "@/features/markets/odds-monitor/pandaOutcomeSide";

export function predictOrderbookForPosition(
	matched: MatchedMarket,
	position: "yes" | "no",
	yesTeamLabel: string,
	noTeamLabel: string,
): OrderbookData | null {
	if (!matched.predictFun) return null;
	const side = pandaOutcomeSide(matched, position, yesTeamLabel, noTeamLabel);
	const book = side === "A" ? matched.predictFunPriceA : matched.predictFunPriceB;
	return book ?? null;
}

/** Numeric Predict market id from the monitor row for the selected outcome. */
export function predictMarketNumericId(
	matched: MatchedMarket,
	position: "yes" | "no",
	yesTeamLabel: string,
	noTeamLabel: string,
): number | null {
	const pf = matched.predictFun;
	if (!pf) return null;
	const side = pandaOutcomeSide(matched, position, yesTeamLabel, noTeamLabel);
	const raw = side === "A" ? pf.marketIdA : (pf.marketIdB ?? pf.marketIdA);
	if (raw === undefined || raw === null || raw === "") return null;
	const n = Number(raw);
	return Number.isFinite(n) ? n : null;
}
