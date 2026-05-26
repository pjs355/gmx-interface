/** Matches predictions-api `OverviewVenueId` / registry + synthetic LevelUp. */
export type OverviewVenueId =
	| "polymarket"
	| "limitless"
	| "predict_fun"
	| "dflow_proof"
	| "levelup";

export type VenueRegulatorySetup = {
	identityVerified: boolean;
	ownershipProofValid: boolean;
};

export type VenueSetupWallets = {
	signer: string | null;
	maker: string | null;
	trading: string | null;
};

/**
 * Uniform account setup from `GET /account-overview` (`venues[].setup`).
 * Token approvals are client-only — not represented here.
 */
export type VenueSetupSlice = {
	wallets: VenueSetupWallets;
	tradingWalletDeployed: boolean;
	identityReady: boolean;
	regulatory: VenueRegulatorySetup | null;
	sorCanInclude: boolean;
	blockingReasons: string[];
};
