/** Per-market LevelUp CTF outcome balances (human-readable share counts). */
export type LevelUpTokenBalance = {
	yesTokenId: string;
	noTokenId: string;
	yesBalance: string;
	noBalance: string;
};

/** Where LevelUp share rows came from on the most recent fetch. */
export type LevelUpPositionsSource = "api" | "none";

export type LevelUpMarketCatalogEntry = {
	yesTokenId: string;
	noTokenId: string;
};
