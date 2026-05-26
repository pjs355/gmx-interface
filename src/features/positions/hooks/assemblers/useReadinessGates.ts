import { useEffect, useRef, useState } from "react";

import { isTradingDebugLoggingEnabled } from "@/config/tradingDebug";

/** After reverse umbrella lookup settles, hold skeletons briefly so merged display names + images are stable (Positions + History). */
const POSITIONS_TAB_UMBRELLA_REVERSE_HOLD_MS = 1_000;

export type UseReadinessGatesArgs = {
	account: string | null | undefined;
	effectiveAccount: string | null;

	authenticated: boolean;
	/** Trimmed Solana address from VACM (`AccountDataContext`); when set, DFlow proof must resolve before positions paint. */
	solanaLinked: boolean;
	dflowProofIsFetched: boolean;
	fundingHydrated: boolean;

	// Top-level context loading flags
	predictionLoading: boolean;
	userDataLoading: boolean;
	positionsSummaryLoading: boolean;
	fundingAddressesLoading: boolean;

	// Venue position query state (raw booleans)
	polyPositionsQueryIsLoading: boolean;
	predictPositionsQueryIsLoading: boolean;
	predictMarketIdsLength: number;
	predictMarketsQueryIsLoading: boolean;

	dflowRpcEnabled: boolean;
	dflowPositionsQueryIsPending: boolean;

	limitlessPortfolioEnabled: boolean;
	limitlessVenuePositionsQueryIsLoading: boolean;
	limitlessOpenOrdersQueryIsLoading: boolean;

	// History tab gates
	polymarketSafe: string | undefined | null;
	polyTradeHistoryQueryIsFetched: boolean;
	polyTradeHistoryQueryIsError: boolean;
	limitlessMakerBase: string | undefined | null;
	limitlessTradeHistoryQueryIsFetched: boolean;
	limitlessTradeHistoryQueryIsError: boolean;
	historyUmbrellaResolveSettled: boolean;
	/** Rows that need `POST /api/umbrellas/resolve-venue-history`; when > 0, Positions + History wait for settle + short paint hold. */
	venueHistoryResolveQueryCount: number;
};

export type UseReadinessGatesResult = {
	isDataFullyLoaded: boolean;
	isPositionsTabContentReady: boolean;
	isHistoryTabContentReady: boolean;
	venueTradeHistoryLoading: boolean;
};

