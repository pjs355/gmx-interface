import {
	useEffect,
	useLayoutEffect,
	useState,
	useCallback,
	useMemo,
	useRef,
} from "react";
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
 * interchangeable). Venue / orderType are tab choices that still apply, so
 * they are preserved across side flips.
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
	calculatedContracts: number | null;
	remainingUsd: number | null;
};

type FullTradeState = CoreTradeState & {
	amount: string;
	tradingVenue: TradingVenue;
	orderType: "market" | "limit";
};

type StateUpdater = FullTradeState | ((prev: FullTradeState) => FullTradeState);

export function useTradeState(
	initialPosition?: "yes" | "no",
	initialVenue?: TradingVenue,
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
	 * Resolve the starting venue + orderType once on mount:
	 *  - If sticky has a value (user picked one earlier in this session), use it.
	 *  - Otherwise fall back to the per-umbrella defaults the parent computed
	 *    (`initialVenue`, "market").
	 *
	 * Subsequent changes flow through `handleTradingVenueChange` /
	 * `handleOrderTypeChange`, which write back into sticky.
	 */
	const [coreState, setCoreState] = useState<CoreTradeState>({
		selectedPosition: initialPosition || "yes",
		price: "",
		side: "buy",
		isLoading: false,
		orderResult: null,
		calculatedContracts: null,
		remainingUsd: null,
	});

	const stickyVenue = shouldBypassSticky ? null : sticky.tradingVenue;
	const stickyOrderType = shouldBypassSticky ? null : sticky.orderType;
	const stickyAmount = shouldBypassSticky ? "" : sticky.amount;

	/** Effective values that downstream consumers see. Reads sticky every
	 *  render so live updates by sibling components propagate. */
	const tradingVenue: TradingVenue =
		stickyVenue ?? ((initialVenue || "levelup") as TradingVenue);
	const orderType: "market" | "limit" = stickyOrderType ?? "market";

	/** Always matches latest `coreState` so `handleSideChange` can read `side` synchronously
	 *  before scheduling `setCoreState` — avoids relying on the updater mutating an outer
	 *  `didFlip` flag (which can race React batching and skip the sticky clear). */
	const coreStateRef = useRef(coreState);
	coreStateRef.current = coreState;

	const state = useMemo<FullTradeState>(
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
		(updater: StateUpdater) => {
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
			const prevFull: FullTradeState =
				typeof updater === "function"
					? {
							...coreStateRef.current,
							amount: stickyAmount,
							tradingVenue,
							orderType,
						}
					: ({} as FullTradeState);
			const next =
				typeof updater === "function" ? updater(prevFull) : updater;
			if (next.amount !== stickyAmount) sticky.setAmount(next.amount);
			if (next.tradingVenue !== tradingVenue) {
				sticky.setTradingVenue(next.tradingVenue);
			}
			if (next.orderType !== orderType) {
				sticky.setOrderType(next.orderType);
			}
			const {
				amount: _omitAmount,
				tradingVenue: _omitVenue,
				orderType: _omitOrder,
				...nextCore
			} = next;
			setCoreState(nextCore);
		},
		[sticky, stickyAmount, tradingVenue, orderType],
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
			// Switching to "all" forces market orderType (limit isn't valid on all-venues
			// omnibus). Mirror the pre-sticky behaviour by writing the implied order type
			// into sticky so other observers stay consistent.
			if (nextVenue === "all") {
				sticky.setOrderType("market");
			}
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
