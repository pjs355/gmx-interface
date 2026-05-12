import type { Umbrella } from "@/services/api/umbrellaDataService";
import type { MatchedMarket } from "@/types/odds-monitor";
import type { VenuePosition } from "@/types/trading/venuePosition";
import { limitlessPositionHitsCatalogLeg } from "@/trading/limitless/limitlessCatalogTokenPair";
import { coerceLimitlessWireForInference } from "@/utils/mergeMonitorLimitlessFromUmbrella";

/**
 * True when a Limitless CLOB row belongs to the current trade page market
 * (umbrella mapping + optional odds-monitor row).
 */
export function limitlessVenuePositionMatchesPageMarket(
	pos: VenuePosition,
	umbrella: Umbrella | null | undefined,
	matchedMonitor: MatchedMarket | null | undefined,
): boolean {
	if (pos.venue !== "limitless") return false;
	const wire = coerceLimitlessWireForInference(
		matchedMonitor?.limitless,
		umbrella?.exchangeMatching?.limitless,
	);
	if (!wire?.tokenIdA?.trim() || !wire?.tokenIdB?.trim()) return false;
	return limitlessPositionHitsCatalogLeg(pos, wire);
}
