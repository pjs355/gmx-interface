import type { MutableRefObject } from "react";
import type { AccountWalletRoles } from "@/context/accountWallets";
import type { RouteLeg } from "@/trading/sor/core/sor-types";
import type { SorExecutionPhase, SorLegRouteContext } from "@/trading/sor/core/useSorExecution";
import type { UseSorLegExecutorDeps } from "@/trading/sor/execute/deps";
import type { PrivyEvmSendTransaction } from "@/trading/chains/privyBscProvider";

export type { PrivyEvmSendTransaction };

export type VenueLegDispatchInput = {
	leg: RouteLeg;
	side: "buy" | "sell";
	routeCtx?: SorLegRouteContext;
	fundingAddresses: AccountWalletRoles;
	isLimit: boolean;
	limitPrice: number | undefined;
	deps: UseSorLegExecutorDeps;
	reportSorExecutionPhase: (phase: SorExecutionPhase) => void;
	privyEvmSendTransaction: PrivyEvmSendTransaction;
};

export type SorBridgeExecuteInput = {
	leg: RouteLeg;
	fundingAddresses: AccountWalletRoles;
	opts?: {
		amountUsdOverride?: number;
		budgetUsdOverride?: number;
		onPrefundProgress?: (p: { current: number; total: number }) => void;
		strictLifiDestMinAtSendCap?: boolean;
	};
	deps: UseSorLegExecutorDeps;
	reportSorExecutionPhase: (phase: SorExecutionPhase) => void;
	privyEvmSendTransaction: PrivyEvmSendTransaction;
	getSignerForChain: ReturnType<
		typeof import("@/trading/lifi/useFundingLifiExecution").useFundingLifiExecution
	>["getSignerForChain"];
	preparePolygonRelay: ReturnType<
		typeof import("@/trading/lifi/useFundingLifiExecution").useFundingLifiExecution
	>["preparePolygonRelay"];
	buildExecuteLifiStepsOptions: ReturnType<
		typeof import("@/trading/lifi/useFundingLifiExecution").useFundingLifiExecution
	>["buildExecuteLifiStepsOptions"];
};
