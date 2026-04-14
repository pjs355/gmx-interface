import type { Jsonish } from "./util";

/** EV transaction request from LI.FI (or server-normalized shape) */
export type LifiTransactionRequest = {
	to: string;
	data?: string;
	value?: string;
	from?: string;
	chainId?: number;
	gasLimit?: string;
	gasPrice?: string;
	maxFeePerGas?: string;
	maxPriorityFeePerGas?: string;
};

export type LifiAllowanceHint = {
	token?: string;
	tokenAddress?: string;
	spender?: string;
	spenderAddress?: string;
	amount?: string;
	requiredAmountRaw?: string;
	chainId?: number;
};

export type LifiQuoteStep = {
	type?: string;
	tool?: string;
	chainId?: number;
	stepIndex?: number;
	transactionRequest?: LifiTransactionRequest;
	requiresApproval?: boolean;
	allowanceHint?: LifiAllowanceHint;
	[key: string]: unknown;
};

export type LifiQuoteRequestBody = {
	fromChain: number;
	toChain: number;
	amountHuman: string;
	fromAddress: string;
	toAddress?: string;
	/** e.g. 0.005 for 0.5% */
	slippage?: number;
};

export type LifiQuoteResponse = {
	quote?: Jsonish;
	steps?: LifiQuoteStep[];
	/** Top-level aggregator label (e.g. eco) — do not pass to GET …/lifi/status */
	tool?: string;
	/**
	 * Bridge/cross-chain tool name for LI.FI status — use this as `tool` when polling, if set.
	 * When null/omitted, poll with txHash + chains only (no `tool` param).
	 */
	statusBridge?: string | null;
	fromAmount?: string;
	fromToken?: Jsonish;
	toToken?: Jsonish;
	[key: string]: unknown;
};

export type LifiStatusParams = {
	txHash: string;
	tool?: string;
	fromChain?: number;
	toChain?: number;
};

export type LifiStatusResponse = Jsonish;

/** POST /funding/lifi/withdraw/plan */
export type WithdrawPlanBalanceRow = {
	chain: string;
	lifiChainId: number;
	balance: number;
	walletAddress: string;
};

export type LifiWithdrawPlanRequestBody = {
	amountHuman: string;
	toChain: number;
	toAsset: "USDC" | "USDT";
	toAddress: string;
	slippage?: number;
	balances: WithdrawPlanBalanceRow[];
};

export type LifiWithdrawSelectedSource = {
	/** SOR-style chain key, e.g. `base`, `polygon` */
	chain: string;
	lifiChainId: number;
	walletAddress: string;
};

export type FundingStableMetaJson = {
	symbol: string;
	decimals: number;
	address: string;
};

export type LifiWithdrawDirectTransferData = {
	mode: "direct_transfer";
	selectedSource: LifiWithdrawSelectedSource;
	toChain: number;
	toAddress: string;
	token: FundingStableMetaJson;
	amountHuman: string;
	amountAtomic: string;
};

export type LifiWithdrawLifiData = {
	mode: "lifi";
	selectedSource: LifiWithdrawSelectedSource;
	fromChain: number;
	toChain: number;
	fromToken: string;
	toToken: string;
	fromFundingStable: FundingStableMetaJson;
	toFundingStable: FundingStableMetaJson;
	fromAmount: string;
	fromAddress: string;
	toAddress: string;
	tool: string;
	statusBridge: string | null;
	quote?: Jsonish;
	steps?: LifiQuoteStep[];
};

/** One executable slice from POST /funding/lifi/withdraw/plan */
export type LifiWithdrawPlanLeg =
	| LifiWithdrawDirectTransferData
	| LifiWithdrawLifiData;

export type LifiWithdrawCompositeData = {
	mode: "composite";
	totalAmountHuman: string;
	toChain: number;
	toAsset: "USDC" | "USDT";
	toAddress: string;
	legs: LifiWithdrawPlanLeg[];
};

export type LifiWithdrawPlanData =
	| LifiWithdrawPlanLeg
	| LifiWithdrawCompositeData;

export type LifiWithdrawPlanResponse = {
	success: boolean;
	data: LifiWithdrawPlanData;
};
