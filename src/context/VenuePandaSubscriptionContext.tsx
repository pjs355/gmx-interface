import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

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
		// No cap: subscribe to every match the UI currently references (ref-counted on
		// mount/unmount). The server maintains all books; the per-client subscribe set
		// follows what the UI has on screen. Later optimization: scope to actually
		// rendered (virtualized) rows so we only open WS for what's truly visible.
		setActivePandaMatchIds([...countsRef.current.keys()]);
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
