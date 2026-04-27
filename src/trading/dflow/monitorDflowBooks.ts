import type { MatchedMarket, OrderbookData } from "@/types/odds-monitor";
import type { MatchedMarketsDflowWire } from "@/types/matchedMarketsDflowWire";
import type { OrderbookSnapshot } from "@/services/api/orderbookService";
import { monitorBookToOrderbookSnapshot } from "@/trading/polymarket/monitorOrderbookAdapter";
import { polyOutcomeSide } from "@/trading/polymarket/polyOutcomeTokenId";

/** Same wire shape from the odds monitor for Kalshi tickers or DFlow (tokenized Kalshi). */
export type DflowKalshiMonitorLink = MatchedMarketsDflowWire & {
	noMintA?: string;
	noMintB?: string;
};

/**
 * Monitor may send `dflow` (new) or `kalshi` (legacy). Same books, one venue row.
 */
export function getDflowKalshiMonitorLink(
	matched: MatchedMarket
): DflowKalshiMonitorLink | undefined {
	return matched.dflow ?? matched.kalshi;
}

export function hasDflowKalshiMonitorLink(
	matched: MatchedMarket | null | undefined
): boolean {
	return Boolean(matched && getDflowKalshiMonitorLink(matched));
}

/**
 * DFlow / Kalshi side-A/B books from the monitor, mapped like Polymarket (`polyOutcomeSide`).
 */
export function dflowKalshiOrderbookForPosition(
	matched: MatchedMarket,
	position: "yes" | "no",
	yesTeamLabel: string,
	noTeamLabel: string
): OrderbookData | null {
	if (!getDflowKalshiMonitorLink(matched)) return null;
	const side = polyOutcomeSide(matched, position, yesTeamLabel, noTeamLabel);
	const priceA = matched.dflowPriceA ?? matched.kalshiPriceA;
	const priceB = matched.dflowPriceB ?? matched.kalshiPriceB;
	const book = side === "A" ? priceA : priceB;
	return book ?? null;
}

function bestAskBidFromSnapshot(snap: OrderbookSnapshot | null): {
	bestAsk: number | null;
	bestBid: number | null;
} {
	if (!snap) return { bestAsk: null, bestBid: null };
	const asks = snap.asks ?? [];
	const bids = snap.bids ?? [];
	const bestAsk =
		asks.length > 0 ? Math.min(...asks.map((a) => a.price)) : null;
	const bestBid =
		bids.length > 0 ? Math.max(...bids.map((b) => b.price)) : null;
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
