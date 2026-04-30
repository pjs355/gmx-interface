import { useMemo } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import {
	useLimitlessOpenOrders,
	useLimitlessTradeHistory,
	useLimitlessVenuePositions,
} from "@/trading/limitless/useLimitlessPortfolioVenue";
import { splitLimitlessVenuePositions } from "@/trading/limitless/splitLimitlessVenuePositions";
import type {
	VenueOrder,
	VenuePosition,
} from "@/types/trading/venuePosition";

export type UseLimitlessBundleArgs = {
	authenticated: boolean;
	limitlessMakerBase: string | undefined | null;
};

export type UseLimitlessBundleResult = {
	all: VenuePosition[];
	active: VenuePosition[];
	winnings: VenuePosition[];
	history: VenuePosition[];
	positionsQuery: UseQueryResult<VenuePosition[], unknown>;
	openOrdersQuery: UseQueryResult<VenueOrder[], unknown>;
	tradeHistoryQuery: UseQueryResult<VenuePosition[], unknown>;
	limitlessPortfolioEnabled: boolean;
};

export function useLimitlessBundle({
	authenticated,
	limitlessMakerBase,
}: UseLimitlessBundleArgs): UseLimitlessBundleResult {
	const limitlessPortfolioEnabled =
		Boolean(authenticated) && Boolean(limitlessMakerBase?.trim());

	const positionsQuery = useLimitlessVenuePositions(limitlessPortfolioEnabled);
	const openOrdersQuery = useLimitlessOpenOrders(limitlessPortfolioEnabled);
	const tradeHistoryQuery = useLimitlessTradeHistory(limitlessPortfolioEnabled);

	const all = positionsQuery.data ?? [];

	const { active, winnings, history } = useMemo(() => {
		const split = splitLimitlessVenuePositions(all);
		return {
			active: split.active,
			winnings: split.winnings,
			history: split.history,
		};
	}, [all]);

	return {
		all,
		active,
		winnings,
		history,
		positionsQuery,
		openOrdersQuery,
		tradeHistoryQuery,
		limitlessPortfolioEnabled,
	};
}
