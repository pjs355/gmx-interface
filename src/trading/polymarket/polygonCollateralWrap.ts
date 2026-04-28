/**
 * USDC.e → pUSD via Polymarket Collateral Onramp on the Polymarket Gnosis Safe.
 * CLOB settles against pUSD only; LI.FI delivers USDC.e first — wrap before trading.
 */
import type { Transaction } from "@polymarket/builder-relayer-client";
import { encodeFunctionData, erc20Abi, maxUint256, getAddress, type Address } from "viem";
import { getPolygonPublicClient } from "@/config/polygonPublicClient";
import {
	POLYGON_COLLATERAL_ONRAMP,
	POLYGON_USDC_E,
} from "./constants";

const onrampWrapAbi = [
	{
		inputs: [
			{ name: "_asset", type: "address" },
			{ name: "_to", type: "address" },
			{ name: "_amount", type: "uint256" },
		],
		name: "wrap",
		outputs: [],
		stateMutability: "nonpayable",
		type: "function",
	},
] as const;

export async function readPolymarketSafeUsdceBalanceWei(
	safeAddress: string,
): Promise<bigint> {
	const safe = getAddress(safeAddress.trim()) as Address;
	return getPolygonPublicClient().readContract({
		address: POLYGON_USDC_E,
		abi: erc20Abi,
		functionName: "balanceOf",
		args: [safe],
	});
}

/** Approve Onramp on USDC.e, then wrap full `wrapAmountWei` into pUSD on the Safe. */
export function buildPolygonSafeUsdceWrapTransactions(input: {
	safeAddress: string;
	wrapAmountWei: bigint;
}): Transaction[] {
	if (input.wrapAmountWei <= 0n) {
		throw new Error("polygon_wrap_amount_must_be_positive");
	}
	const safe = getAddress(input.safeAddress.trim());
	return [
		{
			to: POLYGON_USDC_E,
			value: "0",
			data: encodeFunctionData({
				abi: erc20Abi,
				functionName: "approve",
				args: [POLYGON_COLLATERAL_ONRAMP, maxUint256],
			}),
		},
		{
			to: POLYGON_COLLATERAL_ONRAMP,
			value: "0",
			data: encodeFunctionData({
				abi: onrampWrapAbi,
				functionName: "wrap",
				args: [POLYGON_USDC_E, safe, input.wrapAmountWei],
			}),
		},
	];
}
