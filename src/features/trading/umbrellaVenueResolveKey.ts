import type { VenuePosition } from "@/types/trading/venuePosition";
import { canonicalLimitlessTokenId } from "@/features/trading/venues/limitless/trade/limitlessTokenId";
import { normalizePredictTokenId } from "@/features/trading/venues/predict/portfolio/predictOrdersApi";
import { polymarketConditionIdForResolveWire } from "@/features/trading/venues/polymarket/trade/polymarketConditionLookup";

export type UmbrellaExchangeResolveQuery = {
	clientKey: string;
	venue: "polymarket" | "predictfun" | "limitless" | "dflow";
	conditionId?: string;
	numericMarketId?: number;
	tokenId?: string;
	/** DFlow only: Kalshi/DFlow `eventTicker` (must match `exchangeMatching.dflow.eventTicker`). */
	dflowEventTicker?: string;
	eventSlug?: string;
};

/** Stable key aligned with POST `/api/umbrellas/resolve-exchange-keys` `clientKey`. */
export function venueHistoryExchangeResolveKey(pos: VenuePosition): string | null {
	if (pos.venue === "predictfun" && pos.numericMarketId != null && pos.tokenId) {
		const tid = normalizePredictTokenId(pos.tokenId);
		if (!tid) return null;
		return `pf:${pos.numericMarketId}:${tid}`;
	}
	if (pos.venue === "polymarket" && pos.conditionId?.trim()) {
		const cid = polymarketConditionIdForResolveWire(pos.conditionId);
		if (!cid) return null;
		return `poly:${cid}`;
	}
	if (pos.venue === "limitless" && pos.tokenId?.trim()) {
		const t = canonicalLimitlessTokenId(pos.tokenId);
		if (!t) return null;
		const s = (pos.eventSlug ?? "").trim();
		return `lx:${t}:${s}`;
	}
	if (pos.venue === "dflow") {
		const et = pos.dflowEventTicker?.trim();
		if (et) return `dfevt:${et}`;
		const m = pos.tokenId?.trim();
		if (m) return `df:${m}`;
	}
	return null;
}

/** Rows already linked to a catalog umbrella id skip batch resolve. Display name alone must not skip — API can send name without id. */
export function shouldRequestVenueHistoryUmbrellaResolve(pos: VenuePosition): boolean {
	if (pos.levelUpUmbrellaId?.trim()) return false;
	return venueHistoryExchangeResolveKey(pos) != null;
}

export function venuePositionToResolveQuery(
	pos: VenuePosition,
	clientKey: string,
): UmbrellaExchangeResolveQuery | null {
	if (pos.venue === "predictfun") {
		if (pos.numericMarketId == null || !pos.tokenId) return null;
		return {
			clientKey,
			venue: "predictfun",
			numericMarketId: pos.numericMarketId,
			tokenId: pos.tokenId,
		};
	}
	if (pos.venue === "polymarket") {
		const cid = polymarketConditionIdForResolveWire(pos.conditionId ?? "");
		if (!cid) return null;
		return { clientKey, venue: "polymarket", conditionId: cid };
	}
	if (pos.venue === "limitless") {
		if (!pos.tokenId?.trim()) return null;
		return {
			clientKey,
			venue: "limitless",
			tokenId: pos.tokenId,
			...(pos.eventSlug?.trim() ? { eventSlug: pos.eventSlug.trim() } : {}),
		};
	}
	if (pos.venue === "dflow") {
		const et = pos.dflowEventTicker?.trim();
		if (et) {
			return { clientKey, venue: "dflow", dflowEventTicker: et };
		}
		const m = pos.tokenId?.trim();
		if (!m) return null;
		return { clientKey, venue: "dflow", tokenId: m };
	}
	return null;
}
