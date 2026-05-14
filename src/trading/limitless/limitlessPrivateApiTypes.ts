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
	/** Underlying Gnosis CTF `to` for sell approvals (server unwraps NegRisk `getCtf()`). */
	ctfAddress?: string;
	/** NegRisk adapter for CTF `setApprovalForAll`; null or omitted for standard CLOB. */
	venueAdapter?: string | null;
	/** Sub-account `ownerId` used as `x-on-behalf-of` on partner allowance probe (server). */
	partnerAllowanceOwnerId?: number | null;
	/** Which `type` (`clob` / `negrisk`) satisfied the partner allowance check, if any. */
	limitlessPartnerAllowanceType?: "clob" | "negrisk";
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
	/** Present when Mongo has an umbrella with `exchangeMatching.limitless.slug` — used for signup-time Base approvals. */
	warmupMarketSlug?: string;
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

/** Client-signed CLOB order body for `POST /api/limitless/orders` (partner HMAC). */
export type LimitlessSignedOrderSubmit = {
	order: {
		salt: number | string;
		maker: string;
		signer: string;
		taker: string;
		tokenId: string;
		makerAmount: number;
		takerAmount: number;
		expiration: string;
		nonce: number;
		feeRateBps: number;
		side: 0 | 1;
		signatureType: 0 | 1 | 2;
		price?: number;
		signature: string;
	};
	orderType: LimitlessOrderType;
	marketSlug: string;
	ownerId: number;
	postOnly?: boolean;
};

/** @deprecated Use {@link LimitlessSignedOrderSubmit} and EIP-712 signing. */
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
