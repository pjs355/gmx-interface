import type { MatchedMarket } from "@/types/odds-monitor";

/**
 * Resolve a row from venue-prices app state: prefer PandaScore id, then umbrella id
 * (umbrella pandascore_matchId can drift from matched-markets / monitor keys).
 */
export function findOddsMatchedMarket(
	appMarkets: MatchedMarket[] | null | undefined,
	pandaMatchId: string | null | undefined,
	umbrellaId?: string | null,
): MatchedMarket | null {
	if (!appMarkets?.length) return null;
	const pid = String(pandaMatchId ?? "").trim();
	if (pid) {
		const byPanda = appMarkets.find((m) => String(m.pandaMatchId ?? "").trim() === pid);
		if (byPanda) return byPanda;
	}
	const uid = String(umbrellaId ?? "").trim();
	if (uid) {
		return appMarkets.find((m) => String(m.umbrellaId ?? "").trim() === uid) ?? null;
	}
	return null;
}

/** Resolve a venue-prices row by Polymarket condition id (FIFA per-leg markets). */
export function findOddsMatchedMarketByConditionId(
	appMarkets: MatchedMarket[] | null | undefined,
	conditionId: string | null | undefined,
): MatchedMarket | null {
	const cid = String(conditionId ?? "").trim();
	if (!cid || !appMarkets?.length) return null;
	return appMarkets.find((m) => String(m.polyConditionId ?? "").trim() === cid) ?? null;
}
