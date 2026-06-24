/**
 * Resolves YES/NO button prices and BBO hints for the trade box UI.
 *
 * Wraps `resolveTradeBoxOutcomePrices` with odds-format display strings, sell-tab
 * All Markets best bids, and Predict hint book prices for avg-cents math.
 *
 * Called once in `PredictionMarketTradeBoxResponsiveContainer` and passed to UI
 * (do not call again inside `PredictionMarketTradeBoxUI`).
 */
import { useMemo } from "react";
import { useOddsDisplay } from "@/context/OddsDisplayContext";
import { bboFromBook, bboPolicyForTradingVenue } from "@/features/markets/pricing/bboFromBook";
import {
	resolveTradeBoxOutcomePrices,
	type ResolveTradeBoxOutcomePricesInput,
} from "../tradeBoxOutcomePrices";

export function useTradeBoxOutcomePrices(input: ResolveTradeBoxOutcomePricesInput) {
	const { formatPrice } = useOddsDisplay();

	const resolved = useMemo(
		() => resolveTradeBoxOutcomePrices(input),
		[
			input.tradingVenue,
			input.side,
			input.selectedPosition,
			input.orderbook,
			input.predictVenueBookHints,
			input.levelUpVenueBookHints,
			input.matchedMonitor,
			input.moneylineLeg,
			input.yesTeamLabel,
			input.noTeamLabel,
			input.crossBuyYes,
			input.crossBuyNo,
			input.allMarketsSellYesBid,
			input.allMarketsSellNoBid,
		],
	);

	const predictHints = input.predictVenueBookHints ?? null;
	const predictBboPolicy = bboPolicyForTradingVenue("predictfun");
	const yesHintPrices = useMemo(
		() => (predictHints?.yes ? bboFromBook(predictBboPolicy, predictHints.yes) : null),
		[predictHints?.yes, predictBboPolicy],
	);
	const noHintPrices = useMemo(
		() => (predictHints?.no ? bboFromBook(predictBboPolicy, predictHints.no) : null),
		[predictHints?.no, predictBboPolicy],
	);

	const yesPriceCents = useMemo(() => {
		if (
			input.side === "sell" &&
			input.allMarketsSellYesBid != null &&
			Number.isFinite(input.allMarketsSellYesBid)
		) {
			return formatPrice(input.allMarketsSellYesBid);
		}
		return resolved.yesPrice !== null ? formatPrice(resolved.yesPrice) : "--";
	}, [input.side, input.allMarketsSellYesBid, resolved.yesPrice, formatPrice]);

	const noPriceCents = useMemo(() => {
		if (
			input.side === "sell" &&
			input.allMarketsSellNoBid != null &&
			Number.isFinite(input.allMarketsSellNoBid)
		) {
			return formatPrice(input.allMarketsSellNoBid);
		}
		return resolved.noPrice !== null ? formatPrice(resolved.noPrice) : "--";
	}, [input.side, input.allMarketsSellNoBid, resolved.noPrice, formatPrice]);

	const formatCurtainPrice = (curtain: number | null | ""): string => {
		if (curtain === "") return "";
		return formatPrice(curtain);
	};

	return {
		...resolved,
		yesPriceCents,
		noPriceCents,
		formatCurtainPrice,
		predictHints,
		yesHintPrices,
		noHintPrices,
	};
}

export type TradeBoxOutcomePricesSnapshot = ReturnType<typeof useTradeBoxOutcomePrices>;
