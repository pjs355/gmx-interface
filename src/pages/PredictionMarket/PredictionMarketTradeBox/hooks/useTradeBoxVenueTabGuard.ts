import { useEffect, useMemo } from "react";
import { getVenueConfig } from "@/config/venueConfig";
import type { TradingVenue } from "../types";
import type { TradeBoxShareBalancesSnapshot } from "./useTradeBoxShareBalances";
import { sellBreakdownIsOnlyWholeContractVenues } from "../checkBalances";

export function useTradeBoxVenueTabGuard(opts: {
	pandascoreMatchId?: string;
	matchedVenues?: Set<string>;
	tradingVenue: TradingVenue;
	tradeInteractionLocked: boolean;
	onTradingVenueChange: (venue: TradingVenue) => void;
}) {
	const venueDropdownOptions = useMemo(() => {
		const all: { value: string; label: string }[] = [
			{ value: "levelup", label: "LevelUp" },
			{ value: "polymarket", label: "Polymarket" },
			{ value: "predictfun", label: "Predict" },
			{ value: "limitless", label: "Limitless" },
			{ value: "dflow", label: "Kalshi" },
		];
		const venues = opts.matchedVenues
			? all.filter((v) => opts.matchedVenues!.has(v.value))
			: all;
		if (opts.pandascoreMatchId && venues.length > 1) {
			venues.unshift({ value: "all", label: "All Markets" });
		}
		return [{ label: "Venue", options: venues }];
	}, [opts.pandascoreMatchId, opts.matchedVenues]);

	useEffect(() => {
		if (opts.tradeInteractionLocked) return;
		const allowedOpts = venueDropdownOptions[0]?.options;
		if (!allowedOpts?.length) return;
		const allowed = allowedOpts.map((o) => o.value);
		if (!allowed.includes(opts.tradingVenue)) {
			opts.onTradingVenueChange(allowed[0] as TradingVenue);
		}
	}, [
		opts.tradeInteractionLocked,
		venueDropdownOptions,
		opts.tradingVenue,
		opts.onTradingVenueChange,
	]);
}

export function useTradeBoxSellInputRules(opts: {
	tradingVenue: TradingVenue;
	side: "buy" | "sell";
	matchedVenues?: Set<string>;
	shareBalances: TradeBoxShareBalancesSnapshot;
}) {
	const venueConfig = getVenueConfig(opts.tradingVenue);
	const matchedVenuesNeedWholeShareContracts =
		opts.tradingVenue === "all" &&
		opts.matchedVenues != null &&
		(opts.matchedVenues.has("levelup") || opts.matchedVenues.has("dflow")) &&
		sellBreakdownIsOnlyWholeContractVenues(opts.shareBalances.sellVenueBreakdown);

	const shareAmountRequiresWholeContracts =
		(venueConfig.requiresWholeShares || matchedVenuesNeedWholeShareContracts) &&
		opts.side === "sell";

	const amountInputShowsDollarPrefix = opts.side === "buy";

	return {
		shareAmountRequiresWholeContracts,
		amountInputShowsDollarPrefix,
	};
}
