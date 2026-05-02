/**
 * USDC.e → pUSD via Polymarket Collateral Onramp on the Polymarket Gnosis Safe.
 * CLOB settles against pUSD only; LI.FI delivers USDC.e first — wrap before trading.
 */
import type { Transaction } from "@polymarket/builder-relayer-client";
import { encodeFunctionData, erc20Abi, maxUint256, getAddress, type Address } from "viem";
import { getPolygonPublicClient } from "@/config/polygonPublicClient";
import {
	POLYGON_COLLATERAL_ONRAMP,
	POLYGON_CTF,
	POLYGON_PUSD,
	POLYGON_USDC_E,
} from "./constants";

/**
 * Minimal ERC-1155 `balanceOf(account, id)` slice — Polymarket's
 * ConditionalTokens contract doesn't expose `safeTransferFrom`/etc on the
 * `erc20Abi` shape and we don't want to pull in the whole 1155 ABI for one
 * read.
 */
const erc1155BalanceOfAbi = [
	{
		inputs: [
			{ name: "account", type: "address" },
			{ name: "id", type: "uint256" },
		],
		name: "balanceOf",
		outputs: [{ name: "", type: "uint256" }],
		stateMutability: "view",
		type: "function",
	},
] as const;

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

/**
 * Spendable Polymarket collateral on the Safe. CLOB market buys debit pUSD,
 * so the post-wrap pUSD balance is the canonical "what can I order with" value.
 * Both pUSD and USDC.e are 6-decimal — atomic units are micro-USD.
 */
export async function readPolymarketSafePusdBalanceWei(
	safeAddress: string,
): Promise<bigint> {
	const safe = getAddress(safeAddress.trim()) as Address;
	return getPolygonPublicClient().readContract({
		address: POLYGON_PUSD,
		abi: erc20Abi,
		functionName: "balanceOf",
		args: [safe],
	});
}

/**
 * On-chain CTF outcome token balance the Safe can actually sell.
 *
 * Polymarket's Data API `/positions` is built off an indexer that lags the
 * chain (and continues to count shares locked in resting limit orders /
 * partially-filled sells), so the share count it returns can sit above the
 * Safe's actual ERC-1155 balance for tens of seconds after activity. The CTF
 * Exchange's pre-trade check is `balanceOf(maker, tokenId) >= makerAmount`,
 * not the Data API number, so a stale read produces the
 * `not enough balance / allowance` HTTP 400. We use this on the SELL path to
 * clamp `leg.shares` to what the chain says is actually transferable.
 *
 * Returns the raw 6-decimal CTF balance (Polymarket outcome tokens are
 * minted 1:1 against USDC, so atomic units == micro-shares == 1e-6 share).
 */
export async function readPolymarketSafeCtfBalanceWei(
	safeAddress: string,
	tokenId: string,
): Promise<bigint> {
	const safe = getAddress(safeAddress.trim()) as Address;
	const id = BigInt(tokenId.trim());
	return getPolygonPublicClient().readContract({
		address: POLYGON_CTF,
		abi: erc1155BalanceOfAbi,
		functionName: "balanceOf",
		args: [safe, id],
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
