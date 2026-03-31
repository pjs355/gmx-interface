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
