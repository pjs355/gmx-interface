import type { VenuePriceAdapter } from "./types";

export const limitlessPriceAdapter: VenuePriceAdapter = {
	id: "limitless",
	label: "Limitless",
	sortPriority: 12,
	bboPolicy: "standard",
	isMapped(m) {
		return Boolean(m.limitless);
	},
	books(m) {
		return { bookA: m.limitlessPriceA, bookB: m.limitlessPriceB };
	},
};
