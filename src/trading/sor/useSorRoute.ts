import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { usePrivy, useIdentityToken } from "@privy-io/react-auth";
import { createSorApiClient } from "./sor-api";
import type {
	RoutePlan,
	RouteRequest,
	SorOutcome,
	SorSide,
	SorVenue,
	SorOrderType,
	ChainBalance,
	VenuePositionEntry,
	SorRouteResult,
	SorErrorCode,
} from "./sor-types";
import { VENUE_DISPLAY_NAMES } from "./sor-types";
import { isTradingDebugLoggingEnabled } from "@/config/tradingDebug";

const DEBOUNCE_MS = 300;
const AUTO_REFRESH_MS = 3_000;
const REQUEST_TIMEOUT_MS = 8_000;

/**
 * How long a transient failure streak is allowed to persist before we clear
 * the last-good route and surface an error. Prevents the button from flapping
 * between "Ready" and "Route unavailable" / "Complete venue setup" on the
 * normal 3 s auto-refresh when the server briefly reports books loading or
 * eligibility flipping.
 */
const ROUTE_FAILURE_GRACE_MS = 3_000;

/** Server may briefly return these while books or venue wiring catch up after a tab switch. */
const TRANSIENT_SOR_ROUTE_CODES: readonly SorErrorCode[] = [
	"NO_MARKET_FOUND",
	"NO_BOOKS_AVAILABLE",
	"NO_VENUES_ELIGIBLE",
	"EXECUTION_NOT_READY",
	"RATE_LIMITED",
	"ALL_BOOKS_STALE",
];

function sleep(ms: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal.aborted) {
			reject(new DOMException("Aborted", "AbortError"));
			return;
		}
		const t = setTimeout(() => {
			signal.removeEventListener("abort", onAbort);
			resolve();
		}, ms);
		const onAbort = () => {
			clearTimeout(t);
			reject(new DOMException("Aborted", "AbortError"));
		};
		signal.addEventListener("abort", onAbort, { once: true });
	});
}

function formatSorRouteFailureMessage(
	result: Extract<SorRouteResult, { success: false }>,
	targetVenue: SorVenue | undefined,
): string {
	const code = result.code;
	const server = (result.error ?? "").trim();

	if (code === "NO_MARKET_FOUND" && targetVenue) {
		return `No order book for ${VENUE_DISPLAY_NAMES[targetVenue]} on this market yet. Try another tab or All Markets.`;
	}
	if (code === "NO_MARKET_FOUND") {
		// Post-grace: the client already waited ~3 s on this; message it as
		// a loading state rather than a hard failure because the book should
		// still appear shortly.
		return "Fetching price...";
	}
	if (code === "NO_BOOKS_AVAILABLE") {
		return "Fetching price...";
	}
	if (code === "ALL_BOOKS_STALE") {
		return "Refreshing venue prices…";
	}
	if (code === "NO_VENUES_ELIGIBLE") {
		return "No venue is ready for this size yet. Try a smaller amount or another tab.";
	}
	if (code === "EXECUTION_NOT_READY") {
		return server || "Complete trading setup for this venue before using smart routing.";
	}
	if (code === "AMOUNT_TOO_SMALL") {
		// Server now returns the product-specific copy (e.g. "Trade minimum is
		// $5.", "$5 minimum limit order value.", "Minimum sell is 1 share.");
		// surface it directly so we don't mask the reason with a generic line.
		if (server) return server;
		return "Below trade minimum. Increase trade size";
	}
	if (code === "WHOLE_SHARES_ONLY") {
		return server || "Fractional share amounts are not supported on Kalshi. Enter a whole number";
	}
	if (code === "RATE_LIMITED") {
		return "Too many requests. Wait a moment and try again.";
	}
	if (code === "ROUTE_EXPIRED") {
		return server || "That route expired. Wait for refresh and try again.";
	}
	if (server) return server;
	return "Could not compute a route. Try again or pick a different venue.";
}

export interface UseSorRouteInput {
	questionId: string | undefined;
	outcome: SorOutcome | undefined;
	side: SorSide;
	amount: number;
	/**
	 * **Buy only.** Per-chain stable balances + wallet addresses for the predictions
	 * SOR API. The server always walks full book depth; `route.sufficientFunds` is false
	 * when this is omitted, empty, or balances do not cover the returned legs (including
	 * bridges). Prefer `buildChainBalances` (including zero rows per chain) so funding
	 * is accurate. Execution is blocked when `sufficientFunds === false`.
	 */
	walletBalances?: ChainBalance[];
	venuePositions?: VenuePositionEntry[];
	targetVenue?: SorVenue;
	enabled: boolean;
	polyFeeRate?: number;
	predictFunFeeRateBps?: number;
	/** Defaults to "market" when omitted. */
	orderType?: SorOrderType;
	/** Integer cents 1–99. Required when orderType === "limit". */
	limitPriceCents?: number;
	/** Buy: Limitless maker USDC on Base (see RouteRequest in sor-types). */
	limitlessMakerBaseUsdc?: number;
	/** Buy: Limitless fee rate in bps (optional; server defaults to 300). */
	limitlessFeeRateBps?: number;
}

