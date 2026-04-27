/** After `unwrapEnvelope` from `POST .../verify-allowance`. */
export type LimitlessVerifyAllowanceResult = {
	marketSlug: string;
	/** Umbrella / UI slug when server resolved a child leg (delegated group markets). */
	declaredMarketSlug?: string;
	/** Slug used for venue + partner allowance (matches POST /orders resolution). */
	effectiveMarketSlug?: string;
	spender: string;
	/** Base USDC `approve` targets for this market (exchange + optional fee spenders). */
	usdcSpenders: string[];
	hasMinimumAllowance: boolean;
	/** From server `syncAllowance` (`getCtf()` on `venue.exchange`). Client falls back to on-chain read if omitted. */
	ctfAddress?: string;
	/** NegRisk adapter for CTF `setApprovalForAll`; null or omitted for standard CLOB. */
	venueAdapter?: string | null;
	/** Sub-account `ownerId` used as `x-on-behalf-of` on partner allowance probe (server). */
	partnerAllowanceOwnerId?: number | null;
	/** Which `type` (`clob` / `negrisk`) satisfied the partner allowance check, if any. */
	limitlessPartnerAllowanceType?: string;
	/** Limitless-reported wallet whose USDC allowance was evaluated. */
	limitlessCheckedAddress?: string;
	/** Raw allowance string from Limitless partner API. */
	limitlessAllowanceRaw?: string;
};

/** After `unwrapEnvelope`, i.e. the API `data` object (not the outer `{ success, data }`). */
export type LimitlessEnsureAccountResponse = {
	venueRegistered: boolean;
	venueStatus: "active" | "suspended" | "disconnected" | "not_registered";
	/** Server skipped warmup USDC probe — no active Umbrella with `exchangeMatching.limitless.slug`. Per-market JIT still works. */
	canonicalSlugMissing?: boolean;
	limitlessAccount: {
		hasApiKey?: boolean;
		ownerId?: number;
		makerAddress?: string;
		signerAddress?: string;
		tradingEnabled?: boolean;
		approvalComplete?: boolean;
		lastError?: string;
		feeRateBps?: number;
		lastProfileSyncAt?: string;
		lastAllowanceCheckSlug?: string;
	};
};

export type LimitlessOrderSide = "BUY" | "SELL";
export type LimitlessOrderType = "GTC" | "FOK" | "FAK";

export type LimitlessOrderRequest = {
	marketSlug: string;
	orderType: LimitlessOrderType;
	tokenId: string;
	side: LimitlessOrderSide;
	price?: number;
	size?: number;
	makerAmount?: number;
	postOnly?: boolean;
	feeRateBps?: number;
};
