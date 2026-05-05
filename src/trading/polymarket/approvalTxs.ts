import { encodeFunctionData, erc20Abi, maxUint256 } from "viem";
import type { Transaction } from "@polymarket/builder-relayer-client";
import { getPolygonPublicClient } from "@/config/polygonPublicClient";
import {
	POLYGON_COLLATERAL_OFFRAMP,
	POLYGON_COLLATERAL_ONRAMP,
	POLYGON_CTF,
	POLYGON_CTF_EXCHANGE,
	POLYGON_NEG_RISK_ADAPTER,
	POLYGON_NEG_RISK_CTF_EXCHANGE,
	POLYGON_PUSD,
	POLYGON_USDC_E,
	PUSD_ALLOWANCE_THRESHOLD,
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
	safeAddress: string
): Promise<ApprovalStatus> {
	const pc = getPolygonPublicClient();
	const safe = safeAddress as `0x${string}`;

	// Single multicall instead of N parallel eth_call POSTs — avoids flaky public RPCs closing connections.
	const contracts = [
		...USDC_SPENDERS.map((spender) => ({
			address: POLYGON_PUSD,
			abi: erc20Abi,
			functionName: "allowance" as const,
			args: [safe, spender] as const,
		})),
		...ERC1155_OPERATORS.map((operator) => ({
			address: POLYGON_CTF,
			abi: erc1155Abi,
			functionName: "isApprovedForAll" as const,
			args: [safe, operator] as const,
		})),
		...COLLATERAL_APPROVALS.map((c) => ({
			address: c.token,
			abi: erc20Abi,
			functionName: "allowance" as const,
			args: [safe, c.spender] as const,
		})),
	];

	const raw = await pc.multicall({
		contracts,
		allowFailure: false,
	});

	const usdcResults = USDC_SPENDERS.map((spender, i) => {
		const allowance = raw[i] as bigint;
		return [spender, allowance >= PUSD_ALLOWANCE_THRESHOLD] as const;
	});
	const offErc1155 = USDC_SPENDERS.length;
	const erc1155Results = ERC1155_OPERATORS.map((op, j) => {
		const ok = raw[offErc1155 + j] as boolean;
		return [op, Boolean(ok)] as const;
	});
	const offCollateral = USDC_SPENDERS.length + ERC1155_OPERATORS.length;
	const collateralResults = COLLATERAL_APPROVALS.map((c, k) => {
		const allowance = raw[offCollateral + k] as bigint;
		return [c.spender, allowance >= PUSD_ALLOWANCE_THRESHOLD] as const;
	});

	const usdc = Object.fromEntries(usdcResults);
	const erc1155 = Object.fromEntries(erc1155Results);
	const collateral = Object.fromEntries(collateralResults);
	const allApproved =
		Object.values(usdc).every(Boolean) &&
		Object.values(erc1155).every(Boolean) &&
		Object.values(collateral).every(Boolean);
	return { usdc, erc1155, collateral, allApproved };
}

function erc20ApproveTx(
	token: `0x${string}`,
	spender: `0x${string}`
): Transaction {
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
	for (const c of COLLATERAL_APPROVALS)
		txs.push(erc20ApproveTx(c.token, c.spender));
	return txs;
}
