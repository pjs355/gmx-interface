import type { Umbrella } from "@/services/api/umbrellaDataService";
import type { MatchedMarket } from "@/types/odds-monitor";
import type { VenuePosition } from "@/types/trading/venuePosition";
import { canonicalLimitlessTokenId } from "@/trading/limitless/limitlessTokenId";

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
	const lx = matchedMonitor?.limitless ?? umbrella?.exchangeMatching?.limitless;
	if (!lx?.tokenIdA || !lx?.tokenIdB) return false;
	const tid = canonicalLimitlessTokenId(pos.tokenId);
	const a = canonicalLimitlessTokenId(String(lx.tokenIdA));
	const b = canonicalLimitlessTokenId(String(lx.tokenIdB));
	if (!tid || (tid !== a && tid !== b)) return false;
	const slugPos = (pos.eventSlug ?? "").trim();
	if (!slugPos) return true;
	const slugParent = (lx.slug ?? "").trim();
	const oa = (lx.orderbookSlugA ?? "").trim();
	const ob = (lx.orderbookSlugB ?? "").trim();
	if (slugParent && slugPos === slugParent) return true;
	if ((oa && slugPos === oa) || (ob && slugPos === ob)) return true;
	return true;
}
