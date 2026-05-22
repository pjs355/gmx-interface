import { useMemo } from "react";
import { useOddsDisplay } from "@/context/OddsDisplayContext";
import { calculateOrderbookPrices } from "@/helpers/predictionUtils";
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
			input.yesTeamLabel,
			input.noTeamLabel,
			input.crossBuyYes,
			input.crossBuyNo,
			input.allMarketsSellYesBid,
			input.allMarketsSellNoBid,
		],
	);

	const predictHints = input.predictVenueBookHints ?? null;
	const yesHintPrices = useMemo(
		() =>
			predictHints?.yes
				? calculateOrderbookPrices(predictHints.yes)
				: null,
		[predictHints?.yes],
	);
	const noHintPrices = useMemo(
		() =>
			predictHints?.no ? calculateOrderbookPrices(predictHints.no) : null,
		[predictHints?.no],
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
	}, [
		input.side,
		input.allMarketsSellYesBid,
		resolved.yesPrice,
		formatPrice,
	]);

	const noPriceCents = useMemo(() => {
		if (
			input.side === "sell" &&
			input.allMarketsSellNoBid != null &&
			Number.isFinite(input.allMarketsSellNoBid)
		) {
			return formatPrice(input.allMarketsSellNoBid);
		}
		return resolved.noPrice !== null ? formatPrice(resolved.noPrice) : "--";
	}, [
		input.side,
		input.allMarketsSellNoBid,
		resolved.noPrice,
		formatPrice,
	]);

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
