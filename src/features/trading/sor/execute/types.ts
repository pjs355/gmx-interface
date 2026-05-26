/** Result of executing one SOR route leg at a venue. */
export type SorLegResult = {
	filled: boolean;
	filledShares: number;
	txHash?: string;
	error?: string;
	/** DFlow: from POST submit `initializedMarket` when the init-payer co-signed. */
	initializedMarket?: boolean;
	/** DFlow: closed with refund `reverts` while fills still delivered the route output mint. */
	dflowPartialFill?: boolean;
};

/** Result of a cross-chain LI.FI prefund bridge for one corridor. */
export type SorBridgeResult = {
	success: boolean;
	bridgeTxHash?: string;
	error?: string;
};
