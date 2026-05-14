import { useQuery } from "@tanstack/react-query";
import {
	Address,
	createPublicClient,
	erc20Abi,
	formatUnits,
	getAddress,
	http,
} from "viem";
import { bsc } from "viem/chains";
import { AddressesByChainId, ChainId } from "@predictdotfun/sdk";
import { BSC_RPC_URL } from "@/config/rpc";
import { predictCtfKey } from "./predictContractKeys";

const erc1155BalanceAbi = [
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

function client() {
	return createPublicClient({ chain: bsc, transport: http(BSC_RPC_URL) });
}

/**
 * Non-hook ERC-1155 outcome balance read. Mirrors
 * `usePredictOutcomeShareOnChain` but callable from outside React (the SOR
 * leg executor uses this on the sell path to clamp `leg.shares` to what the
 * chain says is actually transferable, the same way Polymarket's
 * `readPolymarketSafeCtfBalanceWei` is used for the CTF clamp). Returns the
 * raw 18-decimal ERC-1155 balance.
 */
export async function readPredictOutcomeShareWei(args: {
	account: string;
	tokenId: string;
	isNegRisk: boolean;
	isYieldBearing: boolean;
}): Promise<bigint> {
	const account = getAddress(args.account.trim()) as Address;
	const trimmedId = args.tokenId.trim();
	if (!/^\d+$/.test(trimmedId)) {
		throw new Error(
			`readPredictOutcomeShareWei: invalid tokenId "${args.tokenId}"`,
		);
	}
	const id = BigInt(trimmedId);
	const chainId = ChainId.BnbMainnet;
	const ctf = AddressesByChainId[chainId][
		predictCtfKey(args.isNegRisk, args.isYieldBearing)
	] as Address;
	return client().readContract({
		address: ctf,
		abi: erc1155BalanceAbi,
		functionName: "balanceOf",
		args: [account, id],
	});
}

export function usePredictUsdtBalance(address: string | undefined | null, enabled: boolean) {
	const chainId = ChainId.BnbMainnet;
	const usdt = AddressesByChainId[chainId].USDT as Address;
	const who = address?.startsWith("0x") ? (address as `0x${string}`) : undefined;

	return useQuery({
		queryKey: ["predict-usdt-balance", chainId, who?.toLowerCase() ?? null],
		enabled: Boolean(enabled && who),
		staleTime: 10_000,
		queryFn: async () => {
			const raw = await client().readContract({
				address: usdt,
				abi: erc20Abi,
				functionName: "balanceOf",
				args: [who!],
			});
			return Number(formatUnits(raw, 18));
		},
	});
}

/** ERC1155 outcome balance on the appropriate CTF for this market. */
export function usePredictOutcomeShareOnChain(
	address: string | undefined | null,
	tokenId: string | null | undefined,
	isNegRisk: boolean,
	isYieldBearing: boolean,
	enabled: boolean
) {
	const chainId = ChainId.BnbMainnet;
	const ctf = AddressesByChainId[chainId][
		predictCtfKey(isNegRisk, isYieldBearing)
	] as Address;
	const who = address?.startsWith("0x") ? (address as `0x${string}`) : undefined;
	const id = tokenId && /^\d+$/.test(tokenId) ? BigInt(tokenId) : null;

	return useQuery({
		queryKey: [
			"predict-outcome-shares",
			chainId,
			who?.toLowerCase() ?? null,
			tokenId ?? null,
			isNegRisk,
			isYieldBearing,
		],
		enabled: Boolean(enabled && who && id !== null),
		staleTime: 10_000,
		queryFn: async () => {
			const raw = await client().readContract({
				address: ctf,
				abi: erc1155BalanceAbi,
				functionName: "balanceOf",
				args: [who!, id!],
			});
			return Number(formatUnits(raw, 18));
		},
	});
}
