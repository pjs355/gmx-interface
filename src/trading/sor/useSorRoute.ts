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
	VenueRoutePreview,
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

/**
 * Auth-shaped errors we never want to surface in the trade box. Logged-out
 * users hit `getRoute` to preview hypothetical smart-routing payouts; the
 * primary CTA is already "Log In or Sign Up", so a leaked "Route unavailable:
 * Not authenticated" or "SOR API error 401" would just be noise. We treat
 * both the client-side throw (`Not authenticated`) and any server 401 as a
 * silent "no route" outcome.
 */
function isAuthShapedSorError(message: string): boolean {
	if (!message) return false;
	if (/^\s*not authenticated\b/i.test(message)) return true;
	if (/SOR API error 401\b/i.test(message)) return true;
	return false;
}

/**
 * Cross-instance last-good route cache.
 *
 * Each `useSorRoute` instance has its own per-channel `lastGoodRouteRef`, but
 * those are tied to the React component lifecycle: when the trade box
 * unmounts (e.g., navigating from the home dock to the umbrella detail
 * page), the refs are gone and the next mount has to wait for a fresh
 * round-trip before showing any quote. This module-level cache survives the
 * remount: when a new `useSorRoute` is initialized with the *same* inputs
 * (questionId + outcome + side + amount + targetVenue + orderType +
 * limitPriceCents), we hydrate `displayRoute` / `executionRoute` /
 * `venuePreviews` synchronously on first render so the user sees the same
 * SOR price they were just looking at, with no "Fetching price…" flash.
 *
 * The normal fetch + auto-refresh continues in the background, so the cache
 * only ever provides a head-start — once the live result arrives it overrides
 * the cached value.
 *
 * Bounded LRU (cap = `SOR_ROUTE_CACHE_CAP`) keyed by request signature.
 */
type CachedRouteEntry = {
	route: RoutePlan;
	venuePreviews: VenueRoutePreview[] | null;
	timestamp: number;
};

const SOR_ROUTE_CACHE_CAP = 32;
const sorRouteCache = new Map<string, CachedRouteEntry>();

function buildSorRouteCacheKey(opts: {
	questionId: string | undefined;
	outcome: SorOutcome | undefined;
	side: SorSide;
	amount: number;
	targetVenue: SorVenue | undefined;
	orderType: SorOrderType | undefined;
	limitPriceCents: number | undefined;
}): string | null {
	if (!opts.questionId || !opts.outcome || !(opts.amount > 0)) return null;
	return [
		opts.questionId,
		opts.outcome,
		opts.side,
		opts.amount,
		opts.targetVenue ?? "",
		opts.orderType ?? "market",
		opts.limitPriceCents ?? "",
	].join("|");
}

function readSorRouteCache(key: string | null): CachedRouteEntry | null {
	if (!key) return null;
	return sorRouteCache.get(key) ?? null;
}

