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
