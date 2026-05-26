import type { VenuePriceAdapter } from "./types";

export const predictPriceAdapter: VenuePriceAdapter = {
	id: "predictFun",
	label: "Predict",
	sortPriority: 13,
	bboPolicy: "standard",
	isMapped(m) {
		return Boolean(m.predictFun);
	},
	books(m) {
		return { bookA: m.predictFunPriceA, bookB: m.predictFunPriceB };
	},
};
