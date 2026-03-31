import { useQuery } from "@tanstack/react-query";
import { Address, createPublicClient, erc20Abi, formatUnits, http } from "viem";
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
