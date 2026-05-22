import type { RelayClient, Transaction } from "@polymarket/builder-relayer-client";
import { encodeFunctionData, erc20Abi } from "viem";
import { polygon } from "viem/chains";
import type { SendTransactionCapable } from "@/trading/lifi/sendTransactionTypes";
import { executePolygonRelayAndWait } from "@/trading/venues/polymarket/session/safeActions";

/**
 * Single ERC-20 transfer for same-chain withdrawals (Base / BNB smart wallet or
 * Polygon Polymarket deposit wallet relay). On Polygon the relay batch needs
 * the deposit wallet address (`polygonRelayWalletAddress`) so the relayer can
 * route to the right wallet.
 */
export async function executeDirectErc20Withdraw(args: {
	chainId: number;
	tokenAddress: string;
	recipient: `0x${string}`;
	amount: bigint;
	getSignerForChain: (chainId: number) => Promise<SendTransactionCapable | null>;
	polygonRelayClient?: RelayClient;
	polygonRelayWalletAddress?: string;
}): Promise<string> {
	const data = encodeFunctionData({
		abi: erc20Abi,
		functionName: "transfer",
		args: [args.recipient, args.amount],
	});

	if (
		args.chainId === polygon.id &&
		args.polygonRelayClient &&
		args.polygonRelayWalletAddress
	) {
		const batch: Transaction[] = [
			{ to: args.tokenAddress, value: "0", data },
		];
		const h = await executePolygonRelayAndWait(
			args.polygonRelayClient,
			batch,
			args.polygonRelayWalletAddress,
			"LevelUp withdraw direct",
		);
		if (!h) throw new Error("Relayer did not return a transaction hash");
		return h;
	}

	const signer = await args.getSignerForChain(args.chainId);
	if (!signer?.sendTransaction) {
		throw new Error(`No wallet client for chain ${args.chainId}`);
	}
	const res = await signer.sendTransaction({
		to: args.tokenAddress as `0x${string}`,
		data: data as `0x${string}`,
		value: 0n,
		chainId: args.chainId,
	});
	if (typeof res === "string") return res;
	if (res && typeof res === "object" && "hash" in res) {
		const h = (res as { hash?: string }).hash;
		if (h) return h;
	}
	throw new Error("Wallet did not return a transaction hash");
}
