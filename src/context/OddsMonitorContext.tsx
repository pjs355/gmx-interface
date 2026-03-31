import React, { createContext, useContext, useMemo } from "react";
import { getOddsWebSocketUrl } from "@/config/oddsMonitorBase";
import { useOddsMonitorWebSocket } from "@/hooks/useOddsMonitorWebSocket";
import type { OddsMonitorAppState } from "@/types/odds-monitor";

export type OddsMonitorContextValue = {
	enabled: boolean;
	connected: boolean;
	appState: OddsMonitorAppState | null;
	lastWsError: string | null;
	wsUrl: string | null;
	sendGetState: () => void;
};

const OddsMonitorContext = createContext<OddsMonitorContextValue | null>(null);

export function OddsMonitorProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const wsUrl = useMemo(() => getOddsWebSocketUrl(), []);
	const { connected, appState, lastWsError, enabled, sendGetState } =
		useOddsMonitorWebSocket(wsUrl);

	const value = useMemo(
		(): OddsMonitorContextValue => ({
			enabled,
			connected,
			appState,
			lastWsError,
			wsUrl,
			sendGetState,
		}),
		[enabled, connected, appState, lastWsError, wsUrl, sendGetState]
	);

	return (
		<OddsMonitorContext.Provider value={value}>
			{children}
		</OddsMonitorContext.Provider>
	);
}

export function useOddsMonitor(): OddsMonitorContextValue {
	const ctx = useContext(OddsMonitorContext);
	if (!ctx) {
		throw new Error("useOddsMonitor must be used within OddsMonitorProvider");
	}
	return ctx;
}
