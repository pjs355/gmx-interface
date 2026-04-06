import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { usePrivy, useIdentityToken } from "@privy-io/react-auth";
import { createSorApiClient } from "./sor-api";
import type {
	RoutePlan,
	RouteRequest,
	SorOutcome,
	SorSide,
	SorVenue,
	ChainBalance,
	VenuePositionEntry,
	SorRouteResult,
} from "./sor-types";

const DEBOUNCE_MS = 300;
const AUTO_REFRESH_MS = 3_000;

export interface UseSorRouteInput {
	questionId: string | undefined;
	outcome: SorOutcome | undefined;
	side: SorSide;
	amount: number;
	walletBalances?: ChainBalance[];
	venuePositions?: VenuePositionEntry[];
	targetVenue?: SorVenue;
	enabled: boolean;
	polyFeeRate?: number;
	predictFunFeeRateBps?: number;
}

export interface UseSorRouteResult {
	route: RoutePlan | null;
	isLoading: boolean;
	error: string | null;
	isStale: boolean;
	refresh: () => void;
}

export function useSorRoute(input: UseSorRouteInput): UseSorRouteResult {
	const { getAccessToken } = usePrivy();
	const { identityToken } = useIdentityToken();

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

	const [route, setRoute] = useState<RoutePlan | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [isStale, setIsStale] = useState(false);

	const abortRef = useRef<AbortController | null>(null);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const refreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const fetchCountRef = useRef(0);
	const isLoadingRef = useRef(false);

	const { questionId, outcome, side, amount, walletBalances, venuePositions, enabled, polyFeeRate, predictFunFeeRateBps, targetVenue } = input;

	const canFetch =
		enabled &&
		!!questionId &&
		!!outcome &&
		amount > 0 &&
		(side === "buy"
			? (walletBalances?.length ?? 0) > 0
			: (venuePositions?.length ?? 0) > 0);

	const doFetch = useCallback(async () => {
		if (!canFetch || !questionId || !outcome) return;

		abortRef.current?.abort();
		const controller = new AbortController();
		abortRef.current = controller;

		const fetchId = ++fetchCountRef.current;
		setIsLoading(true);
		isLoadingRef.current = true;

		const request: RouteRequest = {
			questionId,
			outcome,
			side,
			amount,
			...(side === "buy" ? { walletBalances } : { venuePositions }),
			polyFeeRate,
			predictFunFeeRateBps,
			...(targetVenue ? { targetVenue } : {}),
		};

		try {
			const result: SorRouteResult = await apiClient.getRoute(request, controller.signal);

			if (fetchCountRef.current !== fetchId) return;

			if (result.success) {
				setRoute(result.route);
				setError(null);
				setIsStale(false);
		} else {
			setRoute(null);
			setError(result.error ?? "Unknown error");
		}
		} catch (err) {
			if (fetchCountRef.current !== fetchId) return;
			if (err instanceof DOMException && err.name === "AbortError") return;
			setError(err instanceof Error ? err.message : "Failed to compute route");
		} finally {
			if (fetchCountRef.current === fetchId) {
				setIsLoading(false);
				isLoadingRef.current = false;
			}
		}
	}, [canFetch, questionId, outcome, side, amount, walletBalances, venuePositions, polyFeeRate, predictFunFeeRateBps, targetVenue, apiClient]);

	useEffect(() => {
		if (!canFetch) {
			setRoute(null);
			setError(null);
			setIsLoading(false);
			return;
		}

		if (debounceRef.current) clearTimeout(debounceRef.current);
		setIsStale(true);

		debounceRef.current = setTimeout(() => {
			doFetch();
		}, DEBOUNCE_MS);

		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
		};
	}, [canFetch, doFetch]);

	useEffect(() => {
		if (!canFetch || !route) return;

		refreshRef.current = setInterval(() => {
			if (!isLoadingRef.current) {
				setIsStale(true);
				doFetch();
			}
		}, AUTO_REFRESH_MS);

		return () => {
			if (refreshRef.current) clearInterval(refreshRef.current);
		};
	}, [canFetch, route, doFetch]);

	useEffect(() => {
		return () => {
			abortRef.current?.abort();
			if (debounceRef.current) clearTimeout(debounceRef.current);
			if (refreshRef.current) clearInterval(refreshRef.current);
		};
	}, []);

	const refresh = useCallback(() => {
		setIsStale(true);
		doFetch();
	}, [doFetch]);

	return { route, isLoading, error, isStale, refresh };
}
