import { useCallback, useMemo } from "react";
import { useSendTransaction } from "@privy-io/react-auth";
import {
	walletRolesFromVenueAddressChainMap,
	requireVenueAddressChainMapForExecute,
	ACCOUNT_WALLETS_NOT_READY_MESSAGE,
} from "@/context/accountWallets";
import { useFundingLifiExecution } from "@/features/trading/lifi/useFundingLifiExecution";
import type { RouteLeg } from "./sor-types";
import type { SorExecutionPhase, SorLegRouteContext } from "./useSorExecution";
import { dispatchSorLeg } from "../execute/dispatchLeg";
import { runBridgePrefund } from "../prefund/runBridgePrefund";
import type { UseSorLegExecutorDeps } from "../execute/deps";
import type { SorBridgeResult, SorLegResult } from "../execute/types";

export type { UseSorLegExecutorDeps } from "../execute/deps";

export function useSorLegExecutor(deps: UseSorLegExecutorDeps) {
	const { venueAddressChainMap, walletGate, reportExecutionPhaseRef } = deps;

	const resolveFundingAddresses = useCallback(() => {
		const vacm = requireVenueAddressChainMapForExecute(venueAddressChainMap, walletGate);
		return walletRolesFromVenueAddressChainMap(vacm);
	}, [venueAddressChainMap, walletGate]);

	const legResultForWalletNotReady = useCallback(
		(err: unknown): SorLegResult => ({
			filled: false,
			filledShares: 0,
			error: err instanceof Error ? err.message : ACCOUNT_WALLETS_NOT_READY_MESSAGE,
		}),
		[],
	);

	const { getSignerForChain, preparePolygonRelay, buildExecuteLifiStepsOptions } =
		useFundingLifiExecution();

	const { sendTransaction: privyEvmSendTransaction } = useSendTransaction();

	const reportSorExecutionPhase = (phase: SorExecutionPhase) => {
		reportExecutionPhaseRef?.current?.(phase);
	};

	const executeLeg = useCallback(
		async (
			leg: RouteLeg,
			side: "buy" | "sell" = "buy",
			routeCtx?: SorLegRouteContext,
		): Promise<SorLegResult> => {
			let fundingAddresses;
			try {
				fundingAddresses = resolveFundingAddresses();
			} catch (err: unknown) {
				console.error("error", err);
				return legResultForWalletNotReady(err);
			}

			return dispatchSorLeg({
				leg,
				side,
				routeCtx,
				fundingAddresses,
				deps,
				reportSorExecutionPhase,
				privyEvmSendTransaction,
			});
		},
		[deps, resolveFundingAddresses, legResultForWalletNotReady, privyEvmSendTransaction],
	);

	const executeBridge = useCallback(
		async (
			leg: RouteLeg,
			opts?: {
				amountUsdOverride?: number;
				budgetUsdOverride?: number;
				onPrefundProgress?: (p: { current: number; total: number }) => void;
				strictLifiDestMinAtSendCap?: boolean;
			},
		): Promise<SorBridgeResult> => {
			let fundingAddresses;
			try {
				fundingAddresses = resolveFundingAddresses();
			} catch (err: unknown) {
				console.error("error", err);
				return {
					success: false,
					error: err instanceof Error ? err.message : ACCOUNT_WALLETS_NOT_READY_MESSAGE,
				};
			}

			return runBridgePrefund({
				leg,
				fundingAddresses,
				opts,
				deps,
				reportSorExecutionPhase,
				privyEvmSendTransaction,
				getSignerForChain,
				preparePolygonRelay,
				buildExecuteLifiStepsOptions,
			});
		},
		[
			deps,
			resolveFundingAddresses,
			getSignerForChain,
			preparePolygonRelay,
			buildExecuteLifiStepsOptions,
			privyEvmSendTransaction,
		],
	);

	return useMemo(() => ({ executeLeg, executeBridge }), [executeLeg, executeBridge]);
}
