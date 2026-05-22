import {
	useCallback,
	useEffect,
	useRef,
	type MutableRefObject,
} from "react";
import type { TradingVenue } from "../../types";
import type { TradeBoxHookSetState, TradeBoxHookState } from "../useTradeState";
import type { VenuePositionEntry } from "@/trading/sor";
import type { useTradeBoxShareBalances } from "../useTradeBoxShareBalances";

export type UseTradeBoxVenueSelectionArgs = {
	state: TradeBoxHookState;
	setState: TradeBoxHookSetState;
	sorExecutionBusy: boolean;
	tradeBoxLoading: boolean;
	handleTradingVenueChange: (venue: TradingVenue) => void;
	matchedVenues: Set<string>;
	pandaId: string;
	venueOverride: TradingVenue | undefined;
	multiVenueEnabled: boolean;
	propUmbrellaId: string | undefined;
	account: string | null | undefined;
	tradeBoxShareBalances: ReturnType<typeof useTradeBoxShareBalances>;
	maxScopedSellShares: number;
	sorVenuePositions: VenuePositionEntry[];
	smartRoutingMarketKey: string;
	resetSorExecution: () => void;
};

export type UseTradeBoxVenueSelectionResult = {
	venueSelectionLocked: boolean;
	venueSelectionLockedRef: MutableRefObject<boolean>;
	handleTradingVenueChangeGuarded: (next: TradingVenue) => void;
};

export function useTradeBoxVenueSelection(
	args: UseTradeBoxVenueSelectionArgs,
): UseTradeBoxVenueSelectionResult {
	const {
		state,
		setState,
		sorExecutionBusy,
		tradeBoxLoading,
		handleTradingVenueChange,
		matchedVenues,
		pandaId,
		venueOverride,
		multiVenueEnabled,
		propUmbrellaId,
		account,
		tradeBoxShareBalances,
		maxScopedSellShares,
		sorVenuePositions,
		smartRoutingMarketKey,
		resetSorExecution,
	} = args;

	const venueSelectionLocked = sorExecutionBusy || tradeBoxLoading;
	const venueSelectionLockedRef = useRef(false);
	venueSelectionLockedRef.current = venueSelectionLocked;

	const handleTradingVenueChangeGuarded = useCallback(
		(next: TradingVenue) => {
			if (sorExecutionBusy || tradeBoxLoading) return;
			handleTradingVenueChange(next);
		},
		[sorExecutionBusy, tradeBoxLoading, handleTradingVenueChange],
	);

	useEffect(() => {
		if (venueSelectionLocked) return;
		const v = state.tradingVenue;
		if (v === "all") return;
		if (matchedVenues.has(v)) return;
		handleTradingVenueChangeGuarded(pandaId ? "all" : "levelup");
	}, [
		venueSelectionLocked,
		matchedVenues,
		state.tradingVenue,
		pandaId,
		handleTradingVenueChangeGuarded,
	]);

	useEffect(() => {
		if (venueSelectionLocked) return;
		if (state.side !== "sell" || !propUmbrellaId || !account) return;
		if (tradeBoxShareBalances.loading) return;
		if (!(tradeBoxShareBalances.sellTotalShares > 0)) return;
		if (maxScopedSellShares > 0) return;

		if (multiVenueEnabled) {
			handleTradingVenueChangeGuarded("all");
			return;
		}
		const first = sorVenuePositions[0]?.venue;
		if (first) {
			handleTradingVenueChangeGuarded(first);
		}
	}, [
		venueSelectionLocked,
		state.side,
		propUmbrellaId,
		account,
		tradeBoxShareBalances.loading,
		tradeBoxShareBalances.sellTotalShares,
		maxScopedSellShares,
		multiVenueEnabled,
		sorVenuePositions,
		handleTradingVenueChangeGuarded,
	]);

	const prevSmartRoutingMarketKeyRef = useRef<string | null>(null);
	useEffect(() => {
		const key = smartRoutingMarketKey;
		if (!key) return;
		const prev = prevSmartRoutingMarketKeyRef.current;
		prevSmartRoutingMarketKeyRef.current = key;
		if (prev !== null && prev !== key && state.side === "buy") {
			resetSorExecution();
			setState((s) => ({ ...s, orderResult: null }));
		}
	}, [smartRoutingMarketKey, state.side, resetSorExecution, setState]);

	useEffect(() => {
		if (venueSelectionLocked) return;
		if (pandaId && state.tradingVenue !== "all") {
			handleTradingVenueChangeGuarded("all");
		} else if (!pandaId && state.tradingVenue === "all") {
			handleTradingVenueChangeGuarded("levelup");
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [pandaId]);

	useEffect(() => {
		if (venueSelectionLocked) return;
		if (venueOverride && venueOverride !== state.tradingVenue) {
			handleTradingVenueChangeGuarded(venueOverride);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [venueOverride]);

	return {
		venueSelectionLocked,
		venueSelectionLockedRef,
		handleTradingVenueChangeGuarded,
	};
}
