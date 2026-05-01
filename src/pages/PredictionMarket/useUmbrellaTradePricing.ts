import { useEffect, useMemo } from "react";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import { resolveLevelUpOrderbookKey } from "./utils";
import { useOddsMonitor } from "@/context/OddsMonitorContext";
import { useVenuePandaSubscription } from "@/context/VenuePandaSubscriptionContext";
import { useDirectVenueBooks } from "@/trading/venue-books";
import { getDflowKalshiMonitorLink } from "@/trading/dflow/monitorDflowBooks";
import type { OrderbookData } from "@/types/odds-monitor";
import { useTradingPagePrices } from "@/hooks/useTradingPagePrices";
import { findOddsMatchedMarket } from "@/utils/findOddsMatchedMarket";
import { mergeMonitorLimitlessFromUmbrella } from "@/utils/mergeMonitorLimitlessFromUmbrella";

function orderbookDataHasDepth(book: OrderbookData | null | undefined): boolean {
	if (!book) return false;
	const asks = book.asks?.some((a) => (a.size ?? 0) > 0);
	const bids = book.bids?.some((b) => (b.size ?? 0) > 0);
	return Boolean(asks || bids);
}

export type UseUmbrellaTradePricingArgs = {
	umbrella: Umbrella | null | undefined;
	sortedQuestions: PredictionMarket[];
	questionOrderbooks: Record<string, unknown>;
};

/** Shared venue monitor + LevelUp book + `useTradingPagePrices` for MarketPanels and home trade dock. */
export function useUmbrellaTradePricing({
	umbrella,
	sortedQuestions,
	questionOrderbooks,
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

	const { appState: oddsAppState } = useOddsMonitor();
	const matchedForVenueBooks = useMemo(() => {
		const base = findOddsMatchedMarket(
			oddsAppState?.markets,
			pandascoreMatchId,
			umbrella?._id,
		);
		return mergeMonitorLimitlessFromUmbrella(base, umbrellaLimitless);
	}, [oddsAppState?.markets, pandascoreMatchId, umbrella?._id, umbrellaLimitless]);

	const serverVenueDepthParity = useMemo(() => {
		const m = matchedForVenueBooks;
		if (!m) return false;
		const polyLinked = Boolean(m.polyConditionId || m.polyTokenIdA);
		const polyOk =
			!polyLinked ||
			(orderbookDataHasDepth(m.polyPriceA) && orderbookDataHasDepth(m.polyPriceB));
		const dflowLinked = Boolean(getDflowKalshiMonitorLink(m));
		const dflowOk =
			!dflowLinked ||
			(orderbookDataHasDepth(m.dflowPriceA ?? m.kalshiPriceA) &&
				orderbookDataHasDepth(m.dflowPriceB ?? m.kalshiPriceB));
		return polyOk && dflowOk;
	}, [matchedForVenueBooks]);

	const directBooks = useDirectVenueBooks(matchedForVenueBooks, {
		disabled: serverVenueDepthParity,
	});

	const levelUpOrderbookKey = resolveLevelUpOrderbookKey(
		sortedQuestions,
		(umbrella?.exchangeMatching as { levelup?: { questionId?: string } } | undefined)
			?.levelup?.questionId ?? null,
	);
	const levelUpOrderbook = levelUpOrderbookKey
		? (questionOrderbooks[levelUpOrderbookKey] as any) ?? null
		: null;

	const tradingPagePrices = useTradingPagePrices(
		pandascoreMatchId,
		levelUpOrderbook,
		directBooks,
		umbrella?._id,
		umbrellaLimitless,
	);

	return {
		tradingPagePrices,
		directBooks,
		serverVenueDepthParity,
		pandascoreMatchId,
	};
}
