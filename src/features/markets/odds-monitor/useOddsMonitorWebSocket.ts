import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useLocation } from "react-router-dom";
import type { OddsMonitorAppState } from "@/types/odds-monitor";
import {
	useMatchedMarketsQuery,
	fetchMatchedMarketByPandaIdRaw,
} from "@/features/markets/queries/matchedMarketsQuery";
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
 * Reads live venue BBO from the shared venuePricesClient. Full matched-markets
 * catalog is fetched only on /positions; umbrella trade pages use per-id fetch.
 */
export function useOddsMonitorWebSocket(
	_wsUrl: string | null,
	activePandaMatchIds: string[] = [],
): UseOddsMonitorWebSocketResult {
	const { pathname } = useLocation();
	const client = getVenuePricesClient();
	const needsFullCatalog = routeNeedsFullMatchedMarketsCatalog(pathname);
	const isUmbrellaTrade = pathname.startsWith("/predictions/umbrella/");
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
		if (!isUmbrellaTrade || activePandaMatchIds.length === 0) return;
		let cancelled = false;
		void (async () => {
			const items = await Promise.all(
				activePandaMatchIds.map((id) => fetchMatchedMarketByPandaIdRaw(id)),
			);
			if (cancelled) return;
			const rows = items.filter((row): row is NonNullable<typeof row> => row !== null);
			if (rows.length) client.mergeMarketsFromMetadataBatch(rows);
		})();
		return () => {
			cancelled = true;
		};
	}, [client, isUmbrellaTrade, pandaSubsKey, activePandaMatchIds]);

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
