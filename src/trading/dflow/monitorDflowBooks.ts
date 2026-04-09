import type { MatchedMarket, OrderbookData } from "@/types/odds-monitor";
import type { MatchedMarketsDflowWire } from "@/types/matchedMarketsDflowWire";
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
