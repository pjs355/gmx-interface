import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

/** Max distinct PandaScore match IDs on one venue-prices connection (home + trading). */
export const MAX_VENUE_PANDA_SUBSCRIPTIONS = 52;

type VenuePandaSubscriptionContextValue = {
	subscribePandaMatchId: (pandaMatchId: string) => void;
	unsubscribePandaMatchId: (pandaMatchId: string) => void;
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
		if (debounceRef.current) clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => {
			debounceRef.current = null;
			flushActive();
		}, 150);
	}, [flushActive]);

	const subscribePandaMatchId = useCallback(
		(pandaMatchId: string) => {
			const id = String(pandaMatchId ?? "").trim();
			if (!id) return;
			const n = (countsRef.current.get(id) ?? 0) + 1;
			countsRef.current.set(id, n);
			scheduleFlush();
		},
		[scheduleFlush],
	);

	const unsubscribePandaMatchId = useCallback(
		(pandaMatchId: string) => {
			const id = String(pandaMatchId ?? "").trim();
			if (!id) return;
			const n = (countsRef.current.get(id) ?? 0) - 1;
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
