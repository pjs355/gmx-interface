import {
	useState,
	useCallback,
	useRef,
	useMemo,
	useEffect,
	useLayoutEffect,
	type MutableRefObject,
} from "react";
import { usePrivy, useIdentityToken } from "@privy-io/react-auth";
import { createSorApiClient } from "./sor-api";
import { validateLegMinimum } from "./sorPreflight";
import type {
	RoutePlan,
	RouteLeg,
	RouteExecution,
	SorVenue,
} from "./sor-types";
import { groupBridgeLegsByCorridor } from "./sorBridgeGroups";
import { LEG_OR_BRIDGE_TIMEOUT_MS } from "@/trading/sor/sorBridgeWallTimeBudget";
import { withTimeout } from "@/utils/withTimeout";
import {
	formatErrorForUser,
	userMessage,
	SOR_EXECUTION_FAILED_NO_MESSAGE,
	SOR_LEG_FAILED_NO_MESSAGE,
} from "@/errors";

/** Never return a blank leg error — empty messages hide the real failure in one-line SOR logs. */
function sorExecutionFailureMessage(err: unknown): string {
	const m = formatErrorForUser(err).trim();
	if (m.length > 0 && m !== "Request failed") return m;
	return userMessage(SOR_EXECUTION_FAILED_NO_MESSAGE);
}

function logDflowClientOrderSigning(
	route: RoutePlan,
	leg: RouteLeg,
	phase: "immediate" | "postBridge",
): void {
	if (leg.venue !== "dflow" || route.side !== "buy") return;
	const micro = Math.round(leg.executionAmountUsd * 1_000_000);
	const exp =
		typeof route.expiresAt === "number" && Number.isFinite(route.expiresAt)
			? route.expiresAt
			: null;
	const ttlMs = exp != null ? Math.max(0, exp - Date.now()) : null;
	console.log(
		`[SOR][DFlow] client-order-signing phase=${phase} routeId=${route.routeId} requestedAmount=${route.requestedAmount} execUsd=${leg.executionAmountUsd.toFixed(6)} shares=${leg.shares.toFixed(6)} amount_micro=${micro} routeTtlMs=${ttlMs ?? "n/a"}`,
	);
}

const RETRY_COUNT = 2;
const RETRY_DELAY_MS = 2000;
/**
 * Max wall time per bridge or leg — derived in `sorBridgeWallTimeBudget` so it stays
 * ≥ Limitless withdraw + quote iterations + LI.FI on-chain + status poll (and parallel sweep).
 */

export type LegExecutorResult = {
	filled: boolean;
	filledShares: number;
	txHash?: string;
	error?: string;
	/** DFlow: from successful POST submit (`initializedMarket`). */
	initializedMarket?: boolean;
	/** DFlow: HTTP 200 with `orderStatus.partialFill` (reverts + delivered output). */
	dflowPartialFill?: boolean;
};

export type SorLegRouteContext = {
	routeId: string;
	/** Server `RoutePlan.expiresAt` (epoch ms). Used to refuse stale DFlow quotes before GET /order. */
	expiresAtMs: number;
};

export type LegExecutor = (
	leg: RouteLeg,
	side?: "buy" | "sell",
	routeCtx?: SorLegRouteContext,
) => Promise<LegExecutorResult>;

/** LI.FI prefund hop index for UI (`current` is 1-based). */
export type SorPrefundLegProgress = { current: number; total: number };

export type BridgeExecutor = (
	leg: RouteLeg,
	opts?: {
		amountUsdOverride?: number;
		/**
		 * Strict source-debit ceiling for the corridor. Capping `sendHuman` at
		 * `min(walletBalance, budgetUsdOverride)` keeps source debit within the
		 * optimizer's per-corridor allocation regardless of wallet headroom.
		 */
		budgetUsdOverride?: number;
		/** Fired at the start of each `buildPrefundSteps` LI.FI hop (same-chain sweeps run inside that hop). */
		onPrefundProgress?: (p: SorPrefundLegProgress) => void;
		/**
		 * LevelUp collateral matches signed `makerAmount`; forbid LiFi send-cap slack that
		 * accepts quoted min-dest below nominal `destNeed`.
		 */
		strictLifiDestMinAtSendCap?: boolean;
	},
) => Promise<{
	success: boolean;
	bridgeTxHash?: string;
	error?: string;
}>;