export function useReadinessGates({
	account,
	effectiveAccount,
	authenticated,
	solanaLinked,
	dflowProofIsFetched,
	fundingHydrated,
	predictionLoading,
	userDataLoading,
	positionsSummaryLoading,
	fundingAddressesLoading,
	polyPositionsQueryIsLoading,
	predictPositionsQueryIsLoading,
	predictMarketIdsLength,
	predictMarketsQueryIsLoading,
	dflowRpcEnabled,
	dflowPositionsQueryIsPending,
	limitlessPortfolioEnabled,
	limitlessVenuePositionsQueryIsLoading,
	limitlessOpenOrdersQueryIsLoading,
	polymarketSafe,
	polyTradeHistoryQueryIsFetched,
	polyTradeHistoryQueryIsError,
	limitlessMakerBase,
	limitlessTradeHistoryQueryIsFetched,
	limitlessTradeHistoryQueryIsError,
	historyUmbrellaResolveSettled,
	venueHistoryResolveQueryCount,
}: UseReadinessGatesArgs): UseReadinessGatesResult {
	/**
	 * After the Positions shell has gone strict-ready once for this `account`, do not drop back
	 * into the full-page skeleton when `predictMarketsQuery` re-keys (e.g. filled orders / matches
	 * widen `predictMarketIds`). Rows reconcile in place instead.
	 */
	const positionsDataFullyLoadedLatchForRef = useRef<string | null>(null);
	const positionsTabReadyLatchForRef = useRef<string | null>(null);
	const historyTabReadyLatchForRef = useRef<string | null>(null);

	const [positionsUmbrellaReverseHoldDone, setPositionsUmbrellaReverseHoldDone] = useState(false);

	useEffect(() => {
		if (!account) {
			setPositionsUmbrellaReverseHoldDone(true);
			return;
		}
		if (venueHistoryResolveQueryCount === 0) {
			setPositionsUmbrellaReverseHoldDone(true);
			return;
		}
		if (!historyUmbrellaResolveSettled) {
			setPositionsUmbrellaReverseHoldDone(false);
			return;
		}
		setPositionsUmbrellaReverseHoldDone(false);
		const t = window.setTimeout(
			() => setPositionsUmbrellaReverseHoldDone(true),
			POSITIONS_TAB_UMBRELLA_REVERSE_HOLD_MS,
		);
		return () => window.clearTimeout(t);
	}, [account, venueHistoryResolveQueryCount, historyUmbrellaResolveSettled]);

	const umbrellaVenueHistoryReversePaintReady =
		venueHistoryResolveQueryCount === 0 ||
		(historyUmbrellaResolveSettled && positionsUmbrellaReverseHoldDone);

	// --- DFlow: do not treat the venue as "settled" while proof is still in flight ---
	// When `dflowRpcEnabled` is false only because `/dflow/account` has not returned yet, the old
	// `!dflowRpcEnabled` shortcut falsely marked DFlow settled and latched the tab before rows loaded.
	const dflowProofPending = authenticated && solanaLinked && !dflowProofIsFetched;
	const dflowPositionsPending = dflowRpcEnabled && dflowPositionsQueryIsPending;
	const dflowVenueSettled = !dflowProofPending && !dflowPositionsPending;

	const limitlessVenueSettled =
		!limitlessPortfolioEnabled ||
		(!limitlessVenuePositionsQueryIsLoading && !limitlessOpenOrdersQueryIsLoading);

	const venueQueriesSettled =
		!polyPositionsQueryIsLoading &&
		!predictPositionsQueryIsLoading &&
		dflowVenueSettled &&
		limitlessVenueSettled;

	const venueQueriesSettledForPositionsBody =
		!polyPositionsQueryIsLoading &&
		!predictPositionsQueryIsLoading &&
		(!limitlessPortfolioEnabled || !limitlessVenuePositionsQueryIsLoading);

	// `predictMarketsQuery` stays in this gate on purpose: without market details, Predict rows
	// would all appear under active Positions first, then jump to Winnings when RESOLVED — bad UX.
	const fundingAndCoreReady =
		fundingHydrated && !predictionLoading && !userDataLoading && !positionsSummaryLoading;

	const strictIsDataFullyLoaded =
		fundingAndCoreReady &&
		venueQueriesSettled &&
		(predictMarketIdsLength === 0 || !predictMarketsQueryIsLoading);

	const strictIsPositionsTabContentReady =
		fundingAndCoreReady &&
		venueQueriesSettledForPositionsBody &&
		dflowVenueSettled &&
		(predictMarketIdsLength === 0 || !predictMarketsQueryIsLoading) &&
		umbrellaVenueHistoryReversePaintReady;

	/** Trade history streams (Poly + Limitless) for the History tab; not part of global `isDataFullyLoaded`. */
	const venueTradeHistoryLoading =
		(Boolean(polymarketSafe?.trim()) &&
			!polyTradeHistoryQueryIsFetched &&
			!polyTradeHistoryQueryIsError) ||
		(Boolean(limitlessMakerBase?.trim()) &&
			!limitlessTradeHistoryQueryIsFetched &&
			!limitlessTradeHistoryQueryIsError);

	/** Single gate for History body + header: core data, funding addresses, activity history, batch resolve + paint hold. */
	const strictIsHistoryTabContentReady =
		strictIsDataFullyLoaded &&
		!fundingAddressesLoading &&
		!venueTradeHistoryLoading &&
		umbrellaVenueHistoryReversePaintReady;

	useEffect(() => {
		positionsDataFullyLoadedLatchForRef.current = null;
		positionsTabReadyLatchForRef.current = null;
		historyTabReadyLatchForRef.current = null;
	}, [account]);

	useEffect(() => {
		if (!account) return;
		if (strictIsDataFullyLoaded) {
			positionsDataFullyLoadedLatchForRef.current = account;
		}
		if (strictIsPositionsTabContentReady) {
			positionsTabReadyLatchForRef.current = account;
		}
		if (strictIsHistoryTabContentReady) {
			historyTabReadyLatchForRef.current = account;
		}
	}, [
		account,
		strictIsDataFullyLoaded,
		strictIsPositionsTabContentReady,
		strictIsHistoryTabContentReady,
	]);

	const isDataFullyLoaded =
		strictIsDataFullyLoaded || positionsDataFullyLoadedLatchForRef.current === account;
	const isPositionsTabContentReady =
		strictIsPositionsTabContentReady || positionsTabReadyLatchForRef.current === account;
	const isHistoryTabContentReady =
		strictIsHistoryTabContentReady || historyTabReadyLatchForRef.current === account;

	const positionsLoadingGateFingerprintRef = useRef("");
	useEffect(() => {
		if (!import.meta.env.DEV) return;
		if (!effectiveAccount) return;

		const positionsShellBlockers: string[] = [];
		if (!fundingHydrated) positionsShellBlockers.push("!fundingHydrated");
		if (predictionLoading) positionsShellBlockers.push("predictionLoading");
		if (userDataLoading) positionsShellBlockers.push("userDataLoading");
		if (positionsSummaryLoading) positionsShellBlockers.push("positionsSummaryLoading");
		if (polyPositionsQueryIsLoading) positionsShellBlockers.push("polyPositionsQuery.isLoading");
		if (predictPositionsQueryIsLoading) {
			positionsShellBlockers.push("predictPositionsQuery.isLoading");
		}
		if (limitlessPortfolioEnabled && limitlessVenuePositionsQueryIsLoading) {
			positionsShellBlockers.push("limitlessVenuePositionsQuery.isLoading");
		}
		if (dflowProofPending) {
			positionsShellBlockers.push("dflowProofPending");
		}
		if (dflowPositionsPending) {
			positionsShellBlockers.push("dflowPositionsQuery.isPending");
		}
		if (predictMarketIdsLength > 0 && predictMarketsQueryIsLoading) {
			positionsShellBlockers.push("predictMarketsQuery.isLoading");
		}
		if (!umbrellaVenueHistoryReversePaintReady) {
			if (!historyUmbrellaResolveSettled) {
				positionsShellBlockers.push("!historyUmbrellaResolveSettled");
			} else if (!positionsUmbrellaReverseHoldDone) {
				positionsShellBlockers.push("positionsUmbrellaReverseHold");
			}
		}

		const historyShellBlockers: string[] = [];
		if (!isDataFullyLoaded) historyShellBlockers.push("!isDataFullyLoaded");
		if (fundingAddressesLoading) historyShellBlockers.push("fundingAddressesLoading");
		if (venueTradeHistoryLoading) historyShellBlockers.push("venueTradeHistoryLoading");
		if (!umbrellaVenueHistoryReversePaintReady) {
			if (!historyUmbrellaResolveSettled) {
				historyShellBlockers.push("!historyUmbrellaResolveSettled");
			} else {
				historyShellBlockers.push("umbrellaReversePaintHold");
			}
		}

		const fingerprint = [
			positionsShellBlockers.join(","),
			historyShellBlockers.join(","),
			String(isDataFullyLoaded),
			String(isPositionsTabContentReady),
			String(isHistoryTabContentReady),
		].join("|");

		if (fingerprint === positionsLoadingGateFingerprintRef.current) return;
		positionsLoadingGateFingerprintRef.current = fingerprint;

		const wallet =
			effectiveAccount.length >= 10
				? `${effectiveAccount.slice(0, 6)}…${effectiveAccount.slice(-4)}`
				: effectiveAccount;
		if (isTradingDebugLoggingEnabled()) {
			console.log("[positions-gate]", {
				wallet,
				positionsShellBlockers: positionsShellBlockers.join(" · ") || "(none)",
				historyShellBlockers: historyShellBlockers.join(" · ") || "(none)",
				isDataFullyLoaded,
				isPositionsTabContentReady,
				isHistoryTabContentReady,
			});
		}
	}, [
		effectiveAccount,
		fundingHydrated,
		predictionLoading,
		userDataLoading,
		positionsSummaryLoading,
		polyPositionsQueryIsLoading,
		predictPositionsQueryIsLoading,
		limitlessPortfolioEnabled,
		limitlessVenuePositionsQueryIsLoading,
		dflowProofPending,
		dflowPositionsPending,
		predictMarketIdsLength,
		predictMarketsQueryIsLoading,
		fundingAddressesLoading,
		venueTradeHistoryLoading,
		historyUmbrellaResolveSettled,
		umbrellaVenueHistoryReversePaintReady,
		positionsUmbrellaReverseHoldDone,
		isDataFullyLoaded,
		isPositionsTabContentReady,
		isHistoryTabContentReady,
	]);

	return {
		isDataFullyLoaded,
		isPositionsTabContentReady,
		isHistoryTabContentReady,
		venueTradeHistoryLoading,
	};
}
