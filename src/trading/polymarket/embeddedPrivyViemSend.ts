import { createWalletClient, custom, type Chain } from "viem";
import type { SendTransactionCapable } from "@/trading/lifi/sendTransactionTypes";

/**
 * Viem `sendTransaction` for the Privy embedded wallet on an arbitrary EVM chain (e.g. BSC for LI.FI).
 * Uses the EIP-1193 provider from `embeddedWallet.getEthereumProvider()`.
 */
export function createPrivyEmbeddedSendTransactionCapable(
	provider: unknown,
	account: `0x${string}`,
	chain: Chain,
	opts?: { sponsorGas?: boolean }
): SendTransactionCapable {
	const walletClient = createWalletClient({
		account,
		chain,
		transport: custom(provider as never),
	});

	return {
		sendTransaction: async (args) => {
			const payload: Record<string, unknown> = {
				to: args.to,
				data: args.data,
				value: args.value ?? 0n,
				chain,
			};
			if (opts?.sponsorGas === true || args.sponsor === true) {
				payload.sponsor = true;
			} else if (opts?.sponsorGas === false) {
				payload.sponsor = false;
			}
			const hash = await walletClient.sendTransaction(payload as never);
			return hash;
		},
	};
}
