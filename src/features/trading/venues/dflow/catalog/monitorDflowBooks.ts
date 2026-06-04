import type { MatchedMarket, OrderbookData } from "@/types/odds-monitor";
import type { MatchedMarketsDflowWire } from "@/types/matchedMarketsDflowWire";
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
