export type LimitlessEnsureAccountResponse = {
	profileId: number;
	account: string;
	created?: boolean;
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
