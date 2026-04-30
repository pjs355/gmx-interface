import { useEffect, useRef } from "react";

export type UseReadinessGatesArgs = {
	account: string | null | undefined;
	effectiveAccount: string | null;

	// Top-level context loading flags
	predictionLoading: boolean;
	userDataLoading: boolean;
	portfolioLoading: boolean;
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
};

export type UseReadinessGatesResult = {
	isDataFullyLoaded: boolean;
	isPositionsTabContentReady: boolean;
	isHistoryTabContentReady: boolean;
	venueTradeHistoryLoading: boolean;
	positionsShellBypassMaxWaitMs: number;
};

/**
 * Full-page Positions shell bypass (`Positions.tsx`): after this delay with the strict shell
 * still up, we show partial data so Poly/Predict are not blocked by a slow DFlow stack.
 *
 * DFlow path = paginated `GET /api/dflow/onchain-trades` + `filter_outcome_mints` + parallel
 * (`markets/batch` + batched Solana Token-2022 reads). Public RPC can be slow; keep the
 * skeleton up longer **only while** `dflowPositionsQuery.isPending` so verified Kalshi users
 * see fewer empty-state flashes. Other venues stay on the shorter budget.
 */
const POSITIONS_SHELL_BYPASS_MS_DEFAULT = 5_000;
const POSITIONS_SHELL_BYPASS_MS_DFLOW_PENDING = 10_000;

