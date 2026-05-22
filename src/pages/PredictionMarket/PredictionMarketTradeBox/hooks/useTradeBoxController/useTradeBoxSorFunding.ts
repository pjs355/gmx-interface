import { useMemo } from "react";
import { buildChainBalances, type ChainBalance, type SorVenue, type VenuePositionEntry } from "@/trading/sor";
import { isVacmReady } from "@/context/accountWallets";
import type { AccountDataVacmSlice } from "@/context/accountWallets";
import type { useCollateralTokens } from "context/CollateralTokenContext";
import type { TradeBoxHookState } from "../useTradeState";
import type { useTradeBoxShareBalances } from "../useTradeBoxShareBalances";
import { SOR_VENUE_POSITION_KEYS } from "./sorVenuePositionKeys";

export type UseTradeBoxSorFundingArgs = {
	venueAddressChainMap: AccountDataVacmSlice["venueAddressChainMap"];
	walletGate: AccountDataVacmSlice["walletGate"];
	collateralTokens: ReturnType<typeof useCollateralTokens>;
	limitlessMakerCashForSor: number | undefined;
	state: Pick<TradeBoxHookState, "selectedPosition" | "tradingVenue">;
	tradeBoxShareBalances: ReturnType<typeof useTradeBoxShareBalances>;
};

export type UseTradeBoxSorFundingResult = {
	sorWalletBalances: ChainBalance[];
	sorVenuePositions: VenuePositionEntry[];
	sorVenuePositionsForActiveTab: VenuePositionEntry[];
	maxScopedSellShares: number;
	totalAvailableCash: number;
};

/**
 * SOR wallet rows + per-venue sell positions from share balances.
 * Single source for `useTradeBoxQuotesLayer` and execution/button gates.
 */
export function useTradeBoxSorFunding(
	args: UseTradeBoxSorFundingArgs,
): UseTradeBoxSorFundingResult {
	const {
		venueAddressChainMap,
		walletGate,
		collateralTokens,
		limitlessMakerCashForSor,
		state,
		tradeBoxShareBalances,
	} = args;

	const sorWalletBalances: ChainBalance[] = useMemo(() => {
		if (
			!isVacmReady({ venueAddressChainMap, walletGate }) ||
			venueAddressChainMap == null
		) {
			return [];
		}
		const v = venueAddressChainMap;
		return buildChainBalances({
			baseUsdcBalance: collateralTokens.baseUsdc,
			baseWalletAddress: v.levelup.walletAddress,
			limitlessMakerUsdcBalance: Math.max(0, limitlessMakerCashForSor ?? 0),
			limitlessMakerWalletAddress: v.limitless.walletAddress,
			polygonUsdcBalance: collateralTokens.polygonStable,
			polygonWalletAddress: v.polymarket.walletAddress,
			solanaUsdcBalance: collateralTokens.solanaUsdc,
			solanaWalletAddress: v.dflow.walletAddress,
			bnbUsdtBalance: collateralTokens.bscUsdt,
			bnbWalletAddress: v.predictfun.walletAddress,
			/** SOR API expects per-chain rows when addresses exist, not only chains with positive balance. */
			includeZeroBalanceChainsWithAddress: true,
		});
	}, [
		venueAddressChainMap,
		walletGate,
		collateralTokens.baseUsdc,
		collateralTokens.polygonStable,
		collateralTokens.solanaUsdc,
		collateralTokens.bscUsdt,
		limitlessMakerCashForSor,
	]);

	const sorVenuePositions: VenuePositionEntry[] = useMemo(() => {
		if (!state.selectedPosition) return [];
		const byOutcome = tradeBoxShareBalances.allMarketsOutcomeVenueShares;
		const sideMap =
			state.selectedPosition === "yes" ? byOutcome.yes : byOutcome.no;

		const entries: VenuePositionEntry[] = [];
		for (const venue of SOR_VENUE_POSITION_KEYS) {
			const sh = sideMap[venue];
			if (typeof sh === "number" && Number.isFinite(sh) && sh > 0) {
				entries.push({ venue, shares: sh });
			}
		}
		return entries;
	}, [
		state.selectedPosition,
		tradeBoxShareBalances.allMarketsOutcomeVenueShares,
	]);

	const sorVenuePositionsForActiveTab = useMemo(() => {
		if (state.tradingVenue === "all") return sorVenuePositions;
		return sorVenuePositions.filter((e) => e.venue === state.tradingVenue);
	}, [sorVenuePositions, state.tradingVenue]);

	const maxScopedSellShares = useMemo(
		() =>
			sorVenuePositionsForActiveTab.reduce(
				(sum, p) => sum + (p.shares > 0 ? p.shares : 0),
				0,
			),
		[sorVenuePositionsForActiveTab],
	);

	const totalAvailableCash = useMemo(
		() => sorWalletBalances.reduce((sum, b) => sum + b.balance, 0),
		[sorWalletBalances],
	);

	return {
		sorWalletBalances,
		sorVenuePositions,
		sorVenuePositionsForActiveTab,
		maxScopedSellShares,
		totalAvailableCash,
	};
}
