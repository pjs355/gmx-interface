import { ethers } from "ethers";
import { base } from "viem/chains";
import type { SendTransactionCapable } from "@/trading/lifi/sendTransactionTypes";
import type { PrivyEvmSendTransaction } from "@/trading/chains/privyBscProvider";
import { createPrivyEmbeddedSendTransactionCapable } from "@/trading/venues/polymarket/wallet/embeddedPrivyViemSend";
import type { GetClientForChainForLimitless } from "@/trading/venues/limitless/approvals/limitlessTradingApprovalsOnBase";
import { BASE } from "@/config/chains";

/**
 * Resolves the Privy client that can submit Base txs **as** `address` for Limitless
 * CLOB setup (USDC `approve`, CTF `setApprovalForAll`). Limitless EIP-712 `maker` is
 * usually the embedded EOA while the app fund target is the smart wallet — approvals
 * must be sent from the **maker** identity, not the SCW.
 */
export async function getLimitlessBaseTxClientForAddress(input: {
	address: string;
	getClientForChain: GetClientForChainForLimitless;
	baseSmartWallet?: string;
	embeddedEoa?: string;
	privyEvmSendTransaction: PrivyEvmSendTransaction;
}): Promise<SendTransactionCapable | null> {
	let normalized: string;
	try {
		normalized = ethers.getAddress(input.address.trim());
	} catch {
		return null;
	}
	const sw = input.baseSmartWallet?.trim();
	if (sw) {
		try {
			if (ethers.getAddress(sw) === normalized) {
				return (await input.getClientForChain({ id: BASE })) ?? null;
			}
		} catch {
			/* ignore */
		}
	}
	const emb = input.embeddedEoa?.trim();
	if (emb) {
		try {
			if (ethers.getAddress(emb) === normalized) {
				return createPrivyEmbeddedSendTransactionCapable(
					emb as `0x${string}`,
					base,
					input.privyEvmSendTransaction,
				);
			}
		} catch {
			/* ignore */
		}
	}
	return null;
}
