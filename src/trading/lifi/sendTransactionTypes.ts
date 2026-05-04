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
	 * Sign-only path used when the server (not the user) submits the tx to the
	 * cluster — required for the DFlow `POST /api/dflow/orders` flow so we can
	 * persist a `VenueOrder` audit row server-side after `confirmed` commitment.
	 */
	signTransactionOnly: (serializedTx: Uint8Array) => Promise<Uint8Array>;
};
