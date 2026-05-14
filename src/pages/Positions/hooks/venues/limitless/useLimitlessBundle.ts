import { useEffect, useMemo } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import type { AccountPositionsSlice } from "@/context/AccountDataContext";
import {
	useLimitlessOpenOrders,
	useLimitlessTradeHistory,
} from "@/trading/limitless/useLimitlessPortfolioVenue";
import { splitLimitlessVenuePositions } from "@/trading/limitless/splitLimitlessVenuePositions";
import { debugLimitlessPortfolio } from "@/trading/limitless/limitlessPortfolioDebug";
import type { VenueOrder, VenuePosition } from "@/types/trading/venuePosition";
import { accountPositionsQueryShim } from "../accountPositionsQueryShim";

export type UseLimitlessBundleArgs = {
	authenticated: boolean;
	limitlessMakerBase: string | undefined | null;
	/** Limitless venue slice from `useAccountData()` — passed in so this module never calls `useAccountData` (avoids duplicate `AccountDataContext` module under Vite chunking). */
	limitless: AccountPositionsSlice;
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
	limitless,
}: UseLimitlessBundleArgs): UseLimitlessBundleResult {
	const limitlessPortfolioEnabled =
		Boolean(authenticated) && Boolean(limitlessMakerBase?.trim());
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

	useEffect(() => {
		debugLimitlessPortfolio("useLimitlessBundle snapshot", {
			limitlessPortfolioEnabled,
			limitlessMakerBasePresent: Boolean(limitlessMakerBase?.trim()),
			limitlessMakerBasePrefix: limitlessMakerBase?.trim()
				? `${limitlessMakerBase.trim().slice(0, 6)}…${limitlessMakerBase.trim().slice(-4)}`
				: null,
			rowsTotal: all.length,
			activeCount: active.length,
			winningsCount: winnings.length,
			historySplitCount: history.length,
			accountSliceStatus: limitless.status,
			accountSliceIsFetched: limitless.isFetched,
		});
	}, [
		limitlessPortfolioEnabled,
		limitlessMakerBase,
		all.length,
		active.length,
		winnings.length,
		history.length,
		limitless.status,
		limitless.isFetched,
	]);

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
