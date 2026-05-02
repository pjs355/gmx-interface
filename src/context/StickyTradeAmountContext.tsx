import React, {
	createContext,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";
import type { TradingVenue } from "@/config/venueConfig";

/**
 * Session-scoped sticky trade-box state.
 *
 * Originally just held the typed dollar `amount` so it survived market /
 * umbrella switches inside the same trade box. With the home dock + umbrella
 * page wired together we also need the *trading venue tab* and *order type*
 * to survive across the home → umbrella navigation: when the user types a
 * SOR amount and a venue choice on the home dock, then clicks into the
 * umbrella detail, the freshly-mounted trade box on the detail page reads
 * the same amount + venue + order type from this context, recomputes the
 * SOR route with identical inputs, and the quote that appears matches the
 * one the user just saw — no visible "reload" of the trade box.
 *
 * Survives:
 *  - market switches within an umbrella (no remount, but the read keeps state consistent),
 *  - umbrella switches (remount via `key`; sticky context restores state),
 *  - home → umbrella navigation (different React subtree, same provider),
 *  - the brief loading window when an orderbook is in-flight.
 *
 * Side toggles (buy <-> sell) clear the sticky amount because the units differ
 * (USD on buy, shares on sell), and carrying the wrong denomination would be
 * misleading. Venue and order type are NOT cleared on side flip — they are
 * tab choices that still apply.
 *
 * In-memory only — does not persist across page reloads.
 */
type StickyTradeAmountContextValue = {
	amount: string;
	setAmount: (next: string) => void;
	tradingVenue: TradingVenue | null;
	setTradingVenue: (next: TradingVenue | null) => void;
	orderType: "market" | "limit" | null;
	setOrderType: (next: "market" | "limit" | null) => void;
};

const StickyTradeAmountContext =
	createContext<StickyTradeAmountContextValue | null>(null);

export function StickyTradeAmountProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const [amount, setAmountState] = useState("");
	const [tradingVenue, setTradingVenueState] = useState<TradingVenue | null>(
		null,
	);
	const [orderType, setOrderTypeState] = useState<"market" | "limit" | null>(
		null,
	);

	const setAmount = useCallback((next: string) => {
		setAmountState((prev) => (prev === next ? prev : next));
	}, []);

	const setTradingVenue = useCallback((next: TradingVenue | null) => {
		setTradingVenueState((prev) => (prev === next ? prev : next));
	}, []);

	const setOrderType = useCallback((next: "market" | "limit" | null) => {
		setOrderTypeState((prev) => (prev === next ? prev : next));
	}, []);

	const value = useMemo<StickyTradeAmountContextValue>(
		() => ({
			amount,
			setAmount,
			tradingVenue,
			setTradingVenue,
			orderType,
			setOrderType,
		}),
		[
			amount,
			setAmount,
			tradingVenue,
			setTradingVenue,
			orderType,
			setOrderType,
		],
	);

	return (
		<StickyTradeAmountContext.Provider value={value}>
			{children}
		</StickyTradeAmountContext.Provider>
	);
}

/**
 * Returns the sticky trade state + setters. Falls back to a no-op shape when no
 * provider is mounted (so isolated test pages / storybooks don't crash).
 */
export function useStickyTradeAmount(): StickyTradeAmountContextValue {
	const v = useContext(StickyTradeAmountContext);
	if (v) return v;
	return {
		amount: "",
		setAmount: () => {},
		tradingVenue: null,
		setTradingVenue: () => {},
		orderType: null,
		setOrderType: () => {},
	};
}
