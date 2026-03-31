import { createPublicClient, encodeFunctionData, erc20Abi, http, maxUint256 } from "viem";
import { polygon } from "viem/chains";
import type { Transaction } from "@polymarket/builder-relayer-client";
import { POLYGON_RPC_URL } from "@/config/rpc";
import {
	POLYGON_CTF,
	POLYGON_CTF_EXCHANGE,
	POLYGON_NEG_RISK_ADAPTER,
	POLYGON_NEG_RISK_CTF_EXCHANGE,
	POLYGON_USDC_E,
	USDC_E_ALLOWANCE_THRESHOLD,
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

function polygonPublic() {
	return createPublicClient({ chain: polygon, transport: http(POLYGON_RPC_URL) });
}

export type ApprovalStatus = {
	usdc: Record<string, boolean>;
	erc1155: Record<string, boolean>;
	allApproved: boolean;
};

export async function checkPolymarketApprovals(
	safeAddress: string
): Promise<ApprovalStatus> {
	const pc = polygonPublic();
	const safe = safeAddress as `0x${string}`;

	const [usdcResults, erc1155Results] = await Promise.all([
		Promise.all(
			USDC_SPENDERS.map(async (spender) => {
				const allowance = await pc.readContract({
					address: POLYGON_USDC_E,
					abi: erc20Abi,
					functionName: "allowance",
					args: [safe, spender],
				});
				return [spender, allowance >= USDC_E_ALLOWANCE_THRESHOLD] as const;
			})
		),
		Promise.all(
			ERC1155_OPERATORS.map(async (op) => {
				const ok = await pc.readContract({
					address: POLYGON_CTF,
					abi: erc1155Abi,
					functionName: "isApprovedForAll",
					args: [safe, op],
				});
				return [op, Boolean(ok)] as const;
			})
		),
	]);

	const usdc = Object.fromEntries(usdcResults);
	const erc1155 = Object.fromEntries(erc1155Results);
	const allApproved =
		Object.values(usdc).every(Boolean) && Object.values(erc1155).every(Boolean);
	return { usdc, erc1155, allApproved };
}

function erc20ApproveTx(spender: `0x${string}`): Transaction {
	return {
		to: POLYGON_USDC_E,
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
