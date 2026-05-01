import React, { useState } from "react";
import PredictionMarketTradeBox from "./PredictionMarketTradeBox/PredictionMarketTradeBox";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import type { TradingVenue } from "./PredictionMarketTradeBox/types";
import type { SettledInfo } from "./useMatchSettled";
import { getMarketId, hasUsableOrderbookSnapshot } from "./utils";
import type { TradingPagePrices } from "@/hooks/useTradingPagePrices";
import { TradeBoxSkeleton } from "./Skeletons";

export type UmbrellaTradeBoxPanelProps = {
	umbrella: Umbrella;
	questionOrderbooks: Record<string, unknown>;
	activeMarket: PredictionMarket | null;
	activePosition: "yes" | "no";
	onPositionChange: (p: "yes" | "no") => void;
	settledInfo?: SettledInfo | null;
	tradingPagePrices: TradingPagePrices;
	venueOverride?: TradingVenue;
	mobilePeekBar?: "default" | "hidden";
};

export function UmbrellaTradeBoxPanel({
	umbrella,
	questionOrderbooks,
	activeMarket,
	activePosition,
	onPositionChange,
	settledInfo,
	tradingPagePrices,
	venueOverride,
	mobilePeekBar = "default",
}: UmbrellaTradeBoxPanelProps) {
	const [, setTradeSide] = useState<"buy" | "sell">("buy");

	const pandascoreMatchId =
		typeof umbrella?.pandascore_matchId === "string"
			? umbrella.pandascore_matchId.trim()
			: "";

	const umbrellaLimitless = umbrella?.exchangeMatching?.limitless;

	if (settledInfo) {
		return (
			<div className="prediction-market-tradebox match-settled-banner">
				<div className="match-settled-banner__content">
					<div className="match-settled-banner__winner">
						{settledInfo.winnerName} has won!
					</div>
				</div>
			</div>
		);
	}

	if (
		activeMarket &&
		hasUsableOrderbookSnapshot(
			questionOrderbooks[getMarketId(activeMarket)] as any,
		)
	) {
		return (
			<PredictionMarketTradeBox
				market={
					{
						...(activeMarket as any),
						umbrellaChildrenCount: umbrella?.children?.length || 0,
					} as any
				}
				orderbook={questionOrderbooks[getMarketId(activeMarket)] as any}
				pandascoreMatchId={pandascoreMatchId || undefined}
				umbrellaId={umbrella._id}
				limitlessMappingFromUmbrella={umbrellaLimitless}
				umbrellaDisplayName={umbrella.displayName}
				initialPosition={activePosition}
				onPositionChange={onPositionChange}
				onSideChange={setTradeSide}
				venueOverride={venueOverride}
				crossBuyYes={tradingPagePrices.bestYesPrice}
				crossBuyNo={tradingPagePrices.bestNoPrice}
				venueRowsForSellStrip={
					pandascoreMatchId ? tradingPagePrices.venueRows : undefined
				}
				mobilePeekBar={mobilePeekBar}
			/>
		);
	}

	return <TradeBoxSkeleton />;
}
