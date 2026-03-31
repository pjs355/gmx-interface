/** Per-venue readiness and registry from AccountOverview */
export type VenueRegistryStatus = string;

export type ApprovalRequirement = {
	kind?: string;
	token?: string;
	spender?: string;
	chainId?: number;
	metadata?: Record<string, unknown>;
};

export type VenueReadiness = {
	executionReady?: boolean;
	blockingReasons?: string[];
	metadata?: Record<string, unknown>;
};

export type FundingDestination = {
	chainId?: number;
	address?: string;
	token?: string;
	label?: string;
};

export type AccountVenueSlice = {
	venueId: string;
	displayName?: string;
	registryStatus?: VenueRegistryStatus;
	readiness?: VenueReadiness;
	fundingDestination?: FundingDestination | null;
	approvalRequirements?: ApprovalRequirement[];
	/** Opaque server fields */
	[key: string]: unknown;
};

export type WalletDescriptor = {
	kind?: string;
	/** Server `AccountWallet` discriminator, e.g. `evm` | `solana` */
	chainFamily?: string;
	chainId?: number;
	address?: string;
	label?: string;
	[key: string]: unknown;
};

export type VenueRoutingEligibility = {
	canExecute: boolean;
	reasons?: string[];
};

export type RoutingEligibility = {
	polymarket?: VenueRoutingEligibility;
	limitless?: VenueRoutingEligibility;
	kalshiViaDflow?: VenueRoutingEligibility;
};

export type AccountOverview = {
	userId?: string;
	profileId?: string;
	wallets?: WalletDescriptor[];
	venues?: AccountVenueSlice[];
	routingEligibility?: RoutingEligibility;
	/**
	 * Set only by the client when `GET …/account-overview` returns HTTP 404.
	 * Prefer fixing path/host; use this only when the API intentionally uses 404 for “no overview.”
	 */
	_clientAccountOverviewNotFound?: boolean;
	[key: string]: unknown;
};
