import { useEffect } from "react";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import { useVenuePandaSubscription } from "@/context/VenuePandaSubscriptionContext";
import { useTradingPagePrices } from "@/features/markets/pricing/useTradingPagePrices";
import {
	isPerLegVenueKey,
	resolveUmbrellaVenueKey,
} from "@/features/markets/pricing/venueLookupKey";

export type UseUmbrellaTradePricingArgs = {
	umbrella: Umbrella | null | undefined;
	/**
	 * Active question. For Polymarket-sourced sports (FIFA 3-way) the venue key is
	 * the active leg's `polymarketMarketId`; for esports it is ignored (umbrella-level
	 * `pandascore_matchId` wins).
	 */
	activeQuestion?: PredictionMarket | null;
};

/** Shared venue monitor + `useTradingPagePrices` for MarketPanels and home trade dock. */
export function useUmbrellaTradePricing({ umbrella, activeQuestion }: UseUmbrellaTradePricingArgs) {
	/**
	 * Umbrella-level for esports series; per-map `${pandascore_matchId}-map-${slot}`
	 * for esports map legs; per-leg `polymarketMarketId` for FIFA mirror markets.
	 */
	const venueKey = resolveUmbrellaVenueKey(umbrella, activeQuestion);
	const perLeg = isPerLegVenueKey(umbrella, activeQuestion);

	// Limitless on the umbrella applies to the umbrella-level (series) book only;
	// per-leg keys (Polymarket leg or esports map leg) carry their own routing,
	// resolved by venue key alone (see aggregator-sub precedent).
	const umbrellaLimitless = perLeg ? undefined : umbrella?.exchangeMatching?.limitless;

	const { subscribePandaMatchId, unsubscribePandaMatchId } = useVenuePandaSubscription();
	useEffect(() => {
		if (!venueKey) return;
		subscribePandaMatchId(venueKey);
		return () => unsubscribePandaMatchId(venueKey);
	}, [venueKey, subscribePandaMatchId, unsubscribePandaMatchId]);

	const tradingPagePrices = useTradingPagePrices(
		venueKey,
		perLeg ? undefined : umbrella?._id,
		umbrellaLimitless,
	);

	return {
		tradingPagePrices,
		pandascoreMatchId: venueKey,
	};
}
