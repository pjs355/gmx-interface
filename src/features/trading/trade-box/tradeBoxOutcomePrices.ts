import type { OrderbookSnapshot } from "@/services/api/orderbookService";
import type { MatchedMarket, OrderbookData } from "@/types/odds-monitor";
import { bboFromBook, bboPolicyForTradingVenue } from "@/features/markets/pricing/bboFromBook";
import type { BboPolicy } from "@/features/markets/pricing/venuePriceAdapters/types";
import {
	dflowKalshiOrderbookForPosition,
	hasDflowKalshiMonitorLink,
} from "@/features/trading/venues/dflow/catalog/monitorDflowBooks";
import { limitlessOrderbookForPosition } from "@/features/trading/venues/limitless/trade/limitlessOrderbook";
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

function complementProb(p: number | null): number | null {
	return p === null ? null : 1 - p;
}

/**
 * YES/NO display prices for a binary venue exposing two outcome books.
 *
 * Prefers the dedicated outcome's own resting book; when that side has no
 * quotable price (Limitless / Kalshi-via-DFlow frequently leave one outcome's
 * feed empty even though both sides are subscribed), it falls back to the
 * binary complement of the opposite side (No = 1 − Yes). Reads scalar BBO via
 * the venue policy and is stable across the YES/NO selection toggle.
 */
function binaryOutcomeDisplayPrices(
	yesBook: OrderbookData | null,
	noBook: OrderbookData | null,
	policy: BboPolicy,
	side: "buy" | "sell",
): { yes: number | null; no: number | null } {
	const y = bboFromBook(policy, yesBook);
	const n = bboFromBook(policy, noBook);
	if (side === "buy") {
		return {
			yes: finiteOrNull(y.bestAsk) ?? complementProb(finiteOrNull(n.bestBid)),
			no: finiteOrNull(n.bestAsk) ?? complementProb(finiteOrNull(y.bestBid)),
		};
	}
	return {
		yes: finiteOrNull(y.bestBid) ?? complementProb(finiteOrNull(n.bestAsk)),
		no: finiteOrNull(n.bestBid) ?? complementProb(finiteOrNull(y.bestAsk)),
	};
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

	const bookRepresentsNo = tradingVenue === "polymarket" && selectedPosition === "no";

	// Limitless and Kalshi (venue `dflow`) expose two outcome books but one side's
	// feed is often empty. Read BOTH books and complement the empty side so YES and
	// NO are always quotable and stable across the position toggle.
	const venueOutcomeDisplayPrices =
		tradingVenue === "dflow" && matchedMonitor && hasDflowKalshiMonitorLink(matchedMonitor)
			? binaryOutcomeDisplayPrices(
					dflowKalshiOrderbookForPosition(matchedMonitor, "yes", yesTeamLabel, noTeamLabel),
					dflowKalshiOrderbookForPosition(matchedMonitor, "no", yesTeamLabel, noTeamLabel),
					bboPolicyForTradingVenue("dflow"),
					side,
				)
			: tradingVenue === "limitless" && matchedMonitor?.limitless
				? binaryOutcomeDisplayPrices(
						limitlessOrderbookForPosition(matchedMonitor, "yes", yesTeamLabel, noTeamLabel),
						limitlessOrderbookForPosition(matchedMonitor, "no", yesTeamLabel, noTeamLabel),
						bboPolicyForTradingVenue("limitless"),
						side,
					)
				: null;

	const yesPrice =
		tradingVenue === "all" && side === "buy" && crossBuyYes != null && Number.isFinite(crossBuyYes)
			? crossBuyYes
			: tradingVenue === "predictfun"
				? hintSidePrice(predictVenueBookHints?.yes, side, bboPolicyForTradingVenue("predictfun"))
				: tradingVenue === "levelup"
					? hintSidePrice(levelUpVenueBookHints?.yes, side, bboPolicyForTradingVenue("levelup"))
					: venueOutcomeDisplayPrices
						? venueOutcomeDisplayPrices.yes
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
					: venueOutcomeDisplayPrices
						? venueOutcomeDisplayPrices.no
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
