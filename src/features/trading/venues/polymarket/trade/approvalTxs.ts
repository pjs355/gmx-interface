import { encodeFunctionData, erc20Abi, maxUint256 } from "viem";
import type { Transaction } from "@polymarket/builder-relayer-client";
import type { ChainReadClient } from "@/features/trading/chain-reads/chainReadTypes";
import {
	POLYGON_COLLATERAL_OFFRAMP,
	POLYGON_COLLATERAL_ONRAMP,
	POLYGON_CTF,
	POLYGON_CTF_EXCHANGE,
	POLYGON_NEG_RISK_ADAPTER,
	POLYGON_NEG_RISK_CTF_EXCHANGE,
	POLYGON_PUSD,
	POLYGON_USDC_E,
} from "./constants";

const erc1155Abi = [
	{
		inputs: [
			{ name: "account", type: "address" },
			{ name: "operator", type: "address" },
		],
		name: "isApprovedForAll",
		outputs: [{ name: "", type: "bool" }],
		stateMutability: "view",
		type: "function",
	},
	{
		inputs: [
			{ name: "operator", type: "address" },
			{ name: "approved", type: "bool" },
		],
		name: "setApprovalForAll",
		outputs: [],
		stateMutability: "nonpayable",
		type: "function",
	},
] as const;

const USDC_SPENDERS = [
	POLYGON_CTF,
	POLYGON_CTF_EXCHANGE,
	POLYGON_NEG_RISK_CTF_EXCHANGE,
	POLYGON_NEG_RISK_ADAPTER,
] as const;

const ERC1155_OPERATORS = [
	POLYGON_CTF_EXCHANGE,
	POLYGON_NEG_RISK_CTF_EXCHANGE,
	POLYGON_NEG_RISK_ADAPTER,
] as const;

/**
 * Pre-approved at onboarding so JIT wrap/unwrap relay batches ship as a single
 * `[wrap]` / `[unwrap]` call instead of `[approve, wrap]` / `[approve, unwrap]`.
 * Mirrors the server's `POLYGON_COLLATERAL_FIXED_APPROVALS` (predictions/domain/polymarket/constants.ts).
 */
const COLLATERAL_APPROVALS = [
	{ token: POLYGON_USDC_E, spender: POLYGON_COLLATERAL_ONRAMP },
	{ token: POLYGON_PUSD, spender: POLYGON_COLLATERAL_OFFRAMP },
] as const;

export type ApprovalStatus = {
	usdc: Record<string, boolean>;
	erc1155: Record<string, boolean>;
	collateral: Record<string, boolean>;
	allApproved: boolean;
};

export async function checkPolymarketApprovals(
	safeAddress: string,
	chainRead: ChainReadClient,
): Promise<ApprovalStatus> {
	return chainRead.postChainRead({
		venue: "polymarket",
		kind: "approvals",
		walletAddress: safeAddress,
	});
}

function erc20ApproveTx(token: `0x${string}`, spender: `0x${string}`): Transaction {
	return {
		to: token,
		value: "0",
		data: encodeFunctionData({
			abi: erc20Abi,
			functionName: "approve",
			args: [spender, maxUint256],
		}),
	};
}

function erc1155ApproveTx(operator: `0x${string}`): Transaction {
	return {
		to: POLYGON_CTF,
		value: "0",
		data: encodeFunctionData({
			abi: erc1155Abi,
			functionName: "setApprovalForAll",
			args: [operator, true],
		}),
	};
}

/** All approval txs for Polymarket trading on Polygon (batch via RelayClient.execute). */
export function buildPolymarketApprovalTransactions(): Transaction[] {
	const txs: Transaction[] = [];
	for (const s of USDC_SPENDERS) txs.push(erc20ApproveTx(POLYGON_PUSD, s));
	for (const o of ERC1155_OPERATORS) txs.push(erc1155ApproveTx(o));
	// Collateral approvals appended so the post-bridge wrap relay tx is a single
	// `[wrap]` call (no JIT `approve(MAX)`) — saves ~30k gas + relayer simulation
	// time on every wrap. Same for unwrap. See `polygonCollateralWrap.ts`.
	for (const c of COLLATERAL_APPROVALS) txs.push(erc20ApproveTx(c.token, c.spender));
	return txs;
}
