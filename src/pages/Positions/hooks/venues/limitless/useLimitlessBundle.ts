import { useMemo } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { useAccountData } from "@/context/AccountDataContext";
import {
	useLimitlessOpenOrders,
	useLimitlessTradeHistory,
} from "@/trading/limitless/useLimitlessPortfolioVenue";
import { splitLimitlessVenuePositions } from "@/trading/limitless/splitLimitlessVenuePositions";
import type { VenueOrder, VenuePosition } from "@/types/trading/venuePosition";
import { accountPositionsQueryShim } from "../accountPositionsQueryShim";

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
	const { positions } = useAccountData();
	const limitlessPortfolioEnabled =
		Boolean(authenticated) && Boolean(limitlessMakerBase?.trim());

	const limitless = positions.limitless;
	const all = limitless.rows;

	const positionsQuery = useMemo(
		() =>
			accountPositionsQueryShim(limitless, all, limitlessPortfolioEnabled),
		[limitless, all, limitlessPortfolioEnabled],
	);

	const openOrdersQuery = useLimitlessOpenOrders(limitlessPortfolioEnabled);
	const tradeHistoryQuery = useLimitlessTradeHistory(limitlessPortfolioEnabled);

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
