import type { VenuePriceAdapter } from "./types";
import type { MatchedMarket } from "@/types/odds-monitor";
import { kalshiLegDisplayBooks } from "@/features/markets/pricing/kalshiLegYesBook";

function dflowBooksForLeg(m: MatchedMarket) {
	return kalshiLegDisplayBooks(m);
}

/**
 * Kalshi/DFlow lifecycle statuses that mean the market resolved. Mirrors
 * `isDflowMarketStatusTerminal` on predictions-api. Once terminal, the ladder we
 * hold is a frozen pre-resolution snapshot — it must never render as live odds.
 */
function isDflowLegStatusTerminal(status: string | null | undefined): boolean {
	if (!status?.trim()) return false;
	return /^(final|settled|closed|resolved|inactive|determined|expired)/i.test(status.trim());
}

/** True when either Kalshi leg on this market has reached a terminal status. */
export function dflowRoutingLooksTerminal(m: MatchedMarket): boolean {
	const d = m.dflow;
	if (!d) return false;
	return (
		isDflowLegStatusTerminal(d.dflowNestedStatusA) ||
		isDflowLegStatusTerminal(d.dflowNestedStatusB)
	);
}

/** DFlow venue row (UI label Kalshi). Books are Kalshi-sourced on predictions-api. */
export const dflowPriceAdapter: VenuePriceAdapter = {
	id: "dflow",
	label: "Kalshi",
	sortPriority: 11,
	bboPolicy: "kalshiDflow",
	isMapped(m) {
		return Boolean(m.dflow);
	},
	books(m) {
		return dflowBooksForLeg(m);
	},
	shouldShowRow(m, quotes) {
		if (!m.dflow) return false;
		// Finalized/settled Kalshi market: hide the row entirely. Its stored ladder
		// froze at the last pre-resolution book (predictions-api ingest drops
		// finalized markets), so any price here is stale and must not show.
		if (dflowRoutingLooksTerminal(m)) return false;
		const hideUninitialized =
			m.dflow.accountsInitializedA === false &&
			m.dflow.accountsInitializedB === false &&
			quotes.askA === null &&
			quotes.askB === null &&
			quotes.bidA === null &&
			quotes.bidB === null;
		return !hideUninitialized;
	},
};
