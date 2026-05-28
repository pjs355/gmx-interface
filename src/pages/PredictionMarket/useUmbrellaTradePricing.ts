import { useEffect, useMemo } from "react";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import { useVenuePandaSubscription } from "@/context/VenuePandaSubscriptionContext";
import {
	resolveFifaThreeWayOddsContext,
	hasFifaThreeWayOddsContext,
} from "@/features/markets/odds-monitor/resolveFifaThreeWayOddsContext";
import {
	resolveLimitlessRoutingForOdds,
	resolveOddsSubscriptionKey,
} from "@/features/markets/odds-monitor/resolveOddsSubscriptionKey";
import { useFifaThreeWayTradingPagePrices } from "@/features/markets/pricing/useFifaThreeWayTradingPagePrices";
import { useTradingPagePrices } from "@/features/markets/pricing/useTradingPagePrices";

export type UseUmbrellaTradePricingArgs = {
	umbrella: Umbrella | null | undefined;
	/** Active moneyline leg — trade box + Orderbooks tab; Basic tab uses all legs when FIFA 3-way. */
	activeQuestion?: PredictionMarket | null;
	/** All umbrella questions — required for FIFA 3-way cross-venue table. */
	questions?: readonly PredictionMarket[];
};

/** Shared venue monitor + pricing for MarketPanels and home trade dock. */
export function useUmbrellaTradePricing({
	umbrella,
	activeQuestion,
	questions,
}: UseUmbrellaTradePricingArgs) {
	const fifaCtx = useMemo(
		() => resolveFifaThreeWayOddsContext(umbrella, questions),
		[umbrella, questions],
	);

	const oddsSubscriptionKey = useMemo(
		() => resolveOddsSubscriptionKey(umbrella, activeQuestion),
		[umbrella, activeQuestion],
	);

	const limitlessFromUmbrella = useMemo(
		() => resolveLimitlessRoutingForOdds(umbrella, activeQuestion),
		[umbrella, activeQuestion],
	);

	const subscriptionKeys = useMemo((): string[] => {
		if (fifaCtx) return [...fifaCtx.subscriptionKeys];
		if (oddsSubscriptionKey) return [oddsSubscriptionKey];
		return [];
	}, [fifaCtx, oddsSubscriptionKey]);

	const { subscribePandaMatchId, unsubscribePandaMatchId } = useVenuePandaSubscription();
	useEffect(() => {
		if (subscriptionKeys.length === 0) return;
		for (const key of subscriptionKeys) {
			subscribePandaMatchId(key);
		}
		return () => {
			for (const key of subscriptionKeys) {
				unsubscribePandaMatchId(key);
			}
		};
	}, [subscriptionKeys, subscribePandaMatchId, unsubscribePandaMatchId]);

	const fifaTradingPagePrices = useFifaThreeWayTradingPagePrices(fifaCtx, umbrella?._id);

	const binaryTradingPagePrices = useTradingPagePrices(
		oddsSubscriptionKey ?? "",
		umbrella?._id,
		limitlessFromUmbrella,
	);

	const tradingPagePrices = fifaTradingPagePrices ?? binaryTradingPagePrices;
	const activeLegTradingPagePrices = binaryTradingPagePrices;

	const showCrossVenueBooks = fifaCtx
		? hasFifaThreeWayOddsContext(umbrella, questions)
		: oddsSubscriptionKey !== null;

	return {
		tradingPagePrices,
		activeLegTradingPagePrices,
		fifaCtx,
		oddsSubscriptionKey,
		limitlessFromUmbrella,
		showCrossVenueBooks,
		/** @deprecated Prefer `oddsSubscriptionKey` — wire key is not always a Panda match id. */
		pandascoreMatchId: oddsSubscriptionKey ?? "",
	};
}
