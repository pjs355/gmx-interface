/** After `unwrapEnvelope`, i.e. the API `data` object (not the outer `{ success, data }`). */
export type LimitlessEnsureAccountResponse = {
	venueRegistered: boolean;
	venueStatus: "active" | "suspended" | "disconnected" | "not_registered";
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
