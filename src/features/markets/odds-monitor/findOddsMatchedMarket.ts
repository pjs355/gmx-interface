import type { MatchedMarket } from "@/types/odds-monitor";
import { getVenuePricesClient } from "@/services/venuePricesClient";

/**
 * Resolve a row from venue-prices app state: prefer PandaScore id, then umbrella id
 * (umbrella pandascore_matchId can drift from matched-markets / monitor keys).
 */
export function findOddsMatchedMarket(
	appMarkets: MatchedMarket[] | null | undefined,
	pandaMatchId: string | null | undefined,
	umbrellaId?: string | null,
): MatchedMarket | null {
	const pid = String(pandaMatchId ?? "").trim();
	if (pid) {
		const fromMap = getVenuePricesClient().getMarket(pid);
		if (fromMap) return fromMap;
	}
	if (appMarkets?.length) {
		if (pid) {
			const byPanda = appMarkets.find((m) => String(m.pandaMatchId ?? "").trim() === pid);
			if (byPanda) return byPanda;
		}
		const uid = String(umbrellaId ?? "").trim();
		if (uid) {
			return appMarkets.find((m) => String(m.umbrellaId ?? "").trim() === uid) ?? null;
		}
	}
	const uid = String(umbrellaId ?? "").trim();
	if (uid) {
		return getVenuePricesClient().findMarketByUmbrellaId(uid);
	}
	return null;
}

/** Resolve a venue-prices row by Polymarket condition id (FIFA per-leg markets). */
export function findOddsMatchedMarketByConditionId(
	appMarkets: MatchedMarket[] | null | undefined,
	conditionId: string | null | undefined,
): MatchedMarket | null {
	const cid = String(conditionId ?? "").trim();
	if (!cid) return null;
	const fromMap = getVenuePricesClient().findMarketByConditionId(cid);
	if (fromMap) return fromMap;
	if (!appMarkets?.length) return null;
	return appMarkets.find((m) => String(m.polyConditionId ?? "").trim() === cid) ?? null;
}
