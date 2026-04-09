/**
 * `exchangeMatching.dflow` from GET /matched-markets (predictions-api `ExchangeMatchingDflow`).
 * Monitor payloads may add fields (e.g. noMint*) via intersection on `MatchedMarket.dflow`.
 */
export interface MatchedMarketsDflowWire {
	tickerA: string;
	tickerB?: string;
	eventTicker: string;
	yesMintA?: string;
	yesMintB?: string;
	accountsInitializedA?: boolean;
	accountsInitializedB?: boolean;
	dflowNestedStatusA?: string;
	dflowNestedStatusB?: string;
}
