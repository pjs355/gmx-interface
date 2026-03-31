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
