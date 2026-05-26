import type { MatchedMarket, OrderbookData } from "@/types/odds-monitor";
import type { MatchedMarketsDflowWire } from "@/types/matchedMarketsDflowWire";
import type { OrderbookSnapshot } from "@/services/api/orderbookService";
import { monitorBookToOrderbookSnapshot } from "@/features/trading/venues/polymarket/trade/monitorOrderbookAdapter";
import { pandaOutcomeSide } from "@/features/markets/odds-monitor/pandaOutcomeSide";

/** `exchangeMatching.dflow` on a monitor row (tickers, mints, metadata BBO). */
export type DflowKalshiMonitorLink = MatchedMarketsDflowWire & {
	noMintA?: string;
	noMintB?: string;
};

export function getDflowKalshiMonitorLink(
	matched: MatchedMarket,
): DflowKalshiMonitorLink | undefined {
	return matched.dflow;
}

export function hasDflowKalshiMonitorLink(matched: MatchedMarket | null | undefined): boolean {
	return Boolean(matched?.dflow);
}

/**
 * DFlow venue row books (Panda A/B). `dflowPriceA/B` are Kalshi-sourced on the server;
 * mapped to YES/NO via {@link pandaOutcomeSide}.
 */
export function dflowKalshiOrderbookForPosition(
	matched: MatchedMarket,
	position: "yes" | "no",
	yesTeamLabel: string,
	noTeamLabel: string,
): OrderbookData | null {
	if (!matched.dflow) return null;
	const side = pandaOutcomeSide(matched, position, yesTeamLabel, noTeamLabel);
	const book = side === "A" ? matched.dflowPriceA : matched.dflowPriceB;
	return book ?? null;
}

function bestAskBidFromSnapshot(snap: OrderbookSnapshot | null): {
	bestAsk: number | null;
	bestBid: number | null;
} {
	if (!snap) return { bestAsk: null, bestBid: null };
	const asks = snap.asks ?? [];
	const bids = snap.bids ?? [];
	const bestAsk = asks.length > 0 ? Math.min(...asks.map((a) => a.price)) : null;
	const bestBid = bids.length > 0 ? Math.max(...bids.map((b) => b.price)) : null;
	return { bestAsk, bestBid };
}

/**
 * Best bid/ask per outcome from the monitor's A/B books. Stable when toggling
 * Yes/No selection (unlike deriving both buttons from the single selected-outcome book).
 */
export function dflowKalshiOutcomeDisplayPrices(
	matched: MatchedMarket,
	yesTeamLabel: string,
	noTeamLabel: string,
	side: "buy" | "sell",
): { yes: number | null; no: number | null } {
	const ySnap = monitorBookToOrderbookSnapshot(
		dflowKalshiOrderbookForPosition(matched, "yes", yesTeamLabel, noTeamLabel),
	);
	const nSnap = monitorBookToOrderbookSnapshot(
		dflowKalshiOrderbookForPosition(matched, "no", yesTeamLabel, noTeamLabel),
	);
	const y = bestAskBidFromSnapshot(ySnap);
	const n = bestAskBidFromSnapshot(nSnap);
	return {
		yes: side === "buy" ? y.bestAsk : y.bestBid,
		no: side === "buy" ? n.bestAsk : n.bestBid,
	};
}
