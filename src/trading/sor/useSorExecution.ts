import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { usePrivy, useIdentityToken } from "@privy-io/react-auth";
import { createSorApiClient } from "./sor-api";
import type {
	RoutePlan,
	RouteLeg,
	RouteExecution,
	SorVenue,
} from "./sor-types";

const RETRY_COUNT = 2;
const RETRY_DELAY_MS = 2000;

export type LegExecutor = (leg: RouteLeg, side?: "buy" | "sell") => Promise<{
	filled: boolean;
	filledShares: number;
	txHash?: string;
	error?: string;
}>;

export type BridgeExecutor = (leg: RouteLeg) => Promise<{
	success: boolean;
	bridgeTxHash?: string;
	error?: string;
}>;

export interface UseSorExecutionInput {
	executeLeg: LegExecutor;
	executeBridge: BridgeExecutor;
}

export interface UseSorExecutionResult {
	execution: RouteExecution | null;
	isExecuting: boolean;
	execute: (route: RoutePlan) => Promise<void>;
	remainingBudget: number | null;
	requestReroute: () => Promise<number | null>;
	acceptResult: () => Promise<void>;
	resetExecution: () => void;
}

function buildLocalExecution(
	route: RoutePlan,
	legResults: Map<string, { filled: boolean; filledShares: number; txHash?: string; error?: string }>,
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

		return {
			venue: leg.venue as SorVenue,
			status: result ? (filled ? "filled" as const : "failed" as const) : "pending" as const,
			shares: leg.shares,
			filledShares,
			txHash: result?.txHash,
			error: result?.error,
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
	const { executeLeg, executeBridge } = input;

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
	const [remainingBudget, setRemainingBudget] = useState<number | null>(null);
	const routeRef = useRef<RoutePlan | null>(null);
	const executingRef = useRef(false);
	const mountedRef = useRef(true);
	useEffect(() => { return () => { mountedRef.current = false; }; }, []);

	const executeLegWithRetry = useCallback(
		async (leg: RouteLeg, retriesLeft: number, side: "buy" | "sell" = "buy"): Promise<{
			filled: boolean;
			filledShares: number;
			txHash?: string;
			error?: string;
		}> => {
			try {
				const result = await executeLeg(leg, side);
				return result;
			} catch (err) {
				if (retriesLeft > 0) {
					await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
					return executeLegWithRetry(leg, retriesLeft - 1, side);
				}
				return {
					filled: false,
					filledShares: 0,
					error: err instanceof Error ? err.message : "Execution failed",
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
		async (route: RoutePlan) => {
			if (executingRef.current) return;
			executingRef.current = true;
			routeRef.current = route;
			setIsExecuting(true);
			setRemainingBudget(null);

			const isSell = route.side === "sell";
			const legResults = new Map<string, { filled: boolean; filledShares: number; txHash?: string; error?: string }>();

			const initialExec = buildLocalExecution(route, legResults);
			if (mountedRef.current) setExecution(initialExec);

			trySyncBackend(() => apiClient.startExecution(route).then(() => {}));

			try {
				const immediateLegs = isSell
					? route.legs
					: route.legs.filter((l) => !l.bridge);
				const bridgeLegs = isSell
					? []
					: route.legs.filter((l) => !!l.bridge);

				const immediatePromises = immediateLegs.map(async (leg) => {
					const result = await executeLegWithRetry(leg, RETRY_COUNT, route.side);
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

				const bridgePromises = bridgeLegs.map(async (leg) => {
					const bridgeResult = await executeBridge(leg);
					if (!bridgeResult.success) {
						const failResult = { filled: false, filledShares: 0, error: bridgeResult.error ?? "Bridge failed" };
						legResults.set(leg.venue, failResult);
						if (mountedRef.current) setExecution(buildLocalExecution(route, legResults));

						trySyncBackend(() =>
							apiClient.updateLeg(
								route.routeId,
								leg.venue as SorVenue,
								"failed",
								{ error: bridgeResult.error ?? "Bridge failed", bridgeTxHash: bridgeResult.bridgeTxHash },
							).then(() => {}),
						);

						return failResult;
					}

					const tradeResult = await executeLegWithRetry(leg, RETRY_COUNT, route.side);
					legResults.set(leg.venue, tradeResult);
					if (mountedRef.current) setExecution(buildLocalExecution(route, legResults));

					trySyncBackend(() =>
						apiClient.updateLeg(
							route.routeId,
							leg.venue as SorVenue,
							tradeResult.filled ? "filled" : "failed",
							{
								filledShares: tradeResult.filledShares,
								txHash: tradeResult.txHash,
								bridgeTxHash: bridgeResult.bridgeTxHash,
								error: tradeResult.error,
							},
						).then(() => {}),
					);

					return tradeResult;
				});

				await Promise.allSettled([...immediatePromises, ...bridgePromises]);

				const finalExec = buildLocalExecution(route, legResults);
				if (mountedRef.current) {
					setExecution(finalExec);
					if (finalExec.status === "partial") {
						setRemainingBudget(finalExec.remainingBudget);
					}
				}
			} catch (err) {
				console.error("[SOR] Execution error:", err);
				const errorExec = buildLocalExecution(route, legResults);
				if (errorExec.status === "executing") {
					errorExec.status = "failed";
				}
				if (mountedRef.current) setExecution(errorExec);
		} finally {
			executingRef.current = false;
			if (mountedRef.current) setIsExecuting(false);
		}
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
		setRemainingBudget(null);
		routeRef.current = null;
	}, []);

	return {
		execution,
		isExecuting,
		execute,
		remainingBudget,
		requestReroute,
		acceptResult,
		resetExecution,
	};
}
