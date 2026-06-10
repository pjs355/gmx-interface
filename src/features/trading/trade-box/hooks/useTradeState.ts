/**
 * User-editable trade box state: venue tab, side, amount, loading, order result.
 *
 * Persists sticky fields per `tradeRouteIsolationKey` (mobile market switches).
 * Handlers are stable callbacks for child components and the imperative test ref.
 */
import { useEffect, useLayoutEffect, useState, useCallback, useMemo, useRef } from "react";
import type { TradingVenue } from "@/config/venueConfig";
import { useStickyTradeAmount } from "@/context/StickyTradeAmountContext";

/**
 * Trade-box state hook.
 *
 * `amount`, `tradingVenue`, and `orderType` are intentionally stored in
 * `StickyTradeAmountContext` (not local state) so the user's choices survive
 * across market and umbrella switches AND across the home → umbrella
 * navigation. The freshly-mounted trade box on the umbrella detail page
 * reads these from context, lining up its SOR inputs with what the home
 * dock just had — so the quote the user saw doesn't appear to "reload".
 *
 * Flipping Buy ↔ Sell clears only the sticky amount (USD vs shares are not
 * interchangeable). `orderType` and `tradingVenue` are preserved across side
 * flips — they are tab / smart-routing row choices that still apply.
 *
 * `selectedPosition`, `price`, `side`, `isLoading`, and `orderResult` stay in
 * local state because they are tied to the active market or to one trade
 * lifecycle — we do not want them carried into a different market context.
 *
 * The returned `state` object merges sticky values (`amount`, `tradingVenue`,
 * `orderType`) with local `coreState` so callers see a single shape. The
 * returned `setState` is a wrapper that delegates sticky writes to the
 * context store, leaving the rest in local state.
 */
type CoreTradeState = {
	selectedPosition: "yes" | "no";
	price: string;
	side: "buy" | "sell";
	isLoading: boolean;
	orderResult: any;
};

export type TradeBoxHookState = CoreTradeState & {
	amount: string;
	tradingVenue: TradingVenue;
	orderType: "market" | "limit";
};

export type TradeBoxHookSetState = (
	updater: TradeBoxHookState | ((prev: TradeBoxHookState) => TradeBoxHookState),
) => void;

