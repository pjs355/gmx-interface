/**
 * Picks the transaction hash LI.FI status polling expects: the **main** source-chain
 * route tx, not an earlier ERC-20 `approve` or Solana SPL delegate preflight.
 */
export function pickLifiSourceTxHashForStatus(params: {
	txHashes: string[];
	/** First hop chain id from the quote (e.g. 56, 137, 8453, or LiFi Solana id). */
	fromChainLifi: number;
	solanaLifiChainId: number;
}): string {
	const { txHashes, fromChainLifi, solanaLifiChainId } = params;
	const list = txHashes.filter((h) => typeof h === "string" && h.trim() !== "");

	const evmHashes = list.filter((h) => /^0x[0-9a-fA-F]{64}$/i.test(h));
	/** Base58-style Solana signatures (not EVM 32-byte tx hashes). */
	const svmHashes = list.filter((h) => !/^0x[0-9a-fA-F]{64}$/i.test(h));

	// Only treat non-0x hashes as Solana when the route actually starts on Solana.
	// Otherwise a stray non-hex string would incorrectly win over real EVM hashes.
	if (fromChainLifi === solanaLifiChainId && svmHashes.length > 0) {
		return svmHashes[svmHashes.length - 1]!;
	}

	if (evmHashes.length > 0) {
		return evmHashes[evmHashes.length - 1]!;
	}

	return list[list.length - 1] ?? list[0] ?? "";
}
