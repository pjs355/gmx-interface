import { encodeFunctionData, erc20Abi, maxUint256 } from "viem";
import type { Transaction } from "@polymarket/builder-relayer-client";
import { getPolygonPublicClient } from "@/config/polygonPublicClient";
import {
	POLYGON_CTF,
	POLYGON_CTF_EXCHANGE,
	POLYGON_NEG_RISK_ADAPTER,
	POLYGON_NEG_RISK_CTF_EXCHANGE,
	POLYGON_PUSD,
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

export type ApprovalStatus = {
	usdc: Record<string, boolean>;
	erc1155: Record<string, boolean>;
	allApproved: boolean;
};

export async function checkPolymarketApprovals(
	safeAddress: string
): Promise<ApprovalStatus> {
	const pc = getPolygonPublicClient();
	const safe = safeAddress as `0x${string}`;

	// Single multicall instead of 7 parallel eth_call POSTs — avoids flaky public RPCs closing connections.
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
	];

	const raw = await pc.multicall({
		contracts,
		allowFailure: false,
	});

	const usdcResults = USDC_SPENDERS.map((spender, i) => {
		const allowance = raw[i] as bigint;
		return [spender, allowance >= PUSD_ALLOWANCE_THRESHOLD] as const;
	});
	const off = USDC_SPENDERS.length;
	const erc1155Results = ERC1155_OPERATORS.map((op, j) => {
		const ok = raw[off + j] as boolean;
		return [op, Boolean(ok)] as const;
	});

	const usdc = Object.fromEntries(usdcResults);
	const erc1155 = Object.fromEntries(erc1155Results);
	const allApproved =
		Object.values(usdc).every(Boolean) && Object.values(erc1155).every(Boolean);
	return { usdc, erc1155, allApproved };
}

function erc20ApproveTx(spender: `0x${string}`): Transaction {
	return {
		to: POLYGON_PUSD,
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
	for (const s of USDC_SPENDERS) txs.push(erc20ApproveTx(s));
	for (const o of ERC1155_OPERATORS) txs.push(erc1155ApproveTx(o));
	return txs;
}
