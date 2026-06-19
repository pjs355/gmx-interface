import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

/**
 * Max distinct PandaScore match IDs on one venue-prices connection (home + trading).
 * Not a backend/venue limit — the venue-prices WS relays from a shared, fully
 * subscribed server-side feed and even supports `subscribe_all`. This is a
 * client-side ceiling that bounds browser memory and per-tick re-render churn.
 */
export const MAX_VENUE_PANDA_SUBSCRIPTIONS = 50;

/**
 * Subscription weights decide who wins a slot when more than MAX ids are
 * requested (flush keeps the highest-weight ids). On-screen cards must always
 * be priced, so they outrank the anticipatory leading-window prefetch.
 */
export const VENUE_SUB_WEIGHT_VIEWPORT = 2;
export const VENUE_SUB_WEIGHT_PREFETCH = 1;

type VenuePandaSubscriptionContextValue = {
	subscribePandaMatchId: (pandaMatchId: string, weight?: number) => void;
	unsubscribePandaMatchId: (pandaMatchId: string, weight?: number) => void;
	activePandaMatchIds: string[];
};

const VenuePandaSubscriptionContext = createContext<VenuePandaSubscriptionContextValue | null>(
	null,
);

export function VenuePandaSubscriptionProvider({ children }: { children: React.ReactNode }) {
	const countsRef = useRef<Map<string, number>>(new Map());
	const [activePandaMatchIds, setActivePandaMatchIds] = useState<string[]>([]);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const flushActive = useCallback(() => {
		const entries = [...countsRef.current.entries()].sort((a, b) => {
			if (b[1] !== a[1]) return b[1] - a[1];
			return a[0].localeCompare(b[0]);
		});
		setActivePandaMatchIds(entries.slice(0, MAX_VENUE_PANDA_SUBSCRIPTIONS).map(([id]) => id));
	}, []);

	const scheduleFlush = useCallback(() => {
		// Short debounce: long enough to coalesce the synchronous batch of
		// subscribe() calls a tab switch fires (and brief scroll bursts), short
		// enough that prices start arriving almost immediately on tab click.
		if (debounceRef.current) clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => {
			debounceRef.current = null;
			flushActive();
		}, 50);
	}, [flushActive]);

	const subscribePandaMatchId = useCallback(
		(pandaMatchId: string, weight = 1) => {
			const id = String(pandaMatchId ?? "").trim();
			if (!id || weight <= 0) return;
			const n = (countsRef.current.get(id) ?? 0) + weight;
			countsRef.current.set(id, n);
			scheduleFlush();
		},
		[scheduleFlush],
	);

	const unsubscribePandaMatchId = useCallback(
		(pandaMatchId: string, weight = 1) => {
			const id = String(pandaMatchId ?? "").trim();
			if (!id || weight <= 0) return;
			const n = (countsRef.current.get(id) ?? 0) - weight;
			if (n <= 0) countsRef.current.delete(id);
			else countsRef.current.set(id, n);
			scheduleFlush();
		},
		[scheduleFlush],
	);

	const value = useMemo(
		(): VenuePandaSubscriptionContextValue => ({
			subscribePandaMatchId,
			unsubscribePandaMatchId,
			activePandaMatchIds,
		}),
		[subscribePandaMatchId, unsubscribePandaMatchId, activePandaMatchIds],
	);

	return (
		<VenuePandaSubscriptionContext.Provider value={value}>
			{children}
		</VenuePandaSubscriptionContext.Provider>
	);
}

export function useVenuePandaSubscription(): VenuePandaSubscriptionContextValue {
	const ctx = useContext(VenuePandaSubscriptionContext);
	if (!ctx) {
		throw new Error("useVenuePandaSubscription must be used within VenuePandaSubscriptionProvider");
	}
	return ctx;
}
