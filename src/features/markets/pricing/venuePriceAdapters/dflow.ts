import type { VenuePriceAdapter } from "./types";

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
		return { bookA: m.dflowPriceA, bookB: m.dflowPriceB };
	},
	shouldShowRow(m, quotes) {
		if (!m.dflow) return false;
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
