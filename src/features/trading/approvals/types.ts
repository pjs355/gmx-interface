import type { QueryClient } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import type { SorVenue } from "@/features/trading/sor/core/sor-types";
import type { SendTransactionCapable } from "@/features/trading/lifi/sendTransactionTypes";
import type { AccountPolyAccountSlice } from "@/context/AccountDataContext";
import type { AccountDataVacmSlice } from "@/context/accountWallets";
import type { useCollateralTokens } from "context/CollateralTokenContext";
import type { usePredictTradingSession } from "@/features/trading/venues/predict/session/usePredictTradingSession";
import type { usePredictApprovalsStatus } from "@/features/trading/venues/predict/wallet/usePredictApprovalsStatus";
import type { PredictMarketDetail } from "@/features/trading/venues/predict/portfolio/predictMarketApi";
import type { usePolymarketRelay } from "@/features/trading/venues/polymarket/session/usePolymarketRelay";
import type { useDflowProofStatus } from "@/features/trading/hooks/useDflowProofStatus";
import type { UseSorLegExecutorDeps } from "@/features/trading/sor/execute/deps";

/** Venues that require on-chain / relay token approvals before trade. */
export type TokenApprovalVenueKey = Exclude<SorVenue, "dflow">;

export type PolymarketApprovalEnsureScope = {
	force?: boolean;
	onApprovalWorkStart?: () => void;
};

export type LimitlessApprovalEnsureScope = {
	marketSlug: string;
	limitlessOrderTokenId?: string;
	side: "buy" | "sell";
};

export type PredictApprovalEnsureScope = {
	isNegRisk?: boolean;
	isYieldBearing?: boolean;
};

export type ApprovalEnsureScopeMap = {
	levelup: undefined;
	polymarket: PolymarketApprovalEnsureScope | undefined;
	predictfun: PredictApprovalEnsureScope | undefined;
	limitless: LimitlessApprovalEnsureScope;
};

export type ApprovalEnsureScope<V extends TokenApprovalVenueKey = TokenApprovalVenueKey> =
	ApprovalEnsureScopeMap[V];

/** Dependencies shared by venue approval adapters (built once per trade box mount). */
export type ApprovalRuntime = {
	queryClient: QueryClient;
	venueAddressChainMap: AccountDataVacmSlice["venueAddressChainMap"];
	walletGate: AccountDataVacmSlice["walletGate"];
	polyAccount: AccountPolyAccountSlice;
	relay: ReturnType<typeof usePolymarketRelay>;
	predictApprovalsQuery: ReturnType<typeof usePredictApprovalsStatus>;
	predictSession: ReturnType<typeof usePredictTradingSession>;
	predictMarketDetail: PredictMarketDetail | null | undefined;
	fundEvmForPrivy: string | undefined;
	getLimitlessTxClientForAddress: (
		addr: string,
	) => Promise<SendTransactionCapable | null | undefined>;
	collateralTokens: ReturnType<typeof useCollateralTokens>;
	limitlessEnsureQuery: UseQueryResult<unknown>;
	privateApi: import("@/services/privateApi").PrivateApiClient;
	ensureLevelUpApprovals: () => Promise<void>;
};

export type DflowProofRuntime = {
	dflowProof: ReturnType<typeof useDflowProofStatus>;
	handleStartDflowProofForTrade: () => Promise<void>;
};

export type EnsureTokenApprovalsFn = <V extends TokenApprovalVenueKey>(
	venue: V,
	scope?: ApprovalEnsureScope<V>,
) => Promise<void>;

export type SorEnsureTokenApprovalsFn = NonNullable<UseSorLegExecutorDeps["ensureTokenApprovals"]>;
