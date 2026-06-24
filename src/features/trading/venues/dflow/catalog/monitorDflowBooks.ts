import type { MatchedMarket, OrderbookData } from "@/types/odds-monitor";
import type { MatchedMarketsDflowWire } from "@/types/matchedMarketsDflowWire";
import { pandaOutcomeSide } from "@/features/markets/odds-monitor/pandaOutcomeSide";
import {
	kalshiDflowHasDistinctTickerB,
	kalshiLegDisplayBooks,
	type MoneylineLegWire,
} from "@/features/markets/pricing/kalshiLegYesBook";

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

/** YES/NO display books for Kalshi orderbooks tab and trade-box walks. */
export function dflowKalshiDisplayBooks(
	matched: MatchedMarket,
	legHint?: MoneylineLegWire | null,
): { bookA: OrderbookData | null | undefined; bookB: OrderbookData | null | undefined } {
	return kalshiLegDisplayBooks(matched, legHint);
}

/**
 * Resting book for trade-box YES/NO on Kalshi (DFlow wire).
 * Dual-ticker H2H: team label → wire column. Single-ticker per-leg: YES/NO → display books.
 */
export function dflowKalshiOrderbookForPosition(
	matched: MatchedMarket,
	position: "yes" | "no",
	yesTeamLabel: string,
	noTeamLabel: string,
	legHint?: MoneylineLegWire | null,
): OrderbookData | null {
	if (!matched.dflow) return null;

	if (kalshiDflowHasDistinctTickerB(matched.dflow)) {
		const side = pandaOutcomeSide(matched, position, yesTeamLabel, noTeamLabel);
		const book = side === "A" ? matched.dflowPriceA : matched.dflowPriceB;
		return book ?? null;
	}

	const { bookA, bookB } = kalshiLegDisplayBooks(matched, legHint);
	return position === "yes" ? (bookA ?? null) : (bookB ?? null);
}
