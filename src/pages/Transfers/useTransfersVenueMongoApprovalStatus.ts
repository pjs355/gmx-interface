import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAccountData } from "@/context/AccountDataContext";
import { useCurrentProfile } from "@/features/trading/hooks/useCurrentProfile";
import { useDflowProofStatus } from "@/features/trading/hooks/useDflowProofStatus";
import { tradingQueryKeys } from "@/features/trading/queryKeys";
import type { SorVenue } from "@/features/trading/sor/core/sor-types";
import {
	readDflowMongoProofDebug,
	readLevelUpMongoApprovalDebug,
	readLimitlessMongoApprovalDebug,
	readPolymarketMongoApprovalDebug,
	readPredictMongoApprovalDebug,
	type TransfersVenueMongoApprovalMap,
} from "./transfersVenueMongoApprovalStatus";

/** Dev-only: what Mongo / GET account APIs say about venue readiness (not chain). */
export function useTransfersVenueMongoApprovalStatus(
	enabled: boolean,
): TransfersVenueMongoApprovalMap {
	const accountData = useAccountData();
	const profileQuery = useCurrentProfile({ enabled });
	const profileId = profileQuery.data?._id;
	const queryClient = useQueryClient();
	const dflowProof = useDflowProofStatus();

	const polyLoading =
		enabled && (!accountData.polyAccount.isFetched || accountData.polyAccount.status === "pending");
	const predictLoading =
		enabled &&
		(!accountData.predictAccount.isFetched || accountData.predictAccount.status === "pending");

	const limitlessEnsureKey = profileId ? tradingQueryKeys.limitlessEnsureAccount(profileId) : null;
	const limitlessEnsureData = limitlessEnsureKey
		? queryClient.getQueryData(limitlessEnsureKey)
		: undefined;

	return useMemo((): TransfersVenueMongoApprovalMap => {
		if (!enabled) {
			const pending = (venue: SorVenue) => ({
				venue,
				label: "Mongo …",
				ready: null as boolean | null,
				detail: "expand addresses to load",
			});
			return {
				levelup: pending("levelup"),
				limitless: pending("limitless"),
				polymarket: pending("polymarket"),
				predictfun: pending("predictfun"),
				dflow: pending("dflow"),
			};
		}

		return {
			levelup: readLevelUpMongoApprovalDebug(),
			polymarket: readPolymarketMongoApprovalDebug(
				accountData.polyAccount.data ?? undefined,
				polyLoading,
			),
			predictfun: readPredictMongoApprovalDebug(
				accountData.predictAccount.data ?? undefined,
				predictLoading,
			),
			limitless: readLimitlessMongoApprovalDebug(limitlessEnsureData, profileId),
			dflow: readDflowMongoProofDebug(
				dflowProof.data,
				dflowProof.isLoading || !dflowProof.isFetched,
			),
		};
	}, [
		enabled,
		accountData.polyAccount.data,
		accountData.predictAccount.data,
		polyLoading,
		predictLoading,
		limitlessEnsureData,
		profileId,
		dflowProof.data,
		dflowProof.isLoading,
		dflowProof.isFetched,
	]);
}