export interface UseSorRouteResult {
	route: RoutePlan | null;
	isLoading: boolean;
	error: string | null;
	/** Set from API when `success: false` (e.g. EXECUTION_NOT_READY). */
	routeErrorCode: SorErrorCode | null;
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
	const [routeErrorCode, setRouteErrorCode] = useState<SorErrorCode | null>(null);
	const [isStale, setIsStale] = useState(false);

	const abortRef = useRef<AbortController | null>(null);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const refreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const fetchCountRef = useRef(0);
	const isLoadingRef = useRef(false);
	/** Timestamp (ms) of the first transient failure in the current streak. */
	const failureStreakStartRef = useRef<number | null>(null);
	/** Latest route ref so the visibility-resume effect can decide whether to poll. */
	const routeRef = useRef<RoutePlan | null>(null);
	routeRef.current = route;

	const prevOutcomeRef = useRef(input.outcome);
	const prevSideRef = useRef(input.side);
	const prevTargetVenueRef = useRef(input.targetVenue);
	const prevQuestionIdRef = useRef(input.questionId);

	const {
		questionId,
		outcome,
		side,
		amount,
		walletBalances,
		venuePositions,
		enabled,
		polyFeeRate,
		predictFunFeeRateBps,
		targetVenue,
		orderType,
		limitPriceCents,
		limitlessMakerBaseUsdc,
		limitlessFeeRateBps,
	} = input;

	/**
	 * Content keys for schedule effect deps — avoids thrashing when React Query hands
	 * `walletBalances` / `venuePositions` a fresh array reference with the same
	 * numbers (post-trade invalidations). Previously `doFetch` in the effect deps
	 * re-ran the effect on every refetch, cleared the 300 ms debounce repeatedly, and
	 * left the button stuck on "Fetching price..." (especially Predict with many
	 * dependent queries).
	 */
	const walletBalancesKey = useMemo(
		() =>
			(walletBalances ?? [])
				.map((b) => `${b.chain}:${b.balance}:${b.walletAddress ?? ""}`)
				.sort()
				.join("|"),
		[walletBalances],
	);
	const venuePositionsKey = useMemo(
		() =>
			(venuePositions ?? [])
				.map((p) => `${p.venue}:${p.shares}`)
				.sort()
				.join("|"),
		[venuePositions],
	);

	const canFetch =
		enabled &&
		!!questionId &&
		!!outcome &&
		amount > 0 &&
		(side === "sell" ? (venuePositions?.length ?? 0) > 0 : true) &&
		// Limit orders are always single-venue and require both targetVenue and a valid price.
		(orderType !== "limit" ||
			(!!targetVenue &&
				typeof limitPriceCents === "number" &&
				Number.isInteger(limitPriceCents) &&
				limitPriceCents >= 1 &&
				limitPriceCents <= 99));

