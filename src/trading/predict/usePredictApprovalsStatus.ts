import { useQuery } from "@tanstack/react-query";
import { Address, createPublicClient, erc20Abi, http } from "viem";
import { bsc } from "viem/chains";
import { AddressesByChainId, ChainId } from "@predictdotfun/sdk";
import { BSC_RPC_URL } from "@/config/rpc";
import {
	predictCtfKey,
	predictExchangeKey,
	predictNegRiskAdapterKey,
} from "./predictContractKeys";

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
] as const;

async function readPredictApprovalsOk(args: {
	chainId: ChainId;
	user: `0x${string}`;
	isNegRisk: boolean;
	isYieldBearing: boolean;
}): Promise<boolean> {
	const { chainId, user, isNegRisk, isYieldBearing } = args;
	const addresses = AddressesByChainId[chainId];
	const exchange = addresses[predictExchangeKey(isNegRisk, isYieldBearing)] as Address;
	const ctf = addresses[predictCtfKey(isNegRisk, isYieldBearing)] as Address;
	const usdt = addresses.USDT as Address;

	const chain = bsc;
	const client = createPublicClient({
		chain,
		transport: http(BSC_RPC_URL),
	});

	const [allowance, approvedCtf] = await Promise.all([
		client.readContract({
			address: usdt,
			abi: erc20Abi,
			functionName: "allowance",
			args: [user, exchange],
		}),
		client.readContract({
			address: ctf,
			abi: erc1155Abi,
			functionName: "isApprovedForAll",
			args: [user, exchange],
		}),
	]);

	if (allowance <= 0n || !approvedCtf) {
		return false;
	}

	/* Mirrors `setNegRiskAdapterApproval`: CTF must approve the neg-risk adapter operator. */
	if (isNegRisk) {
		const adapter = addresses[
			predictNegRiskAdapterKey(isYieldBearing)
		] as Address;
		const approvedAdapter = await client.readContract({
			address: ctf,
			abi: erc1155Abi,
			functionName: "isApprovedForAll",
			args: [user, adapter],
		});
		if (!approvedAdapter) return false;
	}

	return true;
}

export function usePredictApprovalsStatus(
	user: string | undefined | null,
	isNegRisk: boolean,
	isYieldBearing: boolean,
	enabled: boolean
) {
	const chainId = ChainId.BnbMainnet;
	const addr = user?.startsWith("0x") ? (user as `0x${string}`) : undefined;

	return useQuery({
		queryKey: [
			"predict-approvals",
			chainId,
			addr?.toLowerCase() ?? null,
			isNegRisk,
			isYieldBearing,
		],
		enabled: Boolean(enabled && addr),
		staleTime: 15_000,
		queryFn: () =>
			readPredictApprovalsOk({
				chainId,
				user: addr!,
				isNegRisk,
				isYieldBearing,
			}),
	});
}
