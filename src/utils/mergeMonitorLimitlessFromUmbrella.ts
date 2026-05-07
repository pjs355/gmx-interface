import type { MatchedMarket } from "@/types/odds-monitor";
import type { MatchedMarketExchange } from "@/services/api/matchDataService";
import type { UmbrellaExchangeMatchingLimitless } from "@/services/api/umbrellaDataService";

/**
 * Odds-monitor rows come from GET /matched-markets + venue-prices WS. Production payloads
 * can omit `exchangeMatching.limitless` while the umbrella document already has it — merge
 * umbrella mapping so Limitless metadata is present (books still come only from venue-prices).
 */
export function mergeMonitorLimitlessFromUmbrella(
	matched: MatchedMarket | null,
	umbrellaLimitless: UmbrellaExchangeMatchingLimitless | null | undefined,
): MatchedMarket | null {
	if (!matched) return null;
	if (matched.limitless || !umbrellaLimitless) {
		return matched;
	}
	return { ...matched, limitless: umbrellaLimitless };
}

/** Same merge for chart batch `MatchedMarketExchange` from GET /matched-markets. */
export function mergeLimitlessOntoMatchedMarketExchange(
	match: MatchedMarketExchange | undefined,
	umbrellaLimitless: UmbrellaExchangeMatchingLimitless | null | undefined,
): MatchedMarketExchange | undefined {
	if (!match || !umbrellaLimitless || match.limitless) {
		return match;
	}
	return {
		...match,
		limitless: {
			slug: umbrellaLimitless.slug,
			tokenIdA: umbrellaLimitless.tokenIdA,
			tokenIdB: umbrellaLimitless.tokenIdB,
			orderbookSlugA: umbrellaLimitless.orderbookSlugA,
			orderbookSlugB: umbrellaLimitless.orderbookSlugB,
		},
	};
}
