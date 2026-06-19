import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { OddsMonitorAppState } from "@/types/odds-monitor";
import { useMatchedMarketsQuery } from "@/features/markets/queries/matchedMarketsQuery";
import {
	getVenuePricesClient,
	subscribeVenuePricesClient,
	getVenuePricesClientSnapshot,
} from "@/services/venuePricesClient";

export interface UseOddsMonitorWebSocketResult {
	connected: boolean;
	appState: OddsMonitorAppState | null;
	lastWsError: string | null;
	enabled: boolean;
	sendGetState: () => void;
}

/**
 * Reads live venue BBO from the shared venuePricesClient and merges
 * GET /matched-markets metadata via TanStack Query.
 */
export function useOddsMonitorWebSocket(
	_wsUrl: string | null,
	activePandaMatchIds: string[] = [],
): UseOddsMonitorWebSocketResult {
	const client = getVenuePricesClient();
	const { data: matchedItems, refetch } = useMatchedMarketsQuery(true);

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
		if (!matchedItems?.length) return;
		client.replaceMarketsFromMetadata(matchedItems, activePandaMatchIdsRef.current);
	}, [client, matchedItems, pandaSubsKey]);

	useEffect(() => {
		if (!clientSnapshot.connected) return;
		client.ensureStubMarkets(activePandaMatchIdsRef.current);
		client.mergePendingForIds(activePandaMatchIdsRef.current);
	}, [client, clientSnapshot.connected, pandaSubsKey]);

	const sendGetState = useCallback(() => {
		void refetch();
	}, [refetch]);

	return {
		connected: clientSnapshot.connected,
		appState: clientSnapshot.appState,
		lastWsError: clientSnapshot.lastWsError,
		enabled: true,
		sendGetState,
	};
}
