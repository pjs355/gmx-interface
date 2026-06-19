import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
	getDefaultVenuePricesWsUrl,
	getVenuePricesClient,
	type VenuePricesSubscriptionMode,
} from "@/services/venuePricesClient";
import { useVenuePandaSubscription } from "@/context/VenuePandaSubscriptionContext";
import { routeNeedsOddsMonitor } from "@/context/oddsMonitorRoutes";
import { matchedMarketsQueryOptions } from "@/features/markets/queries/matchedMarketsQuery";

/** Keeps the venue-prices WebSocket alive and switches subscription mode by route. */
export function VenuePricesConnectionManager() {
	const { pathname } = useLocation();
	const { activePandaMatchIds } = useVenuePandaSubscription();
	const client = getVenuePricesClient();
	const queryClient = useQueryClient();

	useEffect(() => {
		void queryClient.prefetchQuery(matchedMarketsQueryOptions);
	}, [queryClient]);

	useEffect(() => {
		client.start(getDefaultVenuePricesWsUrl());
	}, [client]);

	useEffect(() => {
		let mode: VenuePricesSubscriptionMode;
		if (pathname === "/all-odds") {
			mode = { type: "all_bbo" };
		} else if (routeNeedsOddsMonitor(pathname)) {
			mode = { type: "selective", pandaMatchIds: activePandaMatchIds };
		} else {
			mode = { type: "selective", pandaMatchIds: [] };
		}
		client.setSubscription(mode);
	}, [client, pathname, activePandaMatchIds]);

	return null;
}
