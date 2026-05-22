/** Min Privy `useWallets` entry for embedded / TEE EVM selection. */
export type PrivyWalletListEntry = {
	type?: string;
	address?: string;
	chainType?: string;
	walletClientType?: string;
	connectorType?: string;
	getEthereumProvider?: () => Promise<unknown>;
};

/** True when the Privy wallet list entry is the embedded EOA (EVM). */
export function isPrivyEmbeddedWallet(w: {
	walletClientType?: string;
	connectorType?: string;
}): boolean {
	return (
		w?.walletClientType === "privy" ||
		w?.connectorType === "privy" ||
		w?.walletClientType === "embedded"
	);
}

/**
 * Picks the EVM embedded / Privy-managed wallet and avoids the Solana TEE/embedded
 * entry when it appears first in the list.
 */
export function findEvmPrivyEmbeddedWallet(
	wallets: readonly PrivyWalletListEntry[] | undefined | null
): PrivyWalletListEntry | undefined {
	const list = wallets || [];
	const candidates: PrivyWalletListEntry[] = [];
	for (const w of list) {
		if (String(w?.chainType ?? "").toLowerCase() === "solana") {
			continue;
		}
		if (
			typeof w?.address === "string" &&
			w.address.length > 0 &&
			!w.address.trim().toLowerCase().startsWith("0x")
		) {
			continue;
		}
		const isEmb =
			isPrivyEmbeddedWallet(w) ||
			String(w?.type ?? "").toLowerCase() === "embedded_wallet";
		if (!isEmb) continue;
		candidates.push(w);
	}
	if (candidates.length === 0) {
		return undefined;
	}
	const withProvider = candidates.find(
		(w) => typeof w.getEthereumProvider === "function"
	);
	return withProvider ?? candidates[0];
}
