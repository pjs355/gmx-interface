import React, { createContext, useContext, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { getOddsWebSocketUrl } from "@/config/oddsMonitorBase";
import { useOddsMonitorWebSocket } from "@/hooks/useOddsMonitorWebSocket";
import { findOddsMatchedMarket } from "@/utils/findOddsMatchedMarket";
import type { MatchedMarket, OddsMonitorAppState } from "@/types/odds-monitor";
import {
	VenuePandaSubscriptionProvider,
	useVenuePandaSubscription,
} from "@/context/VenuePandaSubscriptionContext";
import { routeNeedsOddsMonitor } from "@/context/oddsMonitorRoutes";

export type OddsMonitorContextValue = {
	enabled: boolean;
	connected: boolean;
	appState: OddsMonitorAppState | null;
	lastWsError: string | null;
	wsUrl: string | null;
	sendGetState: () => void;
};

const OddsMonitorContext = createContext<OddsMonitorContextValue | null>(null);

function OddsMonitorInner({
	children,
	wsUrl,
}: {
	children: React.ReactNode;
	wsUrl: string | null;
}) {
	const { activePandaMatchIds } = useVenuePandaSubscription();
	const { connected, appState, lastWsError, enabled, sendGetState } =
		useOddsMonitorWebSocket(wsUrl, activePandaMatchIds);

	const value = useMemo(
		(): OddsMonitorContextValue => ({
			enabled,
			connected,
			appState,
			lastWsError,
			wsUrl,
			sendGetState,
		}),
		[enabled, connected, appState, lastWsError, wsUrl, sendGetState],
	);

	return (
		<OddsMonitorContext.Provider value={value}>
			{children}
		</OddsMonitorContext.Provider>
	);
}

export function OddsMonitorProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const { pathname } = useLocation();
	const baseWsUrl = useMemo(() => getOddsWebSocketUrl(), []);
	const wsUrl = routeNeedsOddsMonitor(pathname) ? baseWsUrl : null;

	return (
		<VenuePandaSubscriptionProvider>
			<OddsMonitorInner wsUrl={wsUrl}>{children}</OddsMonitorInner>
		</VenuePandaSubscriptionProvider>
	);
}

export function useOddsMonitor(): OddsMonitorContextValue {
	const ctx = useContext(OddsMonitorContext);
	if (!ctx) {
		throw new Error("useOddsMonitor must be used within OddsMonitorProvider");
	}
	return ctx;
}

/** Live venue BBO rows for one PandaScore match from the shared odds monitor store. */
export function useMatchVenuePrices(
	pandaMatchId: string | null | undefined,
	umbrellaId?: string | null,
): MatchedMarket | null {
	const { appState } = useOddsMonitor();
	return useMemo(() => {
		return findOddsMatchedMarket(appState?.markets, pandaMatchId, umbrellaId);
	}, [appState?.markets, appState?.timestamp, pandaMatchId, umbrellaId]);
}
