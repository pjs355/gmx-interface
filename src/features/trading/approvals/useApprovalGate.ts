import { useCallback, useMemo, useRef } from "react";
import { useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import type { SendTransactionCapable } from "@/features/trading/lifi/sendTransactionTypes";
import type { AccountPolyAccountSlice } from "@/context/AccountDataContext";
import type { AccountDataVacmSlice } from "@/context/accountWallets";
import { usePrivateApiClient } from "@/features/trading/hooks/usePrivateApiClient";
import type { useCollateralTokens } from "context/CollateralTokenContext";
import type { useDflowProofStatus } from "@/features/trading/hooks/useDflowProofStatus";
import type { usePolymarketRelay } from "@/features/trading/venues/polymarket/session/usePolymarketRelay";
import type { usePredictTradingSession } from "@/features/trading/venues/predict/session/usePredictTradingSession";
import type { usePredictApprovalsStatus } from "@/features/trading/venues/predict/wallet/usePredictApprovalsStatus";
import type { PredictMarketDetail } from "@/features/trading/venues/predict/portfolio/predictMarketApi";
import { useLevelUpApprovalGate } from "@/features/trading/venues/levelup/approvals/useLevelUpApprovalGate";
import { ensureTokenApprovalsForVenue } from "./ensureTokenApprovalsForVenue";
import type {
	ApprovalEnsureScope,
	ApprovalRuntime,
	EnsureTokenApprovalsFn,
	TokenApprovalVenueKey,
} from "./types";

export type UseApprovalGateParams = {
	levelUpEnabled?: boolean;
	predictApprovalsQuery: ReturnType<typeof usePredictApprovalsStatus>;
	predictSession: ReturnType<typeof usePredictTradingSession>;
	predictMarketDetail: PredictMarketDetail | null | undefined;
	venueAddressChainMap: AccountDataVacmSlice["venueAddressChainMap"];
	walletGate: AccountDataVacmSlice["walletGate"];
	polyAccount: AccountPolyAccountSlice;
	relay: ReturnType<typeof usePolymarketRelay>;
	fundEvmForPrivy: string | undefined;
	getLimitlessTxClientForAddress: (
		addr: string,
	) => Promise<SendTransactionCapable | null | undefined>;
	collateralTokens: ReturnType<typeof useCollateralTokens>;
	limitlessEnsureQuery: UseQueryResult<unknown>;
	dflowProof: ReturnType<typeof useDflowProofStatus>;
	handleStartDflowProofForTrade: () => Promise<void>;
};

export function useApprovalGate(params: UseApprovalGateParams) {
	const queryClient = useQueryClient();
	const privateApi = usePrivateApiClient();
	const levelUpGate = useLevelUpApprovalGate(params.levelUpEnabled ?? true);

	const runtimeRef = useRef<ApprovalRuntime | null>(null);
	runtimeRef.current = {
		queryClient,
		venueAddressChainMap: params.venueAddressChainMap,
		walletGate: params.walletGate,
		polyAccount: params.polyAccount,
		relay: params.relay,
		predictApprovalsQuery: params.predictApprovalsQuery,
		predictSession: params.predictSession,
		predictMarketDetail: params.predictMarketDetail,
		fundEvmForPrivy: params.fundEvmForPrivy,
		getLimitlessTxClientForAddress: params.getLimitlessTxClientForAddress,
		collateralTokens: params.collateralTokens,
		limitlessEnsureQuery: params.limitlessEnsureQuery,
		privateApi,
		ensureLevelUpApprovals: levelUpGate.ensureApproved,
	};

	const ensureTokenApprovals = useCallback<EnsureTokenApprovalsFn>(async (venue, scope) => {
		const runtime = runtimeRef.current;
		if (!runtime) {
			throw new Error("Approval runtime is not initialized");
		}
		await ensureTokenApprovalsForVenue(runtime, venue, scope as ApprovalEnsureScope<typeof venue>);
	}, []);

	const ensureDflowProofVerified = useCallback(async (): Promise<boolean> => {
		const verified = await params.dflowProof.refetchIsVerified();
		if (!verified) {
			try {
				await params.handleStartDflowProofForTrade();
			} catch {
				/* best-effort */
			}
		}
		return verified;
	}, [params.dflowProof, params.handleStartDflowProofForTrade]);

	const ensureTokenApprovalsForSor = useMemo(
		() => (venue: TokenApprovalVenueKey, scope?: ApprovalEnsureScope<TokenApprovalVenueKey>) =>
			ensureTokenApprovals(venue, scope),
		[ensureTokenApprovals],
	);

	return {
		levelUp: levelUpGate,
		approvalState: levelUpGate.approvalState,
		refetchLevelUpApprovalStatus: levelUpGate.refetchStatus,
		ensureTokenApprovals,
		ensureTokenApprovalsForSor,
		ensureDflowProofVerified,
	};
}

export type { TokenApprovalVenueKey, ApprovalEnsureScope };
