import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAccountData } from "@/context/AccountDataContext";
import { useCurrentProfile } from "@/features/trading/hooks/useCurrentProfile";
import { useDflowProofStatus } from "@/features/trading/hooks/useDflowProofStatus";
import { useVenueTokenApprovals } from "@/features/trading/approvals/useVenueTokenApprovals";
import { tradingQueryKeys } from "@/features/trading/queryKeys";
import { pickWarmupMarketSlugFromEnsureData } from "@/features/trading/venues/limitless/session/limitlessEnsurePayload";
import type { SorVenue } from "@/features/trading/sor/core/sor-types";
import type { TokenApprovalVenueKey } from "@/features/trading/approvals/types";
import {
	badgeFromBooleanReady,
	type TransfersVenueApprovalBadge,
	type TransfersVenueApprovalMap,
} from "./transfersVenueApprovalStatus";

function approvalBadgeFromQuery(args: {
	enabled: boolean;
	hasWallet: boolean;
	ready: boolean | undefined;
	isLoading: boolean;
	isFetched: boolean;
	fetchStatus: "fetching" | "paused" | "idle";
}): TransfersVenueApprovalBadge {
	const loading =
		args.enabled &&
		args.hasWallet &&
		(args.isLoading || (!args.isFetched && args.fetchStatus !== "idle"));
	return badgeFromBooleanReady(args.ready ?? null, loading);
}

/**
 * Read-only per-venue token approval status for Transfers (on-chain only).
 */
export function useTransfersVenueApprovalStatus(enabled: boolean): TransfersVenueApprovalMap {
	const accountData = useAccountData();
	const vacm = accountData.venueAddressChainMap;
	const profileQuery = useCurrentProfile({ enabled });
	const profileId = profileQuery.data?._id;
	const queryClient = useQueryClient();
	const dflowProof = useDflowProofStatus();

	const levelUpWallet = vacm?.levelup.walletAddress ?? null;
	const predictWallet = vacm?.predictfun.walletAddress ?? null;
	const polymarketWallet = vacm?.polymarket.walletAddress ?? null;
	const limitlessWallet = vacm?.limitless.walletAddress ?? null;

	const limitlessEnsureKey = profileId ? tradingQueryKeys.limitlessEnsureAccount(profileId) : null;
	const limitlessEnsureData = limitlessEnsureKey
		? queryClient.getQueryData(limitlessEnsureKey)
		: undefined;
	const limitlessWarmupSlug = pickWarmupMarketSlugFromEnsureData(limitlessEnsureData);

	const levelupQuery = useVenueTokenApprovals("levelup", {
		enabled: enabled && Boolean(levelUpWallet?.trim()),
		walletAddress: levelUpWallet,
	});

	const polymarketQuery = useVenueTokenApprovals("polymarket", {
		enabled: enabled && Boolean(polymarketWallet?.trim()),
		walletAddress: polymarketWallet,
	});

	const predictQuery = useVenueTokenApprovals("predictfun", {
		enabled: enabled && Boolean(predictWallet?.trim()),
		walletAddress: predictWallet,
	});

	const limitlessQuery = useVenueTokenApprovals("limitless", {
		enabled: enabled && Boolean(limitlessWallet?.trim()) && Boolean(limitlessWarmupSlug),
		walletAddress: limitlessWallet,
		limitlessWarmupSlug,
	});

	return useMemo((): TransfersVenueApprovalMap => {
		const levelup = approvalBadgeFromQuery({
			enabled,
			hasWallet: Boolean(levelUpWallet?.trim()),
			ready: levelupQuery.data?.ready,
			isLoading: levelupQuery.isLoading,
			isFetched: levelupQuery.isFetched,
			fetchStatus: levelupQuery.fetchStatus,
		});

		const polymarket = approvalBadgeFromQuery({
			enabled,
			hasWallet: Boolean(polymarketWallet?.trim()),
			ready: polymarketQuery.data?.ready,
			isLoading: polymarketQuery.isLoading,
			isFetched: polymarketQuery.isFetched,
			fetchStatus: polymarketQuery.fetchStatus,
		});

		const predictfun = approvalBadgeFromQuery({
			enabled,
			hasWallet: Boolean(predictWallet?.trim()),
			ready: predictQuery.data?.ready,
			isLoading: predictQuery.isLoading,
			isFetched: predictQuery.isFetched,
			fetchStatus: predictQuery.fetchStatus,
		});

		const limitless = approvalBadgeFromQuery({
			enabled: enabled && Boolean(limitlessWallet?.trim()) && Boolean(limitlessWarmupSlug),
			hasWallet: Boolean(limitlessWallet?.trim()),
			ready: limitlessQuery.data?.ready,
			isLoading: limitlessQuery.isLoading,
			isFetched: limitlessQuery.isFetched,
			fetchStatus: limitlessQuery.fetchStatus,
		});

		const dflow: TransfersVenueApprovalBadge = (() => {
			if (!enabled) return { status: "loading" };
			if (dflowProof.isLoading || !dflowProof.isFetched) {
				return { status: "loading" };
			}
			if (dflowProof.isVerified) {
				return { status: "ready", label: "Verified" };
			}
			return { status: "needs_setup", label: "Not verified" };
		})();

		return {
			levelup,
			limitless,
			polymarket,
			predictfun,
			dflow,
		};
	}, [
		enabled,
		levelUpWallet,
		levelupQuery.data?.ready,
		levelupQuery.isLoading,
		levelupQuery.isFetched,
		levelupQuery.fetchStatus,
		polymarketWallet,
		polymarketQuery.data?.ready,
		polymarketQuery.isLoading,
		polymarketQuery.isFetched,
		polymarketQuery.fetchStatus,
		predictWallet,
		predictQuery.data?.ready,
		predictQuery.isLoading,
		predictQuery.isFetched,
		predictQuery.fetchStatus,
		limitlessWallet,
		limitlessWarmupSlug,
		limitlessQuery.data?.ready,
		limitlessQuery.isLoading,
		limitlessQuery.isFetched,
		limitlessQuery.fetchStatus,
		dflowProof.isLoading,
		dflowProof.isFetched,
		dflowProof.isVerified,
	]);
}

export type { SorVenue, TokenApprovalVenueKey };
