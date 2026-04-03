import React, { createContext, useContext, useMemo } from "react";
import { getPredictionWebSocketUrl } from "@/config/predictionApiBase";
import { useVenuePriceWebSocket } from "@/hooks/useVenuePriceWebSocket";
import type { VenuePriceSnapshot } from "@/types/venue-prices";

export type VenuePriceContextValue = {
	enabled: boolean;
	connected: boolean;
	prices: Map<string, VenuePriceSnapshot[]>;
	lastWsError: string | null;
	subscribe: (pandaMatchId: string) => void;
	unsubscribe: (pandaMatchId: string) => void;
};

const VenuePriceCtx = createContext<VenuePriceContextValue | null>(null);

export function VenuePriceProvider({ children }: { children: React.ReactNode }) {
	const wsUrl = useMemo(() => {
		const base = getPredictionWebSocketUrl();
		if (!base) return null;
		return `${base}/ws/venue-prices`;
	}, []);

	const { connected, prices, lastWsError, enabled, subscribe, unsubscribe } =
		useVenuePriceWebSocket(wsUrl);

	const value = useMemo(
		(): VenuePriceContextValue => ({
			enabled,
			connected,
			prices,
			lastWsError,
			subscribe,
			unsubscribe,
		}),
		[enabled, connected, prices, lastWsError, subscribe, unsubscribe],
	);

	return (
		<VenuePriceCtx.Provider value={value}>
			{children}
		</VenuePriceCtx.Provider>
	);
}

export function useVenuePrices(): VenuePriceContextValue {
	const ctx = useContext(VenuePriceCtx);
	if (!ctx) {
		throw new Error("useVenuePrices must be used within VenuePriceProvider");
	}
	return ctx;
}
