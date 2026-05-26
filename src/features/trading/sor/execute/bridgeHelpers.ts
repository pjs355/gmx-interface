import { CHAIN_LIFI_IDS } from "@/features/trading/sor/core/sor-types";
import type { AccountWalletRoles } from "@/context/accountWallets";
import { pickLifiSourceTxHashForStatus } from "@/features/trading/lifi/pickLifiSourceTxHashForStatus";
import type { PrefundStep } from "@/features/trading/sor/prefund/prefundPlan";

type SorChainKey = "base" | "polygon" | "solana" | "bnb";

/**
 * Per-chain destination address for SOR funding moves. The Polygon entry
 * returns `addrs.polymarketSafe`, which after the deposit-wallet migration is
 * the user's Polymarket **deposit wallet** (ERC-1967 proxy from the deposit
 * wallet factory) — same downstream consumers, different wallet type. The
 * field name is kept for back-compat with all existing callers.
 */
export function addressForChain(chain: SorChainKey, addrs: AccountWalletRoles): string {
	switch (chain) {
		case "base":
			return addrs.baseSmartWallet;
		case "polygon":
			return addrs.polymarketSafe;
		case "bnb":
			return addrs.embeddedEoa;
		case "solana":
			return addrs.solanaAddress;
	}
}

export function prefundSourceAddressForStep(step: PrefundStep, addrs: AccountWalletRoles): string {
	if (step.fromChain !== "base") {
		return addressForChain(step.fromChain, addrs);
	}
	const w = step.baseSpendWallet;
	if (w === "limitlessMaker") {
		return addrs.limitlessMakerBase;
	}
	return addrs.baseSmartWallet;
}

export const SOLANA_LIFI_CHAIN_ID = CHAIN_LIFI_IDS.solana;

export function maskFundingAddress(addr: string | undefined): string | undefined {
	if (!addr?.trim()) return undefined;
	const a = addr.trim();
	if (a.startsWith("0x") && a.length > 12) {
		return `${a.slice(0, 6)}…${a.slice(-4)}`;
	}
	if (a.length > 12) {
		return `${a.slice(0, 4)}…${a.slice(-4)}`;
	}
	return a;
}

/**
 * Hash to pass to `GET /funding/lifi/status`: the **source-chain** tx (first hop).
 * When the route starts on Solana, that signature is base58, not `0x…`; picking the last
 * EVM hash would poll the wrong tx.
 */
export function pickBridgeSourceTxHashForLifiStatus(
	txHashes: string[],
	_steps: unknown[] | undefined,
	fromChainLifi: number,
): string {
	return pickLifiSourceTxHashForStatus({
		txHashes,
		fromChainLifi,
		solanaLifiChainId: SOLANA_LIFI_CHAIN_ID,
	});
}
