import type { MatchedMarket } from "@/types/odds-monitor";
import type { MatchedMarketExchange } from "@/services/api/matchDataService";
import type { UmbrellaExchangeMatchingLimitless } from "@/services/api/umbrellaDataService";
import { LIMITLESS_LEGACY_CLIENT_FALLBACKS } from "@/config/limitlessLegacyClientFallbacks";

/**
 * Odds-monitor rows come from GET /matched-markets + venue-prices WS. Production payloads
 * can omit `exchangeMatching.limitless` while the umbrella document already has it — then
 * Basic / orderbooks / trade box hide Limitless entirely. Merge umbrella mapping when the
 * monitor row exists but limitless metadata is missing.
 */
export function mergeMonitorLimitlessFromUmbrella(
	matched: MatchedMarket | null,
	umbrellaLimitless: UmbrellaExchangeMatchingLimitless | null | undefined,
): MatchedMarket | null {
	if (!matched) return null;
	if (!LIMITLESS_LEGACY_CLIENT_FALLBACKS || matched.limitless || !umbrellaLimitless) {
		return matched;
	}
	return { ...matched, limitless: umbrellaLimitless };
}

/** Same merge for chart batch `MatchedMarketExchange` from GET /matched-markets. */
export function mergeLimitlessOntoMatchedMarketExchange(
	match: MatchedMarketExchange | undefined,
	umbrellaLimitless: UmbrellaExchangeMatchingLimitless | null | undefined,
): MatchedMarketExchange | undefined {
	if (
		!LIMITLESS_LEGACY_CLIENT_FALLBACKS ||
		!match ||
		!umbrellaLimitless ||
		match.limitless
	) {
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
