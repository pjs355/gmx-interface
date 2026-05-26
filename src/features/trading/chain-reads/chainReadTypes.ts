import type { LimitlessVerifyAllowanceResult } from "@/features/trading/venues/limitless/trade/limitlessPrivateApiTypes";
import type { ApprovalStatus } from "@/features/trading/venues/polymarket/trade/approvalTxs";

export type PredictApprovalsChainReadResult = {
	ok: boolean;
};

export type PolymarketApprovalsChainReadResult = ApprovalStatus;

export type LimitlessSellCtfApprovalsReadState = "sufficient" | "insufficient" | "unknown";

export type LimitlessApprovalsChainReadResult = {
	collateral: boolean;
	ctf: boolean;
	ready: boolean;
	sellCtfState: LimitlessSellCtfApprovalsReadState;
	resolvedCtfAddress: string;
	usdcSpenderReads: Array<{ spender: string; sufficient: boolean }>;
	ctfOperatorReads: Array<{ operator: string; approved: boolean | null }>;
};

export type LimitlessFokBuyUsdcPreflightChainReadResult = {
	ok: boolean;
	reason?: string;
	balanceMicro: string;
	needMicro: string;
	minAllowanceMicro: string;
	spenders: string[];
};

export type LevelUpApprovalsChainReadResult = {
	isApproved: boolean;
	hasUsdcApproval: boolean;
	hasCtfApproval: boolean;
	hasFeeWrapperApproval: boolean;
};

type LimitlessVerifyPayload = Pick<
	LimitlessVerifyAllowanceResult,
	"spender" | "usdcSpenders" | "ctfAddress" | "venueAdapter"
>;

export type ChainReadRequest =
	| {
			venue: "predict";
			kind: "approvals";
			walletAddress: string;
			isNegRisk: boolean;
			isYieldBearing: boolean;
	  }
	| {
			venue: "polymarket";
			kind: "approvals";
			walletAddress: string;
	  }
	| {
			venue: "limitless";
			kind: "approvals";
			walletAddress: string;
			verify: LimitlessVerifyPayload;
	  }
	| {
			venue: "limitless";
			kind: "fok-buy-usdc-preflight";
			walletAddress: string;
			verify: LimitlessVerifyPayload;
			wireUsd: number;
			feeUsd: number;
	  }
	| {
			venue: "levelup";
			kind: "approvals";
			walletAddress: string;
	  };

export type ChainReadResultFor<R extends ChainReadRequest> = R extends {
	venue: "predict";
}
	? PredictApprovalsChainReadResult
	: R extends { venue: "polymarket" }
		? PolymarketApprovalsChainReadResult
		: R extends { venue: "levelup" }
			? LevelUpApprovalsChainReadResult
			: R extends { venue: "limitless"; kind: "fok-buy-usdc-preflight" }
				? LimitlessFokBuyUsdcPreflightChainReadResult
				: R extends { venue: "limitless"; kind: "approvals" }
					? LimitlessApprovalsChainReadResult
					: never;

export type ChainReadClient = {
	postChainRead<R extends ChainReadRequest>(request: R): Promise<ChainReadResultFor<R>>;
};
