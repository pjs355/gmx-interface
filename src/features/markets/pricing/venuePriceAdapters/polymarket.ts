import type { VenuePriceAdapter } from "./types";

/** Minimal template for a standard-BBO venue — see `venuePriceAdapters/index.ts` to register. */
export const polymarketPriceAdapter: VenuePriceAdapter = {
	id: "poly",
	label: "Polymarket",
	sortPriority: 10,
	bboPolicy: "standard",
	isMapped(m) {
		return Boolean(m.polyConditionId || m.polyTokenIdA);
	},
	books(m) {
		return { bookA: m.polyPriceA, bookB: m.polyPriceB };
	},
};
