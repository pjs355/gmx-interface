import { useMemo } from "react";
import type { LevelUpApprovalStatus } from "@/features/trading/venues/levelup/approvals/levelUpApprovalAdapter";
import { useLevelUpApprovalsStatus } from "@/features/trading/venues/levelup/approvals/useLevelUpApprovalsStatus";
import { useLimitlessApprovalsStatus } from "@/features/trading/venues/limitless/approvals/useLimitlessApprovalsStatus";
import { usePolymarketApprovalsStatus } from "@/features/trading/venues/polymarket/approvals/usePolymarketApprovalsStatus";
import { usePredictApprovalsStatus } from "@/features/trading/venues/predict/wallet/usePredictApprovalsStatus";
import type {
	TokenApprovalVenueKey,
	UseVenueTokenApprovalsOptions,
	VenueTokenApprovalRead,
	VenueTokenApprovalsQueryResult,
} from "./venueTokenApprovalTypes";

function mapLevelUpTokenApprovalRead(status: LevelUpApprovalStatus): VenueTokenApprovalRead {
	return {
		ready: status.isApproved,
		ctf: status.hasCtfApproval,
		collateral: status.hasUsdcApproval && status.hasFeeWrapperApproval,
	};
}

function mapPredictBooleanRead(ready: boolean): VenueTokenApprovalRead {
	return { ready, ctf: ready, collateral: ready };
}

function toQueryResult(args: {
	data: VenueTokenApprovalRead | undefined;
	isLoading: boolean;
	isFetched: boolean;
	fetchStatus: "fetching" | "paused" | "idle";
	refetch: () => void;
}): VenueTokenApprovalsQueryResult {
	return {
		data: args.data,
		isLoading: args.isLoading,
		isFetched: args.isFetched,
		fetchStatus: args.fetchStatus,
		refetch: args.refetch,
	};
}

/**
 * Uniform client-only on-chain token approval reads per trading venue.
 * Does not read Mongo or server approval flags.
 */
export function useVenueTokenApprovals(
	venue: TokenApprovalVenueKey,
	options: UseVenueTokenApprovalsOptions,
): VenueTokenApprovalsQueryResult {
	const {
		enabled,
		walletAddress,
		limitlessWarmupSlug,
		predictIsNegRisk = false,
		predictIsYieldBearing = false,
	} = options;

	const levelUpQuery = useLevelUpApprovalsStatus(
		venue === "levelup" ? walletAddress : null,
		enabled && venue === "levelup",
	);

	const polymarketQuery = usePolymarketApprovalsStatus(
		venue === "polymarket" ? walletAddress : null,
		enabled && venue === "polymarket",
	);

	const predictQuery = usePredictApprovalsStatus(
		venue === "predictfun" ? walletAddress : undefined,
		predictIsNegRisk,
		predictIsYieldBearing,
		enabled && venue === "predictfun",
	);

	const limitlessQuery = useLimitlessApprovalsStatus(
		venue === "limitless" ? walletAddress : null,
		venue === "limitless" ? limitlessWarmupSlug : null,
		enabled && venue === "limitless",
	);

	return useMemo((): VenueTokenApprovalsQueryResult => {
		switch (venue) {
			case "levelup": {
				const data = levelUpQuery.data ? mapLevelUpTokenApprovalRead(levelUpQuery.data) : undefined;
				return toQueryResult({
					data,
					isLoading: levelUpQuery.isLoading,
					isFetched: levelUpQuery.isFetched,
					fetchStatus: levelUpQuery.fetchStatus,
					refetch: () => void levelUpQuery.refetch(),
				});
			}
			case "polymarket":
				return toQueryResult({
					data: polymarketQuery.data,
					isLoading: polymarketQuery.isLoading,
					isFetched: polymarketQuery.isFetched,
					fetchStatus: polymarketQuery.fetchStatus,
					refetch: () => void polymarketQuery.refetch(),
				});
			case "predictfun": {
				const data =
					predictQuery.data === undefined ? undefined : mapPredictBooleanRead(predictQuery.data);
				return toQueryResult({
					data,
					isLoading: predictQuery.isLoading,
					isFetched: predictQuery.isFetched,
					fetchStatus: predictQuery.fetchStatus,
					refetch: () => void predictQuery.refetch(),
				});
			}
			case "limitless":
				return toQueryResult({
					data: limitlessQuery.data,
					isLoading: limitlessQuery.isLoading,
					isFetched: limitlessQuery.isFetched,
					fetchStatus: limitlessQuery.fetchStatus,
					refetch: () => void limitlessQuery.refetch(),
				});
			default: {
				const _exhaustive: never = venue;
				throw new Error(`Unsupported venue for token approvals: ${_exhaustive}`);
			}
		}
	}, [
		venue,
		levelUpQuery.data,
		levelUpQuery.isLoading,
		levelUpQuery.isFetched,
		levelUpQuery.fetchStatus,
		levelUpQuery.refetch,
		polymarketQuery.data,
		polymarketQuery.isLoading,
		polymarketQuery.isFetched,
		polymarketQuery.fetchStatus,
		polymarketQuery.refetch,
		predictQuery.data,
		predictQuery.isLoading,
		predictQuery.isFetched,
		predictQuery.fetchStatus,
		predictQuery.refetch,
		limitlessQuery.data,
		limitlessQuery.isLoading,
		limitlessQuery.isFetched,
		limitlessQuery.fetchStatus,
		limitlessQuery.refetch,
	]);
}
