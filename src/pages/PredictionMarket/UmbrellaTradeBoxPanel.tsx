import React, { useState } from "react";
import { useMedia } from "react-use";
import PredictionMarketTradeBox from "./PredictionMarketTradeBox/PredictionMarketTradeBox";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import type { TradingVenue } from "./PredictionMarketTradeBox/types";
import type { SettledInfo } from "./useMatchSettled";
import { getMarketId } from "./utils";
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
	/* Match desktop market grid (`predictions-page__home-trade-grid` @ 1101px). */
	const wideTradeDock = useMedia("(min-width: 1101px)");

	/* Shell is only for states that do not mount `PredictionMarketTradeBox`
	 * (that component’s responsive container already wraps desktop with the shell). */
	const desktopTradeDockShell = (child: React.ReactNode) =>
		wideTradeDock ? (
			<div
				className="prediction-trade-column-shell"
				data-qa="prediction-tradebox"
			>
				<div className="prediction-trade-column-underlay" aria-hidden />
				<div className="prediction-trade-column-body">{child}</div>
			</div>
		) : (
			child
		);

	const pandascoreMatchId =
		typeof umbrella?.pandascore_matchId === "string"
			? umbrella.pandascore_matchId.trim()
			: "";

	const umbrellaLimitless = umbrella?.exchangeMatching?.limitless;

	if (settledInfo) {
		return desktopTradeDockShell(
			<div className="prediction-market-tradebox match-settled-banner">
				<div className="match-settled-banner__content">
					<div className="match-settled-banner__winner">
						{settledInfo.winnerName} has won!
					</div>
				</div>
			</div>
		);
	}

	// Only show the skeleton when we don't have a market at all yet (first paint, no
	// umbrella picked). Once an `activeMarket` exists, render the trade box even if its
	// orderbook hasn't arrived — the trade box already handles a null/empty book
	// gracefully (the Submit button shows "Fetching price…" and inputs stay editable).
	// This prevents the "skeleton flash" the user sees when clicking between markets,
	// and the typed amount survives via `StickyTradeAmountContext`.
	if (!activeMarket) {
		return desktopTradeDockShell(<TradeBoxSkeleton />);
	}

	const orderbook = questionOrderbooks[getMarketId(activeMarket)] as any;

	return (
		<PredictionMarketTradeBox
			market={
				{
					...(activeMarket as any),
					umbrellaChildrenCount: umbrella?.children?.length || 0,
				} as any
			}
			orderbook={orderbook ?? null}
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
