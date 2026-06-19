import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

/** Max venue-prices WS ids for one All Odds page (groups × legs). */
export const MAX_ALL_ODDS_VENUE_SUBSCRIPTIONS = 100;

type AllOddsVenueSubscriptionContextValue = {
	pagePandaMatchIds: string[];
	setPagePandaMatchIds: (ids: string[]) => void;
};

const AllOddsVenueSubscriptionContext = createContext<AllOddsVenueSubscriptionContextValue | null>(
	null,
);

export function AllOddsVenueSubscriptionProvider({ children }: { children: React.ReactNode }) {
	const [pagePandaMatchIds, setPagePandaMatchIdsRaw] = useState<string[]>([]);

	const setPagePandaMatchIds = useCallback((ids: string[]) => {
		const unique = [...new Set(ids.map((id) => String(id ?? "").trim()).filter(Boolean))];
		setPagePandaMatchIdsRaw(unique.slice(0, MAX_ALL_ODDS_VENUE_SUBSCRIPTIONS));
	}, []);

	const value = useMemo(
		(): AllOddsVenueSubscriptionContextValue => ({
			pagePandaMatchIds,
			setPagePandaMatchIds,
		}),
		[pagePandaMatchIds, setPagePandaMatchIds],
	);

	return (
		<AllOddsVenueSubscriptionContext.Provider value={value}>
			{children}
		</AllOddsVenueSubscriptionContext.Provider>
	);
}

export function useAllOddsVenueSubscription(): AllOddsVenueSubscriptionContextValue {
	const ctx = useContext(AllOddsVenueSubscriptionContext);
	if (!ctx) {
		throw new Error(
			"useAllOddsVenueSubscription must be used within AllOddsVenueSubscriptionProvider",
		);
	}
	return ctx;
}
