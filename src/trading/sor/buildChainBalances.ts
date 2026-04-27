import type { ChainBalance } from "./sor-types";
import { CHAIN_LIFI_IDS } from "./sor-types";

/**
 * Helper to build ChainBalance array from the user's known balances.
 */
export function buildChainBalances(params: {
	baseUsdcBalance: number;
	baseWalletAddress: string;
	polygonUsdcBalance?: number;
	polygonWalletAddress?: string;
	solanaUsdcBalance?: number;
	solanaWalletAddress?: string;
	bnbUsdtBalance?: number;
	bnbWalletAddress?: string;
	/**
	 * When true, include one row per chain whenever that chain's wallet address is set,
	 * even if balance is 0. SOR backends often validate the full cross-chain wallet map.
	 */
	includeZeroBalanceChainsWithAddress?: boolean;
}): ChainBalance[] {
	const balances: ChainBalance[] = [];
	const inc = Boolean(params.includeZeroBalanceChainsWithAddress);

	if (params.baseWalletAddress) {
		const bal = Math.max(0, params.baseUsdcBalance);
		if (bal > 0 || inc) {
			balances.push({
				chain: "base",
				lifiChainId: CHAIN_LIFI_IDS.base,
				balance: bal,
				walletAddress: params.baseWalletAddress,
			});
		}
	}

	const polyBal = Math.max(0, params.polygonUsdcBalance ?? 0);
	if (params.polygonWalletAddress && (polyBal > 0 || inc)) {
		balances.push({
			chain: "polygon",
			lifiChainId: CHAIN_LIFI_IDS.polygon,
			balance: polyBal,
			walletAddress: params.polygonWalletAddress,
		});
	}

	const solBal = Math.max(0, params.solanaUsdcBalance ?? 0);
	if (params.solanaWalletAddress && (solBal > 0 || inc)) {
		balances.push({
			chain: "solana",
			lifiChainId: CHAIN_LIFI_IDS.solana,
			balance: solBal,
			walletAddress: params.solanaWalletAddress,
		});
	}

	const bnbBal = Math.max(0, params.bnbUsdtBalance ?? 0);
	if (params.bnbWalletAddress && (bnbBal > 0 || inc)) {
		balances.push({
			chain: "bnb",
			lifiChainId: CHAIN_LIFI_IDS.bnb,
			balance: bnbBal,
			walletAddress: params.bnbWalletAddress,
		});
	}

	return balances;
}