export function useTradeState(
	initialPosition?: "yes" | "no",
	_initialVenue?: TradingVenue,
	tradeRouteIsolationKey?: string,
) {
	const sticky = useStickyTradeAmount();

	/** Last route key we committed sticky session for — drives one-frame bypass + reset on change. */
	const lastCommittedRouteKeyRef = useRef<string | undefined>(undefined);

	const shouldBypassSticky =
		tradeRouteIsolationKey !== undefined &&
		tradeRouteIsolationKey !== lastCommittedRouteKeyRef.current;

	useLayoutEffect(() => {
		if (tradeRouteIsolationKey === undefined) {
			lastCommittedRouteKeyRef.current = undefined;
			return;
		}
		if (lastCommittedRouteKeyRef.current === tradeRouteIsolationKey) return;
		lastCommittedRouteKeyRef.current = tradeRouteIsolationKey;
		sticky.setAmount("");
		sticky.setTradingVenue(null);
		sticky.setOrderType(null);
	}, [tradeRouteIsolationKey, sticky]);

	/**
	 * Resolve `orderType` / `tradingVenue` from sticky when present; otherwise
	 * fall back to `"market"` and the parent-supplied initial venue (e.g. `"all"`
	 * on multi-venue umbrellas, `"levelup"` on single-venue pages).
	 */
	const [coreState, setCoreState] = useState<CoreTradeState>({
		selectedPosition: initialPosition || "yes",
		price: "",
		side: "buy",
		isLoading: false,
		orderResult: null,
	});

	const stickyOrderType = shouldBypassSticky ? null : sticky.orderType;
	const stickyAmount = shouldBypassSticky ? "" : sticky.amount;
	const stickyTradingVenue = shouldBypassSticky ? null : sticky.tradingVenue;

	const tradingVenue: TradingVenue = stickyTradingVenue ?? _initialVenue ?? "levelup";
	const orderType: "market" | "limit" = stickyOrderType ?? "market";

	/** Always matches latest `coreState` so `handleSideChange` can read `side` synchronously
	 *  before scheduling `setCoreState` — avoids relying on the updater mutating an outer
	 *  `didFlip` flag (which can race React batching and skip the sticky clear). */
	const coreStateRef = useRef(coreState);
	coreStateRef.current = coreState;

	const state = useMemo<TradeBoxHookState>(
		() => ({
			...coreState,
			amount: stickyAmount,
			tradingVenue,
			orderType,
		}),
		[coreState, stickyAmount, tradingVenue, orderType],
	);

	useEffect(() => {
		if (initialPosition && initialPosition !== coreState.selectedPosition) {
			setCoreState((prev) => ({ ...prev, selectedPosition: initialPosition }));
		}
	}, [initialPosition, coreState.selectedPosition]);

	const setState = useCallback(
		(updater: TradeBoxHookState | ((prev: TradeBoxHookState) => TradeBoxHookState)) => {
			// Compute `next` synchronously and run sticky writes at the call site
			// (event handler / effect), NEVER inside the `setCoreState` updater.
			//
			// React re-runs queued updater functions during the next render, so any
			// side effect placed inside `setCoreState((prev) => ...)` (e.g. calling
			// `sticky.setAmount`) fires *during render* and trips the
			// "Cannot update a component while rendering a different component"
			// warning. `coreStateRef.current` mirrors the latest committed
			// `coreState`, which is the right `prev` for callers invoked outside
			// of render (all current callers are timers / effects / event handlers).
			const prevFull: TradeBoxHookState =
				typeof updater === "function"
					? {
							...coreStateRef.current,
							amount: stickyAmount,
							tradingVenue,
							orderType,
						}
					: ({} as TradeBoxHookState);
			const next = typeof updater === "function" ? updater(prevFull) : updater;
			if (next.amount !== stickyAmount) sticky.setAmount(next.amount);
			if (next.tradingVenue !== tradingVenue) {
				sticky.setTradingVenue(next.tradingVenue);
			}
			if (next.orderType !== orderType) {
				sticky.setOrderType(next.orderType);
			}
			if (typeof updater === "function") {
				// Re-run the (pure) updater inside React's functional form so the core
				// update is applied against the *latest queued* core state. Materializing
				// `next` from `coreStateRef.current` (last committed state) and passing it
				// as an object would clobber sibling updates queued in the same commit —
				// e.g. the prop-sync effect setting `selectedPosition` while a market-key
				// change effect clears `orderResult` (spread cell click: market + position
				// change together; the stale snapshot reverted the position).
				setCoreState((prevCore) => {
					const recomputed = updater({
						...prevCore,
						amount: stickyAmount,
						tradingVenue,
						orderType,
					});
					const {
						amount: _a,
						tradingVenue: _v,
						orderType: _o,
						...recomputedCore
					} = recomputed;
					return recomputedCore;
				});
			} else {
				const {
					amount: _omitAmount,
					tradingVenue: _omitVenue,
					orderType: _omitOrder,
					...nextCore
				} = next;
				setCoreState(nextCore);
			}
		},
		[sticky, stickyAmount, orderType, tradingVenue],
	);

	const handlePositionChange = useCallback((position: "yes" | "no") => {
		setCoreState((prev) => ({ ...prev, selectedPosition: position }));
	}, []);

	const handleAmountChange = useCallback(
		(amount: string) => {
			sticky.setAmount(amount);
		},
		[sticky],
	);

	const handlePriceChange = useCallback((price: string) => {
		setCoreState((prev) => ({ ...prev, price }));
	}, []);

	const handleOrderTypeChange = useCallback(
		(nextOrderType: "market" | "limit") => {
			sticky.setOrderType(nextOrderType);
		},
		[sticky],
	);

	const handleSideChange = useCallback(
		(side: "buy" | "sell") => {
			// Buy amount is USD (or limit semantics); sell market amount is shares. Do not
			// share one sticky string across sides — clear before `setCoreState` so it never
			// races the updater (see `coreStateRef` above). Sticky still preserves amount
			// across market switches on the same side. Venue / orderType are deliberately
			// NOT cleared — they are tab choices that still apply across side flips.
			if (coreStateRef.current.side !== side) {
				sticky.setAmount("");
			}
			setCoreState((prev) => {
				if (prev.side === side) return prev;
				return { ...prev, side };
			});
		},
		[sticky],
	);

	const handleTradingVenueChange = useCallback(
		(nextVenue: TradingVenue) => {
			sticky.setTradingVenue(nextVenue);
		},
		[sticky],
	);

	return {
		state,
		setState,
		handlePositionChange,
		handleAmountChange,
		handlePriceChange,
		handleOrderTypeChange,
		handleSideChange,
		handleTradingVenueChange,
	} as const;
}
