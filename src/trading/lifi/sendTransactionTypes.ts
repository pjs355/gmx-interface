/** Minimal signer surface for LI.FI step execution (Privy smart wallet or embedded viem client). */
export type SendTransactionCapable = {
	sendTransaction: (args: {
		to: `0x${string}`;
		data?: `0x${string}`;
		value?: bigint;
		chainId?: number;
		/** Privy gas sponsorship when supported by the wallet client */
		sponsor?: boolean;
	}) => Promise<{ hash?: string } | `0x${string}`>;
};

/** Minimal signer for LI.FI Solana steps (Privy Solana embedded wallet). */
export type SolanaSignerCapable = {
	signAndSendTransaction: (serializedTx: Uint8Array) => Promise<string>;
	/**
	 * Sign-only path when the LevelUp API submits the tx via `POST /api/dflow/orders`.
	 * The server broadcasts then polls DFlow `/order-status` until terminal before
	 * responding — HTTP 200 means `closed`, not merely RPC acceptance.
	 */
	signTransactionOnly: (serializedTx: Uint8Array) => Promise<Uint8Array>;
};