	const doFetch = useCallback(async () => {
		if (!canFetch || !questionId || !outcome) return;

		abortRef.current?.abort();
		const controller = new AbortController();
		abortRef.current = controller;

		let timedOut = false;
		const timeoutId = setTimeout(() => {
			timedOut = true;
			controller.abort();
		}, REQUEST_TIMEOUT_MS);

		const fetchId = ++fetchCountRef.current;
		setIsLoading(true);
		isLoadingRef.current = true;
		setError(null);
		setRouteErrorCode(null);

		const request: RouteRequest = {
			questionId,
			outcome,
			side,
			amount,
			...(side === "buy" ? { walletBalances } : { venuePositions }),
			polyFeeRate,
			predictFunFeeRateBps,
			...(targetVenue ? { targetVenue } : {}),
			...(orderType ? { orderType } : {}),
			...(typeof limitPriceCents === "number" ? { limitPriceCents } : {}),
			...(side === "buy" &&
			typeof limitlessMakerBaseUsdc === "number" &&
			Number.isFinite(limitlessMakerBaseUsdc)
				? { limitlessMakerBaseUsdc: Math.max(0, limitlessMakerBaseUsdc) }
				: {}),
			...(side === "buy" &&
			typeof limitlessFeeRateBps === "number" &&
			Number.isFinite(limitlessFeeRateBps)
				? { limitlessFeeRateBps: Math.max(0, Math.floor(limitlessFeeRateBps)) }
				: {}),
		};

		if (isTradingDebugLoggingEnabled()) {
			console.log("[SOR] Route request →", {
				questionId,
				targetVenue,
				orderType: orderType ?? "market",
				limitPriceCents,
				amount,
				side,
				outcome,
				walletBalances: side === "buy" ? walletBalances : undefined,
				venuePositions: side === "sell" ? venuePositions : undefined,
			});
		}

		/**
		 * Apply a failure response. If the failure is transient and we still
		 * have a recent successful route, keep the route on screen (marked
		 * stale) until {@link ROUTE_FAILURE_GRACE_MS} has elapsed — this is
		 * what stops the button flapping between valid and error states on a
		 * one-tick miss of the 3 s auto-refresh. Non-transient codes clear
		 * immediately: they're user-actionable (AMOUNT_TOO_SMALL / VALIDATION).
		 */
		const surfaceFailure = (opts: {
			code: SorErrorCode | null;
			message: string;
			transient: boolean;
		}) => {
			if (opts.transient) {
				if (failureStreakStartRef.current == null) {
					failureStreakStartRef.current = Date.now();
				}
				const elapsed = Date.now() - failureStreakStartRef.current;
				setIsStale(true);
				if (elapsed < ROUTE_FAILURE_GRACE_MS && routeRef.current) {
					// Within grace: hold the last-good route; don't surface
					// error copy yet. The next refresh tick will retry.
					return;
				}
			} else {
				failureStreakStartRef.current = null;
			}
			setRoute(null);
			setError(opts.message);
			setRouteErrorCode(opts.code);
			setIsStale(false);
		};

		const maxAttempts = 4;
		try {
			for (let attempt = 0; attempt < maxAttempts; attempt++) {
				if (fetchCountRef.current !== fetchId) return;

				const result: SorRouteResult = await apiClient.getRoute(request, controller.signal);

				if (fetchCountRef.current !== fetchId) return;

				if (result.success) {
					if (isTradingDebugLoggingEnabled()) {
						console.log("[SOR] Route response ←", {
							totalCost: result.route.totalCost,
							totalShares: result.route.totalShares,
							legs: result.route.legs.length,
							insufficientLiquidity: result.route.insufficientLiquidity,
							remainder: result.route.remainder,
						});
					}
					failureStreakStartRef.current = null;
					setRoute(result.route);
					setError(null);
					setRouteErrorCode(null);
					setIsStale(false);
					return;
				}

				if (isTradingDebugLoggingEnabled()) {
					console.log("[SOR] Route response ←", {
						success: false,
						code: result.code,
						error: (result.error ?? "").slice(0, 200),
					});
				}

				const transient = TRANSIENT_SOR_ROUTE_CODES.includes(result.code);
				if (!transient || attempt === maxAttempts - 1) {
					surfaceFailure({
						code: result.code,
						message: formatSorRouteFailureMessage(result, targetVenue),
						transient,
					});
					return;
				}

				try {
					// Backoff with jitter; jitter avoids every client retrying
					// on the same 3 s cadence after a shared-cause blip.
					const backoff = 280 + attempt * 140 + Math.floor(Math.random() * 80);
					await sleep(backoff, controller.signal);
				} catch {
					if (fetchCountRef.current !== fetchId) return;
					return;
				}
			}
		} catch (err) {
			if (fetchCountRef.current !== fetchId) return;
			if (err instanceof DOMException && err.name === "AbortError") {
				if (timedOut) {
					surfaceFailure({
						code: null,
						message: "Route request timed out",
						transient: true,
					});
				}
				return;
			}
			let message = err instanceof Error ? err.message : "Failed to compute route";
			try {
				if (fetchCountRef.current !== fetchId) return;
				await sleep(320 + Math.floor(Math.random() * 80), controller.signal);
				if (fetchCountRef.current !== fetchId) return;
				const retryResult: SorRouteResult = await apiClient.getRoute(request, controller.signal);
				if (fetchCountRef.current !== fetchId) return;
				if (retryResult.success) {
					failureStreakStartRef.current = null;
					setRoute(retryResult.route);
					setError(null);
					setRouteErrorCode(null);
					setIsStale(false);
					return;
				}
				surfaceFailure({
					code: retryResult.code,
					message: formatSorRouteFailureMessage(retryResult, targetVenue),
					transient: TRANSIENT_SOR_ROUTE_CODES.includes(retryResult.code),
				});
				return;
			} catch (e2) {
				if (fetchCountRef.current !== fetchId) return;
				if (e2 instanceof DOMException && e2.name === "AbortError") return;
				message =
					e2 instanceof Error ? e2.message : "Failed to compute route after retry";
			}
			surfaceFailure({ code: null, message, transient: true });
		} finally {
			clearTimeout(timeoutId);
			if (fetchCountRef.current === fetchId) {
				setIsLoading(false);
				isLoadingRef.current = false;
			}
		}
	}, [
		canFetch,
		questionId,
		outcome,
		side,
		amount,
		walletBalances,
		venuePositions,
		polyFeeRate,
		predictFunFeeRateBps,
		targetVenue,
		orderType,
		limitPriceCents,
		limitlessMakerBaseUsdc,
		limitlessFeeRateBps,
		apiClient,
	]);