/**
 * UI phase while `isExecuting` — LI.FI prefund, allowance prompts, and venue
 * order execution.
 */
export type SorExecutionPhase =
	| "idle"
	| "moving_funds"
	| "approving_funds_transfer"
	| "approving_trades"
	| "executing_trade";

export interface UseSorExecutionInput {
	executeLeg: LegExecutor;
	executeBridge: BridgeExecutor;
	/**
	 * Optional sink wired by the trade box: the hook assigns
	 * `ref.current = (phase) => …` so `useSorLegExecutor` can update labels during
	 * first-time token / venue approvals without importing this hook.
	 */
	reportExecutionPhaseRef?: MutableRefObject<
		((phase: SorExecutionPhase) => void) | undefined
	>;
}

export interface UseSorExecutionResult {
	execution: RouteExecution | null;
	isExecuting: boolean;
	/** Which long-running sub-step the user should see (only meaningful when `isExecuting`). */
	executionPhase: SorExecutionPhase;
	/**
	 * Set during LI.FI prefund (`moving_funds` / `approving_funds_transfer`) when
	 * there are multiple source hops; `null` otherwise.
	 */
	prefundLegProgress: SorPrefundLegProgress | null;
	execute: (route: RoutePlan) => Promise<RouteExecution | null>;
	remainingBudget: number | null;
	requestReroute: () => Promise<number | null>;
	acceptResult: () => Promise<void>;
	resetExecution: () => void;
}

function buildLocalExecution(
	route: RoutePlan,
	legResults: Map<
		string,
		{
			filled: boolean;
			filledShares: number;
			txHash?: string;
			error?: string;
			initializedMarket?: boolean;
			dflowPartialFill?: boolean;
		}
	>,
): RouteExecution {
	let totalFilledShares = 0;
	let totalSpent = 0;
	let allFilled = true;
	let anyFilled = false;

	const legs = route.legs.map((leg) => {
		const result = legResults.get(leg.venue);
		const filled = result?.filled ?? false;
		const filledShares = result?.filledShares ?? 0;

		if (filled) {
			anyFilled = true;
			totalFilledShares += filledShares;
			totalSpent += leg.executionAmountUsd;
		} else {
			allFilled = false;
		}

		const rawErr = result?.error?.trim();
		const errorForLeg =
			filled || !result
				? undefined
				: rawErr && rawErr.length > 0
					? rawErr
					: userMessage(SOR_LEG_FAILED_NO_MESSAGE);

		return {
			venue: leg.venue as SorVenue,
			status: result ? (filled ? "filled" as const : "failed" as const) : "pending" as const,
			shares: leg.shares,
			filledShares,
			txHash: result?.txHash,
			...(result?.initializedMarket === true
				? { initializedMarket: true as const }
				: {}),
			...(result?.dflowPartialFill === true
				? { dflowPartialFill: true as const }
				: {}),
			error: errorForLeg,
			updatedAt: Date.now(),
		};
	});

	let status: RouteExecution["status"];
	if (allFilled) status = "complete";
	else if (anyFilled) status = "partial";
	else if (legResults.size > 0) status = "failed";
	else status = "executing";

	const remainingBudget = route.requestedAmount - totalSpent;

	return {
		routeId: route.routeId,
		status,
		legs,
		totalFilledShares,
		totalSpent,
		createdAt: Date.now(),
		updatedAt: Date.now(),
		remainingBudget: remainingBudget > 0 ? remainingBudget : 0,
	};
}

