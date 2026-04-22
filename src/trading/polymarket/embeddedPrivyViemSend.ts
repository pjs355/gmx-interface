import type { Chain } from "viem";
import type { UnsignedTransactionRequest } from "@privy-io/react-auth";
import type { SendTransactionCapable } from "@/trading/lifi/sendTransactionTypes";
import type { PrivyEvmSendTransaction } from "@/trading/bsc/privyBscProvider";

/**
 * LI.FI `SendTransactionCapable` for the Privy embedded wallet on BSC (or any other
 * supported EVM chain). Routes sends through Privy's TEE-sponsored
 * `useSendTransaction({ sponsor: true })` so the user never needs native gas.
 */
export function createPrivyEmbeddedSendTransactionCapable(
	address: `0x${string}`,
	chain: Chain,
	sendTransaction: PrivyEvmSendTransaction,
): SendTransactionCapable {
	return {
		sendTransaction: async (args) => {
			const input: UnsignedTransactionRequest = {
				from: address,
				to: args.to,
				data: args.data,
				value: args.value,
				chainId: args.chainId ?? chain.id,
			};
			const { hash } = await sendTransaction(input, {
				sponsor: true,
				address,
			});
			return hash;
		},
	};
}