export function useReadinessGates({
	account,
	effectiveAccount,
	predictionLoading,
	userDataLoading,
	portfolioLoading,
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
}: UseReadinessGatesArgs): UseReadinessGatesResult {
	/**
	 * After the Positions shell has gone strict-ready once for this `account`, do not drop back
	 * into the full-page skeleton when `predictMarketsQuery` re-keys (e.g. filled orders / matches
	 * widen `predictMarketIds`). Rows reconcile in place instead.
	 */
	const positionsDataFullyLoadedLatchForRef = useRef<string | null>(null);
	const positionsTabReadyLatchForRef = useRef<string | null>(null);
	const historyTabReadyLatchForRef = useRef<string | null>(null);

	// --- Atomic loading gate: core portfolio + venue positions (not History-only feeds) ---
	// Polymarket activity / Limitless portfolio **history** APIs must not block the global shell —
	// History tab uses `isHistoryTabContentReady` (see Positions.tsx).
	// Match PortfolioContext: only wait on DFlow when `useDflowPositions` is actually enabled.
	const dflowVenueSettled =
		!dflowRpcEnabled || !dflowPositionsQueryIsPending;

	const limitlessVenueSettled =
		!limitlessPortfolioEnabled ||
		(!limitlessVenuePositionsQueryIsLoading &&
			!limitlessOpenOrdersQueryIsLoading);

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
	// If perf logs show this dominates, prefer backend batching or accept that tradeoff explicitly.
	const strictIsDataFullyLoaded =
		!predictionLoading &&
		!userDataLoading &&
		!portfolioLoading &&
		venueQueriesSettled &&
		(predictMarketIdsLength === 0 || !predictMarketsQueryIsLoading);

	/** Positions tab: same shell for header + body — includes DFlow when verified (no second skeleton strip). */
	const strictIsPositionsTabContentReady =
		!predictionLoading &&
		!userDataLoading &&
		!portfolioLoading &&
		venueQueriesSettledForPositionsBody &&
		dflowVenueSettled &&
		(predictMarketIdsLength === 0 || !predictMarketsQueryIsLoading);

	const positionsShellBypassMaxWaitMs =
		dflowRpcEnabled && dflowPositionsQueryIsPending
			? POSITIONS_SHELL_BYPASS_MS_DFLOW_PENDING
			: POSITIONS_SHELL_BYPASS_MS_DEFAULT;

	/** Trade history streams (Poly + Limitless) for the History tab; not part of global `isDataFullyLoaded`. */
	const venueTradeHistoryLoading =
		(Boolean(polymarketSafe?.trim()) &&
			!polyTradeHistoryQueryIsFetched &&
			!polyTradeHistoryQueryIsError) ||
		(Boolean(limitlessMakerBase?.trim()) &&
			!limitlessTradeHistoryQueryIsFetched &&
			!limitlessTradeHistoryQueryIsError);

	/** Single gate for History body + header: core data, funding addresses, activity history, batch resolve. */
	const strictIsHistoryTabContentReady =
		strictIsDataFullyLoaded &&
		!fundingAddressesLoading &&
		!venueTradeHistoryLoading &&
		historyUmbrellaResolveSettled;

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
		strictIsDataFullyLoaded ||
		positionsDataFullyLoadedLatchForRef.current === account;
	const isPositionsTabContentReady =
		strictIsPositionsTabContentReady ||
		positionsTabReadyLatchForRef.current === account;
	const isHistoryTabContentReady =
		strictIsHistoryTabContentReady ||
		historyTabReadyLatchForRef.current === account;

	/**
	 * Slim DEV-only gate trace: prints the mirrored shell blockers from `Positions.tsx`
	 * (`pageShellLoading`) whenever the readiness fingerprint changes. Mirrors
	 * `isPositionsTabContentReady` / `isHistoryTabContentReady` so a skeleton flash on dev
	 * is easy to attribute to a specific blocker. Production: no-op.
	 */
	const positionsLoadingGateFingerprintRef = useRef("");
	useEffect(() => {
		if (!import.meta.env.DEV) return;
		if (!effectiveAccount) return;

		const positionsShellBlockers: string[] = [];
		if (predictionLoading) positionsShellBlockers.push("predictionLoading");
		if (userDataLoading) positionsShellBlockers.push("userDataLoading");
		if (portfolioLoading) positionsShellBlockers.push("portfolioLoading");
		if (polyPositionsQueryIsLoading)
			positionsShellBlockers.push("polyPositionsQuery.isLoading");
		if (predictPositionsQueryIsLoading) {
			positionsShellBlockers.push("predictPositionsQuery.isLoading");
		}
		if (limitlessPortfolioEnabled && limitlessVenuePositionsQueryIsLoading) {
			positionsShellBlockers.push("limitlessVenuePositionsQuery.isLoading");
		}
		if (dflowRpcEnabled && dflowPositionsQueryIsPending) {
			// Coupled to `positionsShellBypassMaxWaitMs` (10s shell grace while DFlow loads).
			positionsShellBlockers.push("dflowPositionsQuery.isPending");
		}
		if (predictMarketIdsLength > 0 && predictMarketsQueryIsLoading) {
			positionsShellBlockers.push("predictMarketsQuery.isLoading");
		}

		const historyShellBlockers: string[] = [];
		if (!isDataFullyLoaded) historyShellBlockers.push("!isDataFullyLoaded");
		if (fundingAddressesLoading)
			historyShellBlockers.push("fundingAddressesLoading");
		if (venueTradeHistoryLoading)
			historyShellBlockers.push("venueTradeHistoryLoading");
		if (!historyUmbrellaResolveSettled) {
			historyShellBlockers.push("!historyUmbrellaResolveSettled");
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
		console.log("[positions-gate]", {
			wallet,
			positionsShellBlockers:
				positionsShellBlockers.join(" · ") || "(none)",
			historyShellBlockers: historyShellBlockers.join(" · ") || "(none)",
			isDataFullyLoaded,
			isPositionsTabContentReady,
			isHistoryTabContentReady,
		});
	}, [
		effectiveAccount,
		predictionLoading,
		userDataLoading,
		portfolioLoading,
		polyPositionsQueryIsLoading,
		predictPositionsQueryIsLoading,
		limitlessPortfolioEnabled,
		limitlessVenuePositionsQueryIsLoading,
		dflowRpcEnabled,
		dflowPositionsQueryIsPending,
		predictMarketIdsLength,
		predictMarketsQueryIsLoading,
		fundingAddressesLoading,
		venueTradeHistoryLoading,
		historyUmbrellaResolveSettled,
		isDataFullyLoaded,
		isPositionsTabContentReady,
		isHistoryTabContentReady,
	]);

	return {
		isDataFullyLoaded,
		isPositionsTabContentReady,
		isHistoryTabContentReady,
		venueTradeHistoryLoading,
		positionsShellBypassMaxWaitMs,
	};
}
