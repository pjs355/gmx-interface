import type { VenuePriceAdapter } from "./types";

export const levelUpPriceAdapter: VenuePriceAdapter = {
	id: "levelup",
	label: "LevelUp",
	sortPriority: 0,
	bboPolicy: "restingOnly",
	isMapped() {
		return true;
	},
	books(m) {
		return { bookA: m.levelUpPriceA, bookB: m.levelUpPriceB };
	},
	shouldShowRow(_m, quotes) {
		return (
			quotes.askA !== null || quotes.askB !== null || quotes.bidA !== null || quotes.bidB !== null
		);
	},
};
