/**
 * DFlow metadata best-bid/ask for one outcome leg. Mirrors the underlying
 * Kalshi book and is populated for any active Kalshi market regardless of
 * whether the DFlow `accounts[USDC]` PDA has been tokenized — used as a
 * display fallback when the DFlow WS orderbook is empty (uninitialized
 * markets that haven't been minted yet).
 */
export interface MatchedMarketsDflowBboWire {
	yesBid?: number;
	yesAsk?: number;
	noBid?: number;
	noAsk?: number;
}

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
	bboA?: MatchedMarketsDflowBboWire;
	bboB?: MatchedMarketsDflowBboWire;
}
