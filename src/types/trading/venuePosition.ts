/**
 * Venue-aware position types.
 *
 * `VenueId` is an extensible union — add `"kalshi" | "predictfun"` etc.
 * `VenuePosition` is the normalised shape every venue hook must produce so
 * the Positions page and PortfolioContext can aggregate without caring
 * which exchange the shares live on.
 */

export type VenueId =
	| "levelup"
	| "polymarket"
	| "predictfun"
	| "dflow"
	| "limitless";

/** True when venue `marketStatus` indicates settlement (History tab, not open portfolio). */
export function isVenueMarketResolvedLike(
	status: string | null | undefined,
): boolean {
	const s = (status ?? "").toUpperCase().trim();
	return (
		s === "RESOLVED" ||
		s === "CLOSED" ||
		s === "SETTLED" ||
		s === "FINALIZED" ||
		s === "DETERMINED"
	);
}

/** Single label for History / Orders venue badges (matches existing copy). */
export function venueDisplayLabel(venue: VenueId): string {
	switch (venue) {
		case "levelup":
			return "LevelUp";
		case "polymarket":
			return "Polymarket";
		case "predictfun":
			return "Predict";
		case "dflow":
			return "Kalshi";
		case "limitless":
			return "Limitless";
	}
}

/** One venue fill for History trade expansion (e.g. each Polymarket activity row). */
export interface VenueHistoryFill {
	side: "buy" | "sell";
	shares: number;
	/** USDC leg: spent on buy, received on sell / redeem */
	usdc: number;
	/** ISO timestamp */
	tradedAt: string;
	sourceId?: string;
	/** Execution price when API provides it (probability 0–1 or cents) */
	price?: number | null;
	/**
	 * Kalshi/DFlow leg ticker from `onchain-trades` (`marketTicker`). Each fill may
	 * belong to a different leg market while the umbrella title stays “A vs B”.
	 */
	marketTicker?: string;
}