	const doFetchRef = useRef(doFetch);
	doFetchRef.current = doFetch;

	useEffect(() => {
		if (!canFetch) {
			setRoute(null);
			setError(null);
			setRouteErrorCode(null);
			setIsLoading(false);
			failureStreakStartRef.current = null;
			return;
		}

		if (debounceRef.current) clearTimeout(debounceRef.current);

		const outcomeChanged = prevOutcomeRef.current !== outcome;
		const sideChanged = prevSideRef.current !== side;
		const targetVenueChanged = prevTargetVenueRef.current !== targetVenue;
		const questionIdChanged = prevQuestionIdRef.current !== questionId;
		prevOutcomeRef.current = outcome;
		prevSideRef.current = side;
		prevTargetVenueRef.current = targetVenue;
		prevQuestionIdRef.current = questionId;

		if (targetVenueChanged || questionIdChanged) {
			setRoute(null);
			setError(null);
			setRouteErrorCode(null);
			failureStreakStartRef.current = null;
		}

		setIsStale(true);

		if (outcomeChanged || sideChanged || targetVenueChanged || questionIdChanged) {
			void doFetchRef.current();
		} else {
			debounceRef.current = setTimeout(() => {
				void doFetchRef.current();
			}, DEBOUNCE_MS);
		}

		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
		};
	}, [
		canFetch,
		outcome,
		side,
		targetVenue,
		questionId,
		amount,
		walletBalancesKey,
		venuePositionsKey,
		polyFeeRate,
		predictFunFeeRateBps,
		orderType,
		limitPriceCents,
		limitlessMakerBaseUsdc,
		limitlessFeeRateBps,
	]);

	/**
	 * Background-aware auto-refresh.
	 *
	 * - Polls every {@link AUTO_REFRESH_MS} while the tab is visible and we
	 *   have a live route.
	 * - Clears the interval whenever `document.hidden` becomes true so we
	 *   don't hammer the API (and risk rate-limits) in backgrounded tabs.
	 * - On return to visibility or window `focus`, fires an immediate refetch
	 *   and flags `isStale` so the UI can show a brief "syncing" indicator
	 *   — the user sees fresh odds the moment they come back to the tab.
	 */
	useEffect(() => {
		if (!canFetch || !route) return;

		const clearPolling = () => {
			if (refreshRef.current) {
				clearInterval(refreshRef.current);
				refreshRef.current = null;
			}
		};

		const startPolling = () => {
			clearPolling();
			refreshRef.current = setInterval(() => {
				if (!isLoadingRef.current && !document.hidden) {
					void doFetchRef.current();
				}
			}, AUTO_REFRESH_MS) as unknown as ReturnType<typeof setTimeout>;
		};

		const resumeNow = () => {
			setIsStale(true);
			if (!isLoadingRef.current) void doFetchRef.current();
			startPolling();
		};

		const handleVisibility = () => {
			if (document.hidden) {
				clearPolling();
			} else {
				resumeNow();
			}
		};

		if (document.hidden) {
			clearPolling();
		} else {
			startPolling();
		}

		document.addEventListener("visibilitychange", handleVisibility);
		window.addEventListener("focus", resumeNow);

		return () => {
			clearPolling();
			document.removeEventListener("visibilitychange", handleVisibility);
			window.removeEventListener("focus", resumeNow);
		};
	}, [canFetch, route]);

	useEffect(() => {
		return () => {
			abortRef.current?.abort();
			if (debounceRef.current) clearTimeout(debounceRef.current);
			if (refreshRef.current) clearInterval(refreshRef.current);
		};
	}, []);

	const refresh = useCallback(() => {
		setIsStale(true);
		void doFetchRef.current();
	}, []);

	return { route, isLoading, error, routeErrorCode, isStale, refresh };
}
