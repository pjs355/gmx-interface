import type { TokenApprovalVenueKey } from "./types";

/** Uniform on-chain token approval snapshot (client reads only — never Mongo). */
export type VenueTokenApprovalRead = {
	ready: boolean;
	ctf: boolean;
	collateral: boolean;
};

export type UseVenueTokenApprovalsOptions = {
	enabled: boolean;
	walletAddress: string | null | undefined;
	/** Limitless: market slug for `verify-allowance` spender discovery. */
	limitlessWarmupSlug?: string | null;
	/** Predict: scoped to market type (defaults to standard binary). */
	predictIsNegRisk?: boolean;
	predictIsYieldBearing?: boolean;
};

export type VenueTokenApprovalsQueryResult = {
	data: VenueTokenApprovalRead | undefined;
	isLoading: boolean;
	isFetched: boolean;
	fetchStatus: "fetching" | "paused" | "idle";
	refetch: () => void;
};

export type { TokenApprovalVenueKey };
