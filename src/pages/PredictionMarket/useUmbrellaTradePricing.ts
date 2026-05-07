import { useEffect } from "react";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import { useVenuePandaSubscription } from "@/context/VenuePandaSubscriptionContext";
import { useTradingPagePrices } from "@/hooks/useTradingPagePrices";

export type UseUmbrellaTradePricingArgs = {
	umbrella: Umbrella | null | undefined;
};

/** Shared venue monitor + `useTradingPagePrices` for MarketPanels and home trade dock. */
export function useUmbrellaTradePricing({
	umbrella,
}: UseUmbrellaTradePricingArgs) {
	const pandascoreMatchId =
		typeof umbrella?.pandascore_matchId === "string"
			? umbrella.pandascore_matchId.trim()
			: "";

	const umbrellaLimitless = umbrella?.exchangeMatching?.limitless;

	const { subscribePandaMatchId, unsubscribePandaMatchId } =
		useVenuePandaSubscription();
	useEffect(() => {
		if (!pandascoreMatchId) return;
		subscribePandaMatchId(pandascoreMatchId);
		return () => unsubscribePandaMatchId(pandascoreMatchId);
	}, [pandascoreMatchId, subscribePandaMatchId, unsubscribePandaMatchId]);

	const tradingPagePrices = useTradingPagePrices(
		pandascoreMatchId,
		umbrella?._id,
		umbrellaLimitless,
	);

	return {
		tradingPagePrices,
		pandascoreMatchId,
	};
}
