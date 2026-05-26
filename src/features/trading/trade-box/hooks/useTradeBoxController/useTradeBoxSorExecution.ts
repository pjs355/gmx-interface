/**
 * SOR route execution for the trade box (submit, prefund, post-trade sync).
 *
 * Owns `useSorLegExecutor`, execution phase UI state, Kalshi market-init timing,
 * and wires `handleSorExecuteRef` for the imperative test handle. Called from
 * `useTradeBoxController` only.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type { MatchedMarket } from "@/types/odds-monitor";
import {
	formatErrorForUser,
	userMessage,
	SOR_SMART_ROUTE_FAILED,
	formatExecutionNotReadyUserMessage,
} from "@/errors";
import { useSorExecution, type SorExecutionPhase } from "@/features/trading/sor";
import type { RoutePlan } from "@/features/trading/sor";
import {
	useSorLegExecutor,
	type UseSorLegExecutorDeps,
} from "@/features/trading/sor/core/useSorLegExecutor";
import { usePostTradeAccountSync } from "@/features/trading/sor/post-trade/usePostTradeAccountSync";
import {
	captureAccountReconcileSnapshot,
	type AccountReconcileSnapshot,
} from "@/features/trading/sor/post-trade/postTradeReconcile";
import {
	accountVenueKeysFromFilledExecutionLegs,
	filledExecutionHasLevelUp,
	routePlanLegsFingerprintMatch,
} from "@/features/trading/sor/post-trade/postTradeRouteAlign";
import {
	capturePostTradeBaseline,
	type PostTradeBaseline,
} from "@/features/trading/sor/post-trade/postTradeBaseline";
import { registerPendingDflowOutcomeMints } from "@/features/trading/venues/dflow/portfolio/pendingDflowOutcomeMints";
import { dflowOutcomeMintForRouteLeg } from "@/features/trading/venues/dflow/catalog/dflowRouteOutcomeMint";
import { requireVenueAddressChainMapForExecute } from "@/context/accountWallets";
import type { AccountDataVacmSlice } from "@/context/accountWallets";
import type { useAccountData, AccountLevelUpPositionsSlice } from "@/context/AccountDataContext";
import type { useCollateralTokens } from "context/CollateralTokenContext";
import type { TradeBoxHookSetState, TradeBoxHookState } from "../useTradeState";

export type UseTradeBoxSorExecutionCoreArgs = {
	sorLegExecutorDeps: UseSorLegExecutorDeps;
};

export function useTradeBoxSorExecutionCore(args: UseTradeBoxSorExecutionCoreArgs) {
	const sorReportExecutionPhaseRef = useRef<((phase: SorExecutionPhase) => void) | undefined>(
		undefined,
	);

	const sorExecutor = useSorLegExecutor({
		...args.sorLegExecutorDeps,
		reportExecutionPhaseRef: sorReportExecutionPhaseRef,
	});

	const sorExecution = useSorExecution({
		executeLeg: sorExecutor.executeLeg,
		executeBridge: sorExecutor.executeBridge,
		reportExecutionPhaseRef: sorReportExecutionPhaseRef,
	});

	return { sorExecution };
}

export type UseTradeBoxSorExecuteActionsArgs = {
	state: TradeBoxHookState;
	setState: TradeBoxHookSetState;
	market: PredictionMarket;
	matchedMonitor: MatchedMarket | null | undefined;
	sorQuestionId: string | undefined;
	sorExecution: ReturnType<typeof useSorExecution>;
	executableRoute: RoutePlan | null;
	executableLoading: boolean;
	executableError: string | null;
	executableErrorCode: string | null | undefined;
	venueAddressChainMap: AccountDataVacmSlice["venueAddressChainMap"];
	walletGate: AccountDataVacmSlice["walletGate"];
	accountData: ReturnType<typeof useAccountData>;
	collateralTokens: ReturnType<typeof useCollateralTokens>;
	predictPostTradeWallet: string | null | undefined;
	predictShareIdentityCtx: {
		predictFun: { tokenIdA?: string; tokenIdB?: string };
	} | null;
	yesBalance: number;
	noBalance: number;
	getMarketBalance: AccountLevelUpPositionsSlice["getMarketBalance"];
	readSideShares: AccountLevelUpPositionsSlice["readSideShares"];
	levelUpWallet: string | null;
	refetchMatchedMarkets: () => void;
	handleSorExecuteRef: MutableRefObject<(() => void) | null>;
};

export type UseTradeBoxSorExecuteActionsResult = {
	sorRouteExpired: boolean;
	handleSorExecute: () => void;
	dflowUninitAtSubmit: boolean;
};

export function useTradeBoxSorExecuteActions(
	args: UseTradeBoxSorExecuteActionsArgs,
): UseTradeBoxSorExecuteActionsResult {
	const {
		state,
		setState,
		market,
		matchedMonitor,
		sorQuestionId,
		sorExecution,
		executableRoute,
		executableLoading,
		executableError,
		executableErrorCode,
		venueAddressChainMap,
		walletGate,
		predictPostTradeWallet,
		predictShareIdentityCtx,
		yesBalance,
		noBalance,
		getMarketBalance,
		readSideShares,
		levelUpWallet,
		refetchMatchedMarkets,
		handleSorExecuteRef,
	} = args;

	const queryClient = useQueryClient();
	const postTradeAccountSync = usePostTradeAccountSync();
	const accountData = args.accountData;
	const collateralTokens = args.collateralTokens;

	const [sorRouteExpired, setSorRouteExpired] = useState(false);
	useEffect(() => {
		if (!executableRoute) {
			setSorRouteExpired(false);
			return;
		}
		const check = () => {
			if (executableRoute) {
				setSorRouteExpired(Date.now() > executableRoute.expiresAt);
			}
		};
		check();
		const timer = setInterval(check, 1000);
		return () => clearInterval(timer);
	}, [executableRoute]);

	const [dflowUninitAtSubmit, setDflowUninitAtSubmit] = useState(false);

	const DFLOW_FIRST_MINT_REFRESH_DELAYS_MS = useMemo(
		() => [0, 5_000, 15_000, 30_000, 60_000, 120_000],
		[],
	);
	const dflowFirstMintRefreshTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
	const cancelDflowFirstMintRefresh = useCallback(() => {
		for (const t of dflowFirstMintRefreshTimersRef.current) {
			clearTimeout(t);
		}
		dflowFirstMintRefreshTimersRef.current = [];
	}, []);
	const scheduleDflowFirstMintRefresh = useCallback(() => {
		cancelDflowFirstMintRefresh();
		for (const delay of DFLOW_FIRST_MINT_REFRESH_DELAYS_MS) {
			const handle = setTimeout(() => {
				refetchMatchedMarkets();
			}, delay);
			dflowFirstMintRefreshTimersRef.current.push(handle);
		}
	}, [DFLOW_FIRST_MINT_REFRESH_DELAYS_MS, cancelDflowFirstMintRefresh, refetchMatchedMarkets]);
	useEffect(() => () => cancelDflowFirstMintRefresh(), [cancelDflowFirstMintRefresh]);

	const latestBaselineRef = useRef<{
		routeId: string;
		baseline: PostTradeBaseline;
		route: RoutePlan;
	} | null>(null);
	const preTradeSnapshotRef = useRef<AccountReconcileSnapshot | null>(null);

	const handleSorExecute = useCallback(() => {
		let vacm;
		try {
			vacm = requireVenueAddressChainMapForExecute(venueAddressChainMap, walletGate);
		} catch (err: unknown) {
			console.error("error", err);
			setState((prev) => ({
				...prev,
				orderResult: {
					success: false,
					error:
						err instanceof Error ? err.message : "Finishing wallet setup. Try again in a moment.",
				},
			}));
			return;
		}
		if (executableRoute && !sorRouteExpired) {
			const tv = state.tradingVenue;
			const legsMatchVenueTab = tv === "all" || executableRoute.legs.every((l) => l.venue === tv);
			if (!legsMatchVenueTab) {
				console.error("[SOR] execute blocked: route legs do not match selected venue tab", {
					tradingVenue: tv,
					legVenues: executableRoute.legs.map((l) => l.venue),
					routeId: executableRoute.routeId,
				});
				setState((prev) => ({
					...prev,
					orderResult: {
						success: false,
						error: "Venue mismatch — wait for the quote to refresh, then try again.",
					},
				}));
				return;
			}
			console.debug("[SOR] Trade button → execute", executableRoute.routeId);
			const dflowLink = matchedMonitor?.dflow;
			const dflowExecutedLegNeedsMarketInit =
				Boolean(dflowLink) &&
				executableRoute.legs.some((leg) => {
					if (leg.venue !== "dflow" || !dflowLink) return false;
					const initialized =
						leg.outcome === "A" ? dflowLink.accountsInitializedA : dflowLink.accountsInitializedB;
					return initialized === false;
				});
			setDflowUninitAtSubmit(dflowExecutedLegNeedsMarketInit);
			const marketId = sorQuestionId;
			const v = vacm;
			const baseline = capturePostTradeBaseline({
				queryClient,
				route: executableRoute,
				addresses: {
					polymarketSafe: v.polymarket.walletAddress,
					predictWallet: predictPostTradeWallet,
					solanaAddress: v.dflow.walletAddress,
				},
				levelUp: marketId
					? {
							marketId,
							yesBalance: Number.isFinite(yesBalance) ? yesBalance : 0,
							noBalance: Number.isFinite(noBalance) ? noBalance : 0,
						}
					: null,
				shareIdentityCtx: predictShareIdentityCtx,
			});
			latestBaselineRef.current = {
				routeId: executableRoute.routeId,
				baseline,
				route: executableRoute,
			};
			const midCap = sorQuestionId;
			preTradeSnapshotRef.current = captureAccountReconcileSnapshot({
				positions: accountData.positions,
				cashTotal: accountData.cash.total,
				accountVersion: accountData.accountVersion,
				readLevelUpSide: (mid, side) => readSideShares(mid, side),
				levelUpMarketId: midCap?.trim() ?? null,
			});
			void sorExecution
				.execute(executableRoute)
				.then((res) => {
					if (res == null) {
						console.error("[SOR] execute settled: null result (execute ignored or bug)");
						return;
					}
					const summary = {
						routeId: res.routeId,
						status: res.status,
						totalFilledShares: res.totalFilledShares,
						totalSpent: res.totalSpent,
						remainingBudget: res.remainingBudget,
						legs: res.legs.map((l) => ({
							venue: l.venue,
							legStatus: l.status,
							shares: l.shares,
							filledShares: l.filledShares,
							error: l.error ?? null,
							txHash: l.txHash ?? null,
							bridgeTxHash: l.bridgeTxHash ?? null,
						})),
					};
					console.debug("[SOR] execute settled", summary);
					if (res.status !== "complete") {
						const legLine = res.legs
							.map((l) => `${l.venue}(${l.status}${l.error ? `: ${l.error}` : ""})`)
							.join(" | ");
						console.error(`[SOR] execute not complete — status=${res.status} | ${legLine}`);
					}
				})
				.catch((err: unknown) => {
					console.error("[SOR] execute rejected", err);
					setState((prev) => ({
						...prev,
						orderResult: {
							success: false,
							error: (() => {
								const formatted = formatErrorForUser(err);
								return formatted === "Request failed"
									? userMessage(SOR_SMART_ROUTE_FAILED)
									: formatted;
							})(),
						},
					}));
				});
			return;
		}
		setState((prev) => ({
			...prev,
			orderResult: {
				success: false,
				error: sorRouteExpired
					? "Odds expired. Wait for refresh, then try again."
					: executableErrorCode === "EXECUTION_NOT_READY"
						? formatExecutionNotReadyUserMessage({
								serverError: executableError,
								venueRequirements: executableRoute?.venueRequirements,
							})
						: executableError?.trim()
							? executableError
							: executableLoading
								? "Still finding the best route…"
								: "No route available. Try a different amount or venue.",
			},
		}));
	}, [
		executableRoute,
		sorRouteExpired,
		executableError,
		executableLoading,
		executableErrorCode,
		sorExecution.execute,
		setState,
		queryClient,
		accountData,
		venueAddressChainMap,
		walletGate,
		predictPostTradeWallet,
		predictShareIdentityCtx,
		sorQuestionId,
		yesBalance,
		noBalance,
		matchedMonitor,
		state.tradingVenue,
	]);

	useEffect(() => {
		handleSorExecuteRef.current = handleSorExecute;
		return () => {
			if (handleSorExecuteRef.current === handleSorExecute) {
				handleSorExecuteRef.current = null;
			}
		};
	}, [handleSorExecute, handleSorExecuteRef]);

	const prevSorExecutingRef = useRef(false);
	useEffect(() => {
		const wasExecuting = prevSorExecutingRef.current;
		prevSorExecutingRef.current = sorExecution.isExecuting;

		if (!(wasExecuting && !sorExecution.isExecuting && sorExecution.execution)) {
			return;
		}

		const { status, legs, routeId } = sorExecution.execution;

		const everyLegFilled = legs.length > 0 && legs.every((l) => l.status === "filled");

		if (status === "complete" && everyLegFilled) {
			const hasDflowFilledLeg = legs.some(
				(l) => l.venue === "dflow" && l.status === "filled" && l.filledShares > 0,
			);
			if (hasDflowFilledLeg) {
				void queryClient.invalidateQueries({ queryKey: ["dflow-positions"] });
				void queryClient.invalidateQueries({
					queryKey: ["dflow-outcome-balance"],
				});
			}

			const syncUiKey =
				String(
					(market as { _id?: string })?._id ??
						(market as { questionId?: string })?.questionId ??
						"",
				).trim() || null;

			const cached = latestBaselineRef.current;
			if (cached) {
				for (let i = 0; i < legs.length; i++) {
					const rl = cached.route.legs[i];
					const el = legs[i];
					if (rl?.venue === "dflow" && el?.status === "filled" && el.filledShares > 0) {
						const m = dflowOutcomeMintForRouteLeg(rl);
						if (m) registerPendingDflowOutcomeMints([m]);
					}
				}
			}

			const postTradeCommon = {
				queryClient,
				addresses: {
					polymarketSafe: venueAddressChainMap!.polymarket.walletAddress,
					predictWallet: predictPostTradeWallet,
					solanaAddress: venueAddressChainMap!.dflow.walletAddress,
				},
				levelUpWallet,
				refetchCollateral: collateralTokens.refetch,
				readLevelUpSide: (mid: string, side: "yes" | "no") => readSideShares(mid, side),
				syncUiKey,
				shareIdentityCtx: predictShareIdentityCtx,
			} as const;

			const canUseCachedBaseline =
				cached &&
				(cached.routeId === routeId ||
					routePlanLegsFingerprintMatch(cached.route, sorExecution.execution));

			if (canUseCachedBaseline && cached) {
				postTradeAccountSync.runAfterSorFilled({
					...postTradeCommon,
					route: cached.route,
					execution: sorExecution.execution,
					baseline: cached.baseline,
					operationId: crypto.randomUUID(),
					preTradeSnapshot: preTradeSnapshotRef.current,
				});
			} else {
				const accountVenues = accountVenueKeysFromFilledExecutionLegs(legs);
				const includeLevelUpRpc = filledExecutionHasLevelUp(legs);
				if (accountVenues.length > 0 || includeLevelUpRpc) {
					postTradeAccountSync.startBlindBalanceRefresh({
						queryClient,
						syncUiKey,
						accountVenues,
						includeLevelUpRpc,
						levelUpWallet,
					});
				} else if (import.meta.env.DEV) {
					console.warn(
						"[PostTradeAccountSync] no baseline match and nothing to blind-refresh — skipping",
						{ routeId, cachedRouteId: cached?.routeId },
					);
				}
			}

			preTradeSnapshotRef.current = null;
			if (dflowUninitAtSubmit) {
				scheduleDflowFirstMintRefresh();
			}

			latestBaselineRef.current = null;
			setState((s) => ({ ...s, amount: "", orderResult: { success: true } }));
			sorExecution.resetExecution();
		} else if (status === "failed" || status === "partial" || !everyLegFilled) {
			latestBaselineRef.current = null;
			setDflowUninitAtSubmit(false);
			const failedLeg = legs.find((l) => l.status === "failed");
			setState((s) => ({
				...s,
				orderResult: {
					success: false,
					error:
						failedLeg?.error ??
						(status === "partial"
							? "Part of the smart route did not fill. Check balances and positions."
							: "Smart route did not complete."),
				},
			}));
		}
	}, [
		sorExecution.isExecuting,
		sorExecution.execution,
		sorExecution.resetExecution,
		queryClient,
		setState,
		levelUpWallet,
		collateralTokens,
		venueAddressChainMap,
		walletGate,
		predictPostTradeWallet,
		predictShareIdentityCtx,
		market,
		postTradeAccountSync,
		readSideShares,
		getMarketBalance,
		dflowUninitAtSubmit,
		scheduleDflowFirstMintRefresh,
	]);

	return {
		sorRouteExpired,
		handleSorExecute,
		dflowUninitAtSubmit,
	};
}
