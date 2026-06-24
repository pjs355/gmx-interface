/**
 * Effective orderbook + market-order handler for the selected venue/outcome.
 *
 * Chooses REST vs OddsMonitor WS books per tab (LevelUp, Predict complement,
 * Poly, Limitless, DFlow). Exposes dual LevelUp/Predict hint books for YES/NO
 * button pricing and `calculateContractsForMarketOrderUi` for the amount input.
 *
 * Used by: quote preview, UI outcome prices (via effective book prop), SOR funding.
 */
import { useCallback, useMemo } from "react";
import { getVenueConfig } from "@/config/venueConfig";
import { useMarketOrderHandler } from "@/features/trading/orderbook-walk/useMarketOrderHandler";
import {
	levelUpMonitorBookForPosition,
	polyOrderbookForPosition,
} from "@/features/trading/venues/polymarket/trade/polyOutcomeTokenId";
import { dflowKalshiOrderbookForPosition } from "@/features/trading/venues/dflow/catalog/monitorDflowBooks";
import { monitorBookToOrderbookSnapshot } from "@/features/trading/venues/polymarket/trade/monitorOrderbookAdapter";
import { predictBookToOrderbookSnapshot } from "@/features/trading/venues/predict/book/predictBookToOrderbookSnapshot";
import {
	complementPredictOrderbook,
	predictBookNeedsComplementForPosition,
} from "@/features/trading/venues/predict/book/predictSingleMarketBook";
import { predictOrderbookForPosition } from "@/features/trading/venues/predict/trade/predictOutcome";
import { limitlessOrderbookForPosition } from "@/features/trading/venues/limitless/trade/limitlessOrderbook";
import type { usePredictOrderbook } from "@/features/trading/venues/predict/book/usePredictOrderbook";
import type { UseTradeBoxVenueWiringParams } from "./types";

export function useTradeBoxEffectiveOrderbook(
	params: UseTradeBoxVenueWiringParams & {
		predictVenueActive: boolean;
		isPredictSingleMarket: boolean;
		predictOrderbookQuery: ReturnType<typeof usePredictOrderbook>;
	},
) {
	const {
		state,
		matchedMonitor,
		yesTeamLabel,
		noTeamLabel,
		moneylineLeg,
		levelUpOrderbook,
		oddsMonitorEnabled,
		oddsMonitorConnected,
		predictVenueActive,
		isPredictSingleMarket,
		predictOrderbookQuery,
	} = params;

	const predictVenueBookHints = useMemo(() => {
		if (!predictVenueActive || !matchedMonitor) return null;
		return {
			yes: monitorBookToOrderbookSnapshot(
				predictOrderbookForPosition(matchedMonitor, "yes", yesTeamLabel, noTeamLabel),
			),
			no: monitorBookToOrderbookSnapshot(
				predictOrderbookForPosition(matchedMonitor, "no", yesTeamLabel, noTeamLabel),
			),
		};
	}, [predictVenueActive, matchedMonitor, yesTeamLabel, noTeamLabel]);

	const effectiveOrderbook = useMemo(() => {
		if (state.tradingVenue === "all") {
			return levelUpOrderbook;
		}
		if (state.tradingVenue === "levelup") {
			if (oddsMonitorEnabled && oddsMonitorConnected && matchedMonitor) {
				const raw = levelUpMonitorBookForPosition(
					matchedMonitor,
					state.selectedPosition ?? "yes",
					yesTeamLabel,
					noTeamLabel,
				);
				const wsSnap = monitorBookToOrderbookSnapshot(raw);
				if (wsSnap) return wsSnap;
			}
			return levelUpOrderbook;
		}
		if (state.tradingVenue === "predictfun") {
			const pos = state.selectedPosition ?? "yes";
			let restBook = predictOrderbookQuery.data ?? undefined;
			if (
				restBook &&
				isPredictSingleMarket &&
				matchedMonitor &&
				predictBookNeedsComplementForPosition(matchedMonitor, pos, yesTeamLabel, noTeamLabel)
			) {
				restBook = complementPredictOrderbook(restBook);
			}
			const restSnap = predictBookToOrderbookSnapshot(restBook);
			if (restSnap) return restSnap;
			return predictVenueBookHints?.[pos] ?? null;
		}
		if (!matchedMonitor) return null;
		if (state.tradingVenue === "limitless") {
			const lxRaw = limitlessOrderbookForPosition(
				matchedMonitor,
				state.selectedPosition ?? "yes",
				yesTeamLabel,
				noTeamLabel,
			);
			return monitorBookToOrderbookSnapshot(lxRaw);
		}
		if (state.tradingVenue === "dflow") {
			const dflowRaw = dflowKalshiOrderbookForPosition(
				matchedMonitor,
				state.selectedPosition ?? "yes",
				yesTeamLabel,
				noTeamLabel,
				moneylineLeg,
			);
			return monitorBookToOrderbookSnapshot(dflowRaw);
		}
		const polyRaw = polyOrderbookForPosition(
			matchedMonitor,
			state.selectedPosition ?? "yes",
			yesTeamLabel,
			noTeamLabel,
		);
		return monitorBookToOrderbookSnapshot(polyRaw);
	}, [
		state.tradingVenue,
		state.selectedPosition,
		levelUpOrderbook,
		matchedMonitor,
		yesTeamLabel,
		noTeamLabel,
		moneylineLeg,
		predictOrderbookQuery.data,
		isPredictSingleMarket,
		predictVenueBookHints,
		oddsMonitorEnabled,
		oddsMonitorConnected,
	]);

	const levelUpVenueBookHints = useMemo(() => {
		if (state.tradingVenue !== "levelup") return null;
		if (!oddsMonitorEnabled || !oddsMonitorConnected || !matchedMonitor) return null;
		const snapYes = monitorBookToOrderbookSnapshot(
			levelUpMonitorBookForPosition(matchedMonitor, "yes", yesTeamLabel, noTeamLabel),
		);
		const snapNo = monitorBookToOrderbookSnapshot(
			levelUpMonitorBookForPosition(matchedMonitor, "no", yesTeamLabel, noTeamLabel),
		);
		if (!snapYes || !snapNo) return null;
		return { yes: snapYes, no: snapNo };
	}, [
		state.tradingVenue,
		oddsMonitorEnabled,
		oddsMonitorConnected,
		matchedMonitor,
		yesTeamLabel,
		noTeamLabel,
	]);

	const venueConfig = getVenueConfig(state.tradingVenue);
	const marketOrderHandler = useMarketOrderHandler(
		effectiveOrderbook,
		venueConfig.requiresWholeShares,
	);

	const orderbookWalkPosition =
		state.tradingVenue === "levelup" || isPredictSingleMarket
			? (state.selectedPosition ?? "yes")
			: "yes";

	const calculateContractsForMarketOrderUi = useCallback(
		(usdAmount: number, position: "yes" | "no", side: "buy" | "sell") => {
			const passPosition = state.tradingVenue === "levelup" || isPredictSingleMarket;
			return marketOrderHandler.calculateContractsForMarketOrder(
				usdAmount,
				passPosition ? position : "yes",
				side,
			);
		},
		[marketOrderHandler, state.tradingVenue, isPredictSingleMarket],
	);

	return {
		predictVenueBookHints,
		effectiveOrderbook,
		levelUpVenueBookHints,
		venueConfig,
		marketOrderHandler,
		orderbookWalkPosition,
		calculateContractsForMarketOrderUi,
	};
}
