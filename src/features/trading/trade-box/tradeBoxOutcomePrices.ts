import type { OrderbookSnapshot } from "@/services/api/orderbookService";
import type { MatchedMarket } from "@/types/odds-monitor";
import { bboFromBook, bboPolicyForTradingVenue } from "@/features/markets/pricing/bboFromBook";
import type { BboPolicy } from "@/features/markets/pricing/venuePriceAdapters/types";
import {
	dflowKalshiOutcomeDisplayPrices,
	hasDflowKalshiMonitorLink,
} from "@/features/trading/venues/dflow/catalog/monitorDflowBooks";
import type { TradingVenue } from "./types";

export type OutcomeBookHints = {
	yes: OrderbookSnapshot | null;
	no: OrderbookSnapshot | null;
} | null;

export type ResolveTradeBoxOutcomePricesInput = {
	tradingVenue: TradingVenue;
	side: "buy" | "sell";
	selectedPosition: "yes" | "no" | null;
	orderbook?: OrderbookSnapshot | null;
	predictVenueBookHints?: OutcomeBookHints;
	levelUpVenueBookHints?: OutcomeBookHints;
	matchedMonitor?: MatchedMarket | null;
	yesTeamLabel: string;
	noTeamLabel: string;
	crossBuyYes?: number | null;
	crossBuyNo?: number | null;
	allMarketsSellYesBid?: number | null;
	allMarketsSellNoBid?: number | null;
};

type TradeBoxOutcomePrices = {
	yesPrice: number | null;
	noPrice: number | null;
	/** Mobile curtain peek: `""` when All Markets sell has no held-venue bid to show. */
	yesPriceCurtain: number | null | "";
	noPriceCurtain: number | null | "";
	bestAsk: number | null;
	bestBid: number | null;
};

function finiteOrNull(v: number | null | undefined): number | null {
	return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function hintSidePrice(
	hint: OrderbookSnapshot | null | undefined,
	side: "buy" | "sell",
	policy: BboPolicy,
): number | null {
	if (!hint) return null;
	const { bestAsk, bestBid } = bboFromBook(policy, hint);
	return side === "buy" ? finiteOrNull(bestAsk) : finiteOrNull(bestBid);
}

export function resolveTradeBoxOutcomePrices(
	input: ResolveTradeBoxOutcomePricesInput,
): TradeBoxOutcomePrices {
	const {
		tradingVenue,
		side,
		selectedPosition,
		orderbook,
		predictVenueBookHints,
		levelUpVenueBookHints,
		matchedMonitor,
		yesTeamLabel,
		noTeamLabel,
		crossBuyYes,
		crossBuyNo,
		allMarketsSellYesBid,
		allMarketsSellNoBid,
	} = input;

	const bboPolicy = bboPolicyForTradingVenue(tradingVenue);
	const { bestAsk, bestBid } = bboFromBook(bboPolicy, orderbook ?? null);

	const bookRepresentsNo =
		(tradingVenue === "polymarket" || tradingVenue === "limitless") && selectedPosition === "no";

	const dflowOutcomeDisplayPrices =
		tradingVenue === "dflow" && matchedMonitor && hasDflowKalshiMonitorLink(matchedMonitor)
			? dflowKalshiOutcomeDisplayPrices(matchedMonitor, yesTeamLabel, noTeamLabel, side)
			: null;

	const yesPrice =
		tradingVenue === "all" && side === "buy" && crossBuyYes != null && Number.isFinite(crossBuyYes)
			? crossBuyYes
			: tradingVenue === "predictfun"
				? hintSidePrice(predictVenueBookHints?.yes, side, bboPolicyForTradingVenue("predictfun"))
				: tradingVenue === "levelup"
					? hintSidePrice(levelUpVenueBookHints?.yes, side, bboPolicyForTradingVenue("levelup"))
					: tradingVenue === "dflow" && dflowOutcomeDisplayPrices
						? dflowOutcomeDisplayPrices.yes
						: bookRepresentsNo
							? side === "buy"
								? bestBid === null
									? null
									: 1 - bestBid
								: bestAsk === null
									? null
									: 1 - bestAsk
							: side === "buy"
								? bestAsk
								: bestBid;

	const noPrice =
		tradingVenue === "all" && side === "buy" && crossBuyNo != null && Number.isFinite(crossBuyNo)
			? crossBuyNo
			: tradingVenue === "predictfun"
				? hintSidePrice(predictVenueBookHints?.no, side, bboPolicyForTradingVenue("predictfun"))
				: tradingVenue === "levelup"
					? hintSidePrice(levelUpVenueBookHints?.no, side, bboPolicyForTradingVenue("levelup"))
					: tradingVenue === "dflow" && dflowOutcomeDisplayPrices
						? dflowOutcomeDisplayPrices.no
						: bookRepresentsNo
							? side === "buy"
								? bestAsk
								: bestBid
							: side === "buy"
								? bestBid === null
									? null
									: 1 - bestBid
								: bestAsk === null
									? null
									: 1 - bestAsk;

	let yesPriceCurtain: number | null | "" = yesPrice;
	let noPriceCurtain: number | null | "" = noPrice;

	if (tradingVenue === "all" && side === "sell") {
		if (allMarketsSellYesBid != null && Number.isFinite(allMarketsSellYesBid)) {
			yesPriceCurtain = allMarketsSellYesBid;
		} else {
			yesPriceCurtain = "";
		}
		if (allMarketsSellNoBid != null && Number.isFinite(allMarketsSellNoBid)) {
			noPriceCurtain = allMarketsSellNoBid;
		} else {
			noPriceCurtain = "";
		}
	}

	return {
		yesPrice,
		noPrice,
		yesPriceCurtain,
		noPriceCurtain,
		bestAsk,
		bestBid,
	};
}
