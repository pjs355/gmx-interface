import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import {
	getDefaultVenuePricesWsUrl,
	getVenuePricesClient,
	type VenuePricesSubscriptionMode,
} from "@/services/venuePricesClient";
import { useVenuePandaSubscription } from "@/context/VenuePandaSubscriptionContext";
import { useAllOddsVenueSubscription } from "@/context/AllOddsVenueSubscriptionContext";
import { routeNeedsOddsMonitor } from "@/context/oddsMonitorRoutes";

/** Keeps the venue-prices WebSocket alive and switches subscription mode by route. */
export function VenuePricesConnectionManager() {
	const { pathname } = useLocation();
	const { activePandaMatchIds } = useVenuePandaSubscription();
	const { pagePandaMatchIds } = useAllOddsVenueSubscription();
	const client = getVenuePricesClient();

	useEffect(() => {
		client.start(getDefaultVenuePricesWsUrl());
	}, [client]);

	useEffect(() => {
		let mode: VenuePricesSubscriptionMode;
		if (pathname === "/all-odds") {
			mode = { type: "selective", pandaMatchIds: pagePandaMatchIds, bboOnly: true };
		} else if (routeNeedsOddsMonitor(pathname)) {
			mode = { type: "selective", pandaMatchIds: activePandaMatchIds };
		} else {
			mode = { type: "selective", pandaMatchIds: [] };
		}
		client.setSubscription(mode);
	}, [client, pathname, activePandaMatchIds, pagePandaMatchIds]);

	return null;
}
