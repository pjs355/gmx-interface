import type { Umbrella } from "@/services/api/umbrellaDataService";
import type { MatchedMarketsApiItem } from "@/features/markets/queries/matchedMarketsQuery";
import { apiItemToMatchedMarket } from "@/features/markets/odds-monitor/matchedMarketFromApi";
import type { MatchedMarket } from "@/types/odds-monitor";

function teamLabelsFromUmbrella(umbrella: Umbrella): { pandaTeamA?: string; pandaTeamB?: string } {
	const em = umbrella.exchangeMatching;
	if (em?.pandaTeamA || em?.pandaTeamB) {
		return { pandaTeamA: em.pandaTeamA, pandaTeamB: em.pandaTeamB };
	}
	const mappings = umbrella.teamMappings ?? [];
	if (mappings.length >= 2) {
		return {
			pandaTeamA: mappings[0]?.displayName,
			pandaTeamB: mappings[1]?.displayName,
		};
	}
	return {};
}

/** Build a matched-markets API row from umbrella list data (no REST catalog fetch). */
export function umbrellaToMatchedMarketsApiItem(
	umbrella: Umbrella,
	pandaMatchId: string,
): MatchedMarketsApiItem | null {
	const pid = String(pandaMatchId ?? "").trim();
	if (!pid) return null;

	const em = umbrella.exchangeMatching ?? {};
	const teams = teamLabelsFromUmbrella(umbrella);

	return {
		pandaMatchId: pid,
		umbrellaId: umbrella._id,
		displayName: umbrella.displayName,
		game: umbrella.game,
		eventDate: umbrella.eventDate ?? undefined,
		pandaTeamA: teams.pandaTeamA,
		pandaTeamB: teams.pandaTeamB,
		teamMappings: umbrella.teamMappings,
		exchangeMatching: em as MatchedMarketsApiItem["exchangeMatching"],
	};
}

/** Write umbrella-derived metadata stubs into the venue-prices store for home cards. */
export function ensureMarketsFromUmbrella(
	markets: Map<string, MatchedMarket>,
	umbrella: Umbrella,
	pandaMatchIds: string[],
): boolean {
	let changed = false;
	for (const raw of pandaMatchIds) {
		const pid = String(raw ?? "").trim();
		if (!pid) continue;
		const item = umbrellaToMatchedMarketsApiItem(umbrella, pid);
		if (!item) continue;
		const prev = markets.get(pid);
		if (prev) {
			const em = item.exchangeMatching;
			prev.umbrellaId = item.umbrellaId;
			prev.polyConditionId = em.polymarket?.conditionId ?? prev.polyConditionId ?? "";
			prev.polyTokenIdA = em.polymarket?.tokenIdA ?? prev.polyTokenIdA ?? "";
			prev.polyTokenIdB = em.polymarket?.tokenIdB ?? prev.polyTokenIdB ?? "";
			prev.pandaTeamA = item.pandaTeamA ?? prev.pandaTeamA ?? "";
			prev.pandaTeamB = item.pandaTeamB ?? prev.pandaTeamB ?? "";
			prev.game = item.game ?? prev.game;
			prev.polyTickSize = (em.polymarket?.tickSize as MatchedMarket["polyTickSize"]) ?? prev.polyTickSize;
			prev.polyNegRisk = em.polymarket?.negRisk ?? prev.polyNegRisk;
			prev.dflow = em.dflow ?? prev.dflow;
			prev.predictFun = em.predictFun
				? {
						marketIdA: em.predictFun.marketIdA,
						marketIdB: em.predictFun.marketIdB,
						tokenIdA: em.predictFun.tokenIdA,
						tokenIdB: em.predictFun.tokenIdB,
						decimalPrecision: (em.predictFun.decimalPrecision ?? 2) as 2 | 3,
						singleMarket: em.predictFun.singleMarket,
					}
				: prev.predictFun;
			prev.limitless = em.limitless ?? prev.limitless;
		} else {
			markets.set(pid, apiItemToMatchedMarket(item, pid));
			changed = true;
		}
	}
	return changed;
}
