import React, { createContext, useContext, useMemo } from "react";
import { useLocation } from "react-router-dom";
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

const ODDS_MONITOR_ROUTES = ["/predictions/umbrella/", "/positions"];

const OddsMonitorContext = createContext<OddsMonitorContextValue | null>(null);

export function OddsMonitorProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const { pathname } = useLocation();
	const baseWsUrl = useMemo(() => getOddsWebSocketUrl(), []);

	// Only open the WebSocket on routes that actually consume odds data
	const needsOddsData = ODDS_MONITOR_ROUTES.some((route) =>
		pathname.startsWith(route)
	);
	const wsUrl = needsOddsData ? baseWsUrl : null;

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
