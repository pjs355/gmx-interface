import type { Chain } from "viem";
import { bsc } from "viem/chains";
import type { UnsignedTransactionRequest } from "@privy-io/react-auth";
import type { SendTransactionCapable } from "@/trading/lifi/sendTransactionTypes";
import type { PrivyEvmSendTransaction } from "@/trading/bsc/privyBscProvider";
import {
	runQueuedBnbPrivyTask,
	sendWithBackoffForBscPrivy,
} from "@/trading/bsc/privyBscProvider";
import { errorChainMentionsTransferFromFailed } from "@/trading/lifi/lifiTransferFromFailed";

/** Walk Privy / fetch error shapes for HTTP 400 from `…/wallets/…/rpc`. */
function isPrivyWalletHttp400(err: unknown): boolean {
	let e: unknown = err;
	for (let d = 0; d < 8 && e && typeof e === "object"; d++) {
		const o = e as Record<string, unknown>;
		if (o.status === 400 || o.statusCode === 400) return true;
		const response = o.response as Record<string, unknown> | undefined;
		if (response?.status === 400) return true;
		e = o.cause ?? o.error ?? o.data;
	}
	return false;
}

/**
 * LI.FI `SendTransactionCapable` for the Privy embedded wallet on BSC (or any other
 * supported EVM chain). Routes sends through Privy's TEE-sponsored
 * `useSendTransaction({ sponsor: true })` so the user never needs native gas.
 *
 * **BNB (56):** uses the same per-wallet queue as Predict (`runQueuedBnbPrivyTask`) so
 * approve + LI.FI swap do not burst Privy's wallet RPC. We retry **once with
 * `sponsor: false`** *only* when sponsored submission returns HTTP **400** for an
 * unknown LI.FI `to` contract that's missing from the gas policy — in that case the
 * fallback at least lets a user with BNB self-fund through. The TEE-stack rejection
 * is *not* in this category: those users have no BNB and the only correct response
 * is to retry sponsorship (handled inside `sendWithBackoffForBscPrivy`).
 *
 * Privy wraps **UserOperation simulation reverts** as HTTP 400 too (e.g.
 * `0x7939f424` / `TransferFromFailed`). Retrying without sponsorship does not fix
 * those; we **rethrow** so the LI.FI layer can surface allowance/balance guidance.
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

			if (chain.id !== bsc.id) {
				const { hash } = await sendTransaction(input, {
					sponsor: true,
					address,
				});
				return hash;
			}

			return runQueuedBnbPrivyTask(address, async () => {
				try {
					const { hash } = await sendWithBackoffForBscPrivy(
						() => sendTransaction(input, { sponsor: true, address }),
						`bnb-embedded-sponsored(to=${input.to ?? "?"})`,
					);
					return hash;
				} catch (err) {
					if (errorChainMentionsTransferFromFailed(err)) {
						throw err;
					}
					// Privy wraps failed AA simulation as HTTP 400; do not confuse with gas policy.
					if (
						typeof err === "object" &&
						err &&
						String((err as Error).message ?? "")
							.toLowerCase()
							.includes("useroperation reverted")
					) {
						throw err;
					}
					if (!isPrivyWalletHttp400(err)) throw err;
					if (import.meta.env.DEV) {
						console.warn(
							"[embeddedPrivyViemSend] Sponsored BNB tx returned 400 — retrying without gas sponsorship (add LI.FI `to` contracts to Privy gas policy to avoid this).",
							err,
						);
					}
					const { hash } = await sendWithBackoffForBscPrivy(
						() => sendTransaction(input, { sponsor: false, address }),
						`bnb-embedded-self-funded(to=${input.to ?? "?"})`,
					);
					return hash;
				}
			});
		},
	};
}