function writeSorRouteCache(
	key: string | null,
	entry: CachedRouteEntry,
): void {
	if (!key) return;
	// Refresh LRU order: delete + set so the most recent insert is at the tail.
	if (sorRouteCache.has(key)) sorRouteCache.delete(key);
	sorRouteCache.set(key, entry);
	while (sorRouteCache.size > SOR_ROUTE_CACHE_CAP) {
		const oldest = sorRouteCache.keys().next().value;
		if (typeof oldest === "string") sorRouteCache.delete(oldest);
		else break;
	}
}

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
	side: SorSide,
): string {
	const code = result.code;
	const server = (result.error ?? "").trim();

	if (code === "NO_MARKET_FOUND" && targetVenue) {
		return `No order book for ${VENUE_DISPLAY_NAMES[targetVenue]} on this market yet. Try another tab or All Markets.`;
	}
	// `NO_MARKET_FOUND` (omnibus) and `NO_BOOKS_AVAILABLE` both mean: by the time the
	// client surfaces this, the route has been retried and no venue can fill the order.
	// Phrase it as the user-facing reality (no liquidity) instead of a misleading
	// "Fetching price…" that implies progress.
	if (code === "NO_MARKET_FOUND" || code === "NO_BOOKS_AVAILABLE") {
		return side === "buy" ? "No shares available" : "No bids available";
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
		if (server) return server;
		return "Below trade minimum. Increase trade size";
	}
	if (code === "WHOLE_SHARES_ONLY") {
		return (
			server ||
			"Fractional shares aren't supported on LevelUp or Kalshi. Enter a whole number"
		);
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
	limitlessMakerBaseUsdc?: number;
	limitlessFeeRateBps?: number;
	/**
	 * When true, abort in-flight route requests, skip debounced refetch and the 3s
	 * poll so omnibus / venue previews cannot change (e.g. during SOR execution).
	 */
	suspendBackgroundRefetch?: boolean;
}

/**
 * Dual-channel SOR result:
 * - `displayRoute` = always-on omnibus plan (no `targetVenue`); drives smart-routing rows + split row.
 * - `executionRoute` = targeted single-venue plan (only when `targetVenue` set); drives Submit + single-venue overlay.
 *
 * For `orderType === "limit"`, only the execution channel runs and `displayRoute` is aliased to the
 * same `RoutePlan` reference; `venuePreviews` is `null` (omnibus is not computed for limit orders).
 */
export interface UseSorRouteResult {
	displayRoute: RoutePlan | null;
	executionRoute: RoutePlan | null;
	venuePreviews: VenueRoutePreview[] | null;
	displayLoading: boolean;
	displayStale: boolean;
	executionLoading: boolean;
	executionStale: boolean;
	displayError: string | null;
	displayErrorCode: SorErrorCode | null;
	executionError: string | null;
	executionErrorCode: SorErrorCode | null;
	refresh: () => void;
}

type ChannelKind = "display" | "execution";

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
		suspendBackgroundRefetch = false,
	} = input;

	/**
	 * On first render, look up the module-level cache for *this exact*
	 * request signature and seed the per-channel state with the cached
	 * values so the trade box paints the user's last-known quote
	 * immediately on remount. We seed both channels from the same lookup:
	 *   - Display channel uses the no-target key (omnibus plan).
	 *   - Execution channel uses the targetVenue key (single-venue plan).
	 * Each channel's normal fetch flow runs right after and replaces these.
	 */
	const initialDisplayCacheKey = buildSorRouteCacheKey({
		questionId,
		outcome,
		side,
		amount,
		targetVenue: undefined,
		orderType: orderType ?? "market",
		limitPriceCents,
	});
	const initialExecutionCacheKey = buildSorRouteCacheKey({
		questionId,
		outcome,
		side,
		amount,
		targetVenue,
		orderType: orderType ?? "market",
		limitPriceCents,
	});
	const initialDisplayCacheEntry = readSorRouteCache(initialDisplayCacheKey);
	const initialExecutionCacheEntry = readSorRouteCache(
		initialExecutionCacheKey,
	);

	const [displayRoute, setDisplayRoute] = useState<RoutePlan | null>(
		initialDisplayCacheEntry?.route ?? null,
	);
	const [executionRoute, setExecutionRoute] = useState<RoutePlan | null>(
		initialExecutionCacheEntry?.route ?? null,
	);
	const [venuePreviews, setVenuePreviews] = useState<
		VenueRoutePreview[] | null
	>(initialDisplayCacheEntry?.venuePreviews ?? null);

	const [displayLoading, setDisplayLoading] = useState(false);
	const [displayStale, setDisplayStale] = useState(false);
	const [displayError, setDisplayError] = useState<string | null>(null);
	const [displayErrorCode, setDisplayErrorCode] = useState<SorErrorCode | null>(null);

	const [executionLoading, setExecutionLoading] = useState(false);
	const [executionStale, setExecutionStale] = useState(false);
	const [executionError, setExecutionError] = useState<string | null>(null);
	const [executionErrorCode, setExecutionErrorCode] = useState<SorErrorCode | null>(null);

	// Per-channel runtime refs.
	const displayAbortRef = useRef<AbortController | null>(null);
	const displayFetchIdRef = useRef(0);
	const displayFailureStreakStartRef = useRef<number | null>(null);
	const displayLastGoodRouteRef = useRef<RoutePlan | null>(null);
	const displayLoadingRef = useRef(false);

	const executionAbortRef = useRef<AbortController | null>(null);
	const executionFetchIdRef = useRef(0);
	const executionFailureStreakStartRef = useRef<number | null>(null);
	const executionLastGoodRouteRef = useRef<RoutePlan | null>(null);
	const executionLoadingRef = useRef(false);

	// Shared scheduler refs.
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const refreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Identity-tracking refs.
	const prevQuestionIdRef = useRef(questionId);
	const prevOutcomeRef = useRef(outcome);
	const prevSideRef = useRef(side);
	const prevOrderTypeRef = useRef(orderType);
	const prevTargetVenueRef = useRef(targetVenue);

	/**
	 * Content keys for schedule effect deps — avoids thrashing when React Query hands
	 * `walletBalances` / `venuePositions` a fresh array reference with the same
	 * numbers (post-trade invalidations).
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

	const buildRequest = useCallback(
		(channel: ChannelKind): RouteRequest => {
			const includeTarget = channel === "execution" && !!targetVenue;
			return {
				questionId: questionId!,
				outcome: outcome!,
				side,
				amount,
				...(side === "buy" ? { walletBalances } : { venuePositions }),
				polyFeeRate,
				predictFunFeeRateBps,
				...(includeTarget ? { targetVenue: targetVenue as SorVenue } : {}),
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
		},
		[
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
		],
	);

	const doFetchChannel = useCallback(
		async (channel: ChannelKind) => {
			if (!canFetch || !questionId || !outcome) return;
			const isLimit = orderType === "limit";
			// Execution channel only fires when there's a concrete target.
			// (Limit orders force `targetVenue` via canFetch; market orders may not have one.)
			if (channel === "execution" && !targetVenue) return;
			// Display channel is silent for limit orders — execution channel aliases into display on success.
			if (channel === "display" && isLimit) return;

			const isExecution = channel === "execution";
			const aliasToDisplay = isLimit && isExecution;

			const channelAbortRef = isExecution ? executionAbortRef : displayAbortRef;
			const channelFetchIdRef = isExecution ? executionFetchIdRef : displayFetchIdRef;
			const channelFailureStreakStartRef = isExecution
				? executionFailureStreakStartRef
				: displayFailureStreakStartRef;
			const channelLastGoodRouteRef = isExecution
				? executionLastGoodRouteRef
				: displayLastGoodRouteRef;
			const channelLoadingRef = isExecution ? executionLoadingRef : displayLoadingRef;
			const setLoading = isExecution ? setExecutionLoading : setDisplayLoading;
			const setStale = isExecution ? setExecutionStale : setDisplayStale;
			const setErr = isExecution ? setExecutionError : setDisplayError;
			const setErrCode = isExecution ? setExecutionErrorCode : setDisplayErrorCode;
			const setRoute = isExecution ? setExecutionRoute : setDisplayRoute;

			channelAbortRef.current?.abort();
			const controller = new AbortController();
			channelAbortRef.current = controller;

			let timedOut = false;
			const timeoutId = setTimeout(() => {
				timedOut = true;
				controller.abort();
			}, REQUEST_TIMEOUT_MS);

			const fetchId = ++channelFetchIdRef.current;
			setLoading(true);
			channelLoadingRef.current = true;
			setErr(null);
			setErrCode(null);

			const request = buildRequest(channel);

			const applySuccess = (r: Extract<SorRouteResult, { success: true }>) => {
				channelFailureStreakStartRef.current = null;
				channelLastGoodRouteRef.current = r.route;
				setRoute(r.route);
				if (channel === "display") {
					setVenuePreviews(r.venuePreviews ?? null);
				}
				if (aliasToDisplay) {
					setDisplayRoute(r.route);
					setVenuePreviews(null);
					setDisplayError(null);
					setDisplayErrorCode(null);
					setDisplayStale(false);
					displayLastGoodRouteRef.current = r.route;
					displayFailureStreakStartRef.current = null;
				}
				setErr(null);
				setErrCode(null);
				setStale(false);

				// Persist the success in the module-level cache so the next mount
				// with identical inputs (e.g., home → umbrella navigation) can
				// paint the same quote synchronously instead of flashing a
				// "Fetching price…" state. Keys mirror the channel semantics:
				//  - display channel: no targetVenue (omnibus plan)
				//  - execution channel: with targetVenue (single-venue plan)
				//  - aliasToDisplay (limit orders): execution result is the
				//    display result; cache it under both keys.
				const cacheVenuePreviews =
					channel === "display" ? (r.venuePreviews ?? null) : null;
				if (channel === "display" || aliasToDisplay) {
					writeSorRouteCache(
						buildSorRouteCacheKey({
							questionId,
							outcome,
							side,
							amount,
							targetVenue: undefined,
							orderType: orderType ?? "market",
							limitPriceCents,
						}),
						{
							route: r.route,
							venuePreviews: cacheVenuePreviews,
							timestamp: Date.now(),
						},
					);
				}
				if (channel === "execution" && targetVenue) {
					writeSorRouteCache(
						buildSorRouteCacheKey({
							questionId,
							outcome,
							side,
							amount,
							targetVenue,
							orderType: orderType ?? "market",
							limitPriceCents,
						}),
						{
							route: r.route,
							venuePreviews: null,
							timestamp: Date.now(),
						},
					);
				}
			};

			const surfaceFailure = (opts: {
				code: SorErrorCode | null;
				message: string;
				transient: boolean;
			}) => {
				/* Auth failures get the silent treatment: the primary CTA is
				 * already "Log In or Sign Up", so we just clear the route and
				 * leave the error fields null instead of leaking
				 * "Route unavailable: Not authenticated" into the trade box. */
				const silentAuthFailure =
					opts.code == null && isAuthShapedSorError(opts.message);

				if (opts.transient) {
					if (channelFailureStreakStartRef.current == null) {
						channelFailureStreakStartRef.current = Date.now();
					}
					const elapsed = Date.now() - channelFailureStreakStartRef.current;
					setStale(true);
					if (elapsed < ROUTE_FAILURE_GRACE_MS && channelLastGoodRouteRef.current) {
						return;
					}
				} else {
					channelFailureStreakStartRef.current = null;
				}
				setRoute(null);
				channelLastGoodRouteRef.current = null;
				if (channel === "display") {
					setVenuePreviews(null);
				}
				if (aliasToDisplay) {
					setDisplayRoute(null);
					setVenuePreviews(null);
					setDisplayError(silentAuthFailure ? null : opts.message);
					setDisplayErrorCode(silentAuthFailure ? null : opts.code);
					setDisplayStale(false);
					displayLastGoodRouteRef.current = null;
					displayFailureStreakStartRef.current = null;
				}
				setErr(silentAuthFailure ? null : opts.message);
				setErrCode(silentAuthFailure ? null : opts.code);
				setStale(false);
			};

			if (isTradingDebugLoggingEnabled()) {
				console.log("[SOR] Route request →", {
					channel,
					questionId,
					targetVenue: isExecution ? targetVenue : undefined,
					orderType: orderType ?? "market",
					limitPriceCents,
					amount,
					side,
					outcome,
					walletBalances: side === "buy" ? walletBalances : undefined,
					venuePositions: side === "sell" ? venuePositions : undefined,
				});
			}

			const failureTargetForCopy = isExecution ? targetVenue : undefined;
			const maxAttempts = 4;
			try {
				for (let attempt = 0; attempt < maxAttempts; attempt++) {
					if (channelFetchIdRef.current !== fetchId) return;
					const result = await apiClient.getRoute(request, controller.signal);
					if (channelFetchIdRef.current !== fetchId) return;

					if (result.success) {
						if (isTradingDebugLoggingEnabled()) {
							console.log("[SOR] Route response ←", {
								channel,
								totalCost: result.route.totalCost,
								totalShares: result.route.totalShares,
								legs: result.route.legs.length,
								insufficientLiquidity: result.route.insufficientLiquidity,
								remainder: result.route.remainder,
							});
						}
						applySuccess(result);
						return;
					}

					if (isTradingDebugLoggingEnabled()) {
						console.log("[SOR] Route response ←", {
							channel,
							success: false,
							code: result.code,
							error: (result.error ?? "").slice(0, 200),
						});
					}

					const transient = TRANSIENT_SOR_ROUTE_CODES.includes(result.code);
					if (!transient || attempt === maxAttempts - 1) {
						surfaceFailure({
							code: result.code,
							message: formatSorRouteFailureMessage(result, failureTargetForCopy, side),
							transient,
						});
						return;
					}

					try {
						const backoff = 280 + attempt * 140 + Math.floor(Math.random() * 80);
						await sleep(backoff, controller.signal);
					} catch {
						if (channelFetchIdRef.current !== fetchId) return;
						return;
					}
				}
			} catch (err) {
				if (channelFetchIdRef.current !== fetchId) return;
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
					if (channelFetchIdRef.current !== fetchId) return;
					await sleep(320 + Math.floor(Math.random() * 80), controller.signal);
					if (channelFetchIdRef.current !== fetchId) return;
					const retryResult = await apiClient.getRoute(request, controller.signal);
					if (channelFetchIdRef.current !== fetchId) return;
					if (retryResult.success) {
						applySuccess(retryResult);
						return;
					}
					surfaceFailure({
						code: retryResult.code,
						message: formatSorRouteFailureMessage(retryResult, failureTargetForCopy, side),
						transient: TRANSIENT_SOR_ROUTE_CODES.includes(retryResult.code),
					});
					return;
				} catch (e2) {
					if (channelFetchIdRef.current !== fetchId) return;
					if (e2 instanceof DOMException && e2.name === "AbortError") return;
					message = e2 instanceof Error ? e2.message : "Failed to compute route after retry";
				}
				surfaceFailure({ code: null, message, transient: true });
			} finally {
				clearTimeout(timeoutId);
				if (channelFetchIdRef.current === fetchId) {
					setLoading(false);
					channelLoadingRef.current = false;
				}
			}
		},
		[
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
			buildRequest,
		],
	);

	const doFetchChannelRef = useRef(doFetchChannel);
	doFetchChannelRef.current = doFetchChannel;

	/** Per-tick fan-out per the channel rules table. */
	const fireChannels = useCallback(() => {
		if (!canFetch) return;
		const isLimit = orderType === "limit";
		if (isLimit) {
			void doFetchChannelRef.current("execution");
			return;
		}
		void doFetchChannelRef.current("display");
		if (targetVenue) {
			void doFetchChannelRef.current("execution");
		}
	}, [canFetch, orderType, targetVenue]);

	const fireChannelsRef = useRef(fireChannels);
	fireChannelsRef.current = fireChannels;

	const blankAll = useCallback(() => {
		displayAbortRef.current?.abort();
		executionAbortRef.current?.abort();
		setDisplayRoute(null);
		setExecutionRoute(null);
		setVenuePreviews(null);
		setDisplayLoading(false);
		setExecutionLoading(false);
		setDisplayStale(false);
		setExecutionStale(false);
		setDisplayError(null);
		setExecutionError(null);
		setDisplayErrorCode(null);
		setExecutionErrorCode(null);
		displayLoadingRef.current = false;
		executionLoadingRef.current = false;
		displayLastGoodRouteRef.current = null;
		executionLastGoodRouteRef.current = null;
		displayFailureStreakStartRef.current = null;
		executionFailureStreakStartRef.current = null;
	}, []);

	const blankExecutionOnly = useCallback(() => {
		executionAbortRef.current?.abort();
		setExecutionRoute(null);
		setExecutionLoading(false);
		setExecutionError(null);
		setExecutionErrorCode(null);
		executionLoadingRef.current = false;
		executionLastGoodRouteRef.current = null;
		executionFailureStreakStartRef.current = null;
	}, []);

	useEffect(() => {
		if (!suspendBackgroundRefetch) return;
		displayAbortRef.current?.abort();
		executionAbortRef.current?.abort();
	}, [suspendBackgroundRefetch]);

	useEffect(() => {
		if (!canFetch) {
			blankAll();
			return;
		}

		if (debounceRef.current) clearTimeout(debounceRef.current);

		const questionIdChanged = prevQuestionIdRef.current !== questionId;
		const outcomeChanged = prevOutcomeRef.current !== outcome;
		const sideChanged = prevSideRef.current !== side;
		const orderTypeChanged = prevOrderTypeRef.current !== orderType;
		const targetVenueChanged = prevTargetVenueRef.current !== targetVenue;

		prevQuestionIdRef.current = questionId;
		prevOutcomeRef.current = outcome;
		prevSideRef.current = side;
		prevOrderTypeRef.current = orderType;
		prevTargetVenueRef.current = targetVenue;

		/* Hard reset = brand-new market or a semantic shift big enough that the
		 * old smart-routing rows would render the wrong shape (buy ↔ sell flips
		 * "To Win" ↔ "Receive"; market ↔ limit collapses the omnibus surface).
		 * For those we blank everything so consumers don't render mismatched
		 * data for a frame.
		 *
		 * Outcome flip (Team A ↔ Team B) is intentionally NOT a hard reset.
		 * The venue lineup is the same, the rows already use stable keys
		 * (`buy-${venue}` / `sell-${venue}`), and every value is wrapped in
		 * `FlashingValue` — so leaving the previous omnibus + per-venue
		 * previews on screen lets React reconcile in place and the numbers
		 * flash-update when the fresh fetch lands, instead of the whole grid
		 * unmounting and re-mounting (the "pop-out / pop-in" jank). Execution
		 * data still clears so Submit can never fire on the stale identity. */
		const hardReset = questionIdChanged || sideChanged || orderTypeChanged;
		const outcomeOnlyFlip = outcomeChanged && !hardReset;

		if (hardReset) {
			blankAll();
		} else if (outcomeOnlyFlip) {
			// Try to seed display from the module cache for the new outcome —
			// if the user has toggled this market before, that's an instant,
			// correct swap with no stale frame. Otherwise leave the previous
			// rows on screen and let `FlashingValue` animate the fresh fetch
			// in-place. Either way, execution must clear so a click-through
			// before the fresh fetch lands cannot sign the prior outcome.
			const newDisplayCacheKey = buildSorRouteCacheKey({
				questionId,
				outcome,
				side,
				amount,
				targetVenue: undefined,
				orderType: orderType ?? "market",
				limitPriceCents,
			});
			const cached = readSorRouteCache(newDisplayCacheKey);
			if (cached) {
				setDisplayRoute(cached.route);
				setVenuePreviews(cached.venuePreviews ?? null);
				displayLastGoodRouteRef.current = cached.route;
				displayFailureStreakStartRef.current = null;
			}
			blankExecutionOnly();
		} else if (targetVenueChanged) {
			// Tab switch: re-target execution only; leave display untouched.
			blankExecutionOnly();
		}

		if (suspendBackgroundRefetch) {
			return () => {
				if (debounceRef.current) clearTimeout(debounceRef.current);
			};
		}

		setDisplayStale(true);
		setExecutionStale(true);

		// Identity / tab-switch fires immediately; amount + balance changes debounce.
		const fireImmediately =
			hardReset || outcomeOnlyFlip || targetVenueChanged;
		if (fireImmediately) {
			fireChannelsRef.current();
		} else {
			debounceRef.current = setTimeout(() => {
				fireChannelsRef.current();
			}, DEBOUNCE_MS);
		}

		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
		};
	}, [
		canFetch,
		suspendBackgroundRefetch,
		questionId,
		outcome,
		side,
		targetVenue,
		orderType,
		limitPriceCents,
		amount,
		walletBalancesKey,
		venuePositionsKey,
		polyFeeRate,
		predictFunFeeRateBps,
		limitlessMakerBaseUsdc,
		limitlessFeeRateBps,
		blankAll,
		blankExecutionOnly,
	]);

	/**
	 * Background-aware auto-refresh — one shared 3 s tick fans out to both channels.
	 *
	 * - Pauses while `document.hidden`; immediate refetch on visibility/focus return.
	 * - Each channel guards itself via its own `loadingRef` so a slow tick never piles up.
	 * - Single-venue tab issues 2 POSTs per tick (display + execution); "all" issues 1; limits issue 1.
	 *
	 * Deps key on the boolean "has any route yet" instead of the route objects themselves so
	 * the interval is set up once and doesn't get torn down + restarted on every successful tick.
	 */
	const hasAnyRoute = displayRoute != null || executionRoute != null;
	useEffect(() => {
		if (!canFetch) return;
		if (!hasAnyRoute) return;
		if (suspendBackgroundRefetch) {
			if (refreshRef.current) {
				clearInterval(refreshRef.current);
				refreshRef.current = null;
			}
			return;
		}

		const clearPolling = () => {
			if (refreshRef.current) {
				clearInterval(refreshRef.current);
				refreshRef.current = null;
			}
		};

		const tick = () => {
			if (document.hidden) return;
			const isLimit = orderType === "limit";
			if (isLimit) {
				if (!executionLoadingRef.current) void doFetchChannelRef.current("execution");
				return;
			}
			if (!displayLoadingRef.current) void doFetchChannelRef.current("display");
			if (targetVenue && !executionLoadingRef.current) {
				void doFetchChannelRef.current("execution");
			}
		};

		const startPolling = () => {
			clearPolling();
			refreshRef.current = setInterval(tick, AUTO_REFRESH_MS) as unknown as ReturnType<
				typeof setTimeout
			>;
		};

		const resumeNow = () => {
			setDisplayStale(true);
			setExecutionStale(true);
			tick();
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
	}, [canFetch, hasAnyRoute, orderType, targetVenue, suspendBackgroundRefetch]);

	useEffect(() => {
		return () => {
			displayAbortRef.current?.abort();
			executionAbortRef.current?.abort();
			if (debounceRef.current) clearTimeout(debounceRef.current);
			if (refreshRef.current) clearInterval(refreshRef.current);
		};
	}, []);

	const refresh = useCallback(() => {
		if (suspendBackgroundRefetch) return;
		setDisplayStale(true);
		setExecutionStale(true);
		fireChannelsRef.current();
	}, [suspendBackgroundRefetch]);

	return {
		displayRoute,
		executionRoute,
		venuePreviews,
		displayLoading,
		displayStale,
		executionLoading,
		executionStale,
		displayError,
		displayErrorCode,
		executionError,
		executionErrorCode,
		refresh,
	};
}
