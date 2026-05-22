import type { ExecuteLifiStepsOptions } from "@/trading/lifi/executeLifiSteps";
import { CHAIN_LIFI_IDS } from "../core/sor-types";

const BASE_LIFI_CHAIN_ID = CHAIN_LIFI_IDS.base;

/** Same pattern as `ETH_ADDRESS_RE` in `executeLifiSteps.ts` — `0x` + 40 hex nibbles (LI.FI `fromAddress`). */
const EVM_LIFI_PAYER_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * SOR prefund can quote LI.FI with `fromAddress` = embedded / Limitless maker on Base
 * when the Coinbase SCW has no USDC there. `useFundingLifiExecution` still maps Base
 * allowance owner to the SCW only, and `getSignerForChain(8453)` returns the SCW client.
 *
 * **Invariant:** On Base-origin prefund steps, `executeLifiSteps` must use the same
 * address for ERC-20 `balanceOf` / approvals as LI.FI encodes in the quote (`fromAddress`),
 * and the signer for chain 8453 must be able to send **as** that address.
 *
 * This helper only adjusts `allowanceOwnerByChainId[8453]`; the caller wires the signer
 * when the payer is the embedded EOA (Privy TEE path).
 */
export function mergeExecuteLifiStepsAllowanceOwnerForSorBasePrefund(
	built: ExecuteLifiStepsOptions,
	fromChainLifi: number,
	quoteFromAddressRaw: string,
): ExecuteLifiStepsOptions {
	const quoteFrom = quoteFromAddressRaw.trim();
	if (fromChainLifi !== BASE_LIFI_CHAIN_ID || !EVM_LIFI_PAYER_ADDRESS_RE.test(quoteFrom)) {
		return built;
	}
	return {
		...built,
		allowanceOwnerByChainId: {
			...built.allowanceOwnerByChainId,
			[BASE_LIFI_CHAIN_ID]: quoteFrom,
		},
	};
}

/**
 * When the LI.FI quote spends from the embedded EOA on Base, approvals and bridge txs
 * must go through `createPrivyEmbeddedSendTransactionCapable` — not the SCW client.
 */
export function sorBasePrefundLifiShouldUseEmbeddedSigner(p: {
	chainId: number;
	quoteFromAddressRaw: string;
	embeddedEoaRaw: string;
}): boolean {
	if (p.chainId !== BASE_LIFI_CHAIN_ID) return false;
	const quoteTrim = p.quoteFromAddressRaw.trim();
	const q = quoteTrim.toLowerCase();
	const e = p.embeddedEoaRaw.trim().toLowerCase();
	return e.length > 0 && EVM_LIFI_PAYER_ADDRESS_RE.test(quoteTrim) && q === e;
}