export interface VenuePosition {
	venue: VenueId;
	marketTitle: string;
	outcome: string;
	shares: number;
	avgPrice: number | null;
	currentPrice: number | null;
	cost: number | null;
	currentValue: number;
	pnl: number | null;
	pnlPercent: number | null;
	tokenId: string;
	/**
	 * DFlow / Kalshi metadata `eventTicker` from `markets/batch` (same key as
	 * `exchangeMatching.dflow.eventTicker` on umbrellas when present). For **live Positions**,
	 * matching still **must fall through to outcome `tokenId` (mint)** when no umbrella hits
	 * on event ticker alone — see `matchVenuePositionToUmbrella` (`venue === "dflow"`).
	 */
	dflowEventTicker?: string;
	conditionId?: string;
	eventSlug?: string;
	/**
	 * Limitless neg-risk: `market.group.slug` from partner (e.g. `passion-ua-vs-sinners-…`).
	 * Used when per-leg `eventSlug` / mints do not line up with catalog `orderbookSlugA/B`.
	 */
	limitlessGroupSlug?: string;
	iconUrl?: string;
	/**
	 * Limitless partner `GET /portfolio/positions`: explicit `redeemable: true` when the
	 * venue sends it — used for Winnings UX; on-chain Claim does not rely on this alone.
	 */
	redeemable?: boolean;
	/**
	 * Limitless: resolved winning leg with value/shares in the API response, but the partner
	 * has not yet marked the row claim-ready (CTF settlement can lag API resolution).
	 */
	redeemPending?: boolean;
	/**
	 * Explicit partner signal from the predictions proxy: `omit` = no boolean in upstream
	 * payload (do not treat as “not redeemable”), `true` / `false` = Limitless sent a boolean.
	 */
	limitlessPartnerRedeemableSignal?: "omit" | "true" | "false";
	/** Predict.fun numeric market id (used for settlement lookups) */
	numericMarketId?: number;
	/** Server-resolved LevelUp umbrella id (Predict positions proxy join). */
	levelUpUmbrellaId?: string;
	/** Optional display label from the same join (for UI only). */
	levelUpUmbrellaDisplayName?: string;
	/**
	 * DFlow/Kalshi: display label for the portfolio **Yes** / **No** column for this mint (see
	 * {@link portfolioColumnTeamLabels} / {@link patchDflowVenuePositionOutcomes}). Trade-history Side text.
	 */
	dflowTradeSideLabel?: string;
	/**
	 * Kalshi/DFlow Metadata `yesSubTitle` / `noSubTitle` from `markets/batch` — used so
	 * "Will X win …" rows label Yes/No with outcome names instead of splitting on the wrong `vs`.
	 */
	dflowYesSubTitle?: string;
	dflowNoSubTitle?: string;
	/** Market-level status from the venue (e.g. "RESOLVED") */
	marketStatus?: string;
	/** Limitless `PositionMarket.closed` — when false, treat row as live for Positions vs History split. */
	marketClosed?: boolean;
	/** Limitless `PositionMarket.winningOutcomeIndex` (0 = YES, 1 = NO when set). */
	winningOutcomeIndex?: number | null;
	/** Per-outcome result: did this specific outcome win or lose? */
	outcomeResult?: "WON" | "LOST" | null;
	/**
	 * Stable id from venue trade-history rows (e.g. Limitless `HistoryEntry.id`).
	 * Used so History tab can show fills even when the same `tokenId` is still an open position.
	 */
	historySourceId?: string;
	/** ISO timestamp from venue trade-history API (`createdAt` / fill time). */
	historyTradeAt?: string;
	/** Buy/sell from venue trade-history when present. */
	historyTradeSide?: "buy" | "sell";
	/**
	 * When set, History expands one synthetic order per fill (buys + sells).
	 * Summary row still uses aggregated `shares` / `cost` / `pnl` on this position.
	 */
	historyFills?: VenueHistoryFill[];
	/**
	 * Polymarket Data API `negativeRisk` flag — true for multi-outcome (Match Winner,
	 * Election, etc.) NegRisk markets. Required so claim routing knows to call
	 * `NegRiskAdapter.redeemPositions(conditionId, [yesAmt, noAmt])` instead of
	 * the standard `CTF.redeemPositions(...)`. Without this the redeem tx mines
	 * but pays out 0 pUSD and the row vanishes from Winnings (silent claim bug).
	 */
	isNegRisk?: boolean;
	/**
	 * Polymarket trade history: orphan `REDEEM` (empty outcome) attributed to this
	 * leg with ~$0.50 USDC per net outcome share — used for History tab badge only.
	 */
	polymarketSplitSettlementLikely?: boolean;
	/**
	 * Limitless `market.group.negRiskMarketId` — parent condition id for NegRisk
	 * group legs. On-chain redeem uses `venue.adapter` when present.
	 */
	negRiskParentConditionId?: string;
	/** From predictions `GET /api/limitless/portfolio/positions-venue` — `venue.exchange`. */
	limitlessVenueExchange?: string;
	/** NegRisk adapter (`venue.adapter`) when present. */
	limitlessVenueAdapter?: string;
	/** Collateral token address for CTF redeem when the API provides it. */
	limitlessCollateralAddress?: string;
}

/**
 * Dedupe key while attaching venue rows to umbrellas. Limitless (and some partner payloads)
 * can repeat the same outcome `tokenId` on two neg-risk legs; `conditionId` disambiguates.
 */
export function venuePositionPortfolioDedupeKey(
	p: Pick<VenuePosition, "tokenId"> & { conditionId?: string },
): string {
	const tid = String(p.tokenId ?? "").trim();
	const cid = String(p.conditionId ?? "").trim().toLowerCase();
	if (cid) return `${tid}::${cid}`;
	return tid;
}

/**
 * Venue-aware order type for the Orders tab.
 * Normalised shape so OrdersView can render any venue without branching.
 */
export interface VenueOrder {
	venue: VenueId;
	orderId: string;
	marketTitle: string;
	side: "buy" | "sell";
	position: "Yes" | "No";
	price: number;
	size: number;
	filled: boolean;
	tokenId: string;
	marketId?: string;
	/** Raw Predict.fun signed order for cancel payloads */
	rawOrder?: unknown;
}

/** Raw shape returned by `GET https://data-api.polymarket.com/positions?user=…` */
export interface PolymarketDataApiPosition {
	proxyWallet: string;
	asset: string;
	conditionId: string;
	size: number;
	avgPrice: number;
	initialValue: number;
	currentValue: number;
	cashPnl: number;
	percentPnl: number;
	totalBought: number;
	realizedPnl: number;
	percentRealizedPnl: number;
	curPrice: number;
	redeemable: boolean;
	mergeable: boolean;
	title: string;
	slug: string;
	icon: string;
	eventId: string;
	eventSlug: string;
	outcome: string;
	outcomeIndex: number;
	oppositeOutcome: string;
	oppositeAsset: string;
	endDate: string;
	negativeRisk: boolean;
}
