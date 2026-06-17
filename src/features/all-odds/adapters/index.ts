import type { AllOddsMarket, AllOddsVenueColumn } from "../types";

function hasWsBook(m: AllOddsMarket, fieldA: keyof AllOddsMarket, fieldB: keyof AllOddsMarket): boolean {
	return m[fieldA] != null || m[fieldB] != null;
}

/** CC venues: REST exchangeMatching; display-only: WS book objects only. */
export function isVenueLinked(m: AllOddsMarket, col: AllOddsVenueColumn): boolean {
	const em = m.exchangeMatching;
	switch (col.id) {
		case "polymarket":
			return (
				Boolean(em?.polymarket?.conditionId || em?.polymarket?.tokenIdA) ||
				hasWsBook(m, col.priceFieldA, col.priceFieldB)
			);
		case "predictfun":
			return Boolean(em?.predictFun) || hasWsBook(m, col.priceFieldA, col.priceFieldB);
		case "limitless":
			return Boolean(em?.limitless) || hasWsBook(m, col.priceFieldA, col.priceFieldB);
		case "kalshi":
			return Boolean(em?.dflow) || hasWsBook(m, col.priceFieldA, col.priceFieldB);
		default:
			return hasWsBook(m, col.priceFieldA, col.priceFieldB);
	}
}

export const ALL_ODDS_ADAPTERS: AllOddsVenueColumn[] = [
	{
		id: "polymarket",
		label: "Polymarket",
		sortOrder: 10,
		tradable: true,
		priceFieldA: "polyPriceA",
		priceFieldB: "polyPriceB",
	},
	{
		id: "predictfun",
		label: "Predict",
		sortOrder: 20,
		tradable: true,
		priceFieldA: "predictFunPriceA",
		priceFieldB: "predictFunPriceB",
	},
	{
		id: "limitless",
		label: "Limitless",
		sortOrder: 30,
		tradable: true,
		priceFieldA: "limitlessPriceA",
		priceFieldB: "limitlessPriceB",
	},
	{
		id: "kalshi",
		label: "Kalshi",
		sortOrder: 40,
		tradable: true,
		priceFieldA: "kalshiPriceA",
		priceFieldB: "kalshiPriceB",
	},
	{
		id: "myraid",
		label: "Myriad",
		sortOrder: 140,
		tradable: false,
		priceFieldA: "myraidPriceA",
		priceFieldB: "myraidPriceB",
	},
	{
		id: "betdex",
		label: "BetDEX",
		sortOrder: 170,
		tradable: false,
		priceFieldA: "betdexPriceA",
		priceFieldB: "betdexPriceB",
	},
	{
		id: "forkast",
		label: "Forkast",
		sortOrder: 180,
		tradable: false,
		priceFieldA: "forkastPriceA",
		priceFieldB: "forkastPriceB",
	},
	{
		id: "sxbet",
		label: "SX",
		sortOrder: 190,
		tradable: false,
		priceFieldA: "sxbetPriceA",
		priceFieldB: "sxbetPriceB",
	},
	{
		id: "hyperliquid",
		label: "Hyperliquid",
		sortOrder: 200,
		tradable: false,
		priceFieldA: "hyperliquidPriceA",
		priceFieldB: "hyperliquidPriceB",
	},
].sort((a, b) => a.sortOrder - b.sortOrder);

const WIRE_TO_FIELDS: Record<string, [keyof AllOddsMarket, keyof AllOddsMarket]> = {
	polymarket: ["polyPriceA", "polyPriceB"],
	predictfun: ["predictFunPriceA", "predictFunPriceB"],
	limitless: ["limitlessPriceA", "limitlessPriceB"],
	dflow: ["kalshiPriceA", "kalshiPriceB"],
	kalshi: ["kalshiPriceA", "kalshiPriceB"],
	myraid: ["myraidPriceA", "myraidPriceB"],
	betdex: ["betdexPriceA", "betdexPriceB"],
	forkast: ["forkastPriceA", "forkastPriceB"],
	sxbet: ["sxbetPriceA", "sxbetPriceB"],
	hyperliquid: ["hyperliquidPriceA", "hyperliquidPriceB"],
};

export function allOddsVenueFieldPairs(
	venueWire: string,
): [keyof AllOddsMarket, keyof AllOddsMarket] | undefined {
	const key = venueWire.toLowerCase();
	return WIRE_TO_FIELDS[key];
}
