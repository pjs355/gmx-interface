import type { Umbrella } from "@/services/api/umbrellaDataService";
import type { MatchedMarket } from "@/types/odds-monitor";
import type { VenuePosition } from "@/types/trading/venuePosition";
import { limitlessPositionHitsCatalogLeg } from "@/trading/limitless/limitlessCatalogTokenPair";
import {
	coerceLimitlessWireForInference,
	resolveLimitlessInferenceWireForUmbrella,
} from "@/utils/mergeMonitorLimitlessFromUmbrella";

/**
 * True when a Limitless CLOB row belongs to the current trade page market
 * (umbrella mapping + optional odds-monitor row).
 *
 * When `matchedOddsMarkets` is passed (trade box / portfolio parity), the catalog
 * wire is {@link resolveLimitlessInferenceWireForUmbrella} so both neg-risk legs
 * (team A / team B mints) match the same umbrella as on the Positions page. Without
 * it, `pageMatchedMonitor` alone can omit a leg and strand one team's shares from
 * the aggregate.
 */
export function limitlessVenuePositionMatchesPageMarket(
	pos: VenuePosition,
	umbrella: Umbrella | null | undefined,
	matchedMonitor: MatchedMarket | null | undefined,
	matchedOddsMarkets?: MatchedMarket[] | null,
): boolean {
	if (pos.venue !== "limitless") return false;
	const wire =
		matchedOddsMarkets != null && umbrella?._id
			? resolveLimitlessInferenceWireForUmbrella({
					matchedMarkets: matchedOddsMarkets,
					umbrellaId: String(umbrella._id),
					umbrellaExchangeLimitless: umbrella?.exchangeMatching?.limitless,
					pageMatchedMonitor: matchedMonitor,
				})
			: coerceLimitlessWireForInference(
					matchedMonitor?.limitless,
					umbrella?.exchangeMatching?.limitless,
				);
	if (!wire?.tokenIdA?.trim() || !wire?.tokenIdB?.trim()) return false;
	return limitlessPositionHitsCatalogLeg(pos, wire);
}

/**
 * Same leg-matching rule as {@link matchVenuePositionToUmbrella} for `limitless`:
 * catalog `exchangeMatching.limitless` only (no merged monitor wire).
 * Used when {@link limitlessVenuePositionMatchesPageMarket} fails so neg-risk
 * per-leg rows still join the open umbrella like on the Positions page.
 */
export function limitlessVenuePositionMatchesUmbrellaCatalog(
	pos: VenuePosition,
	umbrella: Umbrella | null | undefined,
): boolean {
	if (pos.venue !== "limitless") return false;
	const lx = umbrella?.exchangeMatching?.limitless;
	if (!lx?.tokenIdA?.trim() || !lx?.tokenIdB?.trim()) return false;
	const wire = {
		tokenIdA: lx.tokenIdA,
		tokenIdB: lx.tokenIdB,
		orderbookSlugA: lx.orderbookSlugA,
		orderbookSlugB: lx.orderbookSlugB,
		groupSlug: lx.slug,
	};
	return limitlessPositionHitsCatalogLeg(pos, wire);
}
