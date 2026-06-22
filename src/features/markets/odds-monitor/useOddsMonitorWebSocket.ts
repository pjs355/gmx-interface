import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useLocation } from "react-router-dom";
import type { OddsMonitorAppState } from "@/types/odds-monitor";
import { useMatchedMarketsQuery } from "@/features/markets/queries/matchedMarketsQuery";
import {
	getVenuePricesClient,
	subscribeVenuePricesClient,
	getVenuePricesClientSnapshot,
} from "@/services/venuePricesClient";
import {
	routeNeedsFullMatchedMarketsCatalog,
	routeNeedsOddsMonitor,
} from "@/context/oddsMonitorRoutes";

export interface UseOddsMonitorWebSocketResult {
	connected: boolean;
	appState: OddsMonitorAppState | null;
	lastWsError: string | null;
	enabled: boolean;
	sendGetState: () => void;
}

/**
 * Reads live venue BBO from the shared venuePricesClient and merges
 * GET /matched-markets metadata on trading routes (/ , umbrella, positions).
 * /all-odds uses a separate paginated feed and does not load the full catalog here.
 */
export function useOddsMonitorWebSocket(
	_wsUrl: string | null,
	activePandaMatchIds: string[] = [],
): UseOddsMonitorWebSocketResult {
	const { pathname } = useLocation();
	const client = getVenuePricesClient();
	const needsFullCatalog = routeNeedsFullMatchedMarketsCatalog(pathname);
	const { data: matchedItems, refetch } = useMatchedMarketsQuery(needsFullCatalog);

	const clientSnapshot = useSyncExternalStore(
		subscribeVenuePricesClient,
		getVenuePricesClientSnapshot,
		getVenuePricesClientSnapshot,
	);

	const activePandaMatchIdsRef = useRef(activePandaMatchIds);
	activePandaMatchIdsRef.current = activePandaMatchIds;

	const pandaSubsKey = useMemo(
		() =>
			[...activePandaMatchIds]
				.map((id) => String(id).trim())
				.filter(Boolean)
				.sort()
				.join("\0"),
		[activePandaMatchIds],
	);

	useEffect(() => {
		if (!needsFullCatalog || !matchedItems?.length) return;
		client.replaceMarketsFromMetadata(matchedItems, activePandaMatchIdsRef.current);
	}, [client, matchedItems, needsFullCatalog, pandaSubsKey]);

	useEffect(() => {
		if (!clientSnapshot.connected || !routeNeedsOddsMonitor(pathname)) return;
		client.ensureStubMarkets(activePandaMatchIdsRef.current);
		client.mergePendingForIds(activePandaMatchIdsRef.current);
	}, [client, clientSnapshot.connected, pathname, pandaSubsKey]);

	const sendGetState = useCallback(() => {
		if (needsFullCatalog) void refetch();
	}, [needsFullCatalog, refetch]);

	return {
		connected: clientSnapshot.connected,
		appState: clientSnapshot.appState,
		lastWsError: clientSnapshot.lastWsError,
		enabled: routeNeedsOddsMonitor(pathname),
		sendGetState,
	};
}