export function useSorExecution(
	input: UseSorExecutionInput,
): UseSorExecutionResult {
	const { getAccessToken } = usePrivy();
	const { identityToken } = useIdentityToken();
	const { executeLeg, executeBridge, reportExecutionPhaseRef } = input;

	const identityTokenRef = useRef(identityToken);
	identityTokenRef.current = identityToken;

	const apiClient = useMemo(
		() =>
			createSorApiClient(
				async () => getAccessToken(),
				() => identityTokenRef.current ?? undefined,
			),
		[getAccessToken],
	);

	const [execution, setExecution] = useState<RouteExecution | null>(null);
	const [isExecuting, setIsExecuting] = useState(false);
	const [executionPhase, setExecutionPhase] = useState<SorExecutionPhase>("idle");
	const [prefundLegProgress, setPrefundLegProgress] =
		useState<SorPrefundLegProgress | null>(null);
	const [remainingBudget, setRemainingBudget] = useState<number | null>(null);
	const routeRef = useRef<RoutePlan | null>(null);
	const executingRef = useRef(false);
	const mountedRef = useRef(true);
	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);

	useLayoutEffect(() => {
		if (!reportExecutionPhaseRef) return;
		reportExecutionPhaseRef.current = (phase: SorExecutionPhase) => {
			if (!executingRef.current) return;
			if (mountedRef.current) setExecutionPhase(phase);
		};
		return () => {
			reportExecutionPhaseRef.current = undefined;
		};
	}, [reportExecutionPhaseRef]);

	const executeLegWithRetry = useCallback(
		async (
			leg: RouteLeg,
			retriesLeft: number,
			side: "buy" | "sell" = "buy",
			routeCtx?: SorLegRouteContext,
		): Promise<LegExecutorResult> => {
			try {
				const result = await executeLeg(leg, side, routeCtx);
				if (!result.filled && !(result.error?.trim())) {
					return {
						...result,
						error:
							"Venue returned filled=false with no error message — check useSorLegExecutor / Predict SDK logs for this venue.",
					};
				}
				return result;
			} catch (err) {
				if (retriesLeft > 0) {
					console.warn("[SOR] Retrying leg after error (transient upstream / timing)", {
						venue: leg.venue,
						retriesLeftBeforeThisAttempt: retriesLeft,
						message:
							err instanceof Error ? err.message : String(err),
					});
					await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
					return executeLegWithRetry(leg, retriesLeft - 1, side, routeCtx);
				}
				console.error("error", err);
				return {
					filled: false,
					filledShares: 0,
					error: sorExecutionFailureMessage(err),
				};
			}
		},
		[executeLeg],
	);

	const trySyncBackend = useCallback(
		async (fn: () => Promise<void>) => {
			try { await fn(); } catch (err) {
				if (import.meta.env.DEV) {
					console.warn("[SOR] Backend sync failed (non-blocking):", err);
				}
			}
		},
		[],
	);

	const execute = useCallback(
		async (route: RoutePlan): Promise<RouteExecution | null> => {
			if (executingRef.current) {
				console.warn("[SOR] execute ignored — already in progress");
				return null;
			}
			executingRef.current = true;
			routeRef.current = route;
			setIsExecuting(true);
			setExecutionPhase("executing_trade");
			setRemainingBudget(null);

			const isSell = route.side === "sell";
			const legResults = new Map<string, { filled: boolean; filledShares: number; txHash?: string; error?: string; initializedMarket?: boolean; dflowPartialFill?: boolean }>();

			// Pre-flight: reject routes whose legs violate venue protocol minimums
			// BEFORE bridging so users don't end up with dust stuck on the destination
			// chain. Failed legs are reported with friendly errors to the UI.
			for (const leg of route.legs) {
				const check = validateLegMinimum(leg, route.side);
				if (!check.ok) {
					legResults.set(leg.venue, {
						filled: false,
						filledShares: 0,
						error: check.error,
					});
				}
			}
			if (legResults.size === route.legs.length && route.legs.length > 0) {
				console.warn("[SOR] Pre-flight validation failed for every leg", {
					errors: Array.from(legResults.values()).map((r) => r.error),
				});
				const preflightExec = buildLocalExecution(route, legResults);
				if (preflightExec.status === "executing") {
					preflightExec.status = "failed";
				}
				if (mountedRef.current) setExecution(preflightExec);
				executingRef.current = false;
				setIsExecuting(false);
				setExecutionPhase("idle");
				return preflightExec;
			}

			if (route.side === "buy" && route.sufficientFunds === false) {
				const errMsg =
					"Insufficient funds for this route at the quoted size. Add USDC on the required chains (or complete prefund), refresh the route, then try again.";
				for (const leg of route.legs) {
					if (!legResults.has(leg.venue)) {
						legResults.set(leg.venue, {
							filled: false,
							filledShares: 0,
							error: errMsg,
						});
					}
				}
				const preflightExec = buildLocalExecution(route, legResults);
				if (preflightExec.status === "executing") {
					preflightExec.status = "failed";
				}
				if (mountedRef.current) setExecution(preflightExec);
				executingRef.current = false;
				setIsExecuting(false);
				setExecutionPhase("idle");
				console.warn("[SOR] Blocked execution: insufficientFunds buy route", {
					routeId: route.routeId,
				});
				return preflightExec;
			}

			if (route.side === "buy" && route.theoreticalLiquidity === true) {
				const errMsg =
					"This route uses a legacy preview flag. Refresh the trade sheet to fetch a new route, then try again.";
				for (const leg of route.legs) {
					if (!legResults.has(leg.venue)) {
						legResults.set(leg.venue, {
							filled: false,
							filledShares: 0,
							error: errMsg,
						});
					}
				}
				const preflightExec = buildLocalExecution(route, legResults);
				if (preflightExec.status === "executing") {
					preflightExec.status = "failed";
				}
				if (mountedRef.current) setExecution(preflightExec);
				executingRef.current = false;
				setIsExecuting(false);
				setExecutionPhase("idle");
				console.warn("[SOR] Blocked execution: legacy theoreticalLiquidity buy route", {
					routeId: route.routeId,
				});
				return preflightExec;
			}

			const initialExec = buildLocalExecution(route, legResults);
			if (mountedRef.current) setExecution(initialExec);

			trySyncBackend(() => apiClient.startExecution(route).then(() => {}));

			// Routine SOR trace: `console.debug` stays out of the default console level in Chromium
			// ("Verbose" shows it). Keep `console.warn` / `console.error` for real problems only.
			console.debug("[SOR] Execution started", {
				routeId: route.routeId,
				legs: route.legs.map((l) => l.venue),
				side: route.side,
			});

			const legPlanSummary = route.legs.map((l) => ({
				venue: l.venue,
				chain: l.chain,
				hasBridge: l.bridge != null,
				bridgeCorridor:
					l.bridge != null
						? `${l.bridge.fromChain}→${l.bridge.toChain}`
						: null,
				executionAmountUsd: l.executionAmountUsd,
			}));
			console.debug("[SOR] leg plan (LiFi prefund vs immediate venue)", legPlanSummary);

			if (route.side === "buy") {
				const dflowNoBridge = route.legs.filter(
					(l) => l.venue === "dflow" && !l.bridge,
				);
				if (dflowNoBridge.length > 0) {
					console.debug(
						"[SOR_PREFUND] DFlow legs with bridge=null are immediate legs: executeBridge (LiFi) does not run before them. SPL USDC must already be on the Solana embedded wallet for these amounts.",
						{
							routeId: route.routeId,
							executionAmountUsdByLeg: dflowNoBridge.map((l) => ({
								venue: l.venue,
								usd: l.executionAmountUsd,
							})),
						},
					);
				}
			}

			let result: RouteExecution | null = null;
			try {
				// Exclude legs that failed pre-flight validation from the execution loops;
				// they already have a failed entry in `legResults` and surface to the UI.
				const eligibleLegs = route.legs.filter((l) => !legResults.has(l.venue));
				const immediateLegs = isSell
					? eligibleLegs
					: eligibleLegs.filter((l) => !l.bridge);
				const bridgeLegs = isSell
					? []
					: eligibleLegs.filter((l) => !!l.bridge);

				// Do not start immediate legs until bridge groups settle — bridge corridors run
				// sequentially (aggregated per from→to), then venue legs, so we do not race LiFi
				// against POST /orders before USDC arrives. Limit buys that include a bridge hint use
				// the same bridge-first ordering as market buys.

				const bridgeGroups = groupBridgeLegsByCorridor(
					bridgeLegs,
					isSell ? "sell" : "buy",
				);
				for (const group of bridgeGroups) {
					console.debug("[SOR] Bridge start", {
						routeId: route.routeId,
						corridor: group.key,
						venues: group.legs.map((l) => l.venue),
						aggregatedUsd: group.totalAmountUsd,
					});
					if (mountedRef.current) {
						setExecutionPhase("moving_funds");
						setPrefundLegProgress(null);
					}
					let bridgeResult: Awaited<ReturnType<typeof executeBridge>>;
					try {
						bridgeResult = await withTimeout(
							executeBridge(group.representativeLeg, {
								amountUsdOverride: group.totalAmountUsd,
								budgetUsdOverride:
									group.totalAmountUsd + group.groupBridgeCostUsd,
								strictLifiDestMinAtSendCap: group.legs.some(
									(l) => l.venue === "levelup",
								),
								onPrefundProgress: (p) => {
									if (mountedRef.current) {
										setPrefundLegProgress(p);
									}
								},
							}),
							LEG_OR_BRIDGE_TIMEOUT_MS,
							`SOR bridge ${group.key}`,
						);
					} catch (err) {
						console.error("error", err);
						const msg = sorExecutionFailureMessage(err);
						console.warn("[SOR] Bridge error", group.key, msg);
						console.warn("[SOR][diagnostics][bridge]", {
							routeId: route.routeId,
							corridor: group.key,
							outerTimeoutMs: LEG_OR_BRIDGE_TIMEOUT_MS,
							hint: "Limitless prefund: Network → POST …/portfolio/withdraw (504 = upstream/server limit). Client errors prefixed [SOR][limitless-withdraw] are maker→SCW. Outer timeout here means the whole executeBridge exceeded outerTimeoutMs while inner steps may still be running.",
						});
						bridgeResult = { success: false, error: msg };
					}
					if (mountedRef.current) {
						setPrefundLegProgress(null);
					}
					if (!bridgeResult.success) {
						const trimmedBridgeErr = bridgeResult.error?.trim();
						const bridgeErr =
							trimmedBridgeErr && trimmedBridgeErr.length > 0
								? trimmedBridgeErr
								: "Bridge failed (no error message — check [SOR] Bridge error log above).";
						for (const leg of group.legs) {
							legResults.set(leg.venue, {
								filled: false,
								filledShares: 0,
								error: bridgeErr,
							});
							if (mountedRef.current) {
								setExecution(buildLocalExecution(route, legResults));
							}
							trySyncBackend(() =>
								apiClient
									.updateLeg(
										route.routeId,
										leg.venue as SorVenue,
										"failed",
										{
											error: bridgeErr,
											bridgeTxHash: bridgeResult.bridgeTxHash,
										},
									)
									.then(() => {}),
							);
						}
						continue;
					}

					if (mountedRef.current) {
						setExecutionPhase("executing_trade");
						setPrefundLegProgress(null);
					}
					for (const leg of group.legs) {
						console.debug("[SOR] Bridge+trade leg start", leg.venue);
						logDflowClientOrderSigning(route, leg, "postBridge");
						let tradeResult: Awaited<ReturnType<typeof executeLegWithRetry>>;
						try {
							tradeResult = await withTimeout(
								executeLegWithRetry(leg, RETRY_COUNT, route.side, {
									routeId: route.routeId,
									expiresAtMs: route.expiresAt,
								}),
								LEG_OR_BRIDGE_TIMEOUT_MS,
								`SOR post-bridge leg ${leg.venue}`,
							);
						} catch (err) {
							console.error("error", err);
							const msg = sorExecutionFailureMessage(err);
							console.warn("[SOR] Post-bridge leg failed", leg.venue, msg);
							console.warn("[SOR][diagnostics][post_bridge_leg]", {
								routeId: route.routeId,
								venue: leg.venue,
								outerTimeoutMs: LEG_OR_BRIDGE_TIMEOUT_MS,
							});
							tradeResult = { filled: false, filledShares: 0, error: msg };
						}
						console.debug("[SOR] Bridge+trade leg end", leg.venue, {
							filled: tradeResult.filled,
							error: tradeResult.error,
						});
						legResults.set(leg.venue, tradeResult);
						if (mountedRef.current) setExecution(buildLocalExecution(route, legResults));

						trySyncBackend(() =>
							apiClient
								.updateLeg(
									route.routeId,
									leg.venue as SorVenue,
									tradeResult.filled ? "filled" : "failed",
									{
										filledShares: tradeResult.filledShares,
										txHash: tradeResult.txHash,
										bridgeTxHash: bridgeResult.bridgeTxHash,
										error: tradeResult.error,
									},
								)
								.then(() => {}),
						);
					}
				}

				// Bridge groups run sequentially (aggregated per corridor) before legs with no bridge.

				if (mountedRef.current) setExecutionPhase("executing_trade");
				const immediatePromises = immediateLegs.map(async (leg) => {
					console.debug("[SOR] Leg start", leg.venue, { routeId: route.routeId });
					logDflowClientOrderSigning(route, leg, "immediate");
					let result: Awaited<ReturnType<typeof executeLegWithRetry>>;
					try {
						result = await withTimeout(
							executeLegWithRetry(leg, RETRY_COUNT, route.side, {
								routeId: route.routeId,
								expiresAtMs: route.expiresAt,
							}),
							LEG_OR_BRIDGE_TIMEOUT_MS,
							`SOR leg ${leg.venue}`,
						);
					} catch (err) {
						console.error("error", err);
						const msg = sorExecutionFailureMessage(err);
						console.warn("[SOR] Leg failed", leg.venue, msg);
						console.warn("[SOR][diagnostics][immediate_leg]", {
							routeId: route.routeId,
							venue: leg.venue,
							outerTimeoutMs: LEG_OR_BRIDGE_TIMEOUT_MS,
						});
						result = { filled: false, filledShares: 0, error: msg };
					}
					console.debug("[SOR] Leg end", leg.venue, {
						filled: result.filled,
						error: result.error,
					});
					legResults.set(leg.venue, result);

					if (mountedRef.current) {
						setExecution(buildLocalExecution(route, legResults));
					}

					trySyncBackend(() =>
						apiClient.updateLeg(
							route.routeId,
							leg.venue as SorVenue,
							result.filled ? "filled" : "failed",
							{
								filledShares: result.filledShares,
								txHash: result.txHash,
								error: result.error,
							},
						).then(() => {}),
					);

					return result;
				});

				await Promise.allSettled(immediatePromises);

				console.debug("[SOR] Execution finished", {
					routeId: route.routeId,
					venues: route.legs.map((l) => l.venue),
				});

				const finalExec = buildLocalExecution(route, legResults);
				if (mountedRef.current) {
					setExecution(finalExec);
					if (finalExec.status === "partial") {
						setRemainingBudget(finalExec.remainingBudget);
					}
				}
				result = finalExec;
			} catch (err) {
				console.error("[SOR] Execution error:", err);
				const errorExec = buildLocalExecution(route, legResults);
				if (errorExec.status === "executing") {
					errorExec.status = "failed";
				}
				if (mountedRef.current) setExecution(errorExec);
				result = errorExec;
			} finally {
				executingRef.current = false;
				// Always clear — if we gate on mountedRef, Strict Mode / route unmount can leave the
				// trade button stuck on "Executing" with no console output from a never-settled run.
				setIsExecuting(false);
				setExecutionPhase("idle");
				setPrefundLegProgress(null);
			}
			return result;
		},
		[apiClient, executeLegWithRetry, executeBridge, trySyncBackend],
	);

	const requestReroute = useCallback(async (): Promise<number | null> => {
		if (!routeRef.current) return null;
		try {
			const result = await apiClient.markReroute(routeRef.current.routeId);
			if (mountedRef.current) {
				setExecution(result.execution);
				setRemainingBudget(result.remainingBudget);
			}
			return result.remainingBudget;
		} catch (err) {
			console.error("[SOR] Reroute request failed:", err);
			if (mountedRef.current) {
				setExecution(prev => prev ? { ...prev, error: "Reroute request failed" } : null);
			}
			return null;
		}
	}, [apiClient]);

	const acceptResult = useCallback(async () => {
		if (!routeRef.current) return;
		try {
			const result = await apiClient.markDone(routeRef.current.routeId);
			if (mountedRef.current) {
				setExecution(result);
				setRemainingBudget(null);
			}
		} catch (err) {
			console.error("[SOR] Accept result failed:", err);
			if (mountedRef.current) {
				setExecution(null);
				setRemainingBudget(null);
			}
		}
	}, [apiClient]);

	const resetExecution = useCallback(() => {
		executingRef.current = false;
		setExecution(null);
		setIsExecuting(false);
		setExecutionPhase("idle");
		setPrefundLegProgress(null);
		setRemainingBudget(null);
		routeRef.current = null;
	}, []);

	return {
		execution,
		isExecuting,
		executionPhase,
		prefundLegProgress,
		execute,
		remainingBudget,
		requestReroute,
		acceptResult,
		resetExecution,
	};
}
